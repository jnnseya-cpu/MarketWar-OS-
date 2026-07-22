"use client";

// AI Audience Segmentation — profitable-segment command surface (Brevo Module 19).
// RFM/LTV/churn/intent → ranked segments with per-segment offer/channel/follow-up.
// Wired to /api/segments. Works on a demo customer base with zero config; live
// data plugs in via the CDP import. Only consented contacts are marketing-eligible.

import { useState } from "react";
import { Loader2, Users, Layers, Play } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill, StatCard } from "@/components/ui";

type Segment = { key: string; label: string; size: number; consentedSize: number; revenuePotentialGbp: number; recommendedOffer: string; recommendedChannel: string; recommendedFollowUp: string; campaignPriority: number };
type Report = { business: string; totalCustomers: number; consentedShare: number; segments: Segment[]; note: string };

const prTone = (n: number): "good" | "warn" | "neutral" => (n >= 80 ? "good" : n >= 60 ? "warn" : "neutral");

export default function SegmentsPage() {
  const [business, setBusiness] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/segments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business }) });
      setReport(await res.json());
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="AI Audience Segmentation · CDP"
        title="Turn the customer base into profitable segments"
        subtitle="RFM + LTV + churn + intent scoring auto-builds the segments worth acting on — hot leads, VIPs, high-LTV, repeat, churn-risk, referral-ready — each with a recommended offer, channel and follow-up, ranked by campaign priority. Only consented contacts are marketing-eligible; the follow-up engine enforces frequency caps and opt-out."
        actions={<Pill tone="info">RFM · LTV · churn · consent-gated</Pill>}
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <label className="label">Business</label>
        <input className="input" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Your business name" />
        <button className="btn-primary mt-4" onClick={run} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Segmenting…</> : <><Layers className="h-4 w-4" /> Build segments</>}
        </button>
      </div>

      {report && (
        <div className="mb-6">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Customers" value={`${report.totalCustomers}`} />
            <StatCard label="Consented" value={`${Math.round(report.consentedShare * 100)}%`} tone="good" sub="marketing-eligible" />
            <StatCard label="Segments" value={`${report.segments.length}`} />
          </div>
          <div className="space-y-3">
            {report.segments.map((sg) => (
              <div key={sg.key} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-400" />
                    <span className="font-display font-bold text-white">{sg.label}</span>
                    <Pill tone="neutral">{sg.consentedSize}/{sg.size} consented</Pill>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-emerald-300">~£{sg.revenuePotentialGbp}</span>
                    <Pill tone={prTone(sg.campaignPriority)}>priority {sg.campaignPriority}</Pill>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <p><span className="text-slate-500">Offer:</span> <span className="text-slate-300">{sg.recommendedOffer}</span></p>
                  <p><span className="text-slate-500">Channel:</span> <span className="text-slate-300">{sg.recommendedChannel}</span></p>
                  <p><span className="text-slate-500">Follow-up:</span> <span className="text-slate-300">{sg.recommendedFollowUp}</span></p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">{report.note}</p>
        </div>
      )}

      <AgentRunner agentId="audience-segmentation" buttonLabel="Segment & plan activation" fields={[
        { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
        { key: "industry", label: "Industry", defaultValue: "restaurant / food delivery" },
      ]} />
    </div>
  );
}
