// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// AI Visibility — are you recommended when someone asks an assistant?
//
// The panel used to say "set AI_ANSWER_MONITOR_KEY". No such key exists to buy:
// there is no API that reports whether ChatGPT recommends you. The vendors who
// sell this do one thing — ask the assistants your customers' buying questions,
// on a schedule, and record whether you were named. That is what this does, with
// the AI keys already configured, so the data is the platform's own.
//
// What makes it a MEASUREMENT rather than a demo:
//
//   ASKED, NOT INFERRED. Every provider is asked directly with NO failover. If
//   the call fell over to another model, the reply would be filed under an
//   assistant that never said it — a fabricated measurement, which is worse than
//   an empty panel.
//   RECORDED. Every run is stored with its date, the exact questions, the raw
//   answers and the verdicts, so a trend line is history rather than a
//   recomputation, and any number can be traced back to the text it came from.
//   HONEST ABOUT VARIANCE. Assistants are not deterministic. One run is a
//   sample, not a ranking, and the report says so and refuses to call a change
//   between two runs a trend.
//   NOT A LEAGUE TABLE. Competitors are read from the answer itself. Where the
//   answer is not a list, the position is reported as unranked rather than
//   invented.

import { createHash } from "crypto";
import { askProvider, configuredProviders, type ProviderId } from "@/backend/gateway";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type AiAssistant = ProviderId;

export type VisibilityQuestion = {
  id: string;
  /** What a buyer would actually type. */
  text: string;
  /** Why it matters — shown so the customer can judge whether it is worth tracking. */
  intent: "buying" | "comparison" | "problem" | "brand";
  /**
   * Asked in EVERY run, so the week-on-week trend compares like with like.
   *
   * Questions derived from the site rotate to widen coverage, and a score that
   * moves because the questions changed is not a score that moved. Undefined on
   * runs recorded before rotation existed — those are treated as all-core,
   * which is what they were.
   */
  core?: boolean;
};

export type AnswerVerdict = {
  assistant: AiAssistant;
  model?: string;
  /** Was the brand named at all? */
  mentioned: boolean;
  /** 1-based position when the answer is an enumerated list; null when it is prose. */
  rank: number | null;
  /** Other businesses the answer named, in the order it named them. */
  competitors: string[];
  /** The sentence the brand appeared in, so a claim can be checked against the text. */
  evidence: string;
  /** The whole answer, kept so a verdict is never unfalsifiable. */
  answer: string;
  /** Set when this assistant could not be asked; mentioned is then meaningless. */
  error?: string;
  asked: boolean;
};

export type QuestionResult = { question: VisibilityQuestion; verdicts: AnswerVerdict[] };

export type VisibilityRun = {
  id: string;
  brandId: string;
  brand: string;
  domain?: string;
  ranAt: string;
  results: QuestionResult[];
  /** Share of ANSWERED questions in which the brand was named — INCLUDING the brand-name question. */
  visibilityRate: number;
  mentioned: number;
  askedCount: number;
  /**
   * The honest headline: buying questions only.
   *
   * Carried on the run rather than recomputed by each surface, because two
   * surfaces computing it separately is exactly how the page came to show 18%
   * beside a plan showing 0% for the same run.
   *
   * Optional because runs recorded before this existed do not have it —
   * unpromptedScore() re-derives it from the stored answers for those.
   */
  unpromptedRate?: number;
  unpromptedMentions?: number;
  unpromptedAnswers?: number;
  assistants: AiAssistant[];
  /** Who is recommended instead, most frequent first. */
  topCompetitors: { name: string; appearances: number }[];
  note: string;
};

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

