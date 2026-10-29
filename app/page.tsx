import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">relief-net</h1>
      <p className="text-lg text-foreground/70">
        AI coordination layer for community disaster response: from a phone video of a damaged home to a
        prioritized, evidence-backed help request, with a human coordinator approving every dispatch.
      </p>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link href="/intake" className="rounded-md bg-foreground px-4 py-2 font-medium text-background">
          Report damage
        </Link>
        <Link href="/coordinator" className="rounded-md border border-foreground/20 px-4 py-2 font-medium">
          Coordinator dashboard
        </Link>
      </nav>
      <p className="text-sm text-foreground/50">
        Life-threatening emergency? Call <strong>112</strong>.
      </p>
    </main>
  );
}
