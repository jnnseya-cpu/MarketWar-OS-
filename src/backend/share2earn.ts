// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar SHARE2EARN™ — post, move your audience, earn.
//
// The pitch is right and the pitch is the easy part: you should not need 100,000
// followers to be worth paying, because 350 people who trust you are worth more
// than 80,000 who scroll past. So this has NO follower gate at all. Anyone can
// take a mission.
//
// WHAT MAKES IT HARD IS THAT IT IS A PAYOUT SYSTEM POINTED AT THE PUBLIC.
// Every other module here can be wrong and cost an ACU. This one can be wrong
// and cost real money to people who will organise, screenshot and share exactly
// how they gamed it. So three rules govern the whole module, and they are the
// reason it is built the way it is rather than the way the mockup looks.
//
//   1. WE ONLY PAY FOR WHAT WE COUNT OURSELVES. A click on our link, a lead in
//      our ledger, a sale attributed to a code — those are ours and they are
//      countable. A "qualified view" on TikTok is not: we cannot see it, the
//      creator can screenshot anything, and paying per view is how every
//      share-to-earn scheme in history got farmed to death within a month. Views
//      are payable ONLY from a connected account's own API, and until one is
//      connected the reward says so instead of quietly not paying.
//
//   2. A BOUNTY THAT IS NOT FUNDED IS NOT OFFERED. "Top 10 creators → £100 pool"
//      is a debt the moment it is displayed. The brand's money is reserved
//      before the mission goes live, and a mission that cannot be funded does
//      not publish. Nobody finds out afterwards that the pool was decorative.
//
//   3. EVERY NUMBER SHOWN TO A CREATOR IS COUNTED OR LABELLED. No match
//      percentage that is really a hash, no "estimated £18–£42" for somebody
//      with no history. Where there is not enough history to say, it says that.
//
// The commission rate is not decided here — `shared/creator-program.ts` owns the
// whole ladder, and SHARE2EARN's rate is derived as the minimum of its own cap
// and the lowest influencer band so it can never overtake the programme it sits
// beneath.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import {
  bandById, ratePct, SHARE2EARN_RATE, SHARE2EARN_RATE_CAP,
  share2earnNeverPaysMore, COMMISSION_BANDS,
} from "@/shared/creator-program";
import {
  economicsFor, waterfall, campaignLimits,
  type OfferEconomics, type Economics, type CampaignLimits,
} from "@/backend/profit-guard-economics";

// ---------------------------------------------------------------------------
// The seven ways to earn, and which of them we can honestly pay today
// ---------------------------------------------------------------------------
export type EarnActionId =
  | "content_published" | "qualified_engagement" | "traffic" | "lead"
  | "signup" | "sale" | "mission_bounty";

export type EarnAction = {
  id: EarnActionId;
  label: string;
  /** How the platform knows it happened. The honest core of the whole module. */
  measuredBy: string;
  /** False when we cannot count it ourselves — it then needs a connected account. */
  payableNow: boolean;
  /** Why not, in words a creator can act on. */
  blockedReason?: string;
  /** Fixed pence per unit, or null when it is a percentage of revenue. */
  pencePerUnit: number | null;
  /** Per creator, per mission, per day — the cheapest brake on farming. */
  dailyUnitCap: number;
};

export const EARN_ACTIONS: EarnAction[] = [
  {
    id: "content_published", label: "Content published and verified", pencePerUnit: 25, dailyUnitCap: 3,
    measuredBy: "The post URL you submit is fetched and must still resolve 48 hours later. Posting and deleting pays nothing.",
    payableNow: true,
  },
  {
    id: "qualified_engagement", label: "Qualified engagement", pencePerUnit: 2, dailyUnitCap: 500,
    measuredBy: "Views, likes and shares reported by the platform's OWN API for an account you connected.",
    payableNow: false,
    blockedReason: "We cannot see engagement on an account we are not connected to, and a screenshot is not a measurement. Connect the account and this unlocks; until then nothing is paid for it rather than paid on trust.",
  },
  {
    id: "traffic", label: "Traffic you sent", pencePerUnit: 3, dailyUnitCap: 400,
    measuredBy: "Clicks on your own tracked link, deduplicated by visitor and stripped of known bots.",
    payableNow: true,
  },
  {
    id: "lead", label: "Verified lead", pencePerUnit: 60, dailyUnitCap: 40,
    measuredBy: "A lead recorded in the brand's results ledger against your code, with a contactable address.",
    payableNow: true,
  },
  {
    id: "signup", label: "Signup or install", pencePerUnit: 90, dailyUnitCap: 40,
    measuredBy: "An account created against your code that survives the brand's own duplicate check.",
    payableNow: true,
  },
  {
    id: "sale", label: "Sale", pencePerUnit: null, dailyUnitCap: 100,
    measuredBy: `A sale in the brand's results ledger attributed to your code — paid as ${ratePct(SHARE2EARN_RATE)} of eligible net revenue.`,
    payableNow: true,
  },
  {
    id: "mission_bounty", label: "Mission bounty", pencePerUnit: null, dailyUnitCap: 10,
    measuredBy: "A target set by the brand and met by counted actions. The money is reserved before the mission is published.",
    payableNow: true,
  },
];

