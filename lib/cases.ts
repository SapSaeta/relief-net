import "server-only";

import type { HelpRequest } from "@/lib/request";
import type { GroundedProposal } from "@/lib/scout";
import type { SegmentedFrame } from "@/lib/segment";
import type { Transcript } from "@/lib/transcribe";
import { store } from "@/lib/store";
import type { UsageEntry } from "@/lib/usage";

// Cases live in the store (lib/store): .data/cases locally, Redis in production.

const CASES = "cases";

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
};

const isCaseId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export async function saveCase(intake: IntakeCase): Promise<void> {
  await store().putDoc(CASES, intake.id, intake);
}

export async function loadCase(id: string): Promise<IntakeCase | null> {
  if (!isCaseId(id)) return null;
  return store().getDoc<IntakeCase>(CASES, id);
}

/** All stored cases, newest first. */
export async function listCases(): Promise<IntakeCase[]> {
  const cases = await store().listDocs<IntakeCase>(CASES);
  return cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
