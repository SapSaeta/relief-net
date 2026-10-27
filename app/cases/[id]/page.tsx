import { notFound } from "next/navigation";
import { Suspense } from "react";

import { IntakeResult } from "@/app/intake/intake-form";
import { loadCase } from "@/lib/cases";

export const metadata = { title: "Case · relief-net" };

// Not async: params are awaited inside the Suspense boundary so the shell stays static.
export default function CasePage({ params }: PageProps<"/cases/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Case</h1>
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading case…</p>}>
        <CaseView params={params} />
      </Suspense>
    </main>
  );
}

async function CaseView({ params }: { params: Promise<{ id: string }> }) {
  const intake = await loadCase((await params).id);
  if (!intake) notFound();
  return <IntakeResult intake={intake} />;
}
