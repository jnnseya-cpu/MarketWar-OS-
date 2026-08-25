// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE EIGHT METRES BETWEEN THE CLICK AND THE ACCOUNT.
//
// The ledger, the wallet, the cap-and-recycle cycle and the payout rails all
// existed and were tested. What did not exist was anything that turned "this
// person arrived on a creator's link" into a row any of it could read. See
// shared/signup-attribution.ts for the whole account of what was dropping the
// code, and for the last-touch rule this enforces.
//
// WHAT THIS REFUSES, and why each refusal is here rather than assumed:
//
//   SELF-REFERRAL. The first thing anyone tries. The creator's id is derived
//     from their email (`creatorId(email)`), so the account being created is
//     checked against it directly rather than against a heuristic.
//   A SECOND ATTRIBUTION FOR THE SAME ACCOUNT. The record is keyed on the
//     account id, so a refresh, a retried request, a second tab or a second
//     creator's code cannot mint a second referral. First one recorded wins,
//     permanently — which is the only way "last touch" stays a statement about
//     the CLICK rather than about whichever request happened to arrive last.
//   AN UNKNOWN CODE. Nothing is stored. A typo in a query string must not
//     create a dangling attribution nobody can trace.
//
// WHAT THIS IS AND IS NOT. It records that an account BELONGS to a creator. It
// moves no money and writes nothing to the commission ledger — see the note at
// the write itself for the gate that would have opened if it did. The creator is
// paid when the account they introduced produces revenue, through the ledger,
// the cap cycle and the payout rails that already exist and are already tested.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { subscriptionByCode, creatorId } from "@/backend/creator-engine";
import { normaliseCode } from "@/shared/signup-attribution";

const useDb = () => adminConfigured && Boolean(adminDb);

export type AttributionRecord = {
  /** The referred account. One record per account, ever. */
  accountId: string;
  code: string;
  creatorId: string;
  programmeId: string;
  /** When the link was last clicked, as carried by the cookie or the URL. */
  touchedAt: string;
  createdAt: string;
  /** "cookie" (accepted, up to 90 days) or "visit" (the URL carried it). */
  via: "cookie" | "visit";
};

const memAttributions = new Map<string, AttributionRecord>();

export async function getAttribution(accountId: string): Promise<AttributionRecord | null> {
  const id = (accountId || "").trim();
  if (!id) return null;
  if (useDb()) {
    const s = await adminDb!.collection("referral_attributions").doc(id).get();
    if (!s.exists) return null;
    return recordFromStored(s.data());
  }
  return memAttributions.get(id) ?? null;
}

/**
 * Read a stored attribution WITHOUT asserting its shape.
 *
 * `s.data() as AttributionRecord` is the pattern that put two crashes into
 * production (scripts/check-casts.mjs holds both post-mortems). A record written
 * before a field existed comes back without it, so every field used downstream
 * is checked here and a record that cannot be trusted reads as absent — which
 * fails towards "not yet attributed", never towards crediting the wrong creator.
 */
export function recordFromStored(raw: unknown): AttributionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const accountId = str(r.accountId), code = str(r.code), cid = str(r.creatorId);
  if (!accountId || !code || !cid) return null;
  return {
    accountId, code, creatorId: cid,
    programmeId: str(r.programmeId),
    touchedAt: str(r.touchedAt) || str(r.createdAt),
    createdAt: str(r.createdAt),
    via: r.via === "cookie" ? "cookie" : "visit",
  };
}

export type AttributionResult =
  | { ok: true; record: AttributionRecord; alreadyAttributed: boolean }
  | { ok: false; reason: string };

/**
 * Credit a creator for an account that has just been created.
 *
 * `email` is the new account's own address, used ONLY to refuse self-referral.
 * It is never stored on the attribution record: the creator is identified by
 * their creator id, and the referred party by their account id.
 */
export async function attributeSignup(input: {
  accountId: string;
  code: string;
  email?: string;
  via?: "cookie" | "visit";
  touchedAt?: string;
  nowISO: string;
}): Promise<AttributionResult> {
  const accountId = (input.accountId || "").trim();
  if (!accountId) return { ok: false, reason: "No account to attribute." };

  const code = normaliseCode(input.code);
  if (!code) return { ok: false, reason: "That is not a referral code." };

  // Already credited? Say so and change nothing. Not an error — a second tab
  // finishing its own request is the normal case, not a fault.
  const existing = await getAttribution(accountId);
  if (existing) return { ok: true, record: existing, alreadyAttributed: true };

  const sub = await subscriptionByCode(code);
  if (!sub) return { ok: false, reason: "Unknown referral code." };

  const email = (input.email || "").trim().toLowerCase();
  if (email && creatorId(email) === sub.creatorId) {
    return { ok: false, reason: "A creator cannot refer their own account." };
  }

  const record: AttributionRecord = {
    accountId, code, creatorId: sub.creatorId, programmeId: sub.programmeId,
    touchedAt: input.touchedAt || input.nowISO,
    createdAt: input.nowISO,
    via: input.via === "cookie" ? "cookie" : "visit",
  };

  // A SIGNUP IS NOT A CONVERSION, and it must not be written as one.
  //
  // The obvious implementation was `recordConversion(..., grossGbp: 0)` so the
  // referral landed in the ledger the wallet already reads. `fraudScore` refuses
  // it, and the comment there says exactly why: "Zero/negative revenue must be
  // FLAGGED (>=50): otherwise 5 fake £0 conversions would satisfy the
  // proven-conversion exception and bypass the 10K gate." Making the zero-value
  // event count would have opened that hole — five throwaway signups on your own
  // link and the follower gate is gone.
  //
  // So the attribution is a LINK, not money. It records which creator the
  // account belongs to. When that account later pays, the payment posts a real
  // conversion against this same account id and the existing ledger, cap-cycle
  // and payout machinery does what it already does — correctly, on revenue that
  // exists.
  if (useDb()) await adminDb!.collection("referral_attributions").doc(accountId).set(record, { merge: true });
  else memAttributions.set(accountId, record);

  return { ok: true, record, alreadyAttributed: false };
}

export function __resetReferralAttribution(): void { memAttributions.clear(); }

/** Every account a creator has been credited with introducing. */
export async function attributionsForCreator(creatorId: string): Promise<AttributionRecord[]> {
  const id = (creatorId || "").trim();
  if (!id) return [];
  if (useDb()) {
    const snap = await adminDb!.collection("referral_attributions").where("creatorId", "==", id).limit(1000).get();
    return snap.docs.map((d) => recordFromStored(d.data())).filter((r): r is AttributionRecord => Boolean(r));
  }
  return [...memAttributions.values()].filter((r) => r.creatorId === id);
}
