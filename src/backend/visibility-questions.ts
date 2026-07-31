// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The questions come from the customer's own website.
//
// suggestQuestions() builds six templates out of four typed fields, so every
// business in a category gets the same six questions and every run asks them
// again. That measures one narrow slice of how you are seen, forever.
//
// The deep crawl already reads products, services, FAQs, headings, navigation
// and prices off the real site. Those are the subjects buyers actually ask
// about, in the words the business itself uses.
//
// AND NOW THE TRAP IN "ASK DIFFERENT ONES EACH TIME".
//
// A visibility score is only comparable to last week's if it was measured the
// same way. Rotate every question each run and the week-on-week line stops
// being a trend and becomes two unrelated tests with a slope drawn between
// them — the "up 12 points" would be telling you the new questions were
// easier, not that your visibility improved. That is the same error as
// re-labelling an A/B test halfway through.
//
// So a run has two parts, and they are scored differently:
//
//   THE CORE — a stable set, chosen deterministically from the site, asked in
//   EVERY run. This is what the trend is measured on, so the comparison is
//   like-for-like.
//
//   THE ROTATION — a sample from the wider pool the site supports, different
//   each run so coverage broadens and new gaps surface. Reported, never fed
//   into the trend.
//
// Rotation is deterministic on the run index, not Math.random(): the same run
// asks the same questions if it is re-run, so a result can be reproduced and
// the customer can see exactly why a question was asked.

import { classifyIntent, cleanField, type VisibilityQuestion } from "@/backend/ai-visibility";
import type { SiteExtraction } from "@/backend/site-extract";

const hash = (s: string): string => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 10);
};

/** Question-shaped headings and FAQ entries, cleaned of site-specific voice. */
const SECOND_PERSON = /\b(you|your|yours|we|our|us)\b/i;
const TOO_SHORT = 12;
const TOO_LONG = 160;

/**
 * Is this something a buyer would type into an assistant?
 *
 * An FAQ is written for someone already ON the site: "Do you offer a free
 * trial?" makes sense there and is incoherent asked of ChatGPT, which has no
 * idea who "you" is. Those are dropped rather than asked, because a question
 * the assistant cannot answer produces a non-mention that looks like a
 * visibility failure and is nothing of the kind.
 */
export function askableOfAnAssistant(text: string): boolean {
  const t = cleanField(text);
  if (t.length < TOO_SHORT || t.length > TOO_LONG) return false;
  if (SECOND_PERSON.test(t)) return false;
  // Navigation and headings that are not questions or topics.
  if (/^(home|about|contact|login|sign ?in|menu|search|blog|news)$/i.test(t)) return false;
  return true;
}

/**
 * Is this a SUBJECT a buyer would search for, or a slogan off a landing page?
 *
 * A live run on a real site pulled these out of the headings: "Siloed data ·
 * Blind spots", "Why projects lose millions silently", "The inevitable
 * solution", "The enterprise leaders who expose broken processes and transform
 * them". Every one produces gibberish in the template — "who are the best why
 * projects lose millions silently companies in the UK" — and, worse, asking it
 * of an assistant returns nothing, which then reads as a visibility failure.
 *
 * Marketing copy is a CLAUSE: it has a verb, an article, several clauses, or
 * punctuation joining two ideas. A subject is a short noun phrase. This keeps
 * the noun phrases and drops the slogans, and it is applied only to headings —
 * a Product name in structured data is a subject by construction.
 */
export function looksLikeASubject(text: string): boolean {
  const t = cleanField(text);
  if (!t) return false;
  // Two ideas glued together by punctuation is a headline, not a subject.
  if (/[.!:;·•|]/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 5) return false;
  // A leading article or "why/how" almost always introduces a sentence of copy.
  if (/^(the|a|an|our|why|how|when|introducing|meet|built|designed)\b/i.test(t)) return false;
  // An imperative opener is a call to action, not a subject: "Book a 20-min
  // demo" reached a live question list and became "who are the best book a
  // 20-min demo companies in the UK".
  if (CTA_OPENER.test(t)) return false;
  if (MARKETING_VERB.test(t)) return false;
  return true;
}

/** Imperative openers — a button's words, not a thing anyone searches for. */
const CTA_OPENER = /^(book|get|start|stop|try|buy|shop|order|request|download|contact|join|claim|see|watch|learn|explore|discover|sign|subscribe|talk|speak|schedule)\b/i;

/** A subject is a thing; a slogan does something. */
const MARKETING_VERB = /\b(lose|loses|losing|slows?|transform(s|ing)?|expose[sd]?|keeps?|comes?|drives?|driven|unlocks?|delivers?|delivering|empowers?|accelerates?|silently)\b/i;

/**
 * A rhetorical headline dressed as a question.
 *
 * "Why projects lose millions silently" is question-SHAPED and is still copy —
 * it slipped past the slogan filter because that filter only ran on non-question
 * headings. Asking an assistant a slogan returns nothing useful and the miss
 * then reads as a visibility failure.
 */