// ---------------------------------------------------------------------------
// Questions. The value is entirely in asking what a BUYER would ask — "best
// builder in Birmingham", not "tell me about AxionOS". A question containing
// the brand name proves nothing: the assistant will discuss whatever it is
// handed.
// ---------------------------------------------------------------------------
/**
 * Clean a field that was typed into onboarding before it goes into a question.
 *
 * A live run asked "Recommend a Work-Centric Common Data Environment: company
 * near United Kingdom" — the trailing colon came straight from the stored
 * product field. Every question was malformed, which changes what the assistant
 * answers, which corrupts the measurement. Punctuation a person left on the end
 * of a form field is not part of the product's name.
 */
export function cleanField(raw: string | undefined): string {
  return (raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s:;,.\-–—/|]+/, "")
    .replace(/[\s:;,.\-–—/|]+$/, "")
    .trim();
}

export function suggestQuestions(input: { business: string; product?: string; location?: string; audience?: string }): VisibilityQuestion[] {
  const product = cleanField(input.product);
  const where = cleanField(input.location);
  const who = cleanField(input.audience);
  const q: { text: string; intent: VisibilityQuestion["intent"] }[] = [];

  if (product && where) q.push({ text: `Who are the best ${product} providers in ${where}?`, intent: "buying" });
  if (product) q.push({ text: `What should I look for when choosing a ${product} provider?`, intent: "problem" });
  if (product && where) q.push({ text: `Recommend a ${product} company near ${where}`, intent: "buying" });
  if (product && who) q.push({ text: `What is the best ${product} option for ${who}?`, intent: "buying" });
  if (product) q.push({ text: `Compare the leading ${product} companies in the UK`, intent: "comparison" });
  // Exactly one brand-name question: it measures whether the assistant knows you
  // at all, which is a different — and much weaker — signal than being recommended.
  q.push({ text: `What is ${input.business} and would you recommend them?`, intent: "brand" });

  return q.map((x) => ({ id: hash(x.text), text: x.text, intent: x.intent }));
}

/**
 * What KIND of question is this, judged from the words in it?
 *
 * Read from the text rather than taken on trust, because the label was not
 * trustworthy. The route stamped every customer-edited question as "buying",
 * so "What is AxionOS and would you recommend them?" counted as a buying
 * question: a live plan claimed "the what-is question is excluded" directly
 * above the figure "3 of 18", when excluding it gives 15. The panel was
 * contradicting itself on screen.
 *
 * It also decides whether an answer should be mined for competitor names at
 * all. "What should I look for when choosing a provider?" is answered with
 * criteria, and reading those as companies told one customer they were losing
 * to "Lead exclusivity" and "Return/refund policy".
 */
export function classifyIntent(text: string, brand: string): VisibilityQuestion["intent"] {
  const t = (text || "").toLowerCase();
  for (const alias of brandAliases(brand)) {
    if (new RegExp(`(?<!\\w)${escapeRe(alias)}(?!\\w)`, "i").test(text)) return "brand";
  }
  // Asks for attributes, not vendors.
  if (/\b(what|which)\b[^?]*\b(look for|consider|matters?|criteria|questions? to ask|avoid|watch out)\b/.test(t)) return "problem";
  if (/^\s*(how|why)\b/.test(t)) return "problem";
  if (/\b(compare|versus|vs\.?|difference between)\b/.test(t)) return "comparison";
  return "buying";
}

/**
 * Should competitor names be read out of this answer?
 *
 * Only where the question asked WHO. An answer listing what to look for is a
 * list of criteria, and every entry in it would become a fabricated rival.
 */
