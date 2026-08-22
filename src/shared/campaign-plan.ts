// ONE SENTENCE, ONE BUTTON (§102).
//
// Every piece of this already existed and none of them was joined up. The chains
// are declared in `orchestrator.ts`, the brand's own facts are in
// `brand-memory.ts`, the cost of a chain is `plannedCostAcu`, and
// `intent-router.ts` turns a sentence into an intent. What was missing was the
// decision in between: given "get me more weekend bookings", WHICH chain, with
// WHAT context, at WHAT cost, and what will it refuse to do without me.
//
// This is that decision, as a value, before anything runs.
//
// THE RULE IT IS BUILT AROUND: NEVER START A CHAIN IT CANNOT FINISH.
//
// Running five of six steps and stopping at the publish because the daily cap
// ran out is the worst outcome available — the customer's credits are spent, no
// campaign exists, and the failure arrives after the money. So the whole chain
// is costed against the REMAINING cap up front, and a chain that will not fit is
// refused before the first step rather than abandoned during the last.
//
// AND IT WILL NOT RUN ON NOTHING. A chain whose steps need facts the brand has
// never supplied produces confident, generic output that reads like every other
// tool. Missing facts are named and the plan says what it will be worth without
// them, rather than silently producing slop and charging for it.

export type StepEffect = "draft" | "publish" | "spend" | "send";

/** Structurally the orchestrator's own ChainStep and Chain. */
export type PlanStep = { id: string; agentId: string; effect: StepEffect; purpose: string; costAcu: number };
export type PlanChain = { id: string; label: string; goal: string; steps: PlanStep[]; keywords?: string[] };

export type BrandFact = { key: string; value: string };

export type PlanInput = {
  sentence: string;
  chains: PlanChain[];
  facts: BrandFact[];
  /** Brand-memory keys each chain wants. Absent means the chain needs nothing. */
  requiredFacts?: Record<string, string[]>;
  dailyCapAcu: number;
  spentTodayAcu: number;
};

export type PlannedStep = PlanStep & {
  /** True for anything that leaves the building. Those always need a person. */
  needsHuman: boolean;
};

export type CampaignPlan = {
  ok: boolean;
  chainId?: string;
  label?: string;
  /** Why this chain and not another — the words that matched. */
  chosenBecause?: string;
  steps: PlannedStep[];
  costAcu: number;
  remainingAcu: number;
  /** Steps that will stop and wait for you. Named, so nothing is a surprise. */
  humanSteps: string[];
  /** Brand facts the chain wants and does not have. */
  missingFacts: string[];
  headline: string;
  refusal?: string;
};

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Anything that leaves the building needs a person, whatever the autonomy level. */
export const LEAVES_THE_BUILDING: StepEffect[] = ["publish", "spend", "send"];

/**
 * Which chain, and why.
 *
 * Deterministic word overlap against each chain's goal, label and declared
 * keywords. Deliberately NOT a provider call: choosing which engine to run
 * should not itself cost a generation, and a router that can be down is a
 * button that can be broken.
 */
export function chooseChain(sentence: string, chains: PlanChain[]): { chain: PlanChain; because: string } | null {
  const words = new Set(norm(sentence).split(" ").filter((w) => w.length > 3));
  if (words.size === 0 || chains.length === 0) return null;

  let best: { chain: PlanChain; hits: string[] } | null = null;
  for (const c of chains) {
    const hay = new Set(norm(`${c.label} ${c.goal} ${(c.keywords || []).join(" ")}`).split(" "));
    const hits = [...words].filter((w) => hay.has(w));
    if (hits.length === 0) continue;
    if (!best || hits.length > best.hits.length) best = { chain: c, hits };
  }
  if (!best) return null;
  return { chain: best.chain, because: `matched on ${best.hits.map((h) => `"${h}"`).join(", ")}` };
}

export function planOneClickCampaign(input: PlanInput): CampaignPlan {
  const remainingAcu = Math.max(0, input.dailyCapAcu - input.spentTodayAcu);
  const picked = chooseChain(input.sentence, input.chains);

  if (!picked) {
    return {
      ok: false, steps: [], costAcu: 0, remainingAcu, humanSteps: [], missingFacts: [],
      headline: "Nothing here matches that yet.",
      refusal: `Nothing in the current set of engines matches "${input.sentence.trim()}". Say it in terms of what you want to happen — more bookings, a launch, a review of what is working — rather than guessing at a feature name.`,
    };
  }

  const { chain, because } = picked;
  const steps: PlannedStep[] = chain.steps.map((s) => ({ ...s, needsHuman: LEAVES_THE_BUILDING.includes(s.effect) }));
  const costAcu = steps.reduce((n, s) => n + Math.max(0, s.costAcu), 0);
  const humanSteps = steps.filter((s) => s.needsHuman).map((s) => s.purpose);

  const have = new Set(input.facts.map((f) => f.key));
  const missingFacts = (input.requiredFacts?.[chain.id] || []).filter((k) => !have.has(k));

  // COSTED WHOLE, BEFORE THE FIRST STEP. Five of six steps is worse than none.
  if (costAcu > remainingAcu) {
    return {
      ok: false, chainId: chain.id, label: chain.label, chosenBecause: because,
      steps, costAcu, remainingAcu, humanSteps, missingFacts,
      headline: "This will not fit in what is left today.",
      refusal: `"${chain.label}" costs ${costAcu} ACUs and ${remainingAcu} remain in today's cap. Starting it would spend ${remainingAcu} and stop partway, which leaves you with no campaign and less credit. Raise the cap or run it tomorrow.`,
    };
  }

  const headline = missingFacts.length
    ? `Ready to run "${chain.label}" for ${costAcu} ACUs — but ${missingFacts.length} thing${missingFacts.length === 1 ? "" : "s"} about your brand ${missingFacts.length === 1 ? "is" : "are"} still unknown, and the output will be generic without ${missingFacts.length === 1 ? "it" : "them"}.`
    : `Ready to run "${chain.label}" for ${costAcu} ACUs, ${remainingAcu - costAcu} left after.`;

  return {
    ok: true, chainId: chain.id, label: chain.label, chosenBecause: because,
    steps, costAcu, remainingAcu, humanSteps, missingFacts, headline,
  };
}

export const ONE_CLICK_DOCTRINE = [
  "Never start a chain it cannot finish. Five of six steps spends the credits, produces no campaign, and delivers the failure after the money.",
  "The whole chain is costed against what remains, before the first step — not step by step as it goes.",
  "Anything that leaves the building — publish, spend, send — needs a person, and those steps are named up front so nothing is a surprise.",
  "Choosing which engine to run is deterministic and costs nothing. A router that can be down is a button that can be broken, and picking an engine should not itself cost a generation.",
  "Missing brand facts are named rather than filled in. A chain run on nothing produces confident generic output that reads like every other tool.",
];
