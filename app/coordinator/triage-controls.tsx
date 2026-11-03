"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { fetchWithCode } from "@/app/access-code";

const OPTIONS = [
  { value: "baseten", label: "Muse Spark Open · Baseten (open weights)" },
  { value: "meta", label: "Muse Spark 1.3 · Meta API" },
];

/** Runs a coordinator model call (triage or matching) on the chosen provider, then refreshes the page. */
export function TriageControls({
  defaultProvider,
  openWeights,
  endpoint = "/api/triage",
  label = "Run triage",
  runningLabel = "Triaging…",
}: {
  defaultProvider: string;
  openWeights: boolean;
  endpoint?: string;
  label?: string;
  runningLabel?: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function run(form: FormData) {
    setRunning(true);
    setError(null);
    try {
      await fetchWithCode(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: form.get("provider") }),
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <form action={run} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="provider"
          defaultValue={defaultProvider}
          className="rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.value === "baseten" && !openWeights ? " (not configured: runs on Meta)" : ""}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={running}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {running ? runningLabel : label}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
