// Deterministic checks on the drafted insurance/aid report. Pure: no I/O, no framework imports.
// Every damage item, impact and safety note must cite evidence; code verifies each citation (quote in
// the person's words, or a damage label SAM detected in that frame). A statement with no verified
// evidence stays in the draft but is marked unverified, so the household sees what it still has to
// back up before sending anything.

import { checkEvidence, type CheckedEvidence, type Evidence } from "./evidence.ts";

export type Severity = "minor" | "moderate" | "severe";

export type ReportDraft = {
  incident_summary: string;
  damage_items: { area: string; item: string; description: string; severity: Severity; evidence: Evidence[] }[];
  household_impact: { statement: string; evidence: Evidence[] }[];
  safety_notes: { statement: string; evidence: Evidence[] }[];
  missing_information: string[];
  householder_statement: string;
};

type Checked<T> = Omit<T, "evidence"> & { evidence: CheckedEvidence[]; verified: boolean };

export type CheckedReport = Omit<ReportDraft, "damage_items" | "household_impact" | "safety_notes"> & {
  damage_items: Checked<ReportDraft["damage_items"][number]>[];
  household_impact: Checked<ReportDraft["household_impact"][number]>[];
  safety_notes: Checked<ReportDraft["safety_notes"][number]>[];
  /** Statements backed by at least one verified citation, out of all statements. */
  verification: { statements: number; verified: number; citations: number; citationsVerified: number };
};

type Frame = { index: number; detections: { concept: string }[] };

/** Words that turn a draft into a valuation or advice, which this report never gives. */
const OUT_OF_SCOPE = /(?:[$€£]\s?\d|\d\s?(?:usd|eur|euros?|dollars?|pounds?)\b|\bvalued at\b|\bworth\b|\bdiagnos|\bprescri|\bdosage\b|\bsafe to (?:enter|live|occupy)\b)/i;

export function checkReport(draft: ReportDraft, transcript: { text: string }, frames: Frame[]): CheckedReport {
  const check = <T extends { evidence: Evidence[] }>(items: T[]) =>
    items.map((item) => {
      const evidence = checkEvidence(item.evidence, transcript, frames);
      return { ...item, evidence, verified: evidence.some((e) => e.verified) };
    });
  const damage_items = check(draft.damage_items);
  const household_impact = check(draft.household_impact);
  const safety_notes = check(draft.safety_notes);
  const all = [...damage_items, ...household_impact, ...safety_notes];
  const citations = all.flatMap((s) => s.evidence);
  return {
    ...draft,
    damage_items,
    household_impact,
    safety_notes,
    verification: {
      statements: all.length,
      verified: all.filter((s) => s.verified).length,
      citations: citations.length,
      citationsVerified: citations.filter((e) => e.verified).length,
    },
  };
}

/** Text fields that stray into valuations or medical/structural advice. The report is rejected and redrafted. */
export function outOfScope(draft: ReportDraft): string[] {
  const texts = [
    ["incident summary", draft.incident_summary],
    ["householder statement", draft.householder_statement],
    ...draft.damage_items.map((d) => [`damage item "${d.item}"`, `${d.item} ${d.description}`]),
    ...draft.household_impact.map((h) => ["household impact", h.statement]),
    ...draft.safety_notes.map((s) => ["safety note", s.statement]),
  ];
  return texts.filter(([, text]) => OUT_OF_SCOPE.test(text)).map(([where]) => where);
}
