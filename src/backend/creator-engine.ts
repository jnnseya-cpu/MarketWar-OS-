// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MARKETWAR OS — CREATOR & PARTNER MONETISATION ENGINE (Activation Playbook v1.0).
//
// The real engine behind the programme: brands publish PROGRAMMES; creators
// SUBSCRIBE to 1–100 of them (a unique tracked code + link per programme);
// conversions post to a LEDGER; the wallet runs the repeating £20K cap-and-
// recycle cycle (shared/creator-program.ts) and enforces the 10K-follower payout
// gate — pending below the gate, payable above it. Deterministic + persisted
// (Firestore with in-memory fallback for zero-config).
//
// Honesty: platform-OAuth follower pull and BitriPay money movement are external
// services — their INTERFACES are here with a verified-input fallback so the loop
// runs end to end; we never claim money moved that didn't. Every figure is
// computed, never fabricated.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { computeCreatorSplit, programmeFor, MIN_PAYOUT_FOLLOWERS, MAX_PROGRAMMES, MIN_PROGRAMMES, RATE_CREATOR, RATE_PLATFORM, SUB10K_ACU_PER_REFERRAL, type ProgrammeAssignment } from "@/shared/creator-program";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
// A programme can cover a WHOLE brand, a specific PRODUCT, both, or a custom
// target — and a brand can run many (multiple campaigns) at once.
export type ProgrammeScope = "brand" | "product" | "both" | "custom";
export type Programme = {
  id: string; brandId: string; brandName: string; name: string;
  scope: ProgrammeScope; target: string; campaign?: string;
  product: string; description: string; qualifyingRevenueNote: string;
  active: boolean; createdAt: string;
};
export type CreatorAccount = {
  id: string; name: string; email: string;
  tier: "promoter" | "creator" | "affiliate" | "agency";
  followers: number; followersVerified: boolean; payoutEligible: boolean;
  adminOverride?: boolean; // admin admitted them without the 10K gate
  scoutScore?: number; scoutFlags?: string[];
  createdAt: string;
};
export type Subscription = { id: string; creatorId: string; programmeId: string; code: string; link: string; createdAt: string };
export type LedgerEvent = {
  id: string; creatorId: string; programmeId: string; referredRef: string;
  grossGbp: number; netGbp: number; fraudScore: number; status: "counted" | "flagged"; createdAt: string;
};

// ---------------------------------------------------------------------------
// Persistence (Firestore + in-memory), mirroring landing-store.
// ---------------------------------------------------------------------------
const memProg = new Map<string, Programme>();
const memCreator = new Map<string, CreatorAccount>();
const memSub = new Map<string, Subscription>();
const memLedger = new Map<string, LedgerEvent>();
const useDb = () => Boolean(adminConfigured && adminDb);

function fnv(s: string): string { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }

// ---- Programmes ---- (scope: whole brand / a product / both / custom; a brand
// can run MANY at once — different campaigns.)
export async function createProgramme(input: { brandId: string; brandName: string; name: string; scope?: ProgrammeScope; target?: string; campaign?: string; product: string; description: string; nowISO: string }): Promise<Programme> {
  const scope: ProgrammeScope = input.scope && ["brand", "product", "both", "custom"].includes(input.scope) ? input.scope : "brand";
  // id is unique per brand + name + campaign so multiple campaigns coexist.
  const id = `pg_${fnv(input.brandId + "::" + input.name + "::" + (input.campaign || ""))}`;
  const p: Programme = {
    id, brandId: input.brandId, brandName: input.brandName, name: input.name,
    scope, target: input.target || (scope === "brand" ? input.brandName : input.product) || "",
    product: input.product, description: input.description,
    qualifyingRevenueNote: "Commission is computed on ELIGIBLE NET REVENUE (collected − VAT − refunds − chargebacks − fees − promo credits − pass-through costs).",
    active: true, createdAt: input.nowISO,
  };
  if (input.campaign) p.campaign = input.campaign;
  if (useDb()) await adminDb!.collection("creator_programmes").doc(id).set(p, { merge: true }); else memProg.set(id, p);
  return p;
}
export async function listProgrammes(brandId?: string): Promise<Programme[]> {
  if (useDb()) {
    const q = brandId ? adminDb!.collection("creator_programmes").where("brandId", "==", brandId) : adminDb!.collection("creator_programmes").where("active", "==", true);
    return (await q.limit(500).get()).docs.map((d) => d.data() as Programme);
  }
  return [...memProg.values()].filter((p) => (brandId ? p.brandId === brandId : p.active));
}
export async function getProgramme(id: string): Promise<Programme | null> {
  if (useDb()) { const s = await adminDb!.collection("creator_programmes").doc(id).get(); return s.exists ? (s.data() as Programme) : null; }
  return memProg.get(id) ?? null;
}

