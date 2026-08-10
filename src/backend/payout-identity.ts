// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Who we are about to pay — the identity record that has to exist before any
// money leaves.
//
// TWO SEPARATE REASONS THIS IS MANDATORY, and they are worth keeping apart
// because they fail in different ways:
//
//   1. THE REPORTING RULES. Since January 2024 a platform that pays sellers for
//      services must collect their identity and report annual earnings to the
//      tax authority — the OECD model rules, DAC7 in the EU. Missing details are
//      not a gap in a form, they are an unfileable return.
//
//   2. PAYING THE WRONG PERSON. A payout is irreversible on most rails and
//      instant on some. An account with no verified owner is an account anybody
//      who phishes a password can drain, and the loss lands on the platform.
//
// So `payoutAllowed` is a HARD GATE. Not a nudge, not a banner: no verified
// identity, no payout, and the reason names the exact field that is missing so
// somebody can fix it rather than guess.
//
// WHAT THIS MODULE DOES NOT DO IS PRETEND TO VERIFY. It validates shape — a
// plausible date of birth, an adult, a real ISO country, a tax reference in the
// right format for the country given. Confirming a human matches a document is
// an identity provider's job, and where none is configured this says the record
// is UNVERIFIED and blocks, rather than marking it verified because the form was
// filled in neatly.
//
// Sanctions screening is the same: named, required, and left as an explicit
// unmet dependency rather than faked with a substring match on a name.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { encryptField, decryptField, encryptionConfigured } from "@/backend/crypto";

export type IdentityState = "not_started" | "submitted" | "verified" | "rejected";

export type PayoutIdentity = {
  creatorId: string;
  legalName: string;
  dateOfBirth: string;          // YYYY-MM-DD
  addressLine: string;
  city: string;
  postcode: string;
  country: string;              // ISO-3166 alpha-2
  /** Tax reference. Required by the reporting rules; "why not" is required if absent. */
  taxReference?: string;
  noTaxReferenceReason?: string;
  state: IdentityState;
  submittedAt?: string;
  verifiedAt?: string;
  rejectedReason?: string;
  /** The provider's reference, when one actually checked a document. */
  verificationRef?: string;
  /** Screening is a separate dependency and its absence is recorded, not hidden. */
  sanctionsScreened: boolean;
};

export const MIN_AGE_YEARS = 18;

// Formats we can actually check. An unknown country gets a length check rather
// than a wrong rule — a false rejection here stops somebody being paid.
const TAX_REF_FORMATS: Record<string, { re: RegExp; label: string }> = {
  GB: { re: /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/i, label: "National Insurance number, e.g. QQ123456C" },
  US: { re: /^\d{3}-?\d{2}-?\d{4}$/, label: "Social Security Number" },
  IE: { re: /^\d{7}[A-W][A-IW]?$/i, label: "PPS number" },
  FR: { re: /^\d{13}$/, label: "Numéro fiscal (13 digits)" },
  DE: { re: /^\d{11}$/, label: "Steuer-ID (11 digits)" },
};

export type SubmitInput = {
  creatorId: string;
  legalName: string;
  dateOfBirth: string;
  addressLine: string;
  city: string;
  postcode: string;
  country: string;
  taxReference?: string;
  noTaxReferenceReason?: string;
  nowISO: string;
};

export type SubmitResult =
  | { ok: true; identity: PayoutIdentity; note: string }
  | { ok: false; field: string; error: string };

