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
  /** Share of ANSWERED questions in which the brand was named. */
  visibilityRate: number;
  mentioned: number;
  askedCount: number;
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
export function suggestQuestions(input: { business: string; product?: string; location?: string; audience?: string }): VisibilityQuestion[] {
  const product = (input.product || "").trim();
  const where = (input.location || "").trim();
  const who = (input.audience || "").trim();
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
export function extractNamedBusinesses(answer: string): { names: string[]; ranked: boolean } {
  const names: string[] = [];
  let numbered = 0;
  for (const line of (answer || "").split("\n")) {
    const m = LIST_ENTRY.exec(line);
    if (!m) continue;
    if (m[1]) numbered++;
    const name = m[2].trim().replace(/[.,;]$/, "");
    // Reject sentence fragments — a real business name is short and has few
    // lower-case function words.
    if (name.split(/\s+/).length > 6) continue;
    if (!/[A-Za-z]/.test(name)) continue;
    names.push(name);
  }
  return { names, ranked: numbered >= 2 };
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
): Promise<VisibilityRun> {
  const ask = deps.ask ?? askProvider;
  const assistants = input.assistants?.length ? input.assistants : configuredProviders();
  const aliases = brandAliases(input.brand, input.domain);

  const results: QuestionResult[] = [];
  for (const question of input.questions) {
    // Every assistant gets the SAME question, asked in parallel — comparing
    // answers to different questions would measure nothing.
    const verdicts = await Promise.all(
      assistants.map(async (assistant): Promise<AnswerVerdict> => {
        const res = await ask(assistant, { system: SYSTEM, prompt: question.text, maxTokens: 700 });
        if (!res.ok) {
          return {
            assistant, mentioned: false, rank: null, competitors: [], evidence: "", answer: "",
            error: res.reason, asked: false,
          };
        }
        const { mentioned, evidence } = findMention(res.text, aliases);
        const { names } = extractNamedBusinesses(res.text);
        return {
          assistant,
          model: res.model,
          mentioned,
          rank: rankOf(res.text, aliases),
          // The brand is not its own competitor.
          competitors: names.filter((n) => !aliases.some((a) => new RegExp(`(?<!\\w)${escapeRe(a)}(?!\\w)`, "i").test(n))).slice(0, 10),
          evidence,
          answer: res.text,
          asked: true,
        };
      }),
    );
    results.push({ question, verdicts });
  }

  // Rates are computed over what was ACTUALLY asked. Counting an assistant that
  // could not be reached as "did not mention you" would report a configuration
  // problem as a marketing one.
  const answered = results.flatMap((r) => r.verdicts).filter((v) => v.asked);
  const mentioned = answered.filter((v) => v.mentioned).length;
  const visibilityRate = answered.length ? Math.round((mentioned / answered.length) * 100) : 0;

  const counts = new Map<string, number>();
  for (const v of answered) {
    for (const c of new Set(v.competitors.map((x) => x.toLowerCase()))) {
      counts.set(c, (counts.get(c) || 0) + 1);
    }
  }
  const topCompetitors = [...counts.entries()]
    .map(([name, appearances]) => ({ name, appearances }))
    .sort((a, b) => b.appearances - a.appearances)
    .slice(0, 10);

  const notAsked = results.flatMap((r) => r.verdicts).filter((v) => !v.asked);
  const note = answered.length === 0
    ? `No assistant could be asked${notAsked[0]?.error ? ` — ${notAsked[0].error}` : ""}. Nothing was measured, so nothing is reported.`
    : [
        `Asked ${results.length} question${results.length === 1 ? "" : "s"} across ${new Set(answered.map((v) => v.assistant)).size} assistant(s): named in ${mentioned} of ${answered.length} answers.`,
        // The single most important caveat on this whole surface.
        "Assistants are not deterministic — the same question can return different companies an hour later. Treat one run as a sample, and watch the trend across runs rather than reading anything into a single answer.",
        notAsked.length ? `${notAsked.length} answer(s) could not be collected: ${[...new Set(notAsked.map((v) => v.error))].join("; ")}` : "",
      ].filter(Boolean).join(" ");

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
    assistants,
    topCompetitors,
    note,
  };
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
  const usable = runs.filter((r) => r.askedCount > 0);
  if (usable.length < 2) {
    return { direction: "unknown", delta: 0, note: "One run so far. A second gives you something to compare — the number on its own is a sample, not a position." };
  }
  const [latest, previous] = usable;
  const delta = latest.visibilityRate - previous.visibilityRate;
  const sample = Math.min(latest.askedCount, previous.askedCount);
  // With a handful of answers per run, anything under a third of them is noise.
  const meaningful = Math.max(15, Math.round(100 / Math.max(1, sample)) * 2);
  if (Math.abs(delta) < meaningful) {
    return {
      direction: "flat", delta,
      note: `Effectively unchanged (${delta > 0 ? "+" : ""}${delta} points across ${sample} answers). A swing this size is what these models do on their own — it is not movement you caused.`,
    };
  }
  return {
    direction: delta > 0 ? "up" : "down", delta,
    note: `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} points on the previous run (${sample} answers each). Worth acting on, but confirm it holds over a third run before spending against it.`,
  };
}

/** Test seam — module memory would otherwise leak between cases. */
export function __resetVisibilityRuns(): void { mem.clear(); }
