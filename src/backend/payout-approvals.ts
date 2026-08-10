// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The brand's side of a creator payout: what it owes, and what it may do about
// it.
//
// ── THE LINE THIS MODULE EXISTS TO DRAW ────────────────────────────────────
//
// A commission is EARNED. A creator posted, somebody bought, the sale settled
// and the refund window closed. At that point the money is theirs, and the
// brand's role is to review — not to decide whether to pay.
//
// So there is no "approve" button that money waits behind. A brand can:
//
//   • DISPUTE a specific earning, with a reason from a fixed list and a note.
//     Refunds, chargebacks, fraud, self-referral, a policy breach, a duplicate.
//     Every one of those is a real thing that happens, and every one is
//     recorded and shown to the creator.
//   • RELEASE EARLY, paying before the hold expires because the brand is
//     satisfied sooner than the default. That is a positive act and needs no
//     justification.
//
// A brand cannot silently withhold a settled, undisputed commission. `withhold`
// refuses and says why. The reason is not squeamishness: an earned commission
// that a payer may keep at will is not a commission, it is a tip — creators
// would price that in within a week, the good ones would leave, and the channel
// would be worth less to every brand on it.
//
// The dispute window is bounded for the same reason. A brand that can reopen a
// payment from a year ago has not got a review process, it has an option.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { HOLD_DAYS, type Earning, type EarningState } from "@/backend/share2earn";

// ---------------------------------------------------------------------------
// What the brand owes
// ---------------------------------------------------------------------------
export type CreatorLiability = {
  creatorId: string;
  pendingPence: number;      // earned, still inside the hold
  payablePence: number;      // past the hold, owed now
  paidPence: number;
  disputedPence: number;
  earnings: number;
};

export type BrandLiability = {
  brandId: string;
  totalOwedPence: number;    // pending + payable — money that is not the brand's
  payableNowPence: number;
  pendingPence: number;
  disputedPence: number;
  paidPence: number;
  creators: CreatorLiability[];
  note: string;
};

const round = (n: number) => Math.round(n);