export const earnAction = (id: EarnActionId): EarnAction | null => EARN_ACTIONS.find((a) => a.id === id) || null;
export const payableActions = (): EarnAction[] => EARN_ACTIONS.filter((a) => a.payableNow);

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------
export type MissionKind =
  | "create_and_earn" | "share_and_earn" | "bring_a_friend" | "viral_challenge"
  | "local_mission" | "sell_and_earn" | "review_and_earn" | "event_mission"
  | "launch_squad" | "ambassador";

export const MISSION_KINDS: { id: MissionKind; label: string; asks: string }[] = [
  { id: "create_and_earn", label: "Create & Earn", asks: "Make an original piece of content for the brand." },
  { id: "share_and_earn", label: "Share & Earn", asks: "Put the brand's own creative in front of your audience." },
  { id: "bring_a_friend", label: "Bring a Friend", asks: "Get someone you know to sign up." },
  { id: "viral_challenge", label: "Viral Challenge", asks: "A timed challenge with a leaderboard." },
  { id: "local_mission", label: "Local Mission", asks: "Something that only works if you are physically there." },
  { id: "sell_and_earn", label: "Sell & Earn", asks: "Drive an actual purchase." },
  { id: "review_and_earn", label: "Review & Earn", asks: "Review a product you genuinely bought or were given." },
  { id: "event_mission", label: "Event Mission", asks: "Fill an event." },
  { id: "launch_squad", label: "Launch Squad", asks: "Be part of a coordinated launch day." },
  { id: "ambassador", label: "Ambassador", asks: "An ongoing relationship rather than one post." },
];

export type Reward = { actionId: EarnActionId; units: number; pencePerUnit?: number; bonusPence?: number; label: string };

export type Mission = {
  id: string;
  brandId: string;
  kind: MissionKind;
  title: string;
  brief: string;
  platforms: string[];
  rewards: Reward[];
  /** Everything the brand could owe if every creator maxed out. Reserved up front. */
  budgetPence: number;
  reservedPence: number;
  paidPence: number;
  opensAt: string;
  closesAt: string;
  live: boolean;
  /** Disclosure is not optional on paid promotion. */
  disclosure: string;
  createdAt: string;
  /** The unit economics this mission was cleared against, when supplied. */
  economics?: Economics;
  limits?: CampaignLimits;
  /** Prepaid budget, or funded out of the transactions themselves. */
  fundingMode: "prepaid" | "revenue_locked";
};

export const DISCLOSURE =
  "This is paid promotion. Say so on the post itself — #ad or 'paid partnership' where the platform provides it. The ASA and the FTC both require it, and the liability sits with the person who posted.";

/**
 * The maximum this mission can cost if everyone hits every target.
 *
 * Computed rather than estimated, because it is the number the reservation is
 * made against. A mission whose worst case is unknown is a mission whose bill is
 * unknown.
 */
export function worstCasePence(rewards: Reward[], expectedCreators: number): number {
  const perCreator = rewards.reduce((sum, r) => {
    const unit = r.pencePerUnit ?? earnAction(r.actionId)?.pencePerUnit ?? 0;
    return sum + unit * Math.max(0, r.units) + (r.bonusPence || 0);
  }, 0);
  return perCreator * Math.max(1, expectedCreators);
}

export type MissionDraft = {
  brandId: string;
  kind: MissionKind;
  title: string;
  brief: string;
  platforms?: string[];
  rewards: Reward[];
  budgetPence: number;
  expectedCreators: number;
  opensAt: string;
  closesAt: string;
  nowISO: string;
  /**
   * The offer's unit economics.
   *
   * Optional ONLY so an activity-reward mission with no sale in it still works.
   * The moment a mission rewards a sale, this becomes mandatory — paying
   * commission on a transaction whose margin nobody has stated is exactly the
   * thing ProfitGuard exists to prevent.
   */
  offer?: OfferEconomics;
  fundingMode?: "prepaid" | "revenue_locked";
};

export type MissionResult =
  | { ok: true; mission: Mission; note: string }
  | { ok: false; error: string; hint?: string };

