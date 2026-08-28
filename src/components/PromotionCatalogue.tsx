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
import { AlertTriangle, Ban, Check, Loader2, Package, Plus, ShieldCheck, Store, Trash2, Upload } from "lucide-react";
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
type Product = { id: string; name: string; url: string; promotable: boolean; paused?: boolean; excludedReason?: string; offer: { pricePence: number } };
type Catalogue = { policy: { mode: Mode }; products: { product: Product; decision: Decision }[]; summary: string; modes: ModeSpec[] };

type ImportPlan = {
  summary: string; fatal?: string; readyCount: number; imported: number; dryRun: boolean;
  delimiter: string; decimal: string; headers: string[];
  mappedColumns: Record<string, number>;
  unmappedColumns: { index: number; header: string }[];
  sample: { row: number; name: string; url: string; offer: Record<string, number>; notes: string[] }[];
  refused: { row: number; name: string; problems: string[] }[];
  duplicates: { row: number; name: string; firstSeenRow: number }[];
  totalRows: number; permission?: string; next?: string;
};

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

  // FILL WHAT THE BRAND HAS ALREADY TOLD US.
  //
  // Name and page URL are the two boxes a brand can answer from its own
  // onboarding, so listing a product becomes a price and a cost rather than six
  // blanks. The ECONOMICS are never guessed — a cost of goods nobody typed is
  // the one number that must not be invented, because the commission is checked
  // against it. Only empty boxes are filled, and only until the form is touched.
  const [touched, setTouched] = useState(false);

  // BULK IMPORT. Two steps on purpose: a plan you can read, then the write.
  const [importText, setImportText] = useState("");
  const [decimal, setDecimal] = useState<"unknown" | "dot" | "comma">("unknown");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  useEffect(() => {
    if (!activeBrand || touched) return;
    setName((v) => v || activeBrand.product || "");
    setUrl((v) => v || activeBrand.website || "");
  }, [activeBrand, touched]);

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

  async function runImport(confirm: boolean) {
    const d = await post({ action: "import-catalogue", text: importText, decimal, confirm });
    if (d) {
      setPlan(d as ImportPlan);
      if (confirm) await load();
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Read locally and send the TEXT. The server parses it — the browser never
    // hands over a plan, so a stale page cannot mint a product nobody derived.
    setImportText(await file.text());
    setPlan(null);
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

      {/* BULK IMPORT — the door onto the catalogue.
          Open catalogue mode asks a brand to list everything and exclude
          individually, which is unusable if every product has to be typed. */}
      <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
        <h3 className="flex items-center gap-2 font-display font-bold text-white">
          <Upload className="h-4 w-4 text-emerald-400" /> Import your whole range
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Export from Shopify, WooCommerce or a spreadsheet and drop it in. We read the columns we
          recognise — name, price, cost, shipping, fees, tax — and show you exactly what will happen
          before anything is saved. <strong className="text-slate-300">Imported products stay switched off</strong> until you turn them on.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-400/50 hover:text-white">
            Choose a CSV
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" className="hidden" onChange={onFile} />
          </label>
          <span className="text-[11px] text-slate-500">or paste the rows below</span>
        </div>

        <textarea
          value={importText}
          onChange={(e) => { setImportText(e.target.value); setPlan(null); }}
          rows={4}
          spellCheck={false}
          placeholder={"Title,Price,Cost per item,Shipping\nOak desk,249.00,120.00,15.00"}
          className="mt-3 w-full rounded-lg border border-white/10 bg-ink-950/60 p-3 font-mono text-[11px] text-slate-200 placeholder:text-slate-600"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !importText.trim()}
            onClick={() => void runImport(false)}
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check the file"}
          </button>
          {plan && !plan.fatal && plan.readyCount > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void runImport(true)}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              Import {plan.readyCount} product{plan.readyCount === 1 ? "" : "s"}
            </button>
          )}
        </div>

        {/* THE CONVENTION QUESTION, asked only when it is the thing standing in
            the way. "1,299" is 1299 or 1.299 depending on where the file was
            written, and those are 100x apart — so it is asked, never guessed. */}
        {plan?.refused?.some((r) => r.problems.some((p) => p.includes("100× apart"))) && (
          <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
            <p className="flex items-start gap-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Some numbers in this file could mean two amounts a hundred times apart, so we have not
                guessed. How does your file write one thousand two hundred and ninety-nine pounds?
              </span>
            </p>
            <div className="mt-2 flex gap-2">
              {([["dot", "1,299.00"], ["comma", "1.299,00"]] as const).map(([mode, example]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { setDecimal(mode); void post({ action: "import-catalogue", text: importText, decimal: mode, confirm: false }).then((d) => d && setPlan(d as ImportPlan)); }}
                  className={`rounded-lg px-3 py-1.5 font-mono text-[11px] font-semibold ${decimal === mode ? "bg-emerald-500 text-ink-950" : "bg-white/10 text-slate-200 hover:bg-white/15"}`}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {plan && (
          <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
            <p className="text-xs font-semibold text-slate-200">{plan.fatal || plan.summary}</p>
            {plan.imported > 0 && (
              <p className="text-xs text-emerald-300">
                {plan.imported} imported. {plan.permission}
              </p>
            )}

            {/* A SAMPLE, not a summary. Seeing one product's price and cost land
                in the right fields is what catches a mis-mapped column before
                two hundred wrong ones are stored. */}
            {plan.sample?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-[11px]">
                  <thead className="text-slate-500">
                    <tr><th className="py-1 pr-3 font-semibold">Product</th><th className="py-1 pr-3 font-semibold">Price</th><th className="py-1 pr-3 font-semibold">Cost</th><th className="py-1 font-semibold">Shipping</th></tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {plan.sample.map((r) => (
                      <tr key={r.row} className="border-t border-white/5">
                        <td className="py-1 pr-3">{r.name}</td>
                        <td className="py-1 pr-3 font-mono">{money(r.offer.pricePence)}</td>
                        <td className="py-1 pr-3 font-mono">{money(r.offer.cogsPence)}</td>
                        <td className="py-1 font-mono">{money(r.offer.fulfilmentPence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.readyCount > plan.sample.length && (
                  <p className="mt-1 text-[11px] text-slate-500">…and {plan.readyCount - plan.sample.length} more, read the same way.</p>
                )}
              </div>
            )}

            {plan.unmappedColumns?.length > 0 && (
              <p className="text-[11px] text-slate-500">
                Columns we did not use: {plan.unmappedColumns.map((c) => c.header).join(", ")}. Nothing was
                dropped from your file — we simply have no field for them.
              </p>
            )}

            {/* THE REFUSALS IN FULL. These are the actionable half: a price that
                could not be read is a commission that would have been wrong. */}
            {plan.refused?.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-ink-950/50 p-3">
                <p className="text-[11px] font-semibold text-slate-300">
                  {plan.refused.length} row{plan.refused.length === 1 ? "" : "s"} not imported
                </p>
                <ul className="mt-1 space-y-1">
                  {plan.refused.slice(0, 12).map((r) => (
                    <li key={r.row} className="text-[11px] leading-relaxed text-slate-400">
                      <span className="text-slate-500">Row {r.row}</span> {r.name ? <strong className="text-slate-300">{r.name}</strong> : null} — {r.problems.join("; ")}
                    </li>
                  ))}
                </ul>
                {plan.refused.length > 12 && <p className="mt-1 text-[11px] text-slate-500">…and {plan.refused.length - 12} more.</p>}
              </div>
            )}

            {plan.duplicates?.length > 0 && (
              <p className="text-[11px] text-slate-500">
                {plan.duplicates.length} name{plan.duplicates.length === 1 ? " appears" : "s appear"} more than
                once in this file — the last one wins, the same as re-importing would.
              </p>
            )}
          </div>
        )}
      </div>

      <form onSubmit={addProduct} className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
        <h3 className="flex items-center gap-2 font-display font-bold text-white"><Package className="h-4 w-4 text-emerald-400" /> List a product</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          The economics are not optional. {ratePct(SHARE2EARN_RATE)} of a sale has to come out of what the product actually contributes, and a commission nobody has checked against a margin is how a campaign eats a business. Your costs stay here — a creator sees the price, their commission, and nothing else.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-300">Product name</span>
            <input value={name} onChange={(e) => { setTouched(true); setName(e.target.value); }} required className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" placeholder="Pro annual plan" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-300">Product page URL</span>
            <input value={url} onChange={(e) => { setTouched(true); setUrl(e.target.value); }} required type="url" className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" placeholder="https://yourbrand.com/pro" /></label>
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
              <input value={f.v} onChange={(e) => { setTouched(true); f.set(e.target.value); }} required={f.req} inputMode="decimal" className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" placeholder="0.00" />
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
                {/* PAUSE AND DELETE.
                    A pause stops NEW claims and leaves every tracked link that
                    is already published working — a creator cannot edit a post
                    from three weeks ago, and turning their link into a dead one
                    punishes them for the brand's change of mind. Delete is only
                    offered for a product nobody has claimed; the server refuses
                    the rest with 409 and says to pause instead. */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => post({ action: "pause-product", productId: product.id, paused: !product.paused })}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-white/25 hover:text-white disabled:opacity-60"
                  >
                    {product.paused ? <><Check className="h-3 w-3" /> Resume</> : <><Ban className="h-3 w-3" /> Pause</>}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`Delete "${product.name}" from the catalogue? This cannot be undone. If a creator has already claimed it, the deletion is refused and you can pause it instead.`)) return;
                      void post({ action: "delete-product", productId: product.id });
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-60"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
