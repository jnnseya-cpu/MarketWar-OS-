import { NextResponse } from "next/server";

// Apollo self-diagnostic — is licensed B2B email data live? Reports whether
// APOLLO_API_KEY is present and validates it with one tiny read-only org search,
// returning GREEN, or the exact error. Powers Customer Vault "Find emails" +
// LeadWar Room prospecting. SAFE: one search; never returns the key.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Trim: pasting the key into Vercel commonly leaves a trailing newline/space,
  // which makes the X-Api-Key header invalid and Apollo returns 401 for a key
  // that is actually correct. Trimming removes that whole class of false reject.
  const key = (process.env.APOLLO_API_KEY || "").trim();
  const present = { APOLLO_API_KEY: Boolean(key) };
  let probe: Record<string, unknown> = { ran: false, note: "No APOLLO_API_KEY — email-finding falls back to the free website scraper (low yield). Set it for verified business emails." };
  if (key) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": key },
        body: JSON.stringify({ q_organization_name: "google", page: 1, per_page: 1 }),
      });
      clearTimeout(t);
      if (res.ok) {
        const d = (await res.json().catch(() => ({}))) as { organizations?: unknown[]; pagination?: { total_entries?: number } };
        probe = { ran: true, ok: true, note: "Apollo key valid — verified business emails will power Find emails + prospecting.", sample: Array.isArray(d.organizations) ? d.organizations.length : 0 };
      } else {
        const body = (await res.text().catch(() => "")).slice(0, 200);
        const fix = res.status === 401
          ? "401 = key not accepted. Almost always a stray newline/space on the value in Vercel — delete APOLLO_API_KEY, re-paste with no trailing whitespace, redeploy. If it persists, regenerate the key at apollo.io → Settings → Integrations → API."
          : res.status === 403
          ? "403 = the key is valid but your Apollo PLAN doesn't include API access to this endpoint (the search/enrichment API needs a paid Apollo plan with the API add-on enabled). Confirm API access on your Apollo billing page."
          : res.status === 422
          ? "422 = Apollo understood the key but rejected the request shape — usually a temporary Apollo API change; the key itself is fine."
          : "Apollo returned an error — see the status/body above.";
        probe = { ran: true, ok: false, httpStatus: res.status, error: body, fix };
      }
    } catch (e) { probe = { ran: true, ok: false, error: (e as Error).message, fix: "Server couldn't reach api.apollo.io — a network/egress issue on the host." }; }
  }
  const probeStatus = (probe as { httpStatus?: number }).httpStatus;
  const verdict = !key ? "AMBER — no Apollo key; Find emails uses the scraper (add ScraperAPI to boost it)."
    : (probe as { ok?: boolean }).ok ? "GREEN — Apollo verified-email data is live."
    // 403 = the key is valid, the Apollo PLAN just lacks API access. This is an
    // OPTIONAL upsell, not a fault — Find emails still works via the scraper — so
    // it's AMBER (optional), never a scary RED that reads as "broken".
    : probeStatus === 403 ? "AMBER — Apollo plan has no API access (optional upsell). Find emails runs on the scraper; add SCRAPER_API_URL to boost yield. No paid Apollo plan required."
    : "RED — Apollo key present but rejected (see fix).";
  return NextResponse.json({ service: "apollo", verdict, present, probe });
}