export async function createMission(d: MissionDraft): Promise<MissionResult> {
  const title = (d.title || "").trim();
  if (!d.brandId?.trim()) return { ok: false, error: "brandId required" };
  if (!title) return { ok: false, error: "A mission needs a title — it is the first thing a creator reads." };
  if (!d.rewards?.length) return { ok: false, error: "A mission with no reward is an unpaid request. Say what it pays." };

  // Only actions we can actually count may carry a reward.
  const unpayable = d.rewards.filter((r) => !earnAction(r.actionId)?.payableNow);
  if (unpayable.length) {
    const a = earnAction(unpayable[0].actionId);
    return {
      ok: false,
      error: `${a?.label || unpayable[0].actionId} cannot be paid yet. ${a?.blockedReason || ""}`.trim(),
      hint: `Rewards available now: ${payableActions().map((x) => x.label).join(", ")}.`,
    };
  }

  const opens = new Date(d.opensAt).getTime(), closes = new Date(d.closesAt).getTime();
  if (Number.isNaN(opens) || Number.isNaN(closes)) return { ok: false, error: "Invalid opening or closing date." };
  if (closes <= opens) return { ok: false, error: "The mission closes before it opens." };

  // RULE 4: a sale reward requires the offer's economics. Without them nobody —
  // not the brand, not us — knows whether the commission fits inside the margin,
  // and "we will work it out later" is how a campaign eats a business.
  const paysOnSale = d.rewards.some((r) => r.actionId === "sale" || r.actionId === "mission_bounty");
  const fundingMode = d.fundingMode || (paysOnSale ? "revenue_locked" : "prepaid");
  let economics: Economics | undefined;
  let limits: CampaignLimits | undefined;

  if (paysOnSale) {
    if (!d.offer) {
      return {
        ok: false,
        error: "This mission pays on a sale, so it needs the offer's economics: price, cost of goods, fulfilment, payment fees, tax, returns allowance and the margin you are protecting.",
        hint: "ProfitGuard computes the Safe Reward Ceiling from those. Without them a commission is a number somebody hoped was affordable.",
      };
    }
    economics = economicsFor(d.offer);
    limits = campaignLimits(economics, { targetCustomers: d.expectedCreators });

    // The waterfall, per transaction. The creator's reward plus our fee plus the
    // reserve must fit inside the growth pool — never inside the protected margin.
    const perSale = d.rewards.filter((r) => r.actionId === "sale")
      .reduce((sum, r) => sum + (r.pencePerUnit ?? 0) + (r.bonusPence || 0), 0);
    const platformFee = Math.round(perSale * 0.25);
    const reserve = Math.round(perSale * 0.1);
    const flow = waterfall(d.offer, { creatorPence: perSale, platformPence: platformFee, reservePence: reserve, squadPence: 0 });
    if (!flow.ok) {
      return { ok: false, error: `ProfitGuard refused this mission. ${flow.error}`, hint: flow.hint };
    }
  }

  // RULE 2: the money is reserved before anybody is told about it.
  //
  // Revenue-Locked missions fund the sale portion out of the transaction itself,
  // so only the activity rewards (clicks, leads, content) need cash up front —
  // which is the whole point of Cash-Protected Growth for a business without a
  // marketing budget. Everything else still has to be funded.
  const worst = fundingMode === "revenue_locked"
    ? worstCasePence(d.rewards.filter((r) => r.actionId !== "sale"), d.expectedCreators)
    : worstCasePence(d.rewards, d.expectedCreators);
  if (d.budgetPence < worst) {
    return {
      ok: false,
      error: `This mission can owe £${(worst / 100).toFixed(2)} if ${Math.max(1, d.expectedCreators)} creators hit every target, and £${(d.budgetPence / 100).toFixed(2)} is budgeted.`,
      hint: "Raise the budget, cut the rewards, or cap how many creators can join. A bounty that is displayed is a debt — creators will have done the work by the time the money runs out, and 'the pool was decorative' is the one thing this system cannot survive.",
    };
  }

  const mission: Mission = {
    id: `m_${hid(`${d.brandId}|${title}|${d.nowISO}`)}`,
    brandId: d.brandId.trim(), kind: d.kind, title,
    brief: (d.brief || "").trim(),
    platforms: (d.platforms || []).filter(Boolean),
    rewards: d.rewards,
    budgetPence: d.budgetPence,
    reservedPence: worst,
    paidPence: 0,
    opensAt: d.opensAt, closesAt: d.closesAt,
    live: true,
    disclosure: DISCLOSURE,
    createdAt: d.nowISO,
    economics, limits, fundingMode,
  };
  await saveMission(mission);
  return {
    ok: true, mission,
    note: fundingMode === "revenue_locked"
      ? `Live. £${(worst / 100).toFixed(2)} reserved for the activity rewards; the sale commission is funded out of each transaction, so nothing leaves your account before the customer's money arrives.${economics ? ` ProfitGuard cleared it: £${(economics.growthPoolPence / 100).toFixed(2)} of every £${(economics.pricePence / 100).toFixed(2)} order is available for acquisition, and your £${(economics.protectedMarginPence / 100).toFixed(2)} protected margin is never reachable.` : ""}`
      : `Live. £${(worst / 100).toFixed(2)} of the £${(d.budgetPence / 100).toFixed(2)} budget is reserved against the worst case, so every reward on the card is money that already exists.`,
  };
}

