// LET MARKETWAR GROW MY BUSINESS — THE SETTINGS (§103).
//
// `autopilot.ts` already runs cycles and already refuses to auto-publish
// high-risk work. What never existed is the block a person actually fills in
// before trusting any of that: how much may be spent, what it is aiming at,
// which channels are allowed, what a customer may cost, and above what value
// the machine must stop and ask.
//
// Scattering those across five screens is how somebody ends up with autonomy
// switched on and no idea what it may do. One shape, validated together.
//
// THE VALIDATION IS THE FEATURE, AND IT REFUSES CONTRADICTIONS RATHER THAN
// RESOLVING THEM QUIETLY.
//
// A config that silently picks a winner between two settings that disagree is a
// config nobody can reason about afterwards — and this one governs spending
// somebody else's money. Every contradiction is returned as an error naming both
// sides.
//
// One rule is absolute and is not a setting: FORBIDDEN BEATS ALLOWED. A channel
// named in both lists is forbidden. Any other resolution means a typo in the
// allow-list can spend money somewhere the owner explicitly ruled out.

export type AutonomyConfig = {
  /** Hard ceiling per cycle, in pounds. 0 means owned channels only. */
  budgetGbp: number;
  /** What it is for. Free text, required — autonomy with no stated goal is drift. */
  target: string;
  allowedChannels: string[];
  forbiddenChannels: string[];
  /** The most a customer may cost before it stops. */
  maxCpaGbp: number;
  /** Above this projected value, it asks rather than acts. */
  approvalAboveGbp: number;
  /** 0 = off, 3 = most autonomous. Mirrors autopilot's own levels. */
  level: number;
};

export const DEFAULT_CONFIG: AutonomyConfig = {
  budgetGbp: 0,
  target: "",
  allowedChannels: [],
  forbiddenChannels: [],
  maxCpaGbp: 0,
  approvalAboveGbp: 0,
  level: 0,
};

export type Validation =
  | { ok: false; errors: string[]; warnings: string[] }
  | { ok: true; config: AutonomyConfig; warnings: string[]; summary: string };

const clean = (xs: string[]) => [...new Set((xs || []).map((c) => String(c || "").trim().toLowerCase()).filter(Boolean))];

export function validateConfig(input: Partial<AutonomyConfig>): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const level = Math.max(0, Math.min(3, Math.round(Number(input.level ?? 0) || 0)));
  const budgetGbp = Math.max(0, Number(input.budgetGbp ?? 0) || 0);
  const maxCpaGbp = Math.max(0, Number(input.maxCpaGbp ?? 0) || 0);
  const approvalAboveGbp = Math.max(0, Number(input.approvalAboveGbp ?? 0) || 0);
  const target = String(input.target ?? "").trim();

  const forbiddenChannels = clean(input.forbiddenChannels ?? []);
  const allowedRaw = clean(input.allowedChannels ?? []);
  // FORBIDDEN BEATS ALLOWED, ALWAYS.
  const overlap = allowedRaw.filter((c) => forbiddenChannels.includes(c));
  const allowedChannels = allowedRaw.filter((c) => !forbiddenChannels.includes(c));
  if (overlap.length) {
    warnings.push(`${overlap.join(", ")} ${overlap.length === 1 ? "is" : "are"} in both lists and ${overlap.length === 1 ? "has" : "have"} been treated as forbidden. A typo in the allow-list must never spend money somewhere you ruled out.`);
  }

  // Autonomy with no stated goal is drift, and drift is what people mean when
  // they say they do not trust it.
  if (level > 0 && !target) {
    errors.push("Say what it is aiming at. Autonomy with no stated goal is drift, and there is nothing to judge a cycle against afterwards.");
  }

  if (budgetGbp > 0 && allowedChannels.length === 0) {
    errors.push(`There is a £${budgetGbp} budget and no channel it may be spent on. Either allow a channel or set the budget to zero for owned channels only.`);
  }

  if (maxCpaGbp > 0 && budgetGbp > 0 && maxCpaGbp > budgetGbp) {
    errors.push(`A customer may cost up to £${maxCpaGbp} but the whole cycle budget is £${budgetGbp}. One of those is wrong — as written, a single customer would consume the entire budget and the cap would never bite.`);
  }

  if (budgetGbp > 0 && maxCpaGbp === 0) {
    warnings.push("No maximum cost per customer is set, so nothing stops a campaign spending the whole budget on one. Set one before raising the level.");
  }

  if (level >= 2 && approvalAboveGbp === 0) {
    warnings.push("Nothing will be sent for approval at this level, because the threshold is £0 and everything is above it — which means everything is queued. If you meant the opposite, set a real figure.");
  }

  if (level === 0 && (budgetGbp > 0 || allowedChannels.length > 0)) {
    warnings.push("Autonomy is off, so the budget and channels below are stored and not used. Nothing will run until the level is raised.");
  }

  if (errors.length) return { ok: false, errors, warnings };

  const config: AutonomyConfig = { budgetGbp, target, allowedChannels, forbiddenChannels, maxCpaGbp, approvalAboveGbp, level };

  const summary = level === 0
    ? "Autonomy is off. Nothing runs on its own."
    : [
      `Level ${level}, aiming at "${target}".`,
      budgetGbp > 0 ? `Up to £${budgetGbp} per cycle on ${allowedChannels.join(", ")}` : "Owned channels only, no paid spend",
      maxCpaGbp > 0 ? `stopping at £${maxCpaGbp} per customer` : "with no cost-per-customer cap",
      approvalAboveGbp > 0 ? `and asking before anything worth more than £${approvalAboveGbp}` : "and asking before everything",
      forbiddenChannels.length ? `Never: ${forbiddenChannels.join(", ")}.` : "",
    ].filter(Boolean).join(" · ");

  return { ok: true, config, warnings, summary };
}

export const AUTONOMY_DOCTRINE = [
  "Forbidden beats allowed, always. Any other resolution means a typo in the allow-list can spend money somewhere the owner explicitly ruled out.",
  "Contradictions are refused, not resolved quietly. A config that silently picks a winner is one nobody can reason about afterwards, and this one governs spending somebody else's money.",
  "Autonomy with no stated goal is drift — there is nothing to judge a cycle against afterwards, so a level above zero requires a target.",
  "A budget with no channel to spend it on is an error, not a default. So is a cost-per-customer cap larger than the whole budget.",
  "Settings stored while autonomy is off say so. A screen full of numbers that do nothing is how somebody believes it is running when it is not.",
];