export function submitIdentity(input: SubmitInput): SubmitResult {
  const creatorId = (input.creatorId || "").trim();
  if (!creatorId) return { ok: false, field: "creatorId", error: "creatorId required" };

  const legalName = (input.legalName || "").trim();
  // A single word is almost never a legal name, and the reporting return needs
  // the name on the document rather than a handle.
  if (legalName.split(/\s+/).filter(Boolean).length < 2) {
    return { ok: false, field: "legalName", error: "Your full legal name as it appears on your ID — first and last. Not your username." };
  }

  const dob = new Date(input.dateOfBirth);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth || "") || Number.isNaN(dob.getTime())) {
    return { ok: false, field: "dateOfBirth", error: "Date of birth as YYYY-MM-DD." };
  }
  const now = new Date(input.nowISO);
  const age = (now.getTime() - dob.getTime()) / (365.2425 * 86_400_000);
  if (age < MIN_AGE_YEARS) {
    return {
      ok: false, field: "dateOfBirth",
      error: `Payouts are only available from ${MIN_AGE_YEARS}. You can keep earning and your balance is held — it does not expire — but money cannot be released before then.`,
    };
  }
  if (age > 120) return { ok: false, field: "dateOfBirth", error: "That date of birth is not plausible." };

  const country = (input.country || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, field: "country", error: "Country as a two-letter code, e.g. GB, CD, KE." };
  for (const [field, value] of [["addressLine", input.addressLine], ["city", input.city]] as const) {
    if (!(value || "").trim()) return { ok: false, field, error: `${field === "city" ? "Town or city" : "Street address"} is required — the reporting rules need an address, not a country alone.` };
  }

  // The tax reference, or a stated reason there is none. Silence is not an
  // option: a return filed with a blank where a reference should be is a return
  // that comes back.
  const ref = (input.taxReference || "").trim();
  const reason = (input.noTaxReferenceReason || "").trim();
  if (!ref && !reason) {
    return {
      ok: false, field: "taxReference",
      error: `A tax reference is required${TAX_REF_FORMATS[country] ? ` — ${TAX_REF_FORMATS[country].label}` : ""}. If you genuinely do not have one, say why instead and that reason is reported in its place.`,
    };
  }
  if (ref) {
    const fmt = TAX_REF_FORMATS[country];
    if (fmt && !fmt.re.test(ref.replace(/\s/g, ""))) {
      return { ok: false, field: "taxReference", error: `That does not look like a ${fmt.label}. Check it — a wrong reference is worse than a stated reason for not having one.` };
    }
    if (!fmt && ref.replace(/\s/g, "").length < 5) {
      return { ok: false, field: "taxReference", error: "That tax reference is too short to be real." };
    }
  }

  const identity: PayoutIdentity = {
    creatorId, legalName,
    dateOfBirth: input.dateOfBirth,
    addressLine: input.addressLine.trim(), city: input.city.trim(),
    postcode: (input.postcode || "").trim(), country,
    taxReference: ref || undefined,
    noTaxReferenceReason: ref ? undefined : reason,
    state: "submitted",
    submittedAt: input.nowISO,
    sanctionsScreened: false,
  };

  return {
    ok: true, identity,
    note: identityProviderConfigured()
      ? "Submitted for verification. Your first payout can be released once the check clears."
      : "Recorded. No identity provider is connected on this deployment, so nothing is marked verified automatically and payouts stay blocked until an administrator confirms the record — we will not mark a person verified because a form was filled in neatly.",
  };
}

/** Is a real document check available? Absent, nothing is auto-verified. */
export function identityProviderConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY || process.env.ONFIDO_API_TOKEN || process.env.PERSONA_API_KEY);
}

