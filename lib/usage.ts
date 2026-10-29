import "server-only";

import { tokenCostUsd } from "@/lib/pricing";
import { store } from "@/lib/store";

// Usage ledger: tokens or units, latency and estimated cost of every model call.
// Kept per case, appended to the store's "usage" log (.data/usage.jsonl locally) for running
// totals, and added to the atomic spend counter the spend guard reads.

const USAGE_LOG = "usage";
/** Spend counters are integers in micro-USD so they can use atomic INCRBY. */
export const SPENT_COUNTER = "spend-spent-micro-usd";
export const toMicroUsd = (usd: number) => Math.round(usd * 1_000_000);

export type Provider = "meta" | "baseten";

export type UsageEntry = {
  at: string;
  caseId?: string;
  provider: Provider;
  model: string;
  operation: string;
  latencyMs: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  /** Billable units for non-token models, e.g. { images: 1 } or { audioSec: 19.2 }. */
  units?: Record<string, number>;
  costUsd: number;
};

type ResponsesUsage = {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: { cached_tokens?: number } | null;
  output_tokens_details?: { reasoning_tokens?: number } | null;
} | null | undefined;

export class UsageLedger {
  readonly entries: UsageEntry[] = [];
  private flushed = 0;

  constructor(private readonly caseId?: string) {}

  add(entry: Omit<UsageEntry, "at" | "caseId">): UsageEntry {
    const full: UsageEntry = { at: new Date().toISOString(), caseId: this.caseId, ...entry };
    this.entries.push(full);
    return full;
  }

  /** Records a Responses API call from its `usage` block. */
  addTokens(provider: Provider, model: string, operation: string, latencyMs: number, usage: ResponsesUsage): UsageEntry {
    const input = usage?.input_tokens ?? 0;
    const cachedInput = usage?.input_tokens_details?.cached_tokens ?? 0;
    const output = usage?.output_tokens ?? 0;
    return this.add({
      provider,
      model,
      operation,
      latencyMs,
      inputTokens: input,
      cachedInputTokens: cachedInput,
      outputTokens: output,
      reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? 0,
      costUsd: tokenCostUsd(model, { input, cachedInput, output }),
    });
  }

  get totalUsd(): number {
    return this.entries.reduce((sum, e) => sum + e.costUsd, 0);
  }

  /** Persists entries recorded since the last flush; safe to call more than once. */
  async flush(): Promise<void> {
    const pending = this.entries.slice(this.flushed);
    if (!pending.length) return;
    this.flushed = this.entries.length;
    await store().append(USAGE_LOG, pending);
    await store().incrBy(SPENT_COUNTER, toMicroUsd(pending.reduce((sum, e) => sum + e.costUsd, 0)));
  }
}

export type UsageSummary = {
  calls: number;
  costUsd: number;
  byProvider: Record<string, { calls: number; costUsd: number }>;
  byOperation: Record<string, { calls: number; costUsd: number; inputTokens: number; outputTokens: number }>;
};

export async function summarizeUsage(): Promise<UsageSummary> {
  const entries = await store().readLog<UsageEntry>(USAGE_LOG);
  const summary: UsageSummary = { calls: 0, costUsd: 0, byProvider: {}, byOperation: {} };
  for (const e of entries) {
    summary.calls++;
    summary.costUsd += e.costUsd;
    const p = (summary.byProvider[e.provider] ??= { calls: 0, costUsd: 0 });
    p.calls++;
    p.costUsd += e.costUsd;
    const o = (summary.byOperation[e.operation] ??= { calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 });
    o.calls++;
    o.costUsd += e.costUsd;
    o.inputTokens += e.inputTokens ?? 0;
    o.outputTokens += e.outputTokens ?? 0;
  }
  return summary;
}