export function brandLiability(brandId: string, earnings: Earning[], nowISO: string): BrandLiability {
  const now = new Date(nowISO).getTime();
  const byCreator = new Map<string, CreatorLiability>();

  for (const e of earnings) {
    if (e.brandId !== brandId) continue;
    const row = byCreator.get(e.creatorId) || { creatorId: e.creatorId, pendingPence: 0, payablePence: 0, paidPence: 0, disputedPence: 0, earnings: 0 };
    row.earnings += 1;
    const held = now - new Date(e.at).getTime() < HOLD_DAYS * 86_400_000;
    if (e.state === "rejected") row.disputedPence += e.pence;
    else if (e.state === "paid") row.paidPence += e.pence;
    else if (e.state === "approved" && !held) row.payablePence += e.pence;
    else row.pendingPence += e.pence;
    byCreator.set(e.creatorId, row);
  }

  const creators = [...byCreator.values()].sort((a, b) => (b.payablePence + b.pendingPence) - (a.payablePence + a.pendingPence));
  const sum = (k: keyof CreatorLiability) => round(creators.reduce((a, c) => a + (c[k] as number), 0));
  const payable = sum("payablePence"), pending = sum("pendingPence");

  return {
    brandId,
    totalOwedPence: payable + pending,
    payableNowPence: payable,
    pendingPence: pending,
    disputedPence: sum("disputedPence"),
    paidPence: sum("paidPence"),
    creators,
    note: payable + pending === 0
      ? "Nothing is owed to any creator on this brand."
      : `£${((payable + pending) / 100).toFixed(2)} is owed across ${creators.length} creator(s) — £${(payable / 100).toFixed(2)} payable now and £${(pending / 100).toFixed(2)} still inside its ${HOLD_DAYS}-day refund window. This is not your money; it was earned on sales you have already been paid for.`,
  };
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------
export type DisputeReason =
  | "order_refunded" | "chargeback" | "fraudulent_conversion"
  | "self_referral" | "policy_breach" | "duplicate" | "attribution_error";

export type ReasonDef = { id: DisputeReason; label: string; meaning: string; evidenceRequired: boolean };

export const DISPUTE_REASONS: ReasonDef[] = [
  { id: "order_refunded", label: "The order was refunded", meaning: "There is no revenue behind the commission, so there is nothing to pay it from.", evidenceRequired: false },
  { id: "chargeback", label: "The payment was charged back", meaning: "Same as a refund, and the brand has usually paid a fee on top.", evidenceRequired: false },
  { id: "fraudulent_conversion", label: "The conversion was fraudulent", meaning: "A fake or manufactured sale. Say what makes you think so — this one ends someone's account.", evidenceRequired: true },
  { id: "self_referral", label: "The creator bought it themselves", meaning: "Buying through your own link is not a referral.", evidenceRequired: true },
  { id: "policy_breach", label: "The content breached the brief", meaning: "Undisclosed paid promotion, a prohibited claim, or a channel the campaign excluded.", evidenceRequired: true },
  { id: "duplicate", label: "Counted twice", meaning: "The same sale was attributed more than once.", evidenceRequired: false },
  { id: "attribution_error", label: "Wrongly attributed", meaning: "The sale did not come from this creator's link.", evidenceRequired: true },
];

export const reasonDef = (id: string): ReasonDef | null => DISPUTE_REASONS.find((r) => r.id === id) || null;

/**
 * How long a brand has to raise a dispute.
 *
 * Bounded on purpose. A brand that can reopen a payment from a year ago has not
 * got a review process, it has an option — and a creator cannot plan around a
 * balance that might be clawed back indefinitely. The window is the hold plus a
 * fortnight, so there is time to notice a refund after the money became payable.
 */
export const DISPUTE_WINDOW_DAYS = HOLD_DAYS + 14;

export type DisputeInput = {
  brandId: string;
  earning: Earning;
  reason: string;
  note: string;
  actor: string;
  nowISO: string;
};

export type DisputeResult =
  | { ok: true; earning: Earning; record: DisputeRecord; note: string }
  | { ok: false; error: string; hint?: string };

export type DisputeRecord = {
  id: string;
  brandId: string;
  creatorId: string;
  earningId: string;
  pence: number;
  reason: DisputeReason;
  note: string;
  actor: string;
  at: string;
};

export function disputeEarning(input: DisputeInput): DisputeResult {
  const e = input.earning;
  if (e.brandId !== input.brandId) {
    return { ok: false, error: "That earning belongs to another brand." };
  }
  if (e.state === "paid") {
    return {
      ok: false,
      error: "This one has already been paid out. It cannot be disputed after the money has left.",
      hint: "Raise it with support — recovering a settled payout is a conversation with the creator, not a state change.",
    };
  }
  if (e.state === "rejected") return { ok: false, error: "Already disputed." };

  const def = reasonDef(input.reason);
  if (!def) {
    return {
      ok: false,
      error: "A dispute needs a reason from the list.",
      hint: `One of: ${DISPUTE_REASONS.map((r) => r.label).join("; ")}. Free-text withholding is not available — an earned commission a payer may keep at will is not a commission.`,
    };
  }
  const note = (input.note || "").trim();
  if (def.evidenceRequired && note.length < 15) {
    return {
      ok: false,
      error: `"${def.label}" needs an explanation — this one affects the creator's record, not just this payment.`,
      hint: def.meaning,
    };
  }

  const age = (new Date(input.nowISO).getTime() - new Date(e.at).getTime()) / 86_400_000;
  if (age > DISPUTE_WINDOW_DAYS) {
    return {
      ok: false,
      error: `This earning is ${Math.floor(age)} days old and the dispute window is ${DISPUTE_WINDOW_DAYS} days.`,
      hint: "The window is bounded so a creator can plan around their balance. A refund this late is a support matter rather than a clawback.",
    };
  }

  const record: DisputeRecord = {
    id: `dp_${createHash("sha256").update(`${input.brandId}|${e.id}|${input.nowISO}`).digest("hex").slice(0, 20)}`,
    brandId: input.brandId, creatorId: e.creatorId, earningId: e.id, pence: e.pence,
    reason: def.id, note, actor: input.actor, at: input.nowISO,
  };

  return {
    ok: true,
    earning: { ...e, state: "rejected" as EarningState, reason: `${def.label}${note ? ` — ${note}` : ""}` },
    record,
    note: `Disputed and withheld: ${def.label}. The creator is told the reason — a payment that vanishes without one is what makes people stop trusting the whole programme.`,
  };
}

/**
 * Release before the hold expires.
 *
 * The one thing here that genuinely is the brand's decision, and it only ever
 * moves money toward the creator.
 */
export function releaseEarly(input: { brandId: string; earning: Earning; actor: string; nowISO: string }): DisputeResult {
  const e = input.earning;
  if (e.brandId !== input.brandId) return { ok: false, error: "That earning belongs to another brand." };
  if (e.state === "paid") return { ok: false, error: "Already paid." };
  if (e.state === "rejected") return { ok: false, error: "This one is disputed. Withdraw the dispute before releasing it." };
  return {
    ok: true,
    earning: { ...e, state: "approved" as EarningState, at: new Date(new Date(input.nowISO).getTime() - HOLD_DAYS * 86_400_000).toISOString() },
    record: {
      id: `rl_${createHash("sha256").update(`${input.brandId}|${e.id}|${input.nowISO}`).digest("hex").slice(0, 20)}`,
      brandId: input.brandId, creatorId: e.creatorId, earningId: e.id, pence: e.pence,
      reason: "attribution_error", note: `Released early by ${input.actor}`, actor: input.actor, at: input.nowISO,
    },
    note: `Released. £${(e.pence / 100).toFixed(2)} is withdrawable now rather than after the ${HOLD_DAYS}-day hold.`,
  };
}

/**
 * THE REFUSAL.
 *
 * Exported as a function rather than left as an absence, so a future caller
 * reaching for "just hold it" has to go through this and read why not.
 */
export function withhold(): { allowed: false; reason: string; instead: string } {
  return {
    allowed: false,
    reason: "A settled, undisputed commission cannot be withheld. It was earned on a sale you have already been paid for, and at that point it is not your money.",
    instead: `If something is genuinely wrong, dispute it with one of the recorded reasons — ${DISPUTE_REASONS.map((r) => r.label.toLowerCase()).join(", ")} — and the creator is told which. An earned commission a payer may keep at will is not a commission, it is a tip; creators price that in within a week and the good ones leave.`,
  };
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------
export type QueueItem = {
  earning: Earning;
  daysHeld: number;
  daysLeftToDispute: number;
  payableIn: number;
  urgent: boolean;
};

/** What a brand should actually look at, soonest-to-settle first. */
export function approvalQueue(brandId: string, earnings: Earning[], nowISO: string): { items: QueueItem[]; note: string } {
  const now = new Date(nowISO).getTime();
  const items = earnings
    .filter((e) => e.brandId === brandId && e.state !== "paid" && e.state !== "rejected")
    .map((e) => {
      const daysHeld = (now - new Date(e.at).getTime()) / 86_400_000;
      const payableIn = Math.max(0, HOLD_DAYS - daysHeld);
      return {
        earning: e,
        daysHeld: Math.floor(daysHeld),
        daysLeftToDispute: Math.max(0, Math.ceil(DISPUTE_WINDOW_DAYS - daysHeld)),
        payableIn: Math.ceil(payableIn),
        // Worth a look now: about to become payable, so a refund noticed
        // afterwards is a harder conversation.
        urgent: payableIn > 0 && payableIn <= 3,
      };
    })
    .sort((a, b) => a.payableIn - b.payableIn);

  const urgent = items.filter((i) => i.urgent).length;
  return {
    items,
    note: items.length === 0
      ? "Nothing waiting. Every earning on this brand is either paid, disputed, or has no open question."
      : `${items.length} earning(s) in the window${urgent ? `, ${urgent} becoming payable within three days` : ""}. Nothing here needs approving to be paid — this is a chance to catch a refund or a bad conversion before the money leaves, not a gate it waits behind.`,
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
const COLLECTION = "payout_disputes";
const mem = new Map<string, DisputeRecord[]>();
const useDb = () => Boolean(adminConfigured && adminDb);

export async function saveDispute(d: DisputeRecord): Promise<void> {
  const list = (mem.get(d.brandId) || []).filter((x) => x.id !== d.id);
  mem.set(d.brandId, [d, ...list]);
  if (useDb()) { try { await adminDb!.collection(COLLECTION).doc(d.id).set(d); } catch { /* memory copy serves this instance */ } }
}

export async function listDisputes(brandId: string): Promise<DisputeRecord[]> {
  const local = mem.get(brandId) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).limit(500).get();
    const byId = new Map<string, DisputeRecord>();
    for (const d of [...snap.docs.map((x) => x.data() as DisputeRecord), ...local]) byId.set(d.id, d);
    return [...byId.values()].sort((a, b) => b.at.localeCompare(a.at));
  } catch { return [...local]; }
}

export function __resetDisputes(): void { mem.clear(); }

export const APPROVALS_DOCTRINE = [
  "A commission is earned, not granted. Once the sale has settled and the refund window has closed, the money is the creator's and there is no button it waits behind.",
  "What a brand can do is dispute a specific earning with a reason from a fixed list, and the creator is told which one. A payment that vanishes without a reason is what makes people stop trusting the whole programme.",
  `Disputes close after ${DISPUTE_WINDOW_DAYS} days. A brand that can reopen a payment from a year ago has not got a review process, it has an option — and a creator cannot plan around a balance that might be clawed back indefinitely.`,
  "Releasing early is always available, because it only ever moves money toward the creator.",
  "The figures here are what you owe, not what you hold. It was earned on sales you have already been paid for.",
];
