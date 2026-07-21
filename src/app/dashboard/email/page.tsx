"use client";

// M-34 AI Transactional Email Engine — Email Command Center.
// Spec: docs/ai-os/11-email-engine.md. The hygiene pipeline + sending
// facade are live in src/backend/email.ts (/api/email); provider pool,
// webhook feedback loops and warm-up automation land at P1.

import { useEffect, useState } from "react";
import {
  Building2,
  Filter,
  Flame,
  Inbox,
  ListChecks,
  Loader2,
  MailCheck,
  Rocket,
  ShieldCheck,
  Thermometer,
} from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { AreaChart, DonutChart } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

// Headline deliverability posture is COMPUTED per brand by the Email
// Deliverability Posture Engine (/api/email-metrics) — every figure is a
// clearly-labelled ESTIMATE / projection, never booked send history. Real
// provider telemetry replaces the estimates in place once sends go live.
type Posture = {
  business: string;
  listSize: number;
  composition: { label: string; count: number; kind: "healthy" | "filtered" }[];
  sendableCount: number;
  filteredCount: number;
  listHealthPct: number;
  projectedInboxRatePct: number;
  projectedSpamRatePct: number;
  projectedBounceRatePct: number;
  projectedComplaintRatePct: number;
  days: number;
  series: { label: string; delivered: number; filtered: number }[];
  estimateNote: string;
  isEstimate: true;
};

const PIPELINE = [
  { icon: ListChecks, title: "1 · Syntax & domain", desc: "RFC-valid address, real domain with MX records — dead addresses never reach a provider." },
  { icon: Filter, title: "2 · Disposable & role filter", desc: "Burner domains (spam-trap risk) blocked; role addresses (info@, sales@) excluded from marketing sends by default." },
  { icon: ShieldCheck, title: "3 · Consent & suppression", desc: "No granted consent = technically unsendable. Hard bounces, complaints and unsubs live on the suppression ledger — never re-sent, ever." },
  { icon: Thermometer, title: "4 · Reputation governor", desc: "Warm-up ramps, per-domain throttles (Gmail/Outlook/Yahoo) and complaint monitoring keep the sending reputation that keeps you in the inbox." },
];

const CAPABILITIES = [
  { icon: Inbox, title: "Inbox placement, earned", desc: "SPF + DKIM + DMARC (+ BIMI) on an isolated sending subdomain, engagement-first warm-up, RFC 8058 one-click unsubscribe — the mechanics that actually beat the spam folder." },
  { icon: Flame, title: "Massive scale, governed ramp", desc: "Horizontally scalable multi-provider pool (Resend → SendGrid failover shipped; SES/SMTP at P1). Infrastructure is unlimited — the AI governs the ramp so reputation never breaks." },
  { icon: MailCheck, title: "Zero-bounce doctrine", desc: "Bounces are prevented before send (hygiene pipeline) and never repeated (suppression ledger). Target bounce rate < 0.5% — 6× inside the Gmail/Yahoo bulk-sender threshold." },
];

