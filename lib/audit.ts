import "server-only";

import { store } from "@/lib/store";

// Audit log: one append-only entry per action, saying who acted. The public sends requests, the model
// proposes, code rules accept or overrule, and the coordinator decides. Entries are never edited;
// the full model output stays in the run it points to (runId).

const AUDIT_LOG = "audit";

export type Actor = "public" | "model" | "rule" | "coordinator";

export type AuditEntry = {
  at: string;
  actor: Actor;
  action:
    | "intake.received"
    | "triage.run"
    | "merge.auto"
    | "queue.raised"
    | "merge.confirm"
    | "merge.undo"
    | "matching.run"
    | "matching.rejected"
    | "assignment.approve"
    | "assignment.reject"
    | "report.drafted";
  summary: string;
  caseIds?: string[];
  runId?: string;
  /** Provider and model for model actions. */
  model?: string;
  /** Rebuilt from stored records for actions taken before the log existed (scripts/backfill-audit.mjs). */
  backfilled?: boolean;
};

export async function audit(...entries: Omit<AuditEntry, "at">[]): Promise<void> {
  if (!entries.length) return;
  const at = new Date().toISOString();
  try {
    await store().append(AUDIT_LOG, entries.map((e) => ({ at, ...e })));
  } catch (error) {
    // The action already happened; a lost audit line is logged loudly rather than undoing it.
    console.error("audit log write failed", error);
  }
}

/** Newest first. */
export async function readAudit(): Promise<AuditEntry[]> {
  return (await store().readLog<AuditEntry>(AUDIT_LOG)).reverse();
}
