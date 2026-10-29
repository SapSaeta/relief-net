"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recallAccessCode, rememberAccessCode } from "./access-code";

/** Confirm or undo a proposed duplicate merge. Needs the demo access code; no model call. */
export function MergeButton({ groupKey, action }: { groupKey: string; action: "confirm" | "undo" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function decide() {
    const code = recallAccessCode() || window.prompt("Demo access code") || "";
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/triage/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": code },
        body: JSON.stringify({ key: groupKey, action }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `Failed (${res.status})`);
      rememberAccessCode(code);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={decide}
        disabled={busy}
        className={`rounded-md px-3 py-1 text-xs font-medium disabled:opacity-50 ${
          action === "confirm" ? "bg-foreground text-background" : "border border-foreground/25"
        }`}
      >
        {busy ? "Saving…" : action === "confirm" ? "Confirm merge" : "Undo merge"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
