import "server-only";

import type { Frame } from "@/lib/media";
import { meta, models } from "@/lib/meta";
import { DAMAGE_CONCEPTS, type Concept, type SegmentJob, type SegmentResult } from "@/lib/segment";
import type { UsageLedger } from "@/lib/usage";

// Agentic grounding: Muse Spark watches the walkthrough and proposes damage that the
// fixed SAM concepts do not cover, as SAM-friendly noun phrases on specific frames.
// SAM then grounds each proposal; proposals SAM cannot find are reported, not trusted.

const MAX_PROPOSALS = 4;

const SCOUT_SCHEMA = {
  type: "object",
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "Short damage name for people, e.g. 'collapsed ceiling'." },
          sam_prompt: { type: "string", description: "1–3 word noun phrase naming a visible object or region." },
          frame_indices: { type: "array", items: { type: "integer" } },
          reason: { type: "string" },
        },
        required: ["label", "sam_prompt", "frame_indices", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["proposals"],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = `You help locate disaster damage in a home walkthrough video for a segmentation model (SAM 3.1).

The following damage is already being searched for on every key frame: ${DAMAGE_CONCEPTS.map((c) => c.label).join(", ")}.
Propose up to ${MAX_PROPOSALS} OTHER kinds of visible damage or hazards that matter for relief work
(e.g. fallen tree, collapsed ceiling, exposed wiring, damaged roof, water puddle, damaged furniture). Propose nothing if there is none.

SAM prompt rules (it fails otherwise):
- A short noun phrase (1–3 words) naming a visible thing: "fallen tree", "exposed wire", "water puddle".
- No commands, questions, lists, negations or spatial phrases.
- SAM finds objects well and textures poorly: name the visible thing (e.g. "black spots", not "mold").

The images are the numbered key frames SAM will see. For each proposal list the frame numbers where it is clearly visible.`;

export type Proposal = Concept & { frameIndices: number[]; reason: string };
export type GroundedProposal = Proposal & { grounded: boolean; detections: number };

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Spark sees the exact key frames SAM will segment (not the video), so its frame
// numbers line up; with the video alone it misplaced objects by a frame or two.
export async function proposeConcepts(input: { frames: Frame[] }, ledger: UsageLedger): Promise<Proposal[]> {
  const started = Date.now();
  const response = await meta().responses.create({
    model: models.text,
    instructions: INSTRUCTIONS,
    max_output_tokens: 4000,
    reasoning: { effort: "low" },
    text: { format: { type: "json_schema", name: "damage_proposals", strict: true, schema: SCOUT_SCHEMA } },
    input: [
      {
        type: "message",
        role: "user",
        content: input.frames.flatMap((f) => [
          { type: "input_text" as const, text: `Frame ${f.index}:` },
          { type: "input_image" as const, image_url: `data:image/jpeg;base64,${f.jpeg.toString("base64")}`, detail: "auto" as const },
        ]),
      },
    ],
  });
  ledger.addTokens("meta", models.text, "scout", Date.now() - started, response.usage);
  if (response.status === "incomplete") return [];

  const { proposals } = JSON.parse(response.output_text) as {
    proposals: { label: string; sam_prompt: string; frame_indices: number[]; reason: string }[];
  };
  const known = new Set(DAMAGE_CONCEPTS.flatMap((c) => [normalize(c.label), normalize(c.prompt)]));
  const validFrames = new Set(input.frames.map((f) => f.index));

  return proposals
    .filter((p) => !known.has(normalize(p.label)) && !known.has(normalize(p.sam_prompt)))
    .map((p) => ({
      label: p.label.toLowerCase(),
      prompt: p.sam_prompt.toLowerCase(),
      source: "proposed" as const,
      frameIndices: [...new Set(p.frame_indices)].filter((i) => validFrames.has(i)),
      reason: p.reason,
    }))
    .filter((p) => p.frameIndices.length > 0)
    .slice(0, MAX_PROPOSALS);
}

/** SAM jobs only on the frames Spark pointed at. */
export const proposalJobs = (frames: Frame[], proposals: Proposal[]): SegmentJob[] =>
  proposals.flatMap((p) =>
    p.frameIndices.map((i) => ({ frame: frames.find((f) => f.index === i)!, concept: { label: p.label, prompt: p.prompt, source: "proposed" as const } })),
  );

export function groundProposals(proposals: Proposal[], results: SegmentResult[]): GroundedProposal[] {
  return proposals.map((p) => {
    const detections = results.filter((r) => r.concept.label === p.label).reduce((n, r) => n + r.detections.length, 0);
    return { ...p, grounded: detections > 0, detections };
  });
}
