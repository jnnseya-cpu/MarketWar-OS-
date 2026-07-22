// Shared marketing shell — a consistent header + canonical footer used by every
// public page (About, Industries, Developers, legal, etc.). The footer is the
// single source of truth for the public site's navigation links.

import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/Logo";

// Canonical public-site navigation (grouped for the footer).
export const FOOTER_NAV: { title: string; links: [string, string][] }[] = [
  {
    title: "Company",
    links: [
      ["About", "/about"],
      ["Industries", "/industries"],
      ["Blog", "/blog"],
      ["Contact", "/contact"],
    ],
  },
  {
    title: "Product",
    links: [
      ["How it works", "/how-it-works"],
      ["Developers", "/developers"],
      ["Get started", "/get-started"],
      ["Growth & Influencers", "/growth"],
    ],
  },
  {
    title: "Legal & status",
    links: [
      ["Terms of Service", "/terms"],
      ["Privacy Policy", "/privacy"],
      ["All policies", "/policies"],
      ["Platform status", "/status"],
    ],
  },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandLockup />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-300 md:flex">
          <Link href="/how-it-works" className="hover:text-white">How it works</Link>
          <Link href="/industries" className="hover:text-white">Industries</Link>
          <Link href="/developers" className="hover:text-white">Developers</Link>
          <Link href="/growth" className="hover:text-white">Growth</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm font-semibold text-slate-300 hover:text-white sm:block">Sign in</Link>
          <Link href="/get-started" className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-bold text-ink-950 hover:bg-emerald-400">Get started</Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-ink-950">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <BrandLockup />
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              The AI-powered customer-acquisition operating system. One account, every brand, one predictable bill.
            </p>
          </div>
          {FOOTER_NAV.map((col) => (
            <div key={col.title}>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-sm text-slate-400 transition hover:text-emerald-300">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-6 text-xs text-slate-600">
          <p>© 2026 MarketWar OS · marketwaros.com</p>
          <p className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-slate-400">Terms</Link>
            <Link href="/privacy" className="hover:text-slate-400">Privacy</Link>
            <Link href="/status" className="hover:text-slate-400">Status</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}

export function MarketingShell({ kicker, title, subtitle, children }: { kicker?: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950 text-slate-200">
      <SiteHeader />
      <main>
        <section className="border-b border-white/5 bg-gradient-to-b from-ink-900/40 to-transparent">
          <div className="mx-auto max-w-4xl px-5 py-16 text-center sm:py-20">
            {kicker && <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-emerald-400">{kicker}</p>}
            <h1 className="font-display text-3xl font-bold leading-tight text-white sm:text-5xl">{title}</h1>
            {subtitle && <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">{subtitle}</p>}
          </div>
        </section>
        <div className="mx-auto max-w-4xl px-5 py-14">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

// Small content helpers so pages stay terse + consistent.
export function Prose({ children }: { children: ReactNode }) {
  return <div className="space-y-5 text-[15px] leading-relaxed text-slate-300">{children}</div>;
}
export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 font-display text-xl font-bold text-white sm:text-2xl">{children}</h2>;
}
export function FeatureCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="font-display text-base font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{children}</p>
    </div>
  );
}
