"use client";

// Integration Hub — the independence keystone.
// External APIs are OPTIONAL connectors, isolated behind one adapter layer,
// each with a manual-mode fallback so the OS works with everything disconnected.
// Wired to GET /api/integrations.

import { useEffect, useState } from "react";
import { Plug, ShieldCheck, Hand, Building2, Sparkles, MousePointerClick } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";

type Integration = {
  provider: string; label: string; category: string; dependencyLevel: string; costMode: string; accelerates: string; status: string; manualFallback: string[];
  provisioning: "platform" | "user_connect" | "manual_only"; billing: "included" | "acu_metered" | "user_billed_direct";
  userAction: string; reason: string; platformManaged: boolean; userDoesNothing: boolean; userStatus: "ready" | "connect" | "manual"; pool?: string;
};
type Data = {
  integrations: Integration[]; connectedCount: number; platformManagedCount: number; userConnectCount: number; note: string;
  dependencyClassification: { mustOwnInternally: string[]; optionalExternal: string[]; neverFullyDependOn: string[]; rule: string };
  ownedChannels: { name: string; pattern: string }[];
};

const BILLING_LABEL: Record<string, string> = {
  included: "Included in your plan",
  acu_metered: "Billed from your ACU balance",
  user_billed_direct: "Billed by the platform directly (e.g. your ad spend)",
};

const CATEGORIES = ["paid_ads", "messaging", "email", "payments", "calendar", "ecommerce", "social", "automation"];

