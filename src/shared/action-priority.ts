// WHAT TO DO TODAY (§97).
//
// `command-summary.ts` already carries a `priority` on every brief item, and
// nothing computed it from anything. It was set by whichever branch produced the
// item, so two items from different engines were never comparable — which is
// exactly the situation where a customer opens the dashboard and picks the
// first thing they see rather than the thing that matters.
//
// This computes it from the five factors the spec names: impact, urgency,
// confidence, effort and cost.
//
// THE RULE THAT MAKES THIS HONEST: EVERY FACTOR MUST ARRIVE WITH ITS BASIS.
//
// A default of 0.5 for "impact" looks harmless and is not: it produces a
// confident-looking ordering built on nothing, and nobody can tell which parts
// were known. An action missing a factor is returned UNRANKED, with the missing
// factor named, and it appears in a separate list rather than being slotted into
// the middle of the queue where it would be indistinguishable from a measured one.
//
// The arithmetic is shown for the same reason `opportunity-radar.ts` shows its
// breakdown: a ranking nobody can audit is a ranking nobody should follow.

/** 0–1. Anything outside is clamped, and clamping is reported. */
export type Factor = {
  value: number;
  /** Where the number came from, in words. Required — this is the whole point. */
  basis: string;
};

export type ActionInput = {
  id: string;
  title: string;
  href?: string;
  impact?: Factor;      // how much money it moves
  urgency?: Factor;     // how fast the window closes
  confidence?: Factor;  // how sure we are it works
  effort?: Factor;      // how much of the customer's time it costs
  cost?: Factor;        // what it costs to run, in money
};

export const REQUIRED_FACTORS = ["impact", "urgency", "confidence", "effort", "cost"] as const;
export type FactorName = (typeof REQUIRED_FACTORS)[number];

/** Effort and cost divide, so they can never be zero. */
const FLOOR = 0.05;

export type RankedAction = {
  id: string;
  title: string;
  href?: string;
  priority: number;             // 0–100
  breakdown: string;            // the arithmetic, in full
  bases: Record<FactorName, string>;
  clamped: FactorName[];
};

export type UnrankedAction = {
  id: string;
  title: string;
  href?: string;
  missing: FactorName[];
  reason: string;
};

export type PriorityList = {
  ranked: RankedAction[];
  unranked: UnrankedAction[];
  /** The single next thing, or null when nothing can be ranked. */
  next: RankedAction | null;
  headline: string;
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function rankActions(actions: ActionInput[]): PriorityList {
  const ranked: RankedAction[] = [];
  const unranked: UnrankedAction[] = [];

  for (const a of actions) {
    const missing = REQUIRED_FACTORS.filter((f) => {
      const v = a[f];
      return !v || typeof v.value !== "number" || !Number.isFinite(v.value) || !String(v.basis || "").trim();
    });
    if (missing.length) {
      unranked.push({
        id: a.id, title: a.title, href: a.href, missing,
        reason: `Cannot be ranked against the others: ${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no measured value. Guessing would put it in the queue looking exactly like something that was measured.`,
      });
      continue;
    }

    const clamped: FactorName[] = [];
    const v = (f: FactorName) => {
      const raw = (a[f] as Factor).value;
      const c = clamp01(raw);
      if (c !== raw) clamped.push(f);
      return c;
    };
    const impact = v("impact");
    const urgency = v("urgency");
    const confidence = v("confidence");
    const effort = Math.max(FLOOR, v("effort"));
    const cost = Math.max(FLOOR, v("cost"));

    // Multiply what you want, divide by what it costs you. Same shape as the
    // opportunity radar, so the two rankings behave the same way.
    const raw = (impact * urgency * confidence) / (effort * cost);
    // The most valuable, most urgent, most certain, cheapest possible action is
    // 1/(0.05×0.05) = 400. That is the ceiling the scale is built on.
    const priority = Math.max(1, Math.min(100, Math.round((raw / 400) * 100)));

    ranked.push({
      id: a.id, title: a.title, href: a.href, priority, clamped,
      breakdown: `Impact ${round(impact)} × Urgency ${round(urgency)} × Confidence ${round(confidence)} ÷ (Effort ${round(effort)} × Cost ${round(cost)}) = ${round(raw, 3)} → ${priority}/100`,
      bases: Object.fromEntries(REQUIRED_FACTORS.map((f) => [f, (a[f] as Factor).basis])) as Record<FactorName, string>,
    });
  }

  ranked.sort((x, y) => (y.priority - x.priority) || x.title.localeCompare(y.title));
  const next = ranked[0] ?? null;

  const headline = ranked.length === 0
    ? unranked.length === 0
      ? "Nothing to do — no actions were supplied."
      : unranked.length === 1
        ? "The only suggested action cannot be ranked yet — it says below what it is missing."
        : `None of the ${unranked.length} suggested actions can be ranked yet. Each says what it is missing.`
    : `${next!.title} is the highest-priority action${unranked.length ? `, and ${unranked.length} other${unranked.length === 1 ? "" : "s"} could not be ranked` : ""}.`;

  return { ranked, unranked, next, headline };
}

export const PRIORITY_DOCTRINE = [
  "Every factor arrives with its basis. A default of 0.5 for impact produces a confident-looking order built on nothing, and nobody can tell which parts were known.",
  "An action missing a factor is UNRANKED and listed separately — never slotted into the middle of the queue where it looks measured.",
  "Effort and cost divide and are floored, so a zero-effort claim cannot send something to the top.",
  "The arithmetic is printed in full. A ranking nobody can audit is a ranking nobody should follow.",
  "Ties break on the title, not on arrival order or length — the order has to be the same tomorrow given the same inputs.",
];
