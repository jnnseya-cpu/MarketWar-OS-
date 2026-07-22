"use client";

// Communication Event Architecture — one event engine, fanned out across
// email · in-app · SMS · push · WhatsApp. Live from /api/comms-events.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Bell, MessageSquare, Smartphone, MessageCircle, ShieldAlert, Send, Eye } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type Channel = "email" | "inapp" | "sms" | "push" | "whatsapp";
type Sev = "info" | "success" | "warning" | "critical";
type Ev = { id: string; name: string; subject: string; category: string; severity: Sev; channels: Channel[]; mandatory?: boolean };
type Stats = { totalEvents: number; categoryCount: number; mandatoryCount: number; channels: Channel[]; channelCoverage: Record<Channel, number>; byCategory: { category: string; count: number }[] };
type Resp = { stats: Stats; eventsByCategory: Record<string, Ev[]>; demo: { recentDeliveries: { channel: Channel; event: string; status: string; via: string; at: string }[] } };

const CH_ICON: Record<Channel, typeof Mail> = { email: Mail, inapp: Bell, sms: MessageSquare, push: Smartphone, whatsapp: MessageCircle };
const SEV_TONE: Record<Sev, string> = { info: "text-sky-300", success: "text-emerald-300", warning: "text-amber-300", critical: "text-rose-300" };

export default function CommsPage() {
  const { activeBrand } = useActiveBrand();
  const [data, setData] = useState<Resp | null>(null);
  const [sel, setSel] = useState<string>("account.registration.requested");
  const [preview, setPreview] = useState<{ subject: string; brand: string; brandColour: string; from: string } | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/comms-events").then((r) => r.json()).then(setData).catch(() => {}); }, []);

  const allEvents = useMemo<Ev[]>(() => data ? Object.values(data.eventsByCategory).flat() : [], [data]);
  const selEvent = allEvents.find((e) => e.id === sel);

  async function runPreview() {
    setBusy(true); setTestResult(null);
    const r = await fetch("/api/comms-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "preview", eventId: sel, brand: { name: activeBrand?.name || "Your brand", brandColour: activeBrand?.color || "#10b981", fromEmail: "info@marketwaros.com" } }) }).then((x) => x.json());
    setPreview(r); setBusy(false);
  }
  async function runTest() {
    setBusy(true); setPreview(null);
    const r = await fetch("/api/comms-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", eventId: sel }) }).then((x) => x.json());
    setTestResult(`${r.mode === "sandbox" ? "Sandbox" : "Live"} — ${r.delivered?.length ?? 0} channel(s): ${(r.delivered ?? []).map((d: { channel: string }) => d.channel).join(", ")}`);
    setBusy(false);
  }

  if (!data) return <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading event catalogue…</div>;
  const s = data.stats;
  const maxCov = Math.max(...Object.values(s.channelCoverage));

  return (
    <div>
      <PageHeader kicker="Communication Event Architecture" title="One event engine, every channel"
        subtitle={`${s.totalEvents} catalogue events across ${s.categoryCount} categories fan out over email · in-app · SMS · push · WhatsApp — honouring opt-outs, except ${s.mandatoryCount} mandatory notices.`} />

      {/* Stat band */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4"><p className="font-display text-3xl font-bold text-white">{s.totalEvents}</p><p className="mt-1 text-xs text-slate-400">Catalogue events · {s.categoryCount} categories</p></div>
        <div className="card p-4"><p className="font-display text-3xl font-bold text-amber-300">{s.mandatoryCount}</p><p className="mt-1 text-xs text-slate-400">Mandatory notices · bypass opt-outs</p></div>
        <div className="card p-4"><p className="font-display text-3xl font-bold text-emerald-300">{s.channels.length}</p><p className="mt-1 text-xs text-slate-400">Channels wired</p></div>
        <div className="card p-4"><p className="font-display text-3xl font-bold text-sky-300">{data.demo.recentDeliveries.length}</p><p className="mt-1 text-xs text-slate-400">Recent deliveries logged</p></div>
      </div>

      {/* Channel coverage */}
      <h2 className="mb-3 font-display text-base font-bold text-white">Channel coverage</h2>
      <div className="card mb-8 space-y-3 p-5">
        {s.channels.map((c) => {
          const Icon = CH_ICON[c];
          const n = s.channelCoverage[c];
          return (
            <div key={c} className="flex items-center gap-3">
              <span className="flex w-24 items-center gap-2 text-sm text-slate-300"><Icon className="h-4 w-4 text-emerald-400" /> {c}</span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-800"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(n / maxCov * 100)}%` }} /></span>
              <span className="w-24 text-right text-xs text-slate-400">{n} events</span>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Template QA */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 font-display text-base font-bold text-white">Template QA</h2>
          <div className="card p-5">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-400">Event</span>
              <select value={sel} onChange={(e) => { setSel(e.target.value); setPreview(null); setTestResult(null); }} className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60">
                {allEvents.map((e) => <option key={e.id} value={e.id}>{e.category} · {e.name} ({e.id})</option>)}
              </select></label>
            {selEvent && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {selEvent.mandatory && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-bold text-amber-300">mandatory</span>}
                <span className={`font-semibold ${SEV_TONE[selEvent.severity]}`}>{selEvent.severity}</span>
                {selEvent.channels.map((c) => <span key={c} className="rounded bg-ink-850 px-1.5 py-0.5 text-slate-400">{c}</span>)}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={runPreview} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60"><Eye className="h-3.5 w-3.5" /> Preview email</button>
              <button onClick={runTest} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-500 disabled:opacity-60"><Send className="h-3.5 w-3.5" /> Send test to me</button>
            </div>
            {preview && (
              <div className="mt-4 overflow-hidden rounded-xl border border-ink-700">
                <div className="flex items-center gap-2 px-4 py-3" style={{ background: preview.brandColour + "22" }}>
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500 text-[10px] font-bold text-ink-950">{preview.brand.slice(0, 2).toUpperCase()}</span>
                  <span className="text-sm font-bold text-white">{preview.brand}</span>
                </div>
                <div className="space-y-1 px-4 py-4 text-sm">
                  <p className="text-slate-500 text-[11px]">From: {preview.from}</p>
                  <p className="font-semibold text-white">{preview.subject}</p>
                  <p className="text-slate-400 text-[13px]">The recipient sees your logo, brand colour and details on every outbound email, with a clear CTA and one-click unsubscribe on marketing categories only.</p>
                </div>
              </div>
            )}
            {testResult && <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">{testResult}</p>}
          </div>
        </div>

        {/* Recent deliveries */}
        <div>
          <h2 className="mb-3 font-display text-base font-bold text-white">Recent deliveries</h2>
          <div className="card divide-y divide-white/5 p-0">
            {data.demo.recentDeliveries.map((d, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <div><p className="font-semibold text-slate-200">{d.event}</p><p className="text-slate-500">{d.channel} · {d.via} · {d.at}</p></div>
                <span className={d.status === "sent" ? "text-emerald-300" : "text-slate-400"}>{d.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Catalogue */}
      <h2 className="mb-3 mt-10 font-display text-base font-bold text-white">Event catalogue</h2>
      <div className="space-y-6">
        {Object.entries(data.eventsByCategory).map(([category, evs]) => (
          <div key={category}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="font-display text-sm font-bold text-white">{category}</h3>
              <span className="text-xs text-slate-500">{evs.length} events</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {evs.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
                      {e.mandatory && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" />}{e.name}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">{e.id}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {e.channels.map((c) => { const Icon = CH_ICON[c]; return <Icon key={c} className="h-3.5 w-3.5 text-slate-500" />; })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
