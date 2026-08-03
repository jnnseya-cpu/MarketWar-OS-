import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey } from "@/backend/guard";
import { listSites, searchAnalytics, searchConsoleConfigured } from "@/backend/search-console";
import { listAccounts, listLocations, locationReviews, businessProfileConfigured } from "@/backend/business-profile";
import { getGoogleMapping, setGoogleMapping, matchSite } from "@/backend/google-mapping";
import { getBrandById } from "@/backend/brand-store";
import { marketFit, marketDefined, EMPTY_MARKET, type TargetMarket } from "@/shared/market";

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

  // The brand's own record is the authority on where it sells. In demo there is
  // no Admin SDK and the client holds the brand, so what it sent stands — safe
  // there precisely because there are no accounts to confuse.
  const stored = await getBrandById(brandId);
  const market: TargetMarket =
    stored?.targetMarket ??
    (typeof body.targetMarket === "object" && body.targetMarket ? (body.targetMarket as TargetMarket) : EMPTY_MARKET);

  if (action === "search-console") {
    if (!searchConsoleConfigured()) return NextResponse.json({ connected: false, note: "Search Console not connected — set a Google credential to see real rankings.", sites: [], report: null });
    const sitesRes = await listSites();
    const website = typeof body.website === "string" ? body.website : undefined;
    const mapping = await getGoogleMapping(brandId);
    // Property resolution for THIS brand: explicit pick → saved mapping →
    // auto-match the brand website → first available. Explicit picks persist.
    let siteUrl = typeof body.siteUrl === "string" && body.siteUrl.trim() ? body.siteUrl.trim() : "";
    if (siteUrl) await setGoogleMapping(brandId, { siteUrl });
    // NEVER fall back to "the first property in the account".
    //
    // That fallback is why a customer looking at their own brand saw
    // "This brand's property: sc-domain:marketwaros.com" — the PLATFORM's
    // Search Console property, with the platform's clicks, impressions and (on
    // the query dimension) the platform's actual search terms, presented as
    // theirs. It is wrong twice: the numbers are meaningless to them, and it
    // discloses one tenant's data to another. A property must be explicitly
    // chosen, previously saved for this brand, or matched to this brand's own
    // website by hostname — otherwise nothing is shown.
    else siteUrl = mapping?.siteUrl || matchSite(sitesRes.sites, website) || "";
    const days = Number(body.days) || 28;
    const report = siteUrl ? await searchAnalytics(siteUrl, { days, dimension: typeof body.dimension === "string" ? body.dimension : "query", rowLimit: 25 }) : null;

    // WHERE THE IMPRESSIONS CAME FROM, ALWAYS — not only when someone thinks to
    // switch the dimension to "country".
    //
    // A customer's impressions climb and the platform reports a win. Most of
    // them are from a country they do not sell to. The headline moved, the
    // business did not, and nothing on the screen could tell them apart because
    // impressions were impressions and nobody asked where they came from. That
    // is a metric pointing the opposite way to reality, and a customer who
    // trusts it keeps making the content that produced it.
    //
    // So the country split is fetched alongside whatever dimension was asked
    // for, and the real headline — in-market only — is computed from it.
    let geo: { fit: ReturnType<typeof marketFit>; rows: { country: string; impressions: number; clicks: number }[] } | null = null;
    if (siteUrl) {
      const byCountry = await searchAnalytics(siteUrl, { days, dimension: "country", rowLimit: 50 });
      const rows = (byCountry.rows || []).map((r) => ({
        // Search Console returns the dimension value in keys[0], and for the
        // country dimension that is lower-case ISO alpha-3 ("gbr", "pak").
        country: String(r.keys?.[0] ?? ""),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
      }));
      geo = {
        rows,
        fit: marketFit(rows.map((r) => ({ country: r.country, value: r.impressions, secondary: r.clicks })), market, "impressions"),
      };
    }

    return NextResponse.json({
      connected: sitesRes.mode === "live",
      sites: sitesRes.sites,
      siteUrl,
      report,
      geo,
      marketDefined: marketDefined(market),
      needsSelection: sitesRes.mode === "live" && !siteUrl,
      note: siteUrl
        ? sitesRes.note
        : website
          ? `No Search Console property matches ${website}. Rankings stay empty until this brand's own property is verified and picked — showing another site's numbers here would be meaningless and would expose data that is not yours.`
          : "Pick this brand's Search Console property to see its rankings. Nothing is shown until one is chosen.",
    });
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
    // Same rule as the Search Console property, for the same reason: auto-picking
    // the first location in the connected account shows one business's reviews
    // and ratings under another business's brand.
    else chosen = mapping?.gbpLocation || "";
    const reviews = chosen ? await locationReviews(chosen) : null;
    return NextResponse.json({
      connected: true, accounts: acc.accounts, locations: locRes.locations,
      locationName: chosen, reviews: reviews?.summary ?? null,
      needsSelection: !chosen,
      note: chosen ? locRes.note : "Pick this brand's Google Business location. Nothing is shown until one is chosen — another business's reviews are not this brand's data.",
    });
  }

  return NextResponse.json({ error: "Unknown action — use search-console or business-profile" }, { status: 400 });
}
