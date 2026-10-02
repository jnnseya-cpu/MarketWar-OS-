import { NextResponse } from "next/server";
import { listPages } from "@/backend/landing-store";
import { siteOrigin } from "@/shared/site";

// A SITEMAP PER BRAND, WHICH IS NOT THE SAME AS PUTTING THEM IN OURS.
//
// `app/robots.ts` makes a deliberate decision and it still stands: *"CUSTOMER-
// HOSTED PAGES ARE NOT LISTED HERE. /b/<brand>/<slug> belongs to the customer;
// those pages are indexable, but they are not ours to put in our sitemap."*
//
// That decision left a real problem though. A page nobody links to and no
// sitemap lists is a page a crawler has to stumble on. So the pages get a
// sitemap of their OWN, at the brand's own path, which the customer can submit
// to Search Console themselves and which their `/b/{brandId}/llms.txt` points
// at. Discovery becomes possible without MarketWar claiming their pages as its
// content.
//
// `lastmod` is the real `publishedAt`. Writing today's date on every entry is
// the oldest sitemap lie there is: it tells a crawler everything changed, every
// sweep, and a crawler that learns the dates are worthless stops reading them.

export const runtime = "nodejs";
export const revalidate = 3600;

type Params = { brandId: string };

const xmlSafe = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export async function GET(_req: Request, { params }: { params: Promise<Params> }) {
  const { brandId } = await params;
  const id = (brandId || "").trim();
  if (!id) return new NextResponse("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

  const base = siteOrigin();
  const pages = await listPages(id).catch(() => []);
  const live = pages.filter((p) => p.live);

  // A brand with nothing published gets a 404 rather than an empty sitemap. An
  // empty `<urlset>` is a valid file that says "this brand has no pages", which
  // is true but invites a crawler to keep asking; a 404 is the honest answer to
  // "where is this brand's sitemap" when there is not one yet.
  if (!live.length) {
    return new NextResponse("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const urls = live.map((p) => {
    const loc = `${base}/b/${encodeURIComponent(p.brandId)}/${encodeURIComponent(p.slug)}`;
    const lastmod = Number.isFinite(Date.parse(p.publishedAt || "")) ? new Date(p.publishedAt).toISOString() : null;
    return `  <url>\n    <loc>${xmlSafe(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
