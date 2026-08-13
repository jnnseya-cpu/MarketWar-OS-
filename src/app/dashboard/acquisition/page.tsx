"use client";

// The acquisition run — how many people were actually asked.
//
// This screen exists because the platform had 54 engines and could not answer
// the first question anybody would put to a business with no customers. It is
// deliberately the plainest page in the OS: a list of names, what was sent to
// each, what came back, and one sentence saying where the process is stuck.
//
// When nothing has been sent it says so in those words. A dashboard of zeros
// that looks like a working system is the thing this page is built not to be.

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Pill } from "@/components/ui";
import { Loader2, Plus, Send, Target, TrendingUp } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { GTM_TARGETS } from "@/shared/gtm-targets";

type Attempt = { at: string; channel: string; message: string };
type Prospect = { id: string; name: string; contact?: string; source: string; stage: string; attempts: Attempt[]; lastReply?: string; valueGbp?: number; lostReason?: string };
type Funnel = { identified: number; contacted: number; replied: number; meeting: number; proposal: number; won: number; lost: number; attempts: number; revenueGbp: number };
type Diagnosis = { bottleneck: string; headline: string; because: string; doNext: string[]; evidence: string };
type Data = {
  prospects: Prospect[]; funnel: Funnel; diagnosis: Diagnosis;
  rates: { replyPct: number | null; meetingPct: number | null; winPct: number | null; note: string };
  stages: { id: string; label: string; what: string }[];
  channels: string[];
};

export default function AcquisitionPage() {
  const { activeBrand } = useActiveBrand();
  const brandId = activeBrand?.id;
  const [targetId, setTargetId] = useState("marketwar");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [source, setSource] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("email");

  const post = useCallback(async (body: Record<string, unknown>) => {
    if (!brandId) return null;
    setBusy(true); setError(null);
    try {
      const res = await authedFetch("/api/acquisition", { method: "POST", body: JSON.stringify({ brandId, targetId, ...body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "That did not go through."); return null; }
      return d;
    } catch { setError("Network error."); return null; } finally { setBusy(false); }
  }, [brandId, targetId]);

  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const res = await authedFetch(`/api/acquisition?brandId=${encodeURIComponent(brandId)}&targetId=${encodeURIComponent(targetId)}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) setData(d as Data);
    } catch { /* the page still renders the plan */ }
  }, [brandId, targetId]);

  useEffect(() => { void load(); }, [load]);

  const target = GTM_TARGETS.find((t) => t.id === targetId)!;

  if (!brandId) return <p className="text-sm text-slate-400">Pick a brand to run acquisition for.</p>;

  return (
    <div>
      <PageHeader
        kicker="Acquisition run"
        title="How many people did we actually ask?"
        subtitle="Named businesses, the message each one was sent, and what came back. Everything here is typed by whoever did it — nothing is generated, because a pipeline the software invented tells you nothing about whether anybody wants this."
        actions={data ? <Pill tone={data.funnel.won > 0 ? "good" : data.funnel.attempts === 0 ? "warn" : "info"}>{data.funnel.attempts} sent · {data.funnel.won} paid</Pill> : undefined}
      />

      {/* Which business we are selling */}
      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        {GTM_TARGETS.map((t) => (
          <button key={t.id} onClick={() => setTargetId(t.id)} className={`rounded-xl border p-4 text-left transition ${targetId === t.id ? "border-emerald-500/40 bg-emerald-500/[0.07]" : "border-white/10 bg-ink-900/50 hover:border-white/20"}`}>
            <p className="font-display text-sm font-bold text-white">{t.name}</p>
            <p className="text-[11px] text-slate-500">{t.site}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{t.buyer}</p>
          </button>
        ))}
      </div>

      {/* The plan for this one — a plan, never a result */}
      <div className="card mb-6 p-5">
        <h2 className="flex items-center gap-2 font-display font-bold text-white"><Target className="h-4 w-4 text-emerald-400" /> The move that needs no keys</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{target.channelToday}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">First offer</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{target.firstOffer}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">What would count as proof</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{target.proofOfLife}</p>
          </div>
        </div>
      </div>

      {/* The diagnosis */}
      {data && (
        <div className={`card mb-6 p-5 ${data.diagnosis.bottleneck === "nobody_asked" ? "border-amber-500/30 bg-amber-500/[0.05]" : data.diagnosis.bottleneck === "working" ? "border-emerald-500/30 bg-emerald-500/[0.05]" : ""}`}>
          <h2 className="flex items-center gap-2 font-display font-bold text-white"><TrendingUp className="h-4 w-4 text-emerald-400" /> {data.diagnosis.headline}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{data.diagnosis.because}</p>
          <ol className="mt-3 space-y-1.5">
            {data.diagnosis.doNext.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-300">{i + 1}</span>{s}
              </li>
            ))}
          </ol>
          <p className="mt-3 font-mono text-[11px] text-slate-600">{data.diagnosis.evidence}</p>
        </div>
      )}

      {/* The counts */}
      {data && (
        <div className="card mb-6 p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {data.stages.map((s) => (
              <div key={s.id} className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-3">
                <p className="font-display text-xl font-bold text-white">{(data.funnel as unknown as Record<string, number>)[s.id] ?? 0}</p>
                <p className="text-[11px] text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            {data.rates.replyPct != null ? `Reply rate ${data.rates.replyPct}%. ` : ""}{data.rates.note}
          </p>
        </div>
      )}

      {/* Add a name */}
      <div className="card mb-6 p-5">
        <h2 className="font-display font-bold text-white">Add a name</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          A business or person you could describe to a friend. Not &ldquo;plumbers in Manchester&rdquo; — a name you can send something to.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" />
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email, phone or profile" className="rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" />
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Where this name came from" className="rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" />
        </div>
        {error && <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-2.5 text-xs text-rose-200">{error}</p>}
        <button onClick={async () => { if (await post({ action: "prospect", name, contact, source })) { setName(""); setContact(""); setSource(""); await load(); } }} disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </div>

      {/* The list */}
      {data && data.prospects.length > 0 && (
        <div className="card p-5">
          <h2 className="font-display font-bold text-white">The run</h2>
          <div className="mt-3 space-y-2">
            {data.prospects.map((p) => (
              <div key={p.id} className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{p.name}</p>
                    <p className="text-[11px] text-slate-500">{p.contact || "no contact yet"} · {p.attempts.length} sent · {p.source}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">{p.stage}</span>
                    <button onClick={() => { setOpenId(openId === p.id ? null : p.id); setMessage(""); }} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-white/5"><Send className="h-3 w-3" /> Log a message</button>
                  </div>
                </div>
                {p.lastReply && <p className="mt-2 rounded border-l-2 border-emerald-500/40 bg-ink-900/50 p-2 text-xs italic text-slate-300">“{p.lastReply}”</p>}
                {p.lostReason && <p className="mt-2 text-xs text-amber-300/80">Lost: {p.lostReason}</p>}
                {openId === p.id && (
                  <div className="mt-3 rounded-lg border border-white/10 bg-ink-900/50 p-3">
                    <select value={channel} onChange={(e) => setChannel(e.target.value)} className="mb-2 rounded-lg border border-white/10 bg-ink-950/70 px-2 py-1.5 text-xs text-white">
                      {data.channels.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                    </select>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Paste exactly what you sent" className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" />
                    <button onClick={async () => { if (await post({ action: "attempt", id: p.id, channel, message })) { setOpenId(null); await load(); } }} disabled={busy} className="mt-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">Record it</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
