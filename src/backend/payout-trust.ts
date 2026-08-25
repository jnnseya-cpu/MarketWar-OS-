// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// TRUST SIGNALS COMPUTED FROM WHAT WE STORED — checked before money leaves.
//
// THE HOLE THIS CLOSES. `trustSignals` in share2earn.ts already scores fraud and
// can return "blocked". Two things made it decorative:
//
//   1. Its inputs came from the REQUEST BODY — `num("selfPurchases")` and the
//      rest are read off whatever the caller posted. A fraudster fills in zero.
//      It is a self-service calculator, and a calculator is not a control.
//   2. Nothing in the payout path called it. A "blocked" verdict never stopped
//      a withdrawal, because no code between the verdict and the money had ever
//      heard of it.
//
// So this recomputes the same question from evidence the CALLER CANNOT TOUCH:
// the clicks we recorded, the accruals we wrote, the account we created. Then
// payout-execute consults it before it claims a penny.
//
// WHAT THIS HONESTLY CANNOT SEE, stated rather than implied:
//
//   SELF-PURCHASE. The single most common way these programmes are drained, and
//   we cannot detect it server-side. The click is on our domain; the purchase is
//   on the brand's. We store a salted hash of the visitor that rotates per code
//   PER DAY — deliberately, so nobody including us can build a trail — and the
//   brand's postback tells us an order id, not a buyer. There is no field to
//   join on. A rule that claimed to catch it would be a lie, so the payout says
//   plainly that self-purchase is caught by the brand's own refund data
//   arriving as a void, not by us in advance.
//
// A verdict HOLDS a payout for review. It does not seize the balance and it does
// not accuse: the money stays the creator's, and a human decides. Freezing
// earnings on an automated signal, with no appeal, is how a creator programme
// loses the creators who actually sell things.

import { clickStats } from "@/backend/referral-clicks";
import { balanceFor } from "@/backend/commission-ledger";
import { listSubscriptions } from "@/backend/creator-engine";

export type TrustSignal = { id: string; hit: boolean; severity: "block" | "review" | "note"; what: string };

export type TrustVerdict = {
  verdict: "clear" | "review" | "blocked";
  signals: TrustSignal[];
  why: string;
  /** The counted evidence, so a decision can be explained rather than asserted. */
  evidence: { clicks: number; uniqueVisitors: number; orders: number; voidedPence: number; releasedPence: number };
};

/** How far back the evidence is gathered. */
const WINDOW_DAYS = 90;

/**
 * Judge a creator from stored evidence.
 *
 * Every threshold carries a MINIMUM VOLUME, because a ratio computed from three
 * clicks is noise, and refusing somebody's first withdrawal on noise is worse
 * than the fraud it imagines.
 */
export async function payoutTrust(creatorId: string, nowISO: string): Promise<TrustVerdict> {
  const since = new Date(Date.parse(nowISO) - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let clicks = 0, uniqueVisitors = 0, orders = 0, voidedPence = 0, releasedPence = 0;
  try {
    const subs = await listSubscriptions(creatorId);
    for (const sub of subs) {
      if (!sub?.code) continue;
      const [stats, bal] = await Promise.all([clickStats(sub.code, since), balanceFor(sub.code)]);
      clicks += stats.total;
      uniqueVisitors += stats.uniqueVisitors;
      orders += bal.orders;
      voidedPence += bal.voidedPence;
      releasedPence += bal.releasedPence;
    }
  } catch {
    // Evidence we cannot read is not evidence of wrongdoing. A storage failure
    // must not become an accusation — it lets the payout through, because the
    // identity gate, the emergency stop and the balance check all still stand.
    return {
      verdict: "clear", signals: [], why: "Trust evidence could not be read, so nothing was inferred from its absence.",
      evidence: { clicks: 0, uniqueVisitors: 0, orders: 0, voidedPence: 0, releasedPence: 0 },
    };
  }

  const dupRatio = clicks > 0 ? 1 - uniqueVisitors / clicks : 0;
  const conversionRate = uniqueVisitors > 0 ? orders / uniqueVisitors : 0;
  const voidRatio = releasedPence + voidedPence > 0 ? voidedPence / (releasedPence + voidedPence) : 0;

  const signals: TrustSignal[] = [
    {
      id: "orders_without_clicks",
      // The strongest thing we can actually see: commission accrued on a code
      // that no click ever came through. Either the code is being pasted
      // straight into a checkout, or the postback is claiming referrals that
      // never happened.
      hit: orders > 0 && clicks === 0,
      severity: "block",
      what: `${orders} order(s) credited to your codes with no recorded click on any of them. A referral that nobody clicked is not a referral.`,
    },
    {
      id: "click_duplication",
      hit: clicks >= 30 && dupRatio > 0.7,
      severity: "block",
      what: `${Math.round(dupRatio * 100)}% of ${clicks} clicks came from the same few visitors. Clicking your own link does not create demand.`,
    },
    {
      id: "impossible_rate",
      hit: orders > 0 && uniqueVisitors >= 20 && conversionRate > 0.6,
      severity: "review",
      what: `${orders} orders from ${uniqueVisitors} visitors — a rate no genuine traffic reaches. Worth a look before money moves.`,
    },
    {
      id: "high_void_rate",
      hit: voidedPence > 0 && releasedPence + voidedPence >= 5000 && voidRatio > 0.5,
      severity: "review",
      what: `More than half of what you earned has since reversed. Sales that keep refunding are not sales.`,
    },
    {
      id: "no_traffic_yet",
      hit: clicks === 0 && orders === 0,
      severity: "note",
      what: "No clicks and no orders recorded yet on your codes.",
    },
  ];

  const hits = signals.filter((s) => s.hit);
  const blocked = hits.some((s) => s.severity === "block");
  const review = hits.some((s) => s.severity === "review");
  const verdict: TrustVerdict["verdict"] = blocked ? "blocked" : review ? "review" : "clear";

  return {
    verdict,
    signals,
    evidence: { clicks, uniqueVisitors, orders, voidedPence, releasedPence },
    why: hits.length
      ? hits.map((s) => s.what).join(" ")
      : "Nothing in the recorded clicks, orders or reversals looks wrong.",
  };
}