export default function EmailPage() {
  const { activeBrand } = useActiveBrand();
  const [posture, setPosture] = useState<Posture | null>(null);
  const [raw, setRaw] = useState(
    "marcus@gmail.com\nleah.simmons@outlook.com\ninfo@somecompany.co.uk\nbad-address@@nowhere\npromo@mailinator.com\namara.okafor@yahoo.com"
  );
  const [result, setResult] = useState<{
    total: number;
    sendableCount: number;
    filteredCount: number;
    filtered: { email: string; reason: string | null }[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Compute the deliverability posture for the active brand (estimates only).
  useEffect(() => {
    if (!activeBrand) {
      setPosture(null);
      return;
    }
    let cancelled = false;
    setPosture(null);
    fetch("/api/email-metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business: activeBrand.name, days: 14 }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPosture(d as Posture);
      })
      .catch(() => {
        if (!cancelled) setPosture(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBrand]);

  async function runFilter() {
    setBusy(true);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", emails: raw.split(/\s+/).filter(Boolean) }),
      });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="AI Email Command Center"
        title="Massive email. Earned inboxing. Zero bounces."
        subtitle="The M-34 transactional engine: every address passes the hygiene pipeline before a send is attempted, every send rides authenticated warmed reputation, and every hard failure is suppressed forever — volume scales with the provider pool, deliverability scales with discipline."
        actions={
          activeBrand ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-ink-900/60 px-3 py-1.5 text-xs text-slate-300">
              <Building2 className="h-3.5 w-3.5" style={{ color: activeBrand.color }} /> {activeBrand.name}
            </span>
          ) : (
            <Pill tone="info">Module M-34 · Agent 23 · provider pool live via env keys</Pill>
          )
        }
      />

      {/* Deliverability posture — COMPUTED per brand (estimates, not booked history) */}
      {activeBrand ? (
        posture ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-slate-300">
                Projected deliverability posture · {posture.listSize.toLocaleString()} modelled contacts
              </h2>
              <Pill tone="warn">estimate — not booked send history</Pill>
            </div>
            <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Projected inbox rate" value={`${posture.projectedInboxRatePct}%`} sub="estimate — earned via hygiene + auth" tone="good" />
              <StatCard label="Projected bounce rate" value={`${posture.projectedBounceRatePct}%`} sub="target < 0.5% — bounces prevented pre-send" tone={posture.projectedBounceRatePct < 0.5 ? "good" : "warn"} />
              <StatCard label="Projected complaint rate" value={`${posture.projectedComplaintRatePct}%`} sub="target < 0.1% (estimate)" tone={posture.projectedComplaintRatePct < 0.1 ? "good" : "warn"} />
              <StatCard label="Filtered pre-send (est.)" value={posture.filteredCount.toLocaleString()} sub={`of ${posture.listSize.toLocaleString()} — never sent to, never bounced`} tone="warn" />
            </div>
          </>
        ) : (
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card p-4">
                <div className="h-3 w-24 animate-pulse rounded bg-ink-700" />
                <div className="mt-2 h-7 w-16 animate-pulse rounded bg-ink-700" />
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="mb-8 card border-emerald-500/25 bg-emerald-500/[0.04] p-6 text-center">
          <Building2 className="mx-auto mb-2 h-7 w-7 text-emerald-500/60" />
          <h3 className="font-display font-bold text-white">Add a brand to model its deliverability posture</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Headline metrics here are computed per brand — never a fake number. Add a brand in the sidebar and the engine
            projects its inbox/bounce posture and list health. You can still run the live hygiene filter below with zero setup.
          </p>
        </div>
      )}

      {/* Capabilities */}
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        {CAPABILITIES.map((c) => (
          <div key={c.title} className="card border-emerald-500/20 p-4">
            <c.icon className="mb-2.5 h-5 w-5 text-emerald-400" />
            <h3 className="font-display text-sm font-bold text-emerald-300">{c.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.desc}</p>
          </div>
        ))}
      </div>

      {activeBrand && posture && (
        <div className="mb-8 grid gap-6 lg:grid-cols-5">
          <div className="card p-5 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display font-bold text-white">Delivered vs filtered — {posture.days}-day projection</h2>
              <Pill tone="warn">estimate — not booked history</Pill>
            </div>
            <AreaChart
              labels={posture.series.map((p) => p.label)}
              series={[
                { name: "Delivered (projected)", data: posture.series.map((p) => p.delivered) },
                { name: "Filtered pre-send (projected)", data: posture.series.map((p) => p.filtered) },
              ]}
              height={230}
            />
            <p className="mt-2 text-xs text-slate-500">{posture.estimateNote}</p>
          </div>
          <div className="card p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-display font-bold text-white">List health</h2>
              <Pill tone="warn">estimate</Pill>
            </div>
            <DonutChart
              data={posture.composition.filter((c) => c.count > 0).map((c) => ({ label: c.label, value: c.count }))}
              centerValue={`${posture.listHealthPct}%`}
              centerLabel="list health (est.)"
              size={185}
            />
          </div>
        </div>
      )}

      {/* Hygiene pipeline */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PIPELINE.map((p) => (
          <div key={p.title} className="card p-4">
            <p.icon className="mb-2.5 h-5 w-5 text-emerald-400" />
            <h3 className="font-display text-sm font-bold text-white">{p.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* Live filter demo */}
      <div className="mb-8 card p-5">
        <h2 className="mb-1 font-display font-bold text-white">Try the live hygiene filter</h2>
        <p className="mb-3 text-xs text-slate-500">
          Paste addresses (one per line) — this runs the real pre-send pipeline in the backend, right now.
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={5}
          className="mb-3 w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 font-mono text-xs text-white outline-none focus:border-emerald-500/60"
        />
        <button type="button" onClick={runFilter} disabled={busy} className="btn-primary disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />} Filter the list
        </button>
        {result && (
          <div className="mt-4 rounded-lg border border-ink-700 bg-ink-850 p-4 text-sm">
            <p className="mb-2 font-semibold text-white">
              {result.sendableCount} of {result.total} sendable ·{" "}
              <span className="text-amber-300">{result.filteredCount} filtered (bounces prevented)</span>
            </p>
            <ul className="space-y-1 text-xs text-slate-400">
              {result.filtered.map((f) => (
                <li key={f.email}>
                  <span className="font-mono text-rose-300">{f.email}</span> — {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Run the Deliverability Commander</h2>
      </div>
      <AgentRunner
        agentId="email-commander"
        buttonLabel="Audit posture + build the send plan"
        fields={[
          { key: "business", label: "Business", defaultValue: "Brixton Grill House" },
          { key: "website", label: "Sending domain", defaultValue: "brixtongrillhouse.co.uk" },
          {
            key: "list",
            label: "Describe your list & goal",
            defaultValue:
              "~1,240 contacts imported from the customer vault, mix of past orderers and leads; goal: Friday platter campaign weekly + order confirmations, growing to daily sends",
            textarea: true,
          },
        ]}
      />
    </div>
  );
}
