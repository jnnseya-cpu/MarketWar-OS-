"use client";

// OMNIRANK Dominion Dashboard (ES-05) — the execution + defence layer.
// Presents the module registry (MW-14→22, linked to live OS engines), the
// 22-agent APEX swarm, the Sentinel compliance hard-gate, the ACU economy, the
// Dominion Score, the 90-day rollout and honest success criteria. White-hat only.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Crosshair, ShieldCheck, ShieldAlert, ArrowRight, Gauge, Swords, CheckCircle2 } from "lucide-react";
import { PageHeader, Pill, HowToUse } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Mod = { id: string; name: string; tagline: string; capabilities: string[]; status: "live" | "foundation" | "connect" | "blueprint"; route?: string };
type Agent = { id: string; name: string; module: string; fn: string; sentinel?: boolean };
type Info = {
  doctrine: string;
  honesty: { guaranteed: string; notGuaranteed: string; realClaim: string; differentiator: string };
  modules: Mod[]; sentinelBlocked: string[]; swarm: Agent[];
  acuPricing: { action: string; acu: number }[]; tiers: { tier: string; acu: string; note: string }[];
  vitals: { key: string; label: string; desc: string }[];
  rollout: { phase: string; days: string; deliver: string }[]; success: { metric: string; target: string }[];
};

const TONE: Record<string, "good" | "info" | "warn" | "neutral"> = { live: "good", foundation: "info", connect: "warn", blueprint: "neutral", connected: "good" };
// Modules that a live Search Console connection actually feeds (index status +
// rank matrix; SERP-feature positions). They flip from "connect a source" →
// "source connected" the moment Search Console is live.
const GSC_FED = new Set(["MW-14", "MW-20"]);
const LABEL: Record<string, string> = { live: "live", foundation: "ready", connect: "connect a source", blueprint: "blueprint", connected: "source connected" };
const VF: { key: string; label: string }[] = [
  { key: "organicShare", label: "Organic share" }, { key: "featureOwnership", label: "Feature ownership" },
  { key: "answerShare", label: "Answer share" }, { key: "authorityVelocity", label: "Authority velocity" },
  { key: "defenceIntegrity", label: "Defence integrity" },
];

