// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// CUSTODY. The brand's money, actually collected and actually held.
//
// `reservedPence` used to be a number written on a mission record while
// `/share2earn` — a public page — told creators "£X reserved" and "money that
// already exists". Nothing held it and nothing collected it. This is the store
// that makes the sentence true.
//
// The arithmetic and every refusal live in `shared/float-ledger.ts`; this is the
// storage and the Stripe call. The split matters: a store that also decides what
// a legal hold is becomes a second rulebook, and the two disagree the first time
// one of them is edited.
//
// APPEND-ONLY, AND THE BALANCE IS DERIVED. There is no running total anywhere. A
// stored balance and a list of entries are two sources of truth about the same
// money, and when they drift — on a retry, on a partial write — nobody can say
// which one is real.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import {
  floatState, conserves, requestHold, requestPayout, requestRelease, requestRefund,
  type FloatEntry, type FloatState, type FloatResult,
} from "@/shared/float-ledger";

const COLLECTION = "brand_float";
const useDb = () => Boolean(adminConfigured && adminDb);
const mem = new Map<string, FloatEntry[]>();

export function stripeConfigured(): boolean {
  return Boolean((process.env.STRIPE_SECRET_KEY || "").trim());
}

const entryId = (brandId: string, kind: string, ref: string) =>
  `f_${createHash("sha256").update(`${brandId}|${kind}|${ref}`).digest("hex").slice(0, 24)}`;

export async function listEntries(brandId: string): Promise<FloatEntry[]> {
  const local = mem.get(brandId) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).get();
    const byId = new Map<string, FloatEntry>();
    for (const r of local) byId.set(r.id, r);
    snap.forEach((d) => { const r = d.data() as FloatEntry; byId.set(r.id, r); });
    return [...byId.values()];
  } catch {
    return [...local];
  }
}

export async function balance(brandId: string): Promise<FloatState> {
  return floatState(await listEntries(brandId));
}

/**
 * Append one entry, idempotently.
 *
 * The id is a hash of brand + kind + ref, so the SAME operation written twice —
 * a retried webhook, a double-clicked button — is one row, not two. With money
 * this is not an optimisation; a duplicated topup credits the brand for a
 * payment they made once.
 */
async function append(brandId: string, e: Omit<FloatEntry, "id" | "brandId" | "at">, at: string): Promise<FloatEntry> {
  const row: FloatEntry = { ...e, id: entryId(brandId, e.kind, e.ref), brandId, at };
  const local = mem.get(brandId) || [];
  if (!local.some((r) => r.id === row.id)) mem.set(brandId, [...local, row]);
  if (useDb()) {
    try {
      // create() throws if the document exists, which is exactly the idempotency
      // we want — a repeat is a no-op rather than an overwrite.
      await adminDb!.collection(COLLECTION).doc(row.id).create(row);
    } catch { /* already written, or memory holds it */ }
  }
  return row;
}

type Applied = { ok: true; entry: FloatEntry; state: FloatState } | { ok: false; error: string; shortfallPence?: number };

/** Run a shared-rule decision against the live balance and record it if allowed. */
async function apply(brandId: string, decide: (s: FloatState) => FloatResult, at: string): Promise<Applied> {
  const state = await balance(brandId);
  const verdict = decide(state);
  if (!verdict.ok) return { ok: false, error: verdict.error, shortfallPence: verdict.shortfallPence };
  const entry = await append(brandId, verdict.entry, at);
  const next = await balance(brandId);
  // The law, checked at the moment money moves rather than only in a test.
  if (!conserves(next)) {
    return { ok: false, error: "The float stopped balancing after that operation. Nothing further will be written until it is reconciled." };
  }
  return { ok: true, entry, state: next };
}

export const holdForMission = (brandId: string, pence: number, missionId: string, at: string) =>
  apply(brandId, (s) => requestHold(s, pence, missionId), at);

export const payoutFromHold = (brandId: string, pence: number, accrualId: string, at: string) =>
  apply(brandId, (s) => requestPayout(s, pence, accrualId), at);

export const releaseHold = (brandId: string, pence: number, missionId: string, at: string) =>
  apply(brandId, (s) => requestRelease(s, pence, missionId), at);

export const refundToBrand = (brandId: string, pence: number, ref: string, at: string) =>
  apply(brandId, (s) => requestRefund(s, pence, ref), at);

/**
 * Credit a confirmed payment.
 *
 * Called ONLY from the Stripe webhook, never from the browser and never
 * optimistically on a redirect back from checkout. A customer who reaches the
 * success page has not necessarily paid, and crediting on that would let anyone
 * mint float by visiting a URL.
 */
export async function creditTopUp(brandId: string, pence: number, stripeRef: string, at: string): Promise<Applied> {
  const p = Math.max(0, Math.round(pence || 0));
  if (p === 0) return { ok: false, error: "A top-up of nothing credits nothing." };
  if (!stripeRef) return { ok: false, error: "A top-up needs the payment's own reference, or a retry credits twice." };
  const entry = await append(brandId, { kind: "topup", pence: p, ref: stripeRef, note: "Confirmed by Stripe" }, at);
  return { ok: true, entry, state: await balance(brandId) };
}

/**
 * Start a top-up. Returns a Stripe Checkout URL the brand can pay on.
 *
 * Refuses honestly with no key rather than pretending. Nothing is credited here
 * — only the webhook credits, and only on a payment Stripe has confirmed.
 */
export async function startTopUp(input: { brandId: string; pence: number; returnUrl: string }): Promise<
  { ok: true; url: string; sessionId: string } | { ok: false; error: string }
> {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) {
    return { ok: false, error: "Payments are not configured on this deployment (STRIPE_SECRET_KEY), so a float cannot be topped up and no mission can be funded." };
  }
  const pence = Math.max(100, Math.round(input.pence || 0));
  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        mode: "payment",
        "line_items[0][price_data][currency]": "gbp",
        "line_items[0][price_data][product_data][name]": "Creator commission float",
        "line_items[0][price_data][unit_amount]": String(pence),
        "line_items[0][quantity]": "1",
        success_url: input.returnUrl,
        cancel_url: input.returnUrl,
        // Read back by the webhook. Without these the payment arrives with no
        // idea whose float it belongs to.
        "metadata[mw_purpose]": "brand_float_topup",
        "metadata[mw_brand_id]": input.brandId,
        "metadata[mw_pence]": String(pence),
      }),
    });
    const d = (await res.json().catch(() => null)) as { id?: string; url?: string; error?: { message?: string } } | null;
    if (!res.ok || !d?.url || !d?.id) {
      return { ok: false, error: `Stripe ${res.status}: ${d?.error?.message || "no checkout session returned"}` };
    }
    return { ok: true, url: d.url, sessionId: d.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Stripe." };
  }
}

/** Test seam. Never called by product code. */
export function __resetFloat(): void { mem.clear(); }
