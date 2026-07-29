// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// AI Citation Playbook — what to actually DO about a visibility score.
//
// The monitor measures. This is the other half: it turns one run into a ranked
// list of actions, each carrying the evidence it came from.
//
// It exists because a score with no next step is a bill with no product. A live
// run scored 17% — three mentions, all of them from the "What is VeryX?"
// question, which the panel itself says proves nothing. The real reading was
// ZERO unprompted mentions in fifteen answers, and the page had nothing to say
// about it.
//
// THE RULES THIS FOLLOWS, because "how to rank in AI" is the most
// snake-oil-infested topic in marketing right now:
//
//   NOTHING IS INVENTED. Every action cites either a fact measured from the
//   customer's own site (geo-readiness fetches it) or a quote from an answer an
//   assistant actually gave in the run. No "AI SEO scores", no invented
//   "citation share", no rank we did not observe.
//   NO PROMISES ABOUT MODELS WE DO NOT CONTROL. Nobody can make ChatGPT
//   recommend a company. What CAN be changed is the evidence available about
//   you, and that is what these actions change. The wording says so.
//   MECHANISM BEFORE TACTIC. Every action states why it plausibly affects
//   whether a model names you — retrieval, training corpus, or extractability —
//   so the customer can judge it rather than trust it.
//   ORDERED BY EVIDENCE, NOT BY FEELING. A measured blocker outranks a
//   generality. If we fetched the robots.txt and found ClaudeBot disallowed,
//   that is fact and goes first.

import type { VisibilityRun } from "@/backend/ai-visibility";
import { canonicalCompetitor, cleanField } from "@/backend/ai-visibility";
import type { GeoReport } from "@/backend/geo-readiness";
import { gatewayComplete } from "@/backend/gateway";

export type ActionEffort = "minutes" | "hours" | "days" | "ongoing";

export type CitationAction = {
  id: string;
  title: string;
  /** Why this plausibly changes whether a model names you. */
  mechanism: "retrieval" | "training-corpus" | "extractability" | "measurement";
  /** The observation this came from — a measured fact or a quoted answer. */
  evidence: string;
  /** Where that observation came from, so a customer can go and check it. */
  source: "your site" | "the AI answers" | "the run itself";
  detail: string;
  effort: ActionEffort;
  /** 0–100. Measured blockers score highest; generic advice cannot outrank them. */
  priority: number;
  /** Set when the platform can do this for you rather than telling you to. */
  runIn?: string;
};

export type CitationPlaybook = {
  brand: string;
  domain?: string;
  /** Unprompted mentions only — the brand-name question is excluded on purpose. */
  unpromptedRate: number;
  unpromptedMentions: number;
  unpromptedAnswers: number;
  incumbents: { name: string; appearances: number; share: number }[];
  actions: CitationAction[];
  /** Content briefs for the exact questions you were absent from. */
  briefs: { question: string; angle: string; outline: string[]; proofNeeded: string[] }[];
  headline: string;
  note: string;
};

// ---------------------------------------------------------------------------
// Reading the run honestly
// ---------------------------------------------------------------------------

/**
 * The number that actually matters.
 *
 * Being named in "What is VeryX and would you recommend them?" is not
 * visibility — the assistant was handed the name. Counting it inflates the
 * headline exactly when the customer most needs the truth. A live run read 17%
 * on the panel and 0% here, and 0% was the honest figure.
 */
export function unpromptedScore(run: VisibilityRun): { mentions: number; answers: number; rate: number } {
  let mentions = 0, answers = 0;
  for (const r of run.results) {
    if (r.question.intent === "brand") continue;
    for (const v of r.verdicts) {
      if (!v.asked) continue;
      answers++;
      if (v.mentioned) mentions++;
    }
  }
  return { mentions, answers, rate: answers ? Math.round((mentions / answers) * 100) : 0 };
}

/** Who the models name instead, as a share of the answers that could have named them. */
export function incumbents(run: VisibilityRun): { name: string; appearances: number; share: number }[] {
  const { answers } = unpromptedScore(run);
  return run.topCompetitors
    .map((c) => ({ ...c, share: answers ? Math.round((c.appearances / answers) * 100) : 0 }))
    .slice(0, 8);
}

