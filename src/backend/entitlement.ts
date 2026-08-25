// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHAT AN ACCOUNT IS ENTITLED TO — asked in one place, so the answer cannot
// differ between the screen that shows it and the code that enforces it.
//
// THE HOLE THIS CLOSES. Cancelling a subscription cost the customer their
// monthly ACU allocation and nothing else. On Growth that allocation is
// £49 × 20% = 980 ACUs, or £9.80 of usage — so cancelling and topping up £9.80
// when needed saved £39.20 a month and lost nothing. Every metered action
// checked the WALLET BALANCE and never asked whether a subscription existed,
// and the plan's brand/seat/storage limits appeared only as labels on the
// pricing page. Top-up-only was not a loophole a clever user might find; it was
// the rational strategy for anyone who did the arithmetic once.
//
// `customer.subscription.deleted` was already classified as a downgrade, with a
// note describing exactly the right policy — "assets stay readable, excess
// brands/users become read-only, automations pause; purchased top-up ACUs
// remain valid". Nothing executed it. This is that note, executed.
//
// WHAT IS DELIBERATELY NOT TAKEN AWAY:
//   • Purchased ACUs. They were paid for. Clawing them back on cancellation is
//     how a chargeback starts, and it would be theft of a thing already sold.
//   • Data. Everything stays readable and exportable. A lapsed customer who
//     cannot get their own work out is a customer who tells people so.
// What stops is the SERVICE: new work beyond the free tier's limits, and
// anything that runs on its own and costs us money while nobody is paying.

import { PLANS, type Plan } from "@/backend/subscription";
import { getWallet, type WalletState } from "@/backend/wallet";

export type Entitlement = {
  /** The plan actually in force right now — not the one last paid for. */
  planId: string;
  plan: Plan;
  /** True while the subscription is paying, or inside a forgiven grace window. */
  active: boolean;
  /** A failed payment, still inside its window. Service is unchanged. */
  inGrace: boolean;
  graceEndsAt: string | null;
  /** Work that runs on a schedule and spends money without anybody present. */
  automationsPaused: boolean;
  /** Said to the customer. Never a bare "upgrade required". */
  reason: string;
};

const FREE: Plan = PLANS.find((p) => p.id === "free") ?? PLANS[0];
const planById = (id: string): Plan => PLANS.find((p) => p.id === id) ?? FREE;

/**
 * The decision, from a wallet and a clock. Pure, so the tests can drive every
 * branch without a database.
 *
 * A wallet written before the lifecycle fields existed has neither, and absent
 * reads as "never lapsed" — adding a field must not retro-cancel a paying
 * customer.
 */
export function entitlementOf(wallet: Pick<WalletState, "planId" | "lapsedAt" | "graceUntil">, nowISO: string): Entitlement {
  const now = Date.parse(nowISO) || 0;
  const graceUntil = wallet.graceUntil ? Date.parse(wallet.graceUntil) : 0;
  const inGrace = graceUntil > now;

  // A lapse that has been recorded means the plan is already `free`; the flag is
  // what lets the screen explain WHY, rather than showing a free account that
  // looks like it was always free.
  const lapsed = Boolean(wallet.lapsedAt) && !inGrace;

  // Grace forgives a failed payment: the plan on the wallet still stands.
  if (inGrace) {
    const plan = planById(wallet.planId);
    return {
      planId: plan.id, plan, active: true, inGrace: true,
      graceEndsAt: wallet.graceUntil ?? null,
      automationsPaused: false,
      reason: `A payment did not go through. Everything keeps working until ${(wallet.graceUntil || "").slice(0, 10)} — update the card before then and nothing changes.`,
    };
  }

  // The grace window has closed on a failed payment: treat it as lapsed even
  // though no second webhook ever arrives to say so.
  const graceExpired = Boolean(wallet.graceUntil) && graceUntil <= now;

  if (lapsed || graceExpired) {
    return {
      planId: FREE.id, plan: FREE, active: false, inGrace: false, graceEndsAt: null,
      automationsPaused: true,
      reason: graceExpired
        ? "The payment for this account never went through, so it is on the free tier. Your work is all still here and still exportable — resubscribe and everything switches back on."
        : "This subscription has ended, so the account is on the free tier. Your work is all still here and still exportable, and any ACUs you bought are still yours to spend. Resubscribe and everything switches back on.",
    };
  }

  const plan = planById(wallet.planId);
  return {
    planId: plan.id, plan, active: plan.monthlyGbp > 0, inGrace: false, graceEndsAt: null,
    automationsPaused: false,
    reason: plan.monthlyGbp > 0 ? `${plan.name} is active.` : "On the free tier.",
  };
}

export async function entitlementFor(orgId: string, nowISO = new Date().toISOString()): Promise<Entitlement> {
  return entitlementOf(await getWallet(orgId), nowISO);
}

// ---------------------------------------------------------------------------
// Limits — counted, not decorative
// ---------------------------------------------------------------------------

export type LimitKind = "brands" | "users" | "workspaces" | "socialAccounts" | "campaigns";

export type LimitVerdict = {
  allowed: boolean;
  limit: number | "custom" | "unlimited";
  used: number;
  reason: string;
};

/**
 * May this account create one more of these?
 *
 * READ-ONLY, NOT DELETED. Going over the limit stops NEW ones being made; it
 * never removes what is already there. Somebody who drops from Growth to free
 * with three brands keeps all three readable and exportable and can work in the
 * oldest one — the other two wait for them to resubscribe. Deleting a customer's
 * brand because their card expired would be indefensible.
 */
export function withinLimit(ent: Entitlement, kind: LimitKind, used: number): LimitVerdict {
  const limit = ent.plan[kind] as number | "custom" | "unlimited";
  if (limit === "custom" || limit === "unlimited") {
    return { allowed: true, limit, used, reason: "" };
  }
  if (used < limit) return { allowed: true, limit, used, reason: "" };
  return {
    allowed: false,
    limit,
    used,
    reason: ent.active
      ? `${ent.plan.name} includes ${limit} ${kind}. You have ${used}. Upgrade to add another — nothing you already have is affected.`
      : `This account is on the free tier, which includes ${limit} ${kind}, and you have ${used}. They are all still here and still exportable; resubscribe to work in them again.`,
  };
}

/**
 * WHICH of the things already created stay writable when the allowance shrinks.
 *
 * Deterministic and stable: the OLDEST survive. Any other rule — newest, or
 * whatever the query happened to return — means the set changes between two
 * page loads, and a customer cannot be told which of their brands they may use
 * if the answer keeps moving.
 */
export function writableIds<T extends { id: string; createdAt?: string }>(ent: Entitlement, items: T[], kind: LimitKind): Set<string> {
  const limit = ent.plan[kind] as number | "custom" | "unlimited";
  if (limit === "custom" || limit === "unlimited") return new Set(items.map((i) => i.id));
  const ordered = [...items].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") || a.id.localeCompare(b.id));
  return new Set(ordered.slice(0, Math.max(0, limit)).map((i) => i.id));
}
