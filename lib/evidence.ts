// Deterministic evidence checks for model output. Pure: no I/O, no framework imports.

export type Evidence = {
  kind: "transcript" | "frame";
  quote: string | null;
  frame_index: number | null;
  damage_label: string | null;
};
export type CheckedEvidence = Evidence & { verified: boolean; check: string };

type CheckableFrame = { index: number; detections: { concept: string }[] };

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** A quote must appear verbatim (ignoring case and punctuation) in the transcript; a frame
 *  citation must name a damage label that SAM actually detected in that frame. */
export function checkEvidence(items: Evidence[], transcript: { text: string }, frames: CheckableFrame[]): CheckedEvidence[] {
  const spoken = normalize(transcript.text);
  return items.map((e) => {
    if (e.kind === "transcript") {
      const ok = !!e.quote && normalize(e.quote).length > 0 && spoken.includes(normalize(e.quote));
      return { ...e, verified: ok, check: ok ? "quote found in transcript" : "quote not found in transcript" };
    }
    const frame = frames.find((f) => f.index === e.frame_index);
    if (!frame) return { ...e, verified: false, check: `frame ${e.frame_index} does not exist` };
    const label = normalize(e.damage_label ?? "");
    const ok = !!label && frame.detections.some((d) => normalize(d.concept) === label);
    return {
      ...e,
      verified: ok,
      check: ok ? `SAM detected ${e.damage_label} in frame ${frame.index}` : `SAM did not detect "${e.damage_label}" in frame ${frame.index}`,
    };
  });
}
