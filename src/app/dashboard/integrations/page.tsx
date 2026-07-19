"use client";

// Integration Hub — the independence keystone.
// External APIs are OPTIONAL connectors, isolated behind one adapter layer,
// each with a manual-mode fallback so the OS works with everything disconnected.
// Wired to GET /api/integrations.

import { useEffect, useState } from "react";
import { Plug, ShieldCheck, Hand, Building2 } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";

type Integration = { provider: string; label: string; category: string; dependencyLevel: string; costMode: string; accelerates: string; status: string; manualFallback: string[] };
type Data = {
  integrations: Integration[]; connectedCount: number; note: string;
  dependencyClassification: { mustOwnInternally: string[]; optionalExternal: string[]; neverFullyDependOn: string[]; rule: string };
  ownedChannels: { name: string; pattern: string }[];
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
        subtitle="MarketWar OS owns the intelligence, data and workflow. Every external platform (Meta, Google, TikTok, WhatsApp, Stripe, Shopify…) is an optional connector isolated behind one adapter layer — and every external action has a manual-mode fallback, so the OS stays fully functional with everything disconnected."
        actions={data && <Pill tone="info">{data.connectedCount}/{data.integrations.length} connected</Pill>}
      />

      {data && (
        <>
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
                        <div>
                          <p className="font-semibold text-white">{i.label} <span className="text-xs text-slate-500">· {i.dependencyLevel} · {i.costMode}</span></p>
                          <p className="text-xs text-slate-400">{i.accelerates}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Pill tone={i.status === "connected" ? "good" : "neutral"}>{i.status === "connected" ? "connected" : "add key"}</Pill>
                          <button className="btn-ghost !py-1.5 !text-xs" onClick={() => setOpen(open === i.provider ? null : i.provider)}><Hand className="h-3.5 w-3.5" /> Manual mode</button>
                        </div>
                      </div>
                      {open === i.provider && (
                        <ol className="mt-2 space-y-0.5 border-t border-white/[0.05] pt-2 text-xs text-slate-400">
                          {i.manualFallback.map((s, idx) => <li key={idx}>{idx + 1}. {s}</li>)}
                        </ol>
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
