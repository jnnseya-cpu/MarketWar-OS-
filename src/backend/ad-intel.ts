// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Ad intelligence — what shape the ads in a category take.
//
// The competitor pitch for this is "browse thousands of winning ads and
// generate your own version in minutes". Half of that is a good product and the
// other half is a lawsuit, so this module is built as the first half only.
//
// WHY RECREATION IS NOT HERE. An advertisement is a copyright work: the images,
// the copy, the edit. Reproducing one with the serial numbers filed off is
// copying, and where the look is distinctive it is passing-off as well. The
// liability lands on the CUSTOMER who publishes, not on the tool that made it —
// the same asymmetry as fake reviews and bought followers, and it is refused
// here for the same reason.
//
// WHAT IS ACTUALLY USEFUL IS THE STRUCTURE, NOT THE ARTWORK. "Ads in this
// category open on a price, put the offer in the first line, and use a face in
// the thumbnail" is a finding you can act on without copying anybody. That is
// what this extracts.
//
// AND IT COUNTS RATHER THAN GUESSES. Every figure below is a count over the ads
// you supplied, with the denominator shown. There is no "winning" flag, because
// nobody outside the advertiser knows what an ad returned — a competitor's ad
// running for a long time is evidence of a budget, not of a result. Anything
// this module cannot count, it says it cannot count.

export type AdSource = "meta-ad-library" | "observed" | "own" | "supplied";

/** One ad as OBSERVED. Nothing here is a performance figure, because none is knowable. */
export type ObservedAd = {
  id: string;
  advertiser: string;
  source: AdSource;
  /** The visible copy. */
  headline?: string;
  body?: string;
  cta?: string;
  format?: "image" | "video" | "carousel";
  /** First seen / last seen, when the source publishes them. */
  firstSeen?: string;
  lastSeen?: string;
  /** Where it ran, if known. */
  platforms?: string[];
};

// ---------------------------------------------------------------------------
// The patterns worth counting
//
// Each is a yes/no over one ad's own words, so the aggregate is a count with a
// denominator rather than a score out of a hundred.
// ---------------------------------------------------------------------------
export type PatternId =
  | "price-led" | "discount-led" | "urgency" | "question-open" | "number-open"
  | "problem-first" | "social-proof" | "guarantee" | "free-trial" | "local-signal"
  | "direct-address" | "comparison" | "emoji" | "long-copy";

export type Pattern = {
  id: PatternId;
  label: string;
  /** What it means for the reader's own ad. */
  soWhat: string;
  test: (ad: ObservedAd) => boolean;
};

const text = (a: ObservedAd) => `${a.headline || ""} ${a.body || ""} ${a.cta || ""}`.trim();
const has = (a: ObservedAd, re: RegExp) => re.test(text(a));

