import assert from "node:assert/strict";
import { test } from "node:test";

import { kendallTau, scoreTriage, topOverlap, type Expected } from "./triage-score.ts";

const expected: Expected = {
  duplicates: [["v", "n"], ["d", "s"]],
  notDuplicates: [["c9", "c11"], ["v", "dry"]],
  call112: ["roof"],
  notCritical: ["inj", "shed"],
};
const order = ["roof", "d", "v", "n", "s", "c9", "c11", "dry", "inj", "shed"];

test("a perfect triage passes every check", () => {
  const s = scoreTriage({ order, duplicates: [["v", "n"], ["s", "d"]] }, expected);
  assert.equal(s.passed, s.total);
  assert.equal(s.total, 7);
  assert.equal(s.duplicatesFound, 2);
  assert.equal(s.falseMerges, 0);
});

test("counts missed duplicates, trap merges and misplaced requests", () => {
  const s = scoreTriage({ order: ["d", "inj", "roof", "v", "n", "s", "c9", "c11", "dry", "shed"], duplicates: [["v", "n", "dry"], ["c9", "c11"]] }, expected);
  const failed = s.checks.filter((c) => !c.pass).map((c) => c.name);
  assert.deepEqual(failed, [
    "duplicate found: d + s",
    "trap kept apart: c9 / c11",
    "trap kept apart: v / dry",
    "112 case first: roof",
    "low priority in the bottom half: inj",
  ]);
  assert.equal(s.duplicatesFound, 1);
  assert.equal(s.falseMerges, 3); // v+dry, n+dry, c9+c11
});

test("kendall tau and top-k overlap compare two orders", () => {
  assert.equal(kendallTau(order, order), 1);
  assert.equal(kendallTau(order, [...order].reverse()), -1);
  assert.equal(kendallTau(["a", "b", "c"], ["b", "a", "c"]), 1 / 3);
  assert.equal(topOverlap(order, ["d", "roof", "x", "y", "z"], 5), 2);
});