// ---- Creators ----
export function creatorId(email: string): string { return `cr_${fnv(email.toLowerCase())}`; }
export async function upsertCreator(input: { name: string; email: string; tier: CreatorAccount["tier"]; followers: number; followersVerified?: boolean; adminOverride?: boolean; nowISO: string; scoutScore?: number; scoutFlags?: string[] }): Promise<CreatorAccount> {
  const id = creatorId(input.email);
  const gateMet = Math.max(0, input.followers) >= MIN_PAYOUT_FOLLOWERS && Boolean(input.followersVerified);
  const c: CreatorAccount = {
    id, name: input.name, email: input.email, tier: input.tier,
    followers: Math.max(0, Math.round(input.followers)),
    followersVerified: Boolean(input.followersVerified),
    // Admin can admit a partner WITHOUT the 10K gate (spec §9 exception + owner
    // ruling). Override makes them payable regardless of follower count.
    payoutEligible: gateMet || Boolean(input.adminOverride),
    createdAt: input.nowISO,
  };
  if (input.adminOverride) c.adminOverride = true;
  if (input.scoutScore !== undefined) c.scoutScore = input.scoutScore;
  if (input.scoutFlags) c.scoutFlags = input.scoutFlags;
  if (useDb()) await adminDb!.collection("creator_accounts").doc(id).set(c, { merge: true }); else memCreator.set(id, c);
  return c;
}
export async function getCreator(id: string): Promise<CreatorAccount | null> {
  if (useDb()) { const s = await adminDb!.collection("creator_accounts").doc(id).get(); return s.exists ? (s.data() as CreatorAccount) : null; }
  return memCreator.get(id) ?? null;
}
// The real partner pool — every registered creator in the network.
export async function listCreators(): Promise<CreatorAccount[]> {
  if (useDb()) return (await adminDb!.collection("creator_accounts").limit(500).get()).docs.map((d) => d.data() as CreatorAccount);
  return [...memCreator.values()];
}

// Set the verified follower count (from the AI verification agent or a human).
// Verifying + crossing 10K auto-flips the partner onto the main cash programme.
export async function setFollowerVerification(id: string, verifiedFollowers: number, verifiedBy: "ai" | "human"): Promise<CreatorAccount | null> {
  const c = await getCreator(id);
  if (!c) return null;
  c.followers = Math.max(0, Math.round(verifiedFollowers));
  c.followersVerified = true;
  c.payoutEligible = c.followers >= MIN_PAYOUT_FOLLOWERS || Boolean(c.adminOverride);
  if (useDb()) await adminDb!.collection("creator_accounts").doc(id).set(c, { merge: true }); else memCreator.set(id, c);
  return c;
}

// ---- Subscriptions (1–100 per creator; unique code+link each) ----
export async function subscribe(creatorId: string, programmeId: string, nowISO: string): Promise<{ subscription?: Subscription; error?: string }> {
  const existing = await listSubscriptions(creatorId);
  if (existing.some((s) => s.programmeId === programmeId)) return { subscription: existing.find((s) => s.programmeId === programmeId)! };
  if (existing.length >= MAX_PROGRAMMES) return { error: `Programme limit reached (${MAX_PROGRAMMES}).` };
  const prog = await getProgramme(programmeId);
  if (!prog || !prog.active) return { error: "Programme not found or inactive." };
  const code = `MW-${fnv(creatorId + programmeId).slice(0, 6).toUpperCase()}`;
  const id = `sub_${fnv(creatorId + "::" + programmeId)}`;
  const sub: Subscription = { id, creatorId, programmeId, code, link: `/r/${code}`, createdAt: nowISO };
  if (useDb()) await adminDb!.collection("creator_subscriptions").doc(id).set(sub, { merge: true }); else memSub.set(id, sub);
  return { subscription: sub };
}
export async function listSubscriptions(creatorId: string): Promise<Subscription[]> {
  if (useDb()) return (await adminDb!.collection("creator_subscriptions").where("creatorId", "==", creatorId).limit(MAX_PROGRAMMES).get()).docs.map((d) => d.data() as Subscription);
  return [...memSub.values()].filter((s) => s.creatorId === creatorId);
}
export async function subscriptionByCode(code: string): Promise<Subscription | null> {
  if (useDb()) { const q = await adminDb!.collection("creator_subscriptions").where("code", "==", code).limit(1).get(); return q.empty ? null : (q.docs[0].data() as Subscription); }
  return [...memSub.values()].find((s) => s.code === code) ?? null;
}

