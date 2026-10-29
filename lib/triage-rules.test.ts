import assert from "node:assert/strict";
import { test } from "node:test";

import { applyTriageRules, type ModelTriage, type TriageInput } from "./triage-rules.ts";

const inputs: TriageInput[] = [
  { ref: "R1", caseId: "a", priority: "medium", call112: false, text: "Mud in the kitchen at 4 Mill Lane, two adults live here." },
  { ref: "R2", caseId: "b", priority: "high", call112: false, text: "My neighbours at 4 Mill Lane have mud everywhere and a baby." },
  { ref: "R3", caseId: "c", priority: "low", call112: false, text: "Our garden shed lost its roof in the storm." },
  { ref: "R4", caseId: "d", priority: "critical", call112: true, text: "Water is rising and we are stuck on the roof with the kids." },
];

const triage = (t: Partial<ModelTriage>): ModelTriage => ({ duplicates: [], queue: [], ...t });
const dup = (quotes: { ref: string; quote: string }[]) => ({ refs: ["R1", "R2"], keep: "R2", reason: "Same address", quotes });

test("merges a duplicate only when every member has a verified quote", () => {
  const { duplicates, queue } = applyTriageRules(
    inputs,
    triage({ duplicates: [dup([{ ref: "R1", quote: "at 4 Mill Lane" }, { ref: "R2", quote: "neighbours at 4 Mill Lane" }])] }),
  );
  assert.equal(duplicates[0].verified, true);
  assert.equal(queue.some((q) => q.caseId === "a"), false);
  assert.deepEqual(queue.find((q) => q.caseId === "b")?.duplicateIds, ["a"]);
});

test("keeps both requests when a member's quote is invented", () => {
  const { duplicates, queue } = applyTriageRules(
    inputs,
    triage({ duplicates: [dup([{ ref: "R1", quote: "at 4 Mill Lane" }, { ref: "R2", quote: "same family as before" }])] }),
  );
  assert.equal(duplicates[0].verified, false);
  assert.match(duplicates[0].check, /R2/);
  assert.equal(queue.length, 4);
});

test("ignores unknown refs and a case claimed by two groups", () => {
  const { duplicates } = applyTriageRules(
    inputs,
    triage({
      duplicates: [
        { refs: ["R1", "R9"], keep: "R1", reason: "", quotes: [] },
        { refs: ["R1", "R3"], keep: "R1", reason: "", quotes: [] },
        { refs: ["R3", "R1"], keep: "R3", reason: "", quotes: [] },
      ],
    }),
  );
  assert.equal(duplicates.length, 1);
  assert.deepEqual(duplicates[0].caseIds, ["a", "c"]);
});

test("puts a 112 case first even if the model ranks it last, and says so", () => {
  const { queue } = applyTriageRules(
    inputs,
    triage({ queue: ["R2", "R1", "R3", "R4"].map((ref) => ({ ref, reason: ref })) }),
  );
  assert.deepEqual(queue.map((q) => q.caseId), ["d", "b", "a", "c"]);
  assert.equal(queue[0].raisedByRule, true);
  assert.equal(queue[0].modelRank, 4);
  assert.equal(queue[1].raisedByRule, false);
});

test("keeps the model's order within a tier and appends cases it left out", () => {
  const same: TriageInput[] = inputs.map((i) => ({ ...i, priority: "high", call112: false }));
  const { queue } = applyTriageRules(same, triage({ queue: [{ ref: "R3", reason: "x" }, { ref: "R1", reason: "y" }, { ref: "R3", reason: "again" }] }));
  assert.deepEqual(queue.map((q) => q.caseId), ["c", "a", "b", "d"]);
  assert.equal(queue[2].modelRank, null);
  assert.match(queue[2].reason, /Not ranked by the model/);
});

test("a kept duplicate inherits the most urgent tier of its group", () => {
  const twoTiers: TriageInput[] = [
    { ...inputs[0], priority: "low" },
    { ...inputs[1], priority: "critical" },
    inputs[2],
  ];
  const { queue } = applyTriageRules(
    twoTiers,
    triage({
      duplicates: [{ ...dup([{ ref: "R1", quote: "at 4 Mill Lane" }, { ref: "R2", quote: "neighbours at 4 Mill Lane" }]), keep: "R1" }],
      queue: [{ ref: "R3", reason: "" }, { ref: "R1", reason: "" }],
    }),
  );
  assert.deepEqual(queue.map((q) => [q.caseId, q.tier]), [["a", 1], ["c", 4]]);
});
