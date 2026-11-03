"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { fetchWithCode } from "@/app/access-code";

/** Draft (or redraft) the report, and print it. Drafting needs the demo access code (one model call). */
export function ReportActions({ caseId, hasReport }: { caseId: string; hasReport: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function draft() {
    setBusy(true);
    setError(null);
    try {
      await fetchWithCode(`/api/cases/${caseId}/report`, { method: "POST" });
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={draft}
        disabled={busy}
        className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${hasReport ? "border border-foreground/25" : "bg-foreground text-background"}`}
      >
        {busy ? "Drafting… (about 30 s)" : hasReport ? "Redraft" : "Draft report"}
      </button>
      {hasReport && (
        <button type="button" onClick={() => window.print()} className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background">
          Print or save as PDF
        </button>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