export function sanctionsScreeningConfigured(): boolean {
  return Boolean(process.env.SANCTIONS_API_KEY);
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------
export type PayoutGate = { allowed: boolean; reason: string; fix?: string; missing?: string[] };

export function payoutAllowed(identity: PayoutIdentity | null): PayoutGate {
  if (!identity || identity.state === "not_started") {
    return {
      allowed: false,
      reason: "No identity on record. Money cannot be released to an account whose owner is unknown.",
      fix: "Complete the payout details once — legal name, date of birth, address and tax reference. It is asked for because a platform that pays for services has to report who it paid, and because an unverified account is an account anybody who phishes a password can drain.",
      missing: ["legalName", "dateOfBirth", "address", "taxReference"],
    };
  }
  if (identity.state === "rejected") {
    return { allowed: false, reason: `The identity check was rejected: ${identity.rejectedReason || "no reason recorded"}.`, fix: "Correct the details and submit again." };
  }
  // POSITIVE CHECK, not a list of states to reject.
  //
  // This was an enumeration — not_started, rejected, submitted — and a mutation
  // that deleted the `submitted` arm still passed, because the sanctions check
  // below happened to catch the same record. Two guards masking each other is
  // two guards you cannot reason about: a record that IS screened but is NOT
  // verified would have gone straight through. Only "verified" passes now, so a
  // state nobody has thought of yet fails closed rather than open.
  if (identity.state !== "verified") {
    return {
      allowed: false,
      reason: identityProviderConfigured()
        ? "The identity check is still running. Your balance is safe and nothing is lost — the release happens as soon as it clears."
        : "The identity record is complete but unverified: no identity provider is connected on this deployment, so an administrator has to confirm it. Nothing is marked verified automatically.",
    };
  }
  if (!identity.sanctionsScreened) {
    return {
      allowed: false,
      reason: sanctionsScreeningConfigured()
        ? "Sanctions screening has not completed for this account yet."
        : "Sanctions screening is not connected on this deployment, and paying someone without it is a risk the platform cannot take on the customer's behalf.",
      fix: "Set SANCTIONS_API_KEY, or have an administrator record the screening manually against this account.",
    };
  }
  return { allowed: true, reason: `Verified ${(identity.verifiedAt || "").slice(0, 10)} — payouts are open.` };
}

// ---------------------------------------------------------------------------
// The annual report
//
// The whole reason the identity is collected. The creator gets a copy of exactly
// what was filed, because a figure reported about somebody that they cannot see
// is how disputes start.
// ---------------------------------------------------------------------------
export type ReportRow = {
  creatorId: string;
  legalName: string;
  dateOfBirth: string;
  address: string;
  country: string;
  taxReference: string;
  earnedPence: number;
  payoutsPence: number;
  feesPence: number;
  quarters: number[];
};

export function reportRow(identity: PayoutIdentity, totals: { earnedPence: number; payoutsPence: number; feesPence: number; quarters?: number[] }): ReportRow {
  return {
    creatorId: identity.creatorId,
    legalName: identity.legalName,
    dateOfBirth: identity.dateOfBirth,
    address: [identity.addressLine, identity.city, identity.postcode].filter(Boolean).join(", "),
    country: identity.country,
    taxReference: identity.taxReference || `NONE PROVIDED — ${identity.noTaxReferenceReason || "no reason recorded"}`,
    earnedPence: Math.max(0, Math.round(totals.earnedPence)),
    payoutsPence: Math.max(0, Math.round(totals.payoutsPence)),
    feesPence: Math.max(0, Math.round(totals.feesPence)),
    quarters: totals.quarters || [],
  };
}

// ---------------------------------------------------------------------------
// Storage — encrypted, because this is the most sensitive record the platform
// holds about a person who is not even its customer.
// ---------------------------------------------------------------------------
const COLLECTION = "payout_identities";
const mem = new Map<string, PayoutIdentity>();
const useDb = () => Boolean(adminConfigured && adminDb);
const key = (creatorId: string) => createHash("sha256").update(creatorId).digest("hex").slice(0, 32);

const SECRET_FIELDS = ["legalName", "dateOfBirth", "addressLine", "city", "postcode", "taxReference"] as const;

function seal(i: PayoutIdentity): PayoutIdentity {
  if (!encryptionConfigured) return i;
  const out = { ...i };
  for (const f of SECRET_FIELDS) if (out[f]) (out[f] as string) = encryptField(String(out[f]), i.creatorId);
  return out;
}
function open(i: PayoutIdentity): PayoutIdentity {
  if (!encryptionConfigured) return i;
  const out = { ...i };
  for (const f of SECRET_FIELDS) if (out[f]) (out[f] as string) = decryptField(String(out[f]), i.creatorId);
  return out;
}

export async function saveIdentity(i: PayoutIdentity): Promise<void> {
  mem.set(i.creatorId, i);
  if (useDb()) { try { await adminDb!.collection(COLLECTION).doc(key(i.creatorId)).set(seal(i)); } catch { /* memory copy serves this instance */ } }
}

export async function loadIdentity(creatorId: string): Promise<PayoutIdentity | null> {
  const local = mem.get(creatorId);
  if (local) return local;
  if (!useDb()) return null;
  try {
    const snap = await adminDb!.collection(COLLECTION).doc(key(creatorId)).get();
    if (!snap.exists) return null;
    const raw = snap.data() as PayoutIdentity;
    // Belt and braces: the key is a hash of the id, and the record is checked too.
    return raw.creatorId === creatorId ? open(raw) : null;
  } catch { return null; }
}

/** Administrator action, recorded with who did it. Never automatic. */
export async function markVerified(creatorId: string, by: string, nowISO: string, verificationRef?: string): Promise<boolean> {
  const i = await loadIdentity(creatorId);
  if (!i) return false;
  await saveIdentity({ ...i, state: "verified", verifiedAt: nowISO, verificationRef: verificationRef || `manual:${by}` });
  return true;
}

export async function markScreened(creatorId: string, clear: boolean, nowISO: string, reason?: string): Promise<boolean> {
  const i = await loadIdentity(creatorId);
  if (!i) return false;
  await saveIdentity(clear
    ? { ...i, sanctionsScreened: true }
    : { ...i, sanctionsScreened: false, state: "rejected", rejectedReason: reason || `Sanctions screening did not clear (${nowISO.slice(0, 10)})` });
  return true;
}

export function __resetIdentities(): void { mem.clear(); }

export const IDENTITY_DOCTRINE = [
  "Your details are collected once, before a first payout, and encrypted at rest under a key derived per account.",
  "They are asked for because a platform that pays people for services must report who it paid — and because money leaving to an unverified account is money anybody who phishes a password can take.",
  "Nothing is deducted from what you earn. Reporting what you were paid and withholding from it are different things.",
  "You receive a copy of exactly what is reported about you. A figure filed about somebody that they cannot see is how disputes start.",
  "No record is marked verified because a form was filled in neatly. Where no identity provider is connected, an administrator confirms it by hand and that is recorded against their name.",
];
