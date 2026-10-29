import { connection } from "next/server";
import OpenAI from "openai";

import { COST_ESTIMATE_USD, withPaidCall } from "@/lib/guard";
import { meta, models } from "@/lib/meta";
import { UsageLedger } from "@/lib/usage";

// Minimal round trip to Muse Spark. Never cached, never exposes the key.
export async function GET(request: Request) {
  await connection();
  return withPaidCall(request, COST_ESTIMATE_USD.health, ping);
}

async function ping() {
  const started = Date.now();
  const ledger = new UsageLedger();
  try {
    const response = await meta().responses.create({
      model: models.text,
      input: "Reply with only the word OK.",
      max_output_tokens: 2000, // reasoning uses part of the budget
    });
    ledger.addTokens("meta", models.text, "health", Date.now() - started, response.usage);
    return Response.json({
      ok: true,
      model: models.text,
      reply: response.output_text.trim(),
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    console.error("health check failed", error);
    // Status code only: upstream error text stays in the server log.
    const status = error instanceof OpenAI.APIError ? (error.status ?? 502) : 500;
    return Response.json({ ok: false, model: models.text, error: `Health check failed (${status})` }, { status: status >= 400 ? status : 502 });
  } finally {
    await ledger.flush();
  }
}
