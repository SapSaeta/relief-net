import { connection } from "next/server";
import { Suspense } from "react";

import { ReviewBanner } from "@/app/review-banner";
import { listCases } from "@/lib/cases";

import { ManualTriage, type BaselineRequest } from "./manual-triage";

export const metadata = { title: "Manual triage baseline · relief-net" };

export default function BaselinePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Manual triage baseline</h1>
        <p className="text-foreground/70">
          The same open requests the model triages, done by hand and timed, to measure what relief-net changes for a coordinator.
        </p>
      </header>
      <ReviewBanner />
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading requests…</p>}>
        <Requests />
      </Suspense>
    </main>
  );
}

async function Requests() {
  await connection();
  const open = (await listCases()).filter((c) => c.request !== null).reverse(); // as they arrived, like the model sees them
  const requests: BaselineRequest[] = open.map((c, i) => ({
    id: c.id,
    label: String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : ""),
    receivedAt: new Date(c.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }),
    source: c.source === "message" ? "typed message" : "video walkthrough (narration transcript)",
    location: c.location ?? "location not given",
    words: c.transcript.text,
  }));
  return <ManualTriage requests={requests} />;
}
