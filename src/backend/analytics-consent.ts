// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHETHER THE SERVER MAY SEND THIS PERSON'S CONVERSION TO AN ADVERTISING NETWORK.
//
// THE PROBLEM THIS EXISTS TO SOLVE, AND IT IS THE WHOLE REASON THE CONVERSIONS
// API IS NOT JUST "POST THE EVENT".
//
// The browser consent gate stores the visitor's choice in `localStorage`. The
// server cannot read `localStorage`. So a server-side conversion has NO IDEA
// whether the person said yes — and a server-to-server send sails straight past
// every control the browser gate implements: the banner, the Consent Mode
// defaults, the revoke-before-init, the ad blocker, the browser's own tracking
// prevention. It is the one tracking path a person cannot refuse by any means
// available to them.
//
// Sending regardless would be a plain UK GDPR breach (Article 6 — no lawful
// basis for disclosing a customer's data to Meta for advertising) made worse by
// being invisible: nothing in the page would tell the customer it happened, and
// the cookie banner would be telling them the opposite. "The browser respects
// your choice and the server ignores it" is not a defensible position, and the
// ICO has fined for exactly this shape of thing.
//
// So: the choice is recorded DURABLY, keyed by the signed-in account, and the
// Conversions API sends nothing without one. No record means no send — the same
// direction of failure the browser gate uses, which is the only safe one.
//
// WHAT THIS IS NOT. It is not a second source of truth for the banner: the
// browser still decides and still stores its own copy, because a signed-out
// visitor has no account to key this by. This is the server's copy of a decision
// the customer already made, written when they are signed in and we know who
// they are.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type AnalyticsConsent = {
  uid: string;
  choice: "granted" | "denied";
  /** The banner version the choice was made against. */
  version: string;
  at: string;
  /** Where it was recorded, for the audit trail. Never an IP, never a name. */
  surface?: string;
};

const COLLECTION = "analytics_consent";

/**
 * The current banner version.
 *
 * MUST MATCH `STORAGE_KEY` IN `CookieConsent.tsx`, and a test asserts it does.
 * The browser bumps its key when the purposes change so an old "yes" cannot
 * silently cover a new use; a stored server-side consent against the old version
 * must stop authorising sends at the same moment, or the bump only applies to
 * half the platform. First defect class: a value that exists on one side of a
 * boundary and never crosses it.
 */
export const CONSENT_VERSION = "mw-cookie-consent-v1";

// Per-instance fallback for demo and development, where there is no Admin SDK.
// Deliberately NOT a silent production path — see `mayReportConversions`.
const mem = new Map<string, AnalyticsConsent>();

export async function recordAnalyticsConsent(input: {
  uid: string;
  choice: "granted" | "denied";
  surface?: string;
  nowISO?: string;
}): Promise<AnalyticsConsent> {
  const uid = (input.uid || "").trim();
  if (!uid) throw new Error("analytics consent needs an account id");
  const record: AnalyticsConsent = {
    uid,
    choice: input.choice,
    version: CONSENT_VERSION,
    at: input.nowISO || new Date().toISOString(),
    ...(input.surface ? { surface: input.surface.slice(0, 60) } : {}),
  };
  if (adminConfigured && adminDb) {
    await adminDb.collection(COLLECTION).doc(uid).set(record, { merge: false });
  } else {
    mem.set(uid, record);
  }
  return record;
}

/**
 * A stored document, CHECKED rather than cast.
 *
 * `snap.data() as AnalyticsConsent` is the programmer promising the compiler
 * something nobody verified, and the thing being promised here is "this person
 * agreed to have their data sent to Meta". A document written by an older
 * version, half-written, or edited by hand must read as NO CONSENT, not as a
 * grant with a missing field. Modelled on `jobFromStored` in `video-jobs.ts`.
 */
export function consentFromStored(uid: string, raw: unknown): AnalyticsConsent | null {
  if (!raw || typeof raw !== "object") return null;
  const d: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const choice = d.choice;
  if (choice !== "granted" && choice !== "denied") return null;
  if (typeof d.version !== "string" || !d.version) return null;
  if (typeof d.at !== "string" || !d.at) return null;
  return {
    uid,
    choice,
    version: d.version,
    at: d.at,
    ...(typeof d.surface === "string" ? { surface: d.surface } : {}),
  };
}

export async function analyticsConsentFor(uid: string): Promise<AnalyticsConsent | null> {
  const id = (uid || "").trim();
  if (!id) return null;
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    return consentFromStored(id, snap.data());
  }
  return mem.get(id) ?? null;
}

export type ReportPermission = { ok: boolean; why: string };

/**
 * May the server report this account's conversion?
 *
 * EVERY ANSWER IS A REFUSAL EXCEPT ONE, and each refusal names itself so a
 * missing conversion is never a mystery.
 */
export async function mayReportConversions(uid: string | null | undefined): Promise<ReportPermission> {
  const id = (uid || "").trim();
  if (!id) {
    return { ok: false, why: "no account on this payment, so there is no consent record to check — a conversion is not reported for somebody we cannot ask." };
  }

  // NO STORE IS A REFUSAL, NOT A FALLBACK, and this is the one place the
  // in-memory map must not stand in. A serverless instance's memory is empty on
  // every cold start, so "nothing in the map" would read as "no consent" some of
  // the time and, if the default were ever flipped the other way, would send
  // without one the rest of the time. In production a consent we cannot read is
  // a consent we do not have. Development keeps the map so the path is
  // exercisable with no Firebase.
  if (!adminConfigured && process.env.NODE_ENV === "production") {
    return { ok: false, why: "no durable consent store on this deployment (Firebase Admin is not configured), so no consent can be proved — nothing is sent to Meta." };
  }

  const consent = await analyticsConsentFor(id);
  if (!consent) {
    return { ok: false, why: "this account has not made a cookie choice while signed in, so there is no consent to send on." };
  }
  if (consent.choice !== "granted") {
    return { ok: false, why: "this account refused analytics cookies. The server respects that exactly as the browser does." };
  }
  if (consent.version !== CONSENT_VERSION) {
    return { ok: false, why: `the consent on file is for ${consent.version} and the current purposes are ${CONSENT_VERSION} — an old yes does not cover a new use.` };
  }
  return { ok: true, why: `analytics consent granted ${consent.at}` };
}
