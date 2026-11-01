import assert from "node:assert/strict";
import { test } from "node:test";

import { checkAssignment, decideAssignment, remaining, type Assignment, type MatchCase, type Roster } from "./match-rules.ts";

const roster: Roster = {
  volunteers: [
    { id: "V1", name: "Ana", area: "Mill Lane", skills: ["mud_removal"], available: "today", capacity: 1, vehicle: false, professional: null },
    { id: "V2", name: "Tom", area: "High Street", skills: ["transport", "medication_pickup"], available: "today", capacity: 2, vehicle: true, professional: null },
    { id: "V3", name: "Bea", area: "Park Avenue", skills: ["transport"], available: "tomorrow", capacity: 1, vehicle: false, professional: null },
    { id: "V6", name: "Sam", area: "Bridge Row", skills: ["power"], available: "today", capacity: 1, vehicle: true, professional: "electrician" },
    { id: "V7", name: "Helen", area: "Canal Street", skills: ["temporary_repair"], available: "today", capacity: 1, vehicle: true, professional: "structural_engineer" },
  ],
  supplies: [
    { item: "shovel_kit", label: "Shovel kit", stock: 2, covers: ["mud_removal"] },
    { item: "generator", label: "Generator", stock: 1, covers: ["power"] },
  ],
};

const cases: MatchCase[] = [
  { ref: "R1", caseId: "a", needs: ["mud_removal"], safetyFlags: [] },
  { ref: "R2", caseId: "b", needs: ["transport"], safetyFlags: [] },
  { ref: "R3", caseId: "c", needs: ["shelter"], safetyFlags: ["call_112_now"] },
  { ref: "R4", caseId: "d", needs: ["power"], safetyFlags: ["electrical_hazard"] },
  { ref: "R5", caseId: "e", needs: ["temporary_repair", "mud_removal"], safetyFlags: ["structural_risk_professional"] },
  { ref: "R6", caseId: "f", needs: ["mud_removal"], safetyFlags: [] },
  { ref: "R7", caseId: "g", needs: ["shelter", "water_food"], safetyFlags: ["structural_risk_professional"] },
];

const mud = { ref: "R1", needs: ["mud_removal"], volunteerIds: ["V1"], supplies: [{ item: "shovel_kit", quantity: 1 }], reason: "nearby" };
const accept = (accepted: Assignment[], p: Parameters<typeof checkAssignment>[3]) => {
  const v = checkAssignment(roster, cases, accepted, p);
  assert.equal(v.accepted, true, v.accepted ? "" : v.problems.join("; "));
  return v.accepted ? v.assignment : (null as never);
};
const problems = (accepted: Assignment[], p: Parameters<typeof checkAssignment>[3]) => {
  const v = checkAssignment(roster, cases, accepted, p);
  assert.equal(v.accepted, false);
  return v.accepted ? "" : v.problems.join("; ");
};

test("accepts a matching volunteer with stock, and lists what was checked", () => {
  const a = accept([], mud);
  assert.equal(a.caseId, "a");
  assert.match(a.checks.join("; "), /V1 Ana: mud_removal/);
  assert.match(a.checks.join("; "), /1 × Shovel kit \(1 left\)/);
});

test("never assigns volunteers to a 112 case", () => {
  assert.match(problems([], { ref: "R3", needs: ["shelter"], volunteerIds: ["V2"], supplies: [], reason: "" }), /112 case/);
});

test("rejects a volunteer without the skill, or needs the request did not state", () => {
  assert.match(problems([], { ...mud, volunteerIds: ["V2"] }), /V2 Tom has none of the skills/);
  assert.match(problems([], { ...mud, needs: ["mud_removal", "drying"] }), /did not ask for: drying/);
  assert.match(problems([], { ...mud, volunteerIds: ["V9"] }), /no volunteer V9/);
});

test("keeps capacity and stock across accepted assignments", () => {
  const first = accept([], mud);
  assert.match(problems([first], { ...mud, ref: "R6" }), /V1 Ana has no capacity left/);
  assert.match(problems([first], { ...mud, ref: "R1" }), /already has an accepted assignment/);
  const left = remaining(roster, [first]);
  assert.equal(left.stock(roster.supplies[0]), 1);
  assert.match(problems([], { ...mud, supplies: [{ item: "shovel_kit", quantity: 3 }] }), /3 requested, 2 left/);
  assert.match(problems([], { ...mud, supplies: [{ item: "generator", quantity: 1 }] }), /generator does not cover mud_removal/);
});

test("transport needs a vehicle", () => {
  assert.match(problems([], { ref: "R2", needs: ["transport"], volunteerIds: ["V3"], supplies: [], reason: "" }), /needs a volunteer with a vehicle/);
  accept([], { ref: "R2", needs: ["transport"], volunteerIds: ["V2"], supplies: [], reason: "" });
});

test("electrical hazard and structural risk need the right professional", () => {
  accept([], { ref: "R4", needs: ["power"], volunteerIds: ["V6"], supplies: [{ item: "generator", quantity: 1 }], reason: "" });
  assert.match(problems([], { ref: "R5", needs: ["mud_removal"], volunteerIds: ["V1"], supplies: [], reason: "" }), /inside the property, so a structural engineer/);
  accept([], { ref: "R5", needs: ["temporary_repair", "mud_removal"], volunteerIds: ["V7", "V1"], supplies: [], reason: "" });
  const lead = accept([], { ref: "R5", needs: ["mud_removal"], volunteerIds: ["V7", "V1"], supplies: [], reason: "" });
  assert.match(lead.checks.join("; "), /V7 Helen: safety lead \(structural engineer\)/);
  assert.match(problems([], { ref: "R5", needs: ["mud_removal"], volunteerIds: ["V7"], supplies: [], reason: "" }), /no one on the team has a skill/);
  assert.match(problems([], { ref: "R1", needs: ["mud_removal"], volunteerIds: ["V1", "V7"], supplies: [], reason: "" }), /V7 Helen has none of the skills/);
});

test("help away from a hazardous property needs no professional", () => {
  const roster2: Roster = { ...roster, volunteers: [...roster.volunteers, { id: "V8", name: "Omar", area: "Sports hall", skills: ["shelter"], available: "today", capacity: 1, vehicle: false, professional: null }] };
  const v = checkAssignment(roster2, cases, [], { ref: "R7", needs: ["shelter"], volunteerIds: ["V8"], supplies: [], reason: "" });
  assert.equal(v.accepted, true);
});

test("the coordinator approves or rejects a proposal once", () => {
  const proposed = { ...accept([], mud), status: "proposed" as const };
  const approved = decideAssignment([proposed], "a", "approve", "t1");
  assert.ok("assignments" in approved);
  assert.equal(approved.assignments[0].status, "approved");
  assert.equal(approved.assignments[0].decidedAt, "t1");

  const again = decideAssignment(approved.assignments, "a", "reject", "t2", "changed my mind");
  assert.deepEqual(again, { error: "Already approved", status: 409 });
  assert.deepEqual(decideAssignment([proposed], "zz", "approve", "t"), { error: "No proposed assignment for this request in the latest matching", status: 404 });

  const rejected = decideAssignment([proposed], "a", "reject", "t3", "  Ana is needed at the shelter  ");
  assert.ok("assignments" in rejected);
  assert.equal(rejected.assignments[0].note, "Ana is needed at the shelter");
});
