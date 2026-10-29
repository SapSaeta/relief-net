"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { rememberAccessCode } from "./access-code";

const OPTIONS = [
  { value: "baseten", label: "Muse Spark Open · Baseten (open weights)" },
  { value: "meta", label: "Muse Spark 1.3 · Meta API" },
];

export function TriageControls({ defaultProvider, openWeights }: { defaultProvider: string; openWeights: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function run(form: FormData) {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": String(form.get("accessCode") ?? "") },
        body: JSON.stringify({ provider: form.get("provider") }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `Triage failed (${res.status})`);
      rememberAccessCode(String(form.get("accessCode") ?? ""));
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Triage failed");
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
        <input
          name="accessCode"
          type="password"
          placeholder="Demo access code"
          autoComplete="off"
          className="rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm sm:w-44"
        />
        <button
          type="submit"
          disabled={running}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {running ? "Triaging…" : "Run triage"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