export function seeksVendors(intent: VisibilityQuestion["intent"]): boolean {
  return intent === "buying" || intent === "comparison";
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Name forms that all mean the same business. */
export function brandAliases(brand: string, domain?: string): string[] {
  const base = (brand || "").trim();
  if (!base) return [];
  const out = new Set<string>([base]);
  // Legal suffixes are usually dropped in prose: "AxionOS Ltd" → "AxionOS".
  const stripped = base.replace(/\b(limited|ltd|plc|llp|inc|corp|co)\b\.?/gi, "").replace(/\s{2,}/g, " ").trim();
  if (stripped && stripped.length >= 3) out.add(stripped);
  if (domain) {
    const host = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (host) {
      out.add(host);
      const label = host.split(".")[0];
      if (label && label.length >= 3) out.add(label);
    }
  }
  return [...out].filter((a) => a.length >= 3);
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/**
 * Is the brand named in this answer?
 *
 * Word-boundary matched, for the same reason the claim guard is: a substring
 * scan would find "Axion" inside unrelated words and report a citation that
 * never happened. A false positive here is worse than a miss — it tells someone
 * they are being recommended when they are not.
 */
export function findMention(answer: string, aliases: string[]): { mentioned: boolean; evidence: string } {
  const text = answer || "";
  for (const alias of aliases) {
    const re = new RegExp(`(?<!\\w)${escapeRe(alias)}(?!\\w)`, "i");
    const m = re.exec(text);
    if (!m) continue;
    // Return the sentence it appeared in, so the verdict can be checked.
    const start = Math.max(0, text.lastIndexOf(".", m.index) + 1);
    const endDot = text.indexOf(".", m.index);
    const end = endDot === -1 ? Math.min(text.length, m.index + 200) : endDot + 1;
    return { mentioned: true, evidence: text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 300) };
  }
  return { mentioned: false, evidence: "" };
}

// A list entry: "1. **Name** — …", "2) Name: …", "- Name — …"
const LIST_ENTRY = /^\s*(?:(\d{1,2})[.)]|[-*•])\s+(?:\*\*)?([^*\n:—–-]{2,60}?)(?:\*\*)?\s*(?:[:—–-]|$)/;

/**
 * The businesses an answer names, in order.
 *
 * Only enumerated answers are parsed. Pulling names out of prose would mean
 * guessing which capitalised words are companies, and a wrong guess becomes a
 * "competitor" the customer is told they are losing to.
 */
