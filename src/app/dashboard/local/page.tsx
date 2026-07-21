"use client";

// Local Domination Engine — own-your-postcode command surface.
// Map-pack rank estimate, Google Business Profile completeness, review
// velocity/rating trend, local-SEO citation gaps and a prioritized local action
// list. Wired to /api/local (backed by src/backend/local.ts). Works with zero
// config on the active brand; live GBP/map-pack/citation feeds plug in later.
// Every figure is a DETERMINISTIC ESTIMATE, clearly badged — never fake telemetry.

import { useEffect, useState } from "react";
import { Loader2, MapPin, Star, ListChecks, Building2 } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { AreaChart, Sparkline } from "@/components/charts";
import { PageHeader, Pill, StatCard, ScoreBar } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type ProfileStatus = "present" | "weak" | "missing";
type CitationStatus = "listed" | "inconsistent" | "missing";
type LocalAction = { priority: number; title: string; detail: string; category: string; impact: "high" | "medium" | "low" };
type Report = {
  business: string;
  location: string;
  mapPackRank: number;
  mapPackTarget: number;
  visibilityScore: number;
  profile: { completeness: number; signals: { label: string; status: ProfileStatus; impact: number }[] };
  reviews: { rating: number; totalReviews: number; velocityPerMonth: number; leaderVelocityPerMonth: number; ratingTrend: number[]; reviewTrend: number[] };
  citations: { directory: string; status: CitationStatus; authority: number }[];
  monthlyViews: { labels: string[]; mapViews: number[]; searchViews: number[] };
  actions: LocalAction[];
  estimate: true;
  note: string;
};

const statusTone: Record<ProfileStatus | CitationStatus, "good" | "warn" | "bad"> = {
  present: "good", listed: "good", weak: "warn", inconsistent: "warn", missing: "bad",
};
const impactTone = (i: LocalAction["impact"]): "good" | "warn" | "bad" => (i === "high" ? "bad" : i === "medium" ? "warn" : "neutral") as "good" | "warn" | "bad";

