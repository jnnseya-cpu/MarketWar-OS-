// WHICH CONVERSION TO REPORT, AND WHETHER TO REPORT ONE AT ALL.
//
// Pure, so the rules can be tested without a browser, a wallet or a Stripe
// account. The component that uses it (`components/ConversionReporter.tsx`) does
// the polling and the storage; every decision is here.
//
// THE RULE THE WHOLE FILE EXISTS FOR: a sale is reported because the WALLET says
// money landed, never because the address bar does. Stripe's `success_url` is a
// plain redirect — anyone can type `/dashboard?subscribed=growth`, a customer can
// bookmark it, and for several payment methods Stripe sends the browser there
// before the payment has settled. Reporting a Purchase from that is a sale in
// Ads Manager that may never have happened, and the bidding is then trained on
// it. §143 is the precedent in this codebase: the commercial-loop driver read the
// Stripe event TYPE instead of the wallet and printed "PROVEN END TO END" for a
// delivery that credited nothing.
//
// So the query parameter is only ever a hint that it is worth LOOKING. What is
// reported comes from `wallet.lastCredit`, which is written in the same
// transaction as the credit.

import type { EventParams } from "@/shared/analytics-events";
import { conversionEventId } from "@/shared/capi";

/** The wallet's record of the last payment that actually credited it. */
export type LastCredit = {
  eventId: string;
  kind: "subscription" | "topup";
  acu: number;
  planId?: string | null;
  cycle?: "monthly" | "annual" | null;
  amountMinor?: number;
  currency?: string;
  at: string;
};

export type ReportDecision = {
  /** The de-duplication key to store once reported. Stripe's event id. */
  key: string;
  /**
   * The events to fire, in order.
   *
   * `eventId` is the one Meta matches this browser event against its server-side
   * twin on — see `shared/capi.ts`. It is DERIVED from Stripe's event id, not
   * generated, because a random id can never match the one the webhook derives
   * and the payment would then be counted twice.
   */
  events: { name: string; params: EventParams; eventId: string }[];
  /** Why — for the console line, and so a person can tell nothing from silence. */
  why: string;
};

/**
 * Minor units to a major-unit amount, which is what both destinations expect.
 *
 * Division, not a hard-coded 100 per currency, is right for every currency this
 * platform can bill in: GBP, EUR and USD are all two-decimal. A zero-decimal
 * currency (JPY) would need a table, and there is no code path that can produce
 * one today — `createTopupCheckout` and the plan prices are GBP. Stated rather
 * than silently assumed, so the day a currency is added this reads as a TODO
 * instead of as a rounding bug.
 */
export function majorUnits(amountMinor: number): number {
  return Math.round(amountMinor) / 100;
}

/**
 * What to report for this credit, or null to report nothing.
 *
 * Null is a normal, frequent answer and never an error: no payment has landed
 * yet, this one has already been reported, or it carried no readable amount.
 */
export function conversionsFor(
  last: LastCredit | null | undefined,
  alreadyReported: ReadonlySet<string>,
): ReportDecision | null {
  if (!last || !last.eventId) return null;

  // Already reported. A refresh of the landing page, a second tab, or the
  // customer coming back to /dashboard a week later all land here.
  if (alreadyReported.has(last.eventId)) return null;

  // NO AMOUNT MEANS NO MONEY EVENT.
  //
  // Every event below carries a value, and `buildPayload` would drop a valueless
  // one anyway — but deciding it here makes it a rule with a test rather than a
  // side effect of the transport. A Purchase reported with value 0 tells Meta
  // this platform's customers are worth nothing and trains the bidding on that;
  // reporting nothing merely loses one data point.
  const minor = typeof last.amountMinor === "number" ? Math.round(last.amountMinor) : 0;
  if (!(minor > 0)) return null;

  const value = majorUnits(minor);
  const currency = (last.currency || "GBP").toUpperCase();

  // ONE MONEY EVENT PER PAYMENT — see the note in `analytics-events.ts`.
  // `subscribe` and `topup` both map to a Meta standard event and both carry the
  // value; firing `purchase` as well would report the same money twice, and the
  // report that gets read is the one that would then be wrong.
  if (last.kind === "topup") {
    return {
      key: last.eventId,
      events: [{
        name: "topup",
        params: { value, currency, count: last.acu },
        eventId: conversionEventId(last.eventId, "topup"),
      }],
      why: `top-up of ${currency} ${value} confirmed on the wallet (${last.acu} ACUs, Stripe event ${last.eventId})`,
    };
  }

  return {
    key: last.eventId,
    events: [{
      name: "subscribe",
      params: {
        value,
        currency,
        ...(last.planId ? { plan: last.planId } : {}),
        ...(last.cycle ? { cycle: last.cycle } : {}),
      },
      eventId: conversionEventId(last.eventId, "subscribe"),
    }],
    why: `${last.planId || "plan"} ${last.cycle || ""} payment of ${currency} ${value} confirmed on the wallet (Stripe event ${last.eventId})`.replace(/\s+/g, " "),
  };
}

/**
 * Is this page one a customer arrives at straight from a completed checkout?
 *
 * The markers are the `success_url`s in `backend/checkout.ts`. Matching them is
 * what stops the reporter asking an authenticated endpoint on every public page
 * view — and getting a 401 for every anonymous visitor to the landing page.
 *
 * DERIVED FROM THE SAME STRINGS THE SERVER SENDS, as far as a browser can: a
 * test asserts these markers against `checkout.ts`, because a success_url
 * renamed on the server and not here is a conversion that silently stops being
 * reported, which is this repository's first defect class — a value that exists
 * on one side of a boundary and never crosses it.
 */
export function returnedFromCheckout(pathname: string, search: string): boolean {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (pathname === "/dashboard" && q.get("subscribed")) return true;
  if (pathname === "/dashboard/billing" && q.get("topup") === "success") return true;

  // NOT `/dashboard/revenue?paid=1`, AND THAT IS THE IMPORTANT LINE IN THIS FILE.
  //
  // `checkout.ts` has a third success_url, and it is the one a MarketWar
  // customer's OWN buyer lands on — `createBrandCheckout`, paid into the
  // customer's own Stripe account, which `sellerRoute` refuses outright if the
  // money would come to us. It is their sale, not ours.
  //
  // Reporting it would put their revenue into OUR Ads Manager and our GA4: the
  // conversion value of a MarketWar advert would include money MarketWar never
  // received, ROAS would read high, and the bidding would chase it. The first
  // draft of this function matched all three success_urls because they are all
  // "a completed checkout" — they are not all OUR completed checkout.
  //
  // It is also a no-op in practice, because that payment credits no MarketWar
  // wallet and so writes no `lastCredit`. Both halves are stated deliberately:
  // relying on the second alone would make this correct by accident.
  return false;
}
