import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { ReviewBanner } from "@/app/review-banner";
import { readAudit, type Actor } from "@/lib/audit";

export const metadata = { title: "Audit log · relief-net" };

const ACTORS: Record<Actor, { label: string; style: string }> = {
  public: { label: "public", style: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  model: { label: "model", style: "bg-purple-500/15 text-purple-700 dark:text-purple-300" },
  rule: { label: "code rule", style: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  coordinator: { label: "coordinator", style: "bg-green-600/15 text-green-800 dark:text-green-300" },
};

export default function AuditPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-foreground/70">
          Every action, newest first, and who took it: the public sends requests, the model proposes, code rules accept or
          overrule, and the coordinator decides. Entries are append-only. <Link href="/coordinator" className="underline underline-offset-2">Back to the dashboard</Link>
        </p>
      </header>
      <ReviewBanner />
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading the log…</p>}>
        <Entries />
      </Suspense>
    </main>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Madrid" });

async function Entries() {
  await connection();
  const entries = await readAudit();
  if (!entries.length) return <p className="text-sm text-foreground/60">Nothing logged yet.</p>;
  const counts = Object.keys(ACTORS).map((a) => [a as Actor, entries.filter((e) => e.actor === a).length] as const);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {counts.map(([actor, n]) => (
          <span key={actor} className={`rounded px-2 py-1 ${ACTORS[actor].style}`}>
            {ACTORS[actor].label}: {n}
          </span>
        ))}
      </div>
      <ol className="flex flex-col divide-y divide-foreground/10 rounded-xl border border-foreground/15 text-sm">
        {entries.map((e, i) => (
          <li key={i} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="shrink-0 text-xs tabular-nums text-foreground/50 sm:w-36">{when(e.at)}</span>
            <span className={`w-fit shrink-0 rounded px-1.5 py-0.5 text-xs ${ACTORS[e.actor].style}`}>{ACTORS[e.actor].label}</span>
            <code className="shrink-0 text-xs text-foreground/60">{e.action}</code>
            <span className="min-w-0 flex-1">
              {e.summary}
              {e.model && <span className="text-xs text-foreground/50"> · {e.model}</span>}
              {e.backfilled && <span className="ml-2 rounded bg-foreground/10 px-1 text-[11px] text-foreground/60" title="Rebuilt from stored records: the action predates the audit log">backfilled</span>}
              {e.caseIds?.map((id) => (
                <Link key={id} href={`/cases/${id}`} className="ml-2 text-xs underline underline-offset-2">
                  case
                </Link>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