// ---------------------------------------------------------------------------
// Earnings — tracked → verified → approved → payable
//
// The states are not decoration. A click is TRACKED the moment it happens,
// VERIFIED once it survives dedupe and bot-stripping, APPROVED once the fraud
// checks pass and the hold has elapsed, and only then is it money. Paying at
// "tracked" is how these systems get drained.
// ---------------------------------------------------------------------------
export type EarningState = "tracked" | "verified" | "approved" | "paid" | "rejected";

export type Earning = {
  id: string;
  brandId: string;
  creatorId: string;
  missionId: string;
  actionId: EarnActionId;
  units: number;
  pence: number;
  state: EarningState;
  reason?: string;
  at: string;
};

/** How long an approved-looking earning waits before it can be withdrawn. */
export const HOLD_DAYS = 14;

export type Wallet = { availablePence: number; pendingPence: number; lifetimePence: number; rejectedPence: number };

export function walletFrom(earnings: Earning[], nowISO: string): Wallet {
  const now = new Date(nowISO).getTime();
  let available = 0, pending = 0, lifetime = 0, rejected = 0;
  for (const e of earnings) {
    if (e.state === "rejected") { rejected += e.pence; continue; }
    if (e.state === "paid") { lifetime += e.pence; continue; }
    lifetime += e.pence;
    const held = now - new Date(e.at).getTime() < HOLD_DAYS * 86_400_000;
    if (e.state === "approved" && !held) available += e.pence;
    else pending += e.pence;
  }
  return { availablePence: available, pendingPence: pending, lifetimePence: lifetime, rejectedPence: rejected };
}

// ---------------------------------------------------------------------------
// Creator Trust — the fraud checks
//
// Not a score out of a hundred. A list of things that either happened or did
// not, each with what it means, so a suspended creator can be told exactly what
// tripped and can argue with a fact rather than with a number.
// ---------------------------------------------------------------------------
export type Signal = { id: string; hit: boolean; severity: "block" | "review" | "note"; what: string };

export type FraudInput = {
  creatorId: string;
  /** Distinct visitor fingerprints behind the clicks claimed. */
  clicks: number;
  distinctVisitors: number;
  /** Conversions whose buyer details match the creator's own. */
  selfPurchases: number;
  conversions: number;
  /** Accounts sharing this creator's device or IP. */
  sharedDeviceAccounts: number;
  /** Posts submitted for payment that no longer resolve. */
  postsSubmitted: number;
  postsStillLive: number;
  accountAgeDays: number;
};

export function trustSignals(f: FraudInput): { signals: Signal[]; verdict: "clear" | "review" | "blocked"; why: string } {
  const dupRatio = f.clicks > 0 ? 1 - f.distinctVisitors / f.clicks : 0;
  const deadPosts = f.postsSubmitted - f.postsStillLive;

  const signals: Signal[] = [
    { id: "self_purchase", hit: f.selfPurchases > 0, severity: "block",
      what: `${f.selfPurchases} conversion(s) match your own details. Buying through your own link is not a referral, and it is the single most common way these programmes are drained.` },
    { id: "click_duplication", hit: f.clicks >= 30 && dupRatio > 0.7, severity: "block",
      what: `${f.clicks} clicks from ${f.distinctVisitors} distinct visitors — ${Math.round(dupRatio * 100)}% repeats. Traffic is paid per person reached, not per refresh.` },
    { id: "shared_device", hit: f.sharedDeviceAccounts >= 3, severity: "review",
      what: `${f.sharedDeviceAccounts} other creator accounts share this device or address. That is allowed — households and campuses are real — but it is checked by a person before payout.` },
    { id: "deleted_content", hit: deadPosts > 0 && deadPosts >= Math.ceil(f.postsSubmitted / 2), severity: "review",
      what: `${deadPosts} of ${f.postsSubmitted} submitted posts no longer resolve. Posting for the check and deleting afterwards pays nothing.` },
    { id: "new_account", hit: f.accountAgeDays < 3, severity: "note",
      what: "This account is less than three days old, so the first payout waits for the full hold period." },
    { id: "impossible_rate", hit: f.conversions > 0 && f.clicks > 0 && f.conversions / f.clicks > 0.6 && f.clicks >= 20, severity: "review",
      what: `${f.conversions} conversions from ${f.clicks} clicks. That rate is possible but rare enough to check rather than assume.` },
  ];

  const hits = signals.filter((s) => s.hit);
  const blocked = hits.some((s) => s.severity === "block");
  const review = hits.some((s) => s.severity === "review");
  return {
    signals,
    verdict: blocked ? "blocked" : review ? "review" : "clear",
    why: blocked
      ? `Payout stopped: ${hits.filter((s) => s.severity === "block").map((s) => s.what).join(" ")}`
      : review
        ? "Held for a human check. Nothing is lost — it is reviewed, not rejected."
        : "Nothing flagged.",
  };
}

