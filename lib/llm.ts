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

function openWeights(): OpenAI {
  const apiKey = process.env.OPEN_WEIGHTS_API_KEY;
  if (!apiKey) throw new Error("OPEN_WEIGHTS_API_KEY is not set (see .env.example)");
  baseten ??= new OpenAI({ apiKey, baseURL: process.env.OPEN_WEIGHTS_BASE_URL ?? "https://inference.baseten.co/v1" });
  return baseten;
}

export const isProvider = (value: unknown): value is Provider => PROVIDERS.includes(value as Provider);

/** COORDINATOR_PROVIDER picks the default: open weights, which an organization can self-host. */
export function defaultProvider(): Provider {
  const configured = process.env.COORDINATOR_PROVIDER;
  return isProvider(configured) ? configured : "baseten";
}

export function llm(provider: Provider = defaultProvider()): Llm {
  if (provider === "meta") return { provider, model: models.text, client: meta() };
  return { provider, model: process.env.OPEN_WEIGHTS_MODEL ?? "meta-models/muse-spark-open-1026", client: openWeights() };
}
