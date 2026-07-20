// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar BuyerMind AI™ — the customer-psychology engine (VideoDominance
// Gap 4). Existing clip tools find "interesting" moments; BuyerMind finds the
// moment most likely to influence a SPECIFIC buyer motivation, and builds
// content for a chosen psychological objective. It detects the 15 purchase
// drivers in supplied text and turns a target driver into a concrete creative
// brief (angle → hook → proof → CTA).
//
// Pure + deterministic (seeded, lexicon-based) so it runs in demo mode and
// unit-checks. Scores are labelled ESTIMATES; it reads only the text supplied
// and never fabricates a customer feeling.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

export const DRIVERS = [
  "pain", "frustration", "desire", "fear", "aspiration", "objection", "urgency",
  "trust", "social_proof", "status", "convenience", "saving", "revenue", "safety", "belonging",
] as const;
export type Driver = typeof DRIVERS[number];

// Lexicon markers per driver (deterministic detection, no model needed).
const MARKERS: Record<Driver, string[]> = {
  pain: ["hurts", "struggle", "problem", "pain", "hard", "difficult", "stuck", "hate"],
  frustration: ["frustrat", "annoy", "tired of", "fed up", "again", "why won't", "keeps"],
  desire: ["want", "wish", "love", "dream", "crave", "need this", "gotta have"],
  fear: ["afraid", "worried", "risk", "scared", "what if", "lose", "danger"],
  aspiration: ["become", "goal", "achieve", "grow", "level up", "best version", "future"],
  objection: ["but", "too expensive", "not sure", "does it work", "worth it", "skeptic", "scam"],
  urgency: ["now", "today", "hurry", "ends", "last chance", "limited", "before it"],
  trust: ["trust", "honest", "proven", "guarantee", "certified", "reliable", "safe hands"],
  social_proof: ["everyone", "reviews", "customers", "rated", "popular", "recommend", "join"],
  status: ["premium", "exclusive", "elite", "luxury", "vip", "prestige", "impress"],
  convenience: ["easy", "simple", "fast", "instant", "one click", "hassle", "save time"],
  saving: ["cheap", "save", "discount", "deal", "affordable", "budget", "% off"],
  revenue: ["earn", "profit", "roi", "revenue", "make money", "sales", "grow revenue"],
  safety: ["secure", "protected", "safe", "privacy", "encrypted", "guaranteed", "no risk"],
  belonging: ["community", "family", "together", "us", "belong", "member", "tribe"],
};

export type DriverSignal = { driver: Driver; score: number; hits: string[] };

export function detectDrivers(text: string): { drivers: DriverSignal[]; dominant: Driver; note: string } {
  const lc = ` ${text.toLowerCase()} `;
  const drivers: DriverSignal[] = DRIVERS.map((d) => {
    const hits = MARKERS[d].filter((m) => lc.includes(m));
    // Score from real hits + a small seeded floor so ties are deterministic.
    const score = clamp(hits.length * 22 + (seed(text + d) % 8));
    return { driver: d, score, hits };
  }).sort((a, b) => b.score - a.score);
  return {
    drivers,
    dominant: drivers[0].driver,
    note: "Detected purchase drivers from the supplied text only (lexicon-based ESTIMATE). Use the dominant driver to pick the clip most likely to move THIS buyer — never a generic 'interesting' moment.",
  };
}

// ---------------------------------------------------------------------------
// Build a creative brief for a chosen psychological objective.
// ---------------------------------------------------------------------------
const PLAYBOOK: Record<Driver, { angle: string; hook: string; proof: string; cta: string }> = {
  pain: { angle: "Name the pain in the first line", hook: "If {x} keeps happening, this is why.", proof: "Show the before-state clearly", cta: "Fix it today" },
  frustration: { angle: "Validate the frustration, then relieve it", hook: "Still doing it the hard way?", proof: "Demonstrate the effortless way", cta: "Stop the hassle" },
  desire: { angle: "Make the wanted outcome vivid", hook: "Imagine {outcome} by next week.", proof: "Show the outcome in use", cta: "Make it yours" },
  fear: { angle: "Address the risk, then de-risk", hook: "Worried about {risk}? Read this.", proof: "Guarantee + evidence", cta: "Protect yourself" },
  aspiration: { angle: "Tie the product to who they want to become", hook: "The {role} version of you does this.", proof: "Aspirational transformation", cta: "Start becoming it" },
  objection: { angle: "Answer the objection head-on", hook: '"Is it actually worth it?"', proof: "On-camera proof, no claims without evidence", cta: "See for yourself" },
  urgency: { angle: "Create real (never fake) urgency", hook: "This ends {when}.", proof: "State the genuine deadline/stock", cta: "Act before it's gone" },
  trust: { angle: "Lead with credibility", hook: "Why {n} businesses trust us.", proof: "Verified reviews + guarantee", cta: "Join them" },
  social_proof: { angle: "Show the crowd already winning", hook: "Everyone's switching. Here's why.", proof: "Real customer language", cta: "Join the switch" },
  status: { angle: "Position as the premium choice", hook: "The one the pros actually use.", proof: "Premium cues, cinematic", cta: "Upgrade" },
  convenience: { angle: "Sell the ease", hook: "Done in one tap.", proof: "Show the speed on camera", cta: "Make life easier" },
  saving: { angle: "Frame the saving honestly", hook: "Same result, less spend.", proof: "Transparent price comparison", cta: "Save now" },
  revenue: { angle: "Sell the money outcome", hook: "Turn {input} into revenue.", proof: "Show the ROI math (labelled estimate)", cta: "Grow revenue" },
  safety: { angle: "Lead with protection", hook: "Your {thing}, kept safe.", proof: "Security/consent evidence", cta: "Stay protected" },
  belonging: { angle: "Invite them into a community", hook: "You belong here.", proof: "Community moments", cta: "Join us" },
};

export type PsychBrief = { driver: Driver; product: string; angle: string; hook: string; proofRequirement: string; cta: string; note: string };

export function briefForObjective(input: { product: string; driver: Driver }): PsychBrief {
  const p = PLAYBOOK[input.driver];
  return {
    driver: input.driver,
    product: input.product,
    angle: p.angle,
    hook: p.hook,
    proofRequirement: `${p.proof} — genuine evidence only, no fabricated results or testimonials.`,
    cta: p.cta,
    note: `Clip engineered for the "${input.driver}" motivation. Honesty guard: urgency/social-proof/revenue claims must be real and evidenced.`,
  };
}

// ---------------------------------------------------------------------------
// Deterministic demo so the engine renders with zero config.
// ---------------------------------------------------------------------------
export function demoBuyerMind() {
  const detection = detectDrivers("I'm so tired of expensive tools that don't work — I just want something simple and fast that I can trust, and everyone keeps recommending this one.");
  return {
    detection,
    briefs: [briefForObjective({ product: "MarketWar OS", driver: detection.dominant }), briefForObjective({ product: "MarketWar OS", driver: "trust" })],
  };
}
