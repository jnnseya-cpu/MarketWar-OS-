"use client";

// ONE AI GROWTH COMPANY, NOT SIXTY-FIVE TOOLS.
//
// The navigation has sixty-five destinations. Every one of them is a real
// engine, and that is the problem: a person who wants more customers does not
// know whether that is Campaign Warfare, LeadWar Room, Reach Amplifier or Lead
// Recovery, and being asked to choose is being asked to do the platform's job.
//
// The routing brain for this already existed and nothing called it.
// `intent-router.ts` detects the goal, names the engine that owns it, lists only
// the essential questions and quotes the cost in ACUs before anything runs —
// with an API route in front of it — and no surface in the product ever sent it
// a single word. That is this codebase's recurring defect exactly: the engine is
// correct and the last six inches are missing.
//
// So: one box. Type what you want. It answers with the engine that does it and
// takes you there.
//
// TWO THINGS IT IS CAREFUL ABOUT.
//
// It searches the sixty-five screens too, from `NAV` itself rather than a second
// hand-maintained list, so a person who DOES know where they are going is never
// slowed down by a router trying to be clever.
//
// And it shows the confidence it was given without dressing it up. A keyword
// router is not certain and must not look certain — a low number displayed
// plainly is worth more than a high one that was never earned.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Command, CornerDownLeft, Loader2, Search, Sparkles } from "lucide-react";
import { NAV } from "@/components/Sidebar";

type Decision = {
  best: {
    id: string; label: string; route: string; agentId?: string;
    acuEstimate: number; essentialQuestions: string[]; confidence: number;
  };
  alternatives: { id: string; label: string; route: string; confidence: number }[];
  note: string;
};

type Destination = { href: string; label: string; group: string };

const EXAMPLES = [
  "Create a campaign for our new product",
  "Find 500 prospects in Birmingham",
  "Make 5 TikTok videos",
  "Why did conversions fall?",
  "Create next week's growth plan",
];

function useDestinations(): Destination[] {
  return useMemo(() => {
    const seen = new Set<string>();
    const out: Destination[] = [];
    for (const section of NAV) {
      for (const item of section.items) {
        // The nav carries a duplicate or two; a search result list must not.
        const key = `${item.href}|${item.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ href: item.href, label: item.label, group: section.group });
      }
    }
    return out;
  }, []);
}

export default function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const destinations = useDestinations();

  // Cmd/Ctrl-K anywhere, Escape to leave. Bound once on the layout rather than
  // per screen, for the same reason the capability notice is.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
    else { setDecision(null); setBusy(false); }
  }, [open]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return destinations
      .filter((d) => d.label.toLowerCase().includes(needle) || d.group.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [q, destinations]);

  const ask = useCallback(async () => {
    const prompt = q.trim();
    if (!prompt) return;
    setBusy(true);
    setDecision(null);
    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) return;
      setDecision((await res.json()) as Decision);
    } catch {
      /* the destination list above still works — the box is never dead */
    } finally {
      setBusy(false);
    }
  }, [q]);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-slate-500 transition hover:border-emerald-500/40 hover:text-slate-300"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-emerald-400/70" />
        <span className="flex-1 truncate">What do you want MarketWar to do?</span>
        <span className="hidden shrink-0 items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 sm:flex">
          <Command className="h-3 w-3" />K
        </span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/80 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3.5">
          <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setDecision(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") void ask(); }}
            placeholder="What do you want MarketWar to do?"
            aria-label="What do you want MarketWar to do?"
            className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-slate-600"
          />
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : (
            <button type="button" onClick={() => void ask()} disabled={!q.trim()}
              className="flex shrink-0 items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-400 disabled:opacity-40">
              <CornerDownLeft className="h-3 w-3" /> Ask
            </button>
          )}
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {/* Screens first. Somebody who knows where they are going must never be
              made to wait for a router. */}
          {matches.length > 0 && (
            <div className="mb-1">
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Go to</p>
              {matches.map((m) => (
                <button key={`${m.href}-${m.label}`} type="button" onClick={() => go(m.href)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/[0.05]">
                  <Search className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                  <span className="flex-1 truncate">{m.label}</span>
                  <span className="shrink-0 text-[10px] text-slate-600">{m.group}</span>
                </button>
              ))}
            </div>
          )}

          {decision && (
            <div className="border-t border-white/[0.06] p-3 pt-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">The engine that does this</p>
              <button type="button" onClick={() => go(decision.best.route)}
                className="flex w-full items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-left transition hover:border-emerald-500/60">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{decision.best.label}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    About {decision.best.acuEstimate} ACU{decision.best.acuEstimate === 1 ? "" : "s"} · {decision.best.confidence}% match on your wording
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-emerald-400" />
              </button>

              {decision.best.essentialQuestions.length > 0 && (
                <>
                  <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">It will only ask you</p>
                  <ul className="space-y-0.5">
                    {decision.best.essentialQuestions.map((qq) => (
                      <li key={qq} className="text-xs text-slate-400">· {qq}</li>
                    ))}
                  </ul>
                </>
              )}

              {decision.alternatives.length > 0 && (
                <>
                  <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Or</p>
                  <div className="flex flex-wrap gap-1.5">
                    {decision.alternatives.map((a) => (
                      <button key={a.id} type="button" onClick={() => go(a.route)}
                        className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/[0.05]">
                        {a.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{decision.note}</p>
            </div>
          )}

          {!q.trim() && (
            <div className="p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Try</p>
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => { setQ(e); setDecision(null); }}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-slate-400 hover:bg-white/[0.05] hover:text-slate-200">
                  {e}
                </button>
              ))}
            </div>
          )}

          {q.trim() && !decision && !busy && matches.length === 0 && (
            <p className="p-4 text-sm text-slate-500">
              Press Enter and MarketWar will work out which engine does this.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
