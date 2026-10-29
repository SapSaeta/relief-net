import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { summarizeUsage } from "@/lib/usage";

// Spend guard for routes that call paid models. Checked before the request body is read:
//   1. access code (x-access-code header) — required in production, fails closed if unset;
//   2. per-IP daily limit (in memory: per server instance, a speed bump, not a wall);
//   3. global spend cap from the usage ledger — the hard backstop.

const ACCESS_CODE = process.env.DEMO_ACCESS_CODE ?? "";
const SPEND_CAP_USD = Number(process.env.SPEND_CAP_USD ?? 25);
const MAX_CALLS_PER_IP_PER_DAY = Number(process.env.MAX_CALLS_PER_IP_PER_DAY ?? 20);
const DAY_MS = 24 * 3600 * 1000;

/** Worst-case cost of one call per route, so the cap holds before the call is made. */
export const COST_ESTIMATE_USD = { intake: 0.3, message: 0.06, request: 0.06, triage: 0.15, health: 0.01 } as const;

const callsByIp = new Map<string, number[]>();

const digest = (s: string) => createHash("sha256").update(s).digest();
const sameCode = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
}

const deny = (status: number, error: string) => Response.json({ error }, { status });

/** Returns a response to send instead of running the paid call, or null to proceed. */
export async function guardPaidCall(request: Request, estimateUsd: number): Promise<Response | null> {
  if (!ACCESS_CODE) {
    if (process.env.NODE_ENV === "production") return deny(503, "Demo access is not configured");
  } else if (!sameCode(request.headers.get("x-access-code") ?? "", ACCESS_CODE)) {
    return deny(401, "Missing or wrong access code");
  }

  const ip = clientIp(request);
  const now = Date.now();
  const recent = (callsByIp.get(ip) ?? []).filter((t) => now - t < DAY_MS);
  if (recent.length >= MAX_CALLS_PER_IP_PER_DAY) return deny(429, "Daily demo limit reached for this network");

  const { costUsd } = await summarizeUsage();
  if (costUsd + estimateUsd > SPEND_CAP_USD) return deny(503, "Demo spend cap reached");

  callsByIp.set(ip, [...recent, now]);
  return null;
}
