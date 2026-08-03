"use client";

// Live Google data panel — drops into the SEO/Local modules to show REAL data
// (Search Console rankings, or Business Profile listing + reviews) when a Google
// credential is connected, and an honest "connect" prompt otherwise. Additive:
// it sits alongside the module's existing analysis, never replacing it.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search, Star, MapPin, ArrowRight, RefreshCcw, HelpCircle } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type SCRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
type MarketFit = {
  total: number; primary: number; secondary: number; outside: number; unknown: number;
  inMarketPct: number;
  topOutside: { code: string; name: string; value: number; pct: number }[];
  headline: string; note: string;
};
type SCResp = { connected: boolean; sites: { siteUrl: string }[]; siteUrl?: string; report?: { mode: string; rows: SCRow[]; totals?: { clicks: number; impressions: number; avgPosition: number }; note: string } | null; note?: string; geo?: { fit: MarketFit } | null; marketDefined?: boolean };
type GBPResp = { connected: boolean; locations?: { name: string; title: string; address?: string; website?: string }[]; locationName?: string; reviews?: { averageRating: number; totalReviewCount: number; recent: { rating: number; comment: string; reviewer: string }[] } | null; note?: string };

export default function GoogleInsightsPanel({ kind }: { kind: "search-console" | "business-profile" }) {
  const { activeBrand } = useActiveBrand();
  const [busy, setBusy] = useState(false);
  const [sc, setSc] = useState<SCResp | null>(null);
  const [gbp, setGbp] = useState<GBPResp | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // override lets the user pick which property/location maps to this brand; the
  // server persists the choice so it sticks next time.
  const load = useCallback(async (override?: { siteUrl?: string; locationName?: string }) => {
    if (!activeBrand) return;
    setBusy(true);
    try {
      const r = await authedFetch("/api/seo-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: kind, brandId: activeBrand.id, website: (activeBrand as { website?: string }).website, ...override }) });
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
        <button onClick={() => load()} disabled={busy} className="text-slate-400 hover:text-white" title="Refresh">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}</button>
      </div>

      {!connected ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-slate-300">Connect Google to replace the estimates below with your <span className="font-semibold text-white">real measured data</span>.</p>
          <p className="mt-1 text-[12px] text-slate-500">{kind === "search-console" ? "Search Console gives your true clicks, impressions, CTR and average position." : "Business Profile gives your real listing, rating and reviews."} {(kind === "search-console" ? sc?.note : gbp?.note) || ""}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href="/dashboard/go-live" className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-400">Go-Live status <ArrowRight className="h-3.5 w-3.5" /></Link>
            <button onClick={() => setShowHelp((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white"><HelpCircle className="h-3.5 w-3.5" /> How to connect Google</button>
          </div>
          {showHelp && <ConnectGoogleSteps kind={kind} />}
        </div>
      ) : kind === "search-console" ? (
        <div>
          {sc && sc.sites.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">This brand&apos;s property</label>
              <select value={sc.siteUrl || ""} onChange={(e) => load({ siteUrl: e.target.value })} className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-xs text-white outline-none focus:border-sky-500/60">
                {sc.sites.map((s) => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>)}
              </select>
            </div>
          )}
          {/* WHERE THE IMPRESSIONS CAME FROM — above the totals, because the
              totals are the number that misleads. A count that rose because a
              country you do not sell to found you is not a result, and putting
              the split underneath would let someone read the headline and
              stop. */}
          {sc?.geo?.fit && (
            <div className={`mb-3 rounded-lg border p-3 ${sc.geo.fit.outside > sc.geo.fit.total * 0.3 ? "border-amber-500/30 bg-amber-500/[0.05]" : "border-white/[0.07] bg-ink-900/50"}`}>
              <p className="text-xs font-semibold leading-relaxed text-white">{sc.geo.fit.headline}</p>
              {sc.marketDefined && sc.geo.fit.total > 0 && (
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-ink-800">
                  {/* Primary, secondary, outside, unknown — a 2px surface gap
                      between fills so the segments read as separate. */}
                  <div style={{ width: `${(sc.geo.fit.primary / sc.geo.fit.total) * 100}%` }} className="bg-emerald-400" title={`Main market: ${sc.geo.fit.primary.toLocaleString()}`} />
                  <div style={{ width: `${(sc.geo.fit.secondary / sc.geo.fit.total) * 100}%` }} className="border-l-2 border-ink-950 bg-sky-400" title={`Secondary: ${sc.geo.fit.secondary.toLocaleString()}`} />
                  <div style={{ width: `${(sc.geo.fit.outside / sc.geo.fit.total) * 100}%` }} className="border-l-2 border-ink-950 bg-slate-600" title={`Outside your market: ${sc.geo.fit.outside.toLocaleString()}`} />
                  <div style={{ width: `${(sc.geo.fit.unknown / sc.geo.fit.total) * 100}%` }} className="border-l-2 border-ink-950 bg-slate-700" title={`Country unknown: ${sc.geo.fit.unknown.toLocaleString()}`} />
                </div>
              )}
              {sc.geo.fit.topOutside.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sc.geo.fit.topOutside.slice(0, 5).map((o) => (
                    <span key={o.code} className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-300">
                      {o.name} {o.pct}%
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{sc.geo.fit.note}</p>
            </div>
          )}

          {sc?.report?.totals && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-ink-900/60 p-2.5 text-center"><p className="font-display text-lg font-bold text-white">{sc.report.totals.clicks.toLocaleString()}</p><p className="text-[10px] uppercase text-slate-500">clicks</p></div>
              <div className="rounded-lg bg-ink-900/60 p-2.5 text-center"><p className="font-display text-lg font-bold text-white">{sc.report.totals.impressions.toLocaleString()}</p><p className="text-[10px] uppercase text-slate-500">impressions{sc.geo?.fit && sc.marketDefined ? " (all countries)" : ""}</p></div>
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
          {gbp && (gbp.locations?.length ?? 0) > 1 && (
            <div className="mb-3 flex items-center gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">This brand&apos;s location</label>
              <select value={gbp.locationName || ""} onChange={(e) => load({ locationName: e.target.value })} className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-xs text-white outline-none focus:border-sky-500/60">
                {(gbp.locations || []).map((l) => <option key={l.name} value={l.name}>{l.title}</option>)}
              </select>
            </div>
          )}
          {gbp?.locations?.[0] && <p className="mb-2 text-sm font-semibold text-white">{(gbp.locations.find((l) => l.name === gbp.locationName) || gbp.locations[0]).title} <span className="text-xs font-normal text-slate-500">{(gbp.locations.find((l) => l.name === gbp.locationName) || gbp.locations[0]).address}</span></p>}
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

// In-app "Connect Google" guide — the exact one-time setup steps, so the user
// never has to leave the app to wire real Google data.
function ConnectGoogleSteps({ kind }: { kind: "search-console" | "business-profile" }) {
  const scSteps = [
    "Google Cloud Console → APIs & Services → enable “Google Search Console API”.",
    "Credentials → Create credentials → Service account → create it → Keys → Add key → JSON → download.",
    "Open the JSON, copy the client_email (…@…iam.gserviceaccount.com).",
    "In Search Console → your property → Settings → Users and permissions → Add user → paste that email → role Full.",
    "In Vercel → Environment Variables, set GOOGLE_SERVICE_ACCOUNT_JSON to the whole JSON file contents. Redeploy.",
    "Come back here and press refresh — pick which property is this brand from the dropdown.",
  ];
  const gbpSteps = [
    "Google Cloud Console → enable “Google Business Profile API” (request access if prompted — Google approval can take a few days).",
    "Credentials → Create OAuth client ID → Web application → add redirect URI https://developers.google.com/oauthplayground (leave JavaScript origins empty).",
    "OAuth Playground (developers.google.com/oauthplayground) → gear → “Use your own OAuth credentials” → paste your client ID + secret.",
    "Scopes box: paste https://www.googleapis.com/auth/business.manage → Authorize → sign in with the account that owns the profile.",
    "Click “Exchange authorization code for tokens” → copy the refresh_token (starts 1//).",
    "In Vercel set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN. Redeploy, then refresh here.",
  ];
  const steps = kind === "search-console" ? scSteps : gbpSteps;
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-ink-950/50 p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-sky-300">{kind === "search-console" ? "Connect Search Console (rankings) — one-time" : "Connect Business Profile (local) — one-time"}</p>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-slate-300"><span className="font-bold text-sky-400">{i + 1}.</span> {s}</li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-slate-500">One platform credential covers every brand — each brand is mapped to its own property/location here. You (or your agency) set this once.</p>
    </div>
  );
}
