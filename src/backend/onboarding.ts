// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Autonomous Business & Market Onboarding Engine (Organic Dominance §5).
//
// Turns a bare business description into the full "market picture" a growth OS
// needs on day zero: brand voice, audience map, persona hypotheses, the customer
// problem map, a competitor angle map, and the keyword / question / AI-prompt
// universes that feed SEO, content and answer-engine strategy — plus content
// pillars, conversion goals and a 90-day play. DOCTRINE: every list here is a
// LABELLED STARTING HYPOTHESIS / ESTIMATE meant to be refined with real data.
// Nothing invents customer testimonials, reviews or performance metrics.
// Pure + deterministic + demo-safe: all variation comes from a seeded hash of
// the business + industry, never from Date/Math.random.

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};
const pick = <T,>(arr: T[], n: number): T => arr[Math.abs(n) % arr.length];
// Deterministic distinct selection: rotate through the pool from a seeded offset.
const rotate = <T,>(arr: T[], n: number, count: number): T[] => {
  const out: T[] = [];
  const len = arr.length;
  const start = Math.abs(n) % len;
  for (let i = 0; i < Math.min(count, len); i++) out.push(arr[(start + i) % len]);
  return out;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type OnboardingInput = {
  business: string;
  website?: string;
  competitors?: string[];
  industry?: string;
  countries?: string[];
  languages?: string[];
  objective?: string;
};

export type AudienceSegment = { segment: string; need: string };
export type PersonaHypothesis = { name: string; role: string; painPoint: string };
export type CompetitorAngle = { name: string; angle: string };
export type PlanPhase = { phase: string; focus: string; plays: string[] };

export type BusinessProfile = {
  business: string;
  industry: string;
  website: string;
  countries: string[];
  languages: string[];
  objective: string;
  positioningHypothesis: string;
  maturityEstimate: string;
};

export type OnboardingBundle = {
  status: "ESTIMATE — starting hypotheses, refine with real data";
  businessProfile: BusinessProfile;
  brandVoiceProfile: string[];
  audienceMap: AudienceSegment[];
  personaHypotheses: PersonaHypothesis[];
  customerProblemMap: string[];
  competitorMap: CompetitorAngle[];
  keywordUniverse: string[];
  customerQuestionUniverse: string[];
  aiPromptUniverse: string[];
  contentPillars: string[];
  conversionGoals: string[];
  ninetyDayPlan: PlanPhase[];
  doctrine: string;
};

// ---------------------------------------------------------------------------
// Industry inference (deterministic keyword match)
// ---------------------------------------------------------------------------
function inferIndustry(business: string): string {
  const p = business.toLowerCase();
  if (/\b(restaurant|food|takeaway|catering|cafe|coffee)\b/.test(p)) return "hospitality";
  if (/\b(saas|software|app|platform|ai|tech)\b/.test(p)) return "technology / SaaS";
  if (/\b(build|construct|trade|plumb|electric|roof)\b/.test(p)) return "construction / trades";
  if (/\b(marketing|agency|ad|growth|seo)\b/.test(p)) return "marketing services";
  if (/\b(health|clinic|dental|care|wellness|fitness|gym)\b/.test(p)) return "healthcare / wellness";
  if (/\b(property|estate|letting|realtor)\b/.test(p)) return "real estate";
  if (/\b(shop|store|ecommerce|retail|boutique)\b/.test(p)) return "retail / e-commerce";
  if (/\b(law|legal|solicitor|accountant|finance|consult)\b/.test(p)) return "professional services";
  return "professional services";
}

// Tone-word pools keyed loosely by industry; selection is seeded and distinct.
function voiceTones(industry: string, s: number): string[] {
  const base = ["clear", "confident", "helpful", "human", "direct", "credible", "practical", "warm", "sharp", "reassuring"];
  const byIndustry: Record<string, string[]> = {
    "hospitality": ["inviting", "generous", "local", "appetising"],
    "technology / SaaS": ["precise", "modern", "empowering", "no-nonsense"],
    "construction / trades": ["dependable", "straight-talking", "solid", "punctual"],
    "marketing services": ["bold", "results-first", "energetic", "insightful"],
    "healthcare / wellness": ["caring", "calm", "trustworthy", "evidence-led"],
    "real estate": ["aspirational", "assured", "knowledgeable", "polished"],
    "retail / e-commerce": ["playful", "on-trend", "vivid", "value-led"],
    "professional services": ["authoritative", "measured", "expert", "discreet"],
  };
  const flavour = byIndustry[industry] || byIndustry["professional services"];
  return [...rotate(base, s, 4), ...rotate(flavour, s >> 3, 2)];
}

// ---------------------------------------------------------------------------
// onboard — the core generator
// ---------------------------------------------------------------------------
export function onboard(input: OnboardingInput): OnboardingBundle {
  const business = input.business.trim();
  if (!business) throw new Error("business is required");
  const industry = (input.industry && input.industry.trim()) || inferIndustry(business);
  const website = input.website?.trim() || "";
  const countries = input.countries && input.countries.length ? input.countries : ["United Kingdom"];
  const languages = input.languages && input.languages.length ? input.languages : ["en"];
  const objective = input.objective?.trim() || "grow qualified customer acquisition profitably";
  const s = seed(business + "|" + industry);

  const primaryCountry = countries[0];

  const audiencePool: AudienceSegment[] = [
    { segment: `first-time ${industry} buyers`, need: "reassurance they are making the right choice" },
    { segment: `price-sensitive shoppers in ${primaryCountry}`, need: "clear value and no hidden cost" },
    { segment: "time-poor decision-makers", need: "fast answers and a frictionless path to buy" },
    { segment: "returning / loyal customers", need: "recognition, continuity and a reason to come back" },
    { segment: "sceptical researchers", need: "proof, comparisons and honest detail before committing" },
    { segment: "referrers and word-of-mouth advocates", need: "an experience worth telling others about" },
  ];
  const audienceMap = rotate(audiencePool, s, 5);

  const personaPool: PersonaHypothesis[] = [
    { name: "Careful Ash", role: `${industry} first-time buyer`, painPoint: "afraid of overpaying or picking the wrong provider" },
    { name: "Busy Robin", role: "operations lead", painPoint: "no time to evaluate — needs a quick, trustworthy default" },
    { name: "Sceptical Sam", role: "researcher / comparison shopper", painPoint: "burned before — distrusts marketing claims without proof" },
    { name: "Loyal Jordan", role: "repeat customer", painPoint: "wants continuity but feels taken for granted" },
    { name: "Budget-Watch Kai", role: "cost-conscious owner", painPoint: "must justify every spend against ROI" },
  ];
  const personaHypotheses = rotate(personaPool, s >> 2, 4);

  const problemPool: string[] = [
    `${industry} options feel confusing and hard to compare`,
    "buyers can't tell who to trust before they commit",
    "the cheapest option often disappoints, and the safe option feels overpriced",
    "getting answers takes too long, so people delay or give up",
    "past bad experiences make people wary of switching",
    "it's unclear what the outcome will actually be until after paying",
  ];
  const customerProblemMap = rotate(problemPool, s >> 1, 5);

  // Competitors: use supplied names where given, else labelled generic placeholders.
  const angles = [
    "competes on lowest price — vulnerable on quality and trust",
    "competes on premium reputation — vulnerable on price and accessibility",
    "competes on speed / convenience — vulnerable on depth and personalisation",
    "competes on breadth of range — vulnerable on focus and expertise",
    "competes on local familiarity — vulnerable on innovation and reach",
  ];
  const suppliedCompetitors = (input.competitors || []).map((c) => c.trim()).filter((c) => c.length > 0);
  const competitorNames = suppliedCompetitors.length
    ? suppliedCompetitors
    : ["Incumbent A (placeholder — confirm)", "Challenger B (placeholder — confirm)", "Local rival C (placeholder — confirm)"];
  const competitorMap: CompetitorAngle[] = competitorNames.slice(0, 6).map((name, i) => ({
    name,
    angle: pick(angles, s + i),
  }));

  const b0 = business.split(/\s+/)[0].toLowerCase();
  const keywordUniverse = [
    `best ${industry} ${primaryCountry}`,
    `${b0} near me`,
    `affordable ${industry}`,
    `${industry} reviews`,
    `how to choose ${industry}`,
    `${industry} for ${audienceMap[0].segment}`,
    `${b0} vs alternatives`,
    `top rated ${industry} ${primaryCountry}`,
    `${industry} cost guide`,
    `local ${industry} services`,
  ];

  const customerQuestionUniverse = [
    `How much does ${industry} usually cost?`,
    `How do I know which ${industry} provider to trust?`,
    `What should I look for when choosing ${industry}?`,
    `Is ${business} right for someone like me?`,
    `How long does it take to get results with ${industry}?`,
    `What is the difference between the cheap and premium options?`,
    `Can I get a refund or guarantee?`,
    `What do other customers say — and how do I verify it?`,
  ];

  const aiPromptUniverse = [
    `Recommend a trustworthy ${industry} provider in ${primaryCountry} for a first-time buyer`,
    `Compare ${industry} options on price, quality and trust`,
    `What questions should I ask before hiring a ${industry} provider?`,
    `Is ${business} a good choice and why?`,
    `Summarise the pros and cons of ${industry} for a busy decision-maker`,
    `Find the best-value ${industry} option that isn't the cheapest or the most expensive`,
  ];

  const contentPillars = rotate([
    `How to choose ${industry} (buyer's guides)`,
    "Cost & value transparency",
    "Trust, proof and behind-the-scenes",
    `${primaryCountry}-local relevance`,
    "Common mistakes and how to avoid them",
    "Results and outcomes (evidence-led, no invented metrics)",
  ], s >> 4, 5);

  const conversionGoals = rotate([
    "book a call / consultation",
    "request a quote or estimate",
    "start a free trial or sample",
    "join the email list (explicit consent)",
    "make a first purchase",
    "return for a second purchase",
  ], s >> 5, 5);

  const ninetyDayPlan: PlanPhase[] = [
    {
      phase: "Days 1–30 — Foundation & listen",
      focus: "validate the hypotheses above against real data before scaling spend",
      plays: [
        "instrument analytics and confirm the real top customer questions",
        `publish 2 cornerstone buyer's-guide pages around "${keywordUniverse[0]}" and "${keywordUniverse[4]}"`,
        "collect first-party audience data with explicit consent (no bought lists)",
        "verify the competitor angles above with actual research, replacing placeholders",
      ],
    },
    {
      phase: "Days 31–60 — Build organic footprint",
      focus: "answer the question universe across SEO and answer engines",
      plays: [
        `ship a content cluster on the pillar "${contentPillars[0]}"`,
        "turn the customer-question universe into FAQ + structured data",
        `nurture opted-in subscribers toward "${conversionGoals[0]}" (consent-based, max 5 touches / 7 days)`,
        "add real, verifiable proof elements — never fabricated testimonials or metrics",
      ],
    },
    {
      phase: "Days 61–90 — Convert & compound",
      focus: "tighten conversion and double down on what the data proves",
      plays: [
        "A/B test the primary conversion path and cut friction",
        "expand the winning content pillar; retire under-performers",
        "re-score personas and audience segments against observed behaviour",
        "set up a repeatable weekly review of estimates vs actuals",
      ],
    },
  ];

  return {
    status: "ESTIMATE — starting hypotheses, refine with real data",
    businessProfile: {
      business,
      industry,
      website,
      countries,
      languages,
      objective,
      positioningHypothesis: `${business} helps ${audienceMap[0].segment} get "${audienceMap[0].need}" in ${primaryCountry} — HYPOTHESIS, confirm with customers.`,
      maturityEstimate: website ? "has web presence — estimate: early-growth, needs organic depth" : "no website supplied — estimate: pre-launch / foundation stage",
    },
    brandVoiceProfile: voiceTones(industry, s),
    audienceMap,
    personaHypotheses,
    customerProblemMap,
    competitorMap,
    keywordUniverse,
    customerQuestionUniverse,
    aiPromptUniverse,
    contentPillars,
    conversionGoals,
    ninetyDayPlan,
    doctrine: "Every field is a LABELLED STARTING HYPOTHESIS / ESTIMATE, not fact. Refine with real analytics and customer research. Never fabricate testimonials, reviews or metrics. Marketing sends require explicit consent and a frequency cap of max 5 touches per 7 days.",
  };
}

// ---------------------------------------------------------------------------
// Zero-config demo
// ---------------------------------------------------------------------------
export function demoOnboarding(): OnboardingBundle {
  return onboard({
    business: "Northgate Coffee Roasters — speciality coffee subscription and cafe",
    website: "https://northgate-coffee.example",
    competitors: ["High-Street Chain", "Artisan Rival Roastery", "Supermarket Own-Brand"],
    industry: "retail / e-commerce",
    countries: ["United Kingdom", "Ireland"],
    languages: ["en"],
    objective: "grow the coffee subscription base profitably through organic channels",
  });
}
