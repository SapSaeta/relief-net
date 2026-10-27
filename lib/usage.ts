import "server-only";

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { tokenCostUsd } from "@/lib/pricing";

// Usage ledger: tokens or units, latency and estimated cost of every model call.
// Kept per case and appended to .data/usage.jsonl (git-ignored) for running totals.

const DATA_DIR = join(process.cwd(), ".data");
const LEDGER_FILE = join(DATA_DIR, "usage.jsonl");

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

  async flush(): Promise<void> {
    if (!this.entries.length) return;
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(LEDGER_FILE, this.entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
}

export type UsageSummary = {
  calls: number;
  costUsd: number;
  byProvider: Record<string, { calls: number; costUsd: number }>;
  byOperation: Record<string, { calls: number; costUsd: number; inputTokens: number; outputTokens: number }>;
};

export async function summarizeUsage(): Promise<UsageSummary> {
  let lines: string[] = [];
  try {
    lines = (await readFile(LEDGER_FILE, "utf8")).split("\n").filter(Boolean);
  } catch {
    // No usage recorded yet.
  }
  const summary: UsageSummary = { calls: 0, costUsd: 0, byProvider: {}, byOperation: {} };
  for (const line of lines) {
    const e = JSON.parse(line) as UsageEntry;
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