export function isRhetoricalHeadline(text: string): boolean {
  const t = cleanField(text);
  return MARKETING_VERB.test(t) || /[.!:;·•|]/.test(t) || t.split(/\s+/).length > 9;
}

/** Already a question a buyer would type, rather than a noun phrase to wrap. */
export function isQuestionShaped(text: string): boolean {
  return /^(how|what|what's|why|when|where|which|who|can|do|does|is|are|should)\b/i.test(cleanField(text));
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * "Pricing & plans" → "Pricing and plans"; strips numbering and stray dividers.
 *
 * CASE IS PRESERVED. Lower-casing the whole subject produced "how do i migrate
 * from spreadsheets" and "enterprise pmo rollout" — a bare "i" and a mangled
 * acronym, in text shown to the customer and sent verbatim to an assistant.
 * Comparison and de-duplication lower-case a KEY instead.
 */
function topic(raw: string): string {
  return cleanField(
    (raw || "")
      .replace(/^\d+[\.\)]\s*/, "")
      .replace(/&/g, "and")
      .replace(/[|·—–]/g, " ")
      .replace(/\s+/g, " "),
  );
}

/**
 * Lower the first letter for use inside a sentence, unless it starts an
 * acronym: "Document control" → "document control", but "PMO tooling" stays.
 */
const lowerFirst = (s: string) => {
  const first = s.split(/\s+/)[0] || "";
  if (first.length > 1 && first === first.toUpperCase()) return s;
  return s ? s[0].toLowerCase() + s.slice(1) : s;
};

export type QuestionPool = {
  core: VisibilityQuestion[];
  rotating: VisibilityQuestion[];
  /** Where each subject came from, so the customer can check we did not invent it. */
  sources: { subject: string; from: string }[];
  note: string;
};

export type SiteQuestionInput = {
  business: string;
  extraction: SiteExtraction | null;
  /** From the brand record — the crawl cannot read a trading location off markup. */
  location?: string;
  category?: string;
};

/**
 * Build the pool from what the site actually says.
 *
 * Nothing here invents a subject. Every question is assembled from a product
 * name, a service, an FAQ topic, a heading or a navigation label that the deep
 * crawl READ — if the site says nothing we can use, the pool comes back thin
 * and the caller falls back to the typed fields rather than making things up.
 */
export function questionsFromSite(input: SiteQuestionInput): QuestionPool {
  const business = cleanField(input.business) || "this business";
  const where = cleanField(input.location);
  const x = input.extraction;
  const sources: { subject: string; from: string }[] = [];
  const seen = new Set<string>();

  // A subject is either a TOPIC (a noun phrase you can put in "who are the best
  // ___ companies") or a QUESTION a buyer already asks. Conflating them is how a
  // live run produced "Who are the best how long does enterprise PMO rollout
  // take companies in the UK?" — an FAQ wrapped in a template built for nouns.
  // An FAQ is already the question; it is asked, not wrapped.
  type Subject = { text: string; from: string; kind: "topic" | "question" };
  const subjects: Subject[] = [];
  const addSubject = (raw: string, from: string, kind: Subject["kind"] = "topic") => {
    const t = topic(raw);
    const key = t.toLowerCase();
    if (!t || t.length < 3 || seen.has(key)) return;
    // A subject that is just the brand's own name produces "who are the best
    // VeryX providers", which measures nothing.
    if (key.includes(business.toLowerCase())) return;
    seen.add(key);
    subjects.push({ text: t, from, kind: kind === "topic" && isQuestionShaped(t) ? "question" : kind });
  };

  if (x) {
    for (const p of x.products.values) addSubject(p, "a Product in your structured data");
    for (const s of x.services.values) addSubject(s, "a Service in your structured data");
    for (const f of x.faqs) if (askableOfAnAssistant(f.q)) addSubject(f.q.replace(/\?+$/, ""), "one of your FAQs", "question");
    // Headings are the noisiest source on any marketing site, so they are the
    // only one filtered for slogans. A question-shaped heading is still welcome
    // — it is a real buyer question — but a slogan is not a subject.
    for (const h of x.hierarchy) {
      if (h.level !== 2 && h.level !== 3) continue;
      // Question-shaped headings are welcome — a real buyer question on the page
      // is exactly what we want — UNLESS they are rhetorical marketing copy.
      const ok = isQuestionShaped(h.text) ? !isRhetoricalHeadline(h.text) : looksLikeASubject(h.text);
      if (!ok) continue;
      addSubject(h.text, `an H${h.level} on your site`);
    }
    for (const n of x.navigation) {
      if (!looksLikeASubject(n.label)) continue;
      addSubject(n.label, "your own navigation");
    }
  }
  if (input.category) addSubject(input.category, "your brand record");

  const usable = subjects.filter((s) => askableOfAnAssistant(s.text)).slice(0, 24);
  // Report only what we actually USED. Listing subjects that were rejected as
  // "found on your site" invites the customer to look for questions that were
  // never asked.
  for (const u of usable) sources.push({ subject: u.text, from: u.from });

  // --- the core: stable, asked every run ---------------------------------
  //
  // Built from the FIRST subjects, which the crawl orders by how prominent they
  // are on the site — a Product in structured data before a nav label. Stable
  // input, stable core, comparable trend.
  // The core is templated, so it needs a NOUN. A question-shaped subject cannot
  // fill the "best ___ providers" slot.
  const primary = usable.find((u) => u.kind === "topic")?.text || cleanField(input.category);
  const core: { text: string; intent: VisibilityQuestion["intent"] }[] = [];
  if (primary && where) core.push({ text: `Who are the best ${lowerFirst(primary)} providers in ${where}?`, intent: "buying" });
  if (primary) core.push({ text: `What should someone look for when choosing a ${lowerFirst(primary)} provider?`, intent: "problem" });
  if (primary) core.push({ text: `Compare the leading ${lowerFirst(primary)} companies`, intent: "comparison" });
  // Exactly one brand-name question, unchanged: it measures whether the
  // assistant knows you at all, which is a far weaker signal than being
  // recommended, and it is excluded from the headline score.
  core.push({ text: `What is ${business} and would you recommend them?`, intent: "brand" });

  // --- the rotation: everything else the site supports --------------------
  const rotating: { text: string; intent: VisibilityQuestion["intent"] }[] = [];
  for (const s of usable) {
    if (s.text === primary) continue;
    if (s.kind === "question") {
      // Asked as written. A buyer typed something close to this into an
      // assistant already — that is the whole point of reading it off the FAQ.
      rotating.push({ text: `${capitalise(s.text)}?`, intent: "problem" });
      continue;
    }
    rotating.push({ text: `Who are the best ${lowerFirst(s.text)} companies${where ? ` in ${where}` : ""}?`, intent: "buying" });
    rotating.push({ text: `What is the best option for ${lowerFirst(s.text)}?`, intent: "buying" });
  }
  if (x?.pricing.length && primary) rotating.push({ text: `How much should ${lowerFirst(primary)} cost?`, intent: "problem" });

  const build = (list: { text: string; intent: VisibilityQuestion["intent"] }[], isCore: boolean): VisibilityQuestion[] =>
    list
      .map((q) => cleanField(q.text))
      .filter((t, i, arr) => t && arr.indexOf(t) === i)
      .map((text) => ({
        id: hash(text),
        text,
        // Read from the words, never taken on trust — the same rule the rest of
        // the module follows, so a rotated question cannot be mislabelled.
        intent: classifyIntent(text, business),
        core: isCore,
      }));

  const coreQs = build(core, true);
  const rotatingQs = build(rotating, false).filter((r) => !coreQs.some((c) => c.text === r.text));

  return {
    core: coreQs,
    rotating: rotatingQs,
    sources: sources.slice(0, 24),
    note: x
      ? `${sources.length} subject(s) read from your site — ${coreQs.length} core question(s) asked every run so the trend stays comparable, and ${rotatingQs.length} in the rotation.`
      : "No crawl supplied, so these fall back to your brand record rather than your site.",
  };
}

/**
 * The questions for one run: the whole core, plus a rotating slice.
 *
 * `runIndex` walks the rotation forward — run 0 takes the first slice, run 1
 * the next, wrapping when it reaches the end. Deterministic on purpose: a run
 * that is repeated asks the same questions, so a customer can reproduce a
 * result instead of wondering whether the number moved or the test did.
 */
export function selectRunQuestions(
  pool: QuestionPool,
  opts: { runIndex?: number; rotateCount?: number; maxTotal?: number } = {},
): { questions: VisibilityQuestion[]; note: string } {
  const runIndex = Math.max(0, Math.floor(opts.runIndex ?? 0));
  const rotateCount = Math.max(0, opts.rotateCount ?? 2);
  const maxTotal = Math.max(1, opts.maxTotal ?? 8);

  const core = pool.core.slice(0, maxTotal);
  const room = Math.max(0, maxTotal - core.length);
  const take = Math.min(rotateCount, room, pool.rotating.length);

  const rotated: VisibilityQuestion[] = [];
  if (take > 0 && pool.rotating.length > 0) {
    const start = (runIndex * take) % pool.rotating.length;
    for (let i = 0; i < take; i++) rotated.push(pool.rotating[(start + i) % pool.rotating.length]);
  }

  return {
    questions: [...core, ...rotated],
    note: [
      `${core.length} core question(s) — the same every run, which is what makes the trend a trend.`,
      rotated.length
        ? `Plus ${rotated.length} rotating question(s) from your site, different this run so coverage widens. These are reported but kept OUT of the trend comparison: a score moving because the questions changed is not a score moving.`
        : "No rotation this run — your site did not yield enough distinct subjects to vary without repeating.",
    ].join(" "),
  };
}
