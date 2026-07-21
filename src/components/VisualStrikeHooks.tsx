"use client";

// VisualStrike Hook Lab — generate the 130-hook library for a product and
// publish a chosen hook straight to channels. Wired to /api/visualstrike
// (action=hooks) for generation and PublishToChannels for one-click posting.
// Reads the active brand for the product default; demo-safe.

import { useState } from "react";
import { Loader2, Sparkles, Check } from "lucide-react";
import PublishToChannels from "@/components/PublishToChannels";
import { useActiveBrand } from "@/frontend/brand-context";

type Hook = { type: string; family: string; text: string; score: number; deceptive: boolean };

export default function VisualStrikeHooks() {
  const { activeBrand } = useActiveBrand();
  const [product, setProduct] = useState("");
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [count, setCount] = useState(0);
  const [families, setFamilies] = useState(0);
  const [chosen, setChosen] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const productName = product.trim() || activeBrand?.name || "your product";

  async function generate() {
    setBusy(true); setHooks(null); setChosen("");
    try {
      const r = await fetch("/api/visualstrike", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hooks", product: { name: productName } }),
      });
      const d = await r.json();
      setHooks(Array.isArray(d.hooks) ? d.hooks : []);
      setCount(d.count || 0); setFamilies(d.families || 0);
    } finally { setBusy(false); }
  }

  // Top non-deceptive hooks, highest score first, a spread across families.
  const top = (hooks || []).filter((h) => !h.deceptive).slice(0, 18);

  return (
    <div className="mb-8 card border-emerald-500/20 p-5">
      <div className="mb-1 flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">Hook Lab — generate &amp; publish a hook</h2></div>
      <p className="mb-3 text-xs text-slate-400">Generate the 130-hook library (13 families × 10, each deception-checked), pick the strongest, and publish it straight to your channels.</p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label className="label">Product</label>
          <input className="input" placeholder={activeBrand?.name ? `${activeBrand.name} — e.g. Family platter` : "e.g. AuraGlow Serum"} value={product} onChange={(e) => setProduct(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={generate} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate hooks</button>
      </div>

      {hooks && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{count} hooks across {families} families — pick one to publish</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {top.map((h, i) => (
              <button key={i} type="button" onClick={() => setChosen(h.text)} className={`flex items-start gap-2 rounded-lg border p-2.5 text-left text-sm transition ${chosen === h.text ? "border-emerald-500/60 bg-emerald-500/[0.08] text-emerald-100" : "border-white/[0.07] bg-ink-900/50 text-slate-300 hover:border-emerald-500/30"}`}>
                <span className="mt-0.5 shrink-0">{chosen === h.text ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <span className="text-[10px] font-bold text-slate-600">{h.score}</span>}</span>
                <span><span className="text-[10px] uppercase tracking-wide text-slate-500">{h.family}</span><br />{h.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {chosen && <PublishToChannels defaultText={chosen} sourceLabel="hook" />}
    </div>
  );
}
