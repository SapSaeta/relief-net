"use client";

import { useSyncExternalStore } from "react";

// The demo access code, typed once (header button or the first action that needs it) and kept for this tab only.
// Session storage can be unavailable (private mode, blocked storage): then it is simply asked again.
// The layout marks <html data-code-required> in review mode; without it (local development) no code is asked.

const KEY = "relief-net-access-code";
const EVENT = "relief-net-access-code";

const codeRequired = () => typeof document !== "undefined" && document.documentElement.dataset.codeRequired === "true";

export function recallAccessCode(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberAccessCode(code: string) {
  try {
    if (code) sessionStorage.setItem(KEY, code);
    else sessionStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Asks for the code; returns null if the person cancels. */
export function askAccessCode(): string | null {
  const code = window.prompt("Demo access code (given to judges with the submission)");
  if (code === null) return null;
  rememberAccessCode(code.trim());
  return code.trim();
}

/** The remembered code, asking once if it is needed and missing; null if the person cancels. */
export function accessCode(): string | null {
  if (!codeRequired()) return recallAccessCode();
  return recallAccessCode() || askAccessCode();
}

export class AccessCodeError extends Error {}

/** fetch with the code attached. A 401 forgets the code so the next try asks again; other errors carry the server's message. */
export async function fetchWithCode(url: string, init: RequestInit = {}): Promise<Response> {
  const code = accessCode();
  if (code === null) throw new AccessCodeError("This action needs the demo access code.");
  const res = await fetch(url, { ...init, headers: { ...init.headers, "x-access-code": code } });
  if (res.status === 401) {
    rememberAccessCode("");
    throw new AccessCodeError("The demo access code was not accepted. Try again to enter it.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Whether a code is remembered in this tab (false while prerendering). */
export const useHasAccessCode = () => useSyncExternalStore(subscribe, () => recallAccessCode() !== "", () => false);
