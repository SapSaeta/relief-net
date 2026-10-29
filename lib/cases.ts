import "server-only";

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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

/** All stored cases, newest first. */
export async function listCases(): Promise<IntakeCase[]> {
  let names: string[] = [];
  try {
    names = (await readdir(CASES_DIR)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const cases = await Promise.all(names.map((n) => loadCase(n.slice(0, -".json".length))));
  return cases.filter((c): c is IntakeCase => c !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
