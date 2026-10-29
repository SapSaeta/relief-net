// Deterministic checks on the model's triage. Pure: no I/O, no framework imports.
// The model proposes duplicates and an order; code and the coordinator decide what is accepted:
//   - a duplicate group merges on its own only if every member is backed by a verified quote from its
//     own words AND all members share the same normalized location; otherwise it is a "possible
//     duplicate" that the coordinator confirms or not. The coordinator can also undo any merge;
//   - the queue respects safety tiers (112 first, then critical, high, medium, low) whatever the model says.

import { checkEvidence, type CheckedEvidence } from "./evidence.ts";

export type TriageInput = {
  ref: string;
  caseId: string;
  priority: "critical" | "high" | "medium" | "low";
  call112: boolean;
  text: string;
  location?: string;
};

export type ModelTriage = {
  duplicates: { refs: string[]; keep: string; reason: string; quotes: { ref: string; quote: string }[] }[];
  queue: { ref: string; reason: string }[];
};

/** A coordinator's decision on a proposed group, matched by its exact set of cases. */
export type MergeDecision = { key: string; action: "confirm" | "undo"; at: string };

export type DuplicateGroup = {
  key: string;
  caseIds: string[];
  keepId: string;
  reason: string;
  quotes: (CheckedEvidence & { caseId: string })[];
  /** Every member has at least one verified quote from its own words. */
  quotesVerified: boolean;
  /** Every member has the same normalized, non-empty location. */
  sameLocation: boolean;
  status: "merged" | "possible";
  /** Who merged it: the rule (quotes + location) or the coordinator. */
  mergedBy: "rule" | "coordinator" | null;
  decision: MergeDecision["action"] | null;
  check: string;
};

export type QueueItem = {
  caseId: string;
  rank: number;
  reason: string;
  tier: number;
  /** Position the model gave it (1-based), or null if the model left it out. */
  modelRank: number | null;
  /** Moved above where the model put it because of its safety tier. */
  raisedByRule: boolean;
  /** Merged duplicates folded into this item. */
  duplicateIds: string[];
};

const PRIORITY_TIER = { critical: 1, high: 2, medium: 3, low: 4 } as const;

export const TIER_LABELS = ["call 112", "critical", "high", "medium", "low"];

export const tierOf = (c: Pick<TriageInput, "priority" | "call112">) => (c.call112 ? 0 : PRIORITY_TIER[c.priority]);

/** Order-independent identity of a group of cases. */
export const groupKey = (caseIds: string[]) => [...caseIds].sort().join("+");

const ABBREVIATIONS: Record<string, string> = { st: "street", rd: "road", ave: "avenue", av: "avenue", ln: "lane", sq: "square", no: "" };

/** "4, Mill Ln." and "4 mill lane" are the same place; "Mill Lane" (no number) is not. */
export function normalizeLocation(location: string | undefined): string {
  return (location ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .map((w) => ABBREVIATIONS[w] ?? w)
    .filter(Boolean)
    .join(" ");
}

export function applyTriageRules(
  inputs: TriageInput[],
  model: ModelTriage,
  decisions: MergeDecision[] = [],
): { duplicates: DuplicateGroup[]; queue: QueueItem[] } {
  const byRef = new Map(inputs.map((i) => [i.ref, i]));
  const decisionFor = new Map(decisions.map((d) => [d.key, d.action]));

  // Duplicates: known refs only, at least two, no case in two groups.
  const grouped = new Set<string>();
  const duplicates: DuplicateGroup[] = [];
  for (const group of model.duplicates) {
    const refs = [...new Set(group.refs)].filter((r) => byRef.has(r) && !grouped.has(r));
    if (refs.length < 2) continue;
    refs.forEach((r) => grouped.add(r));
    const members = refs.map((r) => byRef.get(r)!);

    const quotes = group.quotes
      .filter((q) => refs.includes(q.ref))
      .map((q) => {
        const member = byRef.get(q.ref)!;
        const [checked] = checkEvidence([{ kind: "transcript", quote: q.quote, frame_index: null, damage_label: null }], { text: member.text }, []);
        return { ...checked, caseId: member.caseId };
      });
    const unsupported = members.filter((m) => !quotes.some((q) => q.verified && q.caseId === m.caseId)).map((m) => m.ref);
    const locations = new Set(members.map((m) => normalizeLocation(m.location)));
    const sameLocation = locations.size === 1 && !locations.has("");
    const quotesVerified = unsupported.length === 0;

    const caseIds = members.map((m) => m.caseId);
    const key = groupKey(caseIds);
    const decision = decisionFor.get(key) ?? null;
    const auto = quotesVerified && sameLocation;
    const status = decision === "confirm" || (auto && decision !== "undo") ? "merged" : "possible";
    const reasons = [
      quotesVerified ? "quotes verified" : `no verified quote from ${unsupported.join(", ")}`,
      sameLocation ? "same location" : "locations differ or are missing",
    ];
    if (decision === "undo") reasons.push("merge undone by the coordinator");
    if (decision === "confirm") reasons.push("merge confirmed by the coordinator");

    const keep = refs.includes(group.keep) ? group.keep : refs[0];
    duplicates.push({
      key,
      caseIds,
      keepId: byRef.get(keep)!.caseId,
      reason: group.reason,
      quotes,
      quotesVerified,
      sameLocation,
      status,
      mergedBy: status === "merged" ? (decision === "confirm" ? "coordinator" : "rule") : null,
      decision,
      check: reasons.join(" · "),
    });
  }

  // Merged cases leave the queue; the kept one inherits the most urgent tier of its group.
  const folded = new Map<string, DuplicateGroup>();
  for (const g of duplicates.filter((d) => d.status === "merged")) for (const id of g.caseIds) folded.set(id, g);
  const inQueue = inputs.filter((i) => !folded.has(i.caseId) || folded.get(i.caseId)!.keepId === i.caseId);
  const tierFor = (i: TriageInput) => {
    const g = folded.get(i.caseId);
    return g ? Math.min(...inputs.filter((x) => g.caseIds.includes(x.caseId)).map(tierOf)) : tierOf(i);
  };

  // The model ranks every request; cases folded into another one drop out of its order.
  const modelOrder = [...new Set(model.queue.map((q) => q.ref))].filter((r) => inQueue.some((i) => i.ref === r));
  const reasons = new Map(model.queue.map((q) => [q.ref, q.reason]));
  const unranked = inQueue.filter((i) => !modelOrder.includes(i.ref)).map((i) => i.ref);
  const proposed = [...modelOrder, ...unranked].map((ref) => byRef.get(ref)!);
  const final = [...proposed].sort((a, b) => tierFor(a) - tierFor(b)); // stable: keeps the model's order within a tier

  const queue = final.map((i, n) => {
    const modelIndex = modelOrder.indexOf(i.ref);
    const g = folded.get(i.caseId);
    return {
      caseId: i.caseId,
      rank: n + 1,
      reason: reasons.get(i.ref) ?? "Not ranked by the model; placed by safety tier.",
      tier: tierFor(i),
      modelRank: modelIndex === -1 ? null : modelIndex + 1,
      raisedByRule: modelIndex !== -1 && n < modelIndex,
      duplicateIds: g ? g.caseIds.filter((id) => id !== i.caseId) : [],
    };
  });
  return { duplicates, queue };
}
