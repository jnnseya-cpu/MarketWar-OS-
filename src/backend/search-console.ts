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

// ---------------------------------------------------------------------------
// GOOGLE'S OWN VERDICT, PER URL — the URL Inspection API.
// ---------------------------------------------------------------------------
//
// WHY THIS IS THE ONLY API THAT ANSWERS THE QUESTION. Search Console emails
// "Blocked by robots.txt" and names no URLs, and the Coverage report it refers
// to has never been exposed through any API — there is no endpoint that lists
// the affected pages. What Google DOES expose is this: ask about ONE url and it
// returns the index status it holds, including `robotsTxtState` (ALLOWED /
// DISALLOWED), `coverageState` in Google's own words, `indexingState`, and the
// canonical it chose versus the one we declared.
//
// So the platform asks about the pages it publishes rather than sending the
// owner to read a console. `backend/indexability.ts` finds the contradictions
// with no credential at all; this confirms them against Google.
//
// THE QUOTA IS REAL AND IT IS SMALL: 2,000 queries per property per day, 600 per
// minute. A caller must pass the URLs it cares about — this will not walk a
// sitemap on its own, because a 2,000-URL site would spend the day's quota in
// one call and the next question would get nothing.
//
// SCOPE: `webmasters.readonly` covers inspection, which is why nothing here asks
// for a wider grant than the rank data already uses.

const INSPECT_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

export type UrlVerdict = {
  url: string;
  /** Google's own words: "Submitted and indexed", "Blocked by robots.txt", … */
  coverageState: string;
  /** ALLOWED | DISALLOWED — the answer to the email. */
  robotsTxtState: string;
  indexingState: string;
  /** PASS | PARTIAL | FAIL | NEUTRAL. */
  verdict: string;
  googleCanonical: string;
  userCanonical: string;
  lastCrawlTime: string;
  /** TRUE when Google says our robots.txt is what is keeping this page out. */
  blockedByRobots: boolean;
};

export type InspectionReport = {
  mode: "live" | "not_connected";
  site?: string;
  results: UrlVerdict[];
  /** URLs that could not be inspected, with the reason. Never silently dropped. */
  failed: { url: string; reason: string }[];
  blocked: number;
  note: string;
};

/**
 * Ask Google what it thinks of these URLs.
 *
 * `siteUrl` must be the property exactly as Search Console holds it — including
 * the `sc-domain:` form for a domain property. `listSites()` returns them in
 * that form, which is why it exists.
 */
export async function inspectUrls(siteUrl: string, urls: readonly string[], opts?: { max?: number }): Promise<InspectionReport> {
  const wanted = [...new Set(urls.map((u) => String(u || "").trim()).filter(Boolean))].slice(0, Math.max(1, Math.min(50, opts?.max ?? 20)));
  if (!searchConsoleConfigured()) {
    return { mode: "not_connected", results: [], failed: [], blocked: 0,
      note: "Search Console is not connected, so Google's own verdict cannot be read. `auditIndexability` answers the same question from our own robots.txt and links, with no credential." };
  }
  const token = await getGoogleAccessToken(GOOGLE_SCOPES.searchConsole);
  if (!token) {
    return { mode: "not_connected", site: siteUrl, results: [], failed: [], blocked: 0,
      note: "Google token exchange failed — check the credential." };
  }

  const results: UrlVerdict[] = [];
  const failed: { url: string; reason: string }[] = [];
  for (const url of wanted) {
    try {
      const res = await fetch(INSPECT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionUrl: url, siteUrl }),
      });
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 140);
        // A FAILURE IS RECORDED, NOT DROPPED. A quota refusal looks exactly like
        // "this page is fine" to any caller that only reads `results`.
        failed.push({ url, reason: `HTTP ${res.status}${body ? ` — ${body}` : ""}` });
        continue;
      }
      const d = (await res.json().catch(() => ({}))) as {
        inspectionResult?: {
          indexStatusResult?: {
            verdict?: string; coverageState?: string; robotsTxtState?: string; indexingState?: string;
            googleCanonical?: string; userCanonical?: string; lastCrawlTime?: string;
          };
        };
      };
      const r = d.inspectionResult?.indexStatusResult || {};
      results.push({
        url,
        coverageState: r.coverageState || "",
        robotsTxtState: r.robotsTxtState || "",
        indexingState: r.indexingState || "",
        verdict: r.verdict || "",
        googleCanonical: r.googleCanonical || "",
        userCanonical: r.userCanonical || "",
        lastCrawlTime: r.lastCrawlTime || "",
        blockedByRobots: r.robotsTxtState === "DISALLOWED",
      });
    } catch (e) {
      failed.push({ url, reason: (e as Error).message });
    }
  }

  const blocked = results.filter((r) => r.blockedByRobots).length;
  return {
    mode: "live", site: siteUrl, results, failed, blocked,
    note: `${results.length} of ${wanted.length} URL(s) inspected`
      + (failed.length ? `, ${failed.length} could not be (${failed[0].reason})` : "")
      + `. ${blocked === 0 ? "Google reports none of them as blocked by robots.txt." : `Google reports ${blocked} as DISALLOWED by robots.txt — ${results.filter((r) => r.blockedByRobots).map((r) => r.url).slice(0, 5).join(", ")}.`}`,
  };
}
