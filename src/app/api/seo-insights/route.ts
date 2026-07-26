import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";
import { listSites, searchAnalytics, searchConsoleConfigured } from "@/backend/search-console";
import { listAccounts, listLocations, locationReviews, businessProfileConfigured } from "@/backend/business-profile";
import { getGoogleMapping, setGoogleMapping, matchSite } from "@/backend/google-mapping";

// Real SEO/local data for the SEO + Local modules.
//   POST { action:"search-console", brandId, siteUrl?, dimension?, days? }
//     → verified properties + real rank rows (clicks/impressions/CTR/position).
//   POST { action:"business-profile", brandId }
//     → accounts → locations → the first location's review summary.
// Ownership enforced. Honest "not connected" when no Google credential is set.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "seo-insights"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (action === "search-console") {
    if (!searchConsoleConfigured()) return NextResponse.json({ connected: false, note: "Search Console not connected — set a Google credential to see real rankings.", sites: [], report: null });
    const sitesRes = await listSites();
    const website = typeof body.website === "string" ? body.website : undefined;
    const mapping = await getGoogleMapping(brandId);
    // Property resolution for THIS brand: explicit pick → saved mapping →
    // auto-match the brand website → first available. Explicit picks persist.
    let siteUrl = typeof body.siteUrl === "string" && body.siteUrl.trim() ? body.siteUrl.trim() : "";
    if (siteUrl) await setGoogleMapping(brandId, { siteUrl });
    else siteUrl = mapping?.siteUrl || matchSite(sitesRes.sites, website) || (sitesRes.sites[0]?.siteUrl ?? "");
    const report = siteUrl ? await searchAnalytics(siteUrl, { days: Number(body.days) || 28, dimension: typeof body.dimension === "string" ? body.dimension : "query", rowLimit: 25 }) : null;
    return NextResponse.json({ connected: sitesRes.mode === "live", sites: sitesRes.sites, siteUrl, report, note: sitesRes.note });
  }

  if (action === "business-profile") {
    if (!businessProfileConfigured()) return NextResponse.json({ connected: false, note: "Business Profile not connected — set a Google OAuth credential.", accounts: [], locations: [] });
    const acc = await listAccounts();
    if (acc.mode !== "live" || !acc.accounts.length) return NextResponse.json({ connected: false, accounts: [], locations: [], note: acc.note });
    const locRes = await listLocations(acc.accounts[0].name);
    const mapping = await getGoogleMapping(brandId);
    // Location resolution for THIS brand: explicit pick → saved mapping → first.
    let chosen = typeof body.locationName === "string" && body.locationName.trim() ? body.locationName.trim() : "";
    if (chosen) await setGoogleMapping(brandId, { gbpLocation: chosen });
    else chosen = mapping?.gbpLocation || locRes.locations[0]?.name || "";
    const reviews = chosen ? await locationReviews(chosen) : null;
    return NextResponse.json({ connected: true, accounts: acc.accounts, locations: locRes.locations, locationName: chosen, reviews: reviews?.summary ?? null, note: locRes.note });
  }

  return NextResponse.json({ error: "Unknown action — use search-console or business-profile" }, { status: 400 });
}
