"use client";

// Reputation Shield — Trust, Reviews & Reputation command surface.
// TrustScore + sentiment + AI response drafting + manipulation check + social
// proof studio, wired to /api/reputation. Works zero-config on sample reviews;
// live review sources plug in at go-live. Ties trust to AI-search visibility.

import { useState } from "react";
import { Loader2, ShieldCheck, MessageSquare, Sparkles, AlertTriangle, Star } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill, StatCard } from "@/components/ui";

type Trust = { business: string; trustScore: number; averageRating: number; reviewCount: number; starDistribution: Record<string, number>; verifiedShare: number; positiveShare: number; negativeShare: number; aiVisibilityReadiness: number; verdict: string };
type Sentiment = { topicSentiment: { topic: string; mentions: number; sentiment: number }[]; painPoints: string[]; churnRiskSignals: string[]; customerHappiness: number; operationalPlan: string[] };

const tone = (n: number): "good" | "warn" | "bad" => (n >= 70 ? "good" : n >= 50 ? "warn" : "bad");

export default function ReputationPage() {
  const [business, setBusiness] = useState("");
  const [trust, setTrust] = useState<Trust | null>(null);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [busy, setBusy] = useState<"" | "trust" | "sentiment">("");

  async function run(action: "trust" | "sentiment") {
    setBusy(action);
    try {
      const res = await fetch("/api/reputation", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, business }),
      });
      const data = await res.json();
      if (action === "trust") setTrust(data); else setSentiment(data);
    } finally { setBusy(""); }
  }

  return (
    <div>
      <PageHeader
        kicker="Reputation Shield · Trust & Reviews"
        title="Turn reviews into trust, conversion and AI-search authority"
        subtitle="Compute your TrustScore, draft brand-aligned responses, extract operational intelligence from feedback, flag manipulation, and turn real reviews into social proof — plus ready them for AI-search visibility. Reviews are earned, never fabricated. Works on sample data with zero config; live review sources plug in at go-live."
        actions={<Pill tone="info">TrustScore · CX intel · social proof · AI authority</Pill>}
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <label className="label">Business</label>
        <input className="input" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Your business name" />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => run("trust")} disabled={busy === "trust"}>
            {busy === "trust" ? <><Loader2 className="h-4 w-4 animate-spin" /> Scoring…</> : <><ShieldCheck className="h-4 w-4" /> Compute TrustScore</>}
          </button>
          <button className="btn-ghost" onClick={() => run("sentiment")} disabled={busy === "sentiment"}>
            {busy === "sentiment" ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing…</> : <><Sparkles className="h-4 w-4" /> Sentiment & CX intel</>}
          </button>
        </div>
      </div>

      {trust && trust.reviewCount === 0 && (
        <div className="mb-6 card border-amber-500/25 bg-amber-500/[0.05] p-6">
          <div className="flex items-center gap-2"><Star className="h-5 w-5 text-amber-400" /><h3 className="font-display text-lg font-bold text-white">TrustScore is UNVERIFIED — no reviews connected</h3></div>
          <p className="mt-1.5 text-sm text-slate-400">{trust.verdict}</p>
          <p className="mt-2 text-xs text-slate-500">Doctrine: reviews are earned, never fabricated — so nothing here is invented. Paste your real reviews (or connect Google / Trustpilot / G2) and the TrustScore, sentiment, response drafts and social-proof assets all compute from your actual feedback.</p>
        </div>
      )}

      {trust && trust.reviewCount > 0 && (
        <div className="mb-6 card p-6">
          <div className="mb-3 flex items-center gap-2"><Star className="h-5 w-5 text-amber-400" /><h3 className="font-display text-lg font-bold text-white">{trust.business}</h3><Pill tone={tone(trust.trustScore)}>TrustScore {trust.trustScore}</Pill></div>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard label="Average" value={`${trust.averageRating}★`} tone={tone(trust.averageRating * 20)} />
            <StatCard label="Reviews" value={`${trust.reviewCount}`} sub={`${Math.round(trust.verifiedShare * 100)}% verified`} />
            <StatCard label="Positive" value={`${Math.round(trust.positiveShare * 100)}%`} tone="good" sub={`${Math.round(trust.negativeShare * 100)}% negative`} />
            <StatCard label="AI-visibility" value={`${trust.aiVisibilityReadiness}`} tone={tone(trust.aiVisibilityReadiness)} sub="recommended-by-AI readiness" />
          </div>
          <div className="mt-3 flex gap-1.5">
            {[5, 4, 3, 2, 1].map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-md border border-white/[0.07] bg-ink-900/50 px-2 py-1 text-xs text-slate-300">{s}★ {trust.starDistribution[String(s)] || 0}</span>
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold text-emerald-300">{trust.verdict}</p>
        </div>
      )}

      {sentiment && (
        <div className="mb-6 card p-6">
          <div className="mb-3 flex items-center gap-2"><MessageSquare className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">Sentiment & CX intelligence</h3><Pill tone={tone(sentiment.customerHappiness)}>happiness {sentiment.customerHappiness}</Pill></div>
          <div className="space-y-2">
            {sentiment.topicSentiment.map((t) => (
              <div key={t.topic} className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-ink-900/50 p-2.5 text-sm">
                <span className="text-slate-200">{t.topic} <span className="text-slate-500">· {t.mentions} mentions</span></span>
                <Pill tone={t.sentiment > 20 ? "good" : t.sentiment < 0 ? "bad" : "warn"}>{t.sentiment > 0 ? "+" : ""}{t.sentiment}</Pill>
              </div>
            ))}
          </div>
          {sentiment.churnRiskSignals.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-200"><AlertTriangle className="h-3.5 w-3.5" /> Churn signals</p>
              {sentiment.churnRiskSignals.map((s, i) => <p key={i} className="text-xs text-amber-200/80">· {s}</p>)}
            </div>
          )}
          <div className="mt-3"><p className="label">Operational plan</p><ol className="space-y-1 text-sm text-slate-300">{sentiment.operationalPlan.map((s, i) => <li key={i}>{i + 1}. {s}</li>)}</ol></div>
        </div>
      )}

      <AgentRunner agentId="reputation-guardian" buttonLabel="Run reputation analysis" fields={[
        { key: "business", label: "Business", defaultValue: "Your business" },
        { key: "industry", label: "Industry", defaultValue: "restaurant / food delivery" },
      ]} />
    </div>
  );
}