// ---------------------------------------------------------------------------
// Creator Score — counted, with a denominator, and it refuses to guess
//
// The whole point of the score is that a creator with 800 followers converting
// at 12% should beat one with 80,000 converting at nothing. That only works if
// it is measured. Below a real volume it returns null and says why, because a
// score computed over four clicks is a number pretending to be a judgement.
// ---------------------------------------------------------------------------
export const MIN_ACTIONS_TO_SCORE = 25;

export type CreatorScore = {
  score: number | null;
  of: 1000;
  components: { label: string; value: string; points: number; max: number }[];
  note: string;
};

export function creatorScore(input: {
  clicks: number; conversions: number; leads: number;
  missionsAccepted: number; missionsCompleted: number;
  postsSubmitted: number; postsStillLive: number;
  fraudVerdict?: "clear" | "review" | "blocked";
}): CreatorScore {
  const totalActions = input.clicks + input.conversions + input.leads;
  if (totalActions < MIN_ACTIONS_TO_SCORE) {
    return {
      score: null, of: 1000, components: [],
      note: `${totalActions} counted action(s). A score needs ${MIN_ACTIONS_TO_SCORE} before it means anything — below that it would be measuring luck. Keep going; nothing is lost.`,
    };
  }

  const convRate = input.clicks > 0 ? (input.conversions + input.leads) / input.clicks : 0;
  const completion = input.missionsAccepted > 0 ? input.missionsCompleted / input.missionsAccepted : 0;
  const kept = input.postsSubmitted > 0 ? input.postsStillLive / input.postsSubmitted : 1;

  const components = [
    { label: "Conversion rate", value: `${input.conversions + input.leads} results from ${input.clicks} clicks (${Math.round(convRate * 100)}%)`, points: Math.round(Math.min(1, convRate / 0.1) * 450), max: 450 },
    { label: "Missions finished", value: `${input.missionsCompleted} of ${input.missionsAccepted} accepted`, points: Math.round(completion * 250), max: 250 },
    { label: "Content kept up", value: `${input.postsStillLive} of ${input.postsSubmitted} still live`, points: Math.round(kept * 200), max: 200 },
    { label: "Volume", value: `${totalActions} counted actions`, points: Math.round(Math.min(1, totalActions / 500) * 100), max: 100 },
  ];
  const raw = components.reduce((a, c) => a + c.points, 0);
  const penalty = input.fraudVerdict === "blocked" ? raw : input.fraudVerdict === "review" ? Math.round(raw * 0.25) : 0;

  return {
    score: Math.max(0, raw - penalty), of: 1000, components,
    note: penalty
      ? "Reduced while the trust checks are resolved. It returns when they clear."
      : "Every component is a count over your own results — followers are not an input, because they are not a result.",
  };
}

// ---------------------------------------------------------------------------
// Squads
// ---------------------------------------------------------------------------
export type Squad = { id: string; name: string; ownerId: string; memberIds: string[]; createdAt: string };
export const MAX_SQUAD_MEMBERS = 25;

/** A squad's earnings are the sum of what its members actually earned. Nothing is invented for the group. */
export function squadTotals(members: { creatorId: string; earnings: Earning[] }[], nowISO: string) {
  const rows = members.map((m) => ({ creatorId: m.creatorId, wallet: walletFrom(m.earnings, nowISO) }))
    .sort((a, b) => b.wallet.lifetimePence - a.wallet.lifetimePence);
  return {
    members: rows,
    lifetimePence: rows.reduce((a, r) => a + r.wallet.lifetimePence, 0),
    note: "A squad total is the sum of what its members earned individually. Joining a squad does not create money — it is a leaderboard, and any squad bonus is a funded mission reward like any other.",
  };
}

