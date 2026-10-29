import "server-only";

import OpenAI from "openai";

import { meta, models } from "@/lib/meta";
import type { Provider } from "@/lib/usage";

// Provider switch for the coordinator side: Muse Spark 1.3 on the Meta Model API, or the
// open-weights Muse Spark Open served by Baseten. Both speak the Responses API, so callers
// only pick a provider; prompts, schemas and checks stay the same.

export const PROVIDERS: Provider[] = ["meta", "baseten"];

export const PROVIDER_LABELS: Record<Provider, string> = {
  meta: "Muse Spark 1.3 · Meta API",
  baseten: "Muse Spark Open · Baseten (open weights)",
};

export type Llm = { provider: Provider; model: string; client: OpenAI };

let baseten: OpenAI | undefined;

function openWeights(apiKey: string): OpenAI {
  baseten ??= new OpenAI({ apiKey, baseURL: process.env.OPEN_WEIGHTS_BASE_URL ?? "https://inference.baseten.co/v1" });
  return baseten;
}

let warned = false;

export const isProvider = (value: unknown): value is Provider => PROVIDERS.includes(value as Provider);

export const openWeightsConfigured = () => Boolean(process.env.OPEN_WEIGHTS_API_KEY);

/** COORDINATOR_PROVIDER picks the default: open weights, which an organization can self-host.
 *  Without an open-weights key the default is Meta. */
export function defaultProvider(): Provider {
  const configured = process.env.COORDINATOR_PROVIDER;
  const wanted = isProvider(configured) ? configured : "baseten";
  return wanted === "baseten" && !openWeightsConfigured() ? "meta" : wanted;
}

/** Asking for open weights without OPEN_WEIGHTS_API_KEY falls back to Meta (logged once), so a
 *  missing key degrades the demo instead of failing it. The returned provider is what ran. */
export function llm(provider: Provider = defaultProvider()): Llm {
  const key = process.env.OPEN_WEIGHTS_API_KEY;
  if (provider === "baseten" && key) {
    return { provider, model: process.env.OPEN_WEIGHTS_MODEL ?? "meta-models/muse-spark-open-1026", client: openWeights(key) };
  }
  if (provider === "baseten" && !warned) {
    warned = true;
    console.warn("llm: OPEN_WEIGHTS_API_KEY is not set; using Muse Spark 1.3 on the Meta API instead");
  }
  return { provider: "meta", model: models.text, client: meta() };
}
