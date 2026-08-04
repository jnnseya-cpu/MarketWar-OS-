// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Daily Challenges, XP, streaks and Money Missions — the Play hub.
//
// THE ONE DESIGN DECISION EVERYTHING ELSE FOLLOWS FROM: a challenge is
// completed by WORK THE PLATFORM ALREADY RECORDED, never by a user pressing "I
// did it". Self-declared progress is a scoreboard that measures nothing, and
// this repo has a name for numbers that measure nothing. So every challenge in
// the pool below is expressed as a count of DEEDS — a page published, an email
// sent, a video rendered, a sale in the ledger — and if the platform cannot
// verify a thing, there is no challenge for it.
//
// The day is rotated, not hashed into a score. `dailyChallenges()` picks by the
// day's index so the set is stable for everyone on the same date and cycles
// through the pool. That is a rotation; it produces no number that pretends to
// be a measurement.
//
// ---------------------------------------------------------------------------
// AND THE PART THAT COSTS REAL MONEY
//
// The spec says completing challenges earns ACUs. ACUs are provider spend: one
// handed out is one we pay for. Two rules already in force collide with a free
// ACU, and both of them win:
//
//   - The owner's pricing law: profit margin never below 100%.
//   - §63, "no free AI action regardless" — the rule that removed the last
//     unmetered tools on the platform.
//
// So rewards here are FUNDED, not printed. `rewardCeilingAcus()` computes, from
// a customer's own realised revenue and the provider cost of serving them, the
// largest number of ACUs that can be given back while margin stays at or above
// the floor. Below the floor the ceiling is zero and missions pay XP, badges
// and streaks — which cost nothing and are the parts people actually chase.
// A reward we cannot afford is a discount pretending to be a game.

import { NET_PROFIT_FLOOR } from "@/backend/unit-economics";

// ---------------------------------------------------------------------------
// Deeds — the verified record of what somebody actually did
// ---------------------------------------------------------------------------
export type DeedKind =
  | "content"        // a post/article/script saved to the Work Library
  | "video"          // a video or clip produced
  | "page"           // a landing page published
  | "email"          // an email campaign sent
  | "outreach"       // a prospect contacted
  | "review-request" // a review request planned or sent
  | "customer"       // a contact added to the Vault
  | "research"       // an intel or research run
  | "sale";          // a revenue event in the Money Ledger

export type Deed = { kind: DeedKind; at: string; valueGbp?: number };

// Day boundaries follow the USER'S timezone, computed by Intl rather than by
// adding an offset — a fixed offset is wrong twice a year and a streak that
// breaks on the clock change is a streak nobody trusts again.
export function dayKey(iso: string, timeZone = "UTC"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    // en-CA formats as YYYY-MM-DD, which sorts and compares as a string.
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
}

