"use client";

// OMNIRANK Dominion Dashboard (ES-05) — the execution + defence layer.
// Presents the module registry (MW-14→22, linked to live OS engines), the
// 22-agent APEX swarm, the Sentinel compliance hard-gate, the ACU economy, the
// Dominion Score, the 90-day rollout and honest success criteria. White-hat only.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Crosshair, ShieldCheck, ShieldAlert, ArrowRight, Gauge, Swords } from "lucide-react";
import { PageHeader, Pill, HowToUse } from "@/components/ui";

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

const TONE: Record<string, "good" | "info" | "warn" | "neutral"> = { live: "good", foundation: "info", connect: "warn", blueprint: "neutral" };
const LABEL: Record<string, string> = { live: "live", foundation: "ready", connect: "connect a source", blueprint: "blueprint" };
const VF: { key: string; label: string }[] = [
  { key: "organicShare", label: "Organic share" }, { key: "featureOwnership", label: "Feature ownership" },
  { key: "answerShare", label: "Answer share" }, { key: "authorityVelocity", label: "Authority velocity" },
  { key: "defenceIntegrity", label: "Defence integrity" },
];

export default function OmnirankPage() {
  const [info, setInfo] = useState<Info | null>(null);
  const [dv, setDv] = useState<Record<string, number>>({});
  const [dom, setDom] = useState<{ score: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/omnirank").then((r) => r.json()).then(setInfo).catch(() => setInfo(null)); }, []);

  async function score() {
    setBusy(true);
    try {
      const r = await fetch("/api/omnirank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dominion", inputs: dv }) });
      setDom(await r.json());
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="OMNIRANK Dominion Stack · ES-05"
        title="Own the search. Win the answer. Capture the customer."
        subtitle={info?.doctrine || "Manufacture the conditions under which a ranking is inevitable — then defend the position with automated counter-fire. White-hat only."}
        actions={<Pill tone="info">22 modules · 45 agents · 1 graph</Pill>}
      />

      <HowToUse
        does="Your search-domination command centre. Some engines run now; others switch on when you connect a data source (each card tells you which)."
        steps={[
          "1. Use the live engines now — open Content Velocity, Social Amplification, Competitor Displacement and the SEO Workbench (green 'live' cards).",
          "2. To turn on rank tracking, AI-citation and backlink modules, connect your site + Google Search Console (the 'connect a source' cards link there).",
          "3. Score yourself with the Dominion Score below — it auto-fills with real figures once those sources are connected.",
        ]}
        connector="Google Search Console + a rank/backlink data source unlock the measurement modules — the strategy, content and defence engines already work."
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {VF.map((f) => (
              <label key={f.key} className="text-[11px] text-slate-400">{f.label}
                <input type="number" min={0} max={100} className="input mt-0.5 w-full" placeholder="0" onChange={(e) => setDv((s) => { const v = e.target.value; const n = { ...s }; if (v === "") delete n[f.key]; else n[f.key] = Number(v); return n; })} />
              </label>
            ))}
          </div>
          <button className="btn-primary mt-3" onClick={score} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />} Compute</button>
          {dom && <div className="mt-3 inline-flex items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3"><p className="font-display text-4xl font-bold text-emerald-300">{dom.score}</p><p className="text-[10px] text-slate-500">dominion<br/>/100</p></div>}
        </div>
      )}

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
