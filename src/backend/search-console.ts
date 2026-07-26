// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Google Search Console client — REAL rank/keyword data (clicks, impressions,
// CTR, average position) for a verified property. This is what turns the SEO
// modules (OMNIRANK / Search Dominance / Organic) from deterministic estimates
// into measured truth. Read-only. Uses the shared Google token provider; returns
// an honest "not connected" shape when no credential is set — never fabricates.

import { getGoogleAccessToken, googleConfigured, GOOGLE_SCOPES } from "@/backend/google-auth";

const SC_BASE = "https://searchconsole.googleapis.com/webmasters/v3";

export function searchConsoleConfigured(): boolean { return googleConfigured(); }

export type SCSite = { siteUrl: string; permissionLevel: string };
export type SCRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
export type SCReport = {
  mode: "live" | "not_connected";
  site?: string;
  rows: SCRow[];
  totals?: { clicks: number; impressions: number; avgPosition: number };
  note: string;
};

// yyyy-mm-dd, N days ago (Search Console data lags ~2-3 days; caller picks range).
function ymd(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export async function listSites(): Promise<{ mode: "live" | "not_connected"; sites: SCSite[]; note: string }> {
  if (!searchConsoleConfigured()) return { mode: "not_connected", sites: [], note: "Search Console not connected — set a Google credential to pull real rankings." };
  const token = await getGoogleAccessToken(GOOGLE_SCOPES.searchConsole);
  if (!token) return { mode: "not_connected", sites: [], note: "Google credential present but token exchange failed — check the service-account/OAuth setup." };
  try {
    const res = await fetch(`${SC_BASE}/sites`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { mode: "not_connected", sites: [], note: `Search Console API error (HTTP ${res.status}).` };
    const d = (await res.json().catch(() => ({}))) as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> };
    return { mode: "live", sites: (d.siteEntry || []).map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel })), note: "Live Search Console properties." };
  } catch (e) { return { mode: "not_connected", sites: [], note: `Couldn't reach Search Console: ${(e as Error).message}` }; }
}

// Top rows for a property over the last `days`, grouped by `dimension`
// ("query" | "page" | "country" | "device" | "date").
export async function searchAnalytics(siteUrl: string, opts?: { days?: number; dimension?: string; rowLimit?: number }): Promise<SCReport> {
  if (!searchConsoleConfigured()) return { mode: "not_connected", rows: [], note: "Search Console not connected — connect a Google credential to see real rankings." };
  const token = await getGoogleAccessToken(GOOGLE_SCOPES.searchConsole);
  if (!token) return { mode: "not_connected", rows: [], note: "Google token exchange failed — check the credential." };
  const days = opts?.days ?? 28;
  const dimension = opts?.dimension ?? "query";
  try {
    const res = await fetch(`${SC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: ymd(days + 3), endDate: ymd(3), dimensions: [dimension], rowLimit: opts?.rowLimit ?? 25 }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 160);
      return { mode: "not_connected", site: siteUrl, rows: [], note: `Search Console API error (HTTP ${res.status}). ${body}` };
    }
    const d = (await res.json().catch(() => ({}))) as { rows?: SCRow[] };
    const rows = (d.rows || []).map((r) => ({ keys: r.keys, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
    const clicks = rows.reduce((s, r) => s + r.clicks, 0);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const avgPosition = rows.length ? rows.reduce((s, r) => s + r.position, 0) / rows.length : 0;
    return { mode: "live", site: siteUrl, rows, totals: { clicks, impressions, avgPosition: Math.round(avgPosition * 10) / 10 }, note: `Live Search Console data — last ${days} days, by ${dimension}.` };
  } catch (e) { return { mode: "not_connected", site: siteUrl, rows: [], note: `Couldn't reach Search Console: ${(e as Error).message}` }; }
}
