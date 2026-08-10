"use client";

// MarketWar SHARE2EARN™ — post, move your audience, earn.
//
// Two audiences on one screen, because they are two halves of one deal: the
// creator needs to know what they can earn and how it is counted, and the brand
// needs to publish a mission whose bounties are actually funded.
//
// Everything numeric here comes from src/backend/share2earn.ts. The browser
// shows what the server counted; it does not compute a rate, a score or a
// worst case of its own — a second copy of a payout rule is a second place for
// it to be wrong, and this one is wrong in money.

import { useEffect, useState } from "react";
import { Ban, Check, Coins, Flame, Info, Loader2, Rocket, ShieldCheck, Users } from "lucide-react";
import { Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Band = { id: string; programme: string; label: string; minFollowers: number; creatorPct: string; totalPct: string; requires: string };
type Action = { id: string; label: string; measuredBy: string; payableNow: boolean; blockedReason?: string; pencePerUnit: number | null; dailyUnitCap: number };
type Kind = { id: string; label: string; asks: string };
type Mission = { id: string; title: string; kind: string; budgetPence: number; reservedPence: number; closesAt: string; rewards: { label: string }[] };

const money = (p: number) => `£${(p / 100).toFixed(2)}`;

export default function Share2Earn() {
  const { activeBrand } = useActiveBrand();
  const [bands, setBands] = useState<Band[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [doctrine, setDoctrine] = useState<string[]>([]);
  const [rate, setRate] = useState("");
  const [missions, setMissions] = useState<Mission[]>([]);

  // The mission builder
  const [kind, setKind] = useState("share_and_earn");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [clicks, setClicks] = useState("100");
  const [sales, setSales] = useState("2");
  const [salePence, setSalePence] = useState("500");
  const [bonusPence, setBonusPence] = useState("1000");
  const [creators, setCreators] = useState("20");
  const [budget, setBudget] = useState("");
  const [quote, setQuote] = useState<{ worstCasePence: number; perCreatorPence: number; note: string } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/share2earn").then((r) => r.json()).then((d) => {
      setBands(Array.isArray(d?.bands) ? d.bands : []);
      setActions(Array.isArray(d?.actions) ? d.actions : []);
      setKinds(Array.isArray(d?.missionKinds) ? d.missionKinds : []);
      setDoctrine(Array.isArray(d?.doctrine) ? d.doctrine : []);
      setRate(d?.rate || "");
    }).catch(() => { /* the builder still posts */ });
  }, []);

  useEffect(() => {
    if (!activeBrand?.id) return;
    authedFetch(`/api/share2earn?brandId=${encodeURIComponent(activeBrand.id)}`)
      .then((r) => r.json())
      .then((d) => setMissions(Array.isArray(d?.missions) ? d.missions : []))
      .catch(() => { /* list is context */ });
  }, [activeBrand?.id]);

  const rewards = () => [
    { actionId: "traffic", units: Number(clicks) || 0, label: `${clicks} clicks` },
    { actionId: "sale", units: Number(sales) || 0, pencePerUnit: Number(salePence) || 0, bonusPence: Number(bonusPence) || 0, label: `${sales} sales + bonus` },
  ];

  async function post(body: Record<string, unknown>) {
    if (!activeBrand?.id) { setError("Pick a brand first."); return null; }
    setBusy(true); setError("");
    try {
      const res = await authedFetch("/api/share2earn", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: activeBrand.id, ...body }),
      });
      const d = await res.json();
      if (!res.ok) { setError([d?.error, d?.hint].filter(Boolean).join(" — ")); return null; }
      return d;
    } catch { setError("Could not reach the SHARE2EARN engine."); return null; }
    finally { setBusy(false); }
  }

  async function getQuote() {
    const d = await post({ action: "quote", rewards: rewards(), expectedCreators: Number(creators) || 1 });
    if (d) { setQuote(d); if (!budget) setBudget(String(d.worstCasePence)); }
  }

  async function publish() {
    const d = await post({
      action: "mission", kind, title, brief,
      rewards: rewards(),
      expectedCreators: Number(creators) || 1,
      budgetPence: Number(budget) || 0,
    });
    if (d) {
      setNote(d.note || "");
      setMissions((m) => [d.mission, ...m]);
      setTitle(""); setBrief("");
    }
  }

  return (
    <div className="mb-6 card border-orange-500/25 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Flame className="h-5 w-5 text-orange-400" />
        <h2 className="font-display text-lg font-bold text-white">SHARE2EARN — post, move your audience, earn</h2>
        {rate && <Pill tone="good">{rate} on a sale</Pill>}
      </div>
      <p className="mb-4 text-sm text-slate-400">
        No follower gate. 350 people who trust you are worth more than 80,000 who scroll past, and the Creator Score measures results rather than reach — followers are not an input to it.
      </p>

      {/* The ladder, so nobody has to guess which band they are in. */}
      {bands.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="pb-1.5 font-semibold">Band</th>
                <th className="pb-1.5 font-semibold">You earn</th>
                <th className="pb-1.5 font-semibold">Brand pays</th>
                <th className="pb-1.5 font-semibold">To qualify</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {bands.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 pr-3 font-semibold text-white">{b.label}</td>
                  <td className="py-2 pr-3 font-bold text-emerald-300">{b.creatorPct}</td>
                  <td className="py-2 pr-3 text-slate-400">{b.totalPct}</td>
                  <td className="py-2 text-slate-500">{b.requires}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* What counts, and what deliberately does not. */}
      <div className="mb-5 grid gap-2 sm:grid-cols-2">
        {actions.map((a) => (
          <div key={a.id} className={`rounded-lg border p-3 ${a.payableNow ? "border-white/10 bg-white/[0.03]" : "border-amber-500/25 bg-amber-500/[0.05]"}`}>
            <p className="flex items-center gap-1.5 text-xs font-bold text-white">
              {a.payableNow ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Ban className="h-3.5 w-3.5 text-amber-400" />}
              {a.label}
              {a.pencePerUnit != null && a.payableNow && <span className="ml-auto font-mono text-emerald-300">{money(a.pencePerUnit)}</span>}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{a.measuredBy}</p>
            {a.blockedReason && <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">{a.blockedReason}</p>}
          </div>
        ))}
      </div>

      {/* Brand side — publish a mission whose bounties are funded. */}
      <div className="rounded-lg border border-white/10 bg-ink-900/50 p-4">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Rocket className="h-3.5 w-3.5" /> Publish a mission
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => <option key={k.id} value={k.id}>{k.label} — {k.asks}</option>)}
          </select>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="48H Drop Challenge" />
          <input className="input sm:col-span-2" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="What the creator actually has to do" />
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-5">
          <label className="text-[11px] text-slate-500">Clicks<input className="input mt-1" inputMode="numeric" value={clicks} onChange={(e) => { setClicks(e.target.value); setQuote(null); }} /></label>
          <label className="text-[11px] text-slate-500">Sales<input className="input mt-1" inputMode="numeric" value={sales} onChange={(e) => { setSales(e.target.value); setQuote(null); }} /></label>
          <label className="text-[11px] text-slate-500">Pence/sale<input className="input mt-1" inputMode="numeric" value={salePence} onChange={(e) => { setSalePence(e.target.value); setQuote(null); }} /></label>
          <label className="text-[11px] text-slate-500">Bonus (p)<input className="input mt-1" inputMode="numeric" value={bonusPence} onChange={(e) => { setBonusPence(e.target.value); setQuote(null); }} /></label>
          <label className="text-[11px] text-slate-500">Creators<input className="input mt-1" inputMode="numeric" value={creators} onChange={(e) => { setCreators(e.target.value); setQuote(null); }} /></label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-secondary" onClick={getQuote} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />} What could this cost?
          </button>
          {quote && (
            <span className="text-xs text-slate-300">
              Worst case <span className="font-bold text-white">{money(quote.worstCasePence)}</span> ({money(quote.perCreatorPence)} per creator)
            </span>
          )}
        </div>
        {quote && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{quote.note}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-slate-500">Budget (pence)<input className="input mt-1 w-40" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
          <button className="btn-primary mt-4" onClick={publish} disabled={busy || !title.trim() || !budget}>
            <Rocket className="h-4 w-4" /> Publish the mission
          </button>
        </div>

        {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}
        {note && <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-xs text-emerald-200">{note}</p>}
      </div>

      {missions.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"><Users className="h-3.5 w-3.5" /> Live missions</p>
          <ul className="space-y-1.5">
            {missions.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-ink-900/50 p-2.5 text-xs">
                <span className="font-semibold text-white">{m.title}</span>
                <span className="text-slate-500">{m.kind.replace(/_/g, " ")}</span>
                <span className="ml-auto text-emerald-300">{money(m.reservedPence)} reserved of {money(m.budgetPence)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {doctrine.length > 0 && (
        <ul className="mt-4 space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          {doctrine.map((d, i) => (
            <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-500">
              {i === 0 ? <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />}
              {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
