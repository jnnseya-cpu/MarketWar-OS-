"use client";

// THE BRAND'S ANSWER TO "WHAT CAN PEOPLE PROMOTE?"
//
// Three modes and a product list. The screen shows both gates separately,
// because a brand's real question about a product is not "is it on" but "why
// can nobody take this one" — and the two possible answers need different
// actions. If the brand closed it, the brand opens it. If the margin closed it,
// nothing on this screen can open it, and saying so plainly is more useful than
// a toggle that appears to work.
//
// Every number here is computed server-side by the same functions the sale path
// uses. The browser does not decide eligibility; it renders the decision.

import { useCallback, useEffect, useState } from "react";
import { Ban, Check, Loader2, Package, Plus, ShieldCheck, Store } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { ratePct, SHARE2EARN_RATE } from "@/shared/creator-program";

type Mode = "mission_only" | "curated" | "open_catalogue";
type ModeSpec = { mode: Mode; label: string; what: string; suits: string };
type Decision = {
  productId: string; name: string; open: boolean;
  brandAllows: boolean; brandReason: string;
  eligibility: { eligible: boolean; reason: string; fix?: string; commissionPence: number };
  commissionPence: number; eligiblePence: number; reason: string;
};
type Product = { id: string; name: string; url: string; promotable: boolean; excludedReason?: string; offer: { pricePence: number } };
type Catalogue = { policy: { mode: Mode }; products: { product: Product; decision: Decision }[]; summary: string; modes: ModeSpec[] };

const money = (p: number) => `£${(p / 100).toFixed(2)}`;
const toPence = (v: string) => Math.max(0, Math.round((Number(v) || 0) * 100));

export default function PromotionCatalogue() {
  const { activeBrand } = useActiveBrand();
  const brandId = activeBrand?.id;
  const [data, setData] = useState<Catalogue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The product form — the economics are mandatory, for the same reason a
  // sale-paying mission cannot be published without them.
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [cogs, setCogs] = useState("");
  const [fulfil, setFulfil] = useState("");
  const [payFee, setPayFee] = useState("");
  const [tax, setTax] = useState("");
  const [protectPct, setProtectPct] = useState("20");

  const post = useCallback(async (body: Record<string, unknown>) => {
    if (!brandId) return null;
    setBusy(true); setError(null);
    try {
      const res = await authedFetch("/api/share2earn", { method: "POST", body: JSON.stringify({ brandId, ...body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "That did not go through."); return null; }
      return d;
    } catch { setError("Network error — please try again."); return null; }
    finally { setBusy(false); }
  }, [brandId]);

  const load = useCallback(async () => {
    const d = await post({ action: "catalogue" });
    if (d) setData(d as Catalogue);
  }, [post]);

  useEffect(() => { if (brandId) void load(); }, [brandId, load]);

  async function setMode(mode: Mode) {
    const d = await post({ action: "promotion-mode", mode });
    if (d) setData((prev) => ({ ...(prev as Catalogue), ...(d as Catalogue) }));
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    const d = await post({
      action: "product", name, url,
      offer: {
        pricePence: toPence(price), cogsPence: toPence(cogs), fulfilmentPence: toPence(fulfil),
        paymentFeePence: toPence(payFee), taxPence: toPence(tax),
        minProtectedMarginPct: Number(protectPct) || 0,
      },
    });
    if (d) { setName(""); setUrl(""); await load(); }
  }

  if (!brandId) return <p className="text-sm text-slate-400">Pick a brand to set what creators can promote.</p>;

  const mode = data?.policy?.mode || "mission_only";
  const modes = data?.modes || [];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
        <h3 className="flex items-center gap-2 font-display font-bold text-white"><Store className="h-4 w-4 text-emerald-400" /> What creators may promote</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          You choose. Missions only is the default, because no brand should start owing commission on a product nobody has looked at.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {modes.map((m) => (
            <button
              key={m.mode}
              type="button"
              onClick={() => void setMode(m.mode)}
              disabled={busy}
              className={`rounded-xl border p-4 text-left transition ${mode === m.mode ? "border-emerald-500/40 bg-emerald-500/[0.07]" : "border-white/10 bg-ink-950/40 hover:border-white/20"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-sm font-bold text-white">{m.label}</p>
                {mode === m.mode && <Check className="h-4 w-4 text-emerald-400" />}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{m.what}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{m.suits}</p>
            </button>
          ))}
        </div>
        {data?.summary && <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-950/40 p-3 text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> {data.summary}</p>}
      </div>

      <form onSubmit={addProduct} className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
        <h3 className="flex items-center gap-2 font-display font-bold text-white"><Package className="h-4 w-4 text-emerald-400" /> List a product</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          The economics are not optional. {ratePct(SHARE2EARN_RATE)} of a sale has to come out of what the product actually contributes, and a commission nobody has checked against a margin is how a campaign eats a business. Your costs stay here — a creator sees the price, their commission, and nothing else.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-300">Product name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" placeholder="Pro annual plan" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-300">Product page URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} required type="url" className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" placeholder="https://yourbrand.com/pro" /></label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Price (£)", v: price, set: setPrice, req: true },
            { label: "Cost of goods (£)", v: cogs, set: setCogs },
            { label: "Fulfilment (£)", v: fulfil, set: setFulfil },
            { label: "Payment fee (£)", v: payFee, set: setPayFee },
            { label: "Tax in the price (£)", v: tax, set: setTax },
            { label: "Margin you protect (%)", v: protectPct, set: setProtectPct },
          ].map((f) => (
            <label key={f.label} className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-300">{f.label}</span>
              <input value={f.v} onChange={(e) => f.set(e.target.value)} required={f.req} inputMode="decimal" className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" placeholder="0.00" />
            </label>
          ))}
        </div>
        {error && <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-2.5 text-xs text-rose-200">{error}</p>}
        <button type="submit" disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to catalogue
        </button>
      </form>

      {data && data.products.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
          <h3 className="font-display font-bold text-white">Your catalogue</h3>
          <div className="mt-3 space-y-2">
            {data.products.map(({ product, decision }) => (
              <div key={product.id} className={`rounded-lg border p-3 ${decision.open ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-white/[0.08] bg-ink-950/40"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{product.name}</p>
                    <p className="text-xs text-slate-500">{money(product.offer.pricePence)} · creator earns {money(decision.commissionPence)} per verified sale</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${decision.open ? "bg-emerald-500/15 text-emerald-300" : decision.brandAllows ? "bg-amber-500/15 text-amber-300" : "bg-white/10 text-slate-400"}`}>
                    {decision.open ? <><Check className="h-3 w-3" /> Claimable</> : <><Ban className="h-3 w-3" /> {decision.brandAllows ? "Margin says no" : "Closed by you"}</>}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{decision.reason}</p>
                {decision.eligibility.fix && !decision.eligibility.eligible && (
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-300/80">{decision.eligibility.fix}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
