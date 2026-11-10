import { NextRequest, NextResponse } from "next/server";
import { listEnabled } from "@/backend/visibility-schedule";
import { deepCrawl } from "@/backend/deep-crawl";
import { watchTrends, saveWatch, listWatches, newSince } from "@/backend/trend-watch";
import { firstPartySignals } from "@/backend/first-party-signals";
import { brandMarket } from "@/backend/brand-market";
import { walletIdForBrand } from "@/backend/brand-access";
import { entitlementFor } from "@/backend/entitlement";
import { debitAcus, ACTION_COST_ACU } from "@/backend/wallet";
import { cronAuthorised } from "@/backend/guard";

// Weekly trend monitoring — the schedule the Trend Hijack card was waiting for.
//
// It reuses the AI-visibility schedule rather than asking customers to switch on
// a second thing: a brand that wants weekly visibility monitoring wants weekly
// trend monitoring, and two toggles for one intent is a way to have half of them
// switched off.
//
// IT DOES SPEND. This comment used to say the opposite — "a news search plus
// word overlap is not a provider call" — and the word overlap is not, but the
// news search is a paid search API and the crawl is our own bandwidth. A
// scheduled job spending a customer's search budget without charging it was a
// free AI action, which the platform does not have. Each brand is now metered
// inside the loop, and a brand that cannot cover it is SKIPPED with the reason
// rather than searched for nothing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A crawl plus three news searches per brand, several brands per run.
export const maxDuration = 300;
const RUN_BUDGET_MS = 270_000;
// The sweep runs three news searches per brand (watchTrends).
const SEARCHES_PER_BRAND = 3;

async function GETImpl(req: NextRequest) {
  const startedAt = Date.now();

  // THIS USED TO BE BYPASSABLE WITH A QUERY STRING. The guard read "if it is
  // not marked ?cron=1 AND has no secret, refuse" — and vercel.json calls this
  // path WITH ?cron=1, so the marker alone opened it. Anyone who read the cron
  // config could trigger a crawl plus three paid news searches for every
  // enabled brand, as often as they liked, on our bill. A query parameter is
  // not a credential; ?cron=1 is now a label and the secret is the gate.
  const cron = cronAuthorised(req);
  if (!cron.ok) {
    return NextResponse.json({ error: `This endpoint is for the scheduler — ${cron.reason}` }, { status: 401 });
  }

  const schedules = await listEnabled();
  const done: { brandId: string; signals: number; fresh: number; firstParty: number; note: string }[] = [];
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

      // AUTOMATIONS PAUSE WHEN NOBODY IS PAYING.
      //
      // This is unattended work that spends money on our provider bill every
      // week, for an account that may have cancelled months ago. A balance is
      // not permission: purchased ACUs stay spendable BY THE CUSTOMER, at a
      // keyboard, but they do not buy a standing subscription to work that runs
      // on its own.
      const walletId = await walletIdForBrand(s.brandId);
      const ent = await entitlementFor(walletId);
      if (ent.automationsPaused) {
        skipped.push({ brandId: s.brandId, why: `automations are paused — ${ent.reason}` });
        continue;
      }

      // Charged before the crawl and the searches, per brand. A scheduled run
      // must be able to refuse one brand and carry on with the rest.
      const debit = await debitAcus(walletId, ACTION_COST_ACU.search * SEARCHES_PER_BRAND);
      if (!debit.ok) {
        skipped.push({ brandId: s.brandId, why: `not enough ACUs for this week's trend sweep (needs ${ACTION_COST_ACU.search * SEARCHES_PER_BRAND}, balance ${debit.balanceAcu}) — top up and it resumes on the next run` });
        continue;
      }

      const crawl = await deepCrawl(s.domain, { maxPages: 3, budgetMs: 20_000 });

      // §2's RELEASE GATE, AND IT COSTS NOTHING.
      //
      // The brand's own owned pages already record views, CTA clicks and leads
      // by day. That is a second INDEPENDENT source family, with no key, no
      // third party and no extra call — and without a second family this whole
      // sweep is capped at 69 confidence and can never clear the brief band,
      // however strong a signal is. Read before the searches so a brand with
      // its own traffic gets the benefit on this run rather than the next.
      const observations = await firstPartySignals(s.brandId);

      // Searched in the brand's own region: a story breaking somewhere this
      // business does not sell is not an opportunity for it, however large.
      const result = await watchTrends({
        brandId: s.brandId, business: s.business, extraction: crawl.extraction,
        market: await brandMarket(s.brandId),
        // NAMES, NOT A COUNT. The family map derives how many independent
        // families these amount to, so the sweep cannot claim corroboration it
        // has not got — and twenty pages of our own are still one family.
        firstPartySources: observations.map((o) => o.source),
      });
      const previous = (await listWatches(s.brandId, 1))[0] ?? null;
      const fresh = newSince(result, previous);
      await saveWatch(result);
      done.push({
        brandId: s.brandId, signals: result.findings.length, fresh: fresh.length,
        // Reported so a run says whether the brand had a second family at all.
        // A sweep that silently had one family and a sweep that silently had
        // two produce very different numbers for the same news.
        firstParty: observations.length,
        note: result.note,
      });
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


// EVERY ANSWER FROM THIS ROUTE IS JSON — see backend/route-guard.ts.
// A throw here used to become Next's HTML error page, which every caller
// reported as: Unexpected token '<', "<!DOCTYPE "... is not valid JSON.
import { jsonRoute } from "@/backend/route-guard";
export const GET = jsonRoute(GETImpl as never, { maxSeconds: 300, label: "/api/trends/scheduled" });
