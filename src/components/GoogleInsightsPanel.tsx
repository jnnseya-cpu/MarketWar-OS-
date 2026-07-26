"use client";

// Live Google data panel — drops into the SEO/Local modules to show REAL data
// (Search Console rankings, or Business Profile listing + reviews) when a Google
// credential is connected, and an honest "connect" prompt otherwise. Additive:
// it sits alongside the module's existing analysis, never replacing it.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search, Star, MapPin, ArrowRight, RefreshCcw } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type SCRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
type SCResp = { connected: boolean; sites: { siteUrl: string }[]; siteUrl?: string; report?: { mode: string; rows: SCRow[]; totals?: { clicks: number; impressions: number; avgPosition: number }; note: string } | null; note?: string };
type GBPResp = { connected: boolean; locations?: { title: string; address?: string; website?: string }[]; reviews?: { averageRating: number; totalReviewCount: number; recent: { rating: number; comment: string; reviewer: string }[] } | null; note?: string };

export default function GoogleInsightsPanel({ kind }: { kind: "search-console" | "business-profile" }) {
  const { activeBrand } = useActiveBrand();
  const [busy, setBusy] = useState(false);
  const [sc, setSc] = useState<SCResp | null>(null);
  const [gbp, setGbp] = useState<GBPResp | null>(null);

  const load = useCallback(async () => {
    if (!activeBrand) return;
    setBusy(true);
    try {
      const r = await authedFetch("/api/seo-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: kind, brandId: activeBrand.id }) });
      const d = await r.json();
      if (kind === "search-console") setSc(d); else setGbp(d);
    } catch { /* keep prior */ } finally { setBusy(false); }
  }, [activeBrand, kind]);

  useEffect(() => { load(); }, [load]);

  const connected = kind === "search-console" ? sc?.connected : gbp?.connected;
  const title = kind === "search-console" ? "Live rankings — Google Search Console" : "Live listing — Google Business Profile";
  const Icon = kind === "search-console" ? Search : MapPin;

  return (
    <div className="mb-6 card border-sky-500/25 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-sky-400" /><h3 className="font-display font-bold text-white">{title}</h3>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${connected ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{busy ? "…" : connected ? "live" : "not connected"}</span>
        </div>
        <button onClick={load} disabled={busy} className="text-slate-400 hover:text-white" title="Refresh">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}</button>
      </div>

      {!connected ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-slate-300">Connect Google to replace the estimates below with your <span className="font-semibold text-white">real measured data</span>.</p>
          <p className="mt-1 text-[12px] text-slate-500">{kind === "search-console" ? "Search Console gives your true clicks, impressions, CTR and average position." : "Business Profile gives your real listing, rating and reviews."} {(kind === "search-console" ? sc?.note : gbp?.note) || ""}</p>
          <Link href="/dashboard/go-live" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-400">Connect Google <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      ) : kind === "search-console" ? (
        <div>
          {sc?.report?.totals && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-ink-900/60 p-2.5 text-center"><p className="font-display text-lg font-bold text-white">{sc.report.totals.clicks.toLocaleString()}</p><p className="text-[10px] uppercase text-slate-500">clicks</p></div>
              <div className="rounded-lg bg-ink-900/60 p-2.5 text-center"><p className="font-display text-lg font-bold text-white">{sc.report.totals.impressions.toLocaleString()}</p><p className="text-[10px] uppercase text-slate-500">impressions</p></div>
              <div className="rounded-lg bg-ink-900/60 p-2.5 text-center"><p className="font-display text-lg font-bold text-emerald-300">{sc.report.totals.avgPosition}</p><p className="text-[10px] uppercase text-slate-500">avg position</p></div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead><tr className="border-b border-ink-700 text-[10px] uppercase tracking-wider text-slate-500"><th className="py-2 pr-3 font-semibold">Query</th><th className="py-2 px-2 text-right font-semibold">Clicks</th><th className="py-2 px-2 text-right font-semibold">Impr.</th><th className="py-2 pl-2 text-right font-semibold">Pos.</th></tr></thead>
              <tbody>
                {(sc?.report?.rows || []).slice(0, 15).map((r, i) => (
                  <tr key={i} className="border-b border-ink-800 last:border-0">
                    <td className="py-1.5 pr-3 text-slate-200">{r.keys[0]}</td>
                    <td className="py-1.5 px-2 text-right text-slate-300">{r.clicks}</td>
                    <td className="py-1.5 px-2 text-right text-slate-400">{r.impressions}</td>
                    <td className="py-1.5 pl-2 text-right font-semibold text-emerald-300">{r.position.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!sc?.report?.rows?.length && <p className="text-xs text-slate-500">Connected, but no rows for this range yet.</p>}
        </div>
      ) : (
        <div>
          {gbp?.locations?.[0] && <p className="mb-2 text-sm font-semibold text-white">{gbp.locations[0].title} <span className="text-xs font-normal text-slate-500">{gbp.locations[0].address}</span></p>}
          {gbp?.reviews && (
            <div className="mb-3 flex items-center gap-3">
              <span className="inline-flex items-center gap-1 font-display text-lg font-bold text-amber-300"><Star className="h-4 w-4 fill-amber-300" /> {gbp.reviews.averageRating.toFixed(1)}</span>
              <span className="text-xs text-slate-400">{gbp.reviews.totalReviewCount} reviews</span>
            </div>
          )}
          <div className="space-y-2">
            {(gbp?.reviews?.recent || []).map((rv, i) => (
              <div key={i} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-2.5">
                <p className="text-xs font-semibold text-amber-300">{"★".repeat(rv.rating)}<span className="text-slate-700">{"★".repeat(5 - rv.rating)}</span> <span className="text-slate-400">{rv.reviewer}</span></p>
                {rv.comment && <p className="mt-1 text-xs text-slate-400">{rv.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
