"use client";

// M-34 AI Transactional Email Engine — Email Command Center.
// Spec: docs/ai-os/11-email-engine.md. The hygiene pipeline + sending
// facade are live in src/backend/email.ts (/api/email); provider pool,
// webhook feedback loops and warm-up automation land at P1.

import { useState } from "react";
import {
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

const DELIVERY_14D = {
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  delivered: [120, 180, 240, 420, 510, 150, 90, 380, 460, 520, 680, 840, 210, 160],
  filtered: [11, 14, 17, 26, 30, 9, 6, 21, 24, 26, 31, 38, 12, 9],
};

export default function EmailPage() {
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
        actions={<Pill tone="info">Module M-34 · Agent 23 · provider pool live via env keys</Pill>}
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Delivery rate" value="99.4%" sub="target ≥ 99%" tone="good" />
        <StatCard label="Bounce rate" value="0.3%" sub="target < 0.5% — bounces prevented pre-send" tone="good" />
        <StatCard label="Complaint rate" value="0.04%" sub="target < 0.1%" tone="good" />
        <StatCard label="Addresses filtered (month)" value="214" sub="never sent to — never bounced" tone="warn" />
      </div>

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

      <div className="mb-8 grid gap-6 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display font-bold text-white">Delivered vs filtered — 14 days</h2>
            <Pill tone="good">every filtered address = a bounce that never happened</Pill>
          </div>
          <AreaChart
            labels={DELIVERY_14D.labels}
            series={[
              { name: "Delivered", data: DELIVERY_14D.delivered },
              { name: "Filtered pre-send", data: DELIVERY_14D.filtered },
            ]}
            height={230}
          />
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-display font-bold text-white">List health</h2>
          <DonutChart
            data={[
              { label: "Sendable, consented", value: 1128 },
              { label: "Role addresses", value: 25 },
              { label: "Disposable", value: 25 },
              { label: "Invalid syntax", value: 37 },
              { label: "Suppressed", value: 25 },
            ]}
            centerValue="91%"
            centerLabel="list health score"
            size={185}
          />
        </div>
      </div>

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
