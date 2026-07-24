"use client";

// M-34 AI Transactional Email Engine — Email Command Center.
// Spec: docs/ai-os/11-email-engine.md. The hygiene pipeline + sending
// facade are live in src/backend/email.ts (/api/email); provider pool,
// webhook feedback loops + warm-up automation activate once connected.

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
  Send,
  ShieldCheck,
  Thermometer,
} from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { AreaChart, DonutChart } from "@/components/charts";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

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
  { icon: Flame, title: "Massive scale, governed ramp", desc: "Horizontally scalable multi-provider pool (Resend → SendGrid failover shipped; SES/SMTP soon). Infrastructure is unlimited — the AI governs the ramp so reputation never breaks." },
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
  // Real campaign send to the brand's consented vault.
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; attempted: number; failed: number; sendable: number; consented: number; remaining: number; mode: string; note: string; error?: string } | null>(null);

  async function sendCampaign(test: boolean) {
    if (!activeBrand || !subject.trim() || !message.trim()) return;
    setSending(true); setSendResult(null);
    try {
      const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">${message.replace(/\n/g, "<br/>")}</div>`;
      const res = await authedFetch("/api/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_campaign", brandId: activeBrand.id, subject, html, test }),
      });
      setSendResult(await res.json().catch(() => ({ error: "Request failed" })));
    } catch { setSendResult({ error: "Network error", sent: 0, attempted: 0, failed: 0, sendable: 0, consented: 0, remaining: 0, mode: "", note: "" }); }
    finally { setSending(false); }
  }

  // Deliverability posture keyed off the brand's REAL Customer Vault size — no
  // fabricated 1,240-contact list. Empty vault → honest empty state.
  useEffect(() => {
    if (!activeBrand) { setPosture(null); return; }
    let cancelled = false;
    setPosture(null);
    (async () => {
      let listSize = 0;
      try {
        const vr = await authedFetch(`/api/contacts?brandId=${encodeURIComponent(activeBrand.id)}&business=${encodeURIComponent(activeBrand.name)}`);
        const vd = await vr.json();
        listSize = typeof vd?.contactCount === "number" ? vd.contactCount : 0;
      } catch { /* treat as empty */ }
      if (cancelled) return;
      if (listSize === 0) { setPosture(null); return; }
      try {
        const r = await fetch("/api/email-metrics", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ business: activeBrand.name, listSize, days: 14 }),
        });
        if (!cancelled) setPosture(await r.json() as Posture);
      } catch { if (!cancelled) setPosture(null); }
    })();
    return () => { cancelled = true; };
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
            <Pill tone="info">multi-provider sending pool</Pill>
          )
        }
      />

      {/* Deliverability posture — COMPUTED per brand (estimates, not booked history) */}
      {activeBrand ? (
        posture ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-slate-300">
                Deliverability posture · {posture.listSize.toLocaleString()} contacts in your vault
              </h2>
              <Pill tone="warn">hygiene split estimated on your real list · not booked send history</Pill>
            </div>
            <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Projected inbox rate" value={`${posture.projectedInboxRatePct}%`} sub="estimate — earned via hygiene + auth" tone="good" />
              <StatCard label="Projected bounce rate" value={`${posture.projectedBounceRatePct}%`} sub="target < 0.5% — bounces prevented pre-send" tone={posture.projectedBounceRatePct < 0.5 ? "good" : "warn"} />
              <StatCard label="Projected complaint rate" value={`${posture.projectedComplaintRatePct}%`} sub="target < 0.1% (estimate)" tone={posture.projectedComplaintRatePct < 0.1 ? "good" : "warn"} />
              <StatCard label="Filtered pre-send (est.)" value={posture.filteredCount.toLocaleString()} sub={`of ${posture.listSize.toLocaleString()} — never sent to, never bounced`} tone="warn" />
            </div>
          </>
        ) : (
          <div className="mb-8 card border-emerald-500/20 p-6 text-center">
            <Building2 className="mx-auto mb-2 h-7 w-7 text-emerald-500/60" />
            <h3 className="font-display font-bold text-white">No contacts yet — nothing to model</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              Deliverability posture is keyed off your real Customer Vault — no fabricated list. Import contacts and the inbox/bounce/list-health figures compute from your actual list. You can still run the live hygiene filter below right now.
            </p>
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

      {/* REAL campaign send — to the brand's consented Customer Vault */}
      <div className="mb-8 card border-emerald-500/30 p-5">
        <div className="mb-1 flex items-center gap-2">
          <Send className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">Send a real campaign to your vault</h2>
          <Pill tone="info">consented vault only</Pill>
        </div>
        <p className="mb-3 text-xs text-slate-500">Sends to the <span className="text-slate-300">consented</span> contacts in {activeBrand?.name || "this brand"}&rsquo;s Customer Vault, after the hygiene + suppression filter. Send a <span className="text-emerald-300">test to yourself first</span> (1 email), then the batch. Inbox placement needs SPF/DKIM/DMARC on your sending domain.</p>
        <div className="space-y-3">
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
          <textarea className="input min-h-[120px]" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Your message… (plain text — line breaks preserved)" />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => sendCampaign(true)} disabled={sending || !activeBrand || !subject.trim() || !message.trim()} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send test (1)</button>
            <button onClick={() => sendCampaign(false)} disabled={sending || !activeBrand || !subject.trim() || !message.trim()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to vault</button>
          </div>
          {sendResult && (
            <div className={`rounded-lg border p-3 text-sm ${sendResult.error ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/[0.06] text-slate-200"}`}>
              {sendResult.error ? sendResult.error : (
                <>
                  <p><span className="font-bold text-emerald-300">{sendResult.sent}</span> sent · {sendResult.failed} failed · {sendResult.attempted} attempted (of {sendResult.sendable} sendable / {sendResult.consented} consented). {sendResult.remaining > 0 && <>Run again for the next {Math.min(250, sendResult.remaining)}.</>}</p>
                  <p className="mt-1 text-xs text-slate-400">{sendResult.note}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Rocket className="h-4 w-4 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">Run the Deliverability Commander</h2>
      </div>
      <AgentRunner
        agentId="email-commander"
        buttonLabel="Audit posture + build the send plan"
        fields={[
          { key: "business", label: "Business", defaultValue: "Your business" },
          { key: "website", label: "Sending domain", defaultValue: "yourbusiness.co.uk" },
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
