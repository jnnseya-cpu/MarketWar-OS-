"use client";

// WhatsApp Sales Center — the messaging command surface.
// Ad → WhatsApp → AI qualification → offer → order → follow-up. For local
// businesses, WhatsApp converts better than any website. Wired to /api/whatsapp:
// a deterministic conversation funnel, response/conversion metrics, a 14-day
// thread trend and the template pipeline — computed from the ACTIVE brand as
// DEMO INTELLIGENCE (badged). Live sending activates via the platform's shared
// WhatsApp pool (WHATSAPP_TOKEN). No fabricated live numbers.

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Play, Building2, Zap } from "lucide-react";
import { AreaChart, FunnelChart } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type FunnelStage = { key: string; label: string; value: number };
type TemplateStatus = "live-ready" | "primed" | "draft" | "needs-copy";
type MessageTemplate = { key: string; label: string; purpose: string; trigger: string; status: TemplateStatus; expectedReplyRate: number; note: string };
type Metrics = { newThreadsWeek: number; avgResponseMins: number; replyRate: number; qualificationRate: number; conversionRate: number; openPipelineGbp: number; recoverableThreads: number; recoverableGbp: number };
type Overview = {
  business: string;
  mode: "demo-intelligence";
  badge: string;
  funnel: FunnelStage[];
  metrics: Metrics;
  templates: MessageTemplate[];
  daily: { labels: string[]; threads: number[] };
  liveNote: string;
  note: string;
};

const STATUS_META: Record<TemplateStatus, { label: string; tone: "good" | "warn" | "info" | "neutral" }> = {
  "live-ready": { label: "Live-ready", tone: "good" },
  primed: { label: "Primed", tone: "info" },
  draft: { label: "Draft", tone: "warn" },
  "needs-copy": { label: "Needs copy", tone: "neutral" },
};

export default function WhatsAppCenterPage() {
  const { activeBrand } = useActiveBrand();
  const [business, setBusiness] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed from the active brand; clear the board on brand switch so nothing stale shows.
  useEffect(() => {
    setBusiness(activeBrand?.name ?? "");
    setOverview(null);
  }, [activeBrand?.id, activeBrand?.name]);

  async function run() {
    if (!business.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business }) });
      setOverview(await res.json());
    } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader
        kicker="WhatsApp Sales Center"
        title="Conversation pipeline & template engine"
        subtitle="Ad → WhatsApp → AI qualification → offer → order → follow-up. For local businesses, WhatsApp converts better than any website. This board is computed from your brand as demo intelligence — live sending activates via the platform WhatsApp pool."
        actions={<Pill tone="info">Consent-gated · frequency-capped</Pill>}
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <label className="label">Business</label>
        <input className="input" value={business} placeholder="Add a brand in the sidebar, or type a business name" onChange={(e) => setBusiness(e.target.value)} />
        <button className="btn-primary mt-4" onClick={run} disabled={busy || !business.trim()}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Building overview…</> : <><Play className="h-4 w-4" /> Build messaging overview</>}
        </button>
      </div>

      {!overview && (
        <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
          <MessageCircle className="h-8 w-8 text-emerald-500/60" />
          <p className="max-w-md text-sm text-slate-400">
            {business.trim()
              ? "Build the messaging overview to see the conversation funnel, response/conversion metrics and the template pipeline for this brand."
              : "Add a brand in the sidebar (or type a business name above) to build the WhatsApp messaging overview."}
          </p>
        </div>
      )}

      {overview && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Pill tone="warn">{overview.badge}</Pill>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-ink-900/60 px-3 py-1.5 text-xs text-slate-300">
              <Building2 className="h-3.5 w-3.5 text-emerald-400" /> {overview.business}
            </span>
          </div>

          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Open pipeline" value={`£${overview.metrics.openPipelineGbp.toLocaleString()}`} sub="qualified, not yet booked" tone="good" />
            <StatCard label="New threads / week" value={`${overview.metrics.newThreadsWeek}`} />
            <StatCard label="Avg. response time" value={`${overview.metrics.avgResponseMins} min`} sub="target: under 10" tone={overview.metrics.avgResponseMins <= 10 ? "good" : "warn"} />
            <StatCard label="Recoverable" value={`${overview.metrics.recoverableThreads}`} sub={`£${overview.metrics.recoverableGbp.toLocaleString()} · follow-up armed`} tone="warn" />
          </div>

          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="mb-4 font-display font-bold text-white">New → engaged → qualified → booked</h2>
              <FunnelChart stages={overview.funnel.map((f) => ({ label: f.label, value: f.value }))} />
              <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                <div><p className="text-[11px] uppercase tracking-wider text-slate-500">Reply rate</p><p className="font-display font-bold text-emerald-400">{overview.metrics.replyRate}%</p></div>
                <div><p className="text-[11px] uppercase tracking-wider text-slate-500">Qualified</p><p className="font-display font-bold text-white">{overview.metrics.qualificationRate}%</p></div>
                <div><p className="text-[11px] uppercase tracking-wider text-slate-500">Conversion</p><p className="font-display font-bold text-emerald-400">{overview.metrics.conversionRate}%</p></div>
              </div>
            </div>
            <div className="card p-5">
              <h2 className="mb-3 font-display font-bold text-white">New threads per day — 14 days</h2>
              <AreaChart
                labels={overview.daily.labels}
                series={[{ name: "WhatsApp threads", data: overview.daily.threads }]}
                height={220}
              />
            </div>
          </div>

          <div className="mb-6">
            <h2 className="mb-3 font-display font-bold text-white">Template pipeline</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {overview.templates.map((t) => {
                const st = STATUS_META[t.status];
                return (
                  <div key={t.key} className="card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"><MessageCircle className="h-4 w-4" /></span>
                        <span className="font-display font-bold text-white">{t.label}</span>
                      </div>
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{t.purpose}</p>
                    <p className="mt-1 text-xs text-slate-500"><span className="text-slate-400">Trigger:</span> {t.trigger}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-500">{t.note}</span>
                      <span className="shrink-0 text-xs font-semibold text-emerald-300">~{t.expectedReplyRate}% reply</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200">
            <div className="mb-1 flex items-center gap-2"><Zap className="h-4 w-4" /><span className="font-bold">Live sending</span></div>
            {overview.liveNote}
          </div>
          <p className="mt-3 text-xs text-slate-500">{overview.note}</p>
        </div>
      )}
    </div>
  );
}
