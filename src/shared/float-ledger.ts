// THE BRAND'S COMMISSION FLOAT — where "reserved" stops being a word.
//
// WHY A FLOAT AND NOT A CUT OF THE CHECKOUT.
//
// The obvious design is for the buyer's money to flow through MarketWar so the
// creator's commission can be taken out on the way past. It cannot: the buyer
// pays on the BRAND'S own site, in the brand's own Shopify or Stripe checkout,
// and the brand is the merchant of record. Putting ourselves in that flow would
// mean replacing their checkout — which no shop with a working till will do, and
// which would move the VAT liability onto us.
//
// So the money is collected from the brand instead, up front, and held. The
// brand tops up a float; accrued commission is charged against it; the creator
// is paid from it. This works no matter whose checkout the sale happened in, it
// makes the mission card's "£X reserved" literally true, and it means MarketWar
// never fronts a commission out of its own balance sheet — the exposure the
// whole revenue-locked model exists to avoid.
//
// ────────────────────────────────────────────────────────────────────────────
// THE LAW OF THIS FILE, AND IT IS CHECKED ON EVERY OPERATION:
//
//     available + held + paidOut === toppedUp - refunded
//
// Every penny that came in is in exactly one of three places: free to spend,
// reserved against a promise, or gone to a creator. A ledger that cannot prove
// that is not a ledger, and the first time a brand asks "where is my £2,000"
// the answer has to be arithmetic rather than an apology.

export type FloatEntryKind =
  | "topup"        // the brand paid money in
  | "refund"       // money returned to the brand
  | "hold"         // reserved against a live mission
  | "release"      // a hold given back (mission closed under budget)
  | "payout"       // paid to a creator, out of a hold
  | "clawback";    // recovered from a creator after a chargeback

export type FloatEntry = {
  id: string;
  brandId: string;
  kind: FloatEntryKind;
  /** Always POSITIVE. The kind decides the direction — a signed amount plus a
   *  kind is two sources of truth for one fact, and they disagree eventually. */
  pence: number;
  /** What this entry is about: a mission id, an accrual id, a Stripe id. */
  ref: string;
  at: string;
  note?: string;
};

export type FloatState = {
  /** Free to reserve or spend. */
  availablePence: number;
  /** Reserved against live missions. Promised, not yet paid. */
  heldPence: number;
  /** Gone to creators. Only ever grows. */
  paidOutPence: number;
  /** Everything the brand has ever put in. */
  toppedUpPence: number;
  /** Everything returned to the brand. */
  refundedPence: number;
};

export const EMPTY_FLOAT: FloatState = {
  availablePence: 0, heldPence: 0, paidOutPence: 0, toppedUpPence: 0, refundedPence: 0,
};

/**
 * Replay the entries into a balance.
 *
 * Derived every time rather than stored as a running total: a stored balance and
 * a list of entries are two sources of truth, and when they drift — and they do,
 * on a retry or a partial write — nobody can say which one is the money.
 */
export function floatState(entries: FloatEntry[]): FloatState {
  const s: FloatState = { ...EMPTY_FLOAT };
  for (const e of [...entries].sort((a, b) => a.at.localeCompare(b.at))) {
    const p = Math.max(0, Math.round(e.pence || 0));
    switch (e.kind) {
      case "topup":    s.toppedUpPence += p; s.availablePence += p; break;
      case "refund":   s.refundedPence += p; s.availablePence -= p; break;
      case "hold":     s.availablePence -= p; s.heldPence += p; break;
      case "release":  s.heldPence -= p; s.availablePence += p; break;
      // A payout consumes a hold. The money was already promised, so it leaves
      // `held` rather than `available` — otherwise paying a creator would
      // silently free up the reservation that was protecting them.
      case "payout":   s.heldPence -= p; s.paidOutPence += p; break;
      // Recovered after a chargeback: it comes back off paidOut and returns to
      // the brand's spendable balance, because the sale it funded reversed.
      case "clawback": s.paidOutPence -= p; s.availablePence += p; break;
    }
  }
  return s;
}

/** The law, checkable by any caller before it acts on a balance. */
export function conserves(s: FloatState): boolean {
  return s.availablePence + s.heldPence + s.paidOutPence === s.toppedUpPence - s.refundedPence;
}

export type FloatRefusal = { ok: false; error: string; shortfallPence?: number };
export type FloatOk = { ok: true; entry: Omit<FloatEntry, "id" | "brandId" | "at"> };
export type FloatResult = FloatOk | FloatRefusal;

/**
 * Reserve money against a mission.
 *
 * REFUSES rather than going negative. This is the whole point of the file: a
 * mission that promises creators £5,000 on a £200 float is a debt the platform
 * would be left holding, and creators would have done the work by the time
 * anyone noticed.
 */
export function requestHold(state: FloatState, pence: number, missionId: string): FloatResult {
  const p = Math.max(0, Math.round(pence || 0));
  if (p === 0) return { ok: false, error: "A hold of nothing reserves nothing." };
  if (p > state.availablePence) {
    return {
      ok: false,
      error: `£${(p / 100).toFixed(2)} needs to be reserved and £${(state.availablePence / 100).toFixed(2)} is available. Top up the float, cut the rewards, or cap how many creators can join — a bounty that is displayed is a debt.`,
      shortfallPence: p - state.availablePence,
    };
  }
  return { ok: true, entry: { kind: "hold", pence: p, ref: missionId } };
}

/**
 * Pay a creator out of what was held for them.
 *
 * Refuses if the hold does not cover it — which would mean paying from money
 * reserved for somebody else's mission.
 */
export function requestPayout(state: FloatState, pence: number, accrualId: string): FloatResult {
  const p = Math.max(0, Math.round(pence || 0));
  if (p === 0) return { ok: false, error: "There is nothing to pay." };
  if (p > state.heldPence) {
    return {
      ok: false,
      error: `£${(p / 100).toFixed(2)} is owed and only £${(state.heldPence / 100).toFixed(2)} is reserved. Paying it would spend money held against another mission.`,
      shortfallPence: p - state.heldPence,
    };
  }
  return { ok: true, entry: { kind: "payout", pence: p, ref: accrualId } };
}

/** Give an unused reservation back when a mission closes under budget. */
export function requestRelease(state: FloatState, pence: number, missionId: string): FloatResult {
  const p = Math.max(0, Math.round(pence || 0));
  if (p === 0) return { ok: false, error: "There is nothing to release." };
  if (p > state.heldPence) return { ok: false, error: "That is more than is currently held." };
  return { ok: true, entry: { kind: "release", pence: p, ref: missionId } };
}

/** Return money to the brand. Only what is free — a hold is a promise. */
export function requestRefund(state: FloatState, pence: number, ref: string): FloatResult {
  const p = Math.max(0, Math.round(pence || 0));
  if (p === 0) return { ok: false, error: "There is nothing to refund." };
  if (p > state.availablePence) {
    return {
      ok: false,
      error: `£${(p / 100).toFixed(2)} was asked for and £${(state.availablePence / 100).toFixed(2)} is unreserved. Money held against a live mission has been promised to creators and cannot be taken back while it runs.`,
      shortfallPence: p - state.availablePence,
    };
  }
  return { ok: true, entry: { kind: "refund", pence: p, ref } };
}

/** What the brand should be told, in one line, without adjectives. */
export function floatSummary(s: FloatState): string {
  return `£${(s.availablePence / 100).toFixed(2)} available, £${(s.heldPence / 100).toFixed(2)} reserved against live missions, £${(s.paidOutPence / 100).toFixed(2)} paid to creators.`;
}
