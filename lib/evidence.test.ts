import assert from "node:assert/strict";
import { test } from "node:test";

import { checkEvidence, type Evidence } from "./evidence.ts";

const transcript = { text: "The living room is full of mud and debris. Two adults and one child live here." };
const frames = [
  { index: 0, detections: [{ concept: "crack" }] },
  { index: 2, detections: [{ concept: "mud" }, { concept: "debris" }] },
];

const quote = (q: string): Evidence => ({ kind: "transcript", quote: q, frame_index: null, damage_label: null });
const frame = (i: number, label: string | null): Evidence => ({ kind: "frame", quote: null, frame_index: i, damage_label: label });

test("accepts a quote that appears in the transcript, ignoring case and punctuation", () => {
  const [result] = checkEvidence([quote("two adults, and one CHILD live here")], transcript, frames);
  assert.equal(result.verified, true);
});

test("rejects an invented quote", () => {
  const [result] = checkEvidence([quote("There is a gas leak in the kitchen.")], transcript, frames);
  assert.equal(result.verified, false);
  assert.match(result.check, /not found/);
});

test("rejects an empty quote", () => {
  const [result] = checkEvidence([quote("  ...  ")], transcript, frames);
  assert.equal(result.verified, false);
});

test("accepts damage that SAM detected in the cited frame", () => {
  const [result] = checkEvidence([frame(2, "Mud")], transcript, frames);
  assert.equal(result.verified, true);
});

test("rejects damage that SAM did not detect in the cited frame", () => {
  const [result] = checkEvidence([frame(0, "mud")], transcript, frames);
  assert.equal(result.verified, false);
  assert.match(result.check, /did not detect/);
});

test("rejects a frame that does not exist", () => {
  const [result] = checkEvidence([frame(7, "crack")], transcript, frames);
  assert.equal(result.verified, false);
  assert.match(result.check, /does not exist/);
});

test("rejects a frame citation without a damage label", () => {
  const [result] = checkEvidence([frame(2, null)], transcript, frames);
  assert.equal(result.verified, false);
});
