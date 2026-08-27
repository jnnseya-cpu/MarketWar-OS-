// MARKET EXIT CAPTURE — the rules.
//
// WHAT IT IS FOR. When a business closes, the demand it was serving does not
// close with it. Those customers still need a plumber, a nursery place, a
// courier. They search, find a dead listing, and go to whoever is easiest to
// find next. This engine turns a verified closure into a named, expiring
// customer-acquisition opportunity for an ACTIVE MarketWar business.
//
// WHY IT IS THE MOST DANGEROUS THING IN THE PLATFORM, AND IS BUILT ACCORDINGLY.
// Every other engine is wrong at its own expense. This one is wrong at a named
// third party's expense: publishing "PERMANENTLY_CLOSED" about a business that
// is trading is a defamation with a marketing budget behind it. So the whole
// file is arranged around three refusals, and each is a code path rather than a
// paragraph in a runbook:
//
//   1. ONE WEAK SIGNAL IS NOT A CLOSURE. Publishing requires an OFFICIAL source
//      (an insolvency or company register), or two signals from genuinely
//      INDEPENDENT sources. Two facts that both came from Google are one fact.
//      `INDEPENDENCE` is what makes that enforceable instead of aspirational.
//   2. CONFIDENCE CANNOT BE ASSERTED INTO EXISTENCE. Every source carries a
//      ceiling, so a caller handing us `confidence: 1` on a stranger's web-form
//      report gets it clamped and the clamp is recorded. Signals combine by the
//      complement product of the STRONGEST signal PER INDEPENDENCE GROUP, so
//      piling on ten observations of the same thing raises nothing.
//   3. DISPLACED DEMAND IS COUNTED OR IT IS NULL. "Estimated displaced
//      customers" is exactly the fabricated statistic this repository has a test
//      forbidding elsewhere, and it would be the most quoted number here. There
//      is one accepted basis — counted branded searches — and everything else
//      returns null with a sentence naming what to supply. A null that says why
//      is worth more than a number nobody can defend.
//
// The rules live here, pure and client-safe, so a surface can show WHY a closure
// was or was not published without asking a server. Storage lives in
// `backend/market-exit-store.ts` and holds no rules of its own — the same split
// as the opportunity board, for the same reason: two rulebooks disagree the
// first time one is edited.

// ---------------------------------------------------------------------------
// 1. Detection sources
// ---------------------------------------------------------------------------

/**
 * How much weight a source may ever carry, regardless of what the caller says.
 *
 *  official  — a register with a legal duty of accuracy behind the entry.
 *  operator  — the business itself said so, on something it controls.
 *  observed  — somebody outside the business observed something consistent with
 *              closure. Consistent with. Not proof of.
 *  reported  — a member of the public told us. The weakest thing there is, and
 *              the easiest to abuse against a competitor.
 */
export type SourceTier = "official" | "operator" | "observed" | "reported";

/**
 * THE GROUP IS THE POINT. Two signals count as corroboration only when they
 * could have failed independently. A Google Business Profile marked closed and
 * a Google Maps listing marked closed are ONE observation with two URLs — the
 * second is a copy of the first. Grouping them makes "multiple independent
 * signals" a thing the code can check rather than a thing a reviewer has to
 * notice.
 */
export type IndependenceGroup =
  | "registry"        // insolvency / company registers, official gazettes
  | "google"          // Business Profile, Maps, anything reading from them
  | "owned-web"       // the business's own site, its own social accounts
  | "press"           // news, trade press, local reporting
  | "directory"       // third-party directories and marketplaces
  | "contactability"  // bounced mail, dead number, expired domain
  | "crowd";          // members of the public telling us

export type ClosureSourceId =
  | "insolvency_register"
  | "company_register"
  | "official_gazette"
  | "google_business_profile"
  | "google_maps_status"
  | "business_website"
  | "business_social"
  | "news_report"
  | "directory_delisting"
  | "marketplace_delisting"
  | "email_bounce"
  | "phone_disconnected"
  | "domain_inactive"
  | "user_report";

export type ClosureSourceSpec = {
  id: ClosureSourceId;
  label: string;
  tier: SourceTier;
  independence: IndependenceGroup;
  /** The most this source may ever contribute, however confident the caller is. */
  maxConfidence: number;
  /** Why the ceiling is where it is. Shown in the evidence panel. */
  why: string;
};

export const CLOSURE_SOURCES: ClosureSourceSpec[] = [
  { id: "insolvency_register", label: "Insolvency register", tier: "official", independence: "registry", maxConfidence: 0.99,
    why: "A statutory register. The entry has a legal process behind it, so it is the one source that stands alone." },
  { id: "company_register", label: "Company register (dissolution)", tier: "official", independence: "registry", maxConfidence: 0.97,
    why: "Dissolution is a matter of record. A dissolved company may still have a trading successor, so it is not quite absolute." },
  { id: "official_gazette", label: "Official gazette notice", tier: "official", independence: "registry", maxConfidence: 0.97,
    why: "A published statutory notice — strike-off, winding-up, liquidation appointment." },

  { id: "google_business_profile", label: "Google Business Profile status", tier: "operator", independence: "google", maxConfidence: 0.85,
    why: "Usually set by the owner, but it can be crowd-edited or mis-suggested, and profiles go stale." },
  { id: "google_maps_status", label: "Google Maps listing status", tier: "observed", independence: "google", maxConfidence: 0.7,
    why: "Reads from the same profile. It corroborates nothing the profile did not already say." },

  { id: "business_website", label: "Closure notice on the business's own site", tier: "operator", independence: "owned-web", maxConfidence: 0.92,
    why: "The business saying it about itself, on something it controls." },
  { id: "business_social", label: "Closure announcement on the business's own social account", tier: "operator", independence: "owned-web", maxConfidence: 0.88,
    why: "The business saying it about itself. Slightly lower — accounts get compromised and posts get misread." },

  { id: "news_report", label: "News or trade-press report", tier: "observed", independence: "press", maxConfidence: 0.75,
    why: "Reporting is second-hand by definition, and a story about difficulty is not a story about closure." },

  { id: "directory_delisting", label: "Removed from a trade directory", tier: "observed", independence: "directory", maxConfidence: 0.45,
    why: "Businesses leave directories for a dozen reasons, and the commonest is that they stopped paying." },
  { id: "marketplace_delisting", label: "Removed from a marketplace", tier: "observed", independence: "directory", maxConfidence: 0.45,
    why: "Same as a directory: a suspension, a dispute or a pricing decision looks identical to a closure from outside." },

  { id: "email_bounce", label: "Mail to the business hard-bounces", tier: "observed", independence: "contactability", maxConfidence: 0.4,
    why: "A dead mailbox is a dead mailbox. Businesses change providers and lose addresses while trading normally." },
  { id: "phone_disconnected", label: "Listed number disconnected", tier: "observed", independence: "contactability", maxConfidence: 0.45,
    why: "Strong when paired with anything else, near worthless alone — numbers change." },
  { id: "domain_inactive", label: "Website domain no longer resolves", tier: "observed", independence: "contactability", maxConfidence: 0.5,
    why: "An expired domain is a real signal and a common one for a lapsed renewal on a trading business." },

  { id: "user_report", label: "Closure reported by a member of the public", tier: "reported", independence: "crowd", maxConfidence: 0.3,
    why: "The easiest signal in the system to file maliciously against a competitor. It can support a case; it can never make one." },
];

