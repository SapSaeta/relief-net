import assert from "node:assert/strict";
import { test } from "node:test";

import { checkReport, outOfScope, type ReportDraft } from "./report-rules.ts";

const transcript = { text: "This is the kitchen. The water came up to the counters and the fridge is ruined. Our son is two." };
const frames = [{ index: 2, detections: [{ concept: "mud" }, { concept: "crack" }] }];
const quote = (q: string) => ({ kind: "transcript" as const, quote: q, frame_index: null, damage_label: null });
const frame = (i: number, label: string) => ({ kind: "frame" as const, quote: null, frame_index: i, damage_label: label });

const draft: ReportDraft = {
  incident_summary: "Flood water entered the ground floor.",
  damage_items: [
    { area: "kitchen", item: "fridge", description: "Ruined by flood water", severity: "severe", evidence: [quote("the fridge is ruined")] },
    { area: "kitchen", item: "wall", description: "Crack in the wall", severity: "moderate", evidence: [frame(2, "crack"), quote("a big crack")] },
    { area: "hallway", item: "floor", description: "Mud on the floor", severity: "minor", evidence: [frame(5, "mud")] },
  ],
  household_impact: [{ statement: "A two-year-old lives here", evidence: [quote("our son is two")] }],
  safety_notes: [{ statement: "A professional should inspect the crack", evidence: [frame(2, "mold")] }],
  missing_information: ["Policy number"],
  householder_statement: "The water came up to the counters.",
};

test("marks each statement verified only when one of its citations checks out", () => {
  const r = checkReport(draft, transcript, frames);
  assert.deepEqual(r.damage_items.map((d) => d.verified), [true, true, false]);
  assert.equal(r.damage_items[1].evidence[1].verified, false); // invented quote, the frame still backs it
  assert.match(r.damage_items[2].evidence[0].check, /frame 5 does not exist/);
  assert.equal(r.household_impact[0].verified, true);
  assert.equal(r.safety_notes[0].verified, false);
  assert.deepEqual(r.verification, { statements: 5, verified: 3, citations: 6, citationsVerified: 3 });
});

test("flags valuations and advice anywhere in the draft", () => {
  assert.deepEqual(outOfScope(draft), []);
  const priced = {
    ...draft,
    damage_items: [{ ...draft.damage_items[0], description: "A fridge worth about €900" }],
    safety_notes: [{ statement: "The house is safe to enter after drying", evidence: [] }],
  };
  assert.deepEqual(outOfScope(priced), ['damage item "fridge"', "safety note"]);
  assert.deepEqual(outOfScope({ ...draft, householder_statement: "We lost 2,000 euros of food" }), ["householder statement"]);
});
