// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar SiteRaid AI™ — the Website → Autonomous Viral Growth engine.
//
// Spec (F2 "Website-to-Autonomous Viral Growth Engine"): paste an AUTHORISED
// business/product URL → a complete, continuously optimised marketing & sales
// operation. SiteRaid is NOT a URL-to-ad scraper; it understands the business,
// diagnoses it, and maps where to win. Crawling / live competitor fetch route
// through connectors; THIS module is the deterministic brain the conversational
// agent has described until now:
//
//   • Authorised Ingestion   — 13 input types + an ownership/permission gate;
//                              competitor URLs are public-analysis-only.
//   • Business DNA Builder™   — 24-field continuously-updated business profile.
//   • Website Truth Layer™    — 5 claim classes; superlatives blocked unless
//                              substantiated; every publishable claim links a source.
//   • Instant Marketing Audit — 6 audits (brand/conversion/content/search+GEO/
//                              social/commercial) with sub-scores + verdicts.
//   • Competitive Attack Map  — 16 gap classes → 6 priority buckets; win WITHOUT
//                              copying.
//
// Pure + deterministic (seeded, no wall-clock, no randomness) → runs in demo mode
// and unit-checks. Live crawl/competitor data refines it post-launch.

import type { CrawlReport } from "@/backend/crawler";
import type { SiteExtraction } from "@/backend/site-extract";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

// `seed`/`sscore` used to live here — an FNV hash turned into a 45–90 "score".
// They fed the Instant Marketing Audit's thirty-six sub-scores and the Attack
// Map's ranking, so both were numbers about the spelling of the customer's
// business name. Both now measure the crawl or return null, and the helpers
// have no callers left. Deleted rather than kept "in case", because a
// convincing-looking score generator sitting in the file is an invitation.

// ---------------------------------------------------------------------------
// 1. Authorised Ingestion — permission gate before any extraction.
// ---------------------------------------------------------------------------
export const INPUT_TYPES = [
  "Homepage URL", "Product page", "Service page", "Shopify store", "Marketplace listing",
  "App-store listing", "Booking page", "Restaurant menu", "Property listing", "Event page",
  "Fundraising page", "Personal brand website", "Company profile",
] as const;

export type Authorisation = "own" | "manage" | "have_permission" | "competitor_public";

export type IngestionDecision = {
  allowed: boolean;
  mode: "full_reuse" | "public_analysis_only" | "blocked";
  reason: string;
};

// Owner/manager/permission → full asset reuse. Competitor → analysis only, no
// republishing of protected assets. No basis → blocked.
export function authoriseIngestion(input: { authorisation?: Authorisation }): IngestionDecision {
  switch (input.authorisation) {
    case "own":
    case "manage":
    case "have_permission":
      return { allowed: true, mode: "full_reuse", reason: "Authorised owner/manager/permission — approved assets may be reused and regenerated." };
    case "competitor_public":
      return { allowed: true, mode: "public_analysis_only", reason: "Competitor URL — public competitive analysis only; protected/trademarked assets are never republished." };
    default:
      return { allowed: false, mode: "blocked", reason: "No ownership, management, permission or competitor-analysis basis confirmed — extraction blocked." };
  }
}

// ---------------------------------------------------------------------------
// 2. Business DNA Builder™ — 24-field profile from a (demo) extract.
// ---------------------------------------------------------------------------
export type SiteExtract = {
  business: string;
  category: string;
  offers: string[];
  pricePosition?: "budget" | "mass" | "premium";
  location?: string;
  reviews?: number;
  rating?: number;
};

export type BusinessDNA = {
  marketCategory: string;
  businessModel: string;
  revenueModel: string;
  coreOffers: string[];
  customerSegments: string[];
  valueProposition: string;
  brandPersonality: string;
  pricePosition: string;
  geographicCoverage: string;
  salesCycle: string;
  mainConversionAction: string;
  competitiveAdvantages: string[];
  proofAssets: string[];
  customerObjections: string[];
  trustGaps: string[];
  contentGaps: string[];
  conversionGaps: string[];
  seoGaps: string[];
  geoGaps: string[];
  socialGaps: string[];
  retentionOpportunities: string[];
  upsellOpportunities: string[];
  crossSellOpportunities: string[];
  referralOpportunities: string[];
};

/** "mass" is a price tier, not an adjective anyone would write. */
const PRICE_WORD: Record<string, string> = { budget: "affordable", mass: "mainstream", premium: "premium" };

const clean = (v: string) => (v || "").replace(/\s+/g, " ").trim().replace(/[.,;:\s]+$/, "");
/** Lower-case for mid-sentence use, but never mangle an acronym. */
const lower = (v: string) => {
  const c = clean(v);
  const first = c.split(/\s+/)[0] || "";
  return first.length > 1 && first === first.toUpperCase() ? c : c.charAt(0).toLowerCase() + c.slice(1);
};
/** Join the parts, drop the empties, and end with exactly one full stop. */
const sentence = (...parts: string[]) => `${parts.map(clean).filter(Boolean).join(" ")}.`;