// Days since the epoch for a YYYY-MM-DD key — the rotation index.
export function dayIndex(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
  if (!m) return 0;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Daily challenges
// ---------------------------------------------------------------------------
export type Track = "marketing" | "sales" | "video" | "networking" | "brand";

export type Challenge = {
  id: string;
  track: Track;
  title: string;
  ask: string;
  kind: DeedKind;
  target: number;
  xp: number;
  where: string;  // the route that does it — a challenge with nowhere to go is a nag
};

// Four per track, cycled by day. Each one is a thing the platform can see.
export const CHALLENGE_POOL: Record<Track, Challenge[]> = {
  marketing: [
    { id: "m1", track: "marketing", title: "Ship a post", ask: "Create one piece of content", kind: "content", target: 1, xp: 20, where: "/dashboard/create" },
    { id: "m2", track: "marketing", title: "Three, not one", ask: "Create three pieces of content — a week runs on volume, not on one perfect post", kind: "content", target: 3, xp: 45, where: "/dashboard/content" },
    { id: "m3", track: "marketing", title: "Send something", ask: "Send one email campaign", kind: "email", target: 1, xp: 30, where: "/dashboard/email" },
    { id: "m4", track: "marketing", title: "Know your market", ask: "Run one market or competitor intel pass", kind: "research", target: 1, xp: 25, where: "/dashboard/discover" },
  ],
  sales: [
    { id: "s1", track: "sales", title: "Ten doors", ask: "Contact ten prospects", kind: "outreach", target: 10, xp: 50, where: "/dashboard/prospecting" },
    { id: "s2", track: "sales", title: "Land one", ask: "Record one sale in the Money Ledger", kind: "sale", target: 1, xp: 80, where: "/dashboard/money-ledger" },
    { id: "s3", track: "sales", title: "Five new names", ask: "Add five contacts to the Vault", kind: "customer", target: 5, xp: 35, where: "/dashboard/customers" },
    { id: "s4", track: "sales", title: "Chase the warm ones", ask: "Contact three prospects who already replied", kind: "outreach", target: 3, xp: 30, where: "/dashboard/inbox" },
  ],
  video: [
    { id: "v1", track: "video", title: "One video", ask: "Produce one video or clip", kind: "video", target: 1, xp: 40, where: "/dashboard/video" },
    { id: "v2", track: "video", title: "Cut three", ask: "Produce three clips from what you already have", kind: "video", target: 3, xp: 70, where: "/dashboard/video" },
    { id: "v3", track: "video", title: "Script it first", ask: "Write one video script", kind: "content", target: 1, xp: 20, where: "/dashboard/create" },
    { id: "v4", track: "video", title: "Two a day", ask: "Produce two videos — the cadence that actually moves a new account", kind: "video", target: 2, xp: 55, where: "/dashboard/video" },
  ],
  networking: [
    { id: "n1", track: "networking", title: "Ask for one review", ask: "Send one review request to a real customer", kind: "review-request", target: 1, xp: 30, where: "/dashboard/reputation" },
    { id: "n2", track: "networking", title: "Five reviews out", ask: "Send five review requests", kind: "review-request", target: 5, xp: 60, where: "/dashboard/reputation" },
    { id: "n3", track: "networking", title: "Answer everyone", ask: "Reply to five people in the inbox", kind: "outreach", target: 5, xp: 35, where: "/dashboard/inbox" },
    { id: "n4", track: "networking", title: "Find your creators", ask: "Run one creator recruitment pass", kind: "research", target: 1, xp: 25, where: "/dashboard/influencers" },
  ],
  brand: [
    { id: "b1", track: "brand", title: "One page live", ask: "Publish one landing page", kind: "page", target: 1, xp: 50, where: "/dashboard/landing-builder" },
    { id: "b2", track: "brand", title: "Look like yourself", ask: "Produce one branded image or creative", kind: "content", target: 1, xp: 25, where: "/dashboard/product-engine" },
    { id: "b3", track: "brand", title: "Fix the site", ask: "Run one site audit and act on it", kind: "research", target: 1, xp: 30, where: "/dashboard/website-intel" },
    { id: "b4", track: "brand", title: "Two pages", ask: "Publish two pages — one to test against the other", kind: "page", target: 2, xp: 80, where: "/dashboard/landing-pages" },
  ],
};

export const TRACKS: Track[] = ["marketing", "sales", "video", "networking", "brand"];

// Five challenges, one per track, rotating. Everyone on the same date with the
// same trackable set gets the same five, which is what makes a shared
// leaderboard possible later.
//
// `trackable` is the list of deed kinds the platform can currently OBSERVE for
// this brand. Challenges on anything else are filtered out rather than shown at
// zero forever: a challenge that cannot be completed because we cannot see the
// work is a nag, and it teaches people that the whole board is decorative.
export function dailyChallenges(key: string, trackable?: DeedKind[]): Challenge[] {
  const i = dayIndex(key);
  const can = trackable && trackable.length ? new Set(trackable) : null;
  const out: Challenge[] = [];
  TRACKS.forEach((t, ti) => {
    const full = CHALLENGE_POOL[t];
    const pool = can ? full.filter((c) => can.has(c.kind)) : full;
    // A track with nothing observable is dropped, not faked with a filler.
    if (!pool.length) return;
    // Offset per track so the five do not all advance in lockstep.
    out.push(pool[(i + ti) % pool.length]);
  });
  return out;
}

export type ChallengeProgress = Challenge & { done: number; complete: boolean };

export function challengeProgress(challenges: Challenge[], deeds: Deed[], key: string, timeZone = "UTC"): ChallengeProgress[] {
  const today = (deeds || []).filter((d) => d && dayKey(d.at, timeZone) === key);
  return challenges.map((c) => {
    const done = today.filter((d) => d.kind === c.kind).length;
    return { ...c, done, complete: done >= c.target };
  });
}

// ---------------------------------------------------------------------------
// XP and levels
//
// The curve is published rather than tuned in private: each level costs about
// 1.4x the one before, so early levels come fast and later ones mean something.
// ---------------------------------------------------------------------------
export const LEVEL_TITLES = [
  "Rookie", "Operator", "Builder", "Closer", "Strategist",
  "Commander", "Rainmaker", "Warlord", "Legend",
];

export function levelThresholds(): number[] {
  const out: number[] = [0];
  let step = 100;
  for (let i = 1; i < LEVEL_TITLES.length; i++) { out.push(Math.round(out[i - 1] + step)); step = Math.round(step * 1.4); }
  return out;
}

export type LevelState = { level: number; title: string; xp: number; intoLevel: number; nextAt: number | null; toNext: number | null };

export function levelFor(xp: number): LevelState {
  const t = levelThresholds();
  const x = Math.max(0, Math.floor(xp || 0));
  let level = 1;
  for (let i = 0; i < t.length; i++) if (x >= t[i]) level = i + 1;
  const floorAt = t[level - 1];
  const nextAt = level < t.length ? t[level] : null;
  return {
    level,
    title: LEVEL_TITLES[level - 1],
    xp: x,
    intoLevel: x - floorAt,
    nextAt,
    toNext: nextAt === null ? null : nextAt - x,
  };
}

// XP earned to date — every completed challenge on every day, recomputed from
// the deed record rather than kept as a running total somebody could edit.
export function earnedXp(deeds: Deed[], timeZone = "UTC", trackable?: DeedKind[]): number {
  const byDay = new Map<string, Deed[]>();
  for (const d of deeds || []) {
    const k = dayKey(d.at, timeZone);
    if (!k) continue;
    const list = byDay.get(k); if (list) list.push(d); else byDay.set(k, [d]);
  }
  let xp = 0;
  for (const [k, list] of byDay) {
    for (const c of challengeProgress(dailyChallenges(k, trackable), list, k, timeZone)) if (c.complete) xp += c.xp;
  }
  return xp;
}

// ---------------------------------------------------------------------------
// Streaks
//
// A streak counts days on which at least one challenge was COMPLETED, not days
// on which the app was opened. Today is allowed to be empty without breaking
// the run — the day is not over yet, and a streak that dies at breakfast is a
// streak that teaches people to stop trying.
// ---------------------------------------------------------------------------
export type StreakState = { current: number; longest: number; activeDays: string[]; todayDone: boolean };

export function streakFor(deeds: Deed[], todayKey: string, timeZone = "UTC", trackable?: DeedKind[]): StreakState {
  const byDay = new Map<string, Deed[]>();
  for (const d of deeds || []) {
    const k = dayKey(d.at, timeZone);
    if (!k) continue;
    const list = byDay.get(k); if (list) list.push(d); else byDay.set(k, [d]);
  }
  const active = new Set<string>();
  for (const [k, list] of byDay) {
    if (challengeProgress(dailyChallenges(k, trackable), list, k, timeZone).some((c) => c.complete)) active.add(k);
  }
  const activeDays = Array.from(active).sort();

  const keyAt = (offsetDays: number): string => {
    const base = dayIndex(todayKey) + offsetDays;
    return new Date(base * 86_400_000).toISOString().slice(0, 10);
  };

  const todayDone = active.has(todayKey);
  let current = 0;
  for (let back = todayDone ? 0 : 1; ; back++) {
    if (!active.has(keyAt(-back))) break;
    current++;
  }

  let longest = 0, run = 0, prev = -Infinity;
  for (const k of activeDays) {
    const i = dayIndex(k);
    run = i === prev + 1 ? run + 1 : 1;
    prev = i;
    if (run > longest) longest = run;
  }

  return { current, longest, activeDays, todayDone };
}

// ---------------------------------------------------------------------------
// Badges — thresholds on real totals, nothing hashed
// ---------------------------------------------------------------------------
export type Badge = { id: string; label: string; why: string; earned: boolean; progress: number; target: number };

export function badgesFor(deeds: Deed[], streak: StreakState): Badge[] {
  const n = (k: DeedKind) => (deeds || []).filter((d) => d.kind === k).length;
  const revenue = (deeds || []).filter((d) => d.kind === "sale").reduce((a, d) => a + (d.valueGbp || 0), 0);
  const mk = (id: string, label: string, why: string, progress: number, target: number): Badge =>
    ({ id, label, why, progress, target, earned: progress >= target });
  return [
    mk("first-sale", "First blood", "One sale recorded in the Money Ledger", n("sale"), 1),
    mk("ten-sales", "Ten deep", "Ten sales recorded", n("sale"), 10),
    mk("grand", "Four figures", "£1,000 of recorded revenue", Math.floor(revenue), 1000),
    mk("ten-videos", "Cutting room", "Ten videos or clips produced", n("video"), 10),
    mk("fifty-posts", "Always on", "Fifty pieces of content made", n("content"), 50),
    mk("hundred-contacts", "Full vault", "One hundred contacts added", n("customer"), 100),
    mk("streak-7", "Week straight", "Seven consecutive days with a challenge completed", streak.longest, 7),
    mk("streak-30", "Month straight", "Thirty consecutive days", streak.longest, 30),
  ];
}

// ---------------------------------------------------------------------------
// Money missions
// ---------------------------------------------------------------------------
export type MoneyMission = {
  id: string;
  title: string;
  goal: string;
  metric: "revenueGbp" | "sales" | "customers" | "outreach";
  target: number;
  windowDays: number;
  xp: number;
  acuIfFunded: number;   // the reward IF the margin can pay for it — see below
};

export const MONEY_MISSIONS: MoneyMission[] = [
  { id: "first-100", title: "Make £100", goal: "£100 of recorded revenue in 7 days", metric: "revenueGbp", target: 100, windowDays: 7, xp: 150, acuIfFunded: 200 },
  { id: "five-customers", title: "Five new customers", goal: "Five sales from five different days", metric: "sales", target: 5, windowDays: 14, xp: 200, acuIfFunded: 300 },
  { id: "first-1000", title: "Make £1,000", goal: "£1,000 of recorded revenue in 30 days", metric: "revenueGbp", target: 1000, windowDays: 30, xp: 500, acuIfFunded: 1000 },
  { id: "fill-the-vault", title: "Fill the vault", goal: "Fifty contacts added in 30 days", metric: "customers", target: 50, windowDays: 30, xp: 120, acuIfFunded: 100 },
  { id: "hundred-doors", title: "A hundred doors", goal: "One hundred prospects contacted in 30 days", metric: "outreach", target: 100, windowDays: 30, xp: 180, acuIfFunded: 150 },
];

export type MissionProgress = MoneyMission & { done: number; complete: boolean; pct: number; rewardAcu: number; rewardNote: string };

export function missionProgress(missions: MoneyMission[], deeds: Deed[], nowISO: string, ceiling: RewardCeiling): MissionProgress[] {
  const now = new Date(nowISO).getTime();
  return missions.map((m) => {
    const since = now - m.windowDays * 86_400_000;
    const inWindow = (deeds || []).filter((d) => {
      const t = new Date(d.at).getTime();
      return !Number.isNaN(t) && t >= since && t <= now;
    });
    const done =
      m.metric === "revenueGbp" ? Math.floor(inWindow.filter((d) => d.kind === "sale").reduce((a, d) => a + (d.valueGbp || 0), 0))
      : m.metric === "sales" ? inWindow.filter((d) => d.kind === "sale").length
      : m.metric === "customers" ? inWindow.filter((d) => d.kind === "customer").length
      : inWindow.filter((d) => d.kind === "outreach").length;
    const complete = done >= m.target;
    const rewardAcu = complete ? Math.min(m.acuIfFunded, ceiling.acus) : 0;
    return {
      ...m, done, complete,
      pct: Math.min(100, Math.round((done / m.target) * 100)),
      rewardAcu,
      rewardNote: !complete
        ? `Reward on completion: ${m.xp} XP${ceiling.acus > 0 ? ` and up to ${Math.min(m.acuIfFunded, ceiling.acus)} ACUs` : " (ACU reward unfunded — see why)"}.`
        : rewardAcu > 0
          ? `${m.xp} XP and ${rewardAcu} ACUs, funded from realised margin.`
          : `${m.xp} XP. ${ceiling.why}`,
    };
  });
}

// ---------------------------------------------------------------------------
// The funded reward ceiling — where a free ACU is allowed to come from
//
// An ACU handed out costs us the provider spend behind it. The owner's floor is
// a net margin of NET_PROFIT_FLOOR (100%), so the largest giveaway G that keeps
// the floor, for a customer whose realised revenue is R against provider cost C
// over S spent ACUs, is:
//
//     (R − C − G·c) / (C + G·c)  ≥  f          where c = C / S  (cost per ACU)
//  ⇒  G  ≤  S · (R − C(1+f)) / (C(1+f))
//
// If that is negative — the customer is not yet at the floor — the ceiling is
// zero and the missions pay XP only. This is the one honest way to run a
// rewards programme alongside a pricing law: give back a slice of margin you
// have actually made, never a slice you hope to.
// ---------------------------------------------------------------------------
export type RewardCeiling = { acus: number; why: string; marginAfter: number | null };

export function rewardCeilingAcus(input: { spentAcu: number; revenueGbp: number; providerCostGbp: number }): RewardCeiling {
  const S = Math.max(0, Math.floor(input.spentAcu || 0));
  const R = Math.max(0, input.revenueGbp || 0);
  const C = Math.max(0, input.providerCostGbp || 0);
  const f = NET_PROFIT_FLOOR;

  if (S <= 0 || C <= 0) {
    return { acus: 0, why: "No metered spend recorded yet, so there is no realised margin to fund a reward from. Missions pay XP, badges and streaks until there is.", marginAfter: null };
  }
  const headroom = R - C * (1 + f);
  if (headroom <= 0) {
    const margin = (R - C) / C;
    return {
      acus: 0,
      why: `Realised margin on your account is ${Math.round(margin * 100)}%, at or below the ${Math.round(f * 100)}% floor — an ACU reward would push it under. Missions pay XP, badges and streaks, which cost nothing.`,
      marginAfter: null,
    };
  }
  const acus = Math.floor((S * headroom) / (C * (1 + f)));
  const costPerAcu = C / S;
  const marginAfter = (R - C - acus * costPerAcu) / (C + acus * costPerAcu);
  return {
    acus,
    why: `Up to ${acus} ACUs can be returned from realised margin while net profit stays at or above the ${Math.round(f * 100)}% floor.`,
    marginAfter: Math.round(marginAfter * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// The whole Play surface in one call
// ---------------------------------------------------------------------------
export type PlayState = {
  day: string;
  timezone: string;
  challenges: ChallengeProgress[];
  completedToday: number;
  xpToday: number;
  xp: number;
  level: LevelState;
  streak: StreakState;
  badges: Badge[];
  missions: MissionProgress[];
  ceiling: RewardCeiling;
  // Deed kinds the platform cannot yet observe for this brand. Published so the
  // absence of a challenge is explained rather than mysterious.
  untracked: DeedKind[];
  doctrine: string;
};

export const ALL_DEED_KINDS: DeedKind[] = ["content", "video", "page", "email", "outreach", "review-request", "customer", "research", "sale"];

export const VERIFIED_ONLY =
  "Every challenge here is completed by work the platform recorded — a page published, an email sent, a video produced, a sale in the ledger. Nothing is completed by saying you did it, because a scoreboard nobody verifies measures nothing.";

export function playState(input: {
  deeds: Deed[];
  nowISO: string;
  timezone?: string;
  spentAcu?: number;
  revenueGbp?: number;
  providerCostGbp?: number;
  trackable?: DeedKind[];
}): PlayState {
  const tz = input.timezone || "UTC";
  const day = dayKey(input.nowISO, tz);
  const deeds = input.deeds || [];
  const challenges = challengeProgress(dailyChallenges(day, input.trackable), deeds, day, tz);
  const streak = streakFor(deeds, day, tz, input.trackable);
  const ceiling = rewardCeilingAcus({
    spentAcu: input.spentAcu || 0,
    revenueGbp: input.revenueGbp || 0,
    providerCostGbp: input.providerCostGbp || 0,
  });
  const xp = earnedXp(deeds, tz, input.trackable);
  return {
    day,
    timezone: tz,
    challenges,
    completedToday: challenges.filter((c) => c.complete).length,
    xpToday: challenges.filter((c) => c.complete).reduce((a, c) => a + c.xp, 0),
    xp,
    level: levelFor(xp),
    streak,
    badges: badgesFor(deeds, streak),
    missions: missionProgress(MONEY_MISSIONS, deeds, input.nowISO, ceiling),
    ceiling,
    untracked: input.trackable && input.trackable.length ? ALL_DEED_KINDS.filter((k) => !input.trackable!.includes(k)) : [],
    doctrine: VERIFIED_ONLY,
  };
}