// ---------------------------------------------------------------------------
// What a creator is told they might earn
//
// The mockup said "Potentiel estimé : £18–£42". For somebody with no history
// that is a forecast presented as a fact, and it is the fastest way to make the
// whole product feel like a scam when it does not happen. So this returns a
// RANGE ONLY when there is history to compute it from, and otherwise returns the
// mission's actual maximum with the arithmetic shown.
// ---------------------------------------------------------------------------
export function earningOutlook(mission: Mission, history: { clicks: number; conversions: number; missionsCompleted: number } | null) {
  const maxPence = worstCasePence(mission.rewards, 1);
  if (!history || history.missionsCompleted < 3) {
    return {
      maxPence,
      estimatePence: null,
      line: `Up to £${(maxPence / 100).toFixed(2)} if you hit every target on this mission.`,
      basis: "No estimate of what you personally will earn — you have not finished enough missions for that to be anything but a guess, and a guess dressed as a forecast is how people end up disappointed.",
    };
  }
  const rate = history.clicks > 0 ? history.conversions / history.clicks : 0;
  const est = Math.round(maxPence * Math.min(1, Math.max(0.15, rate * 4)));
  return {
    maxPence,
    estimatePence: est,
    line: `Up to £${(maxPence / 100).toFixed(2)}. On your last ${history.missionsCompleted} missions you converted ${Math.round(rate * 100)}% of clicks, which on this one works out around £${(est / 100).toFixed(2)}.`,
    basis: `Computed from your own ${history.clicks} clicks and ${history.conversions} conversions. It is an estimate from your history, not a promise.`,
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
const MISSIONS = "share2earn_missions";
const EARNINGS = "share2earn_earnings";
const memMissions = new Map<string, Mission[]>();
const memEarnings = new Map<string, Earning[]>();
const useDb = () => Boolean(adminConfigured && adminDb);
const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const key = (brandId: string, id: string) => `${createHash("sha256").update(brandId).digest("hex").slice(0, 24)}_${id}`;

export async function saveMission(m: Mission): Promise<void> {
  const list = (memMissions.get(m.brandId) || []).filter((x) => x.id !== m.id);
  memMissions.set(m.brandId, [m, ...list]);
  if (useDb()) { try { await adminDb!.collection(MISSIONS).doc(key(m.brandId, m.id)).set(m); } catch { /* memory serves this instance */ } }
}

export async function listMissions(brandId: string): Promise<Mission[]> {
  const local = memMissions.get(brandId) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(MISSIONS).where("brandId", "==", brandId).limit(200).get();
    const byId = new Map<string, Mission>();
    for (const m of [...snap.docs.map((d) => d.data() as Mission), ...local]) byId.set(m.id, m);
    return Array.from(byId.values());
  } catch { return [...local]; }
}

export async function recordEarning(e: Earning): Promise<void> {
  const list = (memEarnings.get(e.creatorId) || []).filter((x) => x.id !== e.id);
  memEarnings.set(e.creatorId, [e, ...list]);
  if (useDb()) { try { await adminDb!.collection(EARNINGS).doc(key(e.creatorId, e.id)).set(e); } catch { /* memory serves this instance */ } }
}

export async function listEarnings(creatorId: string): Promise<Earning[]> {
  const local = memEarnings.get(creatorId) || [];
  if (!useDb()) return [...local];
  try {
    const snap = await adminDb!.collection(EARNINGS).where("creatorId", "==", creatorId).limit(500).get();
    const byId = new Map<string, Earning>();
    for (const e of [...snap.docs.map((d) => d.data() as Earning), ...local]) byId.set(e.id, e);
    return Array.from(byId.values());
  } catch { return [...local]; }
}

/**
 * Every earning owed BY one brand.
 *
 * The store is keyed by creator, because a creator reading their own wallet is
 * the common path. A brand needs the other axis — what it owes across everyone —
 * and without this it would have to be assembled in the route from a list the
 * browser supplied, which is a number the payer would be computing about itself.
 */
export async function brandEarnings(brandId: string, limit = 1000): Promise<Earning[]> {
  const local = [...memEarnings.values()].flat().filter((e) => e.brandId === brandId);
  if (!useDb()) return local.slice(0, limit);
  try {
    const snap = await adminDb!.collection(EARNINGS).where("brandId", "==", brandId).limit(limit).get();
    const byId = new Map<string, Earning>();
    for (const e of [...snap.docs.map((d) => d.data() as Earning), ...local]) byId.set(e.id, e);
    return [...byId.values()];
  } catch { return local.slice(0, limit); }
}

export function __resetShare2Earn(): void { memMissions.clear(); memEarnings.clear(); }

export const SHARE2EARN_DOCTRINE = [
  `SHARE2EARN pays ${ratePct(SHARE2EARN_RATE)} of eligible net revenue on a sale — capped at ${ratePct(SHARE2EARN_RATE_CAP)} and never above the influencer programme it sits beneath, which currently pays ${COMMISSION_BANDS.filter((b) => b.programme === "influencer").map((b) => ratePct(b.creatorRate)).join(" and ")}. The rate is derived from that ladder rather than typed in, so it cannot overtake it by accident.`,
  "There is no follower gate. 350 people who trust you are worth more than 80,000 who scroll past, and the Creator Score measures results rather than reach — followers are not an input to it.",
  "We pay for what we count ourselves: clicks on your link, leads and sales in the brand's ledger, and posts that are still up when we check. Engagement on an account we are not connected to is not payable, because a screenshot is not a measurement — and a programme that pays for unverifiable numbers gets farmed within a month.",
  "Every bounty is funded before the mission is published. A reward on the card is money that already exists.",
  DISCLOSURE,
];

// The invariant is asserted where the module is used, not merely documented.
export function ladderIsSane(): { ok: boolean; reason: string } {
  if (!share2earnNeverPaysMore()) {
    return { ok: false, reason: "SHARE2EARN is configured to pay more than an influencer band, or above its own cap. Payouts are refused until the ladder is corrected." };
  }
  return { ok: true, reason: `SHARE2EARN pays ${ratePct(bandById("share2earn").creatorRate)}; the lowest influencer band pays ${ratePct(Math.min(...COMMISSION_BANDS.filter((b) => b.programme === "influencer").map((b) => b.creatorRate)))}.` };
}

// ---------------------------------------------------------------------------
// Net Eligible Sale Value
//
// The 0.5% is NOT taken off the checkout total, and the difference is not
// pedantry — it is the difference between a commission the merchant can afford
// and one that quietly pays creators out of tax it is holding for HMRC.
//
// Excluded: tax, delivery, tips, gift cards, and anything else that is not the
// product. Money the merchant never keeps cannot fund a commission.
// ---------------------------------------------------------------------------
export type SaleLines = {
  checkoutTotalPence: number;
  productPence: number;
  taxPence?: number;
  deliveryPence?: number;
  tipPence?: number;
  giftCardPence?: number;
  otherExcludedPence?: number;
  refundedPence?: number;
  cancelled?: boolean;
};

export type EligibleValue = {
  eligiblePence: number;
  excludedPence: number;
  breakdown: { label: string; pence: number }[];
  note: string;
};

export function netEligibleValue(s: SaleLines): EligibleValue {
  const n = (v?: number) => Math.max(0, Math.round(v || 0));
  if (s.cancelled) {
    return {
      eligiblePence: 0,
      excludedPence: n(s.checkoutTotalPence),
      breakdown: [{ label: "Cancelled order", pence: 0 }],
      note: "The order was cancelled, so there is no eligible value and no commission.",
    };
  }
  const excludedLines = [
    { label: "Tax", pence: n(s.taxPence) },
    { label: "Delivery", pence: n(s.deliveryPence) },
    { label: "Tip", pence: n(s.tipPence) },
    { label: "Gift card", pence: n(s.giftCardPence) },
    { label: "Other excluded", pence: n(s.otherExcludedPence) },
    { label: "Refunded", pence: n(s.refundedPence) },
  ].filter((l) => l.pence > 0);

  const eligible = Math.max(0, n(s.productPence) - n(s.refundedPence));
  const excluded = Math.max(0, n(s.checkoutTotalPence) - eligible);

  return {
    eligiblePence: eligible,
    excludedPence: excluded,
    breakdown: [{ label: "Product value", pence: n(s.productPence) }, ...excludedLines.map((l) => ({ ...l, pence: -l.pence }))],
    note: excluded > 0
      ? `£${(eligible / 100).toFixed(2)} of the £${(n(s.checkoutTotalPence) / 100).toFixed(2)} checkout is commissionable. Tax, delivery, tips and gift cards are money the merchant never keeps, so they cannot fund a commission.`
      : `The whole £${(eligible / 100).toFixed(2)} is product value.`,
  };
}

/** The creator's cut of one verified sale. */
export function saleCommissionPence(eligiblePence: number): number {
  return Math.round(Math.max(0, eligiblePence) * SHARE2EARN_RATE);
}

// ---------------------------------------------------------------------------
// Product eligibility
//
// OWNER RULING, AND IT IS THE RIGHT ONE: where 0.5% would make a transaction
// commercially unsafe, the product is marked INELIGIBLE rather than the
// creator's rate being quietly reduced. If the product promises 0.5%, a creator
// gets 0.5% on everything MarketWar marks eligible — a headline rate that
// silently becomes 0.2% on some products is a headline rate nobody can trust.
// ---------------------------------------------------------------------------
export type Eligibility = {
  eligible: boolean;
  commissionPence: number;
  ratePct: number;
  reason: string;
  /** What the merchant would have to change for it to qualify. */
  fix?: string;
};

export function productEligible(input: {
  eligiblePence: number;
  /** ProfitGuard's numbers for this offer. */
  contributionPence: number;
  growthPoolPence: number;
  /** The GrowthGuard allowance this transaction creates. */
  growthGuardAllowancePence: number;
}): Eligibility {
  const commission = saleCommissionPence(input.eligiblePence);
  const ratePct = Math.round(SHARE2EARN_RATE * 10000) / 100;

  if (input.eligiblePence <= 0) {
    return { eligible: false, commissionPence: 0, ratePct, reason: "There is no commissionable product value in this sale." };
  }
  if (input.contributionPence <= 0) {
    return {
      eligible: false, commissionPence: 0, ratePct,
      reason: "This product contributes nothing after its variable costs, so no commission of any size can be funded from it.",
      fix: "Raise the price or cut a variable cost. The problem is the product's economics, not the channel.",
    };
  }
  if (commission > input.growthPoolPence) {
    return {
      eligible: false, commissionPence: 0, ratePct,
      reason: `${ratePct}% of this sale is £${(commission / 100).toFixed(2)}, and only £${(input.growthPoolPence / 100).toFixed(2)} is available for acquisition once costs and the protected margin are taken out. Paying it would lose money on the transaction.`,
      fix: "Not eligible for SHARE2EARN. That is deliberate: the rate is not quietly reduced, because a headline rate that silently becomes something smaller is a rate nobody can trust.",
    };
  }
  if (commission > input.growthGuardAllowancePence) {
    return {
      eligible: false, commissionPence: 0, ratePct,
      reason: `${ratePct}% of this sale is £${(commission / 100).toFixed(2)}, above the £${(input.growthGuardAllowancePence / 100).toFixed(2)} that GrowthGuard's 5% ceiling allows this transaction to fund.`,
      fix: "Not eligible. A thin-margin product cannot support a percentage of revenue, however small it looks next to the price.",
    };
  }
  const headroom = input.growthGuardAllowancePence - commission;
  return {
    eligible: true, commissionPence: commission, ratePct,
    reason: `Eligible. ${ratePct}% of £${(input.eligiblePence / 100).toFixed(2)} is £${(commission / 100).toFixed(2)}, inside both the £${(input.growthPoolPence / 100).toFixed(2)} acquisition pool and the £${(input.growthGuardAllowancePence / 100).toFixed(2)} GrowthGuard allowance.`,
    fix: headroom <= 0
      ? "The creator's commission consumes the entire GrowthGuard allowance for this sale, leaving nothing for the platform fee, reserve or bonuses. It is allowed, but there is no room for anything else."
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// XP — the engagement that does NOT eat the merchant's margin
//
// 0.5% on a cheap product is small, and the temptation is to top it up with cash
// for views and shares. That is the merchant's margin being spent on engagement
// that produced no sale. So everything short of a verified sale earns XP, rank
// and access instead: progression the platform can give away for nothing and a
// creator genuinely wants.
// ---------------------------------------------------------------------------
export type XpRule = { id: string; label: string; xp: number; per: string; cash: boolean };

export const XP_RULES: XpRule[] = [
  { id: "view_500", label: "500 verified views", xp: 50, per: "per 500, from a connected account only", cash: false },
  { id: "share", label: "Content shared and still live", xp: 20, per: "per post", cash: false },
  { id: "click", label: "Qualified click", xp: 2, per: "per click", cash: false },
  { id: "streak_day", label: "Daily streak", xp: 15, per: "per consecutive day", cash: false },
  { id: "lead", label: "Verified lead", xp: 60, per: "per lead", cash: false },
  { id: "sale", label: "Verified sale", xp: 200, per: "per sale, PLUS 0.5% of eligible value", cash: true },
];

export const LEVELS = [
  { id: "rookie", label: "Rookie", xp: 0, unlocks: "The open campaign feed." },
  { id: "creator", label: "Creator", xp: 500, unlocks: "Missions with bonuses attached." },
  { id: "rising", label: "Rising", xp: 2_000, unlocks: "Higher-value campaigns and early access to drops." },
  { id: "pro", label: "Pro", xp: 6_000, unlocks: "Premium campaigns and brand collaborations." },
  { id: "elite", label: "Elite", xp: 15_000, unlocks: "Direct brand proposals and ambassador offers." },
  { id: "icon", label: "Icon", xp: 40_000, unlocks: "Negotiated terms and named partnerships." },
];

export function levelFor(xp: number): { level: typeof LEVELS[number]; next: typeof LEVELS[number] | null; xpToNext: number } {
  const x = Math.max(0, Math.round(xp || 0));
  let level = LEVELS[0];
  for (const l of LEVELS) if (x >= l.xp) level = l;
  const next = LEVELS.find((l) => l.xp > x) || null;
  return { level, next, xpToNext: next ? next.xp - x : 0 };
}

export const XP_DOCTRINE =
  "Views, shares, clicks and streaks earn XP, rank and access — never cash. Cash comes from a verified sale, at 0.5% of the eligible product value. That is not meanness: paying cash for engagement that produced no sale spends the merchant's margin on nothing, and a channel that does that gets switched off, which costs every creator on it.";
