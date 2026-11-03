"use client";

import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { useEffect, useState } from "react";

import { accessCode, AccessCodeError, fetchWithCode, rememberAccessCode } from "@/app/access-code";

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

/** Production uploads the video to Vercel Blob first (request bodies there are capped at ~4.5 MB);
 *  local development posts it to /api/intake as multipart. */
async function sendVideo(form: FormData, mode: "blob" | "multipart"): Promise<Response> {
  if (mode === "multipart") return fetchWithCode("/api/intake", { method: "POST", body: form });

  const code = accessCode();
  if (code === null) throw new AccessCodeError("Sending a report needs the demo access code.");
  const video = form.get("video") as File;
  const extension = video.type === "video/quicktime" ? "mov" : "mp4";
  // The Blob client hides the server's answer ("Failed to retrieve the client token"); the usual cause is the code.
  const blob = await upload(`intake/walkthrough.${extension}`, video, {
    access: "private",
    contentType: video.type,
    handleUploadUrl: "/api/intake/upload",
    headers: { "x-access-code": code },
    multipart: video.size > 20 * 1024 * 1024,
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (!/client token/i.test(message)) throw new Error(message || "Upload failed");
    rememberAccessCode("");
    throw new AccessCodeError("Upload not authorized: check the demo access code and try again.");
  });
  return fetchWithCode("/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobPathname: blob.pathname, location: form.get("location") }),
  });
}

const VIDEO_STEPS = [
  "Upload the video",
  "Transcribe what you say (Muse Voice Transcribe)",
  "Mark the damage on key frames (SAM 3.1)",
  "Draft the help request (Muse Spark)",
  "Check every quote and frame it cites",
];
const MESSAGE_STEPS = ["Draft the help request (Muse Spark)", "Check every quote it cites"];

const inputClass = "w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm";
const buttonClass = "rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50";

