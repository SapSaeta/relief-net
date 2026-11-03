"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { askAccessCode, rememberAccessCode, useHasAccessCode } from "./access-code";

const LINKS = [
  { href: "/intake", label: "Report damage" },
  { href: "/coordinator", label: "Coordinator" },
  { href: "/audit", label: "Audit log" },
  { href: "/baseline", label: "Manual baseline" },
];

/** One header on every page, hidden when a report is printed. The current page is only known at request
 *  time, so the highlighted link streams in; the plain links are the prerendered fallback. */
export function SiteNav({ codeRequired }: { codeRequired: boolean }) {
  return (
    <header className="border-b border-foreground/10 print:hidden">
      <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3 text-sm">
        <Link href="/" className="font-semibold tracking-tight">
          relief-net
        </Link>
        <Suspense fallback={<NavLinks path="" />}>
          <CurrentNavLinks />
        </Suspense>
        <span className="ml-auto flex items-center gap-4">
          {codeRequired && <AccessCodeButton />}
          <span className="text-foreground/50">
            Emergency? Call <strong>112</strong>
          </span>
        </span>
      </nav>
    </header>
  );
}

/** Review mode: enter the demo code once for every action in this tab, or forget it. */
function AccessCodeButton() {
  const has = useHasAccessCode();
  return has ? (
    <button
      type="button"
      onClick={() => rememberAccessCode("")}
      title="Actions are unlocked in this tab. Click to forget the code."
      className="rounded-full bg-green-600/15 px-3 py-1 text-xs font-medium text-green-800 dark:text-green-300"
    >
      ● Demo code set
    </button>
  ) : (
    <button
      type="button"
      onClick={() => askAccessCode()}
      title="Reading is open. Running models or recording decisions needs the demo access code."
      className="rounded-full border border-foreground/20 px-3 py-1 text-xs font-medium"
    >
      Enter demo code
    </button>
  );
}

function CurrentNavLinks() {
  return <NavLinks path={usePathname()} />;
}

function NavLinks({ path }: { path: string }) {
  return LINKS.map((l) => (
    <Link
      key={l.href}
      href={l.href}
      aria-current={path.startsWith(l.href) ? "page" : undefined}
      className="text-foreground/60 hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground"
    >
      {l.label}
    </Link>
  ));
}
