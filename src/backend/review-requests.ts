// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Review Request Engine — how a business gets MORE REAL REVIEWS.
//
// WHY THIS MODULE EXISTS, AND WHAT IT DELIBERATELY DOES NOT DO.
//
// The ask that produced it was for supplied Facebook reviews "with time
// difference" and local page followers "with English names". This engine is the
// legitimate half of that ask, built properly; the fabricated half is not built
// here and will not be, for four reasons that are about the customer's outcome
// rather than about taste:
//
//  1. It is illegal where our customers trade. In the UK the Digital Markets,
//     Competition and Consumers Act 2024 makes commissioning, submitting or
//     hosting fake reviews a banned practice, enforceable by the CMA with fines
//     to 10% of GLOBAL turnover — and the liability lands on the trader whose
//     page carries them. The US FTC's rule on fake reviews and testimonials
//     (16 CFR Part 465, effective 2024) does the same with civil penalties per
//     violation.
//  2. The penalty lands on the CUSTOMER'S page, not on us. Meta, Google and
//     Trustpilot all treat purchased reviews and purchased followers as
//     inauthentic behaviour; the outcomes are review-stripping, a public
//     "suspected fake activity" notice on a Trustpilot profile, and Business
//     Profile suspension. A page that loses its profile ranks nowhere at all,
//     which is the opposite of the thing being bought.
//  3. It does not survive the detectors — including OURS. `fakeReviewRisk()` in
//     src/backend/reputation.ts already flags near-duplicate text, unverified
//     authors and incentivised language. A batch of supplied reviews staggered
//     over time is exactly that shape, so the platform we sell would mark the
//     customer's own reviews as manipulated.
//  4. Bought followers make the reach WORSE. Distribution is chosen on
//     engagement rate; adding accounts that never engage divides the same
//     engagement across a bigger denominator, so the page is shown to fewer
//     real people afterwards than before.
//
// So: the engine below asks REAL past customers, on the platforms that actually
// move discovery, in the way each platform's own rules permit. Everything it
// emits is a draft the customer sends to a person they really served.
//
// The one rule that is enforced in code rather than in prose is NO GATING.
// Screening for happy customers first — "how did we do? …only the 5s get the
// review link" — is itself a banned practice under the DMCC Act and the FTC
// rule, and is explicitly against Google's and Trustpilot's policies. The
// eligibility function cannot take a rating or sentiment input, and
// `gatingCheck()` rejects a request that tries to supply one.

import { safeHref } from "@/shared/safe-link";

// ---------------------------------------------------------------------------
// The platforms
// ---------------------------------------------------------------------------
export type ReviewPlatformId =
  | "google" | "facebook" | "trustpilot" | "tripadvisor"
  | "yelp" | "amazon" | "g2" | "capterra" | "checkatrade";

// What each platform's own policy says about ASKING. This is not our opinion of
// each platform; it is what they publish, and it changes what the engine will
// generate for them.
export type AskPolicy =
  | "encouraged"          // the platform tells you to ask
  | "allowed-with-rules"  // asking is fine inside stated limits
  | "restricted"          // only through the platform's own mechanism
  | "prohibited";         // the platform forbids soliciting reviews

export type ReviewPlatform = {
  id: ReviewPlatformId;
  label: string;
  host: string;                      // used to validate a pasted review link
  ask: AskPolicy;
  // What the customer must supply for us to BUILD the link. null means we do
  // not build it: they paste their own review URL and we only check the host.
  // We never guess a URL format — a review link that 404s costs a review.
  identifier: string | null;
  identifierHint: string;
  buildLink: ((identifier: string) => string | null) | null;
  rules: string[];
  // What reviews on this platform actually do for being found. Stated narrowly:
  // where a platform documents an effect we say so, and where it does not we
  // say that instead of implying one.
  discoveryEffect: string;
};

const cleanDomain = (s: string): string =>
  (s || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/[^a-z0-9.-]/g, "");

const cleanSlug = (s: string): string =>
  (s || "").trim()
    .replace(/^https?:\/\/(www\.)?facebook\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/[^A-Za-z0-9.\-_]/g, "");