/** The questions you were absent from — the whole target list, in one place. */
export function missingQuestions(run: VisibilityRun): { question: string; namedInstead: string[] }[] {
  const out: { question: string; namedInstead: string[] }[] = [];
  for (const r of run.results) {
    if (r.question.intent === "brand") continue;
    const asked = r.verdicts.filter((v) => v.asked);
    if (!asked.length || asked.some((v) => v.mentioned)) continue;
    const named = new Map<string, string>();
    for (const v of asked) for (const c of v.competitors) {
      const k = canonicalCompetitor(c);
      if (k && !named.has(k)) named.set(k, c);
    }
    out.push({ question: r.question.text, namedInstead: [...named.values()].slice(0, 6) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Actions from measured site facts
// ---------------------------------------------------------------------------

/**
 * Turn the GEO report into actions.
 *
 * These come first in the ranking for one reason: they are the only part of
 * this whole subject that is a FACT rather than a theory. If we fetched
 * robots.txt and ClaudeBot is disallowed, no amount of content strategy matters
 * until that line is deleted — the model physically cannot read the site.
 */
export function actionsFromSite(geo: GeoReport | null): CitationAction[] {
  if (!geo || !geo.reachable) {
    return [{
      id: "site-unreachable",
      title: "We could not read your website, so nothing about it can be checked",
      mechanism: "retrieval",
      evidence: geo ? `${geo.url} did not respond to our fetch.` : "No website was checked.",
      source: "your site",
      detail: "Every technical recommendation below a certain level depends on reading your pages. Until the site answers, we would be guessing — and this module does not guess. Confirm the domain is right in your brand settings and that it is reachable from outside your network.",
      effort: "minutes",
      priority: 100,
    }];
  }

  const out: CitationAction[] = [];
  const byId = new Map(geo.checks.map((c) => [c.id, c]));

  const crawlers = byId.get("crawlers");
  if (crawlers && crawlers.status === "fail") {
    out.push({
      id: "unblock-ai-crawlers",
      title: "Your robots.txt is blocking AI crawlers — fix this before anything else",
      mechanism: "retrieval",
      evidence: crawlers.evidence,
      source: "your site",
      detail: "An assistant that cannot fetch your pages cannot cite them, and the ones that browse the live web are the ones most likely to name a smaller company. This is a one-line change to robots.txt and it gates every other action here. Note it is a genuine choice, not an oversight to correct blindly: allowing these crawlers also lets the models train on your content. Most businesses that want to be recommended decide that trade is worth it.",
      effort: "minutes",
      priority: 99,
    });
  } else if (crawlers && crawlers.status === "pass") {
    out.push({
      id: "crawlers-open",
      title: "AI crawlers can already read your site",
      mechanism: "retrieval",
      evidence: crawlers.evidence,
      source: "your site",
      detail: "Nothing to do here. Recorded because it rules out the single most common technical cause of never being cited, which means the gap is about evidence rather than access.",
      effort: "minutes",
      priority: 10,
    });
  }

  for (const [id, spec] of [
    ["schema", {
      title: "Add Organization and Product schema so a model can state facts about you",
      mechanism: "extractability" as const,
      detail: "Assistants reproduce facts they can extract unambiguously. Structured data spells out what you are, what you sell, where you operate and who you are the same entity as (sameAs → your Companies House record, LinkedIn, Crunchbase, review profiles). Without it a model has to infer all of that from prose, and it will usually decline to.",
      effort: "hours" as const, priority: 80,
    }],
    ["llms", {
      title: "Publish an llms.txt describing what you do, in plain sentences",
      mechanism: "extractability" as const,
      detail: "A short, factual summary at /llms.txt — what you sell, who for, where, what makes you different, and the pages worth reading. It is a young convention and not universally consumed, so treat it as cheap rather than decisive: an hour of work that costs nothing if it is ignored.",
      effort: "hours" as const, priority: 45,
    }],
    ["faq", {
      title: "Answer the buying questions on your own site, in the buyer's words",
      mechanism: "extractability" as const,
      detail: "Not a marketing page — a page that answers the question as asked, with the answer in the first paragraph, in sentences that stand on their own when lifted out of context. That last part is the whole trick: models quote self-contained sentences and skip ones that need the surrounding page to make sense.",
      effort: "days" as const, priority: 70,
    }],
    ["freshness", {
      title: "Date your pages and keep them current",
      mechanism: "retrieval" as const,
      detail: "Retrieval-backed assistants prefer pages that show recency. An undated page from 2021 and an undated page from last week look identical to a crawler.",
      effort: "hours" as const, priority: 35,
    }],
  ] as const) {
    const c = byId.get(id);
    if (!c || c.status === "pass") continue;
    out.push({
      id: `site-${id}`,
      title: spec.title,
      mechanism: spec.mechanism,
      evidence: c.evidence,
      source: "your site",
      detail: spec.detail,
      effort: spec.effort,
      // A measured failure outranks a measured warning of the same kind.
      priority: spec.priority + (c.status === "fail" ? 5 : 0),
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Actions from what the assistants actually said
// ---------------------------------------------------------------------------

export function actionsFromAnswers(run: VisibilityRun): CitationAction[] {
  const out: CitationAction[] = [];
  const score = unpromptedScore(run);
  const inc = incumbents(run);
  const missing = missingQuestions(run);

  const brandOnly = run.results.some((r) => r.question.intent === "brand" && r.verdicts.some((v) => v.asked && v.mentioned));
  if (brandOnly && score.mentions === 0) {
    out.push({
      id: "known-but-not-recommended",
      title: "The models know you exist — they just never bring you up",
      mechanism: "training-corpus",
      evidence: `Named in the direct "what is ${run.brand}?" question, and in 0 of ${score.answers} buying questions.`,
      source: "the AI answers",
      detail: "This is a much better starting position than being unknown, and it narrows the problem precisely: the models have enough about you to describe you, but not enough to place you in a category. What is missing is being described as a ${category} on pages other than your own — the category listings, comparison articles and directories the models drew their answers from.",
      effort: "days",
      priority: 90,
    });
  }

  if (inc.length) {
    const top = inc.slice(0, 4).map((c) => c.name).join(", ");
    out.push({
      id: "get-onto-the-source-pages",
      title: `Get listed where ${inc[0].name} is listed`,
      mechanism: "training-corpus",
      evidence: `${top} were named across the answers — ${inc[0].name} in ${inc[0].appearances} of ${score.answers}.`,
      source: "the AI answers",
      detail: "The models are not reading these companies' own websites and deciding they are best; they are reproducing third-party pages that list them together — category round-ups, review platforms, industry directories, comparison articles, procurement lists. Being on those same pages is the most direct lever there is. Search the exact question yourself, open the top results, and get onto them: a review-platform profile, a submission to the directory, a briefing to the journalist who wrote the round-up.",
      effort: "days",
      priority: 88,
      runIn: "Competitor Spy",
    });
  }

  for (const m of missing.slice(0, 3)) {
    out.push({
      id: `answer-${m.question.slice(0, 24)}`,
      title: `Publish the definitive answer to: "${m.question}"`,
      mechanism: "extractability",
      evidence: m.namedInstead.length
        ? `No assistant named you here; they named ${m.namedInstead.slice(0, 3).join(", ")}.`
        : "No assistant named you in this answer.",
      source: "the AI answers",
      detail: "Use the question as the page title, answer it in the first two sentences, then justify it with specifics — numbers, named integrations, named sectors, named locations. Include the comparison honestly, competitors and all: pages that compare are the ones models quote, and a page that only praises itself reads as marketing to a model exactly as it does to a person.",
      effort: "days",
      priority: 75,
      runIn: "AI Content Factory",
    });
  }

  out.push({
    id: "re-measure",
    title: "Re-run this check weekly and judge the trend, not the run",
    mechanism: "measurement",
    evidence: `One run recorded so far${run.askedCount ? ` (${run.askedCount} answers)` : ""}.`,
    source: "the run itself",
    detail: "These models are not deterministic — the same question returns different companies an hour later. A single run cannot tell you whether anything you did worked, and the changes above take weeks to show up in a model's answers at all. Weekly runs on the same questions are what turns this from a number into evidence.",
    effort: "ongoing",
    priority: 40,
  });

  return out;
}

// ---------------------------------------------------------------------------
// The playbook
// ---------------------------------------------------------------------------

const BRIEF_SYSTEM = [
  "You are briefing a content team on one page that must answer one buying question well enough that an AI assistant would quote it.",
  "Be concrete and specific to the business given. Never invent facts, figures, awards or customers — where a claim needs evidence, say what evidence is needed instead of inventing it.",
  "Return STRICT JSON only, no prose around it:",
  '{"angle":"one sentence on the page\'s point of view","outline":["H2 heading",...4-7 items],"proofNeeded":["a specific fact the business must supply",...2-5 items]}',
].join("\n");

type Brief = { question: string; angle: string; outline: string[]; proofNeeded: string[] };

async function briefFor(
  run: VisibilityRun,
  q: { question: string; namedInstead: string[] },
  category: string,
  complete: typeof gatewayComplete,
  deadline: number,
): Promise<Brief | null> {
  // No key, or no time left: no brief. An outline invented locally would read
  // exactly like one a model wrote, which is the failure this codebase keeps
  // having to undo.
  if (Date.now() > deadline - 5_000) return null;
  try {
    const res = await complete({
      system: BRIEF_SYSTEM,
      prompt: [
        `Business: ${run.brand}${run.domain ? ` (${run.domain})` : ""}`,
        category ? `Category: ${category}` : "",
        `Buying question to answer: ${q.question}`,
        q.namedInstead.length ? `Assistants currently answer this by naming: ${q.namedInstead.join(", ")}.` : "",
        "Brief the page that would make an assistant name this business here instead.",
      ].filter(Boolean).join("\n"),
      maxTokens: 700,
    });
    const m = res.text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as Partial<Brief>;
    const outline = Array.isArray(parsed.outline) ? parsed.outline.filter((x) => typeof x === "string").slice(0, 8) : [];
    if (!parsed.angle || !outline.length) return null;
    return {
      question: q.question,
      angle: String(parsed.angle).slice(0, 300),
      outline,
      proofNeeded: Array.isArray(parsed.proofNeeded) ? parsed.proofNeeded.filter((x) => typeof x === "string").slice(0, 6) : [],
    };
  } catch {
    // A model that returned something unparseable gets no brief rather than a
    // half-read one. An outline built from a broken parse is worse than none.
    return null;
  }
}

export async function buildPlaybook(
  input: { run: VisibilityRun; geo: GeoReport | null; category?: string },
  deps: { complete?: typeof gatewayComplete } = {},
  opts: { deadline?: number; maxBriefs?: number } = {},
): Promise<CitationPlaybook> {
  const complete = deps.complete ?? gatewayComplete;
  const deadline = opts.deadline ?? Date.now() + 40_000;
  const category = cleanField(input.category);
  const score = unpromptedScore(input.run);
  const inc = incumbents(input.run);

  const actions = [...actionsFromSite(input.geo), ...actionsFromAnswers(input.run)]
    .map((a) => ({ ...a, detail: a.detail.replace("${category}", category || "provider in your category") }))
    .sort((a, b) => b.priority - a.priority);

  // Briefs run in parallel against the same deadline discipline as the monitor:
  // whatever is not ready in time is simply absent, never half-written.
  const targets = missingQuestions(input.run).slice(0, Math.max(0, opts.maxBriefs ?? 3));
  const briefs = (await Promise.all(targets.map((q) => briefFor(input.run, q, category, complete, deadline).catch(() => null))))
    .filter((b): b is Brief => b !== null);

  const headline = score.answers === 0
    ? "No buying questions were answered, so there is nothing to act on yet — run the check first."
    : score.mentions === 0
      ? `Not named once in ${score.answers} buying answers. The models are answering these questions with other companies, so the work is to become part of the evidence they answer from.`
      : `Named in ${score.mentions} of ${score.answers} buying answers (${score.rate}%). You are in the consideration set — the work is to move from occasionally named to consistently named.`;

  return {
    brand: input.run.brand,
    domain: input.run.domain,
    unpromptedRate: score.rate,
    unpromptedMentions: score.mentions,
    unpromptedAnswers: score.answers,
    incumbents: inc,
    actions,
    briefs,
    headline,
    note: [
      "Every action above cites something that was measured — a fact fetched from your own site, or a quote from an answer an assistant actually gave. Nothing here is a score we invented.",
      "Be realistic about the timescale and the mechanism. Nobody can make a model recommend a company, and anyone selling you that is lying. What these actions change is the evidence available about you — on your site and, far more importantly, on the third-party pages the models answer from. Changes to your own site can show up within weeks for assistants that browse the live web; changes to what the underlying models know can take a training cycle, or may never arrive.",
      briefs.length < targets.length
        ? `${targets.length - briefs.length} content brief(s) could not be written in the time available — run it again for those.`
        : "",
    ].filter(Boolean).join(" "),
  };
}
