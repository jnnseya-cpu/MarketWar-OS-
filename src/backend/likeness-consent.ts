// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Consent to use a person's face or voice — recorded, scoped, and revocable.
//
// WHY THIS EXISTS BEFORE THE AVATARS DO. `rights-guard.ts` already knows the
// right questions — `face_consent`, `voice_consent`, `model_release` — but it
// checks them against an object handed to it by the caller. Nothing stored a
// consent, so nothing could prove one, and the honest consequence was that
// voice cloning stayed switched off with a note saying "gated on a consent
// record we do not yet capture". This is that record.
//
// It matters more than a checkbox because a synthetic face or voice is a
// person's likeness. In the UK that engages UK GDPR (biometric-adjacent
// personal data, needing a lawful basis and a purpose limit), the ASA's rules
// on misleading endorsement, and passing-off if the person is recognisable. In
// the EU the AI Act adds a transparency duty on synthetic media. None of that
// is satisfied by a tickbox on an upload form.
//
// SO A CONSENT HERE IS FOUR THINGS, AND ALL FOUR ARE REQUIRED:
//   1. WHO — a named person, and how we know they agreed (the evidence).
//   2. WHAT — face, voice, or both. Never inferred from one to the other.
//   3. WHERE AND HOW LONG — territories, platforms, an expiry date. Consent
//      without a scope is not consent, it is a signature on a blank page.
//   4. REVOCABLE — withdrawn takes effect immediately, and the record of the
//      withdrawal is kept. A person who changes their mind must not have to
//      argue about whether they did.
//
// Anything not covered is REFUSED rather than assumed. That is the difference
// between a consent record and a liability record.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type LikenessKind = "face" | "voice";

/** How we know they agreed. A claim with no evidence is not a record. */
export type ConsentEvidence =
  | "signed-release"      // a document the customer holds
  | "recorded-statement"  // the person saying so, on camera or audio
  | "written-agreement"   // email or contract naming the use
  | "self"                // the customer is the person
  ;

export type LikenessConsent = {
  id: string;
  brandId: string;
  /** The person. Stored so a withdrawal can be matched to a subject. */
  personName: string;
  personRef?: string;        // an email or internal id, if the customer has one
  kinds: LikenessKind[];
  evidence: ConsentEvidence;
  evidenceNote?: string;
  /** ISO-3166 alpha-2, or ["*"] for worldwide — stated, never assumed. */
  territories: string[];
  /** Platform names, or ["*"]. */
  platforms: string[];
  /** Paid advertising is a distinct permission from organic use. */
  paidAds: boolean;
  grantedAt: string;
  expiresAt: string;         // consent without an end is not scoped
  revokedAt?: string;
  revokedReason?: string;
};

const COLLECTION = "likeness_consents";
const mem = new Map<string, LikenessConsent[]>();
const useDb = () => Boolean(adminConfigured && adminDb);
const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

// A year, unless the customer says otherwise. Long enough to be useful, short
// enough that a forgotten consent expires rather than running for ever.
export const DEFAULT_TERM_DAYS = 365;

export type RecordInput = {
  brandId: string;
  personName: string;
  personRef?: string;
  kinds: LikenessKind[];
  evidence: ConsentEvidence;
  evidenceNote?: string;
  territories?: string[];
  platforms?: string[];
  paidAds?: boolean;
  nowISO: string;
  termDays?: number;
};

export type RecordResult =
  | { ok: true; consent: LikenessConsent }
  | { ok: false; error: string };

export async function recordConsent(input: RecordInput): Promise<RecordResult> {
  const brandId = (input.brandId || "").trim();
  const personName = (input.personName || "").trim();
  if (!brandId) return { ok: false, error: "brandId required" };
  if (!personName) return { ok: false, error: "Name the person who consented. A consent that does not say whose likeness it covers protects nobody." };

  const kinds = Array.from(new Set((input.kinds || []).filter((k): k is LikenessKind => k === "face" || k === "voice")));
  if (!kinds.length) return { ok: false, error: "Say what was consented to — face, voice, or both. Consent to one is never consent to the other." };

  const evidences: ConsentEvidence[] = ["signed-release", "recorded-statement", "written-agreement", "self"];
  if (!evidences.includes(input.evidence)) {
    return { ok: false, error: `Say how you know they agreed: ${evidences.join(", ")}. A claim with no evidence is not a record.` };
  }

  const territories = (input.territories || []).map((t) => t.trim().toUpperCase()).filter(Boolean);
  const platforms = (input.platforms || []).map((p) => p.trim()).filter(Boolean);
  if (!territories.length) return { ok: false, error: "State the territories, or \"*\" for worldwide. Consent without a scope is a signature on a blank page." };
  if (!platforms.length) return { ok: false, error: "State the platforms, or \"*\" for any." };

  const termDays = Math.max(1, Math.min(3650, Math.round(input.termDays || DEFAULT_TERM_DAYS)));
  const granted = new Date(input.nowISO);
  if (Number.isNaN(granted.getTime())) return { ok: false, error: "Invalid date." };
  const expires = new Date(granted.getTime() + termDays * 86_400_000).toISOString();

  const consent: LikenessConsent = {
    id: `${brandId}::${hid(personName.toLowerCase() + "|" + kinds.join(",") + "|" + input.nowISO)}`,
    brandId,
    personName,
    personRef: (input.personRef || "").trim() || undefined,
    kinds,
    evidence: input.evidence,
    evidenceNote: (input.evidenceNote || "").trim() || undefined,
    territories,
    platforms,
    paidAds: input.paidAds === true,
    grantedAt: input.nowISO,
    expiresAt: expires,
  };

  const list = mem.get(brandId) || [];
  list.push(consent);
  mem.set(brandId, list);
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(consent.id.replace(/\//g, "_")).set(consent); } catch { /* memory copy serves this instance */ }
  }
  return { ok: true, consent };
}

export async function listConsents(brandId: string): Promise<LikenessConsent[]> {
  const local = mem.get(brandId) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(COLLECTION).where("brandId", "==", brandId).limit(500).get();
    const rows = snap.docs.map((d) => d.data() as LikenessConsent);
    const byId = new Map<string, LikenessConsent>();
    for (const c of [...rows, ...local]) byId.set(c.id, c);
    return Array.from(byId.values());
  } catch {
    return [...local];
  }
}