export default function OmnirankPage() {
  const { activeBrand } = useActiveBrand();
  const [info, setInfo] = useState<Info | null>(null);
  const [dv, setDv] = useState<Record<string, number>>({});
  const [dom, setDom] = useState<{ score: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // Live Search Console → auto-fills the organic vital + flips SC-fed modules.
  const [gsc, setGsc] = useState<{ connected: boolean; avgPosition?: number; clicks?: number; impressions?: number; site?: string; needsSelection?: boolean; sites?: string[]; note?: string } | null>(null);

  useEffect(() => { fetch("/api/omnirank").then((r) => r.json()).then(setInfo).catch(() => setInfo(null)); }, []);

  const scoreWith = useCallback(async (inputs: Record<string, number>) => {
    const r = await fetch("/api/omnirank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dominion", inputs }) });
    setDom(await r.json());
  }, []);

  // Pull real Search Console figures for the active brand and translate them into
  // the measurable vital (organic strength from average position). Other vitals
  // stay 0 until rank/AI-citation/backlink sources connect — never invented.
  useEffect(() => {
    if (!activeBrand) return;
    let on = true;
    (async () => {
      try {
        const r = await authedFetch("/api/seo-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "search-console", brandId: activeBrand.id, website: (activeBrand as { website?: string }).website }) });
        const d = await r.json();
        if (!on) return;
        if (d.connected && d.report?.totals) {
          const t = d.report.totals as { avgPosition: number; clicks: number; impressions: number };
          setGsc({ connected: true, avgPosition: t.avgPosition, clicks: t.clicks, impressions: t.impressions, site: d.siteUrl });
          // Average position → 0-100 organic strength (pos 1 ≈ 100, pos 21 ≈ 0).
          const organicShare = Math.max(0, Math.min(100, Math.round(105 - (t.avgPosition || 20) * 5)));
          const inputs = { organicShare };
          setDv(inputs);
          scoreWith(inputs);
        } else setGsc({ connected: false, needsSelection: Boolean(d.needsSelection), sites: Array.isArray(d.sites) ? d.sites.map((x: { siteUrl: string }) => x.siteUrl) : [], note: typeof d.note === "string" ? d.note : "" });
      } catch { if (on) setGsc({ connected: false }); }
    })();
    return () => { on = false; };
  }, [activeBrand, scoreWith]);

  async function score() {
    setBusy(true);
    try { await scoreWith(dv); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="Long-game SEO"
        title="Get found on Google and in AI answers"
        subtitle="The slow, compounding channel. Connect Google Search Console and we handle the rest — content, technical fixes, links and AI-answer capture. Expect first movement in 6–12 weeks, not this week."
        actions={<Pill tone="info">runs in the background</Pill>}
      />

      {/* Expectation management — the honest timeline, stated before anything else.
          SEO is a 3-6 month channel; a customer judging it in week 1 will wrongly
          conclude the platform does not work. Say so plainly, up front. */}
      <div className="mb-6 card border-amber-500/25 bg-amber-500/[0.04] p-5">
        <h2 className="font-display text-sm font-bold text-white">Read this first — what to expect, and when</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-ink-950/50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-300">Weeks 1–4</p>
            <p className="mt-1 text-sm text-slate-300">Groundwork. Posts published, technical fixes applied, links pitched.</p>
            <p className="mt-1 text-[11px] text-slate-500">Expect no new customers yet. This is normal.</p>
          </div>
          <div className="rounded-lg bg-ink-950/50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-300">Weeks 6–12</p>
            <p className="mt-1 text-sm text-slate-300">First movement: impressions rise, long-tail rankings appear, first AI citations.</p>
            <p className="mt-1 text-[11px] text-slate-500">Measured in Search Console, not guessed.</p>
          </div>
          <div className="rounded-lg bg-ink-950/50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-300">Month 4+</p>
            <p className="mt-1 text-sm text-slate-300">Compounding traffic and enquiries from search.</p>
            <p className="mt-1 text-[11px] text-slate-500">This is where SEO pays back.</p>
          </div>
        </div>
        <p className="mt-3 rounded-md bg-ink-900/60 px-3 py-2 text-xs text-slate-300">
          <span className="font-semibold text-white">Need customers sooner?</span> SEO is the long game — it will not produce a sale this week.
          For revenue in days, use <Link href="/dashboard/customers" className="font-semibold text-emerald-400 hover:text-emerald-300">Customer Vault</Link> (win back past buyers),{" "}
          <Link href="/dashboard/email" className="font-semibold text-emerald-400 hover:text-emerald-300">Email</Link> and{" "}
          <Link href="/dashboard/landing-pages" className="font-semibold text-emerald-400 hover:text-emerald-300">Landing Pages</Link>. Run both: fast channels now, SEO compounding behind them.
        </p>
      </div>

      {/* The two things that actually start it */}
      <div className="mb-8 card border-emerald-500/25 p-5">
        <h2 className="mb-1 font-display text-sm font-bold text-white">Start it in two steps</h2>
        <p className="mb-3 text-xs text-slate-400">That is genuinely all you do. Everything below this is detail you never have to touch.</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/seo-autopilot" className="btn-primary">Set your topics + switch on autopilot →</Link>
          <Link href="/dashboard/organic" className="btn-ghost">See your search data</Link>
        </div>
        {/* Honest about who connects Search Console. It is a platform-level
            service-account connection made by the MarketWar team, NOT self-serve —
            the Go-Live board is operator-only, so pointing a customer at it sent
            them to an "Operator only" wall. */}
        <p className="mt-3 rounded-md bg-ink-900/60 px-3 py-2 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">Search Console:</span> your rankings appear once your site is linked to our Search Console access — we set that up with you during onboarding, there is nothing for you to configure. Ask your MarketWar contact if the figures below are still zero after 48 hours.
        </p>
      </div>

      <HowToUse
        does="The long-game channel: content, technical health, links and AI-answer capture, running in the background. Figures fill in from Search Console — never invented."
        steps={[
          "1. Connect Google Search Console (Go-Live board) so results can be measured.",
          "2. Set your topics and switch on SEO Autopilot — it publishes for you.",
          "3. Check back monthly. Judge it at 90 days, not 9 days.",
        ]}
        connector="Search Console unlocks the measurement panels below. Without it we show zeros rather than estimates."
      />

      {/* Strategic honesty */}
      {info && (
        <div className="mb-8 grid gap-3 lg:grid-cols-2">
          <div className="card border-emerald-500/25 bg-emerald-500/[0.05] p-4">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> What OMNIRANK guarantees</p>
            <p className="text-xs leading-relaxed text-slate-300">{info.honesty.guaranteed}</p>
            <p className="mt-2 text-xs leading-relaxed text-emerald-200/80">{info.honesty.realClaim}</p>
          </div>
          <div className="card border-amber-500/25 bg-amber-500/[0.05] p-4">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-300"><ShieldAlert className="h-3.5 w-3.5" /> What nothing can guarantee</p>
            <p className="text-xs leading-relaxed text-slate-300">{info.honesty.notGuaranteed}</p>
            <p className="mt-2 text-xs leading-relaxed text-amber-200/80">Our edge: {info.honesty.differentiator}</p>
          </div>
        </div>
      )}

      {/* Sentinel gate */}
      {info?.sentinelBlocked && (
        <div className="mb-8 card border-rose-500/25 bg-rose-500/[0.04] p-5">
          <div className="mb-2 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-rose-300" /><h2 className="font-display text-sm font-bold text-white">MW-A45 Sentinel — compliance hard-gate</h2><Pill tone="good">enforced</Pill></div>
          <p className="mb-2 text-xs text-slate-400">Every outbound action passes Sentinel before execution. These classes are <span className="font-semibold text-rose-300">hard-blocked</span> (not warned) — they get sites penalised, so the graph refuses them:</p>
          <div className="flex flex-wrap gap-1.5">
            {info.sentinelBlocked.map((b) => <span key={b} className="rounded-full border border-rose-500/30 bg-rose-500/[0.08] px-2 py-0.5 text-[11px] text-rose-200 line-through decoration-rose-400/60">{b}</span>)}
          </div>
        </div>
      )}

      {/* Dominion Score */}
      {info && (
        <div className="mb-8 card p-5">
          <div className="mb-2 flex items-center gap-2"><Gauge className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">Dominion Score</h2></div>
          <p className="mb-3 text-xs text-slate-500">Composite of the five vitals (0–100 each; unmeasured = 0). Real figures fill when Search Console, rank and AI-citation sources connect — never invented.</p>
          {gsc && !gsc.connected && gsc.needsSelection && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[11px] text-amber-100">
              <p className="font-semibold">No Search Console property is linked to this brand yet.</p>
              <p className="mt-0.5 text-slate-400">{gsc.note}</p>
              {Boolean(gsc.sites?.length) && (
                <p className="mt-1 text-slate-400">
                  Verified in the connected Google account: {gsc.sites!.slice(0, 6).map((sName) => <span key={sName} className="mr-1 font-mono text-slate-300">{sName}</span>)}
                  {gsc.sites!.length > 6 ? `…and ${gsc.sites!.length - 6} more` : ""}
                </p>
              )}
              <p className="mt-1 text-slate-500">Rankings stay empty rather than showing a different site&apos;s numbers — another property&apos;s clicks are not this brand&apos;s data.</p>
            </div>
          )}
          {gsc?.connected && (
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 text-[11px] text-slate-300">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Search Console live</span>
              <span>Avg position <span className="font-semibold text-white">{gsc.avgPosition}</span></span>
              <span>Clicks <span className="font-semibold text-white">{gsc.clicks?.toLocaleString()}</span></span>
              <span>Impressions <span className="font-semibold text-white">{gsc.impressions?.toLocaleString()}</span></span>
              <span className="text-slate-500">→ Organic share auto-filled from your live average position. Other vitals stay 0 until rank/AI-citation/backlink sources connect.</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {VF.map((f) => (
              <label key={f.key} className="text-[11px] text-slate-400">{f.label}
                <input type="number" min={0} max={100} className="input mt-0.5 w-full" placeholder="0" value={dv[f.key] ?? ""} onChange={(e) => setDv((s) => { const v = e.target.value; const n = { ...s }; if (v === "") delete n[f.key]; else n[f.key] = Number(v); return n; })} />
              </label>
            ))}
          </div>
          <button className="btn-primary mt-3" onClick={score} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />} Compute</button>
          {dom && <div className="mt-3 inline-flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3"><p className="font-display text-4xl font-bold text-emerald-300">{dom.score}</p><p className="text-[10px] text-slate-500">dominion<br/>/100</p></div>}
        </div>
      )}

      {/* Everything below is reference detail. A customer never needs it, so it is
          collapsed by default — 22 module codes and 45 codenamed agents on first
          load read as noise and damage trust in the parts that work. */}
      <details className="mb-8 rounded-xl border border-white/10 bg-ink-950/40 p-4">
        <summary className="cursor-pointer list-none text-sm font-bold text-slate-300 hover:text-white">
          Under the bonnet — modules, agents and the 90-day plan ▾
          <span className="ml-2 text-[11px] font-normal text-slate-500">(reference only — nothing here needs your attention)</span>
        </summary>
        <div className="mt-4">

      {/* Module registry */}
      {info?.modules && (
        <div className="mb-8">
          <h2 className="mb-3 font-display text-sm font-bold text-white">Module registry · MW-14 → MW-22</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {info.modules.map((m) => {
              const inner = (
                <>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold text-white">{m.id} · {m.name}</span>
                    <Pill tone={TONE[m.status]}>{LABEL[m.status]}</Pill>
                  </div>
                  <p className="mb-2 text-[11px] italic text-slate-500">{m.tagline}</p>
                  <ul className="space-y-0.5">{m.capabilities.map((c) => <li key={c} className="text-[11px] text-slate-400">· {c}</li>)}</ul>
                  {m.route && <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">Open engine <ArrowRight className="h-3 w-3" /></p>}
                </>
              );
              return m.route ? <Link key={m.id} href={m.route} className="card p-4 transition hover:border-emerald-500/40">{inner}</Link> : <div key={m.id} className="card p-4">{inner}</div>;
            })}
          </div>
        </div>
      )}

      {/* APEX swarm */}
      {info?.swarm && (
        <div className="mb-8">
          <h2 className="mb-1 font-display text-sm font-bold text-white">APEX Swarm · {info.swarm.length} agents</h2>
          <p className="mb-3 text-xs text-slate-500">LangGraph supervisor-worker. SENSE every 4h · DECIDE every 12h · BUILD/STRIKE daily · DEFEND continuous.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {info.swarm.map((a) => (
              <div key={a.id} className={`card p-3 ${a.sentinel ? "border-rose-500/30" : ""}`}>
                <p className="text-xs font-bold text-white">{a.sentinel && <Swords className="mr-1 inline h-3 w-3 text-rose-300" />}{a.name} <span className="font-mono text-[10px] text-slate-500">{a.id} · {a.module}</span></p>
                <p className="text-[11px] leading-snug text-slate-400">{a.fn}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACU economy + tiers */}
      {info?.acuPricing && (
        <div className="mb-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="card p-5">
            <h2 className="mb-3 font-display font-bold text-white">ACU action economy</h2>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><tbody>
              {info.acuPricing.map((r) => (<tr key={r.action} className="border-b border-ink-800 last:border-0"><td className="py-1.5 text-slate-300">{r.action}</td><td className="py-1.5 text-right font-display font-bold text-emerald-300">{r.acu} ACU</td></tr>))}
            </tbody></table></div>
          </div>
          <div className="card p-5">
            <h2 className="mb-3 font-display font-bold text-white">Tiers</h2>
            <div className="space-y-2">
              {info.tiers.map((t) => (<div key={t.tier} className="rounded-lg border border-ink-700 bg-ink-850/60 p-3"><p className="font-display text-sm font-bold text-white">{t.tier} <span className="text-emerald-300">{t.acu}</span></p><p className="text-[11px] text-slate-500">{t.note}</p></div>))}
            </div>
          </div>
        </div>
      )}

      {/* Rollout + success */}
      {info?.rollout && (
        <div className="mb-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="card p-5">
            <h2 className="mb-3 font-display font-bold text-white">90-day rollout</h2>
            <div className="space-y-2">{info.rollout.map((p) => (<div key={p.phase} className="rounded-lg border border-ink-700 bg-ink-850/60 p-3"><p className="font-display text-xs font-bold text-emerald-300">{p.phase} <span className="text-slate-500">· days {p.days}</span></p><p className="text-[11px] text-slate-500">{p.deliver}</p></div>))}</div>
          </div>
          <div className="card p-5">
            <h2 className="mb-3 font-display font-bold text-white">Success criteria (90 days)</h2>
            <table className="w-full text-left text-xs"><tbody>
              {info.success.map((s) => (<tr key={s.metric} className="border-b border-ink-800 last:border-0"><td className="py-1.5 text-slate-400">{s.metric}</td><td className="py-1.5 text-right font-semibold text-white">{s.target}</td></tr>))}
            </tbody></table>
          </div>
        </div>
      )}

        </div>
      </details>

      <div className="card border-emerald-500/25 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2"><Crosshair className="mt-0.5 h-5 w-5 text-emerald-400" /><div>
            <h2 className="font-display font-bold text-white">Sits on top of the Search Dominance Engine</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-400">OMNIRANK is the execution + defence layer; the Search Dominance Engine holds the strategy, scoring and 53-agent workforce. Together they close the loop: listening → intelligence → AI-answer capture → authority acquisition → defence.</p>
          </div></div>
          <Link href="/dashboard/search-dominance" className="btn-primary shrink-0">Search Dominance Engine <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </div>
  );
}
