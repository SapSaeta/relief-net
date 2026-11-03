"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { fetchWithCode } from "@/app/access-code";

/** Approve (dispatch) or reject one proposed assignment. Needs the demo access code; no model call. */
export function DecideButtons({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function decide(action: "approve" | "reject") {
    const note = action === "reject" ? window.prompt("Why reject? (optional, goes to the audit log)") : "";
    if (note === null) return; // cancelled
    setBusy(action);
    setError(null);
    try {
      await fetchWithCode("/api/match/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, action, note }),
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => decide("approve")}
        disabled={busy !== null}
        className="rounded-md bg-green-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {busy === "approve" ? "Saving…" : "Approve & dispatch"}
      </button>
      <button
        type="button"
        onClick={() => decide("reject")}
        disabled={busy !== null}
        className="rounded-md border border-foreground/25 px-3 py-1 text-xs font-medium disabled:opacity-50"
      >
        {busy === "reject" ? "Saving…" : "Reject"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
