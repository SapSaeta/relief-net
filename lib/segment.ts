import "server-only";

import { decodeMaskToRaster, decodeMaskToSVGPath, parseImageStream, recordsOfKind } from "@meta-sam/parser";

import type { Frame } from "@/lib/media";
import { meta, models } from "@/lib/meta";
import { UNIT_PRICES } from "@/lib/pricing";
import type { UsageLedger } from "@/lib/usage";

// SAM 3.1 damage segmentation on key frames. SAM takes one concept per request,
// so every (frame, concept) pair is its own call, with bounded concurrency.

// `prompt` is the noun phrase SAM responds to best: it segments objects well and
// textures poorly (e.g. "mold" finds nothing on a moldy wall, "black spots" does).
export type Concept = { label: string; prompt: string };

export const DAMAGE_CONCEPTS: Concept[] = [
  { label: "crack", prompt: "crack" },
  { label: "mud", prompt: "mud" },
  { label: "debris", prompt: "debris" },
  { label: "broken window", prompt: "broken window" },
  { label: "mold", prompt: "black spots" },
];

const CONCURRENCY = 6;
/** Drop specks: SAM splits loose material such as debris into dozens of tiny pieces. */
const MIN_AREA_PCT = 0.2;

export type Detection = {
  concept: string;
  objectId: string;
  box: { left: number; top: number; right: number; bottom: number };
  confidence?: number;
  /** Share of the frame covered by the mask, 0–100. */
  areaPct: number;
  /** SVG path in mask-raster coordinates; place it with `box` and `maskSize`. */
  maskPath: string;
  maskSize: { width: number; height: number };
};

export type SegmentedFrame = { index: number; timeSec: number; width: number; height: number; detections: Detection[] };

async function segmentOne(frame: Frame, concept: Concept, ledger: UsageLedger): Promise<Detection[]> {
  const started = Date.now();
  const stream = await meta().responses.create({
    model: models.segment,
    stream: true,
    metadata: { include_confidence: "true" },
    input: [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: concept.prompt },
          { type: "input_image", image_url: `data:image/jpeg;base64,${frame.jpeg.toString("base64")}`, detail: "auto" },
        ],
      },
    ],
  });
  const result = await parseImageStream(stream).finalResult;
  ledger.add({
    provider: "meta",
    model: models.segment,
    operation: "segment",
    latencyMs: Date.now() - started,
    units: { images: 1 },
    costUsd: UNIT_PRICES.samImage,
  });
  const { width, height } = frame;

  const boxes = new Map(recordsOfKind(result.records, "box").map((b) => [b.objectId, b]));
  const detections = recordsOfKind(result.records, "mask").map((m): Detection => {
    const raster = decodeMaskToRaster(m.mask);
    let on = 0;
    for (const px of raster) on += px;
    // The raster may be smaller than its box: scale its coverage to source pixels.
    const boxArea = (m.bounds.right - m.bounds.left) * (m.bounds.bottom - m.bounds.top);
    const covered = (on / raster.length) * boxArea;
    return {
      concept: concept.label,
      objectId: m.objectId,
      box: { ...m.bounds },
      confidence: m.confidence ?? boxes.get(m.objectId)?.confidence,
      areaPct: Math.round((covered / (width * height)) * 1000) / 10,
      maskPath: decodeMaskToSVGPath(m.mask),
      maskSize: { width: m.mask.width, height: m.mask.height },
    };
  });
  return detections.filter((d) => d.areaPct >= MIN_AREA_PCT);
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

export async function segmentFrames(frames: Frame[], concepts: Concept[], ledger: UsageLedger): Promise<SegmentedFrame[]> {
  const jobs = frames.flatMap((frame) => concepts.map((concept) => ({ frame, concept })));
  const results = await pool(jobs, CONCURRENCY, ({ frame, concept }) => segmentOne(frame, concept, ledger));

  return frames.map(({ index, timeSec, width, height }) => ({
    index,
    timeSec,
    width,
    height,
    detections: results.filter((_, i) => jobs[i].frame.index === index).flat(),
  }));
}