export function businessDNA(x: SiteExtract): BusinessDNA {
  const cat = x.category;
  const price = x.pricePosition ?? "mass";
  return {
    marketCategory: cat,
    businessModel: x.offers.length > 1 ? "Multi-offer / product+service" : "Single core offer",
    revenueModel: price === "premium" ? "High-margin, lower-volume" : price === "budget" ? "Low-margin, high-volume" : "Balanced volume/margin",
    coreOffers: x.offers,
    customerSegments: [`${cat} buyers`, "Repeat customers", "Referral-sourced customers"],
    // Built with a helper rather than raw interpolation. A customer pasted their
    // tagline into the category field and got "The mass choice for the
    // enterprise execution operating system. in United Kingdom ." — a full stop
    // mid-sentence and a trailing space, because the parts were glued together
    // without ever being tidied.
    valueProposition: sentence(`The ${PRICE_WORD[price]} choice for ${lower(cat)}`, x.location ? `in ${clean(x.location)}` : ""),
    brandPersonality: price === "premium" ? "Refined, confident, expert" : "Warm, dependable, local",
    pricePosition: price,
    geographicCoverage: x.location ?? "Local / regional",
    salesCycle: cat.toLowerCase().includes("service") ? "Considered (quote → decision)" : "Short (impulse → purchase)",
    mainConversionAction: x.offers.length && /book|appointment|reservation/i.test(x.offers.join(" ")) ? "Booking" : "Purchase / enquiry",
    // NO INVENTED PROOF. These read `${x.rating ?? 4.6}★` and `${x.reviews ?? 120}
    // reviews`, so a business with no rating was handed "4.6★ social proof" and
    // "120 reviews" as its own competitive advantages — the same fabrication the
    // Truth Layer exists to block, printed as fact one panel away from it.
    competitiveAdvantages: [
      ...(x.rating ? [`${x.rating}★ social proof`] : []),
      "Owned customer relationship",
      "Fast local fulfilment",
    ],
    proofAssets: [
      ...(x.reviews ? [`${x.reviews} reviews`] : []),
      "Before/after evidence",
      "Verified credentials",
    ],
    customerObjections: ["Is it worth the price?", "Will it work for me?", "Can I trust them?"],
    trustGaps: ["No visible guarantee", "Thin about-us / credentials"],
    contentGaps: ["No demonstration content", "Missing FAQs", "Weak comparison pages"],
    conversionGaps: ["CTA below the fold", "Long lead form", "No urgency"],
    seoGaps: ["Missing problem-led pages", "Thin service-area pages"],
    geoGaps: ["Not cited by AI assistants", "No structured data for reviews"],
    socialGaps: ["Inconsistent short-form", "No creator strategy"],
    retentionOpportunities: ["Post-purchase flow", "Win-back campaign"],
    upsellOpportunities: ["Premium tier", "Add-on services"],
    crossSellOpportunities: ["Complementary products", "Bundles"],
    referralOpportunities: ["Referral reward", "Review-to-advocate loop"],
  };
}

// ---------------------------------------------------------------------------
// 3. Website Truth Layer™ — classify + gate every claim; block superlatives.
// ---------------------------------------------------------------------------
export type ClaimClass = "verified_website" | "verified_business_data" | "user_confirmed" | "inferred_pending" | "prohibited";
export type Claim = { text: string; source?: string; substantiated?: boolean };
export type ClaimVerdict = { text: string; classification: ClaimClass; publishable: boolean; reason: string; source?: string };

const SUPERLATIVES = ["best", "#1", "number one", "cheapest", "fastest", "top rated", "world class", "the leading"];

export function classifyClaim(claim: Claim): ClaimVerdict {
  const lc = claim.text.toLowerCase();
  const isSuperlative = SUPERLATIVES.some((s) => lc.includes(s));
  // Unsubstantiated superlative → prohibited (prevents hallucinated advertising).
  if (isSuperlative && !claim.substantiated) {
    return { text: claim.text, classification: "prohibited", publishable: false, reason: 'Superlative claim ("best/#1/cheapest") is blocked unless independently substantiated.' };
  }
  if (claim.source && /policy|reviews?|trustpilot|google|data|ledger/i.test(claim.source)) {
    const cls: ClaimClass = /reviews?|trustpilot|google/i.test(claim.source) ? "verified_business_data" : "verified_website";
    return { text: claim.text, classification: cls, publishable: true, reason: `Verified against ${claim.source}.`, source: claim.source };
  }
  if (claim.substantiated) {
    return { text: claim.text, classification: "user_confirmed", publishable: true, reason: "User-confirmed with evidence." };
  }
  return { text: claim.text, classification: "inferred_pending", publishable: false, reason: "Inferred — needs a linked source or user confirmation before publication." };
}

export function truthLayer(claims: Claim[]): { verdicts: ClaimVerdict[]; publishable: ClaimVerdict[]; blocked: ClaimVerdict[] } {
  const verdicts = claims.map(classifyClaim);
  return { verdicts, publishable: verdicts.filter((v) => v.publishable), blocked: verdicts.filter((v) => !v.publishable) };
}

