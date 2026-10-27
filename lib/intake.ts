import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toFile } from "openai";

import { extractAudioWav, extractFrames, normalizeVideo, probeDurationSec } from "@/lib/media";
import { meta } from "@/lib/meta";
import { segmentFrames, type SegmentedFrame } from "@/lib/segment";
import { transcribe, type Transcript } from "@/lib/transcribe";

// Intake pipeline: video -> (Files API upload ‖ transcription ‖ SAM on key frames).
// Cases are stored as JSON under .data/cases (git-ignored, local only for now).

const UPLOAD_TTL_SECONDS = 7 * 24 * 3600;
const CASES_DIR = join(process.cwd(), ".data", "cases");

export type IntakeCase = {
  id: string;
  createdAt: string;
  fileId: string;
  durationSec: number;
  transcript: Transcript;
  frames: (SegmentedFrame & { image: string })[];
  timingsMs: Record<string, number>;
};

async function timed<T>(timings: Record<string, number>, label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    timings[label] = Date.now() - started;
  }
}

export async function runIntake(video: File): Promise<IntakeCase> {
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
      timed(timingsMs, "transcribe", async () => transcribe(await readFile(wav))),
      timed(timingsMs, "segment", () => segmentFrames(frames)),
    ]);

    const intake: IntakeCase = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      fileId: file.id,
      durationSec,
      transcript,
      frames: segmented.map((f) => ({
        ...f,
        image: `data:image/jpeg;base64,${frames[f.index].jpeg.toString("base64")}`,
      })),
      timingsMs,
    };

    await mkdir(CASES_DIR, { recursive: true });
    await writeFile(join(CASES_DIR, `${intake.id}.json`), JSON.stringify(intake));
    return intake;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
