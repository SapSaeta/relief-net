import "server-only";

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toFile } from "openai";

import { saveCase, type IntakeCase } from "@/lib/cases";
import { extractAudioWav, extractFrames, normalizeVideo, probeDurationSec } from "@/lib/media";
import { meta } from "@/lib/meta";
import { draftHelpRequest } from "@/lib/request";
import { groundProposals, proposalJobs, proposeConcepts, type GroundedProposal } from "@/lib/scout";
import { allPairs, DAMAGE_CONCEPTS, groupByFrame, segment } from "@/lib/segment";
import { transcribe } from "@/lib/transcribe";
import { UsageLedger } from "@/lib/usage";

// Intake pipeline: video -> (Files API upload ‖ transcription ‖ SAM fixed concepts on key frames
// ‖ Spark proposes extra damage on the key frames -> SAM grounds it) -> Muse Spark structured
// help request with verified evidence.

const UPLOAD_TTL_SECONDS = 7 * 24 * 3600;

async function timed<T>(timings: Record<string, number>, label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    timings[label] = Date.now() - started;
  }
}

export async function runIntake(video: File, location?: string): Promise<IntakeCase> {
  const id = randomUUID();
  const ledger = new UsageLedger(id);
  const work = await mkdtemp(join(tmpdir(), "relief-net-"));
  const timingsMs: Record<string, number> = {};
  try {
    const raw = join(work, "input");
    await writeFile(raw, Buffer.from(await video.arrayBuffer()));

    const mp4 = join(work, "intake.mp4");
    const wav = join(work, "audio.wav");
    const durationSec = await timed(timingsMs, "prepare", async () => {
      await normalizeVideo(raw, mp4);
      await extractAudioWav(mp4, wav);
      return probeDurationSec(mp4);
    });
    const frames = await extractFrames(mp4, durationSec, work);

    const upload = timed(timingsMs, "upload", async () =>
      meta().files.create({
        purpose: "user_data",
        file: await toFile(await readFile(mp4), "intake.mp4", { type: "video/mp4" }),
        expires_after: { anchor: "created_at", seconds: UPLOAD_TTL_SECONDS },
      }),
    );
    // Optional: a failed scout only means no extra concepts.
    const scouted = timed(timingsMs, "scout", async () => {
      try {
        const proposals = await proposeConcepts({ frames }, ledger);
        const results = await segment(proposalJobs(frames, proposals), ledger);
        return { results, proposals: groundProposals(proposals, results) };
      } catch (error) {
        console.error("scout failed", error);
        return { results: [], proposals: [] as GroundedProposal[] };
      }
    });

    const [file, transcript, fixed, scout] = await Promise.all([
      upload,
      timed(timingsMs, "transcribe", async () => transcribe(await readFile(wav), ledger)),
      timed(timingsMs, "segment", () => segment(allPairs(frames, DAMAGE_CONCEPTS), ledger)),
      scouted,
    ]);
    const segmented = groupByFrame(frames, [...fixed, ...scout.results]);

    // A failed draft must not lose the evidence already paid for: keep the case and the error.
    let request: IntakeCase["request"] = null;
    let requestError: string | undefined;
    try {
      request = await timed(timingsMs, "request", () =>
        draftHelpRequest({ fileId: file.id, transcript, frames: segmented }, ledger),
      );
    } catch (error) {
      console.error("help request failed", error);
      requestError = "drafting failed; it can be retried";
    }

    const intake: IntakeCase = {
      id,
      createdAt: new Date().toISOString(),
      source: "video",
      location,
      fileId: file.id,
      durationSec,
      transcript,
      frames: segmented.map((f) => ({
        ...f,
        image: `data:image/jpeg;base64,${frames[f.index].jpeg.toString("base64")}`,
      })),
      proposals: scout.proposals,
      request,
      requestError,
      timingsMs,
      usage: ledger.entries,
      costUsd: ledger.totalUsd,
    };
    await saveCase(intake);
    return intake;
  } finally {
    await ledger.flush();
    await rm(work, { recursive: true, force: true });
  }
}

/** Requests that arrive as a typed message (phone line, SMS, form): same drafting and checks, no media. */
export async function runMessageIntake(input: { message: string; location?: string; receivedAt?: string }): Promise<IntakeCase> {
  const id = randomUUID();
  const ledger = new UsageLedger(id);
  const timingsMs: Record<string, number> = {};
  const transcript = { text: input.message, durationMs: 0, turns: [] };
  try {
    let request: IntakeCase["request"] = null;
    let requestError: string | undefined;
    try {
      request = await timed(timingsMs, "request", () => draftHelpRequest({ transcript, frames: [] }, ledger));
    } catch (error) {
      console.error("help request failed", error);
      requestError = "drafting failed; it can be retried";
    }
    const intake: IntakeCase = {
      id,
      createdAt: input.receivedAt ?? new Date().toISOString(),
      source: "message",
      location: input.location,
      fileId: "",
      durationSec: 0,
      transcript,
      frames: [],
      request,
      requestError,
      timingsMs,
      usage: ledger.entries,
      costUsd: ledger.totalUsd,
    };
    await saveCase(intake);
    return intake;
  } finally {
    await ledger.flush();
  }
}
