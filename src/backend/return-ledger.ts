// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The Return Ledger — what did the money actually buy?
//
// A customer on a paid plan can see that ACUs went down and that things were
// produced. What they cannot see is whether any of it was worth doing. That is
// the whole question behind "why would I keep paying for this", and until it is
// answered on screen, every other feature is a leap of faith.
//
// This joins the three things the platform already measures honestly:
//
//   SPENT     ACUs debited from the wallet          (real, to the penny)
//   PRODUCED  pages published, renders, sends       (real counts)
//   RETURNED  visitors and leads those produced     (real, from page analytics)
//
// and expresses the result in the customer's own money.
//
// The discipline that keeps it from becoming a vanity dashboard:
//
//   • Revenue is NEVER invented. It is computed from a deal value the customer
//     enters. With no figure entered, the ledger reports leads and stops — it
//     does not assume an industry average and quietly present it as fact.
//   • A lead is not revenue. Leads are multiplied by the customer's own
//     close rate, and if they have not given one, the ledger says the value
//     shown is the ceiling rather than the expectation.
//   • Nothing is attributed that was not measured. A page with no tracking
//     data contributes zero, not an estimate.
//   • A negative return is reported as plainly as a positive one. A ledger that
//     can only show good news is an advert, not an instrument.

import { ACTION_COST_ACU } from "@/backend/wallet";

// 1 ACU = 1 penny. Stated here because every figure below depends on it.
const ACU_PER_GBP = 100;

export type LedgerInput = {
  brandId: string;
  spentAcu: number;               // ACUs debited over the period
  pages: { slug: string; headline?: string; views: number; leads: number }[];
  // The customer's own numbers. Absent → the ledger reports leads only.
  averageDealGbp?: number;
  closeRatePct?: number;          // 0-100
  periodLabel?: string;
};

export type LedgerLine = {
  slug: string;
  headline: string;
  views: number;
  leads: number;
  valueGbp?: number;
  note: string;
};