export const REVIEW_PLATFORMS: ReviewPlatform[] = [
  {
    id: "google",
    label: "Google Business Profile",
    host: "google.com",
    ask: "encouraged",
    identifier: "Place ID",
    identifierHint: "Your Place ID from the Google Business Profile dashboard (looks like ChIJ…). Google's own Place ID finder returns it.",
    buildLink: (placeId) => {
      const id = (placeId || "").trim();
      if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return null;
      return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id)}`;
    },
    rules: [
      "Asking is allowed and Google publishes guidance on doing it.",
      "No incentives of any kind — money, discounts, entries into a prize draw.",
      "No gating: you may not ask how they felt first and send the link only to the happy ones.",
      "Ask from a person, not from a kiosk on your own wifi — a burst of reviews from one IP is filtered.",
    ],
    discoveryEffect:
      "Google documents review count and score as part of Prominence, one of the three local-ranking factors alongside Relevance and Distance. This is the platform where more real reviews genuinely does move where you appear.",
  },
  {
    id: "facebook",
    label: "Facebook Recommendations",
    host: "facebook.com",
    ask: "allowed-with-rules",
    identifier: "Page name or ID",
    identifierHint: "The part after facebook.com/ in your Page's address, or your numeric Page ID.",
    buildLink: (slug) => {
      const s = cleanSlug(slug);
      if (!s || s.length < 2) return null;
      return `https://www.facebook.com/${s}/reviews`;
    },
    rules: [
      "Facebook replaced star ratings with Recommendations in 2018 — people answer yes/no and write why, so a request that asks for '5 stars' asks for something that no longer exists.",
      "Recommendations must be turned on in Page Settings or the link goes nowhere.",
      "Meta treats bought reviews and bought followers as inauthentic behaviour; enforcement is against your Page.",
    ],
    discoveryEffect:
      "Recommendations build social proof for people already looking at the Page, and Meta surfaces them in local search on-platform. They are not indexed as Google reviews, so they do not feed the Google local pack.",
  },
  {
    id: "trustpilot",
    label: "Trustpilot",
    host: "trustpilot.com",
    ask: "allowed-with-rules",
    identifier: "Your website domain",
    identifierHint: "The domain your Trustpilot profile is registered to, e.g. evandeli.com.",
    buildLink: (domain) => {
      const d = cleanDomain(domain);
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return null;
      return `https://www.trustpilot.com/evaluate/${d}`;
    },
    rules: [
      "Invitations must go to ALL customers of the same kind, not a chosen subset — cherry-picking is a policy breach as well as a legal one.",
      "No incentives, and no asking for the review to be changed or removed.",
      "Trustpilot publicly labels profiles it believes are manipulating reviews; the notice is visible to your customers.",
    ],
    discoveryEffect:
      "Trustpilot profiles rank for '<brand> reviews' searches and the rating can appear as a rich snippet on your own pages when marked up honestly. Reviews here mostly affect what someone finds when they check you out, rather than whether they find you at all.",
  },
  {
    id: "tripadvisor",
    label: "Tripadvisor",
    host: "tripadvisor.com",
    ask: "allowed-with-rules",
    identifier: null,
    identifierHint: "Paste your listing's 'Write a review' link — Tripadvisor's review URLs contain internal geo/location ids we will not guess.",
    buildLink: null,
    rules: [
      "Asking is allowed; incentives and asking only happy guests are not.",
      "Ask everyone from the same stay or sitting, not the ones who smiled.",
    ],
    discoveryEffect:
      "Ranking on Tripadvisor is driven by review quality, recency and volume within the listing's own popularity index. It moves your position on Tripadvisor, not on Google.",
  },
  {
    id: "yelp",
    label: "Yelp",
    host: "yelp.com",
    ask: "prohibited",
    identifier: null,
    identifierHint: "Yelp forbids asking, so no request link is generated for it.",
    buildLink: null,
    rules: [
      "Yelp's Don't Ask for Reviews policy prohibits soliciting reviews at all — including a polite email to a real customer.",
      "Yelp's recommendation software also suppresses reviews it believes were solicited, so an ask can remove reviews you already had.",
      "Put the Yelp badge on your site and let people find it; that is the compliant way to grow it.",
    ],
    discoveryEffect:
      "Yelp reviews affect Yelp's own ranking and the listings Apple Maps draws from Yelp. Requesting them is not an available lever.",
  },
  {
    id: "amazon",
    label: "Amazon",
    host: "amazon.com",
    ask: "restricted",
    identifier: null,
    identifierHint: "Use Amazon's own Request a Review button in Seller Central — outside messages asking for reviews breach the Communication Guidelines.",
    buildLink: null,
    rules: [
      "Only Amazon's own Request a Review button, once per order, inside their window.",
      "No incentives, no asking for positive reviews, no diverting unhappy buyers to support instead of the review form.",
    ],
    discoveryEffect:
      "Reviews and rating feed Amazon's own search ranking and the buy box. Nothing outside Amazon is affected.",
  },
  {
    id: "g2",
    label: "G2",
    host: "g2.com",
    ask: "allowed-with-rules",
    identifier: null,
    identifierHint: "Paste your G2 product review link from your vendor dashboard.",
    buildLink: null,
    rules: [
      "Asking your customers is allowed and normal in B2B software.",
      "Incentives are only permitted through G2's own programme, never yours privately.",
      "Reviewers are verified by G2 — a colleague reviewing your own product will be removed.",
    ],
    discoveryEffect:
      "G2 category pages rank strongly for '<category> software' searches and are heavily cited by AI assistants answering software questions. Volume and recency decide grid placement.",
  },
  {
    id: "capterra",
    label: "Capterra",
    host: "capterra.com",
    ask: "allowed-with-rules",
    identifier: null,
    identifierHint: "Paste your Capterra review link from your vendor portal.",
    buildLink: null,
    rules: [
      "Asking is allowed; Capterra runs its own incentive scheme and yours is not permitted alongside it.",
      "Reviews are screened for employment relationship and proof of use.",
    ],
    discoveryEffect:
      "Capterra and its sister sites rank for software comparison searches and are a common AI-assistant source. Reviews move you inside the category list.",
  },
  {
    id: "checkatrade",
    label: "Checkatrade",
    host: "checkatrade.com",
    ask: "allowed-with-rules",
    identifier: null,
    identifierHint: "Paste your member feedback link from your Checkatrade account.",
    buildLink: null,
    rules: [
      "Members are expected to collect feedback from every job, not selected ones.",
      "Checkatrade verifies feedback against the job record, so a review with no matching job is removed.",
    ],
    discoveryEffect:
      "Feedback volume and score decide where you sit in Checkatrade's trade listings for your postcode — the search a homeowner actually runs when they need a trade.",
  },
];