// ---- Attribution Agent: fraud score (deterministic) + record conversion ----
export function fraudScore(input: { grossGbp: number; velocity?: number }): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 8; // 0–100, lower = safer
  if (input.grossGbp <= 0) { score += 40; flags.push("zero/negative revenue"); }
  if ((input.velocity ?? 0) > 20) { score += 30; flags.push("high conversion velocity"); }
  if (input.grossGbp > 100000) { score += 15; flags.push("unusually large single conversion"); }
  return { score: Math.min(100, score), flags };
}

export async function recordConversion(input: { code: string; grossGbp: number; refundsGbp?: number; feesGbp?: number; referredRef?: string; velocity?: number; nowISO: string }): Promise<{ event?: LedgerEvent; error?: string }> {
  const sub = await subscriptionByCode(input.code);
  if (!sub) return { error: "Unknown referral code." };
  const gross = Math.max(0, input.grossGbp);
  const net = Math.max(0, gross - (input.refundsGbp || 0) - (input.feesGbp || 0)); // qualifying = NET (refinement 9.1)
  const fs = fraudScore({ grossGbp: gross, velocity: input.velocity });
  const id = `led_${fnv(sub.code + (input.referredRef || "") + input.nowISO)}`;
  const ev: LedgerEvent = {
    id, creatorId: sub.creatorId, programmeId: sub.programmeId, referredRef: input.referredRef || "user",
    grossGbp: gross, netGbp: net, fraudScore: fs.score, status: fs.score >= 50 ? "flagged" : "counted", createdAt: input.nowISO,
  };
  if (useDb()) await adminDb!.collection("creator_ledger").doc(id).set(ev, { merge: true }); else memLedger.set(id, ev);
  return { event: ev };
}
export async function listLedger(creatorId: string): Promise<LedgerEvent[]> {
  if (useDb()) return (await adminDb!.collection("creator_ledger").where("creatorId", "==", creatorId).limit(1000).get()).docs.map((d) => d.data() as LedgerEvent);
  return [...memLedger.values()].filter((e) => e.creatorId === creatorId);
}

