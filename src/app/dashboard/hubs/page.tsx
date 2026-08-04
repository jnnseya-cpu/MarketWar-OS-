"use client";

// The Gen-Z Growth Layer — six hubs and the Play board.
//
// Create / Grow / Earn / Play / Connect / Build over the OS that already ships.
// Nothing underneath changes: every tile links to a page that exists, and each
// hub publishes what it does NOT yet have rather than quietly omitting it.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Loader2, Sparkles, Target, Trophy, Wand2 } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type HubEntry = { href: string; label: string; does: string; isNew?: boolean };
type Hub = { id: string; label: string; promise: string; entries: HubEntry[]; notYet: string[] };
type Challenge = { id: string; track: string; title: string; ask: string; target: number; done: number; complete: boolean; xp: number; where: string };
type Badge = { id: string; label: string; why: string; earned: boolean; progress: number; target: number };
type Mission = { id: string; title: string; goal: string; target: number; done: number; complete: boolean; pct: number; xp: number; rewardAcu: number; rewardNote: string };
type Play = {
  day: string; challenges: Challenge[]; completedToday: number; xpToday: number; xp: number;
  level: { level: number; title: string; intoLevel: number; nextAt: number | null; toNext: number | null };
  streak: { current: number; longest: number; todayDone: boolean };
  badges: Badge[]; missions: Mission[];
  ceiling: { acus: number; why: string };
  untracked: string[];
  doctrine: string;
};

const HUB_TONE: Record<string, string> = {
  create: "border-violet-500/30", grow: "border-emerald-500/30", earn: "border-amber-500/30",
  play: "border-rose-500/30", connect: "border-sky-500/30", build: "border-slate-500/30",
};

export default function HubsPage() {
  const { activeBrand } = useActiveBrand();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [play, setPlay] = useState<Play | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/genz").then((r) => r.json())
      .then((d) => setHubs(Array.isArray(d?.hubs) ? d.hubs : []))
      .catch(() => { /* the board below still loads; the map is not a dependency */ });
  }, []);

  useEffect(() => {
    if (!activeBrand?.id) { setPlay(null); return; }
    setBusy(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    fetch("/api/genz", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "play", brandId: activeBrand.id, timezone: tz }),
    })
      .then((r) => r.json())
      .then((d) => setPlay(d && Array.isArray(d.challenges) ? d : null))
      .catch(() => setPlay(null))
      .finally(() => setBusy(false));
  }, [activeBrand?.id]);

  return (
    <div>
      <PageHeader
        kicker="Gen-Z Growth Layer"
        title="Create · Grow · Earn · Play · Connect · Build"
        subtitle="The same OS, organised by what you are trying to do rather than by which engine does it. Every tile goes to a page that exists, and each hub says what it does not have yet."
        actions={<Pill tone="info">six hubs · verified challenges</Pill>}
      />

      {/* Today's board first — it is the thing somebody comes back for. */}
      <div className="mb-8 card border-rose-500/30 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Trophy className="h-5 w-5 text-rose-400" />
          <h2 className="font-display text-lg font-bold text-white">Today</h2>
          {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
          {play && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Pill tone="info">Level {play.level.level} · {play.level.title}</Pill>
              <Pill tone={play.streak.current > 0 ? "good" : "neutral"}>
                <Flame className="mr-1 inline h-3 w-3" />{play.streak.current}-day streak
              </Pill>
              <Pill tone="neutral">{play.xp} XP</Pill>
            </div>
          )}
        </div>

        {!activeBrand?.id && <p className="text-sm text-slate-400">Pick a brand and today&apos;s challenges appear here.</p>}

        {play && (
          <>
            <p className="mb-3 text-sm text-slate-400">
              {play.completedToday} of {play.challenges.length} done today{play.xpToday > 0 ? ` · ${play.xpToday} XP earned` : ""}
              {play.level.toNext !== null ? ` · ${play.level.toNext} XP to ${play.level.level + 1}` : ""}
            </p>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {play.challenges.map((c) => (
                <Link key={c.id} href={c.where}
                  className={`rounded-xl border p-3 transition hover:border-emerald-500/40 ${c.complete ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.03]"}`}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{c.track}</span>
                    <span className={`text-[11px] font-semibold ${c.complete ? "text-emerald-300" : "text-slate-400"}`}>{c.done}/{c.target} · {c.xp} XP</span>
                  </div>
                  <p className="text-sm font-bold text-white">{c.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{c.ask}</p>
                </Link>
              ))}
            </div>

            {play.missions.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"><Target className="h-3.5 w-3.5" /> Money missions</h3>
                <div className="space-y-2">
                  {play.missions.map((m) => (
                    <div key={m.id} className="rounded-lg border border-white/10 bg-ink-900/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-white">{m.title}</span>
                        <span className="text-xs text-slate-400">{m.done}/{m.target} · {m.pct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${m.pct}%` }} />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">{m.goal} — {m.rewardNote}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[11px] leading-relaxed text-slate-500">
                  {play.ceiling.why}
                </p>
              </div>
            )}

            {play.badges.some((b) => b.earned) && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {play.badges.filter((b) => b.earned).map((b) => (
                  <span key={b.id} className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/[0.07] px-2 py-1 text-xs text-amber-200" title={b.why}>
                    <Sparkles className="h-3 w-3" /> {b.label}
                  </span>
                ))}
              </div>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-slate-600">{play.doctrine}</p>
            {play.untracked.length > 0 && (
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                Not yet countable, so no challenge uses them: {play.untracked.join(", ")}.
              </p>
            )}
          </>
        )}
      </div>

      {/* The six hubs */}
      <div className="grid gap-5 lg:grid-cols-2">
        {hubs.map((h) => (
          <div key={h.id} className={`card p-5 ${HUB_TONE[h.id] || ""}`}>
            <div className="mb-1 flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-slate-400" />
              <h2 className="font-display text-lg font-bold text-white">{h.label}</h2>
            </div>
            <p className="mb-3 text-sm text-slate-400">{h.promise}</p>
            <div className="space-y-1.5">
              {h.entries.map((e) => (
                <Link key={e.href} href={e.href} className="block rounded-lg border border-white/[0.07] bg-ink-900/40 p-2.5 transition hover:border-emerald-500/40">
                  <p className="text-sm font-semibold text-white">
                    {e.label}{e.isNew && <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">new</span>}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{e.does}</p>
                </Link>
              ))}
            </div>
            {h.notYet.length > 0 && (
              <details className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-slate-500">Not here yet ({h.notYet.length})</summary>
                <ul className="mt-1.5 space-y-1">
                  {h.notYet.map((n, i) => <li key={i} className="text-[11px] leading-relaxed text-slate-500">· {n}</li>)}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
