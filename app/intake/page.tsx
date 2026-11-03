import { ReviewBanner } from "@/app/review-banner";
import { blobUploadsEnabled } from "@/lib/blob";

import { IntakeTabs } from "./intake-form";

export const metadata = { title: "Intake · relief-net" };

export default function IntakePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Report damage</h1>
        <p className="text-foreground/70">
          Show us the damage in a short video and describe it out loud, or type a message. We turn it into a help request
          that a local coordinator reviews before sending volunteers or supplies.
        </p>
        <p className="rounded-lg border border-red-600/40 bg-red-600/5 px-4 py-2 text-sm">
          <strong>Life-threatening emergency? Call 112.</strong> Do not enter buildings that may be structurally unsafe.
        </p>
      </header>
      <ReviewBanner />
      <IntakeTabs uploadMode={blobUploadsEnabled() ? "blob" : "multipart"} />
    </main>
  );
}
