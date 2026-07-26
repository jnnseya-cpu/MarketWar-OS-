import { NextResponse } from "next/server";

// Apollo self-diagnostic — is licensed B2B email data live? Reports whether
// APOLLO_API_KEY is present and validates it with one tiny read-only org search,
// returning GREEN, or the exact error. Powers Customer Vault "Find emails" +
// LeadWar Room prospecting. SAFE: one search; never returns the key.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.APOLLO_API_KEY || "";
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
        const body = (await res.text().catch(() => "")).slice(0, 160);
        probe = { ran: true, ok: false, httpStatus: res.status, error: body, fix: res.status === 401 || res.status === 403 ? "Key rejected — check it's correct and active at apollo.io → Settings → API." : "Apollo returned an error — see the status/body above." };
      }
    } catch (e) { probe = { ran: true, ok: false, error: (e as Error).message, fix: "Server couldn't reach api.apollo.io — a network/egress issue on the host." }; }
  }
  const verdict = !key ? "AMBER — no Apollo key; email-finding uses the free scraper only (low yield)."
    : (probe as { ok?: boolean }).ok ? "GREEN — Apollo verified-email data is live."
    : "RED — Apollo key present but rejected (see fix).";
  return NextResponse.json({ service: "apollo", verdict, present, probe });
}
