import { IntakeForm, MessageForm } from "./intake-form";

export const metadata = { title: "Intake · relief-net" };

export default function IntakePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Report damage</h1>
        <p className="text-foreground/70">
          Record a short walkthrough of the damage and describe it out loud. We transcribe what you say and mark the
          visible damage on each frame.
        </p>
        <p className="text-sm text-foreground/50">
          Life-threatening emergency? Call <strong>112</strong>. Do not enter buildings that may be structurally unsafe.
        </p>
      </header>
      <IntakeForm />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">No video? Type your request</h2>
        <MessageForm />
      </section>
    </main>
  );
}