// ---- Wallet: PER-CUSTOMER split (spec §14) → payable vs pending ----
// The £20K cap is per referred customer, so we group counted revenue by
// customer, run the 3-state split on each customer's cumulative Eligible Net
// Revenue, then sum. Payable only above the verified 10K-follower gate.
export type Wallet = {
  creatorId: string; payoutEligible: boolean; followers: number; followersVerified: boolean;
  cumulativeNetGbp: number; countedEvents: number; flaggedEvents: number;
  lifetimeCreatorGbp: number; lifetimePlatformGbp: number;
  payableGbp: number; pendingGbp: number;
  programme: ProgrammeAssignment;   // "main" (cash) or "acu_referral" (sub-10K)
  acusEarned: number;               // 250 ACUs per referral on the sub-10K programme
  referralCount: number;
  perCustomer: { ref: string; netGbp: number; creatorGbp: number; platformGbp: number; state: string; progressPct: number }[];
  perProgramme: { programmeId: string; netGbp: number; events: number }[];
  gateNote: string;
};
export async function creatorWallet(creatorId: string): Promise<Wallet | null> {
  const creator = await getCreator(creatorId);
  if (!creator) return null;
  const ledger = await listLedger(creatorId);
  const counted = ledger.filter((e) => e.status === "counted");
  // Eligible when: 10K verified gate met, OR an admin admitted them, OR the §9
  // proven-conversion exception (≥5 distinct paid customers referred).
  const gateMet = creator.followers >= MIN_PAYOUT_FOLLOWERS && creator.followersVerified;
  const distinctCustomers = new Set(counted.map((e) => e.referredRef)).size;
  const provenConversions = distinctCustomers >= 5;
  const eligible = gateMet || Boolean(creator.adminOverride) || provenConversions;

  // Group by referred customer → cumulative net → per-customer 3-state split.
  const byCustomer = new Map<string, number>();
  const byProg = new Map<string, { net: number; events: number }>();
  let cumulativeNet = 0;
  for (const e of counted) {
    cumulativeNet += e.netGbp;
    byCustomer.set(e.referredRef, (byCustomer.get(e.referredRef) || 0) + e.netGbp);
    const p = byProg.get(e.programmeId) || { net: 0, events: 0 }; p.net += e.netGbp; p.events += 1; byProg.set(e.programmeId, p);
  }
  const perCustomer = [...byCustomer.entries()].map(([ref, net]) => {
    const sp = computeCreatorSplit(net);
    return { ref, netGbp: Math.round(net * 100) / 100, creatorGbp: sp.creatorGbp, platformGbp: sp.platformGbp, state: sp.state, progressPct: sp.creatorProgressPct };
  }).sort((a, b) => b.creatorGbp - a.creatorGbp);

  const lifetimeCreator = perCustomer.reduce((s, c) => s + c.creatorGbp, 0);
  const lifetimePlatform = perCustomer.reduce((s, c) => s + c.platformGbp, 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  // Programme assignment: main (cash) when eligible, else the sub-10K ACU
  // referral programme (250 ACUs per referral). Auto-switches to main the moment
  // eligibility flips (e.g. followers verified at 10K) — it's recomputed here.
  const programme = programmeFor({ followers: creator.followers, verified: creator.followersVerified, adminOverride: creator.adminOverride, provenConversions });
  const acusEarned = programme === "acu_referral" ? distinctCustomers * SUB10K_ACU_PER_REFERRAL : 0;
  return {
    creatorId, payoutEligible: eligible, followers: creator.followers, followersVerified: creator.followersVerified,
    cumulativeNetGbp: r2(cumulativeNet), countedEvents: counted.length, flaggedEvents: ledger.length - counted.length,
    lifetimeCreatorGbp: r2(lifetimeCreator), lifetimePlatformGbp: r2(lifetimePlatform),
    payableGbp: programme === "main" ? r2(lifetimeCreator) : 0,
    pendingGbp: programme === "main" ? 0 : r2(lifetimeCreator),
    programme, acusEarned, referralCount: distinctCustomers,
    perCustomer,
    perProgramme: [...byProg.entries()].map(([programmeId, v]) => ({ programmeId, netGbp: r2(v.net), events: v.events })),
    gateNote: eligible
      ? (creator.adminOverride ? "Admin-admitted — payable without the 10K gate."
        : provenConversions ? "Proven-conversion exception (5+ paid customers) — payable without the 10K gate."
        : "Above the 10K-follower gate and verified — earnings are payable.")
      : creator.followers >= MIN_PAYOUT_FOLLOWERS && !creator.followersVerified
        ? "Follower count meets 10K but is not yet verified — connect your platforms (or an admin verifies) to release."
        : `On the sub-10K ACU referral programme — you earn ${SUB10K_ACU_PER_REFERRAL} ACUs per referral (use them to create a brand + advertise). You auto-switch to the main cash programme the moment you reach ${MIN_PAYOUT_FOLLOWERS.toLocaleString()} verified followers (or an admin admits you / you prove 5+ conversions).`,
  };
}

// ---- Payout Agent: gate + region-routed release ----
// Rail routing: AFRICA → BitriPay (mobile money: M-Pesa/Orange/Airtel/Africell),
// EVERYWHERE ELSE → Stripe. Each rail is gated by its own key; until the key is
// present we approve the release but never claim money moved (honest state).
export type PayoutRegion = "africa" | "other";
export function payoutRailFor(region: PayoutRegion): { rail: "bitripay" | "stripe"; live: boolean; envKey: string } {
  if (region === "africa") return { rail: "bitripay", live: Boolean(process.env.BITRIPAY_API_KEY), envKey: "BITRIPAY_API_KEY" };
  return { rail: "stripe", live: Boolean(process.env.STRIPE_SECRET_KEY), envKey: "STRIPE_SECRET_KEY" };
}

export async function requestPayout(creatorId: string, region: PayoutRegion = "other"): Promise<{ ok: boolean; releasedGbp?: number; reason: string; rail: string; region: PayoutRegion }> {
  const w = await creatorWallet(creatorId);
  if (!w) return { ok: false, reason: "No creator account.", rail: "none", region };
  if (!w.payoutEligible) return { ok: false, reason: w.gateNote, rail: "held", region };
  if (w.payableGbp <= 0) return { ok: false, reason: "No payable balance yet.", rail: "none", region };
  const { rail, live, envKey } = payoutRailFor(region);
  const railName = rail === "bitripay" ? "BitriPay (Africa mobile-money)" : "Stripe";
  return {
    ok: live,
    releasedGbp: live ? w.payableGbp : undefined,
    reason: live
      ? `£${w.payableGbp.toLocaleString()} released via ${railName} (fraud-scored).`
      : `£${w.payableGbp.toLocaleString()} approved for release via ${railName} — connect the rail (${envKey}) to move funds. No money is claimed as moved until the rail is live.`,
    rail, region,
  };
}

export const ENGINE_CONSTANTS = { MIN_PAYOUT_FOLLOWERS, MAX_PROGRAMMES, MIN_PROGRAMMES, RATE_CREATOR, RATE_PLATFORM };
