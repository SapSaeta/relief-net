"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const LINKS = [
  { href: "/intake", label: "Report damage" },
  { href: "/coordinator", label: "Coordinator" },
  { href: "/audit", label: "Audit log" },
  { href: "/baseline", label: "Manual baseline" },
];

/** One header on every page, hidden when a report is printed. The current page is only known at request
 *  time, so the highlighted link streams in; the plain links are the prerendered fallback. */
export function SiteNav() {
  return (
    <header className="border-b border-foreground/10 print:hidden">
      <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3 text-sm">
        <Link href="/" className="font-semibold tracking-tight">
          relief-net
        </Link>
        <Suspense fallback={<NavLinks path="" />}>
          <CurrentNavLinks />
        </Suspense>
        <span className="ml-auto text-foreground/50">
          Emergency? Call <strong>112</strong>
        </span>
      </nav>
    </header>
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
