"use client";

// Influencer Recruitment (per brand) — every brand recruits its own creators,
// supported by the AI recruitment agent. Shows WHO to recruit for THIS brand,
// the commission model, and a live payout split calculator. The public
// application page (/growth) is where creators apply; here the brand plans who
// to bring in and shares its programme.

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Users, Sparkles, Copy, Calculator, Share2, CheckCircle2 } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import ExportButton from "@/components/ExportButton";
import { COMMISSION_MODEL, computeCreatorSplit, MIN_PAYOUT_FOLLOWERS, MAX_PROGRAMMES } from "@/shared/creator-program";

type Profile = { profile: string; why: string; whereToFind: string; suggestedTier: string; searchTerms: string[] };
type Result = { mode: "live" | "scaffold"; business: string; angle: string; profiles: Profile[]; outreachOpener: string; note: string };

const tierLabel: Record<string, string> = { micro: "Micro", authority: "Authority", local_viral: "Local viral" };

export default function InfluencersPage() {
  const { activeBrand } = useActiveBrand();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [revenue, setRevenue] = useState(5000);
  const [partners, setPartners] = useState<{ id: string; name: string; followers: number; tier: string; scoutScore?: number; payoutEligible: boolean }[]>([]);

  useEffect(() => {
    authedFetch("/api/creator-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_creators" }) })
      .then((r) => (r.ok ? r.json() : { creators: [] })).then((d) => setPartners(d.creators || [])).catch(() => {});
  }, []);

  async function run() {
    setBusy(true); setError(null);
    try {
      const res = await authedFetch("/api/creator-recruitment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: activeBrand?.name || "your business",
          industry: activeBrand?.industry, product: activeBrand?.product,
          audience: activeBrand?.audience, location: activeBrand?.location,
        }),
      });
      const data = await res.json().catch(() => ({}));
      // Only accept a well-formed result — never render a partial/error object.
      if (!res.ok || !Array.isArray(data.profiles)) {
        setError(data.error || "Couldn't build the recruitment list — please try again.");
        return;
      }
      setResult(data as Result);
    } catch {
      setError("Network error — please try again.");
    } finally { setBusy(false); }
  }

  const split = computeCreatorSplit(revenue);

  return (
    <div>
      <PageHeader
        kicker="Influencer Recruitment · per brand"
        title="Recruit the creators who move your market"
        subtitle="Every brand recruits its own creators — the AI agent tells you exactly who to bring in for your niche (trust travels within a niche, so we target educators, operators and reviewers, not vanity followers). Creators apply on your programme, get a code/link, and earn 0.75% per referred customer."
        actions={<Pill tone="info">niche-first · AI-guided</Pill>}
      />

      {!activeBrand && (
        <div className="mb-6 card border-emerald-500/20 p-10 text-center">
          <Users className="mx-auto mb-2 h-7 w-7 text-emerald-500/60" />
          <h2 className="font-display text-lg font-bold text-white">Add a brand to plan recruitment</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Pick or add a brand in the switcher — the agent recommends who to recruit for that brand&rsquo;s niche.</p>
        </div>
      )}

      {activeBrand && (
        <div className="mb-6 card border-emerald-500/30 p-6">
          <div className="mb-2 flex items-center gap-2"><Sparkles className="h-5 w-5 text-emerald-400" /><h2 className="font-display text-lg font-bold text-white">Who should {activeBrand.name} recruit?</h2></div>
          <p className="mb-4 text-sm text-slate-400">The recruitment agent builds a niche-specific target list from your brand — creator profiles, why they fit, where to find them, and a ready outreach opener.</p>
          <button className="btn-primary" onClick={run} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Building your target list…</> : <><Users className="h-4 w-4" /> Recommend creators to recruit</>}
          </button>
          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        </div>
      )}

      {result && (
        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Pill tone={result.mode === "live" ? "good" : "warn"}>{result.mode === "live" ? "AI recommendation" : "Structural scaffold"}</Pill><span className="text-xs text-slate-500">{result.profiles.length} profiles</span></div>
            <ExportButton dataset="creator-recruitment" label="Export target list"
              rows={result.profiles.map((p) => ({ profile: p.profile, tier: p.suggestedTier, why: p.why, whereToFind: p.whereToFind, searchTerms: p.searchTerms.join("; ") }))}
              report={{ title: `Creator recruitment — ${result.business}`, bodyHtml: `<h2>Angle</h2>\n${result.angle}\n\n<h2>Outreach opener</h2>\n${result.outreachOpener}\n\n<h2>Profiles</h2>\n${result.profiles.map((p) => "• " + p.profile + " — " + p.why).join("\n")}` }}
            />
          </div>

          <div className="card border-emerald-500/20 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Best pitch angle</p>
            <p className="mt-1 text-sm text-slate-200">{result.angle}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {result.profiles.map((p, i) => (
              <div key={i} className="card p-4">
                <div className="flex items-center gap-2"><h3 className="font-display text-sm font-bold text-white">{p.profile}</h3><Pill tone="neutral">{tierLabel[p.suggestedTier] || p.suggestedTier}</Pill></div>
                <p className="mt-1 text-xs text-slate-400">{p.why}</p>
                <p className="mt-1 text-[11px] text-slate-500">Find them: {p.whereToFind}</p>
                {p.searchTerms.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">{p.searchTerms.map((t) => <span key={t} className="rounded-md border border-white/[0.07] bg-ink-950/60 px-2 py-0.5 text-[11px] text-slate-300">{t}</span>)}</div>
                )}
              </div>
            ))}
          </div>

          {result.outreachOpener && (
            <div className="card p-5">
              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ready outreach opener</p>
                <button onClick={() => navigator.clipboard?.writeText(result.outreachOpener)} className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"><Copy className="h-3.5 w-3.5" /> Copy</button>
              </div>
              <p className="text-sm text-slate-200">{result.outreachOpener}</p>
            </div>
          )}
          {result.note && <p className="rounded-lg border border-white/10 bg-ink-900/50 p-3 text-xs text-slate-400">{result.note}</p>}
        </div>
      )}

      {/* Commission model + live split calculator */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-3 font-display font-bold text-white">The creator commission model</h3>
          <ul className="space-y-1.5">
            {COMMISSION_MODEL.map((c) => <li key={c} className="flex items-start gap-2 text-[13px] text-slate-300"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />{c}</li>)}
          </ul>
        </div>
        <div className="card p-6">
          <div className="mb-3 flex items-center gap-2"><Calculator className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Payout split calculator</h3></div>
          <label className="label">A referred user&rsquo;s verified revenue (£)</label>
          <input type="number" min={0} value={revenue} onChange={(e) => setRevenue(Math.max(0, Number(e.target.value)))} className="input" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3"><p className="text-xs text-slate-400">Creator earns</p><p className="font-display text-xl font-bold text-emerald-300">£{split.creatorGbp.toLocaleString()}</p></div>
            <div className="rounded-lg border border-white/[0.08] bg-ink-900/50 p-3"><p className="text-xs text-slate-400">Platform earns</p><p className="font-display text-xl font-bold text-white">£{split.platformGbp.toLocaleString()}</p></div>
          </div>
          <p className="mt-2 text-xs text-slate-500">{split.note}</p>
          <p className="mt-1 text-[11px] text-slate-600">Payout requires the creator to have {MIN_PAYOUT_FOLLOWERS.toLocaleString()}+ total followers.</p>
        </div>
      </div>

      {/* Live partner pool from the real network */}
      <div className="mb-6 card p-6">
        <div className="mb-3 flex items-center gap-2"><Users className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">Partners in your network</h3><Pill tone={partners.length ? "good" : "neutral"}>{partners.length}</Pill></div>
        {partners.length === 0 ? (
          <p className="text-sm text-slate-400">No partners registered yet. Share your application page below — approved partners appear here, and you subscribe them to programmes in the Partner Network.</p>
        ) : (
          <div className="space-y-2">
            {partners.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-ink-900/50 p-3 text-sm">
                <div><p className="font-semibold text-white">{p.name}</p><p className="text-xs text-slate-500">{p.followers.toLocaleString()} followers · {p.tier}{p.scoutScore != null ? ` · Scout ${p.scoutScore}` : ""}</p></div>
                {p.payoutEligible ? <Pill tone="good"><CheckCircle2 className="mr-1 inline h-3 w-3" />payable</Pill> : <Pill tone="warn">accruing (sub-10K)</Pill>}
              </div>
            ))}
          </div>
        )}
        <Link href="/dashboard/partner-network" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300 hover:text-emerald-200">Manage programmes + partners in the Partner Network →</Link>
      </div>

      <div className="card p-6">
        <div className="mb-2 flex items-center gap-2"><Share2 className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Share your programme</h3></div>
        <p className="text-sm text-slate-400">Send creators to the application page — they can subscribe to up to {MAX_PROGRAMMES} programmes and get a tracked code/link for each.</p>
        <Link href="/growth" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/25">Open the creator application page →</Link>
      </div>
    </div>
  );
}
