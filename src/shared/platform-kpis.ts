// MARKETWAR'S OWN NUMBERS (§98).
//
// `admin-economics.ts` covers revenue, cost and margin — the money. What was
// never tracked is whether the PRODUCT works: how long a new account takes to
// get its first campaign out, how long until it produces a lead, how often
// people throw away what was generated and ask again, and how often a publish
// actually lands.
//
// Those four say more about whether this platform is worth paying for than any
// revenue line, because revenue at nought customers is nought either way.
//
// THE RULE, WHICH IS THE SAME ONE AS EVERYWHERE ELSE: A KPI WITH TOO LITTLE
// BEHIND IT IS NOT REPORTED AS A SMALL NUMBER. It is reported as "not enough
// yet", with how many observations exist and how many are needed. A median
// time-to-first-campaign computed from one account is not a median; it is that
// account's number wearing a statistic's clothes, and the first time it moves
// somebody will read it as a trend.
//
// Pure, so the admin surface and any test read the same arithmetic.

/** Below this many observations a figure is withheld rather than shown. */
export const MIN_OBSERVATIONS = 5;

export type Account = {
  id: string;
  signedUpAt: string;
  /** Absent while it has not happened. Absence is the finding, not a zero. */
  firstCampaignAt?: string;
  firstLeadAt?: string;
};

export type GenerationEvent = { id: string; kind: "generated" | "regenerated" };
export type PublishAttempt = { id: string; outcome: "published" | "failed" | "uncertain" };

export type Kpi = {
  id: string;
  label: string;
  /** null whenever there is not enough behind it. Never a placeholder number. */
  value: number | null;
  unit: "days" | "percent";
  observations: number;
  required: number;
  /** What the figure means, or what is missing. Always one or the other. */
  note: string;
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const days = (from: string, to: string) =>
  Math.max(0, (Date.parse(to) - Date.parse(from)) / 86_400_000);

function withheld(id: string, label: string, unit: Kpi["unit"], observations: number, what: string): Kpi {
  return {
    id, label, value: null, unit, observations, required: MIN_OBSERVATIONS,
    note: observations === 0
      ? `Nothing to measure yet — ${what}`
      : `${observations} of the ${MIN_OBSERVATIONS} needed. ${what} A figure from ${observations} would be read as a trend the first time it moved.`,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type PlatformKpis = {
  kpis: Kpi[];
  /** How many of the four are actually measurable today. */
  measured: number;
  headline: string;
};

export function platformKpis(input: {
  accounts: Account[];
  generations: GenerationEvent[];
  publishes: PublishAttempt[];
}): PlatformKpis {
  const kpis: Kpi[] = [];

  // 1. Time to first campaign — only accounts that GOT there can be timed.
  // Counting the ones that never did as a large number would flatter or
  // damn the figure depending on how long ago they signed up.
  const toCampaign = input.accounts
    .filter((a) => a.firstCampaignAt)
    .map((a) => days(a.signedUpAt, a.firstCampaignAt!));
  kpis.push(toCampaign.length >= MIN_OBSERVATIONS
    ? {
      id: "time_to_first_campaign", label: "Time to first campaign", unit: "days",
      value: round1(median(toCampaign)), observations: toCampaign.length, required: MIN_OBSERVATIONS,
      note: `Median across the ${toCampaign.length} accounts that have got a campaign out. Accounts that never did are not counted — including them would measure how long ago they signed up, not how long the product takes.`,
    }
    : withheld("time_to_first_campaign", "Time to first campaign", "days", toCampaign.length,
      "it needs accounts that have actually got a campaign out."));

  // 2. Time to first lead.
  const toLead = input.accounts
    .filter((a) => a.firstLeadAt)
    .map((a) => days(a.signedUpAt, a.firstLeadAt!));
  kpis.push(toLead.length >= MIN_OBSERVATIONS
    ? {
      id: "time_to_first_lead", label: "Time to first lead", unit: "days",
      value: round1(median(toLead)), observations: toLead.length, required: MIN_OBSERVATIONS,
      note: `Median across the ${toLead.length} accounts that have produced a lead.`,
    }
    : withheld("time_to_first_lead", "Time to first lead", "days", toLead.length,
      "it needs accounts that have produced a lead."));

  // 3. Regeneration rate — how often what was produced was thrown away. The
  // single best proxy for whether the output is any good.
  const gens = input.generations.length;
  const regens = input.generations.filter((g) => g.kind === "regenerated").length;
  kpis.push(gens >= MIN_OBSERVATIONS
    ? {
      id: "regeneration_rate", label: "Regeneration rate", unit: "percent",
      value: round1((regens / gens) * 100), observations: gens, required: MIN_OBSERVATIONS,
      note: `${regens} of ${gens} generations were asked for again. Lower is better — this is how often the first answer was not good enough.`,
    }
    : withheld("regeneration_rate", "Regeneration rate", "percent", gens,
      "it needs generations to count."));

  // 4. Publishing success — uncertain is NOT counted as success. The publication
  // ledger records uncertainty deliberately, and folding it into either column
  // would throw away the thing that record exists to preserve.
  const attempts = input.publishes.length;
  const succeeded = input.publishes.filter((p) => p.outcome === "published").length;
  const uncertain = input.publishes.filter((p) => p.outcome === "uncertain").length;
  kpis.push(attempts >= MIN_OBSERVATIONS
    ? {
      id: "publish_success_rate", label: "Publishing success", unit: "percent",
      value: round1((succeeded / attempts) * 100), observations: attempts, required: MIN_OBSERVATIONS,
      note: `${succeeded} of ${attempts} attempts confirmed as published${uncertain ? `. ${uncertain} came back uncertain and ${uncertain === 1 ? "is" : "are"} counted as neither — the ledger records that state on purpose` : ""}.`,
    }
    : withheld("publish_success_rate", "Publishing success", "percent", attempts,
      "it needs publish attempts to count."));

  const measured = kpis.filter((k) => k.value !== null).length;
  const headline = measured === 0
    ? `None of the ${kpis.length} product KPIs can be reported yet. Each says what it needs — and with no customers, that is the honest answer rather than a fault.`
    : measured === kpis.length
      ? "All four product KPIs are measurable."
      : `${measured} of ${kpis.length} product KPIs are measurable. The rest say what they need.`;

  return { kpis, measured, headline };
}

export const KPI_DOCTRINE = [
  "A KPI with too little behind it is withheld, not shrunk. A median from one account is that account's number wearing a statistic's clothes.",
  "Time-to-first is measured only across accounts that got there. Counting the ones that never did would measure how long ago they signed up.",
  "An uncertain publish is counted as neither a success nor a failure. The publication ledger records that state on purpose and folding it away destroys it.",
  "The regeneration rate is the best proxy the platform has for whether its output is any good, and lower is better — it is stated that way so nobody optimises it upwards.",
  "With no customers, 'none of these can be reported' is the honest answer rather than a fault.",
];
