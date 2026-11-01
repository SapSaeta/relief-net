import "server-only";

import { audit } from "@/lib/audit";
import { listCases } from "@/lib/cases";
import { store } from "@/lib/store";

// Manual baseline: a person triages the same open requests by hand, timed, with no AI output on screen
// (only the words, location and time each request arrived with). scripts/eval-triage.mjs scores it with
// the same checks as the model's runs (lib/triage-score.ts).

const BASELINES = "baselines";

export type ManualTriage = {
  id: string;
  at: string;
  /** Who did it, as typed (e.g. "developer"); used to say how much they knew of the scenario. */
  triager: string;
  startedAt: string;
  durationMs: number;
  /** Case ids, most urgent first. */
  order: string[];
  /** Groups of case ids the person marked as the same household or incident. */
  duplicates: string[][];
};

export async function saveManualTriage(input: {
  triager: unknown;
  startedAt: unknown;
  durationMs: unknown;
  order: unknown;
  duplicates: unknown;
}): Promise<ManualTriage | { error: string; status: number }> {
  const open = (await listCases()).filter((c) => c.request !== null).map((c) => c.id);
  const order = Array.isArray(input.order) ? input.order.map(String) : [];
  if (order.length !== open.length || new Set(order).size !== order.length || order.some((id) => !open.includes(id))) {
    return { error: "The order must list every open request exactly once", status: 400 };
  }
  const duplicates = (Array.isArray(input.duplicates) ? input.duplicates : [])
    .map((g) => (Array.isArray(g) ? g.map(String).filter((id) => open.includes(id)) : []))
    .filter((g) => g.length >= 2);
  const durationMs = Number(input.durationMs);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return { error: "durationMs must be a positive number", status: 400 };

  const at = new Date().toISOString();
  const saved: ManualTriage = {
    id: `manual-${Date.now()}`,
    at,
    triager: String(input.triager ?? "").trim().slice(0, 60) || "anonymous",
    startedAt: typeof input.startedAt === "string" ? input.startedAt : at,
    durationMs: Math.round(durationMs),
    order,
    duplicates,
  };
  await store().putDoc(BASELINES, saved.id, saved);
  await audit({
    actor: "coordinator",
    action: "baseline.recorded",
    summary: `Manual triage by ${saved.triager}: ${order.length} requests in ${(durationMs / 60000).toFixed(1)} min, ${duplicates.length} duplicate group${duplicates.length === 1 ? "" : "s"}`,
    runId: saved.id,
  });
  return saved;
}

export async function listManualTriages(): Promise<ManualTriage[]> {
  return (await store().listDocs<ManualTriage>(BASELINES)).sort((a, b) => a.at.localeCompare(b.at));
}
