// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// "Anatomy of a MarketWar page" — audited, not recited.
//
// That list previously sat on the dashboard as eight bullet points with no way
// to act on them. A checklist you cannot check is decoration: it tells a
// customer what a good page contains without telling them whether THEIR page
// contains it.
//
// This checks a real stored page against each element and returns what is
// present, what is missing, and what to do about each gap — so the list becomes
// a to-do rather than a poster.
//
// One deliberate omission: there is no "add fake proof" fix. Where a page lacks
// social proof the guidance is to collect a real quote, never to generate one.

export type AnatomyCheck = {
  id: string;
  label: string;
  present: boolean;
  detail: string;
  fix?: string;         // what to do when it is missing
  weight: number;       // how much this element matters to conversion
};

export type AnatomyAudit = {
  slug: string;
  headline: string;
  checks: AnatomyCheck[];
  presentCount: number;
  total: number;
  scorePct: number;      // weighted, so a missing CTA hurts more than a missing FAQ
  topFix?: string;
  summary: string;
};

// The shape of a stored page, kept loose so this module never breaks when the
// landing generator gains a field.
type PageLike = {
  slug: string;
  headline?: string;
  subheadline?: string;
  offerText?: string;
  primaryCta?: string;
  primaryCtaUrl?: string;
  sections?: { type: string; heading?: string; body?: string; items?: string[] }[];
  formConfig?: { enabled?: boolean; fields?: { key: string }[] };
  whatsappConfig?: { enabled?: boolean; phoneNumber?: string };
  logoUrl?: string;
};

const has = (v?: string) => Boolean(v && v.trim().length > 0);
const sectionOfType = (p: PageLike, ...types: string[]) =>
  (p.sections || []).find((s) => types.includes(s.type));

export function auditPageAnatomy(page: PageLike): AnatomyAudit {
  const sections = page.sections || [];
  const fields = page.formConfig?.fields || [];
  const wa = Boolean(page.whatsappConfig?.enabled && page.whatsappConfig?.phoneNumber);

  const offer = sectionOfType(page, "offer");
  const problem = sectionOfType(page, "problem");
  const benefits = sectionOfType(page, "benefits", "how_it_works", "features");
  const proof = sectionOfType(page, "proof", "testimonials", "reviews");
  const faq = sectionOfType(page, "faq");
  const urgency = sectionOfType(page, "urgency");

  const checks: AnatomyCheck[] = [
    {
      id: "headline",
      label: "Headline that repeats the ad's promise",
      present: has(page.headline),
      weight: 5,
      detail: has(page.headline) ? `“${page.headline}”` : "No headline.",
      fix: "The headline must echo the ad that brought them. A visitor who cannot see their own click reflected back bounces in under three seconds.",
    },
    {
      id: "offer",
      label: "Offer block with price, deadline and cap",
      present: Boolean(offer) || has(page.offerText),
      weight: 5,
      detail: offer?.body || page.offerText || "No offer stated.",
      fix: "State what they get and what it costs. A page that hides the price makes the visitor go and find a competitor who does not.",
    },
    {
      id: "problem",
      label: "Problem → benefits in customer language",
      present: Boolean(problem) || Boolean(benefits),
      weight: 4,
      detail: problem?.heading || benefits?.heading || "Neither the problem nor the benefits are spelled out.",
      fix: "Name the frustration in the words your customers use, then answer it. Feature lists persuade nobody who is not already sold.",
    },
    {
      id: "proof",
      label: "Proof: reviews, counters, local names",
      present: Boolean(proof),
      weight: 4,
      detail: proof ? `${proof.items?.length || 0} proof point(s)` : "No proof section.",
      fix: "Add one REAL customer quote with a name and, if they allow it, a logo. Never generate a testimonial — an invented quote is a legal problem, not a shortcut.",
    },
    {
      id: "faq",
      label: "FAQ that kills the top 3 objections",
      present: Boolean(faq && (faq.items?.length || 0) >= 2),
      weight: 3,
      detail: faq ? `${faq.items?.length || 0} question(s)` : "No FAQ.",
      fix: "Write down the three things people ask before buying and answer them here. Every unanswered objection is a visitor who leaves to think about it.",
    },
    {
      id: "cta",
      label: "Single CTA: one-tap WhatsApp or checkout",
      present: has(page.primaryCta) && (wa || has(page.primaryCtaUrl) || Boolean(page.formConfig?.enabled)),
      weight: 5,
      detail: has(page.primaryCta)
        ? `“${page.primaryCta}” → ${wa ? "WhatsApp" : has(page.primaryCtaUrl) ? "your own link" : page.formConfig?.enabled ? "the lead form" : "nowhere"}`
        : "No call to action.",
      fix: "One button, one destination. Give it somewhere to go: a WhatsApp number, your checkout, or the lead form.",
    },
    {
      id: "form",
      label: "Lead form fallback (2 fields max)",
      present: Boolean(page.formConfig?.enabled) && fields.length > 0 && fields.length <= 3,
      weight: 3,
      detail: !page.formConfig?.enabled
        ? "No lead form — if the CTA link breaks, there is no way to reach you."
        : fields.length > 3
          ? `${fields.length} fields — each extra field costs completions.`
          : `${fields.length} field(s).`,
      fix: fields.length > 3
        ? `Cut to three fields or fewer. You are asking for ${fields.length}; every one past three measurably reduces completions.`
        : "Turn the lead form on as a fallback, so a visitor who will not click through can still leave their details.",
    },
    {
      id: "tracking",
      label: "Tracking + A/B variant slot",
      present: true,   // every hosted page is tracked from the moment it is live
      weight: 2,
      detail: "Views, CTA clicks and leads are counted automatically on every published page.",
    },
    {
      id: "urgency",
      label: "A real deadline (only if genuine)",
      present: Boolean(urgency),
      weight: 2,
      detail: urgency ? urgency.body || "Deadline stated." : "No deadline — which is correct unless one genuinely exists.",
      fix: "Only add urgency if the offer really ends. A fake countdown that resets on refresh is noticed, and it costs trust permanently.",
    },
  ];

  const total = checks.length;
  const presentCount = checks.filter((c) => c.present).length;
  const weightTotal = checks.reduce((s, c) => s + c.weight, 0);
  const weightGot = checks.filter((c) => c.present).reduce((s, c) => s + c.weight, 0);
  const scorePct = Math.round((weightGot / weightTotal) * 100);

  // The most valuable missing element, so there is one obvious next action
  // rather than nine competing ones.
  const missing = checks.filter((c) => !c.present).sort((a, b) => b.weight - a.weight);

  return {
    slug: page.slug,
    headline: page.headline || page.slug,
    checks,
    presentCount,
    total,
    scorePct,
    topFix: missing[0]?.fix,
    summary:
      missing.length === 0
        ? `All ${total} elements present. This page is structurally complete — improve it now by testing headlines, not by adding sections.`
        : `${presentCount} of ${total} elements present. Biggest gap: ${missing[0].label}.`,
  };
}