export type ReturnLedger = {
  periodLabel: string;
  spentGbp: number;
  spentAcu: number;
  totalViews: number;
  totalLeads: number;
  costPerLeadGbp?: number;
  estimatedValueGbp?: number;
  netGbp?: number;
  roiPct?: number;
  lines: LedgerLine[];
  verdict: "no_data" | "leads_only" | "profitable" | "unprofitable";
  headline: string;
  caveats: string[];
  whatWouldMakeThisAccurate: string[];
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export function buildReturnLedger(input: LedgerInput): ReturnLedger {
  const spentAcu = Math.max(0, Math.round(input.spentAcu || 0));
  const spentGbp = round2(spentAcu / ACU_PER_GBP);
  const pages = input.pages || [];
  const totalViews = pages.reduce((s, p) => s + (p.views || 0), 0);
  const totalLeads = pages.reduce((s, p) => s + (p.leads || 0), 0);
  const periodLabel = input.periodLabel || "so far";

  const caveats: string[] = [];
  const missing: string[] = [];

  const deal = Number(input.averageDealGbp);
  const hasDeal = Number.isFinite(deal) && deal > 0;
  const close = Number(input.closeRatePct);
  const hasClose = Number.isFinite(close) && close > 0 && close <= 100;

  if (!hasDeal) missing.push("What one customer is worth to you (average deal value). Without it nothing here can be shown in pounds.");
  if (!hasClose) missing.push("What share of leads you close. Without it, the value below assumes every lead becomes a customer — which is a ceiling, not a forecast.");

  const closeFraction = hasClose ? close / 100 : 1;

  const lines: LedgerLine[] = pages
    .map((p) => {
      const views = p.views || 0;
      const leads = p.leads || 0;
      const valueGbp = hasDeal ? round2(leads * deal * closeFraction) : undefined;
      return {
        slug: p.slug,
        headline: p.headline || p.slug,
        views,
        leads,
        valueGbp,
        note:
          views === 0
            ? "No visitors yet — nothing to judge."
            : leads === 0
              ? `${views} visitor${views === 1 ? "" : "s"}, no leads. The traffic is arriving; the page is not converting it.`
              : `${leads} lead${leads === 1 ? "" : "s"} from ${views} visitor${views === 1 ? "" : "s"}.`,
      };
    })
    .sort((a, b) => b.leads - a.leads || b.views - a.views);

  // No measured traffic at all — say so rather than showing a confident zero.
  if (totalViews === 0) {
    return {
      periodLabel, spentGbp, spentAcu, totalViews, totalLeads,
      lines, verdict: "no_data",
      headline:
        spentAcu > 0
          ? `£${spentGbp.toFixed(2)} spent ${periodLabel}, and nothing published has been visited yet. Share a page link — the moment traffic arrives this fills in.`
          : "Nothing spent and nothing measured yet.",
      caveats: ["No visitors have been recorded, so there is nothing to attribute. This is not a zero return — it is no data."],
      whatWouldMakeThisAccurate: missing,
    };
  }

  const costPerLeadGbp = totalLeads > 0 ? round2(spentGbp / totalLeads) : undefined;

  if (!hasDeal) {
    return {
      periodLabel, spentGbp, spentAcu, totalViews, totalLeads, costPerLeadGbp,
      lines, verdict: "leads_only",
      headline:
        totalLeads > 0
          ? `£${spentGbp.toFixed(2)} spent ${periodLabel} produced ${totalLeads} lead${totalLeads === 1 ? "" : "s"} from ${totalViews.toLocaleString()} visitor${totalViews === 1 ? "" : "s"} — £${costPerLeadGbp!.toFixed(2)} per lead.`
          : `£${spentGbp.toFixed(2)} spent ${periodLabel} brought ${totalViews.toLocaleString()} visitor${totalViews === 1 ? "" : "s"} but no leads yet.`,
      caveats: ["Shown in leads, not pounds, because no deal value has been entered. Nothing here is estimated on your behalf."],
      whatWouldMakeThisAccurate: missing,
    };
  }

  const estimatedValueGbp = round2(totalLeads * deal * closeFraction);
  const netGbp = round2(estimatedValueGbp - spentGbp);
  const roiPct = spentGbp > 0 ? Math.round((netGbp / spentGbp) * 100) : 0;
  const profitable = netGbp > 0;

  if (!hasClose) {
    caveats.push("No close rate entered, so this assumes every lead becomes a customer. Treat the value as a ceiling — enter your real close rate to see the expected figure.");
  }
  if (totalLeads > 0 && totalLeads < 10) {
    caveats.push(`Based on ${totalLeads} lead${totalLeads === 1 ? "" : "s"}. That is too few to be a reliable rate — the direction is real, the precision is not.`);
  }

  return {
    periodLabel, spentGbp, spentAcu, totalViews, totalLeads, costPerLeadGbp,
    estimatedValueGbp, netGbp, roiPct,
    lines,
    verdict: profitable ? "profitable" : "unprofitable",
    headline: profitable
      ? `£${spentGbp.toFixed(2)} spent ${periodLabel} produced ${totalLeads} lead${totalLeads === 1 ? "" : "s"} worth about £${estimatedValueGbp.toFixed(2)} — £${netGbp.toFixed(2)} ahead (${roiPct}%).`
      : `£${spentGbp.toFixed(2)} spent ${periodLabel} produced ${totalLeads} lead${totalLeads === 1 ? "" : "s"} worth about £${estimatedValueGbp.toFixed(2)} — £${Math.abs(netGbp).toFixed(2)} behind. ${totalLeads === 0 ? "Traffic is arriving but not converting: fix the page before spending more." : "Either the pages need to convert better, or each lead needs to be worth more."}`,
    caveats,
    whatWouldMakeThisAccurate: missing,
  };
}

// What a single action costs, in the customer's money — so a price can be shown
// next to a button rather than only in a billing page.
export function priceOfAction(kind: keyof typeof ACTION_COST_ACU): { acu: number; gbp: number } {
  const acu = ACTION_COST_ACU[kind];
  return { acu, gbp: round2(acu / ACU_PER_GBP) };
}

// How many leads a spend must produce to break even. The single most useful
// number for deciding whether to keep going.
export function breakEvenLeads(spentAcu: number, averageDealGbp: number, closeRatePct = 100): number | null {
  const value = averageDealGbp * (closeRatePct / 100);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.ceil((spentAcu / ACU_PER_GBP) / value);
}
