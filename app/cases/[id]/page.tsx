import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { IntakeResult } from "@/app/intake/intake-form";
import { ReviewBanner } from "@/app/review-banner";
import { loadCase } from "@/lib/cases";

export const metadata = { title: "Case · relief-net" };

// Not async: params are awaited inside the Suspense boundary so the shell stays static.
export default function CasePage({ params }: PageProps<"/cases/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
      <ReviewBanner />
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading case…</p>}>
        <CaseView params={params} />
      </Suspense>
    </main>
  );
}

async function CaseView({ params }: { params: Promise<{ id: string }> }) {
  const intake = await loadCase((await params).id);
  if (!intake) notFound();
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/coordinator#case-${intake.id}`} className="w-fit text-sm text-foreground/60 underline underline-offset-2">
        ← Back to the coordinator queue
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{intake.location ?? "Location unknown"}</h1>
          <p className="text-sm text-foreground/60">
            {intake.source === "message" ? "💬 Typed message" : "🎥 Video walkthrough"} · received{" "}
            {new Date(intake.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" })}
          </p>
        </div>
        {intake.request && (
          <Link href={`/cases/${intake.id}/report`} className="rounded-md border border-foreground/20 px-3 py-1.5 text-sm font-medium">
            📄 Insurance / aid report (draft)
          </Link>
        )}
      </header>
      <IntakeResult intake={intake} />
    </div>
  );
}
