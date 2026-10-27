import "server-only";

import OpenAI from "openai";

// Meta Model API client. Server-side only: the key never reaches the browser.
// Uses the Responses API on Meta's OpenAI-compatible endpoint.

export const models = {
  text: process.env.MODEL_TEXT ?? "muse-spark-1.3",
  segment: process.env.MODEL_SEGMENT ?? "sam-3.1",
  voice: process.env.MODEL_VOICE ?? "muse-voice-transcribe-1.0",
} as const;

const baseURL = process.env.MODEL_API_BASE_URL ?? "https://api.meta.ai/v1";

function apiKey(): string {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error("MODEL_API_KEY is not set (see .env.example)");
  return key;
}

let client: OpenAI | undefined;

export function meta(): OpenAI {
  client ??= new OpenAI({ apiKey: apiKey(), baseURL });
  return client;
}

const RETRY_DELAYS_MS = [1000, 3000];
const retryable = (status: number) => status === 408 || status === 429 || status >= 500;

/** Raw authenticated call for Meta endpoints the openai SDK does not cover (e.g. /asr/transcribe).
 *  Retries network errors, 408, 429 and 5xx twice with backoff, like the SDK does. The body must be
 *  re-sendable (FormData, string or Blob, not a stream). */
export async function metaFetch(path: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const last = attempt === RETRY_DELAYS_MS.length;
    let res: Response;
    try {
      res = await fetch(`${baseURL}${path}`, { ...init, headers: { Authorization: `Bearer ${apiKey()}`, ...init.headers } });
    } catch (error) {
      if (last) throw error;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      continue;
    }
    if (res.ok) return res;
    if (last || !retryable(res.status)) {
      throw new Error(`Meta API ${path} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
}
