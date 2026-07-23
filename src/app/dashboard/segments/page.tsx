"use client";

// AI Audience Segmentation — profitable-segment command surface (Brevo Module 19).
// RFM/LTV/churn/intent → ranked segments with per-segment offer/channel/follow-up.
// Wired to /api/segments, which builds segments from the ACTIVE brand's REAL
// Customer Vault (imported contacts). Empty vault → honest empty state, never a
// synthetic sample base. Only consented contacts are marketing-eligible.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Users, Layers, Upload } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import ExportButton from "@/components/ExportButton";
import { authedFetch } from "@/frontend/api-client";
import { brandDefaults, type Brand } from "@/shared/brand";

type Segment = { key: string; label: string; size: number; consentedSize: number; revenuePotentialGbp: number; recommendedOffer: string; recommendedChannel: string; recommendedFollowUp: string; campaignPriority: number };
type Report = { business: string; totalCustomers: number; consentedShare: number; segments: Segment[]; note: string };

const prTone = (n: number): "good" | "warn" | "neutral" => (n >= 80 ? "good" : n >= 60 ? "warn" : "neutral");

export default function SegmentsPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (brand: Brand) => {
    setBusy(true);
    try {
      const res = await authedFetch("/api/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: { id: brand.id, name: brand.name } }),
      });
      setReport(await res.json());
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (activeBrand) run(activeBrand);
    else setReport(null);
  }, [ready, activeBrand, run]);

  return (
    <div>
      <PageHeader
        kicker="AI Audience Segmentation · CDP"
        title="Turn the customer base into profitable segments"
        subtitle="RFM + LTV + churn + intent scoring auto-builds the segments worth acting on — hot leads, VIPs, high-LTV, repeat, churn-risk, referral-ready — each with a recommended offer, channel and follow-up, ranked by campaign priority. Built from your real Customer Vault; only consented contacts are marketing-eligible."
        actions={
          <div className="flex items-center gap-2">
            <Pill tone="info">RFM · LTV · churn · consent-gated</Pill>
            {report && report.segments.length > 0 && (
              <ExportButton
                dataset="audience-segments"
                label="Export segments"
                columns={["label", "size", "consentedSize", "revenuePotentialGbp", "recommendedOffer", "recommendedChannel", "recommendedFollowUp", "campaignPriority"]}
                rows={report.segments as unknown as Record<string, unknown>[]}
              />
            )}
          </div>
        }
      />

      {ready && !activeBrand && (
        <div className="mb-6 card border-emerald-500/20 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><Upload className="h-5 w-5" /></span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">Add a brand to build segments</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Add a brand from the switcher, then import its contacts to see real, ranked segments.</p>
        </div>
      )}

      {busy && !report && (
        <div className="mb-6 card p-10 text-center text-sm text-slate-400">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-emerald-400" />
          <p className="mt-3">Building segments from your vault…</p>
        </div>
      )}

      {activeBrand && report && report.segments.length === 0 && !busy && (
        <div className="mb-6 card border-emerald-500/20 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><Upload className="h-5 w-5" /></span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">Your vault is empty</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{report.note}</p>
          <Link href="/dashboard/customers" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-emerald-400">
            <Upload className="h-4 w-4" /> Import contacts to Customer Vault
          </Link>
        </div>
      )}

      {report && report.segments.length > 0 && (
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
        { key: "business", label: "Business", defaultValue: brandDefaults(activeBrand).business ?? "" },
        { key: "industry", label: "Industry", defaultValue: brandDefaults(activeBrand).industry ?? "" },
      ]} />
    </div>
  );
}
