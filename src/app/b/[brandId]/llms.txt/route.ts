import { NextResponse } from "next/server";
import { getBrandById } from "@/backend/brand-store";
import { listPages } from "@/backend/landing-store";
import { hostedLlmsTxt } from "@/backend/hosted-schema";
import { siteOrigin } from "@/shared/site";

// THE BRAND'S OWN llms.txt, SERVED — not generated for them to paste.
//
// `/llms.txt` at the root describes MarketWar. This describes the CUSTOMER, at
// `/b/{brandId}/llms.txt`, next to the pages it lists. The product has always
// generated this file for customers to publish on their own domain; for the
// pages MarketWar hosts, nobody was publishing anything, so a brand's hosted
// pages had no machine-readable statement of whose they were or what they offer.
//
// IT IS PUBLIC ON PURPOSE AND CARRIES NOTHING PRIVATE. Every fact in it is
// already on the live pages it points at — the brand name, what it sells, where,
// and the current offer. It lists only pages with `live: true`, so a draft is
// never exposed by the file that exists to get pages found.

export const runtime = "nodejs";
// An hour. Long enough that a crawler sweep costs almost nothing, short enough
// that publishing a page shows up the same morning.
export const revalidate = 3600;

type Params = { brandId: string };

export async function GET(_req: Request, { params }: { params: Promise<Params> }) {
  const { brandId } = await params;
  const id = (brandId || "").trim();
  if (!id) return new NextResponse("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

  const base = siteOrigin();
  // NEITHER FAILURE IS FATAL, AND THEY ARE DIFFERENT. With no brand the file
  // still lists the pages, because a crawler that can see the pages is better
  // than a 500. With no pages it still describes the brand and says plainly that
  // nothing is published — see `hostedLlmsTxt`.
  const [brand, pages] = await Promise.all([
    getBrandById(id).catch(() => null),
    listPages(id).catch(() => []),
  ]);

  // Nothing at all to say: a brand that does not exist must not get a page that
  // implies it does.
  if (!brand && !pages.some((p) => p.live)) {
    return new NextResponse("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const body = hostedLlmsTxt({
    brand,
    pages,
    brandUrl: `${base}/b/${encodeURIComponent(id)}`,
    base,
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      // text/plain, which is what the llms.txt convention asks for and what a
      // crawler expecting markdown-in-text will accept.
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
      // Say it is fine to use. A file written for assistants that does not say so
      // leaves the question to a default nobody controls.
      "x-robots-tag": "all",
    },
  });
}
