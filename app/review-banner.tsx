import { accessCodeRequired } from "@/lib/guard";

/** Review mode: anyone can read the pre-seeded synthetic scenario; anything that calls a model or
 *  changes a decision needs the demo access code. Hidden in local development without a code. */
export function ReviewBanner() {
  if (!accessCodeRequired()) return null;
  return (
    <p className="rounded-lg border border-foreground/15 bg-foreground/5 px-4 py-2 text-sm text-foreground/70">
      <strong>Review mode.</strong> You are viewing a pre-seeded, fully synthetic scenario. Reading is open; running intake or
      triage and confirming or undoing merges needs the demo access code given to judges with the submission.
    </p>
  );
}