export const PATTERNS: Pattern[] = [
  { id: "price-led", label: "Leads with a price", soWhat: "The category shops on price. An ad that hides the price is asking to be scrolled.", test: (a) => /[£$€]\s?\d/.test(text(a)) },
  { id: "discount-led", label: "Leads with a discount", soWhat: "Discounting is the category's default lever — which means it has stopped being a differentiator.", test: (a) => has(a, /\b(\d{1,2}%\s*off|half price|sale|discount|save \d)/i) },
  { id: "urgency", label: "Uses a deadline", soWhat: "Real scarcity works here. Invented scarcity is a banned practice, so only use a deadline you will honour.", test: (a) => has(a, /\b(today|ends|last chance|hurry|only \d+|limited)\b/i) },
  { id: "question-open", label: "Opens on a question", soWhat: "The category buys attention with a question. Yours needs an answer the reader wants.", test: (a) => (a.headline || "").trim().endsWith("?") },
  { id: "number-open", label: "Opens on a number", soWhat: "Numbers stop scrolls. Yours has to be one you can substantiate.", test: (a) => /^\W*\d/.test((a.headline || "").trim()) },
  { id: "problem-first", label: "Names a problem before the product", soWhat: "The category sells relief rather than features. Lead with what hurts.", test: (a) => has(a, /\b(tired of|struggling|sick of|problem|stop (losing|wasting)|fed up)\b/i) },
  { id: "social-proof", label: "Cites customers or ratings", soWhat: "Proof is table stakes here. Yours must be real — the review engine exists to earn it.", test: (a) => has(a, /\b(\d[\d,]*\+? (customers|businesses|clients|users)|\d(\.\d)?\s?(stars?|★)|rated|trusted by)\b/i) },
  { id: "guarantee", label: "Offers a guarantee", soWhat: "Risk reversal is expected in this category. Without one you are the riskier choice.", test: (a) => has(a, /\b(guarantee|money.?back|refund|no.?quibble|risk.?free)\b/i) },
  { id: "free-trial", label: "Offers a free trial or sample", soWhat: "The category expects to try before buying.", test: (a) => has(a, /\b(free (trial|sample|quote|consultation)|try (it )?free|no card)\b/i) },
  { id: "local-signal", label: "Names a place", soWhat: "Local naming is doing work here. A postcode or town in the first line is cheap and effective.", test: (a) => has(a, /\b(near you|local|in [A-Z][a-z]+|[A-Z]{1,2}\d{1,2}\s?\d?[A-Z]{0,2})\b/) },
  { id: "direct-address", label: "Speaks to 'you'", soWhat: "Second person is the norm. Third-person brand copy will read as an announcement.", test: (a) => has(a, /\byou(r|'re)?\b/i) },
  { id: "comparison", label: "Compares to an alternative", soWhat: "Comparative advertising is normal here — and every comparison must be verifiable and fair.", test: (a) => has(a, /\b(vs\.?|versus|instead of|unlike|better than|compared to)\b/i) },
  { id: "emoji", label: "Uses emoji", soWhat: "A stylistic norm of the category. Matching it is cheap; ignoring it can read as corporate.", test: (a) => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text(a)) },
  { id: "long-copy", label: "Long body copy", soWhat: "The category tolerates reading. A one-liner may be under-explaining.", test: (a) => (a.body || "").split(/\s+/).filter(Boolean).length >= 60 },
];

export type PatternCount = {
  id: PatternId;
  label: string;
  soWhat: string;
  matched: number;
  of: number;
  pct: number;
};

export type AdIntelReport = {
  advertisers: number;
  ads: number;
  judgeable: boolean;
  patterns: PatternCount[];
  /** What the category does that you could copy WITHOUT copying an ad. */
  normsToMatch: string[];
  /** Where nobody in the sample is doing something — the open ground. */
  openGround: string[];
  formats: { format: string; count: number }[];
  headline: string;
  doctrine: string;
  notes: string[];
};

// Below this, a percentage is noise wearing a decimal point.
export const MIN_ADS_TO_JUDGE = 8;

export const AD_INTEL_DOCTRINE =
  "This reads the SHAPE of the ads you supplied — how they open, what they promise, whether they price — and never reproduces one. An advertisement is a copyright work and its look can be protected trade dress; recreating one puts the liability on you, not on us. Nothing here is labelled a winner either: an ad running for a long time is evidence of a budget, not of a result, and only the advertiser knows what it returned.";

export function analyseAds(ads: ObservedAd[]): AdIntelReport {
  const list = (ads || []).filter((a) => a && (a.headline || a.body));
  const of = list.length;
  const judgeable = of >= MIN_ADS_TO_JUDGE;

  const patterns: PatternCount[] = PATTERNS.map((p) => {
    const matched = list.filter((a) => p.test(a)).length;
    return { id: p.id, label: p.label, soWhat: p.soWhat, matched, of, pct: of ? Math.round((matched / of) * 100) : 0 };
  }).sort((a, b) => b.pct - a.pct);

  const formatMap = new Map<string, number>();
  for (const a of list) formatMap.set(a.format || "unknown", (formatMap.get(a.format || "unknown") || 0) + 1);
  const formats = Array.from(formatMap, ([format, count]) => ({ format, count })).sort((a, b) => b.count - a.count);

  // A norm is something most of the category does; open ground is something
  // almost none of it does. Both are only meaningful above the judging volume.
  const normsToMatch = judgeable ? patterns.filter((p) => p.pct >= 60).map((p) => `${p.label} — ${p.matched} of ${p.of} ads. ${p.soWhat}`) : [];
  const openGround = judgeable ? patterns.filter((p) => p.pct <= 15).map((p) => `Almost nobody ${p.label.toLowerCase()} (${p.matched} of ${p.of}). ${p.soWhat}`) : [];

  const advertisers = new Set(list.map((a) => a.advertiser.trim().toLowerCase()).filter(Boolean)).size;

  const notes: string[] = [];
  if (!judgeable && of > 0) notes.push(`${of} ad(s) is below the ${MIN_ADS_TO_JUDGE} needed to call anything a pattern. The counts are shown, the conclusions are not — a percentage over four ads is noise wearing a decimal point.`);
  if (advertisers === 1 && of > 0) notes.push("Every ad here is from one advertiser, so this describes their house style rather than the category.");
  if (list.some((a) => a.source === "observed")) notes.push("Some ads were entered by hand. What was typed is what was counted.");

  return {
    advertisers,
    ads: of,
    judgeable,
    patterns,
    normsToMatch,
    openGround,
    formats,
    headline: !of
      ? "No ads supplied yet. Paste the ones you can see running in your category — from the platforms' own public ad libraries — and this counts what they have in common."
      : judgeable
        ? `${of} ads from ${advertisers} advertiser(s). ${normsToMatch.length} thing(s) most of them do, ${openGround.length} almost none of them do.`
        : `${of} ad(s) counted. Below ${MIN_ADS_TO_JUDGE} nothing is called a pattern.`,
    doctrine: AD_INTEL_DOCTRINE,
    notes,
  };
}

// ---------------------------------------------------------------------------
// The refusal, as a function
//
// Asked to produce "our version of this ad", the answer is no and the reason is
// commercial. It is a function rather than a comment so a future caller has to
// go through it.
// ---------------------------------------------------------------------------
export function recreationRefused(advertiser?: string): { allowed: false; reason: string; instead: string } {
  return {
    allowed: false,
    reason: `Reproducing ${advertiser ? `${advertiser}'s` : "another advertiser's"} creative is not available. An advertisement is a copyright work — the images, the copy and the edit — and where its look is distinctive it is protected trade dress too. Publishing a copy puts the liability on you, not on the tool that made it.`,
    instead: "Use the pattern counts instead: match what the category does structurally — how it opens, whether it prices, whether it proves — and say your own thing inside that shape. That is the part that actually transfers; the artwork is the part that gets you a letter.",
  };
}

// What a customer should collect, and from where. The platforms publish these
// themselves, which is the only lawful and reliable source.
export const WHERE_TO_LOOK = [
  { platform: "Meta", where: "Facebook Ad Library — facebook.com/ads/library — every active ad on Facebook and Instagram, searchable by advertiser or keyword.", note: "The public site shows all active ads. Its API is largely limited to political and social-issue ads, so commercial collection is manual." },
  { platform: "TikTok", where: "TikTok Creative Center — ads.tiktok.com/business/creativecenter — top ads by industry and region.", note: "Published by TikTok, with their own engagement figures rather than ours." },
  { platform: "Google", where: "Google Ads Transparency Centre — adstransparency.google.com — ads by advertiser, including YouTube.", note: "Shows what ran and where; no performance data." },
  { platform: "LinkedIn", where: "Any company page → Posts → Ads tab — their last six months of ads.", note: "Free, and the least-used of the four." },
];