// ---------------------------------------------------------------------------
// 4. Instant Marketing Audit — 6 audits with sub-scores + verdicts.
// ---------------------------------------------------------------------------
const AUDIT_DIMS: Record<string, string[]> = {
  brand: ["Message clarity", "Brand consistency", "Visual quality", "Differentiation", "Trust strength", "Proof strength"],
  conversion: ["CTA clarity", "Offer strength", "Friction", "Mobile experience", "Page speed", "Abandonment risk"],
  content: ["Content coverage", "Headline strength", "Product descriptions", "FAQs", "Demonstrations", "Content freshness"],
  search: ["SEO strength", "Search-intent coverage", "Local search", "Structured data", "AI-search/GEO visibility", "Comparison/problem pages"],
  social: ["Short-form concepts", "Posting consistency", "Social proof", "Platform fit", "Format variety", "Creator/community strategy"],
  commercial: ["Packaging", "Pricing presentation", "Bundles", "Upsells/cross-sells", "Lead magnets", "Retargeting/referral"],
};

// WHAT THIS SCORE USED TO BE.
//
//   dims.map((name) => ({ name, score: sscore(x.business + area + name) }))
//
// sscore is a hash. "Message clarity: 72/100" was a stable pseudo-random number
// derived from the letters of the customer's own business name — as was every
// one of the thirty-six sub-scores, the six area scores, the overall, and the
// sentence naming their weakest area. Type a different business name and the
// diagnosis changes; change the site and it does not move at all.
//
// It is the same defect as the "Rated 4.7 by 213 reviewers" that came out of
// useState, wearing a lab coat. It is worse in one way: a customer can check a
// review count, and cannot check a marketing-health index.
//
// So the audit now measures. Each dimension either has a rule that reads
// something the crawl actually found — CTAs counted, FAQs counted, a title tag
// present, structured data types seen, load time recorded — or it is NOT
// SCORED, and says which it is. Twelve of the thirty-six genuinely cannot be
// read from HTML: visual quality, differentiation against rivals, mobile
// experience, abandonment risk, posting consistency. Those return null with the
// reason, exactly as `SiteExtraction.audience` does, rather than a number
// dressed up as a finding.
//
// The area score averages only the dimensions that were measured, and every
// section reports how many that was. An audit that admits it read four of six
// is worth more than one that quietly averages two real numbers with four
// invented ones.

/** A dimension either measured something, or says why it did not. */
export type AuditDimension = {
  name: string;
  /** 0–100, or null when the crawl cannot see this. Never a hash. */
  score: number | null;
  /** What the number was read from, or why there is no number. Always shown. */
  basis: string;
};

export type AuditSection = {
  area: string;
  /** Average of the MEASURED dimensions, or null when none could be measured. */
  overall: number | null;
  verdict: "strong" | "improve" | "urgent" | "not measured";
  dimensions: AuditDimension[];
  measured: number;
  total: number;
};

export type SiteAudit = {
  sections: AuditSection[];
  overall: number | null;
  headline: string;
  /** How much of the audit was real, so the headline can never oversell itself. */
  coverage: { measured: number; total: number; note: string };
};

/** Everything a crawl can tell us. Both halves optional — a caller may have neither. */
export type AuditEvidence = {
  audit?: CrawlReport | null;
  extraction?: SiteExtraction | null;
};

// Scoring helpers. Deliberately blunt: a count against a threshold, so the
// customer can be told "6 calls to action found" and check it themselves. A
// cleverer curve nobody can verify is worth less than a crude one they can.
const band = (n: number, good: number, ok: number): number =>
  n >= good ? 85 + Math.min(15, n - good) : n >= ok ? 60 + Math.round(((n - ok) / Math.max(1, good - ok)) * 24) : n > 0 ? 35 + Math.round((n / Math.max(1, ok)) * 24) : 15;

const yesNo = (facts: boolean[]): number => {
  const hit = facts.filter(Boolean).length;
  return clamp(Math.round((hit / Math.max(1, facts.length)) * 100));
};

const NOT_READABLE = (why: string): AuditDimension["basis"] => `Not scored — ${why}`;

const nonPixelImages = (x: SiteExtraction | null | undefined) => x?.images.length ?? 0;
const matches = (list: string[], re: RegExp) => list.filter((s) => re.test(s)).length;

// WE COULD NOT SEE IT IS NOT THE SAME AS IT IS NOT THERE.
//
// The first live run of the measured audit was against evandeli.com, one of the
// two brands this platform is being tested with. The host answered 403 — a bot
// rule in front of the site refused us — and the audit scored it anyway:
// 16/100, "urgent" in all six areas, "0 words on the entry page", "title tag
// missing", "0 product(s) named", "no way to make contact published".
//
// Every one of those sentences was false, and they read as measurements
// because that is exactly what they were shaped like. The old hash was
// obviously arbitrary once you knew; this was confidently, specifically wrong
// about a real customer's real website, which is worse.
//
// crawler.ts already classified the refusal correctly, and render-gap.ts
// already draws this exact distinction. The audit simply was not asking. It
// asks now: a blocked fetch or a JavaScript shell scores NOTHING that depends
// on the body, and hands back the block's own explanation and the fix.
function unreadable(e: AuditEvidence): string {
  const c = e.audit;
  if (!c) return "";
  if (c.block?.blocked) {
    return `${c.block.message}${c.block.action ? ` ${c.block.action}` : ""} Until then, nothing about the content of this site can be measured — and an empty reading is not the same as an empty site.`;
  }
  if (c.ok === false) {
    return `the page could not be fetched (HTTP ${c.httpStatus ?? "no response"}). Nothing about its content can be measured from a response we never got.`;
  }
  if (c.renderGap?.jsShell) {
    return `${c.renderGap.note} The site is almost certainly fine; we simply cannot read it without running its JavaScript, and scoring it on an empty shell would describe our crawler rather than your website.`;
  }
  return "";
}

