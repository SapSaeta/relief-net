import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { listCases } from "@/lib/cases";
import { listReports } from "@/lib/report";

const REPO = "https://github.com/SapSaeta/relief-net/blob/main";

type Step = { title: string; body: string; href?: string; cta: string };

function steps(sample: { caseId: string; hasReport: boolean } | null): Step[] {
  return [
    {
      title: "A person reports damage",
      body: "A phone video of the home, or a typed message. Muse Spark writes the help request; SAM 3.1 marks the damage on key frames; every claim cites the person's words or a frame, and code checks each citation.",
      href: "/intake",
      cta: "Report damage",
    },
    {
      title: "The request, with its evidence",
      body: "Needs, household, hazards and damage, each with the quote or frame that backs it. Unverified claims are marked, never hidden.",
      href: sample ? `/cases/${sample.caseId}` : undefined,
      cta: "Open a sample case",
    },
    {
      title: "Triage and duplicates",
      body: "Muse Spark proposes an order and the duplicates; code keeps the safety tiers (112 first) and merges only what its evidence and location confirm.",
      href: "/coordinator",
      cta: "Coordinator dashboard",
    },
    {
      title: "Volunteers and supplies, approved by a person",
      body: "A matching agent calls tools to find volunteers and check stock; code rejects unsafe or impossible proposals; nothing is dispatched until the coordinator approves.",
      href: "/coordinator#matching",
      cta: "Matching panel",
    },
    {
      title: "A report the household can send",
      body: "A draft for insurance or public aid, with verified citations and no valuations or advice, printable as PDF.",
      href: sample?.hasReport ? `/cases/${sample.caseId}/report` : undefined,
      cta: "Sample report",
    },
    {
      title: "Every action on the record",
      body: "An append-only audit log names who did what: the public, the model, a code rule or the coordinator.",
      href: "/audit",
      cta: "Audit log",
    },
  ];
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-14">
      <section className="flex flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight">relief-net</h1>
        <p className="text-lg text-foreground/70">
          AI coordination layer for community disaster response: from a phone video of a damaged home to a prioritized,
          evidence-backed help request, with a human coordinator approving every dispatch.
        </p>
        <p className="text-sm text-foreground/60">
          The demo runs on <strong>Riverside</strong>, a fully synthetic flood: 15 requests, 10 volunteers, 8 kinds of supplies.
          Life-threatening emergency? Call <strong>112</strong>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Walk through it</h2>
        <Suspense fallback={<Steps list={steps(null)} />}>
          <LiveSteps />
        </Suspense>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground/50">Measured on the scenario</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          <Fact value="7/7" label="triage checks in 10 of 10 runs, both providers" href={`${REPO}/docs/evidence/baseline-comparison.md`} />
          <Fact value="23–44 s" label="to a ranked, deduplicated queue (2.8 min by hand)" href={`${REPO}/docs/evidence/baseline-comparison.md`} />
          <Fact value="10/10" label="runs kept the prompt-injection attempt below more urgent requests" href={`${REPO}/docs/evidence/injection-eval.md`} />
        </ul>
        <p className="text-xs text-foreground/50">
          Muse Spark 1.3 on the Meta API and Muse Spark Open on Baseten, same prompts. Limits and every run are in the linked
          evidence.
        </p>
      </section>
    </main>
  );
}

async function LiveSteps() {
  await connection();
  const [cases, reports] = await Promise.all([listCases(), listReports()]);
  const withReport = new Set(reports.map((r) => r.caseId));
  const open = cases.filter((c) => c.request).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pick =
    open.find((c) => c.source !== "message" && withReport.has(c.id)) ??
    open.find((c) => withReport.has(c.id)) ??
    open.find((c) => c.source !== "message") ??
    open[0];
  return <Steps list={steps(pick ? { caseId: pick.id, hasReport: withReport.has(pick.id) } : null)} />;
}

function Steps({ list }: { list: Step[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {list.map((s, i) => (
        <li key={s.title} className="flex gap-4 rounded-lg border border-foreground/10 p-4">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
            {i + 1}
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="font-medium">{s.title}</h3>
            <p className="text-sm text-foreground/70">{s.body}</p>
            {s.href && (
              <Link href={s.href} className="w-fit text-sm font-medium underline underline-offset-2">
                {s.cta} →
              </Link>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Fact({ value, label, href }: { value: string; label: string; href: string }) {
  return (
    <li>
      <a href={href} className="flex h-full flex-col gap-1 rounded-lg border border-foreground/10 p-4 hover:border-foreground/30">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        <span className="text-sm text-foreground/60">{label}</span>
      </a>
    </li>
  );
}