export default function IntegrationsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { fetch("/api/integrations").then((r) => r.json()).then(setData).catch(() => {}); }, []);

  return (
    <div>
      <PageHeader
        kicker="Integration Hub · Independence Layer"
        title="External APIs are optional pipes — never the foundation"
        subtitle="MarketWar OS owns the intelligence, data and workflow. Every external platform (Meta, Google, TikTok, WhatsApp, Stripe, Shopify…) is an optional connector isolated behind one adapter layer, and every external action has a manual-mode fallback — so the OS stays fully functional with everything disconnected. Where a connector runs on MarketWar's own infrastructure it is managed for you (no keys); where it touches your own money or accounts it connects in one click — and either way, no single provider is ever a dependency."
        actions={data && <div className="flex gap-2"><Pill tone="info">{data.connectedCount}/{data.integrations.length} connected</Pill><Pill tone="good">{data.platformManagedCount} managed for you</Pill></div>}
      />

      {data && (
        <>
          {/* Autonomy guarantee — the point of the platform */}
          <div className="mb-6 card border-emerald-500/25 bg-emerald-500/[0.04] p-5">
            <div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Autonomy guarantee — you never depend on any of these to run your business</h3></div>
            <ul className="grid gap-1.5 text-xs text-slate-300 sm:grid-cols-2">
              <li>• <span className="font-semibold text-white">Owned channels run first</span> — landing pages, marketplace, referral network, SEO pages, CRM, email list, automation and analytics need <span className="text-emerald-300">no external API at all</span>.</li>
              <li>• <span className="font-semibold text-white">Managed connectors are pooled + interchangeable</span> — email/SMS/WhatsApp route across providers with automatic failover, so no single vendor is a foundation.</li>
              <li>• <span className="font-semibold text-white">Every action has a manual fallback</span> — the OS stays fully functional with <span className="text-emerald-300">0/{data.integrations.length} connected</span>.</li>
              <li>• <span className="font-semibold text-white">If a provider changes pricing, policy or access</span>, the platform reroutes or falls back — your business keeps running, unaffected.</li>
            </ul>
          </div>

          {/* How connections work */}
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="card p-4">
              <div className="mb-1.5 flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-400" /><h3 className="text-sm font-display font-bold text-white">Managed for you</h3></div>
              <p className="text-xs text-slate-400"><span className="font-bold text-emerald-300">{data.platformManagedCount}</span> connectors run on MarketWar&apos;s own pooled infrastructure. No keys, no setup — billed from your plan at the protected margin, and interchangeable so no vendor is a dependency.</p>
            </div>
            <div className="card p-4">
              <div className="mb-1.5 flex items-center gap-2"><MousePointerClick className="h-4 w-4 text-sky-400" /><h3 className="text-sm font-display font-bold text-white">One-click connect</h3></div>
              <p className="text-xs text-slate-400"><span className="font-bold text-sky-300">{data.userConnectCount}</span> connect your own account (ad spend, store, social) in one click. Never an API key to find — and your spend and data stay yours.</p>
            </div>
            <div className="card p-4">
              <div className="mb-1.5 flex items-center gap-2"><Hand className="h-4 w-4 text-amber-400" /><h3 className="text-sm font-display font-bold text-white">Manual fallback</h3></div>
              <p className="text-xs text-slate-400">Every external action also works by hand, so the OS stays fully functional with everything disconnected.</p>
            </div>
          </div>

          {/* Dependency classification */}
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="card p-5">
              <div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Must own internally</h3></div>
              <div className="flex flex-wrap gap-1.5">{data.dependencyClassification.mustOwnInternally.map((x) => <Pill key={x} tone="good">{x}</Pill>)}</div>
            </div>
            <div className="card p-5">
              <div className="mb-2 flex items-center gap-2"><Plug className="h-4 w-4 text-emerald-400" /><h3 className="font-display font-bold text-white">Optional external</h3></div>
              <p className="text-xs text-slate-400">{data.dependencyClassification.optionalExternal.length} connectors — accelerators only.</p>
            </div>
            <div className="card p-5">
              <div className="mb-2 flex items-center gap-2"><Hand className="h-4 w-4 text-amber-400" /><h3 className="font-display font-bold text-white">Never fully depend on</h3></div>
              <div className="flex flex-wrap gap-1.5">{data.dependencyClassification.neverFullyDependOn.map((x) => <Pill key={x} tone="warn">{x}</Pill>)}</div>
            </div>
          </div>

          {/* Owned channels */}
          <div className="mb-6 card p-6">
            <div className="mb-3 flex items-center gap-2"><Building2 className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">Owned channels (built first — no external API)</h3></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.ownedChannels.map((c) => (
                <div key={c.name} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-3"><p className="text-sm font-semibold text-white">{c.name}</p><p className="text-xs text-slate-500">{c.pattern}</p></div>
              ))}
            </div>
          </div>

          {/* Connectors by category */}
          {CATEGORIES.map((cat) => {
            const items = data.integrations.filter((i) => i.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat} className="mb-4 card p-6">
                <h3 className="mb-3 font-display font-bold text-white capitalize">{cat.replace(/_/g, " ")}</h3>
                <div className="space-y-2">
                  {items.map((i) => (
                    <div key={i.provider} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-white">{i.label}{i.pool && <span className="ml-2 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">{i.pool} · failover</span>}</p>
                          <p className="text-xs text-slate-400">{i.accelerates}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{i.userAction}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex items-center gap-2">
                            {i.userStatus === "ready" ? (
                              <Pill tone="good"><Sparkles className="mr-1 inline h-3 w-3" />Ready — nothing to set up</Pill>
                            ) : (
                              <button className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-3 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/25">
                                <MousePointerClick className="h-3 w-3" /> Connect
                              </button>
                            )}
                            <button className="btn-ghost !py-1.5 !text-xs" onClick={() => setOpen(open === i.provider ? null : i.provider)}><Hand className="h-3.5 w-3.5" /> Manual</button>
                          </div>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{BILLING_LABEL[i.billing]}</span>
                        </div>
                      </div>
                      {open === i.provider && (
                        <div className="mt-2 border-t border-white/[0.05] pt-2">
                          <p className="mb-1 text-[11px] text-slate-500">{i.reason}</p>
                          <ol className="space-y-0.5 text-xs text-slate-400">
                            {i.manualFallback.map((s, idx) => <li key={idx}>{idx + 1}. {s}</li>)}
                          </ol>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-slate-500">{data.note}</p>
        </>
      )}
    </div>
  );
}
