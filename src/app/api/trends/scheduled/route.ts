import { NextRequest, NextResponse } from "next/server";
import { listEnabled } from "@/backend/visibility-schedule";
import { deepCrawl } from "@/backend/deep-crawl";
import { watchTrends, saveWatch, listWatches, newSince } from "@/backend/trend-watch";
import { brandMarket } from "@/backend/brand-market";

// Weekly trend monitoring — the schedule the Trend Hijack card was waiting for.
//
// It reuses the AI-visibility schedule rather than asking customers to switch on
// a second thing: a brand that wants weekly visibility monitoring wants weekly
// trend monitoring, and two toggles for one intent is a way to have half of them
// switched off.
//
// SPENDS NO AI. A news search plus word overlap is not a provider call, so this
// costs no ACUs and runs for every scheduled brand without a wallet check.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A crawl plus three news searches per brand, several brands per run.
export const maxDuration = 300;
const RUN_BUDGET_MS = 270_000;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  // Vercel signs its cron calls; anything else must present the secret. Without
  // this the endpoint is a free crawl-and-search button for the whole internet.
  const isCron = req.nextUrl.searchParams.get("cron") === "1";
  const secret = process.env.CRON_SECRET || "";
  const auth = req.headers.get("authorization") || "";
  if (!isCron && !(secret && auth === `Bearer ${secret}`)) {
    return NextResponse.json({ error: "This endpoint is for the scheduler." }, { status: 401 });
  }

  const schedules = await listEnabled();
  const done: { brandId: string; signals: number; fresh: number; note: string }[] = [];
  const skipped: { brandId: string; why: string }[] = [];

  for (const s of schedules) {
    // Budget checked per brand: a partial sweep that reports which brands it
    // reached beats a 504 that reports nothing for any of them.
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      skipped.push({ brandId: s.brandId, why: "the run reached its time limit before this brand" });
      continue;
    }
    try {
      // The schedule already carries the domain and business name the customer
      // set up for visibility monitoring — no second place to keep them, and no
      // second thing to fill in.
      if (!s.domain) { skipped.push({ brandId: s.brandId, why: "no domain on the schedule — nothing to read subjects from" }); continue; }

      const crawl = await deepCrawl(s.domain, { maxPages: 3, budgetMs: 20_000 });
      // Searched in the brand's own region: a story breaking somewhere this
      // business does not sell is not an opportunity for it, however large.
      const result = await watchTrends({
        brandId: s.brandId, business: s.business, extraction: crawl.extraction,
        market: await brandMarket(s.brandId),
      });
      const previous = (await listWatches(s.brandId, 1))[0] ?? null;
      const fresh = newSince(result, previous);
      await saveWatch(result);
      done.push({ brandId: s.brandId, signals: result.findings.length, fresh: fresh.length, note: result.note });
    } catch (e) {
      skipped.push({ brandId: s.brandId, why: e instanceof Error ? e.message : "unknown error" });
    }
  }

  return NextResponse.json({
    ran: done.length, skipped: skipped.length, done, skippedDetail: skipped,
    note: [
      `Checked ${done.length} brand(s).`,
      skipped.length ? `${skipped.length} skipped, each with a reason — none silently.` : "",
      "Only signals that are NEW since the previous run count as fresh: a digest that re-sends last week's headlines teaches people to ignore it.",
      "This costs no ACUs — a news search and word overlap are not provider calls.",
    ].filter(Boolean).join(" "),
  });
}