/** Dimensions read from the response itself, not from what the page says. */
const READABLE_WHEN_BLIND = new Set(["Page speed"]);

function dimensionsFor(area: string, e: AuditEvidence): AuditDimension[] {
  const x = e.extraction ?? null;
  const c = e.audit ?? null;
  const has = Boolean(x || c);
  // Nothing crawled: every dimension is honestly blank. This is the state a
  // caller who passed only a business name lands in, which is exactly the case
  // the hash used to paper over.
  if (!has) {
    return AUDIT_DIMS[area].map((name) => ({
      name, score: null,
      basis: NOT_READABLE("nothing has been crawled yet. Run a deep crawl on the site and this becomes a measurement."),
    }));
  }

  const blind = unreadable(e);
  if (blind) {
    return AUDIT_DIMS[area].map((name) => {
      // Page speed is timed on the response, so a 403 that came back in 226ms
      // was still 226ms. Everything else describes content we never received.
      if (READABLE_WHEN_BLIND.has(name) && c?.loadMs) {
        return { name, score: null, basis: NOT_READABLE(`the response was timed at ${c.loadMs}ms, but ${blind}`) };
      }
      return { name, score: null, basis: NOT_READABLE(blind) };
    });
  }

  const nav = x?.navigation.map((n) => n.label) ?? [];
  const blog = x?.blogLinks.map((b) => b.label) ?? [];
  const ctas = x?.ctas ?? [];

  const rules: Record<string, Record<string, () => AuditDimension>> = {
    brand: {
      "Message clarity": () => {
        const facts = [Boolean(x?.brand.tagline), (c?.h1Count ?? 0) === 1, Boolean(c?.title), Boolean(c?.metaDescription)];
        return { name: "Message clarity", score: yesNo(facts), basis: `A tagline${x?.brand.tagline ? "" : " was not"} found, ${c?.h1Count ?? 0} H1 heading(s), title tag ${c?.title ? "present" : "missing"}, meta description ${c?.metaDescription ? "present" : "missing"}.` };
      },
      "Brand consistency": () => {
        const facts = [(x?.logos.length ?? 0) > 0, (x?.colours.length ?? 0) >= 2, (x?.fonts.length ?? 0) >= 1];
        return { name: "Brand consistency", score: yesNo(facts), basis: `${x?.logos.length ?? 0} logo(s), ${x?.colours.length ?? 0} brand colour(s) and ${x?.fonts.length ?? 0} font(s) read off the site. This checks that a brand is DECLARED, not that it is applied well.` };
      },
      "Visual quality": () => ({ name: "Visual quality", score: null, basis: NOT_READABLE("judging how a page looks needs the rendered page and a human eye. HTML says an image exists, not whether it is any good.") }),
      "Differentiation": () => ({ name: "Differentiation", score: null, basis: NOT_READABLE("differentiation is relative to competitors, and one site is not a market. The Competitive Attack Map is where this belongs.") }),
      "Trust strength": () => ({ name: "Trust strength", score: band(x?.trustSignals.length ?? 0, 5, 2), basis: `${x?.trustSignals.length ?? 0} trust signal(s) found in the copy — guarantees, accreditations, years trading and the like.` }),
      "Proof strength": () => {
        const n = (x?.reviews.length ?? 0) + matches(nav.concat(blog), /case stud|testimonial|review|success/i);
        return { name: "Proof strength", score: band(n, 4, 1), basis: `${x?.reviews.length ?? 0} review block(s) plus ${matches(nav.concat(blog), /case stud|testimonial|review|success/i)} case-study/testimonial page(s) linked.` };
      },
    },
    conversion: {
      "CTA clarity": () => ({ name: "CTA clarity", score: band(ctas.length, 4, 1), basis: `${ctas.length} call(s) to action found${ctas.length ? `: ${ctas.slice(0, 3).join(", ")}` : ""}.` }),
      "Offer strength": () => ({ name: "Offer strength", score: band(x?.offers.length ?? 0, 3, 1), basis: `${x?.offers.length ?? 0} promotion(s) or offer(s) found in the copy.` }),
      "Friction": () => {
        const routes = (x?.contact.emails.length ?? 0) + (x?.contact.phones.length ?? 0) + (x?.contact.address ? 1 : 0);
        return { name: "Friction", score: band(routes, 3, 1), basis: `${routes} way(s) to make contact published (email, phone, address). Fewer routes means more people who wanted to buy and could not.` };
      },
      "Mobile experience": () => ({ name: "Mobile experience", score: null, basis: NOT_READABLE("this needs the page rendered at a phone's width. A crawl reads markup, not layout.") }),
      "Page speed": () => {
        if (!c?.loadMs) return { name: "Page speed", score: null, basis: NOT_READABLE("the page was not fetched, so nothing was timed.") };
        const s = c.loadMs <= 800 ? 92 : c.loadMs <= 1800 ? 75 : c.loadMs <= 3500 ? 52 : 28;
        return { name: "Page speed", score: s, basis: `The page answered in ${c.loadMs}ms from this server${c.htmlBytes ? `, ${Math.round(c.htmlBytes / 1024)}KB of HTML` : ""}. One measurement from one place — not a Core Web Vitals score, which needs real visitors.` };
      },
      "Abandonment risk": () => ({ name: "Abandonment risk", score: null, basis: NOT_READABLE("abandonment is a behaviour, and behaviour comes from analytics on real sessions, not from the markup.") }),
    },
    content: {
      "Content coverage": () => ({ name: "Content coverage", score: band(c?.wordCount ?? 0, 800, 250), basis: `${c?.wordCount ?? 0} words on the entry page.` }),
      "Headline strength": () => {
        const h = x?.hierarchy.filter((y) => y.level <= 2).length ?? 0;
        return { name: "Headline strength", score: band(h, 6, 2), basis: `${h} top-level heading(s) structuring the page. This counts structure, not persuasion.` };
      },
      "Product descriptions": () => {
        const n = (x?.products.values.length ?? 0) + (x?.services.values.length ?? 0);
        return { name: "Product descriptions", score: band(n, 6, 2), basis: `${x?.products.values.length ?? 0} product(s) and ${x?.services.values.length ?? 0} service(s) named on the site.` };
      },
      "FAQs": () => ({ name: "FAQs", score: band(x?.faqs.length ?? 0, 6, 2), basis: `${x?.faqs.length ?? 0} question-and-answer pair(s) found. FAQs are also what AI assistants quote most readily.` }),
      "Demonstrations": () => {
        const n = (x?.videos.length ?? 0) * 2 + Math.min(6, nonPixelImages(x));
        return { name: "Demonstrations", score: band(n, 8, 3), basis: `${x?.videos.length ?? 0} video(s) and ${nonPixelImages(x)} real image(s) — tracking pixels excluded.` };
      },
      "Content freshness": () => ({ name: "Content freshness", score: null, basis: NOT_READABLE("nothing on the pages we read carried a reliable publication date. A link to a blog is not evidence that the blog is current.") }),
    },
    search: {
      "SEO strength": () => {
        const facts = [Boolean(c?.title), Boolean(c?.metaDescription), (c?.h1Count ?? 0) === 1, (c?.imagesNoAlt ?? 0) === 0, Boolean(c?.robotsTxt), Boolean(c?.sitemapXml)];
        return { name: "SEO strength", score: yesNo(facts), basis: `Title ${c?.title ? "✓" : "✗"}, meta description ${c?.metaDescription ? "✓" : "✗"}, exactly one H1 ${(c?.h1Count ?? 0) === 1 ? "✓" : "✗"}, all images have alt text ${(c?.imagesNoAlt ?? 0) === 0 ? "✓" : `✗ (${c?.imagesNoAlt} without)`}, robots.txt ${c?.robotsTxt ? "✓" : "✗"}, sitemap ${c?.sitemapXml ? "✓" : "✗"}.` };
      },
      "Search-intent coverage": () => {
        const n = nav.length + blog.length;
        return { name: "Search-intent coverage", score: band(n, 20, 6), basis: `${nav.length} navigation entr(ies) and ${blog.length} article(s) linked — a crude proxy for how many things this site can rank for.` };
      },
      "Local search": () => {
        const facts = [Boolean(x?.contact.address), (x?.contact.phones.length ?? 0) > 0, (c?.structuredDataTypes ?? []).some((t) => /LocalBusiness|Organization|Place/i.test(t))];
        return { name: "Local search", score: yesNo(facts), basis: `Address ${x?.contact.address ? "published" : "not published"}, ${x?.contact.phones.length ?? 0} phone number(s), LocalBusiness/Organization schema ${facts[2] ? "present" : "absent"}.` };
      },
      "Structured data": () => {
        const types = c?.structuredDataTypes ?? [];
        return { name: "Structured data", score: band(types.length, 4, 1), basis: types.length ? `${types.length} schema type(s) declared: ${types.slice(0, 5).join(", ")}.` : "No schema.org structured data found. This is what search engines and AI assistants read to understand what the business is." };
      },
      "AI-search/GEO visibility": () => ({ name: "AI-search/GEO visibility", score: null, basis: NOT_READABLE("whether assistants mention this business is measured by asking them, not by reading the site. That is what the AI Visibility module does.") }),
      "Comparison/problem pages": () => {
        const n = matches(nav.concat(blog), /\b(vs|versus|compare|comparison|alternative|how to|guide|why|best)\b/i);
        return { name: "Comparison/problem pages", score: band(n, 5, 1), basis: `${n} comparison, guide or problem-led page(s) linked. These are the pages that catch people still deciding.` };
      },
    },
    social: {
      "Short-form concepts": () => ({ name: "Short-form concepts", score: null, basis: NOT_READABLE("this is about content that does not exist yet. A site cannot be scored on posts it has not made.") }),
      "Posting consistency": () => ({ name: "Posting consistency", score: null, basis: NOT_READABLE("cadence lives on the platforms, not on the website. Connect the social accounts and this becomes measurable.") }),
      "Social proof": () => {
        const n = (x?.reviews.length ?? 0) + matches(x?.trustSignals ?? [], /trusted by|as seen|award|\d+\+? (?:customers|clients|users)/i);
        return { name: "Social proof", score: band(n, 4, 1), basis: `${x?.reviews.length ?? 0} review block(s) and ${matches(x?.trustSignals ?? [], /trusted by|as seen|award|\d+\+? (?:customers|clients|users)/i)} social-proof phrase(s) on the page.` };
      },
      "Platform fit": () => {
        const hosts = new Set((x?.socialLinks ?? []).map((s) => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.url; } }));
        return { name: "Platform fit", score: band(hosts.size, 4, 1), basis: hosts.size ? `Linked to ${hosts.size} platform(s): ${[...hosts].slice(0, 5).join(", ")}.` : "No social profiles linked from the site — buyers who want to check you before buying have nowhere to look." };
      },
      "Format variety": () => {
        const kinds = [nonPixelImages(x) > 0, (x?.videos.length ?? 0) > 0, blog.length > 0, (x?.faqs.length ?? 0) > 0];
        return { name: "Format variety", score: yesNo(kinds), basis: `Formats present on the site: ${["images", "video", "articles", "Q&A"].filter((_, i) => kinds[i]).join(", ") || "none found"}.` };
      },
      "Creator/community strategy": () => ({ name: "Creator/community strategy", score: null, basis: NOT_READABLE("partnerships and community are not declared in markup. Nothing on a page proves whether they exist.") }),
    },
    commercial: {
      "Packaging": () => {
        const n = (x?.products.values.length ?? 0) + (x?.services.values.length ?? 0);
        return { name: "Packaging", score: band(n, 5, 2), basis: `${n} distinct thing(s) offered for sale. Too few and there is nothing to trade up to; this counts them, it does not judge the line-up.` };
      },
      "Pricing presentation": () => {
        const declared = (x?.pricing ?? []).filter((p) => p.declared).length;
        const total = x?.pricing.length ?? 0;
        return { name: "Pricing presentation", score: band(total, 4, 1), basis: total ? `${total} price(s) found, ${declared} of them declared in structured data (which is what search engines and assistants can actually read).` : "No prices found on the site. Buyers who cannot see a price often do not ask for one." };
      },
      "Bundles": () => {
        const n = matches((x?.offers ?? []).concat(x?.products.values ?? []), /bundle|package|combo|set of|multi[- ]buy|\bkit\b|deal/i);
        return { name: "Bundles", score: band(n, 3, 1), basis: `${n} bundle or package offer(s) found in the product and offer copy.` };
      },
      "Upsells/cross-sells": () => ({ name: "Upsells/cross-sells", score: null, basis: NOT_READABLE("an upsell happens in the basket, after a choice. A crawl of public pages never sees it.") }),
      "Lead magnets": () => {
        const n = matches(ctas.concat(nav), /download|free (?:guide|report|trial|sample|quote|consultation)|newsletter|subscribe|checklist|template|webinar/i);
        return { name: "Lead magnets", score: band(n, 3, 1), basis: `${n} lead magnet(s) offered — something worth an email address in exchange.` };
      },
      "Retargeting/referral": () => ({ name: "Retargeting/referral", score: null, basis: NOT_READABLE("this lives in ad accounts and a referral programme's own tooling, not in the page. Connect the ad platforms to measure it.") }),
    },
  };

  return AUDIT_DIMS[area].map((name) => rules[area]?.[name]?.() ?? { name, score: null, basis: NOT_READABLE("no rule defined for this dimension.") });
}

