import { connection } from "next/server";
import OpenAI from "openai";

import { meta, models } from "@/lib/meta";

// Minimal round trip to Muse Spark. Never cached, never exposes the key.
export async function GET() {
  await connection();

  const started = Date.now();
  try {
    const response = await meta().responses.create({
      model: models.text,
      input: "Reply with only the word OK.",
      max_output_tokens: 2000, // reasoning uses part of the budget
    });
    return Response.json({
      ok: true,
      model: models.text,
      reply: response.output_text.trim(),
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    const status = error instanceof OpenAI.APIError ? (error.status ?? 502) : 500;
    return Response.json(
      { ok: false, model: models.text, error: error instanceof OpenAI.APIError ? error.message : "Health check failed" },
      { status: status >= 400 ? status : 502 },
    );
  }
}