const SOURCE_BY_ID = new Map(CLOSURE_SOURCES.map((s) => [s.id, s]));

export function closureSource(id: string): ClosureSourceSpec | null {
  return SOURCE_BY_ID.get(id as ClosureSourceId) ?? null;
}

// ---------------------------------------------------------------------------
// 2. Signals and statuses
// ---------------------------------------------------------------------------

export type ClosureStatus =
  | "ACTIVE"
  | "AT_RISK"
  | "CLOSING_SOON"
  | "INSOLVENT"
  | "PERMANENTLY_CLOSED"
  | "RELOCATED"
  | "UNVERIFIED";

/** Statuses that assert a business has stopped serving customers where it was. */
export const EXIT_STATUSES: ClosureStatus[] = ["INSOLVENT", "PERMANENTLY_CLOSED", "RELOCATED"];

/**
 * Statuses that say something damaging about a named, identifiable business.
 * These are the ones that may never rest on thin evidence — see `assessClosure`.
 */
export const HARMFUL_STATUSES: ClosureStatus[] = ["AT_RISK", "CLOSING_SOON", "INSOLVENT", "PERMANENTLY_CLOSED"];

export const SIGNAL_TYPES = [
  "insolvency_filing",
  "dissolution",
  "strike_off_notice",
  "liquidator_appointed",
  "closure_announcement",
  "status_permanently_closed",
  "status_temporarily_closed",
  "relocation_notice",
  "delisted",
  "unreachable",
  "trading_normally",
  "recent_activity",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

/**
 * What each observation, taken at face value, would mean.
 *
 * `counter: true` marks signals that argue the business is STILL TRADING. They
 * are collected with the same care as the rest, because the failure mode of a
 * detector is that it only looks for what it is hunting: a Companies House
 * strike-off notice beside a review posted last week is not a closure, it is a
 * contradiction, and it must reach a human rather than a landing page.
 */
export const SIGNAL_MEANING: Record<SignalType, { implies: ClosureStatus; counter?: boolean; label: string }> = {
  insolvency_filing:        { implies: "INSOLVENT", label: "Insolvency proceeding filed" },
  dissolution:              { implies: "PERMANENTLY_CLOSED", label: "Company dissolved" },
  strike_off_notice:        { implies: "CLOSING_SOON", label: "Strike-off proposed" },
  liquidator_appointed:     { implies: "INSOLVENT", label: "Liquidator or administrator appointed" },
  closure_announcement:     { implies: "PERMANENTLY_CLOSED", label: "The business announced it is closing" },
  status_permanently_closed:{ implies: "PERMANENTLY_CLOSED", label: "Listing marked permanently closed" },
  status_temporarily_closed:{ implies: "AT_RISK", label: "Listing marked temporarily closed" },
  relocation_notice:        { implies: "RELOCATED", label: "The business said it has moved" },
  delisted:                 { implies: "AT_RISK", label: "Removed from a listing" },
  unreachable:              { implies: "AT_RISK", label: "Could not be contacted" },
  trading_normally:         { implies: "ACTIVE", counter: true, label: "Evidence of normal trading" },
  recent_activity:          { implies: "ACTIVE", counter: true, label: "Recent activity observed" },
};

export type ClosureSignal = {
  businessId: string;
  /** A `ClosureSourceId`. An unknown source is not trusted at all — see below. */
  source: string;
  signalType: string;
  observedAt: string;
  evidenceUrl?: string;
  /** 0–1, as claimed by the caller. Clamped to the source's ceiling. */
  confidence: number;
};

/** A signal after the ceiling has been applied, carrying what happened to it. */
export type WeighedSignal = ClosureSignal & {
  tier: SourceTier | "unknown";
  independence: IndependenceGroup | "unknown";
  /** What it actually counts for, after clamping. */
  weight: number;
  clamped: boolean;
  counter: boolean;
  note: string;
};

export type ClosureAssessment = {
  businessId: string;
  status: ClosureStatus;
  confidenceScore: number;
  effectiveDate?: string;
  evidence: WeighedSignal[];
  humanReviewRequired: boolean;
  /**
   * May this leave the building? False means the assessment exists internally
   * for review and NOTHING downstream — no opportunity, no page, no campaign —
   * may be built on it.
   */
  publishable: boolean;
  /** The independence groups that contributed anything at all. */
  independentGroups: IndependenceGroup[];
  /** Of those, the ones that may count toward the two-source rule. */
  qualifyingGroups: IndependenceGroup[];
  /** Signals arguing the business is still trading. */
  contradictions: WeighedSignal[];
  /** One sentence a person can act on. */
  why: string;
  assessedAt: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/**
 * The confidence floor below which a damaging status is never published, even
 * with an official source. Deliberately high: the cost of holding a true closure
 * back for a day is one late campaign, and the cost of publishing a false one is
 * a named business told the world it had failed.
 */
export const PUBLISH_CONFIDENCE_FLOOR = 0.8;

/** Below this, a human looks at it even when the arithmetic says publish. */
export const REVIEW_CONFIDENCE_FLOOR = 0.9;

/** No combination of evidence is ever reported as certainty. */
export const MAX_CONFIDENCE = 0.99;

/**
 * The tiers that may COUNT toward the two-independent-sources rule.
 *
 * `reported` is missing on purpose. A member of the public filing a web form is
 * the easiest signal in the system to aim at a competitor, and the first version
 * of this file let a Google listing plus one such report publish
 * PERMANENTLY_CLOSED about a named dental practice at 0.9 confidence. A crowd
 * report can still RAISE confidence once real sources have made the case; it can
 * never be half of the case.
 */
export const QUALIFYING_TIERS: SourceTier[] = ["official", "operator", "observed"];

export function weighSignal(s: ClosureSignal): WeighedSignal {
  const spec = closureSource(s.source);
  const meaning = SIGNAL_MEANING[s.signalType as SignalType];
  const counter = Boolean(meaning?.counter);
  const claimed = clamp01(s.confidence);

  // AN UNKNOWN SOURCE IS WORTH NOTHING. Not "worth a little" — nothing. A source
  // this file has never heard of is an unreviewed input path, and the way these
  // systems get abused is by inventing a source name and asserting confidence 1.
  if (!spec) {
    return { ...s, tier: "unknown", independence: "unknown", weight: 0, clamped: claimed > 0, counter,
      note: `"${s.source}" is not a recognised source, so it carries no weight. Add it to CLOSURE_SOURCES with a ceiling and an independence group first.` };
  }
  if (!meaning) {
    return { ...s, tier: spec.tier, independence: spec.independence, weight: 0, clamped: claimed > 0, counter: false,
      note: `"${s.signalType}" is not a recognised signal type, so it carries no weight.` };
  }
  const weight = Math.min(claimed, spec.maxConfidence);
  return {
    ...s, tier: spec.tier, independence: spec.independence,
    weight: round2(weight), clamped: weight < claimed, counter,
    note: weight < claimed
      ? `Claimed ${round2(claimed)}, capped at ${spec.maxConfidence} — ${spec.why}`
      : spec.why,
  };
}

/**
 * Combine corroborating signals WITHOUT letting repetition inflate certainty.
 *
 * Takes the strongest signal in each independence group and combines those by
 * the complement product (1 − Π(1 − w)). Ten Google observations therefore
 * contribute exactly what the best one contributes, which is the whole point:
 * scraping the same fact from five places is not five facts.
 */
function combine(signals: WeighedSignal[]): { score: number; groups: IndependenceGroup[]; qualifyingGroups: IndependenceGroup[] } {
  const best = new Map<IndependenceGroup, number>();
  const qualifying = new Set<IndependenceGroup>();
  for (const s of signals) {
    if (s.weight <= 0 || s.independence === "unknown") continue;
    const cur = best.get(s.independence) ?? 0;
    if (s.weight > cur) best.set(s.independence, s.weight);
    if (QUALIFYING_TIERS.includes(s.tier as SourceTier)) qualifying.add(s.independence);
  }
  let complement = 1;
  for (const w of best.values()) complement *= 1 - w;
  // NEVER 1.0. Two strong records round to certainty and a surface then tells
  // somebody a business is definitely shut. Nothing this engine sees is
  // certain, and a ceiling below 1 is the cheapest way to keep saying so.
  return { score: Math.min(MAX_CONFIDENCE, round2(1 - complement)), groups: [...best.keys()], qualifyingGroups: [...qualifying] };
}

export type AssessInput = {
  businessId: string;
  signals: ClosureSignal[];
  assessedAt: string;
  /** An open dispute forces review and blocks publication. §8. */
  disputeOpen?: boolean;
};

export function assessClosure(input: AssessInput): ClosureAssessment {
  const weighed = (input.signals || []).map(weighSignal);
  const forClosure = weighed.filter((s) => !s.counter && s.weight > 0);
  const contradictions = weighed.filter((s) => s.counter && s.weight > 0);

  const { score, groups, qualifyingGroups } = combine(forClosure);
  const official = forClosure.filter((s) => s.tier === "official");

  // THE PUBLISH RULE, in one expression, exactly as the specification states it:
  // an official source, OR corroboration from more than one independent source —
  // where a source only qualifies if it is not a member of the public. See
  // QUALIFYING_TIERS for why that exclusion is the load-bearing part.
  const evidenceRuleMet = official.length > 0 || qualifyingGroups.length >= 2;

  // What the strongest evidence actually says. Weight-ordered so a registry
  // filing decides the status rather than the noisiest observation.
  const ranked = [...forClosure].sort((a, b) => b.weight - a.weight);
  const implied = ranked.length > 0 ? SIGNAL_MEANING[ranked[0].signalType as SignalType].implies : "UNVERIFIED";

  const confidenceScore = score;
  const meetsFloor = confidenceScore >= PUBLISH_CONFIDENCE_FLOOR;
  const disputeOpen = Boolean(input.disputeOpen);

  const publishable = evidenceRuleMet && meetsFloor && !disputeOpen && contradictions.length === 0 && implied !== "UNVERIFIED";

  // An unpublishable assessment is UNVERIFIED and says so. It does not keep the
  // damaging label internally and quietly hold it back — a status a surface
  // might render is a status that will eventually be rendered.
  const status: ClosureStatus = publishable ? implied : "UNVERIFIED";

  const humanReviewRequired =
    disputeOpen ||
    contradictions.length > 0 ||
    (HARMFUL_STATUSES.includes(implied) && (!publishable || confidenceScore < REVIEW_CONFIDENCE_FLOOR));

  const effectiveDate = ranked.length > 0 ? ranked[0].observedAt : undefined;

  const why = (() => {
    if (disputeOpen) return "A dispute is open on this business, so nothing is published and nothing downstream may be built while it stands.";
    if (contradictions.length > 0) return `${contradictions.length === 1 ? "A signal says" : `${contradictions.length} signals say`} this business is still trading. A contradiction goes to a person, never to a landing page.`;
    if (forClosure.length === 0) return "No usable closure signal. Either none was supplied, or every one came from a source or signal type this engine does not recognise.";
    if (!evidenceRuleMet) {
      const crowdOnly = groups.length > qualifyingGroups.length;
      return `${qualifyingGroups.length === 0 ? "No qualifying source" : `One qualifying source (${qualifyingGroups.join(", ")})`} and no official record. A closure needs an official register entry, or corroboration from two sources that could have failed independently.${crowdOnly ? " A report from a member of the public supports a case; it never makes one." : ""}`;
    }
    if (!meetsFloor) return `Evidence combines to ${confidenceScore}, below the ${PUBLISH_CONFIDENCE_FLOOR} floor for publishing something damaging about a named business.`;
    return `${official.length > 0 ? "An official record" : `${qualifyingGroups.length} independent sources`} put this at ${confidenceScore}.${humanReviewRequired ? " Above the publish floor but below the review floor, so a person confirms before anything goes live." : ""}`;
  })();

  return {
    businessId: input.businessId,
    status, confidenceScore, effectiveDate,
    evidence: weighed,
    humanReviewRequired, publishable,
    independentGroups: groups,
    qualifyingGroups,
    contradictions,
    why,
    assessedAt: input.assessedAt,
  };
}

// ---------------------------------------------------------------------------
// 3. Displaced demand — counted, or null
// ---------------------------------------------------------------------------

/**
 * The inputs that may produce a demand number. Every one is something somebody
 * COUNTED, and the field names say where it came from, so a reviewer can go and
 * check it. There is deliberately no field for a guess.
 */
export type CountedDemand = {
  /**
   * Monthly searches for the closed business BY NAME, from the SEO engine's
   * keyword data. The only direct measure of how many people were actively
   * looking for that business each month.
   */
  monthlyBrandedSearches?: number;
  /** Counted enquiries the platform itself recorded reaching that business. */
  recordedEnquiriesPerMonth?: number;
  /** Average order value the replacement business counted from its own sales. */
  averageOrderValueGbp?: number;
};

export type DisplacedDemand = {
  /** People per month now looking for this service with nowhere to go, or null. */
  customersPerMonth: number | null;
  /** Monthly value of that demand, or null. Never derived from a guessed AOV. */
  monthlyValueGbp: number | null;
  basis: string[];
  /** When either number is null, what to supply to get it. */
  missing: string[];
};

/**
 * WHY THIS RETURNS NULL SO READILY. "We estimate 340 displaced customers worth
 * £14,000 a month" is the sentence that sells this engine, and it is also the
 * sentence that is a lie in every case where nobody counted anything. There is
 * one accepted basis per number and no fallback, because a fallback is where the
 * invented figure gets in.
 */
export function estimateDisplacedDemand(counted: CountedDemand): DisplacedDemand {
  const basis: string[] = [];
  const missing: string[] = [];

  const searches = num(counted.monthlyBrandedSearches);
  const enquiries = num(counted.recordedEnquiriesPerMonth);

  let customersPerMonth: number | null = null;
  if (enquiries !== null) {
    customersPerMonth = Math.round(enquiries);
    basis.push(`${customersPerMonth} enquiries a month that this platform recorded reaching the closed business.`);
  } else if (searches !== null) {
    customersPerMonth = Math.round(searches);
    basis.push(`${customersPerMonth} searches a month for the business by name, from the keyword data.`);
  } else {
    missing.push("Monthly searches for the closed business by name (the SEO engine has this), or enquiries this platform recorded reaching it. Without one of the two there is no counted demand and this stays null.");
  }

  const aov = num(counted.averageOrderValueGbp);
  let monthlyValueGbp: number | null = null;
  if (customersPerMonth !== null && aov !== null) {
    monthlyValueGbp = Math.round(customersPerMonth * aov);
    basis.push(`Valued at the replacement business's own counted average order value of £${aov}.`);
  } else if (aov === null) {
    missing.push("The replacement business's average order value, counted from its own sales. A category average is not a substitute — it would make the value a guess wearing a currency symbol.");
  }

  return { customersPerMonth, monthlyValueGbp, basis, missing };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

// ---------------------------------------------------------------------------
// 4. The opportunity
// ---------------------------------------------------------------------------

export type CompetitionLevel = "open" | "contested" | "crowded";

export type ClosedBusiness = {
  id: string;
  name: string;
  category: string;
  city: string;
  postcodePrefix: string;
  serviceArea?: string[];
  services?: string[];
  priceTier?: 1 | 2 | 3 | 4;
  customerProfile?: string;
};

export type DemandOpportunity = {
  id: string;
  closedBusiness: ClosedBusiness;
  status: ClosureStatus;
  confidenceScore: number;
  effectiveDate?: string;
  services: string[];
  serviceArea: string[];
  displacedDemand: DisplacedDemand;
  /** Straight from supplied complaints. Never inferred, never invented. */
  unmetNeeds: string[];
  competitionLevel: CompetitionLevel;
  /** ISO. An opportunity nobody acted on stops being one. */
  expiresAt: string;
  createdAt: string;
};

/**
 * How long a displaced-demand opportunity is worth acting on.
 *
 * Not a policy number pulled from nowhere: it is how long the closed business's
 * search demand keeps arriving before the market has re-sorted itself and the
 * customers have found somebody. Shorter when the field is crowded, because the
 * competitors got there first.
 */
export const OPPORTUNITY_WINDOW_DAYS: Record<CompetitionLevel, number> = {
  open: 90,
  contested: 60,
  crowded: 30,
};

export function createOpportunity(input: {
  assessment: ClosureAssessment;
  closedBusiness: ClosedBusiness;
  counted?: CountedDemand;
  complaints?: string[];
  eligibleReplacements: number;
  createdAt: string;
}): { ok: false; error: string } | { ok: true; opportunity: DemandOpportunity } {
  const a = input.assessment;

  // NOTHING IS BUILT ON AN UNVERIFIED CLOSURE. This is the gate the whole file
  // exists to hold: not a warning banner on the opportunity, the absence of one.
  if (!a.publishable) {
    return { ok: false, error: `No opportunity is created from an unpublished closure. ${a.why}` };
  }
  if (!EXIT_STATUSES.includes(a.status)) {
    return { ok: false, error: `${a.status} is not a market exit. A business at risk is still serving its customers, and treating it as an opportunity is how a struggling business gets finished off by a competitor's ad budget.` };
  }

  const competitionLevel: CompetitionLevel =
    input.eligibleReplacements <= 2 ? "open" : input.eligibleReplacements <= 6 ? "contested" : "crowded";

  const created = new Date(input.createdAt);
  const expires = new Date(created.getTime() + OPPORTUNITY_WINDOW_DAYS[competitionLevel] * 86_400_000);

  return {
    ok: true,
    opportunity: {
      id: `mx_${input.closedBusiness.id}`,
      closedBusiness: input.closedBusiness,
      status: a.status,
      confidenceScore: a.confidenceScore,
      effectiveDate: a.effectiveDate,
      services: input.closedBusiness.services ?? [],
      serviceArea: input.closedBusiness.serviceArea ?? [input.closedBusiness.postcodePrefix],
      displacedDemand: estimateDisplacedDemand(input.counted ?? {}),
      unmetNeeds: (input.complaints ?? []).map((c) => c.trim()).filter(Boolean),
      competitionLevel,
      expiresAt: expires.toISOString(),
      createdAt: input.createdAt,
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Replacement matching
// ---------------------------------------------------------------------------

/**
 * The weights are the specification's, unchanged, and they are data rather than
 * arithmetic buried in a function so a test can assert they still sum to 100 and
 * a surface can print them beside the score. A ranking nobody can read is a
 * ranking nobody can challenge.
 */
export const MATCH_WEIGHTS = [
  { key: "serviceSimilarity", weight: 30, label: "Service similarity" },
  { key: "geographicCoverage", weight: 20, label: "Geographic coverage" },
  { key: "availability", weight: 15, label: "Availability" },
  { key: "reputation", weight: 15, label: "Reputation" },
  { key: "priceCompatibility", weight: 10, label: "Price compatibility" },
  { key: "responseConversion", weight: 10, label: "Response and conversion" },
] as const;

export type MatchFactor = (typeof MATCH_WEIGHTS)[number]["key"];

/**
 * A candidate is a marketplace `Provider` plus the four facts that decide
 * whether it may be offered at all. Kept as an extension rather than folded into
 * `Provider`, so nothing that already consumes providers changes meaning.
 */
export type ReplacementCandidate = {
  id: string;
  name: string;
  category: string;
  city: string;
  postcode: string;
  rating: number;
  reviews: number;
  priceTier: 1 | 2 | 3 | 4;
  responseMins: number;
  verified: boolean;
  booking: boolean;
  quotes: boolean;
  services: string[];
  /** Subscription live and the account in good standing. */
  active?: boolean;
  /** The business has said it can take work. Absence is not consent. */
  acceptingCustomers?: boolean;
  /** Leads a month it can actually serve. Absence means uncapped is not assumed. */
  capacityPerMonth?: number;
  /** Counted from its own outcomes. Never modelled. */
  conversionRate?: number;
  /** Plan id, for the capped tier influence in allocation. */
  planId?: string;
};

export type IneligibleCandidate = { id: string; name: string; reasons: string[] };

export type ReplacementMatch = {
  candidateId: string;
  name: string;
  matchScore: number;
  factors: Record<MatchFactor, number>;
  /** Why it scored what it scored, in the customer's language. */
  reasons: string[];
  /** Things the score could not measure, named rather than assumed away. */
  unmeasured: string[];
};

/**
 * ELIGIBILITY IS A GATE, NOT A PENALTY.
 *
 * A dormant or unverified business scoring 71 still appears in a ranked list,
 * and somebody sends it a customer. So these four are checked before anything is
 * scored and the failures come back separately, because "why is my business not
 * being offered these leads" is a question the platform must be able to answer.
 */
export function eligibility(c: ReplacementCandidate, o: DemandOpportunity): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (c.active === false) reasons.push("The account is not active.");
  if (!c.verified) reasons.push("The business is not verified.");
  if (c.acceptingCustomers === false) reasons.push("The business has said it is not taking new customers.");
  if (!c.booking && !c.quotes) reasons.push("It accepts neither bookings nor quote requests, so there is nowhere to send a customer.");
  if (!servesArea(c, o)) reasons.push(`It does not cover ${o.closedBusiness.city} ${o.closedBusiness.postcodePrefix}.`);
  if (c.capacityPerMonth === 0) reasons.push("Its stated capacity is zero.");
  return { eligible: reasons.length === 0, reasons };
}

function servesArea(c: ReplacementCandidate, o: DemandOpportunity): boolean {
  const sameCity = c.city.trim().toLowerCase() === o.closedBusiness.city.trim().toLowerCase();
  const areas = (o.serviceArea.length ? o.serviceArea : [o.closedBusiness.postcodePrefix]).map((a) => a.trim().toLowerCase());
  const pc = c.postcode.trim().toLowerCase();
  return sameCity || areas.some((a) => a && (pc.startsWith(a) || a.startsWith(pc)));
}

const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function matchReplacements(
  o: DemandOpportunity,
  candidates: ReplacementCandidate[],
): { matches: ReplacementMatch[]; ineligible: IneligibleCandidate[]; note: string } {
  const ineligible: IneligibleCandidate[] = [];
  const matches: ReplacementMatch[] = [];

  for (const c of candidates) {
    const e = eligibility(c, o);
    if (!e.eligible) { ineligible.push({ id: c.id, name: c.name, reasons: e.reasons }); continue; }

    const unmeasured: string[] = [];

    // Service similarity — overlap of what was lost with what is offered, with
    // the category as the floor. A same-category business with no listed
    // services is not a zero; a plumber is a plumber.
    const lost = new Set((o.services.length ? o.services : [o.closedBusiness.category]).map((s) => s.toLowerCase().trim()));
    const has = new Set(c.services.map((s) => s.toLowerCase().trim()));
    let overlap = 0;
    for (const s of lost) if (has.has(s)) overlap++;
    const categoryMatch = c.category.trim().toLowerCase() === o.closedBusiness.category.trim().toLowerCase();
    const serviceSimilarity = lost.size === 0
      ? (categoryMatch ? 70 : 0)
      : pct(Math.max(categoryMatch ? 55 : 0, (overlap / lost.size) * 100));
    if (c.services.length === 0) unmeasured.push("It has listed no individual services, so similarity rests on the category alone.");

    // Geography — the district beats the city, because a displaced customer
    // travels the distance they used to travel and no further.
    const sameDistrict = c.postcode.trim().toLowerCase().startsWith(o.closedBusiness.postcodePrefix.trim().toLowerCase());
    const sameCity = c.city.trim().toLowerCase() === o.closedBusiness.city.trim().toLowerCase();
    const geographicCoverage = sameDistrict ? 100 : sameCity ? 70 : 40;

    // Availability — capacity it stated, and whether a customer can act now.
    const capacityKnown = typeof c.capacityPerMonth === "number";
    const availability = pct(
      (c.booking ? 45 : c.quotes ? 30 : 0) +
      (capacityKnown ? Math.min(35, (c.capacityPerMonth as number) * 3.5) : 15) +
      Math.max(0, 20 - c.responseMins / 6),
    );
    if (!capacityKnown) unmeasured.push("It has not stated a monthly capacity, so availability is scored on booking and response only.");

    // Reputation — rating carries it, review depth qualifies it. Same shape the
    // marketplace's discovery score uses, so the two never disagree about who
    // is well regarded.
    const reputation = pct((c.rating / 5) * 75 + Math.min(25, Math.log10(c.reviews + 1) * 15));

    // Price compatibility — distance from the closed business's tier. Unknown
    // tier scores neutral rather than perfect: not knowing is not a match.
    const priceCompatibility = typeof o.closedBusiness.priceTier === "number"
      ? pct(100 - Math.abs(c.priceTier - o.closedBusiness.priceTier) * 30)
      : 60;
    if (typeof o.closedBusiness.priceTier !== "number") unmeasured.push("The closed business's price tier is unknown, so price compatibility is neutral rather than scored.");

    // Response and conversion — conversion only when it was counted.
    const responseScore = Math.max(0, 100 - c.responseMins / 1.5);
    const responseConversion = typeof c.conversionRate === "number"
      ? pct(responseScore * 0.5 + clamp01(c.conversionRate) * 100 * 0.5)
      : pct(responseScore);
    if (typeof c.conversionRate !== "number") unmeasured.push("No counted conversion rate yet, so this factor is response time alone.");

    const factors: Record<MatchFactor, number> = {
      serviceSimilarity, geographicCoverage, availability, reputation, priceCompatibility, responseConversion,
    };
    const matchScore = Math.round(
      MATCH_WEIGHTS.reduce((sum, w) => sum + factors[w.key] * (w.weight / 100), 0),
    );

    const reasons: string[] = [];
    if (categoryMatch) reasons.push(`Same trade as ${o.closedBusiness.name}.`);
    if (overlap > 0) reasons.push(`Offers ${overlap} of the ${lost.size} services that were lost.`);
    if (sameDistrict) reasons.push(`In ${o.closedBusiness.postcodePrefix}, the same district.`);
    else if (sameCity) reasons.push(`In ${o.closedBusiness.city}.`);
    if (c.rating >= 4.5 && c.reviews >= 25) reasons.push(`${c.rating} from ${c.reviews} reviews.`);
    if (c.responseMins <= 30) reasons.push("Typically replies within half an hour.");
    if (c.booking) reasons.push("Takes bookings online.");

    matches.push({ candidateId: c.id, name: c.name, matchScore, factors, reasons, unmeasured });
  }

  matches.sort((a, b) => b.matchScore - a.matchScore || a.candidateId.localeCompare(b.candidateId));

  const note = matches.length === 0
    ? `No eligible business can serve ${o.closedBusiness.city} ${o.closedBusiness.postcodePrefix} for ${o.closedBusiness.category}. That is a coverage gap, not an empty result — see coverageGap().`
    : `${matches.length} eligible ${matches.length === 1 ? "business" : "businesses"}, ${ineligible.length} excluded before scoring.`;

  return { matches, ineligible, note };
}

/** What the platform must go and recruit. §7's coverage gaps, as a value. */
export type CoverageGap = {
  category: string;
  city: string;
  postcodePrefix: string;
  eligibleCount: number;
  ineligibleCount: number;
  /** The commonest reason eligible businesses were excluded, if there is one. */
  commonestBlocker: string | null;
  demandCustomersPerMonth: number | null;
  severity: "critical" | "thin" | "covered";
};

export function coverageGap(
  o: DemandOpportunity,
  result: { matches: ReplacementMatch[]; ineligible: IneligibleCandidate[] },
): CoverageGap {
  const counts = new Map<string, number>();
  for (const i of result.ineligible) for (const r of i.reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  let commonestBlocker: string | null = null;
  let best = 0;
  for (const [r, n] of counts) if (n > best) { best = n; commonestBlocker = r; }

  return {
    category: o.closedBusiness.category,
    city: o.closedBusiness.city,
    postcodePrefix: o.closedBusiness.postcodePrefix,
    eligibleCount: result.matches.length,
    ineligibleCount: result.ineligible.length,
    commonestBlocker,
    demandCustomersPerMonth: o.displacedDemand.customersPerMonth,
    severity: result.matches.length === 0 ? "critical" : result.matches.length <= 2 ? "thin" : "covered",
  };
}

// ---------------------------------------------------------------------------
// 6. Mandatory controls (§8) — refusals, not reminders
// ---------------------------------------------------------------------------

export const MANDATORY_CONTROLS = [
  "The closed business's own customer database is never scraped, bought or reused. Demand is reached through public search and advertising, the same way any competitor would reach it.",
  "Nothing published may imply affiliation with, endorsement by, or succession from the closed business.",
  "Every replacement recommendation is labelled as an independent recommendation from MarketWar OS.",
  "Consent is recorded before any customer outreach, through the same gate every other campaign uses.",
  "Any business may dispute or correct its closure classification, and the dispute blocks publication while it stands.",
] as const;

/** The sentence that must appear on anything this engine publishes. */
export const REQUIRED_DISCLOSURE =
  "Independent recommendation. We are not affiliated with, endorsed by or a successor to this business.";

/**
 * Input fields that mean somebody is trying to feed us the closed company's
 * customer list. Refused by NAME, at the door, because "do not use their
 * database" written in a runbook has never once stopped a paste.
 */
export const PROHIBITED_INPUT_FIELDS = [
  "customerDatabase", "customerRecords", "customerList", "contactList",
  "importedContacts", "mailingList", "subscriberList", "crmExport", "clientList",
] as const;

/** Phrases that assert a relationship the platform does not have. */
const AFFILIATION_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\b(official|authorised|authorized|approved)\s+(successor|replacement|partner|alternative)\b/i, why: "asserts an authorisation nobody gave" },
  { re: /\b(now|formerly)\s+trading\s+as\b/i, why: "claims the closed business continues under a new name" },
  { re: /\bwe\s+(have\s+)?(taken\s+over|acquired|bought|absorbed)\b/i, why: "claims an acquisition" },
  { re: /\bon\s+behalf\s+of\b/i, why: "claims to act for the closed business" },
  { re: /\btheir\s+(customers|clients|bookings)\s+(are|have\s+been)\s+transferred\b/i, why: "claims customers were handed over" },
  { re: /\b(in\s+)?partnership\s+with\b/i, why: "claims a partnership" },
  { re: /\bendorsed\s+by\b/i, why: "claims an endorsement" },
  { re: /\b(successor|continuation)\s+(to|of)\b/i, why: "claims succession" },
];

export type ControlFinding = { control: string; detail: string };

/**
 * Screen everything this engine is about to publish or act on.
 *
 * Returns refusals rather than warnings: the caller cannot proceed past a
 * non-empty `refusals`, and the API route enforces that. A control that returns
 * advice is a control that gets logged and ignored.
 */
export function screenPublication(input: {
  copy?: string;
  closedBusinessName?: string;
  /** The raw request, so prohibited fields are caught wherever they arrived. */
  payload?: Record<string, unknown>;
  consentRecorded?: boolean;
  /** True when the copy is customer outreach rather than a public page. */
  isOutreach?: boolean;
}): { ok: boolean; refusals: ControlFinding[]; warnings: ControlFinding[] } {
  const refusals: ControlFinding[] = [];
  const warnings: ControlFinding[] = [];

  for (const field of PROHIBITED_INPUT_FIELDS) {
    if (input.payload && Object.prototype.hasOwnProperty.call(input.payload, field)) {
      refusals.push({
        control: MANDATORY_CONTROLS[0],
        detail: `"${field}" was supplied. The closed business's customer data is never accepted here, whatever its provenance is said to be.`,
      });
    }
  }

  const copy = String(input.copy ?? "");
  if (copy) {
    // THE DISCLOSURE IS NOT A VIOLATION OF ITSELF.
    //
    // "We are not affiliated with, endorsed by or a successor to this business"
    // contains "endorsed by" and "successor to", so the first version of this
    // function refused every correctly-labelled page — the mandatory line made
    // the control fail. Same defect class as a test that fails on its own
    // comment: the checker was matching text it had put there.
    //
    // The disclosure is removed before scanning, and negated forms are skipped,
    // so a business writing its own "we are not endorsed by them" is not caught
    // either. What remains to scan is the copy's actual claims.
    const scannable = stripNegations(copy.split(REQUIRED_DISCLOSURE).join(" "));
    for (const p of AFFILIATION_PATTERNS) {
      const m = scannable.match(p.re);
      if (m) refusals.push({ control: MANDATORY_CONTROLS[1], detail: `"${m[0].trim()}" ${p.why}.` });
    }
    if (!copy.includes(REQUIRED_DISCLOSURE)) {
      refusals.push({ control: MANDATORY_CONTROLS[2], detail: "The disclosure line is missing. Anything naming a closed business carries it." });
    }
    const name = String(input.closedBusinessName ?? "").trim();
    if (name && new RegExp(`\\b(?:from|by|at)\\s+${escapeRe(name)}\\b`, "i").test(copy)) {
      warnings.push({ control: MANDATORY_CONTROLS[1], detail: `The copy reads as though it comes from ${name}. Name them as the business that closed, never as the sender.` });
    }
  }

  if (input.isOutreach && input.consentRecorded !== true) {
    refusals.push({
      control: MANDATORY_CONTROLS[3],
      detail: "Outreach without a recorded consent. Displaced customers are strangers to the recommended business, and a closure is not a lawful basis for contacting them.",
    });
  }

  return { ok: refusals.length === 0, refusals, warnings };
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/**
 * Blank out clauses that DENY a relationship, so the denial is not read as the
 * claim. "We are not a successor to Kingsway" says the opposite of what the
 * pattern list is hunting, and refusing it would push writers toward saying
 * nothing — which is the outcome the controls exist to prevent.
 */
function stripNegations(copy: string): string {
  return copy.replace(
    /\b(?:are|is|was|were|am)\s+not\s+[^.!?;]*/gi,
    " ",
  ).replace(/\bno\s+(?:affiliation|connection|association|relationship)\b[^.!?;]*/gi, " ");
}

// ---------------------------------------------------------------------------
// 7. Lifecycle (§6)
// ---------------------------------------------------------------------------

export const EXIT_STAGES = [
  "detected", "verified", "opportunity_created", "matched",
  "campaign_active", "lead_captured", "consent_recorded",
  "lead_distributed", "converted", "revenue_attributed",
] as const;
export type ExitStage = (typeof EXIT_STAGES)[number];

/** Where a disputed or withdrawn record goes. Terminal until reopened. */
export const EXIT_TERMINAL = ["disputed", "withdrawn"] as const;
export type ExitTerminal = (typeof EXIT_TERMINAL)[number];
export type ExitState = ExitStage | ExitTerminal;

const NEXT: Record<ExitState, ExitState[]> = {
  detected: ["verified", "withdrawn", "disputed"],
  verified: ["opportunity_created", "withdrawn", "disputed"],
  opportunity_created: ["matched", "withdrawn", "disputed"],
  matched: ["campaign_active", "withdrawn", "disputed"],
  campaign_active: ["lead_captured", "withdrawn", "disputed"],
  lead_captured: ["consent_recorded", "withdrawn", "disputed"],
  consent_recorded: ["lead_distributed", "withdrawn", "disputed"],
  lead_distributed: ["converted", "withdrawn", "disputed"],
  converted: ["revenue_attributed", "disputed"],
  revenue_attributed: ["disputed"],
  // A dispute can be resolved back to where it came from — see `advance`.
  disputed: ["detected", "withdrawn"],
  withdrawn: ["detected"],
};

/**
 * Advance the pipeline, or say why not.
 *
 * NOTHING SKIPS CONSENT. `lead_captured → lead_distributed` is not a legal move,
 * so a lead cannot reach a business without a recorded consent even if every
 * surface above forgets to ask. That is the one transition worth the whole state
 * machine, and every other stage is here so that one cannot be routed around.
 */
export function advance(from: ExitState, to: ExitState): { ok: true } | { ok: false; error: string } {
  const allowed = NEXT[from] ?? [];
  if (allowed.includes(to)) return { ok: true };
  if (from === "lead_captured" && to === "lead_distributed") {
    return { ok: false, error: "A captured lead is distributed only after consent is recorded. Record the consent first — there is no path around this one." };
  }
  return { ok: false, error: `A record at "${from}" may go to ${allowed.map((a) => `"${a}"`).join(", ")}. "${to}" is not one of them.` };
}

// ---------------------------------------------------------------------------
// 8. Allocation (§6) — quality and capacity, never payment alone
// ---------------------------------------------------------------------------

/**
 * The most of the allocation weight a subscription tier may ever contribute.
 *
 * The specification's instruction is "not solely by highest payment", and a
 * percentage is the only way to make that testable. At 15%, a Global-tier
 * business with a mediocre match still loses to a Starter with a good one, which
 * is the behaviour a customer being handed to a supplier deserves.
 */
export const TIER_MAX_INFLUENCE = 0.15;

const TIER_RANK: Record<string, number> = {
  free: 0, starter: 0.2, growth: 0.4, scale: 0.55, business: 0.7, enterprise: 0.85, corporate: 0.95, global: 1,
};

export type Allocation = {
  candidateId: string;
  name: string;
  leads: number;
  matchScore: number;
  capacityPerMonth: number | null;
  /** Why this business got this many. */
  why: string;
};

export type AllocationResult = {
  allocations: Allocation[];
  /** Leads nobody had capacity for. Never silently dropped. */
  unallocated: number;
  note: string;
};

/**
 * Distribute captured leads across matched businesses.
 *
 * Weight = match quality (85%) + subscription tier (at most 15%), and capacity
 * is a hard ceiling rather than another weight — a business that can serve eight
 * customers a month is not helped by being sent thirty, and neither is the
 * customer who waits a week for a reply.
 */
export function allocateLeads(input: {
  leads: number;
  matches: ReplacementMatch[];
  candidates: ReplacementCandidate[];
}): AllocationResult {
  const byId = new Map(input.candidates.map((c) => [c.id, c]));
  const total = Math.max(0, Math.floor(input.leads));
  if (total === 0 || input.matches.length === 0) {
    return { allocations: [], unallocated: total, note: input.matches.length === 0 ? "No matched business to distribute to." : "No leads to distribute." };
  }

  const weighted = input.matches.map((m) => {
    const c = byId.get(m.candidateId);
    const tier = TIER_RANK[String(c?.planId ?? "").toLowerCase()] ?? 0;
    const weight = (m.matchScore / 100) * (1 - TIER_MAX_INFLUENCE) + tier * TIER_MAX_INFLUENCE;
    return { m, c, weight, cap: typeof c?.capacityPerMonth === "number" ? c.capacityPerMonth : null, got: 0 };
  }).sort((a, b) => b.weight - a.weight || a.m.candidateId.localeCompare(b.m.candidateId));

  // PROPORTIONAL TO WEIGHT, THEN CAPPED.
  //
  // The first version handed out one lead at a time in weight order, which is a
  // round-robin wearing a ranking: a 95-scoring business and a 30-scoring one
  // split fifteen leads 8/7, because the ORDER was used and the MAGNITUDE was
  // thrown away. A customer handed to the second-best fit deserves better odds
  // than a coin toss.
  //
  // So: each business's share of the total weight, floored; the remainder goes
  // in weight order; capacity truncates and what it truncates is redistributed
  // to whoever still has room. Nothing is silently dropped — a lead nobody can
  // serve comes back as `unallocated`, which is a recruitment signal.
  const sumWeight = weighted.reduce((s, w) => s + w.weight, 0);
  let remaining = total;
  if (sumWeight > 0) {
    for (const w of weighted) {
      const share = Math.floor((w.weight / sumWeight) * total);
      const give = w.cap !== null ? Math.min(share, w.cap) : share;
      w.got = give; remaining -= give;
    }
  }
  // The remainder, and anything capacity sent back, in weight order.
  let progress = true;
  while (remaining > 0 && progress) {
    progress = false;
    for (const w of weighted) {
      if (remaining === 0) break;
      if (w.cap !== null && w.got >= w.cap) continue;
      w.got++; remaining--; progress = true;
    }
  }

  const allocations: Allocation[] = weighted
    .filter((w) => w.got > 0)
    .map((w) => ({
      candidateId: w.m.candidateId,
      name: w.m.name,
      leads: w.got,
      matchScore: w.m.matchScore,
      capacityPerMonth: w.cap,
      why: w.cap !== null && w.got >= w.cap
        ? `Filled to its stated capacity of ${w.cap} a month.`
        : `Match ${w.m.matchScore}/100${w.c?.planId ? ` on the ${w.c.planId} plan` : ""} — quality decides the order, the plan moves it by at most ${Math.round(TIER_MAX_INFLUENCE * 100)}%.`,
    }));

  return {
    allocations,
    unallocated: remaining,
    note: remaining > 0
      ? `${remaining} of ${total} ${remaining === 1 ? "lead has" : "leads have"} nowhere to go — every matched business is at its stated capacity. That is a recruitment signal, not a rounding error.`
      : `${total} ${total === 1 ? "lead" : "leads"} across ${allocations.length} ${allocations.length === 1 ? "business" : "businesses"}.`,
  };
}

// ---------------------------------------------------------------------------
// 9. Demo — deterministic, and it demonstrates the refusals too
// ---------------------------------------------------------------------------

export function demoMarketExit() {
  const assessedAt = "2026-08-27T09:00:00.000Z";

  // A real, publishable closure: an official record plus a second independent
  // source. This is what the engine is for.
  const good = assessClosure({
    businessId: "biz_kingsway_plumbing",
    assessedAt,
    signals: [
      { businessId: "biz_kingsway_plumbing", source: "company_register", signalType: "dissolution", observedAt: "2026-08-14T00:00:00.000Z", confidence: 0.95, evidenceUrl: "https://example-register.gov/entry/1" },
      { businessId: "biz_kingsway_plumbing", source: "business_website", signalType: "closure_announcement", observedAt: "2026-08-10T00:00:00.000Z", confidence: 0.9 },
    ],
  });

  // The case the engine exists to refuse: two Google observations, which are one
  // observation, plus a stranger's web form asserting certainty.
  const refused = assessClosure({
    businessId: "biz_pinevale_dental",
    assessedAt,
    signals: [
      { businessId: "biz_pinevale_dental", source: "google_business_profile", signalType: "status_permanently_closed", observedAt: "2026-08-20T00:00:00.000Z", confidence: 0.9 },
      { businessId: "biz_pinevale_dental", source: "google_maps_status", signalType: "status_permanently_closed", observedAt: "2026-08-20T00:00:00.000Z", confidence: 0.9 },
      { businessId: "biz_pinevale_dental", source: "user_report", signalType: "closure_announcement", observedAt: "2026-08-21T00:00:00.000Z", confidence: 1 },
    ],
  });

  const closedBusiness: ClosedBusiness = {
    id: "kingsway_plumbing", name: "Kingsway Plumbing", category: "Plumber",
    city: "Leeds", postcodePrefix: "LS6", priceTier: 2,
    services: ["boiler repair", "emergency callout", "bathroom fitting"],
    customerProfile: "Homeowners and small landlords in north Leeds.",
  };

  const candidates: ReplacementCandidate[] = [
    { id: "p1", name: "Northgate Heating", category: "Plumber", city: "Leeds", postcode: "LS6 3QA", rating: 4.7, reviews: 210, priceTier: 2, responseMins: 22, verified: true, booking: true, quotes: true, services: ["boiler repair", "emergency callout", "bathroom fitting"], active: true, acceptingCustomers: true, capacityPerMonth: 12, conversionRate: 0.31, planId: "starter" },
    { id: "p2", name: "Aire Valley Plumbing", category: "Plumber", city: "Leeds", postcode: "LS12 1BB", rating: 4.4, reviews: 88, priceTier: 3, responseMins: 55, verified: true, booking: false, quotes: true, services: ["boiler repair"], active: true, acceptingCustomers: true, capacityPerMonth: 20, planId: "global" },
    { id: "p3", name: "Dormant Drains Ltd", category: "Plumber", city: "Leeds", postcode: "LS6 1AA", rating: 4.9, reviews: 400, priceTier: 2, responseMins: 10, verified: false, booking: true, quotes: true, services: ["emergency callout"], active: false, acceptingCustomers: true, planId: "enterprise" },
  ];

  const created = createOpportunity({
    assessment: good, closedBusiness,
    // Searches counted, average order value NOT supplied — so the demo shows a
    // real customer count beside a null money figure that says what is missing.
    // That is the honest shape, and it is the shape a demo should teach.
    counted: { monthlyBrandedSearches: 140 },
    complaints: ["Nobody local does same-day boiler callouts any more."],
    eligibleReplacements: 2,
    createdAt: assessedAt,
  });

  const opportunity = created.ok ? created.opportunity : null;
  const matched = opportunity ? matchReplacements(opportunity, candidates) : { matches: [], ineligible: [], note: "" };
  const allocation = allocateLeads({ leads: 15, matches: matched.matches, candidates });

  return {
    publishable: good,
    refused,
    opportunity,
    opportunityRefusal: created.ok ? null : created.error,
    matched,
    coverage: opportunity ? coverageGap(opportunity, matched) : null,
    allocation,
    screening: screenPublication({
      copy: `Looking for an alternative to Kingsway Plumbing? We have taken over their bookings. ${REQUIRED_DISCLOSURE}`,
      closedBusinessName: "Kingsway Plumbing",
    }),
  };
}
