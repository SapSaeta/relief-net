import assert from "node:assert/strict";
import { test } from "node:test";

import { applyTriageRules, groupKey, normalizeLocation, type ModelTriage, type TriageInput } from "./triage-rules.ts";

const inputs: TriageInput[] = [
  { ref: "R1", caseId: "a", priority: "medium", call112: false, location: "4 Mill Lane", text: "Mud in the kitchen at 4 Mill Lane, two adults live here." },
  { ref: "R2", caseId: "b", priority: "high", call112: false, location: "4, Mill Ln.", text: "My neighbours at 4 Mill Lane have mud everywhere and a baby." },
  { ref: "R3", caseId: "c", priority: "low", call112: false, location: "15 Ash Grove", text: "Our garden shed lost its roof in the storm." },
  { ref: "R4", caseId: "d", priority: "critical", call112: true, location: "Low Meadow", text: "Water is rising and we are stuck on the roof with the kids." },
];

const triage = (t: Partial<ModelTriage>): ModelTriage => ({ duplicates: [], queue: [], ...t });
const millQuotes = [
  { ref: "R1", quote: "at 4 Mill Lane" },
  { ref: "R2", quote: "neighbours at 4 Mill Lane" },
];
const dup = (quotes: { ref: string; quote: string }[], refs = ["R1", "R2"]) => ({ refs, keep: "R2", reason: "Same address", quotes });

test("normalizes locations: punctuation, case and abbreviations", () => {
  assert.equal(normalizeLocation("4, Mill Ln."), normalizeLocation("4 mill lane"));
  assert.notEqual(normalizeLocation("Mill Lane"), normalizeLocation("4 Mill Lane"));
  assert.equal(normalizeLocation(undefined), "");
});

test("merges on its own when quotes are verified and the location matches", () => {
  const { duplicates, queue } = applyTriageRules(inputs, triage({ duplicates: [dup(millQuotes)] }));
  assert.equal(duplicates[0].status, "merged");
  assert.equal(duplicates[0].mergedBy, "rule");
  assert.equal(queue.some((q) => q.caseId === "a"), false);
  assert.deepEqual(queue.find((q) => q.caseId === "b")?.duplicateIds, ["a"]);
});

test("a generic quote in two different houses stays a possible duplicate", () => {
  const houses: TriageInput[] = [
    { ref: "R1", caseId: "x", priority: "medium", call112: false, location: "9 Church Street", text: "There is mud in the kitchen and hallway." },
    { ref: "R2", caseId: "y", priority: "medium", call112: false, location: "11 Church Street", text: "The kitchen floor is covered, mud in the kitchen everywhere." },
  ];
  const { duplicates, queue } = applyTriageRules(
    houses,
    triage({ duplicates: [dup([{ ref: "R1", quote: "mud in the kitchen" }, { ref: "R2", quote: "mud in the kitchen" }])] }),
  );
  assert.equal(duplicates[0].quotesVerified, true);
  assert.equal(duplicates[0].sameLocation, false);
  assert.equal(duplicates[0].status, "possible");
  assert.equal(queue.length, 2);
});

test("keeps both requests when a member's quote is invented", () => {
  const { duplicates, queue } = applyTriageRules(
    inputs,
    triage({ duplicates: [dup([{ ref: "R1", quote: "at 4 Mill Lane" }, { ref: "R2", quote: "same family as before" }])] }),
  );
  assert.equal(duplicates[0].status, "possible");
  assert.match(duplicates[0].check, /R2/);
  assert.equal(queue.length, 4);
});

test("the coordinator can confirm a possible duplicate", () => {
  const moved = inputs.map((i) => (i.ref === "R2" ? { ...i, location: "Mill Lane" } : i));
  const proposal = triage({ duplicates: [dup(millQuotes)] });
  assert.equal(applyTriageRules(moved, proposal).duplicates[0].status, "possible");

  const { duplicates, queue } = applyTriageRules(moved, proposal, [{ key: groupKey(["b", "a"]), action: "confirm", at: "t" }]);
  assert.equal(duplicates[0].status, "merged");
  assert.equal(duplicates[0].mergedBy, "coordinator");
  assert.equal(queue.length, 3);
});

test("undoing a merge puts both requests back in the queue", () => {
  const proposal = triage({ duplicates: [dup(millQuotes)], queue: ["R4", "R2", "R1", "R3"].map((ref) => ({ ref, reason: ref })) });
  const { duplicates, queue } = applyTriageRules(inputs, proposal, [{ key: groupKey(["a", "b"]), action: "undo", at: "t" }]);
  assert.equal(duplicates[0].status, "possible");
  assert.equal(duplicates[0].decision, "undo");
  assert.match(duplicates[0].check, /undone/);
  assert.deepEqual(queue.map((q) => q.caseId), ["d", "b", "a", "c"]);
  assert.deepEqual(queue.find((q) => q.caseId === "b")?.duplicateIds, []);
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
  const { queue } = applyTriageRules(inputs, triage({ queue: ["R2", "R1", "R3", "R4"].map((ref) => ({ ref, reason: ref })) }));
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

test("a kept duplicate inherits the most urgent tier of its group, and loses it when undone", () => {
  const twoTiers: TriageInput[] = [{ ...inputs[0], priority: "low" }, { ...inputs[1], priority: "critical" }, inputs[2]];
  const proposal = triage({
    duplicates: [{ ...dup(millQuotes), keep: "R1" }],
    queue: [{ ref: "R3", reason: "" }, { ref: "R1", reason: "" }, { ref: "R2", reason: "" }],
  });
  const merged = applyTriageRules(twoTiers, proposal);
  assert.deepEqual(merged.queue.map((q) => [q.caseId, q.tier]), [["a", 1], ["c", 4]]);

  const undone = applyTriageRules(twoTiers, proposal, [{ key: groupKey(["a", "b"]), action: "undo", at: "t" }]);
  assert.deepEqual(undone.queue.map((q) => [q.caseId, q.tier]), [["b", 1], ["c", 4], ["a", 4]]);
});
