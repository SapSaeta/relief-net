import "server-only";

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

// Video preparation with a bundled ffmpeg: audio for ASR, key frames for SAM.

const MAX_FRAMES = 8;
const SECONDS_PER_FRAME = 2;
const FRAME_WIDTH = 960;

function ffmpeg(args: string[]): Promise<string> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not available");
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath as string, ["-hide_banner", "-y", ...args]);
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-300)}`)),
    );
  });
}

export async function probeDurationSec(video: string): Promise<number> {
  const stderr = await ffmpeg(["-i", video, "-f", "null", "-"]);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr);
  if (!m) throw new Error("Could not read video duration");
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** MP4 (H.264/AAC) with faststart, the format both the Files API and SAM prefer. */
export async function normalizeVideo(input: string, output: string): Promise<void> {
  await ffmpeg([
    "-i", input,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
    "-c:a", "aac", "-movflags", "+faststart",
    output,
  ]);
}

/** Mono 16-bit PCM WAV at 24 kHz: the only input /asr/transcribe accepts. */
export async function extractAudioWav(video: string, output: string): Promise<void> {
  await ffmpeg(["-i", video, "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-map_metadata", "-1", output]);
}

export type Frame = { index: number; timeSec: number; width: number; height: number; jpeg: Buffer };

/** Pixel size from the JPEG start-of-frame marker. */
function jpegSize(jpeg: Buffer): { width: number; height: number } {
  let i = 2;
  while (i + 9 < jpeg.length) {
    const marker = jpeg[i + 1];
    if (jpeg[i] === 0xff && marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: jpeg.readUInt16BE(i + 5), width: jpeg.readUInt16BE(i + 7) };
    }
    i += 2 + jpeg.readUInt16BE(i + 2);
  }
  throw new Error("Could not read JPEG size");
}

/** Evenly spaced JPEG frames: one every ~2 s, at most 8. */
export async function extractFrames(video: string, durationSec: number, dir: string): Promise<Frame[]> {
  const count = Math.max(1, Math.min(MAX_FRAMES, Math.ceil(durationSec / SECONDS_PER_FRAME)));
  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const timeSec = Math.round(((index + 0.5) * durationSec * 100) / count) / 100;
      const file = join(dir, `frame-${index}.jpg`);
      await ffmpeg(["-ss", String(timeSec), "-i", video, "-frames:v", "1", "-vf", `scale=${FRAME_WIDTH}:-2`, "-q:v", "3", file]);
      const jpeg = await readFile(file);
      return { index, timeSec, ...jpegSize(jpeg), jpeg };
    }),
  );
}
