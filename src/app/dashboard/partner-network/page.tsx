"use client";

// MarketWar Growth Partner Network — Brand Programme Dashboard (spec §21).
// The full working loop for the active brand: create programmes (whole brand /
// a product / both / custom, multiple campaigns) → admit partners (admin can
// waive the 10K gate) → issue tracked code+link per programme → record verified
// conversions (Attribution + Fraud agents) → per-customer £20K split + wallet →
// request payout (10K gate, BitriPay honest state). All computed, nothing faked.

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Users, LinkIcon, Wallet, Radar, ShieldCheck, Copy } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { EARNING_TIERS } from "@/shared/creator-program";

type Programme = { id: string; name: string; scope: string; target: string; campaign?: string; product: string; description: string };
type Wallet = { payoutEligible: boolean; followers: number; cumulativeNetGbp: number; countedEvents: number; flaggedEvents: number; lifetimeCreatorGbp: number; lifetimePlatformGbp: number; payableGbp: number; pendingGbp: number; gateNote: string; perCustomer: { ref: string; netGbp: number; creatorGbp: number; platformGbp: number; state: string; progressPct: number }[] };

async function api(action: string, body: Record<string, unknown>) {
  const res = await authedFetch("/api/creator-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, nowISO: new Date().toISOString(), ...body }) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Request failed (${res.status})`); }
  return res.json();
}
const money = (n: number) => `£${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function PartnerNetworkPage() {
  const { activeBrand } = useActiveBrand();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [pName, setPName] = useState(""); const [pScope, setPScope] = useState("brand"); const [pTarget, setPTarget] = useState(""); const [pCampaign, setPCampaign] = useState(""); const [pDesc, setPDesc] = useState(""); const [pDest, setPDest] = useState("");
  // Partner admit + subscribe + convert
  const [cName, setCName] = useState(""); const [cEmail, setCEmail] = useState(""); const [cFollowers, setCFollowers] = useState(0); const [cOverride, setCOverride] = useState(false);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [subs, setSubs] = useState<{ programmeId: string; code: string; link: string }[]>([]);
  const [convCode, setConvCode] = useState(""); const [convRef, setConvRef] = useState("customer-1"); const [convGross, setConvGross] = useState(1000); const [convFees, setConvFees] = useState(0);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [payout, setPayout] = useState<string | null>(null);
  const [region, setRegion] = useState("other");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadProgrammes = useCallback(async () => {
    if (!activeBrand) return;
    try { const d = await api("list_programmes", { brandId: activeBrand.id }); setProgrammes(d.programmes || []); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load programmes"); }
  }, [activeBrand]);
  useEffect(() => { loadProgrammes(); }, [loadProgrammes]);

  async function createProgramme() {
    if (!activeBrand || !pName) return;
    setBusy("prog"); setError(null);
    try { await api("create_programme", { brandId: activeBrand.id, brandName: activeBrand.name, name: pName, scope: pScope, target: pTarget, campaign: pCampaign, destinationUrl: pDest, product: pTarget || activeBrand.product, description: pDesc }); setPName(""); setPTarget(""); setPCampaign(""); setPDesc(""); setPDest(""); await loadProgrammes(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not create programme"); }
    finally { setBusy(""); }
  }
  async function admitPartner() {
    if (!cName || !cEmail) return;
    setBusy("partner"); setError(null);
    try { const d = await api("register_creator", { name: cName, email: cEmail, followers: cFollowers, followersVerified: true, adminOverride: cOverride, platforms: 3 }); setCreatorId(d.creator.id); setSubs([]); setWallet(null); setPayout(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not admit partner"); }
    finally { setBusy(""); }
  }
  async function subscribe(programmeId: string) {
    if (!creatorId) return;
    setBusy("sub" + programmeId); setError(null);
    try { const d = await api("subscribe", { creatorId, programmeId }); if (d.subscription) { setSubs((s) => [...s.filter((x) => x.programmeId !== programmeId), { programmeId, code: d.subscription.code, link: d.subscription.link }]); if (!convCode) setConvCode(d.subscription.code); } }
    catch (e) { setError(e instanceof Error ? e.message : "Could not subscribe partner"); }
    finally { setBusy(""); }
  }
  async function recordConversion() {
    setBusy("conv"); setError(null);
    try {
      // Idempotency key = the source order id. Here (ops/testing) we synthesise a
      // stable-per-input key so re-clicks don't double-count.
      const idempotencyKey = `${convCode}-${convRef}-${convGross}-${convFees}`;
      const d = await api("record_conversion", { code: convCode, grossGbp: convGross, feesGbp: convFees, referredRef: convRef, idempotencyKey });
      if (d.error) setError(d.error); else await refreshWallet();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not record conversion"); }
    finally { setBusy(""); }
  }
  const refreshWallet = useCallback(async () => { if (!creatorId) return; try { setWallet(await api("wallet", { creatorId })); } catch (e) { setError(e instanceof Error ? e.message : "Could not load wallet"); } }, [creatorId]);
  async function requestPayout() { if (!creatorId) return; setBusy("payout"); setError(null); try { const d = await api("payout", { creatorId, region }); setPayout(d.reason); } catch (e) { setError(e instanceof Error ? e.message : "Payout failed"); } finally { setBusy(""); } }

  const input = "w-full rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/60";

  return (
    <div>
      <PageHeader
        kicker="Growth Partner Network · Brand Programme Dashboard"
        title="Turn creators, affiliates and promoters into a measurable acquisition channel"
        subtitle="Create programmes for a whole brand, a product, both or anything — run multiple campaigns. Admit partners (admin can waive the 10K gate), issue a tracked code + link per programme, record verified conversions, and see the per-customer £20K split, wallet and payout. The 1% (0.75% partner + 0.25% platform) is charged to the promoted brand as its acquisition cost. Every figure is computed; nothing is faked."
        actions={<Pill tone="info">0.75% partner · 0.25% platform · £20K cap</Pill>}
      />

      {!activeBrand && <div className="card border-emerald-500/20 p-10 text-center"><Users className="mx-auto mb-2 h-7 w-7 text-emerald-500/60" /><h2 className="font-display text-lg font-bold text-white">Add a brand to run a partner programme</h2></div>}

      {error && <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/[0.08] p-3 text-sm text-rose-300">{error}</div>}

      {activeBrand && (
        <div className="space-y-6">
          {/* Tiers */}
          <div className="grid gap-3 sm:grid-cols-4">
            {EARNING_TIERS.map((t) => (
              <div key={t.key} className="card p-4"><p className="font-display text-sm font-bold text-white">{t.label}</p><p className="mt-0.5 text-[11px] font-semibold text-emerald-300">{t.model}</p><p className="mt-1 text-xs text-slate-500">{t.forWhom}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-slate-600">Unlock: {t.unlock}</p></div>
            ))}
          </div>

          {/* 1. Create programme */}
          <div className="card border-emerald-500/30 p-6">
            <div className="mb-3 flex items-center gap-2"><Plus className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">1 · Create a programme</h3></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block"><span className="mb-1 block text-xs text-slate-400">Programme name</span><input className={input} value={pName} onChange={(e) => setPName(e.target.value)} placeholder="e.g. Summer launch" /></label>
              <label className="block"><span className="mb-1 block text-xs text-slate-400">Scope</span>
                <select className={input} value={pScope} onChange={(e) => setPScope(e.target.value)}>
                  <option value="brand">Whole brand</option><option value="product">A product</option><option value="both">Brand + product</option><option value="custom">Custom</option>
                </select>
              </label>
              <label className="block"><span className="mb-1 block text-xs text-slate-400">Target (product / custom)</span><input className={input} value={pTarget} onChange={(e) => setPTarget(e.target.value)} placeholder={pScope === "brand" ? activeBrand.name : "product / target"} /></label>
              <label className="block"><span className="mb-1 block text-xs text-slate-400">Campaign (optional — run many)</span><input className={input} value={pCampaign} onChange={(e) => setPCampaign(e.target.value)} placeholder="e.g. Q3 push" /></label>
              <label className="sm:col-span-2 lg:col-span-3 block"><span className="mb-1 block text-xs text-slate-400">Destination URL — YOUR brand&rsquo;s CTA / landing / bank link (every code sends traffic here, with the ref attached)</span><input className={input} value={pDest} onChange={(e) => setPDest(e.target.value)} placeholder="https://your-brand.com/offer" /></label>
              <label className="sm:col-span-2 lg:col-span-3 block"><span className="mb-1 block text-xs text-slate-400">Description</span><input className={input} value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="What partners promote + the offer" /></label>
            </div>
            <button className="btn-primary mt-4" onClick={createProgramme} disabled={busy === "prog" || !pName}>{busy === "prog" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create programme</button>
          </div>

          {/* Catalogue */}
          {programmes.length > 0 && (
            <div className="card p-6">
              <h3 className="mb-3 font-display font-bold text-white">Your programmes ({programmes.length})</h3>
              <div className="space-y-2">
                {programmes.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                    <div><p className="font-semibold text-white">{p.name} {p.campaign && <span className="text-xs text-slate-500">· {p.campaign}</span>}</p><p className="text-xs text-slate-500">{p.scope} · {p.target}</p></div>
                    <button className="btn-ghost !py-1.5 !text-xs" onClick={() => subscribe(p.id)} disabled={!creatorId || busy === "sub" + p.id}>{busy === "sub" + p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />} Subscribe partner</button>
                  </div>
                ))}
              </div>
              {!creatorId && <p className="mt-2 text-xs text-amber-400/80">Admit a partner below to subscribe them and generate codes/links.</p>}
            </div>
          )}

          {/* 2. Admit a partner */}
          <div className="card p-6">
            <div className="mb-3 flex items-center gap-2"><Users className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">2 · Admit a partner</h3></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block"><span className="mb-1 block text-xs text-slate-400">Name</span><input className={input} value={cName} onChange={(e) => setCName(e.target.value)} /></label>
              <label className="block"><span className="mb-1 block text-xs text-slate-400">Email</span><input className={input} value={cEmail} onChange={(e) => setCEmail(e.target.value)} /></label>
              <label className="block"><span className="mb-1 block text-xs text-slate-400">Total followers</span><input type="number" className={input} value={cFollowers} onChange={(e) => setCFollowers(Number(e.target.value))} /></label>
              <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={cOverride} onChange={(e) => setCOverride(e.target.checked)} className="accent-emerald-500" /> Admin: waive 10K gate</label>
            </div>
            <button className="btn-primary mt-4" onClick={admitPartner} disabled={busy === "partner" || !cName || !cEmail}>{busy === "partner" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Admit partner</button>
            {creatorId && <p className="mt-2 text-xs text-emerald-300">Partner admitted. Subscribe them to programmes above.</p>}
          </div>

          {/* Codes/links */}
          {subs.length > 0 && (
            <div className="card p-6">
              <h3 className="mb-3 font-display font-bold text-white">Tracked codes + links</h3>
              <div className="space-y-2">
                {subs.map((s) => (
                  <div key={s.programmeId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-ink-900/50 p-3 text-sm">
                    <span className="font-mono text-emerald-300">{s.code}</span>
                    <span className="font-mono text-slate-400">{s.link}</span>
                    <button className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200" onClick={() => navigator.clipboard?.writeText(s.code)}><Copy className="h-3.5 w-3.5" /> Copy code</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Record a verified conversion */}
          {creatorId && (
            <div className="card p-6">
              <div className="mb-3 flex items-center gap-2"><Radar className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">3 · Record a verified conversion (Attribution + Fraud agent)</h3></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block"><span className="mb-1 block text-xs text-slate-400">Referral code</span><input className={input} value={convCode} onChange={(e) => setConvCode(e.target.value)} /></label>
                <label className="block"><span className="mb-1 block text-xs text-slate-400">Referred customer ref</span><input className={input} value={convRef} onChange={(e) => setConvRef(e.target.value)} /></label>
                <label className="block"><span className="mb-1 block text-xs text-slate-400">Gross revenue (£)</span><input type="number" className={input} value={convGross} onChange={(e) => setConvGross(Number(e.target.value))} /></label>
                <label className="block"><span className="mb-1 block text-xs text-slate-400">VAT/fees/refunds (£)</span><input type="number" className={input} value={convFees} onChange={(e) => setConvFees(Number(e.target.value))} /></label>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Commission is computed on Eligible Net Revenue = gross − VAT/fees/refunds.</p>
              <button className="btn-primary mt-3" onClick={recordConversion} disabled={busy === "conv" || !convCode}>{busy === "conv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />} Record conversion</button>
            </div>
          )}

          {/* 4. Wallet */}
          {creatorId && (
            <div className="card border-emerald-500/20 p-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-emerald-400" /><h3 className="font-display font-bold text-white">4 · Partner wallet</h3></div>
                <button className="btn-ghost !py-1.5 !text-xs" onClick={refreshWallet}>Refresh</button>
              </div>
              {wallet ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3"><p className="text-xs text-slate-400">Payable</p><p className="font-display text-xl font-bold text-emerald-300">{money(wallet.payableGbp)}</p></div>
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3"><p className="text-xs text-slate-400">Pending</p><p className="font-display text-xl font-bold text-amber-300">{money(wallet.pendingGbp)}</p></div>
                    <div className="rounded-lg border border-white/[0.08] bg-ink-900/50 p-3"><p className="text-xs text-slate-400">Platform (0.25% + post-cap)</p><p className="font-display text-xl font-bold text-white">{money(wallet.lifetimePlatformGbp)}</p></div>
                    <div className="rounded-lg border border-white/[0.08] bg-ink-900/50 p-3"><p className="text-xs text-slate-400">Net revenue tracked</p><p className="font-display text-xl font-bold text-white">{money(wallet.cumulativeNetGbp)}</p></div>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> {wallet.gateNote}</p>
                  {wallet.perCustomer.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-xs font-semibold text-slate-400">Per referred customer (£20K cap each):</p>
                      {wallet.perCustomer.map((c) => (
                        <div key={c.ref} className="rounded-lg border border-white/[0.06] bg-ink-900/40 p-2.5 text-sm">
                          <div className="flex items-center justify-between"><span className="text-slate-200">{c.ref} <span className="text-slate-500">· net {money(c.netGbp)}</span></span><Pill tone={c.state === "PARTNER_EARNING" ? "good" : c.state === "MARKETWAR_EARNING" ? "warn" : "neutral"}>{c.state.replace(/_/g, " ").toLowerCase()}</Pill></div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700/60"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.progressPct}%` }} /></div>
                          <p className="mt-1 text-[11px] text-slate-500">You {money(c.creatorGbp)} · platform {money(c.platformGbp)} · {c.progressPct}% to £20K cap</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2 text-sm text-white">
                      <option value="africa">Africa → BitriPay (mobile money)</option>
                      <option value="other">Rest of world → Stripe</option>
                    </select>
                    <button className="btn-primary" onClick={requestPayout} disabled={busy === "payout"}>{busy === "payout" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Request payout</button>
                    {payout && <p className="text-xs text-slate-400">{payout}</p>}
                  </div>
                </>
              ) : <p className="text-sm text-slate-500">Record a conversion, then refresh to see the wallet.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
