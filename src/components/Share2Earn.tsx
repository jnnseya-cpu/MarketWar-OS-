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
type Mission = { id: string; title: string; kind: string; budgetPence: number; reservedPence: number; closesAt: string; fundingMode?: string; rewards: { label: string }[];
  /** True only when the brand's float actually holds the reservation. */
  funded?: boolean };
/**
 * What a pence box actually means, echoed beside its label.
 *
 * These boxes are in pence and the catalogue beside them is in pounds, so £19
 * was typed in as 0.19 and ProfitGuard was asked what a nineteen-hundredths-of-
 * a-penny product could afford. A unit that is only written in the label is a
 * unit somebody reads once.
 */
const money2 = (v: string): string => {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) && n > 0 ? ` = £${(n / 100).toFixed(2)}` : "";
};

type CatalogueProduct = {
  id: string; name: string;
  offer: { pricePence: number; cogsPence?: number; fulfilmentPence?: number; paymentFeePence?: number; taxPence?: number; returnsAllowancePct?: number; minProtectedMarginPence?: number };
};

type Line = { label: string; pence: number; kind: "in" | "cost" | "protected" | "reward" };
type Capacity = { capacity: { headline: string; caveat: string; availablePence: number; ratePct: number }; rate: { why: string }; split: { label: string; pence: number }[]; perTransaction: { note: string } };
type Flow = { ok: boolean; error?: string; hint?: string; lines?: Line[]; note?: string; economics?: { growthPoolPence: number; protectedMarginPence: number; contributionPence: number; breakEvenRoas: number; minPermittedRoas: number; notes: string[] } };

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
  // ProfitGuard — the offer's own economics, so the mission cannot promise more
  // than the margin can fund.
  const [price, setPrice] = useState("");
  const [cogs, setCogs] = useState("");
  const [fulfil, setFulfil] = useState("");
  const [payFee, setPayFee] = useState("");
  const [tax, setTax] = useState("");
  const [returnsPct, setReturnsPct] = useState("");
  const [protect, setProtect] = useState("");
  const [flow, setFlow] = useState<Flow | null>(null);
  // FILL FROM WHAT IS ALREADY THERE.
  //
  // Every one of the seven ProfitGuard boxes is a number the brand has already
  // typed into its catalogue, and this form made them type it again in PENCE
  // while the catalogue displays POUNDS. That is how "Price (p)" ends up
  // holding 0.19 for a £19 product, and why "Publish the mission" kept refusing
  // with "an offer with at least a price is required". Picking the product
  // fills all seven from the stored economics; every box stays editable, so a
  // one-off offer is still a matter of changing the number.
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [filledFrom, setFilledFrom] = useState("");
  const [floatState, setFloatState] = useState<{ heldPence: number; availablePence: number } | null>(null);
  const [generated, setGenerated] = useState("");
  const [committed, setCommitted] = useState("");
  const [cap, setCap] = useState<Capacity | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authedFetch("/api/share2earn").then((r) => r.json()).then((d) => {
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

  // The catalogue, for the fill. Read-only here — this screen never writes a
  // product, it only borrows the economics the catalogue screen already stored.
  useEffect(() => {
    if (!activeBrand?.id) return;
    authedFetch("/api/share2earn", { method: "POST", body: JSON.stringify({ action: "catalogue", brandId: activeBrand.id }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const rows = Array.isArray(d?.products) ? d.products : [];
        setProducts(rows.map((r: { product?: CatalogueProduct }) => r?.product).filter((p: CatalogueProduct | undefined): p is CatalogueProduct => Boolean(p?.id && p?.offer)));
      })
      .catch(() => { /* the boxes still take a number typed by hand */ });
    // The float's RESERVED total is exactly "already committed" — it is what is
    // promised to creators on missions that are still running. Typing it again
    // from memory is how a capacity check gets run against the wrong number.
    authedFetch(`/api/brand-float?brandId=${encodeURIComponent(activeBrand.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // `heldPence` is the float's own word for it: reserved against live
        // missions, promised and not yet paid. That IS "already committed".
        if (typeof d?.heldPence === "number") {
          setFloatState({ heldPence: d.heldPence, availablePence: Number(d.availablePence) || 0 });
          setCommitted(String(d.heldPence));
        }
      })
      .catch(() => { /* typed by hand, as before */ });
  }, [activeBrand?.id]);

  /** Put a product's stored economics into the boxes. Nothing is locked. */
  function fillFromProduct(id: string) {
    const p = products.find((x) => x.id === id);
    if (!p) { setFilledFrom(""); return; }
    const n = (v: number | undefined) => (typeof v === "number" && v > 0 ? String(Math.round(v)) : "");
    setPrice(n(p.offer.pricePence));
    setCogs(n(p.offer.cogsPence));
    setFulfil(n(p.offer.fulfilmentPence));
    setPayFee(n(p.offer.paymentFeePence));
    setTax(n(p.offer.taxPence));
    setReturnsPct(typeof p.offer.returnsAllowancePct === "number" && p.offer.returnsAllowancePct > 0 ? String(p.offer.returnsAllowancePct) : "");
    setProtect(n(p.offer.minProtectedMarginPence));
    setFilledFrom(p.name);
    setFlow(null); setCap(null);
    if (!title.trim()) setTitle(`${p.name} — drive a purchase`);
  }

  const offer = () => (Number(price) > 0 ? {
    pricePence: Number(price) || 0, cogsPence: Number(cogs) || 0, fulfilmentPence: Number(fulfil) || 0,
    paymentFeePence: Number(payFee) || 0, taxPence: Number(tax) || 0,
    returnsAllowancePct: Number(returnsPct) || 0, otherVariablePence: 0,
    minProtectedMarginPence: Number(protect) || 0,
  } : undefined);

  async function checkMargin() {
    const o = offer();
    if (!o) { setError("Enter the selling price to run ProfitGuard."); return; }
    const per = Number(salePence) || 0;
    const d = await post({ action: "waterfall", offer: o, allocation: { creatorPence: per, platformPence: Math.round(per * 0.25), reservePence: Math.round(per * 0.1), squadPence: 0 } });
    if (d) setFlow(d);
    else setFlow(null);
  }

  async function checkCapacity() {
    const o = offer();
    if (!o) { setError("Enter the selling price to run GrowthGuard."); return; }
    const d = await post({
      action: "capacity", offer: o,
      verifiedContributionPence: Number(generated) || 0,
      committedPence: Number(committed) || 0,
    });
    if (d) setCap(d);
  }

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
      offer: offer(),
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
        Share the products you like on your own channels. When a verified sale comes from your content you earn <span className="font-bold text-emerald-300">0.5% of the product value</span> — no follower gate, no application. Views, shares, clicks and streaks earn XP, rank and access rather than cash, so the merchant&rsquo;s margin is never spent on engagement that produced no sale.
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
        {/* ProfitGuard — the creator never reaches the protected margin, and the
            arithmetic is on screen rather than in a policy document. */}
        <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" /> ProfitGuard — what this offer can afford
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="text-[11px] text-slate-500">Price — pence{money2(price)}<input className="input mt-1" inputMode="numeric" value={price} onChange={(e) => { setPrice(e.target.value); setFlow(null); }} placeholder="1900" /></label>
            <label className="text-[11px] text-slate-500">Cost of goods — pence{money2(cogs)}<input className="input mt-1" inputMode="numeric" value={cogs} onChange={(e) => { setCogs(e.target.value); setFlow(null); }} /></label>
            <label className="text-[11px] text-slate-500">Fulfilment — pence{money2(fulfil)}<input className="input mt-1" inputMode="numeric" value={fulfil} onChange={(e) => { setFulfil(e.target.value); setFlow(null); }} /></label>
            <label className="text-[11px] text-slate-500">Payment fee — pence{money2(payFee)}<input className="input mt-1" inputMode="numeric" value={payFee} onChange={(e) => { setPayFee(e.target.value); setFlow(null); }} /></label>
            <label className="text-[11px] text-slate-500">Tax — pence{money2(tax)}<input className="input mt-1" inputMode="numeric" value={tax} onChange={(e) => { setTax(e.target.value); setFlow(null); }} /></label>
            <label className="text-[11px] text-slate-500">Returns %<input className="input mt-1" inputMode="numeric" value={returnsPct} onChange={(e) => { setReturnsPct(e.target.value); setFlow(null); }} /></label>
            <label className="text-[11px] text-slate-500">Protect — pence{money2(protect)}<input className="input mt-1" inputMode="numeric" value={protect} onChange={(e) => { setProtect(e.target.value); setFlow(null); }} placeholder="2000" /></label>
            <button className="btn-secondary mt-4" onClick={checkMargin} disabled={busy}>Check the margin</button>
          </div>

          {flow && flow.lines && (
            <div className="mt-3 divide-y divide-white/[0.06] rounded-lg border border-white/10 bg-ink-900/60">
              {flow.lines.map((l, i) => (
                <div key={i} className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs ${l.kind === "protected" ? "text-amber-200" : l.kind === "reward" ? "text-slate-400" : "text-white"}`}>
                  <span>{l.label}</span>
                  <span className={`font-mono ${l.pence < 0 ? "text-slate-500" : "font-bold"}`}>{l.pence < 0 ? "−" : ""}{money(Math.abs(l.pence))}</span>
                </div>
              ))}
            </div>
          )}
          {flow?.note && <p className="mt-2 text-[11px] leading-relaxed text-emerald-200/80">{flow.note}</p>}
          {flow && flow.ok === false && (
            <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-2.5 text-[11px] leading-relaxed text-rose-200">
              <span className="font-bold">ProfitGuard refused this. </span>{flow.error} {flow.hint}
            </p>
          )}
          {flow?.economics?.notes?.map((n, i) => (
            <p key={i} className="mt-2 text-[11px] leading-relaxed text-amber-200/80">{n}</p>
          ))}
          {/* GrowthGuard — the line that tells an owner this channel cannot run
              away from them. */}
          <div className="mt-3 rounded-lg border border-white/10 bg-ink-900/60 p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">GrowthGuard — the 5% ceiling</p>
            {/* "Already committed" is filled from the float's own held total.
                "Verified contribution generated" is NOT filled, deliberately:
                it is the contribution this channel has actually produced, and
                there is nothing on this deployment that has measured it yet. A
                prefilled guess in a box labelled "verified" is the one thing
                this module must never do — the whole ceiling is computed from
                it. */}
            {floatState && (
              <p className="mb-2 text-[11px] text-emerald-300/80">
                Already committed filled from your float: £{(floatState.heldPence / 100).toFixed(2)} is reserved against missions that are still running, and £{(floatState.availablePence / 100).toFixed(2)} is free.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-[11px] text-slate-500">Verified contribution generated — pence{money2(generated)}<input className="input mt-1" inputMode="numeric" value={generated} onChange={(e) => { setGenerated(e.target.value); setCap(null); }} placeholder="1000000" /></label>
              <label className="text-[11px] text-slate-500">Already committed — pence{money2(committed)}<input className="input mt-1" inputMode="numeric" value={committed} onChange={(e) => { setCommitted(e.target.value); setCap(null); }} /></label>
              <button className="btn-secondary mt-4" onClick={checkCapacity} disabled={busy}>Reward capacity</button>
            </div>
            {cap && (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs font-semibold text-white">{cap.capacity.headline}</p>
                <p className="text-[11px] leading-relaxed text-slate-400">{cap.rate.why}</p>
                <p className="text-[11px] leading-relaxed text-slate-500">{cap.perTransaction.note}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {cap.split.map((r) => (
                    <span key={r.label} className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-slate-300">{r.label} <span className="font-mono text-emerald-300">{money(r.pence)}</span></span>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-amber-200/80">{cap.capacity.caveat}</p>
              </div>
            )}
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Creators earn from the value they create — never from the survival margin of the business. Everything below the protected line is unreachable, a reward configuration that exceeds the pool is refused rather than warned about, and the whole module costs at most 5% of the value it generates — you keep at least 95%.
          </p>
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
                {/* "RESERVED" IS A CLAIM ABOUT MONEY, MADE TO THE PUBLIC.
                    This said "£X reserved" for every mission, on a page anybody
                    can read, while nothing held the money — it was a number on a
                    record. It now says reserved only when the brand's float
                    actually holds it, and says plainly when it does not, because
                    somebody is deciding whether to do work on the strength of
                    this line. */}
                {m.funded ? (
                  <span className="ml-auto text-emerald-300">{money(m.reservedPence)} held for this mission</span>
                ) : (
                  <span className="ml-auto text-amber-300">{money(m.budgetPence)} budgeted — not yet funded</span>
                )}
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
