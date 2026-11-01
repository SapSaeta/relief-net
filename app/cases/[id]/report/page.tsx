import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ReviewBanner } from "@/app/review-banner";
import { loadCase, type IntakeCase } from "@/lib/cases";
import type { CheckedEvidence } from "@/lib/evidence";
import { dispatchedHelp, loadReport } from "@/lib/report";

import { ReportActions } from "./report-actions";

export const metadata = { title: "Damage report · relief-net" };

export default function ReportPage({ params }: PageProps<"/cases/[id]/report">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12 print:max-w-none print:px-0 print:py-0">
      <div className="print:hidden">
        <ReviewBanner />
      </div>
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading report…</p>}>
        <ReportView params={params} />
      </Suspense>
    </main>
  );
}

const SEVERITY = { minor: "bg-yellow-400/20", moderate: "bg-orange-500/20", severe: "bg-red-600/20" } as const;

const date = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

async function ReportView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [intake, saved, help] = await Promise.all([loadCase(id), loadReport(id), dispatchedHelp(id)]);
  if (!intake) notFound();
  const r = saved?.report;

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href={`/cases/${id}`} className="text-sm underline underline-offset-2 print:hidden">
          ← Back to the case
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Damage report · draft</h1>
        <p className="text-sm text-foreground/70">
          For the household to review, complete and send to their insurer or a public aid office. It is not a claim, a valuation or
          an inspection.
        </p>
        <ReportActions caseId={id} hasReport={Boolean(r)} />
      </header>

      <dl className="grid gap-x-6 gap-y-1 rounded-xl border border-foreground/15 p-4 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-foreground/60">Location</dt>
        <dd>{intake.location ?? "Not given"}</dd>
        <dt className="text-foreground/60">Reported</dt>
        <dd>
          {date(intake.createdAt)} · {intake.source === "message" ? "typed message" : "video walkthrough with narration"}
        </dd>
        <dt className="text-foreground/60">Hazard</dt>
        <dd>{intake.request?.hazard ?? "unknown"}</dd>
        <dt className="text-foreground/60">Case reference</dt>
        <dd className="font-mono text-xs">{id}</dd>
        {saved && (
          <>
            <dt className="text-foreground/60">Drafted</dt>
            <dd>
              {date(saved.at)} by {saved.model} · {(saved.latencyMs / 1000).toFixed(1)} s · ${saved.costUsd.toFixed(3)}
            </dd>
          </>
        )}
      </dl>

      {!r ? (
        <p className="rounded-xl border border-dashed border-foreground/25 p-6 text-sm text-foreground/70">
          No report drafted yet for this case. Drafting reads the person&apos;s words, SAM&apos;s detections and the verified help request;
          every statement cites its evidence and code checks each citation.
        </p>
      ) : (
        <>
          <p
            className={`rounded-lg px-4 py-2 text-sm ${r.verification.verified === r.verification.statements ? "bg-green-600/10 text-green-800 dark:text-green-300" : "bg-orange-500/10"}`}
          >
            {r.verification.verified}/{r.verification.statements} statements backed by verified evidence ({r.verification.citationsVerified}/
            {r.verification.citations} citations). Statements marked <em>unverified</em> need a photo, receipt or other proof before
            sending.
          </p>
          {saved.scopeWarnings.length > 0 && (
            <p className="rounded-lg bg-red-600/10 px-4 py-2 text-sm text-red-800 dark:text-red-200">
              Check before sending: possible valuation or advice in {saved.scopeWarnings.join(", ")}. Remove it; this report gives neither.
            </p>
          )}

          <Section title="What happened">
            <p>{r.incident_summary}</p>
          </Section>

          <Section title="Damage" keep={false}>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-foreground/60">
                <tr>
                  <th className="py-1 pr-3 font-medium">Area</th>
                  <th className="py-1 pr-3 font-medium">Item</th>
                  <th className="py-1 pr-3 font-medium">Severity</th>
                  <th className="py-1 font-medium">Description and evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10 align-top">
                {r.damage_items.map((d, i) => (
                  <tr key={i} className="break-inside-avoid">
                    <td className="py-2 pr-3">{d.area}</td>
                    <td className="py-2 pr-3 font-medium">{d.item}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${SEVERITY[d.severity]}`}>{d.severity}</span>
                    </td>
                    <td className="py-2">
                      {d.description}
                      <Evidence items={d.evidence} verified={d.verified} intake={intake} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {r.household_impact.length > 0 && (
            <Section title="Impact on the household">
              <Statements items={r.household_impact} intake={intake} />
            </Section>
          )}

          {r.safety_notes.length > 0 && (
            <Section title="Needs a professional">
              <Statements items={r.safety_notes} intake={intake} />
            </Section>
          )}

          <Section title="Help already received">
            {help ? (
              <p>
                Dispatched by the community response coordinator{help.at && ` on ${date(help.at)}`}: {help.team.join(", ")}
                {help.supplies.length > 0 && `, with ${help.supplies.join(", ")}`}. <span className="text-foreground/50">(Demo: simulated dispatch.)</span>
              </p>
            ) : (
              <p className="text-foreground/60">None recorded yet.</p>
            )}
          </Section>

          <Section title="Still to add before sending">
            <ul className="list-inside list-disc">
              {r.missing_information.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </Section>

          <Section title="Householder statement (draft from your own words: edit before signing)">
            <blockquote className="border-l-2 border-foreground/30 pl-4 italic">{r.householder_statement}</blockquote>
            <p className="mt-6 text-foreground/60">Signature: ______________________ Date: ____________</p>
          </Section>

          <p className="text-xs text-foreground/50">
            Drafted with Muse Spark from the household&apos;s own report; SAM 3.1 detections are evidence of what is visible, not an
            assessment. No money values or repair estimates are given. Synthetic demo data.
          </p>
        </>
      )}
    </article>
  );
}

/** Short sections stay on one printed page; long ones (the damage table) break between rows. */
function Section({ title, children, keep = true }: { title: string; children: React.ReactNode; keep?: boolean }) {
  return (
    <section className={`flex flex-col gap-2 text-sm ${keep ? "break-inside-avoid" : ""}`}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/60">{title}</h2>
      {children}
    </section>
  );
}

function Statements({ items, intake }: { items: { statement: string; evidence: CheckedEvidence[]; verified: boolean }[]; intake: IntakeCase }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((s, i) => (
        <li key={i}>
          {s.statement}
          <Evidence items={s.evidence} verified={s.verified} intake={intake} />
        </li>
      ))}
    </ul>
  );
}

function Evidence({ items, verified, intake }: { items: CheckedEvidence[]; verified: boolean; intake: IntakeCase }) {
  const frames = items.filter((e) => e.kind === "frame" && e.verified);
  return (
    <div className="mt-1 flex flex-col gap-1">
      {!verified && <span className="w-fit rounded bg-orange-500/15 px-1.5 py-0.5 text-xs text-orange-800 dark:text-orange-200">unverified</span>}
      <ul className="flex flex-col gap-0.5 text-xs">
        {items.map((e, i) => (
          <li key={i} className={e.verified ? "text-green-800 dark:text-green-300" : "text-foreground/50 line-through"} title={e.check}>
            {e.verified ? "✓" : "✗"}{" "}
            {e.kind === "transcript"
              ? `“${e.quote}”`
              : `${e.damage_label} in frame ${e.frame_index}${(() => {
                  const f = intake.frames.find((x) => x.index === e.frame_index);
                  return f ? ` (${f.timeSec.toFixed(1)} s)` : "";
                })()}`}
          </li>
        ))}
      </ul>
      {frames.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[...new Set(frames.map((e) => e.frame_index))].map((n) => {
            const f = intake.frames.find((x) => x.index === n);
            // eslint-disable-next-line @next/next/no-img-element
            return f?.image ? <img key={n} src={f.image} alt={`Key frame ${n}`} className="h-24 rounded border border-foreground/15" /> : null;
          })}
        </div>
      )}
    </div>
  );
}
