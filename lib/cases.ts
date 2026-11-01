import "server-only";

import type { HelpRequest } from "@/lib/request";
import type { GroundedProposal } from "@/lib/scout";
import type { SegmentedFrame } from "@/lib/segment";
import type { Transcript } from "@/lib/transcribe";
import { store } from "@/lib/store";
import type { UsageEntry } from "@/lib/usage";

// Cases live in the store (lib/store): .data/cases locally, Redis in production.
// Key-frame images (about 2 MB per video case) are kept in a separate document, so listing cases
// for the dashboard, triage and matching stays small; only the case page loads them.

const CASES = "cases";
const FRAME_IMAGES = "case-frames";

export type IntakeCase = {
  id: string;
  createdAt: string;
  /** How the request arrived; older cases without it are videos. */
  source?: "video" | "message";
  /** Address or area given by the person (free text, synthetic in this project). */
  location?: string;
  /** Meta Files API id of the video; empty for messages. */
  fileId: string;
  durationSec: number;
  transcript: Transcript;
  frames: (SegmentedFrame & { image: string })[];
  /** Extra damage Muse Spark proposed and SAM tried to ground (absent on older cases). */
  proposals?: GroundedProposal[];
  request: HelpRequest | null;
  requestError?: string;
  timingsMs: Record<string, number>;
  usage: UsageEntry[];
  costUsd: number;
  /** Frame images are in the case-frames collection; `frames[].image` is empty in the case document. */
  framesStoredApart?: boolean;
};

const isCaseId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export async function saveCase(intake: IntakeCase): Promise<void> {
  const { frames, ...rest } = intake;
  if (frames.length) await store().putDoc(FRAME_IMAGES, intake.id, { images: frames.map((f) => f.image) });
  await store().putDoc(CASES, intake.id, { ...rest, frames: frames.map((f) => ({ ...f, image: "" })), framesStoredApart: true });
}

/** A case with its frame images, for the case page. */
export async function loadCase(id: string): Promise<IntakeCase | null> {
  if (!isCaseId(id)) return null;
  const intake = await store().getDoc<IntakeCase>(CASES, id);
  if (!intake?.framesStoredApart || !intake.frames.length) return intake;
  const images = (await store().getDoc<{ images: string[] }>(FRAME_IMAGES, id))?.images ?? [];
  return { ...intake, frames: intake.frames.map((f, i) => ({ ...f, image: images[i] ?? "" })) };
}

/** All stored cases without frame images, newest first. */
export async function listCases(): Promise<IntakeCase[]> {
  const cases = await store().listDocs<IntakeCase>(CASES);
  return cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
