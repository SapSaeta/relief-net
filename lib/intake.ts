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
import { DAMAGE_CONCEPTS, segmentFrames } from "@/lib/segment";
import { transcribe } from "@/lib/transcribe";
import { UsageLedger } from "@/lib/usage";

// Intake pipeline: video -> (Files API upload ‖ transcription ‖ SAM on key frames)
// -> Muse Spark structured help request with verified evidence.

const UPLOAD_TTL_SECONDS = 7 * 24 * 3600;

async function timed<T>(timings: Record<string, number>, label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    timings[label] = Date.now() - started;
  }
}

export async function runIntake(video: File): Promise<IntakeCase> {
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

    const [file, transcript, segmented] = await Promise.all([
      timed(timingsMs, "upload", async () =>
        meta().files.create({
          purpose: "user_data",
          file: await toFile(await readFile(mp4), "intake.mp4", { type: "video/mp4" }),
          expires_after: { anchor: "created_at", seconds: UPLOAD_TTL_SECONDS },
        }),
      ),
      timed(timingsMs, "transcribe", async () => transcribe(await readFile(wav), ledger)),
      timed(timingsMs, "segment", () => segmentFrames(frames, DAMAGE_CONCEPTS, ledger)),
    ]);

    // A failed draft must not lose the evidence already paid for: keep the case and the error.
    let request: IntakeCase["request"] = null;
    let requestError: string | undefined;
    try {
      request = await timed(timingsMs, "request", () =>
        draftHelpRequest({ fileId: file.id, transcript, frames: segmented }, ledger),
      );
    } catch (error) {
      requestError = error instanceof Error ? error.message : "Help request failed";
    }

    const intake: IntakeCase = {
      id,
      createdAt: new Date().toISOString(),
      fileId: file.id,
      durationSec,
      transcript,
      frames: segmented.map((f) => ({
        ...f,
        image: `data:image/jpeg;base64,${frames[f.index].jpeg.toString("base64")}`,
      })),
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
