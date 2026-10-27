import "server-only";

import { metaFetch, models } from "@/lib/meta";
import { UNIT_PRICES } from "@/lib/pricing";
import type { UsageLedger } from "@/lib/usage";

// Muse Voice Transcribe, file endpoint. Turn-level timestamps (no word-level ones exist).

export type Turn = { turnId: number; startMs: number; endMs: number; transcript: string };
export type Transcript = { text: string; durationMs: number; turns: Turn[] };

export async function transcribe(wav: Buffer, ledger: UsageLedger): Promise<Transcript> {
  const started = Date.now();
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
  ledger.add({
    provider: "meta",
    model: models.voice,
    operation: "transcribe",
    latencyMs: Date.now() - started,
    units: { audioSec: json.audioDurationMs / 1000 },
    costUsd: (json.audioDurationMs / 3_600_000) * UNIT_PRICES.voicePerHour,
  });
  return { text: json.transcript, durationMs: json.audioDurationMs, turns: json.turns };
}