// Withdrawal takes effect immediately and is KEPT. A person who changes their
// mind must never have to argue about whether they did.
export async function revokeConsent(brandId: string, consentId: string, nowISO: string, reason?: string): Promise<boolean> {
  const list = await listConsents(brandId);
  const found = list.find((c) => c.id === consentId);
  if (!found) return false;
  const revoked: LikenessConsent = { ...found, revokedAt: nowISO, revokedReason: (reason || "").trim() || undefined };
  mem.set(brandId, [...list.filter((c) => c.id !== consentId), revoked]);
  if (useDb()) {
    try { await adminDb!.collection(COLLECTION).doc(consentId.replace(/\//g, "_")).set(revoked); } catch { /* memory copy holds */ }
  }
  return true;
}

// ---------------------------------------------------------------------------
// The gate
//
// Everything that synthesises a face or a voice asks this, and a "no" is a
// refusal with the reason — never a warning to click past.
// ---------------------------------------------------------------------------
export type ConsentQuery = {
  brandId: string;
  personName: string;
  kind: LikenessKind;
  territory?: string;
  platform?: string;
  paidAd?: boolean;
  nowISO: string;
};

export type ConsentVerdict =
  | { allowed: true; consent: LikenessConsent; note: string }
  | { allowed: false; reason: string };

const covers = (list: string[], want?: string) =>
  !want || list.includes("*") || list.map((x) => x.toUpperCase()).includes(want.toUpperCase());

export async function consentFor(q: ConsentQuery): Promise<ConsentVerdict> {
  const name = (q.personName || "").trim().toLowerCase();
  if (!name) return { allowed: false, reason: "No person named, so there is no consent to check." };

  const all = await listConsents(q.brandId);
  const mine = all.filter((c) => c.personName.trim().toLowerCase() === name);
  if (!mine.length) {
    return { allowed: false, reason: `No consent on record for ${q.personName}. Record one — with evidence, territories, platforms and an end date — before their ${q.kind} is synthesised.` };
  }

  const now = new Date(q.nowISO).getTime();
  for (const c of mine) {
    if (!c.kinds.includes(q.kind)) continue;
    if (c.revokedAt) continue;
    if (new Date(c.expiresAt).getTime() <= now) continue;
    if (!covers(c.territories, q.territory)) continue;
    if (!covers(c.platforms, q.platform)) continue;
    if (q.paidAd && !c.paidAds) continue;
    return {
      allowed: true,
      consent: c,
      note: `Covered by the consent recorded ${c.grantedAt.slice(0, 10)} (${c.evidence}), expiring ${c.expiresAt.slice(0, 10)}.`,
    };
  }

  // There IS a record, and it does not cover this. Say which part failed —
  // "no consent" would send them to collect one they already have.
  const forKind = mine.filter((c) => c.kinds.includes(q.kind));
  if (!forKind.length) return { allowed: false, reason: `${q.personName} consented to ${mine.flatMap((c) => c.kinds).join(" and ")}, not ${q.kind}. Consent to one is never consent to the other.` };
  const live = forKind.filter((c) => !c.revokedAt && new Date(c.expiresAt).getTime() > now);
  if (!live.length) {
    const revoked = forKind.some((c) => c.revokedAt);
    return { allowed: false, reason: revoked ? `${q.personName} withdrew consent. It stops applying from the moment it was withdrawn.` : `The consent for ${q.personName} has expired. Renew it with them before using their ${q.kind} again.` };
  }
  if (q.paidAd && !live.some((c) => c.paidAds)) return { allowed: false, reason: `${q.personName} consented to organic use, not to paid advertising. Paid is a separate permission and has to be asked for separately.` };
  if (q.territory && !live.some((c) => covers(c.territories, q.territory))) return { allowed: false, reason: `The consent covers ${live.flatMap((c) => c.territories).join(", ")} — not ${q.territory}.` };
  if (q.platform && !live.some((c) => covers(c.platforms, q.platform))) return { allowed: false, reason: `The consent covers ${live.flatMap((c) => c.platforms).join(", ")} — not ${q.platform}.` };
  return { allowed: false, reason: "A consent exists but does not cover this use." };
}

// What a synthetic likeness must carry when it is published. Stated here so
// every surface that renders one gets the same sentence.
export const SYNTHETIC_DISCLOSURE =
  "This video uses a synthetic face and/or voice. Say so on the creative. The EU AI Act requires synthetic media to be disclosed, the ASA treats an undisclosed synthetic endorsement as misleading, and a viewer who finds out later treats it as a lie about everything else in the ad.";

export function __resetLikenessConsents(): void { mem.clear(); }