// Words that open advice, not a company. A live run reported "whether you're
// design" as a competitor: a bullet of guidance parsed as a business, printed
// to the customer as a rival they are losing to. A fabricated competitor is the
// same class of error as a fabricated citation.
const NOT_A_NAME_OPENER = /^(?:whether|if|when|while|how|why|what|where|who|which|do|does|don't|make|ensure|consider|check|look|think|choose|decide|start|avoid|use|note|remember|it|they|you|your|this|that|these|those|there|for|from|with|about|based|depends?|the best|a |an )\b/i;

/** Contractions and first/second person are the giveaway that a line is prose. */
const PROSE_MARKERS = /\b(?:you're|you'll|your|we're|we'll|our|they're|it's|isn't|aren't|don't)\b/i;

/**
 * Words that describe a market segment or a buying criterion, not a company.
 *
 * A live run listed "Mid", "Agencies", "AI features", "B2B mid", "Breadth vs.
 * depth", "Integrations & API" and "Data model" among a customer's competitors.
 * Those came from answers that segment the market or list what to look for —
 * the assistant was being helpful, and the parser read every bullet as a rival.
 *
 * A speed bump, not a wall, and curated deliberately short: every entry here is
 * a name a real company could in principle have, so a long list would start
 * deleting genuine competitors. The structural rules above do most of the work.
 */
const CATEGORY_TERMS = new Set([
  "enterprise", "mid", "midmarket", "mid-market", "smb", "sme", "small", "medium", "large",
  "agencies", "agency", "startups", "startup", "freelancers", "individuals", "businesses",
  "b2b", "b2c", "dtc", "ecommerce", "e-commerce", "retail", "saas",
  "pricing", "price", "cost", "budget", "integrations", "integration", "api", "support",
  "features", "feature", "usability", "scalability", "security", "compliance", "reporting",
  "analytics", "automation", "onboarding", "breadth", "depth", "data", "model", "ai",
  "contractor", "contractors", "subcontractor", "client", "clients", "owner", "consultant",
  "architect", "architects", "engineer", "engineers", "other", "others",
]);

function isCategoryPhrase(name: string): boolean {
  const words = name.toLowerCase().replace(/[^a-z0-9 -]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  return words.every((w) => CATEGORY_TERMS.has(w));
}

function looksLikeBusinessName(name: string): boolean {
  const n = name.trim();
  if (n.length < 2 || n.length > 60) return false;
  if (!/[A-Za-z]/.test(n)) return false;
  if (n.split(/\s+/).length > 6) return false;
  if (NOT_A_NAME_OPENER.test(n)) return false;
  if (PROSE_MARKERS.test(n)) return false;
  // Unbalanced brackets mean the capture ran past where the name ended and was
  // cut off. A live run reported "Asite (UK, Autodesk Construction Cloud (Aut."
  // as a competitor — half of one company and a third of another.
  const opens = (n.match(/\(/g) || []).length;
  const closes = (n.match(/\)/g) || []).length;
  if (opens !== closes) return false;
  // A truncated capture also tends to end mid-word after a comma joined two
  // entries together. One list row is one company.
  if (n.includes(",")) return false;
  // A dangling separator is the other truncation signature: "B2B or B2C / e".
  if (/[/&\-–—+|]\s*\S{0,2}$/.test(n)) return false;
  // "X or Y" and "X vs Y" describe a choice, not a company.
  if (/\b(?:or|vs\.?|versus)\b/i.test(n)) return false;
  if (isCategoryPhrase(n)) return false;
  // Sentence case gives a phrase away. A live run listed "Executive dashboards
  // and portfolio" as a rival: three or more words with a capital ONLY on the
  // first is how prose is written, not how companies are named. Real names keep
  // their capitals throughout — "Bentley ProjectWise", "Viewpoint For Projects
  // (Trimble)" — and names with a lower-case joiner still have a capital after
  // it, so "Marks and Spencer" and "Bank of America" survive this.
  const words = n.split(/\s+/);
  if (words.length >= 3 && !words.slice(1).some((w) => /^[A-Z0-9(]/.test(w))) return false;
  // A real name carries at least one capitalised word or is a known-style
  // lower-case brand written in full caps/camel. All-lowercase multi-word
  // phrases are overwhelmingly prose.
  if (!/[A-Z]/.test(n) && n.split(/\s+/).length > 1) return false;
  return true;
}

export function extractNamedBusinesses(answer: string): { names: string[]; ranked: boolean } {
  const names: string[] = [];
  let numbered = 0;
  for (const line of (answer || "").split("\n")) {
    const m = LIST_ENTRY.exec(line);
    if (!m) continue;
    if (m[1]) numbered++;
    const name = m[2].trim().replace(/[.,;]$/, "");
    if (!looksLikeBusinessName(name)) continue;
    names.push(name);
  }
  return { names, ranked: numbered >= 2 };
}

/**
 * One company, one row.
 *
 * A live run listed "oracle aconex ×2" and "aconex (oracle) ×1" as two separate
 * rivals, and did the same for Autodesk Construction Cloud written three ways.
 * That splits the count and overstates how crowded the field is. Parentheticals
 * and slash-alternates are dropped and the remaining words sorted, so every
 * spelling of the same company lands on the same key.
 */
function nameTokens(name: string): string[] {
  const base = (name || "")
    .toLowerCase()
    .replace(/\b(?:limited|ltd|plc|llp|inc|corp|co|the|and)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...new Set(base.split(" ").filter(Boolean))].sort();
}

export function canonicalCompetitor(name: string): string {
  const t = nameTokens(name);
  return t.length ? t.join(" ") : (name || "").trim().toLowerCase();
}

/**
 * Are these two spellings the same company?
 *
 * Subset, not equality. "Aconex (Oracle)" and "Oracle Aconex" share every word
 * once punctuation goes; "Autodesk Construction Cloud" is contained in
 * "Autodesk Construction Cloud (ACC/BIM 360)". Both pairs are one rival each,
 * and counting them as two splits the score and overstates the field.
 *
 * The shared part must carry a real word — a four-character floor stops two
 * unrelated companies merging because both mention "UK" or "360".
 */
export function sameCompany(a: string, b: string): boolean {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const big = new Set(large);
  if (!small.every((t) => big.has(t))) return false;
  return small.some((t) => t.length >= 4 && /[a-z]/.test(t));
}

/**
 * Collapse a tally of raw names into one row per company.
 *
 * Displayed with the fullest spelling any assistant used, because that is the
 * one carrying the product detail the customer will recognise.
 */
export function mergeCompetitorCounts(entries: { name: string; appearances: number }[]): { name: string; appearances: number }[] {
  const groups: { display: string; appearances: number; members: string[] }[] = [];
  for (const e of entries) {
    const hit = groups.find((g) => g.members.some((m) => sameCompany(m, e.name)));
    if (hit) {
      hit.appearances += e.appearances;
      hit.members.push(e.name);
      if (e.name.length > hit.display.length) hit.display = e.name;
    } else {
      groups.push({ display: e.name, appearances: e.appearances, members: [e.name] });
    }
  }
  return groups
    .map((g) => ({ name: g.display, appearances: g.appearances }))
    .sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name));
}

/** Where the brand sits in a ranked answer, or null when the answer is not a ranking. */
export function rankOf(answer: string, aliases: string[]): number | null {
  const { names, ranked } = extractNamedBusinesses(answer);
  if (!ranked || !names.length) return null;
  for (let i = 0; i < names.length; i++) {
    const hit = aliases.some((a) => new RegExp(`(?<!\\w)${escapeRe(a)}(?!\\w)`, "i").test(names[i]));
    if (hit) return i + 1;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Running a check
// ---------------------------------------------------------------------------

const SYSTEM = [
  "You are answering as a helpful assistant would for a real person doing research before they buy.",
  "Answer naturally and concretely. Where you would normally name specific companies, name them.",
  "If you genuinely do not know of specific providers, say so plainly rather than inventing names.",
  "Keep it under 250 words.",
].join("\n");

// How many model calls are in flight at once. Small: these go to three separate
// vendors, and a burst of parallel requests to one of them is how a rate limit
// turns a measurement into a row of errors.
const CONCURRENCY = Number(process.env.AI_VISIBILITY_CONCURRENCY || 6);
// The least time worth starting a call with — below this it can only time out.
const MIN_CALL_MS = 6_000;
// Under the route's own ceiling, so the response is written by us rather than
// the function being killed with the browser still waiting. The gap between this
// and maxDuration=60 is the margin for scoring, saving and serialising the run.
export const RUN_BUDGET_MS = Number(process.env.AI_VISIBILITY_BUDGET_MS || 45_000);

export type RunInput = {
  brandId: string;
  brand: string;
  domain?: string;
  questions: VisibilityQuestion[];
  assistants?: AiAssistant[];
};

export async function runVisibilityCheck(
  input: RunInput,
  nowISO: string,
  deps: { ask?: typeof askProvider } = {},
  opts: { deadline?: number } = {},
): Promise<VisibilityRun> {
  const ask = deps.ask ?? askProvider;
  const assistants = input.assistants?.length ? input.assistants : configuredProviders();
  const aliases = brandAliases(input.brand, input.domain);

  // Every question × assistant pair is one call. They run through a bounded
  // pool against a DEADLINE.
  //
  // Asking question-by-question and waiting for the slowest assistant each time
  // meant six rounds of up to twenty-five seconds — a hundred and fifty against
  // a sixty-second ceiling. The function is killed part-way, the browser holds a
  // request that never answers, and the button spins for ever. Same defect as
  // the email send, and the same fix: bound the concurrency, watch the clock,
  // and report what was actually collected.
  const deadline = opts.deadline ?? Date.now() + RUN_BUDGET_MS;
  const jobs: { qi: number; assistant: AiAssistant }[] = [];
  input.questions.forEach((_, qi) => { for (const a of assistants) jobs.push({ qi, assistant: a }); });

  const verdictFor = new Map<string, AnswerVerdict>();
  const notReached = (assistant: AiAssistant): AnswerVerdict => ({
    assistant, mentioned: false, rank: null, competitors: [], evidence: "", answer: "",
    error: "Not asked — the run ran out of time before reaching this one. Ask fewer questions, or run again.",
    asked: false,
  });

  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const key = `${job.qi}:${job.assistant}`;
      // Out of budget: leave it unasked rather than starting a call that cannot
      // finish. An unasked question is not a "no".
      if (Date.now() >= deadline - MIN_CALL_MS) { verdictFor.set(key, notReached(job.assistant)); continue; }
      const question = input.questions[job.qi];
      const res = await ask(job.assistant, { system: SYSTEM, prompt: question.text, maxTokens: 700 }, { timeoutMs: Math.max(MIN_CALL_MS, deadline - Date.now()) });
      if (!res.ok) {
        verdictFor.set(key, {
          assistant: job.assistant, mentioned: false, rank: null, competitors: [], evidence: "", answer: "",
          error: res.reason, asked: false,
        });
        continue;
      }
      const { mentioned, evidence } = findMention(res.text, aliases);
      // Competitors only where the question asked WHO. A "what should I look
      // for" answer is a list of criteria, and mining it produces rivals the
      // customer does not have.
      const vendorQuestion = seeksVendors(classifyIntent(question.text, input.brand));
      const { names } = vendorQuestion ? extractNamedBusinesses(res.text) : { names: [] as string[] };
      verdictFor.set(key, {
        assistant: job.assistant,
        model: res.model,
        mentioned,
        rank: vendorQuestion ? rankOf(res.text, aliases) : null,
        // The brand is not its own competitor.
        competitors: names.filter((n) => !aliases.some((a) => new RegExp(`(?<!\\w)${escapeRe(a)}(?!\\w)`, "i").test(n))).slice(0, 10),
        evidence,
        answer: res.text,
        asked: true,
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  const results: QuestionResult[] = input.questions.map((question, qi) => ({
    question,
    verdicts: assistants.map((a) => verdictFor.get(`${qi}:${a}`) ?? notReached(a)),
  }));

  // Rates are computed over what was ACTUALLY asked. Counting an assistant that
  // could not be reached as "did not mention you" would report a configuration
  // problem as a marketing one.
  const answered = results.flatMap((r) => r.verdicts).filter((v) => v.asked);
  const mentioned = answered.filter((v) => v.mentioned).length;
  const visibilityRate = answered.length ? Math.round((mentioned / answered.length) * 100) : 0;

  // Counted per canonical company, but DISPLAYED with the fullest spelling an
  // assistant actually used — the customer should recognise the name, and the
  // longest form is the one carrying the product detail.
  const raw: { name: string; appearances: number }[] = [];
  for (const v of answered) {
    // One appearance per answer, however many times that answer repeats a name.
    const seen = new Set<string>();
    for (const c of v.competitors) {
      const key = canonicalCompetitor(c);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      raw.push({ name: c, appearances: 1 });
    }
  }
  const topCompetitors = mergeCompetitorCounts(raw).slice(0, 10);

  const notAsked = results.flatMap((r) => r.verdicts).filter((v) => !v.asked);
  const note = answered.length === 0
    ? `No assistant could be asked${notAsked[0]?.error ? ` — ${notAsked[0].error}` : ""}. Nothing was measured, so nothing is reported.`
    : [
        `Asked ${results.length} question${results.length === 1 ? "" : "s"} across ${new Set(answered.map((v) => v.assistant)).size} assistant(s): named in ${mentioned} of ${answered.length} answers.`,
        // The single most important caveat on this whole surface.
        "Assistants are not deterministic — the same question can return different companies an hour later. Treat one run as a sample, and watch the trend across runs rather than reading anything into a single answer.",
        notAsked.length ? `${notAsked.length} answer(s) could not be collected: ${[...new Set(notAsked.map((v) => v.error))].join("; ")}` : "",
        notAsked.some((v) => /ran out of time/i.test(v.error || ""))
          ? "The ones that ran out of time were never asked, so they are not counted against you — run again, or ask fewer questions at once."
          : "",
      ].filter(Boolean).join(" ");

  const unprompted = (() => {
    let m = 0, a = 0;
    results.forEach((r) => {
      if (classifyIntent(r.question.text, input.brand) === "brand") return;
      r.verdicts.forEach((v) => { if (v.asked) { a++; if (v.mentioned) m++; } });
    });
    return { mentions: m, answers: a, rate: a ? Math.round((m / a) * 100) : 0 };
  })();

  return {
    id: `${input.brandId}__${hash(nowISO + input.brand)}`,
    brandId: input.brandId,
    brand: input.brand,
    domain: input.domain,
    ranAt: nowISO,
    results,
    visibilityRate,
    mentioned,
    askedCount: answered.length,
    unpromptedRate: unprompted.rate,
    unpromptedMentions: unprompted.mentions,
    unpromptedAnswers: unprompted.answers,
    assistants,
    topCompetitors,
    note,
  };
}

/**
 * The number that actually matters: buying questions only.
 *
 * Being named in "What is VeryX and would you recommend them?" is not
 * visibility — the assistant was handed the name. Counting it inflates the
 * headline exactly when the customer most needs the truth: one live run read
 * 18% at the top of the page and 0% in the plan below it, and 0% was right.
 *
 * Re-classified from the question TEXT, so a run recorded before the classifier
 * existed — every question stamped "buying" — still scores correctly.
 */
export function unpromptedScore(run: VisibilityRun): { mentions: number; answers: number; rate: number } {
  // Trust the stored figures when the run carries them AND they are consistent.
  if (typeof run.unpromptedRate === "number" && typeof run.unpromptedAnswers === "number" && typeof run.unpromptedMentions === "number") {
    return { mentions: run.unpromptedMentions, answers: run.unpromptedAnswers, rate: run.unpromptedRate };
  }
  // A run with no stored answers cannot be re-derived — fall back to the raw
  // figures rather than throwing, or one malformed history record takes the
  // whole trend line down.
  const results = Array.isArray(run.results) ? run.results : [];
  if (!results.length) {
    const answers = run.askedCount || 0;
    // Honour the rate the run recorded rather than recomputing it: a stored run
    // may carry its rate without the per-answer counts, and recomputing from a
    // missing `mentioned` silently reports 0% for a run that was not zero.
    const rate = typeof run.visibilityRate === "number"
      ? run.visibilityRate
      : (answers ? Math.round(((run.mentioned || 0) / answers) * 100) : 0);
    return { mentions: run.mentioned ?? Math.round((rate / 100) * answers), answers, rate };
  }
  let mentions = 0, answers = 0;
  for (const r of results) {
    if (classifyIntent(r.question.text, run.brand) === "brand") continue;
    for (const v of r.verdicts) {
      if (!v.asked) continue;
      answers++;
      if (v.mentioned) mentions++;
    }
  }
  return { mentions, answers, rate: answers ? Math.round((mentions / answers) * 100) : 0 };
}

/**
 * The same score, restricted to the CORE questions.
 *
 * Once questions are derived from the customer's site they rotate, so coverage
 * widens run after run. That is good for finding gaps and fatal for a trend
 * line: comparing a run to one that asked different questions measures the
 * questions, not the visibility. The core is the set asked every time, and it
 * is the only fair basis for "up 12 points since last week".
 *
 * Returns null when the run predates rotation (no question is flagged), so the
 * caller falls back to the whole-run score — which for those runs is the same
 * thing, because every question was asked every time.
 */
export function coreScore(run: VisibilityRun): { mentions: number; answers: number; rate: number } | null {
  const results = Array.isArray(run.results) ? run.results : [];
  if (!results.some((r) => r.question.core === true)) return null;

  let mentions = 0, answers = 0;
  for (const r of results) {
    if (r.question.core !== true) continue;
    if (classifyIntent(r.question.text, run.brand) === "brand") continue;
    for (const v of r.verdicts) {
      if (!v.asked) continue;
      answers++;
      if (v.mentioned) mentions++;
    }
  }
  return { mentions, answers, rate: answers ? Math.round((mentions / answers) * 100) : 0 };
}

// ---------------------------------------------------------------------------
// History. A trend only means anything if the earlier runs are real.
// ---------------------------------------------------------------------------
const COLLECTION = "ai_visibility_runs";
const mem = new Map<string, VisibilityRun>();

export async function saveRun(run: VisibilityRun): Promise<{ persisted: boolean }> {
  if (adminConfigured && adminDb) {
    await adminDb.collection(COLLECTION).doc(run.id.replace(/\//g, "_")).set(run, { merge: true });
    return { persisted: true };
  }
  mem.set(run.id, run);
  return { persisted: false };
}

export async function listRuns(brandId: string, limit = 30): Promise<VisibilityRun[]> {
  let runs: VisibilityRun[];
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).where("brandId", "==", brandId).limit(200).get();
    runs = snap.docs.map((d) => d.data() as VisibilityRun);
  } else {
    runs = [...mem.values()].filter((r) => r.brandId === brandId);
  }
  return runs.sort((a, b) => b.ranAt.localeCompare(a.ranAt)).slice(0, limit);
}

/**
 * Movement between the two most recent runs.
 *
 * Deliberately refuses to call a small change a trend. Two runs of six questions
 * is a handful of non-deterministic answers; declaring "up 17%" on that is the
 * same error as calling an A/B test on nine clicks.
 */
export function trend(runs: VisibilityRun[]): { direction: "up" | "down" | "flat" | "unknown"; delta: number; note: string } {
  // Scored on buying answers only — a trend in "does it repeat the name I gave
  // it" is not a trend in visibility.
  // Prefer the core questions when BOTH runs carry them: comparing a rotating
  // question against a different rotating question is comparing two tests.
  const bothCore = runs.length >= 2 && coreScore(runs[0]) !== null && coreScore(runs[1]) !== null;
  const scoreOf = (r: VisibilityRun) => (bothCore ? coreScore(r) ?? unpromptedScore(r) : unpromptedScore(r));
  const scored = runs.map((r) => ({ run: r, s: scoreOf(r) })).filter((x) => x.s.answers > 0);
  if (scored.length < 2) {
    return { direction: "unknown", delta: 0, note: "One run so far. A second gives you something to compare — the number on its own is a sample, not a position." };
  }
  const [latest, previous] = scored;
  const delta = latest.s.rate - previous.s.rate;
  const sample = Math.min(latest.s.answers, previous.s.answers);
  // With a handful of answers per run, anything under a third of them is noise.
  const meaningful = Math.max(15, Math.round(100 / Math.max(1, sample)) * 2);
  if (Math.abs(delta) < meaningful) {
    return {
      direction: "flat", delta,
      note: `Effectively unchanged (${delta > 0 ? "+" : ""}${delta} points across ${sample} answers). A swing this size is what these models do on their own — it is not movement you caused.`,
    };
  }
  const basis = bothCore
    ? " Measured on the core questions only — the ones asked in every run — so this compares like with like."
    : "";
  return {
    direction: delta > 0 ? "up" : "down", delta,
    note: `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} points on the previous run (${sample} answers each). Worth acting on, but confirm it holds over a third run before spending against it.${basis}`,
  };
}

/** Test seam — module memory would otherwise leak between cases. */
export function __resetVisibilityRuns(): void { mem.clear(); }