export const platform = (id: string): ReviewPlatform | null =>
  REVIEW_PLATFORMS.find((p) => p.id === id) || null;

export const askablePlatforms = (): ReviewPlatform[] =>
  REVIEW_PLATFORMS.filter((p) => p.ask === "encouraged" || p.ask === "allowed-with-rules");

// ---------------------------------------------------------------------------
// The review link. Built from an identifier the customer supplies, or pasted by
// them and validated — never invented, because a link that 404s costs a review
// and a link to the wrong business costs somebody else a review.
// ---------------------------------------------------------------------------
export type LinkResult =
  | { ok: true; url: string; source: "built" | "pasted" }
  | { ok: false; error: string; hint: string };

export function reviewLink(platformId: string, input: { identifier?: string; pastedUrl?: string }): LinkResult {
  const p = platform(platformId);
  if (!p) return { ok: false, error: `Unknown platform "${platformId}"`, hint: `Known: ${REVIEW_PLATFORMS.map((x) => x.id).join(", ")}` };
  if (p.ask === "prohibited") {
    return { ok: false, error: `${p.label} forbids asking for reviews, so no request link is produced.`, hint: p.rules[0] };
  }

  const pasted = (input.pastedUrl || "").trim();
  if (pasted) {
    const safe = safeHref(pasted);
    if (!safe || !safe.external) return { ok: false, error: "That is not an http(s) link.", hint: p.identifierHint };
    let host = "";
    try { host = new URL(safe.href).hostname.toLowerCase(); } catch { return { ok: false, error: "That link could not be parsed.", hint: p.identifierHint }; }
    // Suffix match on a dot boundary so "notyelp.com" cannot pass as "yelp.com".
    if (host !== p.host && !host.endsWith(`.${p.host}`)) {
      return { ok: false, error: `That link is on ${host}, not ${p.host}.`, hint: p.identifierHint };
    }
    return { ok: true, url: safe.href, source: "pasted" };
  }

  const ident = (input.identifier || "").trim();
  if (!ident) return { ok: false, error: `${p.label} needs ${p.identifier ? `your ${p.identifier}` : "your review link pasted in"}.`, hint: p.identifierHint };
  if (!p.buildLink) return { ok: false, error: `We do not construct ${p.label} review links — paste yours instead.`, hint: p.identifierHint };
  const built = p.buildLink(ident);
  if (!built) return { ok: false, error: `That does not look like a ${p.identifier}.`, hint: p.identifierHint };
  return { ok: true, url: built, source: "built" };
}

