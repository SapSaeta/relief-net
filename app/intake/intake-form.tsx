"use client";

import { useState } from "react";

import type { IntakeCase } from "@/lib/cases";

const COLORS: Record<string, string> = {
  crack: "#e5484d",
  mud: "#a16207",
  debris: "#f59e0b",
  "broken window": "#3b82f6",
  mold: "#22c55e",
};

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
        <p className="text-sm text-foreground/60">Uploading, transcribing and segmenting damage. This takes about 15 seconds.</p>
      )}
      {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}
      {state.status === "done" && <IntakeResult intake={state.intake} />}
    </div>
  );
}

function IntakeResult({ intake }: { intake: IntakeCase }) {
  const totals = new Map<string, number>();
  for (const frame of intake.frames) for (const d of frame.detections) totals.set(d.concept, (totals.get(d.concept) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap gap-2 text-xs">
        {[...totals].map(([concept, count]) => (
          <span key={concept} className="flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1">
            <span className="size-2.5 rounded-full" style={{ background: COLORS[concept] }} />
            {concept} · {count}
          </span>
        ))}
        <span className="ml-auto text-foreground/50">
          {intake.durationSec.toFixed(1)} s video · {intake.fileId} ·{" "}
          {Object.entries(intake.timingsMs)
            .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s`)
            .join(" · ")}
        </span>
      </section>

      <section className="rounded-xl border border-foreground/15 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/50">Transcript</h2>
        <p className="leading-relaxed">{intake.transcript.text}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {intake.frames.map((frame) => (
          <figure key={frame.index} className="overflow-hidden rounded-xl border border-foreground/15">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL frame */}
              <img src={frame.image} alt={`Frame at ${frame.timeSec} s`} className="block w-full" />
              <svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="absolute inset-0 size-full">
                {frame.detections.map((d) => (
                  <g key={`${d.concept}-${d.objectId}`}>
                    <path
                      d={d.maskPath}
                      fillRule="evenodd"
                      fill={COLORS[d.concept]}
                      fillOpacity={0.45}
                      transform={`translate(${d.box.left} ${d.box.top}) scale(${(d.box.right - d.box.left) / d.maskSize.width} ${(d.box.bottom - d.box.top) / d.maskSize.height})`}
                    />
                    <rect
                      x={d.box.left}
                      y={d.box.top}
                      width={d.box.right - d.box.left}
                      height={d.box.bottom - d.box.top}
                      fill="none"
                      stroke={COLORS[d.concept]}
                      strokeWidth={2}
                    />
                  </g>
                ))}
              </svg>
            </div>
            <figcaption className="px-3 py-2 text-xs text-foreground/60">
              {frame.timeSec.toFixed(1)} s ·{" "}
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
