import "server-only";

import { metaFetch, models } from "@/lib/meta";

// Muse Voice Transcribe, file endpoint. Turn-level timestamps (no word-level ones exist).

export type Turn = { turnId: number; startMs: number; endMs: number; transcript: string };
export type Transcript = { text: string; durationMs: number; turns: Turn[] };

export async function transcribe(wav: Buffer): Promise<Transcript> {
  const form = new FormData();
  form.append(
    "request",
    new Blob(
      [JSON.stringify({ model: models.voice, audioEncoding: "WAV", mode: "ENDPOINTING", languageBias: ["English", "Spanish"] })],
      { type: "application/json" },
    ),
  );
  form.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "audio.wav");

  const res = await metaFetch("/asr/transcribe", { method: "POST", headers: { Accept: "application/json" }, body: form });
  const json = (await res.json()) as { transcript: string; audioDurationMs: number; turns: Turn[] };
  return { text: json.transcript, durationMs: json.audioDurationMs, turns: json.turns };
}
