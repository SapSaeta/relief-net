// Scores one triage of the synthetic scenario, by the model or by a person, against what the scenario
// was written to test (fixtures/riverside-flood.json → expected). Pure: no I/O, no framework imports.
// Answers use scenario keys (e.g. "mill-4-video"), so a model run and a manual run compare directly.

export type Expected = {
  duplicates: string[][];
  notDuplicates: string[][];
  call112: string[];
  notCritical: string[];
};

export type TriageAnswer = {
  /** Every request, most urgent first. */
  order: string[];
  /** Groups the triager says are the same household or incident. */
  duplicates: string[][];
};

export type Score = {
  checks: { name: string; pass: boolean; detail: string }[];
  passed: number;
  total: number;
  duplicatesFound: number;
  falseMerges: number;
};

const together = (groups: string[][], a: string, b: string) => groups.some((g) => g.includes(a) && g.includes(b));
const pairs = (group: string[]) => group.flatMap((a, i) => group.slice(i + 1).map((b) => [a, b] as const));

export function scoreTriage(answer: TriageAnswer, expected: Expected): Score {
  const checks: Score["checks"] = [];
  for (const [a, b] of expected.duplicates) {
    const pass = together(answer.duplicates, a, b);
    checks.push({ name: `duplicate found: ${a} + ${b}`, pass, detail: pass ? "grouped" : "missed" });
  }
  for (const [a, b] of expected.notDuplicates) {
    const pass = !together(answer.duplicates, a, b);
    checks.push({ name: `trap kept apart: ${a} / ${b}`, pass, detail: pass ? "kept apart" : "wrongly grouped" });
  }
  for (const key of expected.call112) {
    const rank = answer.order.indexOf(key) + 1;
    checks.push({ name: `112 case first: ${key}`, pass: rank === 1, detail: rank ? `ranked #${rank}` : "missing" });
  }
  const half = Math.ceil(answer.order.length / 2);
  for (const key of expected.notCritical) {
    const rank = answer.order.indexOf(key) + 1;
    checks.push({ name: `low priority in the bottom half: ${key}`, pass: rank > half, detail: rank ? `ranked #${rank} of ${answer.order.length}` : "missing" });
  }
  const expectedPairs = expected.duplicates.map(([a, b]) => [a, b].sort().join("+"));
  const falseMerges = answer.duplicates.flatMap(pairs).filter(([a, b]) => !expectedPairs.includes([a, b].sort().join("+"))).length;
  return {
    checks,
    passed: checks.filter((c) => c.pass).length,
    total: checks.length,
    duplicatesFound: expected.duplicates.filter(([a, b]) => together(answer.duplicates, a, b)).length,
    falseMerges,
  };
}

/** Kendall's tau between two orders of the same items: 1 = same order, 0 = unrelated, -1 = reversed. */
export function kendallTau(a: string[], b: string[]): number {
  const items = a.filter((x) => b.includes(x));
  const posB = new Map(b.map((x, i) => [x, i]));
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (posB.get(items[i])! < posB.get(items[j])!) concordant++;
      else discordant++;
    }
  }
  const n = concordant + discordant;
  return n ? (concordant - discordant) / n : 0;
}

/** How many of the first k items two orders share. */
export const topOverlap = (a: string[], b: string[], k: number) => a.slice(0, k).filter((x) => b.slice(0, k).includes(x)).length;
