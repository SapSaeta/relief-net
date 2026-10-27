import "server-only";

import OpenAI from "openai";

// Meta Model API client. Server-side only: the key never reaches the browser.
// Uses the Responses API on Meta's OpenAI-compatible endpoint.

export const models = {
  text: process.env.MODEL_TEXT ?? "muse-spark-1.3",
  segment: process.env.MODEL_SEGMENT ?? "sam-3.1",
  voice: process.env.MODEL_VOICE ?? "muse-voice-transcribe-1.0",
} as const;

let client: OpenAI | undefined;

export function meta(): OpenAI {
  if (!client) {
    const apiKey = process.env.MODEL_API_KEY;
    if (!apiKey) throw new Error("MODEL_API_KEY is not set (see .env.example)");
    client = new OpenAI({
      apiKey,
      baseURL: process.env.MODEL_API_BASE_URL ?? "https://api.meta.ai/v1",
    });
  }
  return client;
}
