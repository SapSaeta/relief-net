"use client";

// The demo access code typed once in the dashboard, kept for this tab only.
// Session storage can be unavailable (private mode, blocked storage): then it is simply not remembered.

const KEY = "relief-net-access-code";

export function rememberAccessCode(code: string) {
  try {
    sessionStorage.setItem(KEY, code);
  } catch {}
}

export function recallAccessCode(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