// ---------------------------------------------------------------------------
// NO GATING — enforced, not merely stated.
// ---------------------------------------------------------------------------
export const NO_GATING_DOCTRINE =
  "Every eligible customer gets the same link. Asking how someone felt first and " +
  "routing only the happy ones to the review form ('review gating') is a banned " +
  "practice under the UK DMCC Act 2024 and the US FTC rule on fake reviews, and " +
  "breaches Google's and Trustpilot's policies. Eligibility here is decided by " +
  "whether the person really bought something and when — never by what they " +
  "thought of it.";

// Keys that would turn a request campaign into a gated one. Checked against the
// raw request body, because the intent arrives as a filter long before it
// arrives as a plan.
export const GATING_KEYS = [
  "minRating", "maxRating", "ratingAbove", "ratingAtLeast", "filterByRating",
  "happyOnly", "onlyPositive", "positiveOnly", "excludeUnhappy", "excludeNegative",
  "sentiment", "sentimentAbove", "satisfaction", "satisfactionAbove", "npsAbove",
  "prescreen", "preScreen", "screenFirst",
];

export function gatingCheck(raw: Record<string, unknown>): { ok: true } | { ok: false; key: string; error: string } {
  const lower = new Map(GATING_KEYS.map((k) => [k.toLowerCase(), k]));
  for (const k of Object.keys(raw || {})) {
    const hit = lower.get(k.toLowerCase());
    if (hit) return { ok: false, key: hit, error: `Review gating is not available: "${hit}" would filter recipients by what they thought. ${NO_GATING_DOCTRINE}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Who to ask
//
// NOTE THE SHAPE OF THIS TYPE. It carries what somebody BOUGHT and WHEN, and
// nothing about how they felt. That is the no-gating rule expressed as a type:
// there is no field here to filter on even if somebody wanted to.
// ---------------------------------------------------------------------------
export type RequestCandidate = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  orderCount?: number;
  lastOrderDaysAgo?: number;
  consent?: boolean;
};

export type RequestChannel = "email" | "sms" | "whatsapp";

export type RequestConfig = {
  channel: RequestChannel;
  // Ask once the job is actually finished. Same-day is too early for a trade,
  // and next-day is right for a meal. There is no universal number, so this is
  // the customer's setting rather than a claim.
  minDaysSinceOrder: number;
  // Past this the memory is gone and the ask reads as odd. Stale asks convert
  // poorly and annoy people who had forgotten they bought from you.
  maxDaysSinceOrder: number;
  cooloffDays: number;   // never ask the same person twice inside this
  requireConsent: boolean;
};

export const DEFAULT_REQUEST_CONFIG: RequestConfig = {
  channel: "email",
  minDaysSinceOrder: 1,
  maxDaysSinceOrder: 60,
  cooloffDays: 180,
  requireConsent: true,
};

export type Excluded = { id: string; reason: string };
export type EligibilityResult = {
  eligible: RequestCandidate[];
  excluded: Excluded[];
  counts: { considered: number; eligible: number; excluded: number };
  note: string;
};

// `askedDaysAgo` is how long ago this person was last asked, by contact id.
export function eligibleForRequest(input: {
  candidates: RequestCandidate[];
  config: RequestConfig;
  askedDaysAgo?: Record<string, number>;
}): EligibilityResult {
  const { config } = input;
  const asked = input.askedDaysAgo || {};
  const eligible: RequestCandidate[] = [];
  const excluded: Excluded[] = [];

  for (const c of input.candidates || []) {
    if (!c || !c.id) continue;
    const reach = config.channel === "email" ? c.email : c.phone;
    if (!reach) { excluded.push({ id: c.id, reason: `no ${config.channel === "email" ? "email address" : "phone number"} on file` }); continue; }
    if (config.requireConsent && c.consent === false) { excluded.push({ id: c.id, reason: "marketing consent withdrawn" }); continue; }
    if (!(c.orderCount && c.orderCount > 0)) { excluded.push({ id: c.id, reason: "never bought anything — a review from a non-customer is a fake review" }); continue; }
    const days = c.lastOrderDaysAgo;
    if (typeof days !== "number") { excluded.push({ id: c.id, reason: "no order date, so we cannot tell whether the job is finished" }); continue; }
    if (days < config.minDaysSinceOrder) { excluded.push({ id: c.id, reason: `too soon — ${days}d since the order, waiting until ${config.minDaysSinceOrder}d` }); continue; }
    if (days > config.maxDaysSinceOrder) { excluded.push({ id: c.id, reason: `too long ago — ${days}d since the order` }); continue; }
    const last = asked[c.id];
    if (typeof last === "number" && last < config.cooloffDays) { excluded.push({ id: c.id, reason: `already asked ${last}d ago (cool-off ${config.cooloffDays}d)` }); continue; }
    eligible.push(c);
  }

  return {
    eligible,
    excluded,
    counts: { considered: (input.candidates || []).length, eligible: eligible.length, excluded: excluded.length },
    note: NO_GATING_DOCTRINE,
  };
}

// ---------------------------------------------------------------------------
// Pacing
//
// Fifty reviews landing on a profile that has had nine in two years is the
// signal every platform's filter is built to catch, and it is the signal our own
// fakeReviewRisk() catches too. So the plan spreads the asks out.
//
// There is no published safe rate — none of the platforms document one — so the
// number below is stated as a CONVENTION, not a measurement, in the same way the
// hashtag engine separates documented limits from things people have found work.
// ---------------------------------------------------------------------------
export const PACING_IS_A_CONVENTION =
  "No platform publishes a safe rate of incoming reviews, so this pace is a " +
  "convention rather than a measured threshold: it keeps new reviews in " +
  "proportion to the profile you already have, because a step change in " +
  "velocity is what the filters look for.";

export function suggestedPerDay(existingReviews: number): number {
  const n = Math.max(0, Math.floor(existingReviews || 0));
  // A profile with nothing on it can take a handful a day; a profile with a
  // thousand reviews is not disturbed by fifty. In between it scales with what
  // is already there rather than with how keen we are.
  return Math.max(3, Math.min(50, Math.round(n * 0.1) || 3));
}

export type PacingPlan = {
  perDay: number;
  days: number;
  batches: { day: number; count: number }[];
  note: string;
};

export function pacingPlan(input: { total: number; existingReviews: number; perDay?: number }): PacingPlan {
  const total = Math.max(0, Math.floor(input.total || 0));
  const perDay = Math.max(1, Math.floor(input.perDay || suggestedPerDay(input.existingReviews)));
  const days = Math.ceil(total / perDay) || 0;
  const batches: { day: number; count: number }[] = [];
  let left = total;
  for (let d = 1; d <= days; d++) { const n = Math.min(perDay, left); batches.push({ day: d, count: n }); left -= n; }
  return {
    perDay, days, batches,
    note: total <= perDay
      ? `${total} request${total === 1 ? "" : "s"} — small enough to send in one go.`
      : `${total} requests spread over ${days} days at ${perDay}/day. ${PACING_IS_A_CONVENTION}`,
  };
}

// ---------------------------------------------------------------------------
// The message
// ---------------------------------------------------------------------------
export type RequestDraft = {
  channel: RequestChannel;
  subject?: string;
  body: string;
  chars: number;
  smsSegments?: number;
  link: string;
  warnings: string[];
};

// GSM-03.38 basic set. Anything outside it forces the whole message to UCS-2,
// which cuts a segment from 160 characters to 70 — the difference between one
// text and three, per recipient, which is a real bill.
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

export function smsSegments(text: string): number {
  const s = text || "";
  if (!s) return 0;
  let units = 0;
  let unicode = false;
  for (const ch of s) {
    if (GSM_EXT.includes(ch)) { units += 2; continue; }
    if (GSM_BASIC.includes(ch)) { units += 1; continue; }
    unicode = true;
    break;
  }
  if (unicode) {
    // UCS-2: count UTF-16 code units, because that is what the radio sends.
    const u = s.length;
    return u <= 70 ? 1 : Math.ceil(u / 67);
  }
  return units <= 160 ? 1 : Math.ceil(units / 153);
}

// Words that turn a review request into an incentivised one. Incentives are
// banned by every platform in the table and by the DMCC Act and the FTC rule,
// and reputation.ts already flags them on the way IN, so a draft that contains
// them would be flagged by our own manipulation check once published.
const INCENTIVE_RE = /\b(discount|voucher|coupon|free\s+\w+|prize|raffle|giveaway|reward|cashback|gift\s*card|money off|% off|entry into|in exchange for|we'?ll pay)\b/i;
// Words that ask for a *positive* review rather than an honest one. Asking for
// five stars is asking the customer to lie if that is not what they thought.
const POSITIVE_STEER_RE = /\b(5[- ]?stars?|five[- ]?stars?|positive review|good review|great review|glowing)\b/i;

export function incentiveRisk(text: string): { flags: string[]; blocking: boolean } {
  const flags: string[] = [];
  const t = text || "";
  const inc = t.match(INCENTIVE_RE);
  if (inc) flags.push(`offers something in return ("${inc[0].trim()}") — incentivised reviews are banned by every platform here and by the DMCC Act and the FTC rule`);
  const pos = t.match(POSITIVE_STEER_RE);
  if (pos) flags.push(`asks for a favourable review ("${pos[0].trim()}") rather than an honest one — ask for the truth or the review is worthless as evidence`);
  return { flags, blocking: flags.length > 0 };
}

export function draftRequest(input: {
  platformId: string;
  channel: RequestChannel;
  brandName: string;
  link: string;
  contactName?: string;
  senderName?: string;
  whatTheyBought?: string;   // "your order", "the bathroom fit", "your stay"
  customBody?: string;       // the customer's own words, checked not replaced
}): RequestDraft {
  const p = platform(input.platformId);
  const brand = (input.brandName || "us").trim();
  const who = (input.contactName || "").trim().split(/\s+/)[0] || "";
  const hi = who ? `Hi ${who}` : "Hi";
  const thing = (input.whatTheyBought || "your order").trim();
  const from = (input.senderName || brand).trim();
  const label = p ? p.label : "the review page";
  // Facebook has no stars any more, so the wording differs there. Asking for a
  // rating on a platform that removed ratings makes the request read as a
  // template, which is exactly what it must not read as.
  const verb = p?.id === "facebook" ? "leave a recommendation" : "leave a review";

  const warnings: string[] = [];
  if (p && p.ask === "prohibited") warnings.push(`${p.label} forbids asking — this draft should not be sent.`);
  if (p && p.ask === "restricted") warnings.push(`${p.label} only permits its own request mechanism — use that instead of sending this.`);

  let subject: string | undefined;
  let body: string;

  if (input.customBody && input.customBody.trim()) {
    body = input.customBody.trim();
    subject = input.channel === "email" ? `A quick favour — ${brand}` : undefined;
  } else if (input.channel === "email") {
    subject = `How was ${thing}, ${who || "there"}?`.replace(", there?", "?");
    body = [
      `${hi},`,
      "",
      `Thanks for choosing ${brand} — ${thing} mattered to us and I hope it went well.`,
      "",
      `If you have a minute, would you ${verb} on ${label}? Honest is what we want: it helps the next person decide, and it tells us what to fix.`,
      "",
      input.link,
      "",
      `If something went wrong, reply to this email instead and I will sort it out myself.`,
      "",
      `Thanks,`,
      from,
    ].join("\n");
  } else {
    // SMS and WhatsApp are read on a lock screen. One line, the ask, the link.
    body = `${hi}, it's ${from} at ${brand}. Thanks for ${thing}. Would you ${verb}? Honest feedback is what helps: ${input.link} — and if anything went wrong, just reply to me here.`;
  }

  const risk = incentiveRisk((subject || "") + " " + body);
  warnings.push(...risk.flags);
  if (!input.link) warnings.push("No review link in this draft — a request with nothing to click gets nothing back.");

  const draft: RequestDraft = {
    channel: input.channel,
    subject,
    body,
    chars: body.length,
    link: input.link,
    warnings,
  };
  if (input.channel === "sms") draft.smsSegments = smsSegments(body);
  return draft;
}

// ---------------------------------------------------------------------------
// The whole campaign, audited before it is sent
// ---------------------------------------------------------------------------
export type CampaignFinding = {
  severity: "blocking" | "warning" | "note";
  title: string;
  detail: string;
};

export type RequestCampaign = {
  platform: { id: string; label: string; ask: AskPolicy; rules: string[]; discoveryEffect: string };
  link: string;
  eligibility: EligibilityResult;
  pacing: PacingPlan;
  sample: RequestDraft;
  findings: CampaignFinding[];
  sendable: boolean;
  doctrine: string;
};

export function planCampaign(input: {
  platformId: string;
  identifier?: string;
  pastedUrl?: string;
  channel: RequestChannel;
  brandName: string;
  candidates: RequestCandidate[];
  config?: Partial<RequestConfig>;
  askedDaysAgo?: Record<string, number>;
  existingReviews?: number;
  senderName?: string;
  whatTheyBought?: string;
  customBody?: string;
}): { ok: false; error: string; hint?: string } | { ok: true; campaign: RequestCampaign } {
  const p = platform(input.platformId);
  if (!p) return { ok: false, error: `Unknown platform "${input.platformId}"`, hint: `Known: ${REVIEW_PLATFORMS.map((x) => x.id).join(", ")}` };

  const link = reviewLink(input.platformId, { identifier: input.identifier, pastedUrl: input.pastedUrl });
  if (!link.ok) return { ok: false, error: link.error, hint: link.hint };

  const config: RequestConfig = { ...DEFAULT_REQUEST_CONFIG, ...(input.config || {}), channel: input.channel };
  const eligibility = eligibleForRequest({ candidates: input.candidates || [], config, askedDaysAgo: input.askedDaysAgo });
  const pacing = pacingPlan({ total: eligibility.eligible.length, existingReviews: input.existingReviews || 0 });

  const first = eligibility.eligible[0];
  const sample = draftRequest({
    platformId: input.platformId,
    channel: input.channel,
    brandName: input.brandName,
    link: link.url,
    contactName: first?.name,
    senderName: input.senderName,
    whatTheyBought: input.whatTheyBought,
    customBody: input.customBody,
  });

  const findings: CampaignFinding[] = [];
  if (p.ask === "prohibited") findings.push({ severity: "blocking", title: `${p.label} forbids asking`, detail: p.rules[0] });
  if (p.ask === "restricted") findings.push({ severity: "blocking", title: `${p.label} allows only its own mechanism`, detail: p.rules[0] });
  for (const w of sample.warnings) findings.push({ severity: /forbids|only permits/.test(w) ? "blocking" : "warning", title: "Message content", detail: w });
  if (!eligibility.eligible.length) {
    findings.push({ severity: "blocking", title: "Nobody is eligible yet", detail: `${eligibility.counts.excluded} contact(s) were excluded. The commonest reasons are on the excluded list — usually no order on record, or the order is too recent to ask about.` });
  }
  if (eligibility.eligible.length > pacing.perDay) {
    findings.push({ severity: "note", title: `Spread over ${pacing.days} days`, detail: pacing.note });
  }
  if (config.requireConsent === false) {
    findings.push({ severity: "warning", title: "Consent check turned off", detail: "Contacts who withdrew marketing consent will be included. A review request to somebody who unsubscribed is a marketing message they told you not to send." });
  }
  if (input.channel === "sms" && sample.smsSegments && sample.smsSegments > 1) {
    findings.push({ severity: "note", title: `${sample.smsSegments} SMS segments`, detail: `This message costs ${sample.smsSegments}× a single text per recipient. Shortening the link or the greeting brings it back to one.` });
  }

  return {
    ok: true,
    campaign: {
      platform: { id: p.id, label: p.label, ask: p.ask, rules: p.rules, discoveryEffect: p.discoveryEffect },
      link: link.url,
      eligibility,
      pacing,
      sample,
      findings,
      sendable: !findings.some((f) => f.severity === "blocking"),
      doctrine: NO_GATING_DOCTRINE,
    },
  };
}