/**
 * The Instant Marketing Audit.
 *
 * @param x    The business, for naming only — it no longer influences a score.
 * @param e    What the crawl found. Omit it and every dimension honestly
 *             returns null: the audit refuses to grade a site it has not read.
 */
export function instantAudit(x: SiteExtract, e: AuditEvidence = {}): SiteAudit {
  const sections: AuditSection[] = Object.keys(AUDIT_DIMS).map((area) => {
    const dimensions = dimensionsFor(area, e);
    const scored = dimensions.filter((d) => d.score !== null) as (AuditDimension & { score: number })[];
    const overall = scored.length ? clamp(scored.reduce((s, d) => s + d.score, 0) / scored.length) : null;
    const verdict: AuditSection["verdict"] =
      overall === null ? "not measured" : overall >= 75 ? "strong" : overall >= 55 ? "improve" : "urgent";
    return { area, overall, verdict, dimensions, measured: scored.length, total: dimensions.length };
  });

  const measuredSections = sections.filter((s) => s.overall !== null) as (AuditSection & { overall: number })[];
  const overall = measuredSections.length ? clamp(measuredSections.reduce((s, d) => s + d.overall, 0) / measuredSections.length) : null;
  const measured = sections.reduce((n, s) => n + s.measured, 0);
  const total = sections.reduce((n, s) => n + s.total, 0);

  const blind = unreadable(e);
  const headline = blind
    // Never "your site scored 16/100" when the truth is "your site would not
    // let us look". The distinction is the whole point of render-gap.ts, and
    // this is the sentence a customer actually reads.
    ? `No marketing health score for ${x.business}: we could not read the site, so there is nothing to score. ${blind}`
    : overall === null
    ? `No marketing health score: nothing has been crawled for ${x.business} yet, and a score derived from the business name would be a number about the name rather than the site. Run a deep crawl and this becomes a measurement.`
    : (() => {
        const weakest = [...measuredSections].sort((a, b) => a.overall - b.overall)[0];
        return `Marketing health ${overall}/100 across the ${measured} of ${total} checks this crawl could actually measure — weakest area is ${weakest.area} (${weakest.overall}). Fix that before scaling spend.`;
      })();

  return {
    sections, overall, headline,
    coverage: {
      measured, total,
      note: blind
        ? "Nothing was measured, because the site could not be read. That is a fact about the crawl, not a finding about the website."
        : measured === 0
        ? "Nothing was measured. Every dimension says why."
        : `${measured} of ${total} checks were measured from what the crawl actually found; the other ${total - measured} say what they would need instead of guessing. Each score shows the count it came from, so you can check the reasoning rather than trust it.`,
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Competitive Attack Map — 16 gap classes → 6 priority buckets.
// ---------------------------------------------------------------------------
export const GAP_CLASSES = [
  "competitor_strengths", "competitor_weaknesses", "underused_customer_pains", "unsatisfied_review_themes",
  "poorly_served_regions", "missing_product_bundles", "unaddressed_objections", "unclaimed_search_topics",
  "unused_content_formats", "saturated_ad_angles", "pricing_gaps", "service_speed_gaps",
  "trust_gaps", "accessibility_gaps", "localisation_gaps", "customer_support_gaps",
] as const;

export const ATTACK_PRIORITIES = [
  "quick_revenue_wins", "viral_opportunities", "conversion_improvements",
  "brand_differentiation", "retention_improvements", "long_term_defensibility",
] as const;

export type AttackMove = {
  gap: string;
  /** 0–95, or null when nothing we read shows whether this gap is open. */
  opportunity: number | null;
  priority: string;
  play: string;
  /** What the ranking was read from, or why there is no ranking. Always shown. */
  evidence: string;
};
export type AttackMap = { moves: AttackMove[]; byPriority: Record<string, AttackMove[]>; ranked: number; note: string };

const GAP_TO_PRIORITY: Record<string, string> = {
  competitor_weaknesses: "quick_revenue_wins", unsatisfied_review_themes: "quick_revenue_wins",
  unused_content_formats: "viral_opportunities", saturated_ad_angles: "viral_opportunities",
  unaddressed_objections: "conversion_improvements", pricing_gaps: "conversion_improvements", trust_gaps: "conversion_improvements",
  underused_customer_pains: "brand_differentiation", service_speed_gaps: "brand_differentiation", accessibility_gaps: "brand_differentiation",
  customer_support_gaps: "retention_improvements", missing_product_bundles: "retention_improvements",
  unclaimed_search_topics: "long_term_defensibility", poorly_served_regions: "long_term_defensibility",
  localisation_gaps: "long_term_defensibility", competitor_strengths: "long_term_defensibility",
};

// The ranking was `sscore(x.business + gap, 30, 95)` — the same hash of the
// business name, deciding which of sixteen moves a customer should do FIRST.
// The plays themselves are real advice and are untouched; the order they were
// presented in was a checksum, and "your biggest opportunity is trust gaps"
// was a sentence about the spelling of their company.
//
// A gap is only worth ranking when something we actually read shows it is open.
// Six of the sixteen are visible in a crawl: a site with no trust signals has a
// trust gap, a site with no FAQ page has unanswered objections. The other ten
// need competitor data, review corpora or ad-platform history that no crawl of
// one site can supply — those keep the play and lose the number.
function openGapFrom(gap: string, x: SiteExtraction | null, reason = ""): { opportunity: number | null; evidence: string } {
  if (!x) {
    return { opportunity: null, evidence: reason || "Not ranked — nothing has been crawled, and ordering these by anything else would be ordering them by nothing." };
  }
  const nav = x.navigation.map((n) => n.label).concat(x.blogLinks.map((b) => b.label));
  const has = (re: RegExp) => nav.some((l) => re.test(l));
  // A gap score is "how much of this is MISSING", measured, capped at 95 so it
  // never reads as certainty.
  const gapScore = (missing: number, of: number) => Math.min(95, Math.round((missing / Math.max(1, of)) * 95));

  switch (gap) {
    case "trust_gaps": {
      const n = x.trustSignals.length;
      return { opportunity: gapScore(Math.max(0, 5 - n), 5), evidence: `${n} trust signal(s) on the site; a buyer deciding between you and a rival has ${n === 0 ? "nothing" : "little"} to weigh.` };
    }
    case "unaddressed_objections": {
      const n = x.faqs.length;
      return { opportunity: gapScore(Math.max(0, 6 - n), 6), evidence: `${n} question(s) answered on the site. Every unanswered one is a reason to leave and not come back.` };
    }
    case "pricing_gaps": {
      const n = x.pricing.length;
      return { opportunity: gapScore(Math.max(0, 3 - n), 3), evidence: n ? `${n} price(s) published.` : "No prices published anywhere we could read." };
    }
    case "unused_content_formats": {
      const kinds = [x.images.length > 0, x.videos.length > 0, x.blogLinks.length > 0, x.faqs.length > 0].filter(Boolean).length;
      return { opportunity: gapScore(4 - kinds, 4), evidence: `${kinds} of 4 content formats in use (images, video, articles, Q&A).` };
    }
    case "unclaimed_search_topics": {
      const n = x.blogLinks.length;
      return { opportunity: gapScore(Math.max(0, 12 - n), 12), evidence: `${n} article(s) linked from the site — each one is a door search can open.` };
    }
    case "missing_product_bundles": {
      const n = x.offers.filter((o) => /bundle|package|combo|set of|deal/i.test(o)).length;
      return { opportunity: gapScore(Math.max(0, 2 - n), 2), evidence: `${n} bundle offer(s) found across ${x.products.values.length} product(s).` };
    }
    case "accessibility_gaps":
      return { opportunity: null, evidence: "Not ranked — a real accessibility finding needs the rendered page tested against WCAG, not its markup skimmed." };
    case "localisation_gaps":
      return { opportunity: has(/\/(fr|de|es|it|nl|pt)(\/|$)|language|lang=/i) ? 20 : null, evidence: has(/\/(fr|de|es|it|nl|pt)(\/|$)|language|lang=/i) ? "Other-language paths are linked, so localisation has started." : "Not ranked — whether this business should sell in another language is a commercial decision, not something a crawl can infer." };
    default:
      return { opportunity: null, evidence: "Not ranked — this needs competitor data, review corpora or ad-platform history that a crawl of one site cannot supply. The play still stands; its priority is yours to judge." };
  }
}

export function attackMap(x: SiteExtract, e: AuditEvidence = {}): AttackMap {
  // Same rule as the audit: a site we were refused has no measurable gaps. An
  // empty extraction from a 403 would otherwise rank EVERY gap wide open and
  // tell the customer their site is missing everything.
  const blind = unreadable(e);
  const blindReason = blind ? `Not ranked — we could not read the site. ${blind}` : "";
  const extraction = blind ? null : e.extraction ?? null;
  const moves: AttackMove[] = GAP_CLASSES.map((gap) => {
    const { opportunity, evidence } = openGapFrom(gap, extraction, blindReason);
    const priority = GAP_TO_PRIORITY[gap] ?? "conversion_improvements";
    return { gap, opportunity, priority, play: playFor(gap, x), evidence };
    // Ranked moves first, in order; unranked ones keep a stable listing order
    // rather than being shuffled to the bottom by a missing number.
  }).sort((a, b) => (b.opportunity ?? -1) - (a.opportunity ?? -1));
  const byPriority: Record<string, AttackMove[]> = {};
  for (const p of ATTACK_PRIORITIES) byPriority[p] = moves.filter((m) => m.priority === p);
  const ranked = moves.filter((m) => m.opportunity !== null).length;
  return {
    moves, byPriority, ranked,
    note: blind
      ? `Nothing is ranked, because the site could not be read. ${blind}`
      : ranked
      ? `Where this business can win WITHOUT copying competitors. ${ranked} of ${moves.length} moves are ranked by a gap we measured on the site, and each shows what that measurement was. The rest need competitor or ad-platform data we do not have — their advice is still sound, but nobody should be told which to do first on the strength of a guess.`
      : "Where this business can win WITHOUT copying competitors. Nothing is ranked: no crawl has run, and an order derived from the business name would be an order derived from nothing. Run a deep crawl to rank these.",
  };
}

function playFor(gap: string, x: SiteExtract): string {
  const plays: Record<string, string> = {
    competitor_weaknesses: `Turn the top complaint about rivals into ${x.business}'s headline promise.`,
    unsatisfied_review_themes: "Publish proof content answering the exact themes customers complain about elsewhere.",
    unused_content_formats: "Own a format the category isn't using yet (e.g. product-test shorts).",
    saturated_ad_angles: "Retire the saturated hook; lead with a fresh, less-crowded angle.",
    unaddressed_objections: "Add an objection-handling page/section that rivals skip.",
    pricing_gaps: "Reframe pricing with a bundle or clearer value ladder.",
    trust_gaps: "Add a guarantee + verified proof block above the fold.",
    unclaimed_search_topics: "Build problem-led + comparison pages for topics no one ranks for.",
    poorly_served_regions: "Spin up service-area pages for under-served postcodes.",
    localisation_gaps: "Transcreate (not translate) for the local audience.",
  };
  return plays[gap] || `Close the ${gap.replace(/_/g, " ")} with a targeted campaign.`;
}

// ---------------------------------------------------------------------------
// Deterministic demo so the whole engine renders with zero config.
// ---------------------------------------------------------------------------
export function demoSite(): SiteExtract {
  return { business: "Brixton Grill House", category: "Restaurant", offers: ["Dine-in", "Table booking", "Private hire"], pricePosition: "mass", location: "Brixton, London", reviews: 213, rating: 4.7 };
}

export function demoSiteRaid() {
  const x = demoSite();
  return {
    site: x,
    ingestion: authoriseIngestion({ authorisation: "own" }),
    businessDNA: businessDNA(x),
    truthLayer: truthLayer([
      { text: "Free delivery over £30", source: "delivery policy" },
      { text: "Rated 4.7 by 213 diners", source: "Google reviews" },
      { text: "The best grill in London", substantiated: false },
      { text: "Family-run since 2016", substantiated: true },
    ]),
    audit: instantAudit(x),
    attackMap: attackMap(x),
  };
}
