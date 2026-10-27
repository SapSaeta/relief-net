import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { HelpRequest } from "@/lib/request";
import type { GroundedProposal } from "@/lib/scout";
import type { SegmentedFrame } from "@/lib/segment";
import type { Transcript } from "@/lib/transcribe";
import type { UsageEntry } from "@/lib/usage";

// Local case store: one JSON file per case under .data/cases (git-ignored).

const CASES_DIR = join(process.cwd(), ".data", "cases");

export type IntakeCase = {
  id: string;
  createdAt: string;
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
  await mkdir(CASES_DIR, { recursive: true });
  await writeFile(join(CASES_DIR, `${intake.id}.json`), JSON.stringify(intake));
}

export async function loadCase(id: string): Promise<IntakeCase | null> {
  if (!isCaseId(id)) return null;
  try {
    return JSON.parse(await readFile(join(CASES_DIR, `${id}.json`), "utf8")) as IntakeCase;
  } catch {
    return null;
  }
}
