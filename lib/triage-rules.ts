// Deterministic checks on the model's triage. Pure: no I/O, no framework imports.
// The model proposes duplicates and an order; code decides what is accepted:
//   - a duplicate group counts only if every member is backed by a verified quote from its own words;
//   - the queue respects safety tiers (112 first, then critical, high, medium, low) whatever the model says.

import { checkEvidence, type CheckedEvidence } from "./evidence.ts";

export type TriageInput = {
  ref: string;
  caseId: string;
  priority: "critical" | "high" | "medium" | "low";
  call112: boolean;
  text: string;
};

export type ModelTriage = {
  duplicates: { refs: string[]; keep: string; reason: string; quotes: { ref: string; quote: string }[] }[];
  queue: { ref: string; reason: string }[];
};

export type DuplicateGroup = {
  caseIds: string[];
  keepId: string;
  reason: string;
  quotes: (CheckedEvidence & { caseId: string })[];
  /** Merged only when every member has at least one verified quote. */
  verified: boolean;
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
  /** Verified duplicates folded into this item. */
  duplicateIds: string[];
};

const PRIORITY_TIER = { critical: 1, high: 2, medium: 3, low: 4 } as const;

export const TIER_LABELS = ["call 112", "critical", "high", "medium", "low"];

export const tierOf = (c: Pick<TriageInput, "priority" | "call112">) => (c.call112 ? 0 : PRIORITY_TIER[c.priority]);

export function applyTriageRules(inputs: TriageInput[], model: ModelTriage): { duplicates: DuplicateGroup[]; queue: QueueItem[] } {
  const byRef = new Map(inputs.map((i) => [i.ref, i]));

  // Duplicates: known refs only, at least two, no case in two groups.
  const grouped = new Set<string>();
  const duplicates: DuplicateGroup[] = [];
  for (const group of model.duplicates) {
    const refs = [...new Set(group.refs)].filter((r) => byRef.has(r) && !grouped.has(r));
    if (refs.length < 2) continue;
    refs.forEach((r) => grouped.add(r));

    const quotes = group.quotes
      .filter((q) => refs.includes(q.ref))
      .map((q) => {
        const member = byRef.get(q.ref)!;
        const [checked] = checkEvidence(
          [{ kind: "transcript", quote: q.quote, frame_index: null, damage_label: null }],
          { text: member.text },
          [],
        );
        return { ...checked, caseId: member.caseId };
      });
    const unsupported = refs.filter((r) => !quotes.some((q) => q.verified && q.caseId === byRef.get(r)!.caseId));
    const keep = refs.includes(group.keep) ? group.keep : refs[0];
    duplicates.push({
      caseIds: refs.map((r) => byRef.get(r)!.caseId),
      keepId: byRef.get(keep)!.caseId,
      reason: group.reason,
      quotes,
      verified: unsupported.length === 0,
      check: unsupported.length === 0 ? "every request is backed by its own words" : `no verified quote from ${unsupported.join(", ")}`,
    });
  }

  // Cases folded into another one leave the queue; the kept one inherits the most urgent tier.
  const folded = new Map<string, DuplicateGroup>();
  for (const g of duplicates.filter((d) => d.verified)) for (const id of g.caseIds) folded.set(id, g);
  const inQueue = inputs.filter((i) => !folded.has(i.caseId) || folded.get(i.caseId)!.keepId === i.caseId);
  const tierFor = (i: TriageInput) => {
    const g = folded.get(i.caseId);
    return g ? Math.min(...inputs.filter((x) => g.caseIds.includes(x.caseId)).map(tierOf)) : tierOf(i);
  };

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
