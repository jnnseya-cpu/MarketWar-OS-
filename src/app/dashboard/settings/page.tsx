"use client";

// Settings & Security Center (M-27, tenant-facing) — profile, per-capability
// autonomy dial (L0–L4 — L4 Revenue Autopilot per docs/ai-os/10 §F), security posture
// (five-layer auth model, docs/ai-os/08 §B.4a) and API keys. Demo state
// until Firebase Auth + Firestore preferences land (users.preferences).

import { useState } from "react";
import { Bell, Fingerprint, KeyRound, Lock, Shield, ShieldCheck, Smartphone } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import DeleteAccount from "@/components/DeleteAccount";

type AutonomyCapability = {
  name: string;
  detail: string;
  level: number;
  max: number; // policy ceiling for this capability
};

const LEVELS = ["L0 · Recommend", "L1 · Reversible", "L2 · Spend-capped", "L3 · Autonomous", "L4 · Revenue"];

const DEFAULT_CAPABILITIES: AutonomyCapability[] = [
  { name: "Campaign budget shifts", detail: "Reallocate between ad sets within daily caps; L4 reallocates by profitability (Revenue Autopilot)", level: 2, max: 4 },
  { name: "Campaign pause (loss-cutting)", detail: "Budget Protection kills losers — always allowed", level: 3, max: 3 },
  { name: "Recovery & reactivation sends", detail: "Consent-checked sequences to dormant customers", level: 2, max: 3 },
  { name: "Creative rotation", detail: "Swap fatigued creatives at midnight UTC", level: 1, max: 3 },
  { name: "New campaign launch", detail: "Full auto-launch needs L3 + TOTP (spec §9.1)", level: 1, max: 3 },
  { name: "VisualStrike / SiteRaid publishing", detail: "Draft-only → per-asset approval → campaign approval → guarded autopilot → L4 Revenue Autopilot; high-risk categories locked to L0/L1", level: 1, max: 4 },
  { name: "Pricing changes", detail: "Policy ceiling L0 — owner approval always required", level: 0, max: 0 },
];

const SECURITY_LAYERS = [
  { icon: Lock, name: "Password & email", status: "active", note: "Firebase Auth (layer 1)" },
  { icon: Smartphone, name: "TOTP multi-factor", status: "required for L3", note: "Enrol before raising any capability to L3 (layer 2)" },
  { icon: Fingerprint, name: "Device trust", status: "active", note: "Unrecognised devices need email + TOTP (layer 3)" },
  { icon: ShieldCheck, name: "Behavioural anomaly watch", status: "active", note: "Unusual geography/time triggers step-up (layer 4)" },
  { icon: KeyRound, name: "Agent service tokens", status: "platform-managed", note: "Every agent call carries a signed scope-limited token (layer 5)" },
  { icon: Lock, name: "End-to-end encryption", status: "active", note: "TLS 1.3 + HSTS in transit; AES-256-GCM field encryption at rest with a separate key derived per business — your contacts are never stored in plaintext" },
];

export default function SettingsPage() {
  const [caps, setCaps] = useState(DEFAULT_CAPABILITIES);

  function setLevel(i: number, level: number) {
    setCaps((prev) => prev.map((c, idx) => (idx === i ? { ...c, level: Math.min(level, c.max) } : c)));
  }

  return (
    <div>
      <PageHeader
        kicker="Settings & Security"
        title="Your autonomy dial and security posture"
        subtitle="Autonomy is per-capability, never global. Every level respects platform policy ceilings, spend caps and the consent ledger — and every agent action stays reversible."
      />

      {/* Autonomy dial */}
      <div className="mb-8 card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display font-bold text-white">Autonomy dial — per capability</h2>
          <Pill tone="info">L3 requires TOTP enrolment</Pill>
        </div>
        <div className="space-y-4">
          {caps.map((c, i) => (
            <div key={c.name} className="rounded-lg border border-ink-700 bg-ink-850 p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.detail}</p>
                </div>
                <span className="text-xs font-bold text-emerald-400">{LEVELS[c.level]}</span>
              </div>
              <div className="flex gap-1.5">
                {LEVELS.map((label, level) => {
                  const allowed = level <= c.max;
                  const active = level === c.level;
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={!allowed}
                      onClick={() => setLevel(i, level)}
                      title={allowed ? label : "Above the policy ceiling for this capability"}
                      className={`flex-1 rounded-md py-1.5 text-[11px] font-bold transition ${
                        active
                          ? "bg-emerald-500 text-ink-950"
                          : allowed
                            ? "bg-ink-700/60 text-slate-300 hover:bg-ink-700"
                            : "cursor-not-allowed bg-ink-900 text-slate-700"
                      }`}
                    >
                      L{level}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          Escalation gates always apply above the dial: confidence &lt; 70% on spend actions, actions &gt; £500 at
          L3, and 3+ consecutive failures all route to you — and any L3 action is reversible within 60 seconds via
          emergency override.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Security layers */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-400" />
            <h2 className="font-display font-bold text-white">Five-layer authentication</h2>
          </div>
          <div className="space-y-3">
            {SECURITY_LAYERS.map((l) => (
              <div key={l.name} className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-850 p-3.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
                  <l.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{l.name}</p>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-400">{l.status}</span>
                  </div>
                  <p className="text-xs text-slate-500">{l.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications + data */}
        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Bell className="h-4 w-4 text-emerald-400" />
              <h2 className="font-display font-bold text-white">Notification channels</h2>
            </div>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-850 px-3.5 py-2.5">
                In-app + push <Pill tone="good">on</Pill>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-850 px-3.5 py-2.5">
                Email receipts for agent actions <Pill tone="good">on</Pill>
              </li>
              <li className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-850 px-3.5 py-2.5">
                WhatsApp alerts (critical only) <Pill tone="neutral">quiet hours 22:00–07:00</Pill>
              </li>
            </ul>
          </div>
          <div className="card p-5">
            <h2 className="mb-2 font-display font-bold text-white">Your data, your rights</h2>
            <p className="mb-3 text-xs text-slate-400">
              Export or erase everything the OS holds about your business. Erasure propagates everywhere — including
              analytics — under the GDPR erasure API.
            </p>
            <div className="flex gap-2">
              <button type="button" className="rounded-lg border border-ink-700 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:border-emerald-500/50">
                Export my data
              </button>
              <button type="button" className="rounded-lg border border-rose-500/30 px-3.5 py-2 text-xs font-bold text-rose-300 transition hover:border-rose-500/60">
                Request erasure
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Danger zone — permanent account deletion (GDPR right to erasure) */}
      <div className="mt-6">
        <DeleteAccount />
      </div>
    </div>
  );
}