/** The two ways to ask for help, as tabs: a narrated video walkthrough, or a typed message. */
export function IntakeTabs({ uploadMode = "multipart" }: { uploadMode?: "blob" | "multipart" }) {
  const [tab, setTab] = useState<"video" | "message">("video");
  const [state, setState] = useState<State>({ status: "idle" });
  const running = state.status === "running";

  async function submit(form: FormData) {
    setState({ status: "running", startedAt: Date.now() });
    try {
      const res =
        tab === "video"
          ? await sendVideo(form, uploadMode)
          : await fetchWithCode("/api/intake/message", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: form.get("message"), location: form.get("location") }),
            });
      setState({ status: "done", intake: await res.json() });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Sending failed" });
    }
  }

  if (state.status === "done") return <Submitted intake={state.intake} onAnother={() => setState({ status: "idle" })} />;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-1 rounded-lg bg-foreground/5 p-1 text-sm sm:w-fit">
        {(
          [
            ["video", "🎥 Record a video"],
            ["message", "💬 Type a message"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            disabled={running}
            onClick={() => setTab(value)}
            className="flex-1 rounded-md px-4 py-2 font-medium text-foreground/60 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm sm:flex-none"
          >
            {label}
          </button>
        ))}
      </div>

      <form action={submit} className="flex flex-col gap-5 rounded-xl border border-foreground/15 p-5">
        {tab === "video" ? <VideoFields disabled={running} /> : <MessageFields disabled={running} />}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Address or area</span>
          <input name="location" disabled={running} placeholder="e.g. 4 Mill Lane, Riverside" className={inputClass} />
          <span className="text-xs text-foreground/50">Helps the coordinator spot two reports about the same home.</span>
        </label>
        <button type="submit" disabled={running} className={buttonClass}>
          {running ? "Working…" : tab === "video" ? "Send video for analysis" : "Send message"}
        </button>
        {state.status === "running" && <Progress steps={tab === "video" ? VIDEO_STEPS : MESSAGE_STEPS} startedAt={state.startedAt} />}
        {state.status === "error" && (
          <p role="alert" className="rounded-lg border border-red-600/40 bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}

function VideoFields({ disabled }: { disabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <label
        className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm ${
          file ? "border-green-600/50 bg-green-600/5" : "border-foreground/20 hover:border-foreground/40"
        }`}
      >
        <input
          name="video"
          type="file"
          accept="video/mp4,video/quicktime"
          capture="environment"
          required
          disabled={disabled}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        {file ? (
          <>
            <span className="text-2xl">✓</span>
            <span className="font-medium break-all">{file.name}</span>
            <span className="text-xs text-foreground/60">{(file.size / 1024 / 1024).toFixed(1)} MB · click to change</span>
          </>
        ) : (
          <>
            <span className="text-2xl">🎥</span>
            <span className="font-medium">Record or choose a video</span>
            <span className="text-xs text-foreground/60">MP4 or MOV, up to 200 MB</span>
          </>
        )}
      </label>
      <div className="flex flex-col gap-2 text-sm">
        <p className="font-medium">For a useful walkthrough</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-foreground/70">
          <li>Walk room by room, 30 to 90 seconds.</li>
          <li>Say what happened, who lives there (children, older or disabled people) and what help you need.</li>
          <li>Point the camera at each damaged thing while you name it.</li>
          <li>If a room may be unsafe, film from the doorway. Do not go in.</li>
        </ul>
      </div>
    </div>
  );
}

function MessageFields({ disabled }: { disabled: boolean }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">What happened, who lives there and what help you need</span>
      <textarea
        name="message"
        required
        disabled={disabled}
        rows={5}
        maxLength={2000}
        placeholder="e.g. Water came into the ground floor last night. My mother (82) lives alone and cannot use the stairs. We have no power and need help drying the house."
        className={inputClass}
      />
      <span className="text-xs text-foreground/50">No video needed: for when there is no data, no battery or it is not safe to film.</span>
    </label>
  );
}

/** What the pipeline does, with the time elapsed. The server answers once at the end, so steps are listed, not tracked. */
function Progress({ steps, startedAt }: { steps: string[]; startedAt: number }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div aria-live="polite" className="flex flex-col gap-2 rounded-lg bg-foreground/5 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <span className="size-3 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
        Working on it · {Math.round((now - startedAt) / 1000)} s
        <span className="font-normal text-foreground/50">(usually under a minute)</span>
      </p>
      <ol className="flex list-decimal flex-col gap-0.5 pl-9 text-foreground/70">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

function Submitted({ intake, onAnother }: { intake: IntakeCase; onAnother: () => void }) {
  const urgent = intake.request?.safety_flags.some((f) => f.flag === "call_112_now");
  return (
    <div className="flex flex-col gap-6">
      <div className={`flex flex-col gap-3 rounded-xl border p-5 ${urgent ? "border-red-600 bg-red-600/10" : "border-green-600/50 bg-green-600/5"}`}>
        {urgent && (
          <p className="text-lg font-semibold text-red-700 dark:text-red-300">
            This sounds life-threatening: call 112 now. Volunteers are not sent to emergencies.
          </p>
        )}
        <p className="font-medium">
          {intake.request ? "✓ Your help request is in the coordinator's queue." : "Your report was saved, but the help request could not be drafted."}
        </p>
        <p className="text-sm text-foreground/70">
          A person reviews it before anyone is sent. Below is what we understood: check it, and add anything missing in a new
          message.
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/cases/${intake.id}`} className="rounded-md bg-foreground px-4 py-2 font-medium text-background">
            Open your case
          </Link>
          <button type="button" onClick={onAnother} className="rounded-md border border-foreground/20 px-4 py-2 font-medium">
            Send another report
          </button>
        </div>
      </div>
      <IntakeResult intake={intake} />
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
          {intake.location ? `📍 ${intake.location} · ` : ""}
          {intake.source === "message" ? "typed message" : `${intake.durationSec.toFixed(1)} s video`} · ${intake.costUsd.toFixed(3)} · {intake.usage.length} model calls ·{" "}
          {Object.entries(intake.timingsMs)
            .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} s`)
            .join(" · ")}
        </span>
      </section>

      {intake.request ? (
        <HelpRequestCard request={intake.request} />
      ) : (
        <p className="rounded-xl border border-orange-500/50 p-5 text-sm">
          The help request could not be drafted ({intake.requestError ?? "unknown error"}). The transcript and damage evidence below were
          saved.
        </p>
      )}

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

      <section className="rounded-xl border border-foreground/15 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/50">
          {intake.source === "message" ? "Message" : "Transcript"}
        </h2>
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
