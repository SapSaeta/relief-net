import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { Badge } from "@/app/intake/help-request-card";
import { listCases, type IntakeCase } from "@/lib/cases";
import { defaultProvider, openWeightsConfigured, PROVIDER_LABELS } from "@/lib/llm";
import { loadTriage, type TriageRun } from "@/lib/triage";
import { TIER_LABELS, type DuplicateGroup, type QueueItem } from "@/lib/triage-rules";

import { TriageControls } from "./triage-controls";

export const metadata = { title: "Coordinator · relief-net" };

export default function CoordinatorPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Coordinator</h1>
        <p className="text-foreground/70">
          Muse Spark proposes duplicates and an order with reasons. Code accepts a duplicate only when each request is backed by
          its own words, and keeps safety tiers in place: 112 first, then critical, high, medium, low. You decide what happens next.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading requests…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

type OpenCase = IntakeCase & { request: NonNullable<IntakeCase["request"]> };

const TIER_STYLES = [
  "bg-red-600 text-white",
  "bg-red-600/15 text-red-700 dark:text-red-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-yellow-400/20 text-yellow-800 dark:text-yellow-200",
  "bg-foreground/10 text-foreground/70",
];

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

async function Dashboard() {
  await connection();
  const [cases, triage] = await Promise.all([listCases(), loadTriage()]);
  const open = cases.filter((c): c is OpenCase => c.request !== null);
  const byId = new Map(open.map((c) => [c.id, c]));
  const fresh = triage ? open.filter((c) => !triage.caseIds.includes(c.id)) : open;
  const queue = triage?.queue.filter((q) => byId.has(q.caseId)) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border border-foreground/15 p-5">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Stat label="Open requests" value={open.length} />
          {triage && <Stat label="In queue" value={queue.length} />}
          {triage && <Stat label="Duplicates merged" value={triage.duplicates.filter((d) => d.verified).reduce((n, d) => n + d.caseIds.length - 1, 0)} />}
          {triage && <Stat label="Raised by safety rule" value={queue.filter((q) => q.raisedByRule).length} />}
        </div>
        {triage && <RunInfo run={triage} />}
        <TriageControls defaultProvider={defaultProvider()} openWeights={openWeightsConfigured()} />
      </section>

      {fresh.length > 0 && triage && (
        <p className="rounded-lg border border-orange-500/50 bg-orange-500/10 px-4 py-2 text-sm">
          {fresh.length} new request{fresh.length === 1 ? "" : "s"} since the last triage. Run it again to place them.
        </p>
      )}

      {triage ? (
        <ol className="flex flex-col gap-3">
          {queue.map((item) => (
            <QueueCard key={item.caseId} item={item} intake={byId.get(item.caseId)!} byId={byId} group={triage.duplicates.find((d) => d.verified && d.keepId === item.caseId)} />
          ))}
        </ol>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((c) => (
            <li key={c.id} className="rounded-xl border border-foreground/15 p-4 text-sm">
              <CaseLine intake={c} />
            </li>
          ))}
        </ul>
      )}

      {triage && triage.duplicates.some((d) => !d.verified) && (
        <section className="rounded-xl border border-foreground/15 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Possible duplicates not merged</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {triage.duplicates
              .filter((d) => !d.verified)
              .map((d, i) => (
                <li key={i}>
                  {d.caseIds.map((id) => byId.get(id)?.location ?? id.slice(0, 8)).join(" + ")} · {d.reason}{" "}
                  <span className="text-orange-600">({d.check})</span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span> <span className="text-foreground/60">{label}</span>
    </span>
  );
}

function RunInfo({ run }: { run: TriageRun }) {
  return (
    <p className="text-xs text-foreground/60">
      Last triage {time(run.at)} by <strong>{PROVIDER_LABELS[run.provider]}</strong> ({run.model}) · {(run.latencyMs / 1000).toFixed(1)} s ·{" "}
      {run.inputTokens.toLocaleString("en")} in / {run.outputTokens.toLocaleString("en")} out tokens · ${run.costUsd.toFixed(3)}
    </p>
  );
}

function CaseLine({ intake }: { intake: OpenCase }) {
  const r = intake.request;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge value={r.priority} />
        <span className="font-medium">{intake.location ?? "Location unknown"}</span>
        <span className="text-xs text-foreground/50">
          {intake.source === "message" ? "💬 message" : "🎥 video"} · received {time(intake.createdAt)}
        </span>
        <span
          className={`ml-auto text-xs ${r.verification.verified === r.verification.total ? "text-green-700 dark:text-green-400" : "text-orange-600"}`}
        >
          {r.verification.verified}/{r.verification.total} evidence verified
        </span>
      </div>
      <p>{r.summary}</p>
      <div className="flex flex-wrap gap-1.5">
        {r.safety_flags.map((f) => (
          <span key={f.flag} className={`rounded px-1.5 py-0.5 text-xs ${f.flag === "call_112_now" ? "bg-red-600 text-white" : "bg-orange-500/15"}`}>
            {f.flag.replaceAll("_", " ")}
          </span>
        ))}
        {r.needs.map((n, i) => (
          <span key={i} className="rounded border border-foreground/15 px-1.5 py-0.5 text-xs">
            {n.category.replaceAll("_", " ")}
          </span>
        ))}
        <Link href={`/cases/${intake.id}`} className="ml-auto text-xs underline underline-offset-2">
          Open case
        </Link>
      </div>
    </div>
  );
}

function QueueCard({
  item,
  intake,
  byId,
  group,
}: {
  item: QueueItem;
  intake: OpenCase;
  byId: Map<string, OpenCase>;
  group?: DuplicateGroup;
}) {
  return (
    <li className={`flex gap-4 rounded-xl border p-4 text-sm ${item.tier === 0 ? "border-red-600" : "border-foreground/15"}`}>
      <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{item.rank}</span>
        <span className={`rounded px-1.5 py-0.5 text-center text-[11px] font-medium ${TIER_STYLES[item.tier]}`}>{TIER_LABELS[item.tier]}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <CaseLine intake={intake} />
        <p className="text-foreground/70">
          <span className="font-medium">Why here:</span> {item.reason}
        </p>
        {item.raisedByRule && (
          <p className="text-xs text-red-700 dark:text-red-300">
            ↑ Raised by safety rule: the model ranked it #{item.modelRank}.
          </p>
        )}
        {group && (
          <div className="rounded-lg bg-foreground/5 px-3 py-2 text-xs">
            <p className="font-medium">
              Merged {item.duplicateIds.length} duplicate report{item.duplicateIds.length === 1 ? "" : "s"}: {group.reason}
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {group.quotes.map((q, i) => (
                <li key={i} className={q.verified ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-300"} title={q.check}>
                  {q.verified ? "✓" : "✗"} {q.caseId === item.caseId ? "this request" : (byId.get(q.caseId)?.location ?? "another request")}
                  {byId.get(q.caseId)?.source === "message" ? " (message)" : " (video)"}: “{q.quote}”
                </li>
              ))}
            </ul>
            {item.duplicateIds.map((id) => (
              <Link key={id} href={`/cases/${id}`} className="mr-3 underline underline-offset-2">
                Open duplicate
              </Link>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
