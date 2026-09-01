"use client";

// Guide Wizard — an always-available, route-aware "how to use this" panel that
// appears on every dashboard page. It reads the current route, looks up the
// module's guide (goal, exact steps, readiness) and shows it in a slide-over, so
// a user is never stuck wondering what to input or what a screen is for.
// Pure client + a static registry; no key, no network.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { HelpCircle, X, CheckCircle2, KeyRound, Database, ArrowRight, Lightbulb } from "lucide-react";
import { guideForPath, type GuideStatus } from "@/shared/guides";

const STATUS: Record<GuideStatus, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  ready: { label: "Ready now — no setup", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40", icon: CheckCircle2 },
  key: { label: "Works now · fuller with a key", cls: "bg-sky-500/15 text-sky-300 ring-sky-500/40", icon: KeyRound },
  data: { label: "Shows estimates · connect data", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/40", icon: Database },
};

export default function GuideWizard() {
  const pathname = usePathname() || "/dashboard";
  const [open, setOpen] = useState(false);
  const { key, guide } = guideForPath(pathname);

  // Close on route change + on Escape.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const st = STATUS[guide.status];
  const StatusIcon = st.icon;

  return (
    <>
      {/* Floating trigger — bottom-right on every dashboard page */}
      <button
        type="button" onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink-950 shadow-lg transition hover:bg-emerald-400"
        aria-label="Open the guide for this page"
      >
        <HelpCircle className="h-4 w-4" /> Guide
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-ink-950 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">Guide</p>
                <h2 className="font-display text-lg font-bold text-white">{guide.title}</h2>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close guide"><X className="h-5 w-5" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <p className="text-sm text-slate-300">{guide.goal}</p>

              <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${st.cls}`}>
                <StatusIcon className="h-3.5 w-3.5" /> {st.label}
              </div>
              {guide.statusNote && <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{guide.statusNote}</p>}

              <h3 className="mt-5 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Steps</h3>
              <ol className="space-y-2.5">
                {guide.steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300">{i + 1}</span>
                    <span className="pt-0.5 text-sm text-slate-300">{s}</span>
                  </li>
                ))}
              </ol>

              {guide.tip && (
                <div className="mt-5 flex gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <Lightbulb className="h-4 w-4 shrink-0 text-amber-300" />
                  <p className="text-[12px] leading-relaxed text-slate-300">{guide.tip}</p>
                </div>
              )}
            </div>

            {guide.next && (
              <div className="border-t border-white/10 p-4">
                <Link href={guide.next.href} onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-ink-950 transition hover:bg-emerald-400">
                  {guide.next.label} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
            {!guide.next && (
              <div className="border-t border-white/10 p-4">
                <Link href="/dashboard/go-live" onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:text-white">
                  What&apos;s needed to go fully live? <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}
