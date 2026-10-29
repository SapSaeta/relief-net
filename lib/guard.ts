import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { store } from "@/lib/store";
import { SPENT_COUNTER, toMicroUsd } from "@/lib/usage";

// Spend guard for routes that call paid models. Checked before the request body is read:
//   1. access code (x-access-code header) — required in production, fails closed if unset;
//   2. per-IP daily limit (in memory: per server instance, a speed bump, not a wall);
//   3. global spend cap — the hard backstop. Each call atomically reserves its worst-case cost in
//      the persistent store and releases it when done; the ledger adds the actual cost to the
//      spent counter. A call proceeds only if spent + all open reservations stay under the cap.

const ACCESS_CODE = process.env.DEMO_ACCESS_CODE ?? "";
const SPEND_CAP_USD = Number(process.env.SPEND_CAP_USD ?? 25);
const MAX_CALLS_PER_IP_PER_DAY = Number(process.env.MAX_CALLS_PER_IP_PER_DAY ?? 20);
const DAY_MS = 24 * 3600 * 1000;
const RESERVED_COUNTER = "spend-reserved-micro-usd";

/** Worst-case cost of one call per route, so the cap holds before the call is made. */
export const COST_ESTIMATE_USD = { intake: 0.3, message: 0.06, request: 0.06, triage: 0.15, health: 0.01 } as const;

const callsByIp = new Map<string, number[]>();

const digest = (s: string) => createHash("sha256").update(s).digest();
const sameCode = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
}

const deny = (status: number, error: string) => Response.json({ error }, { status });

/** Whether review mode applies: production without the access code means read-only. */
export const accessCodeRequired = () => Boolean(ACCESS_CODE) || process.env.NODE_ENV === "production";

/** Checks the access code only; for actions that change state without calling a model. */
export function checkAccessCode(code: string | null | undefined): Response | null {
  if (!ACCESS_CODE) return process.env.NODE_ENV === "production" ? deny(503, "Demo access is not configured") : null;
  return sameCode(code ?? "", ACCESS_CODE) ? null : deny(401, "Missing or wrong access code");
}

export type Guarded = { ok: false; response: Response } | { ok: true; release: () => Promise<void> };

/** Run the paid call only if `ok`, and always `release()` afterwards (in a finally block). */
export async function guardPaidCall(request: Request, estimateUsd: number): Promise<Guarded> {
  const denied = checkAccessCode(request.headers.get("x-access-code"));
  if (denied) return { ok: false, response: denied };

  const ip = clientIp(request);
  const now = Date.now();
  const recent = (callsByIp.get(ip) ?? []).filter((t) => now - t < DAY_MS);
  if (recent.length >= MAX_CALLS_PER_IP_PER_DAY) return { ok: false, response: deny(429, "Daily demo limit reached for this network") };

  const estimate = toMicroUsd(estimateUsd);
  const reserved = await store().incrBy(RESERVED_COUNTER, estimate);
  const spent = await store().getCounter(SPENT_COUNTER);
  if (spent + reserved > toMicroUsd(SPEND_CAP_USD)) {
    await store().incrBy(RESERVED_COUNTER, -estimate);
    return { ok: false, response: deny(503, "Demo spend cap reached") };
  }

  callsByIp.set(ip, [...recent, now]);
  let released = false;
  return {
    ok: true,
    release: async () => {
      if (released) return;
      released = true;
      await store().incrBy(RESERVED_COUNTER, -estimate);
    },
  };
}

/** Guards `run`, then releases the reservation whatever happens. */
export async function withPaidCall(request: Request, estimateUsd: number, run: () => Promise<Response>): Promise<Response> {
  const guard = await guardPaidCall(request, estimateUsd);
  if (!guard.ok) return guard.response;
  try {
    return await run();
  } finally {
    await guard.release();
  }
}
