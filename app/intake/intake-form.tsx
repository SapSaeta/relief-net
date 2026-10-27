"use client";

import { useState } from "react";

import type { IntakeCase } from "@/lib/cases";

import { HelpRequestCard } from "./help-request-card";

const COLORS: Record<string, string> = {
  crack: "#e5484d",
  mud: "#a16207",
  debris: "#f59e0b",
  "broken window": "#3b82f6",
  mold: "#22c55e",
};
// Concepts proposed by Muse Spark get colors from a separate palette.
const PROPOSED_PALETTE = ["#a855f7", "#ec4899", "#14b8a6", "#64748b"];

function colorFor(concept: string, proposed: string[]): string {
  return COLORS[concept] ?? PROPOSED_PALETTE[Math.max(0, proposed.indexOf(concept)) % PROPOSED_PALETTE.length];
}

type State = { status: "idle" } | { status: "running"; startedAt: number } | { status: "done"; intake: IntakeCase } | { status: "error"; message: string };

export function IntakeForm() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function submit(form: FormData) {
    setState({ status: "running", startedAt: Date.now() });
    try {
      const res = await fetch("/api/intake", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setState({ status: "done", intake: json });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Upload failed" });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={submit} className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-5 sm:flex-row sm:items-center">
        <input
          name="video"
          type="file"
          accept="video/mp4,video/quicktime"
          capture="environment"
          required
          className="flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-foreground/10 file:px-3 file:py-2"
        />
        <button
          type="submit"
          disabled={state.status === "running"}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {state.status === "running" ? "Analyzing…" : "Analyze walkthrough"}
        </button>
      </form>

      {state.status === "running" && (
        <p className="text-sm text-foreground/60">Uploading, transcribing, segmenting damage and drafting the help request. This takes under a minute.</p>
      )}
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      {state.status === "done" && <IntakeResult intake={state.intake} />}
    </div>
  );
}

export function IntakeResult({ intake }: { intake: IntakeCase }) {
  const proposed = (intake.proposals ?? []).map((p) => p.label);
  const color = (concept: string) => colorFor(concept, proposed);
  const totals = new Map<string, number>();
  for (const frame of intake.frames) for (const d of frame.detections) totals.set(d.concept, (totals.get(d.concept) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap gap-2 text-xs">
        {[...totals].map(([concept, count]) => (
          <span key={concept} className="flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1">
            <span className="size-2.5 rounded-full" style={{ background: color(concept) }} />
            {concept} · {count}
          </span>
        ))}
        <span className="ml-auto text-foreground/50">
          {intake.durationSec.toFixed(1)} s video · ${intake.costUsd.toFixed(3)} · {intake.usage.length} model calls ·{" "}
          {Object.entries(intake.timingsMs)
            .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s`)
            .join(" · ")}
        </span>
      </section>

      {intake.proposals && intake.proposals.length > 0 && (
        <section className="rounded-xl border border-foreground/15 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Extra damage proposed by Muse Spark</h2>
          <p className="mt-1 text-xs text-foreground/60">
            Spark looked at the key frames and suggested what else to search for; SAM 3.1 then tried to locate it. Proposals SAM could
            not find are not used as evidence.
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {intake.proposals.map((p) => (
              <li key={p.label} className="flex flex-wrap items-baseline gap-2">
                <span className={p.grounded ? "text-green-700 dark:text-green-400" : "text-foreground/40"}>
                  {p.grounded ? "✓ found" : "✗ not found"}
                </span>
                <span className="size-2.5 self-center rounded-full" style={{ background: color(p.label) }} />
                <span className="font-medium">{p.label}</span>
                <span className="text-xs text-foreground/50">
                  SAM prompt “{p.prompt}” · frames {p.frameIndices.join(", ")}
                  {p.grounded ? ` · ${p.detections} region${p.detections === 1 ? "" : "s"}` : ""}
                </span>
                <span className="w-full pl-[4.5rem] text-xs text-foreground/60">{p.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {intake.request ? (
        <HelpRequestCard request={intake.request} />
      ) : (
        <p className="rounded-xl border border-orange-500/50 p-5 text-sm">
          The help request could not be drafted ({intake.requestError ?? "unknown error"}). The transcript and damage evidence below were
          saved.
        </p>
      )}

      <section className="rounded-xl border border-foreground/15 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/50">Transcript</h2>
        <p className="leading-relaxed">{intake.transcript.text}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {intake.frames.map((frame) => (
          <figure key={frame.index} id={`frame-${frame.index}`} className="scroll-mt-4 overflow-hidden rounded-xl border border-foreground/15">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL frame */}
              <img src={frame.image} alt={`Frame at ${frame.timeSec} s`} className="block w-full" />
              <svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="absolute inset-0 size-full">
                {frame.detections.map((d) => (
                  <g key={`${d.concept}-${d.objectId}`}>
                    <path
                      d={d.maskPath}
                      fillRule="evenodd"
                      fill={color(d.concept)}
                      fillOpacity={0.45}
                      transform={`translate(${d.box.left} ${d.box.top}) scale(${(d.box.right - d.box.left) / d.maskSize.width} ${(d.box.bottom - d.box.top) / d.maskSize.height})`}
                    />
                    <rect
                      x={d.box.left}
                      y={d.box.top}
                      width={d.box.right - d.box.left}
                      height={d.box.bottom - d.box.top}
                      fill="none"
                      stroke={color(d.concept)}
                      strokeWidth={2}
                    />
                  </g>
                ))}
              </svg>
            </div>
            <figcaption className="px-3 py-2 text-xs text-foreground/60">
              Frame {frame.index} · {frame.timeSec.toFixed(1)} s ·{" "}
              {frame.detections.length
                ? [...new Set(frame.detections.map((d) => d.concept))].join(", ")
                : "no damage detected"}
            </figcaption>
          </figure>
        ))}
      </section>
    </div>
  );
}