export default function LocalDominationPage() {
  const { activeBrand } = useActiveBrand();
  const [business, setBusiness] = useState("");
  const [location, setLocation] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed from the active brand; re-seed + clear on brand switch (blank if none).
  useEffect(() => {
    setBusiness(activeBrand?.name ?? "");
    setLocation(activeBrand?.location ?? "");
    setReport(null);
  }, [activeBrand?.id]);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business, location }),
      });
      setReport(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Local Domination Engine"
        title="Own your postcode"
        subtitle="Map-pack rank estimate, Google Business Profile completeness, review velocity and rating trend, local-SEO citation gaps and a prioritized local action list — the channels ad platforms can't rent back to you. Every figure is a directional estimate until live local feeds are connected."
        actions={<Pill tone="info">map-pack · GBP · reviews · citations</Pill>}
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Business</label><input className="input" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Your business name" /></div>
          <div><label className="label">Location</label><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Brixton, London (SW9)" /></div>
        </div>
        <button className="btn-primary mt-4" onClick={run} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing local presence…</> : <><MapPin className="h-4 w-4" /> Build my domination plan</>}
        </button>
      </div>

      {!report && (
        <div className="mb-8 card border-dashed border-white/10 p-10 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-emerald-400/70" />
          <p className="font-display font-bold text-white">No local intelligence yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">Enter a business and location, then run the engine to compute your map-pack rank, profile gaps, review velocity and prioritized local actions.</p>
        </div>
      )}

      {report && (
        <div className="mb-8 space-y-6">
          {/* Headline estimates */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Map pack rank" value={`#${report.mapPackRank}`} sub={`estimate · target #${report.mapPackTarget}`} tone={report.mapPackRank <= report.mapPackTarget ? "good" : report.mapPackRank <= 6 ? "warn" : "bad"} />
            <StatCard label="Local visibility" value={`${report.visibilityScore}`} sub="composite estimate /100" tone={report.visibilityScore >= 70 ? "good" : report.visibilityScore >= 45 ? "warn" : "bad"} />
            <StatCard label="Review velocity" value={`${report.reviews.velocityPerMonth}/mo`} sub={`pack leader: ${report.reviews.leaderVelocityPerMonth}/mo`} tone={report.reviews.velocityPerMonth >= report.reviews.leaderVelocityPerMonth ? "good" : "warn"} />
            <StatCard label="Rating" value={`${report.reviews.rating.toFixed(1)}★`} sub={`${report.reviews.totalReviews} reviews (est.)`} tone={report.reviews.rating >= 4.3 ? "good" : report.reviews.rating >= 3.8 ? "warn" : "bad"} />
          </div>

          {/* Local visibility trend */}
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display font-bold text-white">Local visibility — 6 months (estimate)</h2>
              <Pill tone="neutral">deterministic demo</Pill>
            </div>
            <AreaChart
              labels={report.monthlyViews.labels}
              series={[
                { name: "Map pack views", data: report.monthlyViews.mapViews },
                { name: "Local search views", data: report.monthlyViews.searchViews },
              ]}
              height={220}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* GBP completeness */}
            <div className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-emerald-400" />
                <h2 className="font-display font-bold text-white">Google Business Profile</h2>
                <Pill tone={report.profile.completeness >= 75 ? "good" : report.profile.completeness >= 50 ? "warn" : "bad"}>{report.profile.completeness}% complete</Pill>
              </div>
              <div className="mb-3"><ScoreBar label="Profile completeness" score={report.profile.completeness} /></div>
              <ul className="space-y-2 text-sm">
                {report.profile.signals.map((sig) => (
                  <li key={sig.label} className="flex items-center justify-between gap-2">
                    <span className="text-slate-300">{sig.label}</span>
                    <Pill tone={statusTone[sig.status]}>{sig.status}</Pill>
                  </li>
                ))}
              </ul>
            </div>

            {/* Reviews + citations */}
            <div className="space-y-6">
              <div className="card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-emerald-400" />
                    <h2 className="font-display font-bold text-white">Reviews & rating trend</h2>
                  </div>
                  <Sparkline data={report.reviews.reviewTrend} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <p><span className="text-slate-500">Rating:</span> <span className="text-white">{report.reviews.rating.toFixed(1)}★</span></p>
                  <p><span className="text-slate-500">Reviews:</span> <span className="text-white">{report.reviews.totalReviews}</span></p>
                  <p><span className="text-slate-500">Velocity:</span> <span className="text-white">{report.reviews.velocityPerMonth}/mo</span></p>
                  <p><span className="text-slate-500">Leader:</span> <span className="text-white">{report.reviews.leaderVelocityPerMonth}/mo</span></p>
                </div>
              </div>

              <div className="card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-emerald-400" />
                  <h2 className="font-display font-bold text-white">Citation coverage</h2>
                </div>
                <ul className="space-y-2 text-sm">
                  {report.citations.map((c) => (
                    <li key={c.directory} className="flex items-center justify-between gap-2">
                      <span className="text-slate-300">{c.directory} <span className="text-xs text-slate-500">· authority {c.authority}</span></span>
                      <Pill tone={statusTone[c.status]}>{c.status}</Pill>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Prioritized actions */}
          <div className="card p-5">
            <h2 className="mb-4 font-display font-bold text-white">Prioritized local actions</h2>
            {report.actions.length === 0 ? (
              <p className="text-sm text-slate-400">No high-priority gaps surfaced — local presence looks strong on the estimated signals. Keep review velocity and posts current.</p>
            ) : (
              <div className="space-y-3">
                {report.actions.map((a) => (
                  <div key={a.title} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-white">{a.title}</span>
                      <div className="flex items-center gap-2">
                        <Pill tone="neutral">{a.category}</Pill>
                        <Pill tone={impactTone(a.impact)}>{a.impact} impact</Pill>
                        <Pill tone={a.priority >= 70 ? "bad" : a.priority >= 50 ? "warn" : "neutral"}>priority {a.priority}</Pill>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">{a.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500">{report.note}</p>
        </div>
      )}

      <AgentRunner
        agentId="local-growth"
        buttonLabel="Build my domination plan"
        fields={[
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "location", label: "Location", defaultValue: "Brixton, London (SW9)" },
          { key: "serviceAreas", label: "Service areas", defaultValue: "SW9, SW2, SW4, SE24" },
          { key: "product", label: "Product / service", defaultValue: "Flame-grilled meals, family platters, office catering", textarea: true },
        ]}
      />
    </div>
  );
}
