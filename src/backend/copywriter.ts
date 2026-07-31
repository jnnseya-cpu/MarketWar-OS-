// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// One real copywriter, shared by every surface that used to mad-lib.
//
// The Landing Page Generator and Campaign Warfare both produced copy by string
// concatenation:
//
//     headline = `${product}, made easy${locSuffix}`
//     hook     = `"${slang}." — curiosity in three words.`
//
// which is how a construction-software company ends up with "The Enterprise
// Execution Operating System, made easy in United Kingdom" and a hook that just
// says "sorted." Both surfaces are labelled AI. Neither used any.
//
// This writes properly, and the rules are what make it safe to ship:
//
//   • GROUNDED. The model is given the brand's own facts and told, in the
//     system prompt, that it may not add any others. No invented awards,
//     statistics, testimonials or capabilities.
//   • CHECKED. Output passes through claim-guard before it is returned. A
//     fabricated testimonial or an unsupported "#1" is blocked, not published.
//   • HONEST WHEN OFF. With no provider key it returns the deterministic
//     template AND says so, so a page never silently claims to be AI-written
//     when it was assembled from string parts.
//   • STRUCTURED. The model returns JSON, so a headline is a headline rather
//     than a paragraph that must be scraped.

import { gatewayComplete, GatewayUnconfiguredError, DOCUMENT_BUDGET } from "@/backend/gateway";
import { claimReport } from "@/backend/claim-guard";

export type CopyBrief = {
  business: string;
  product: string;            // what they actually sell
  audience?: string;
  location?: string;
  offer?: string;
  objective?: string;         // what the customer wants to happen
  pain?: string;
  tone?: string;
  // Anything already established about the brand — research findings, the
  // customer's own description. Used as the ONLY permitted source of facts.
  facts?: string[];
};

export type CopyPack = {
  headline: string;
  subheadline: string;
  offerHeadline: string;
  offerBullets: string[];
  problemHeading: string;
  problemBody: string;
  benefits: string[];
  faq: { q: string; a: string }[];
  primaryCta: string;
  hooks: string[];
};

export type CopyResult = {
  ok: boolean;
  copy: CopyPack;
  written: "ai" | "template";
  provider?: string;
  blocked: string[];      // claims removed before returning
  warnings: string[];
  note: string;
};

const SYSTEM = [
  "You are a direct-response copywriter for a small business. You write plainly and specifically.",
  "",
  "ABSOLUTE RULES:",
  "1. Use ONLY the facts given to you. Never invent a statistic, a customer quote, an award, a rating, a client name or a capability.",
  "2. Never write a superlative you cannot prove — no 'best', 'number one', 'leading', 'award-winning'.",
  "3. Never invent urgency. Only mention a deadline if one is given in the brief.",
  "4. Write about the OUTCOME the reader gets, not about the product's features.",
  "5. No filler phrases. 'Made easy', 'take it to the next level', 'unlock your potential', 'game-changing' and 'a great result' are banned — they say nothing.",
  "6. A headline must be specific enough that a competitor could not use it unchanged.",
  "",
  "Reply with JSON ONLY, no markdown fence, matching exactly:",
  "{",
  '  "headline": "under 12 words, the single promise",',
  '  "subheadline": "one sentence naming who it is for and what changes",',
  '  "offerHeadline": "what they get, stated plainly",',
  '  "offerBullets": ["3-5 concrete inclusions"],',
  '  "problemHeading": "the frustration, in the reader\'s words",',
  '  "problemBody": "2 sentences on what that costs them today",',
  '  "benefits": ["4-6 outcomes, each starting with a verb"],',
  '  "faq": [{"q":"a real pre-purchase question","a":"a straight answer"}],',
  '  "primaryCta": "3-5 words, an action",',
  '  "hooks": ["3 scroll-stopping first lines for social"]',
  "}",
].join("\n");

function briefText(b: CopyBrief): string {
  const lines = [
    `Business: ${b.business}`,
    `Sells: ${b.product}`,
    b.audience ? `Target customer: ${b.audience}` : "",
    b.location ? `Location / market: ${b.location}` : "",
    b.offer ? `Current offer: ${b.offer}` : "",
    b.objective ? `What the business wants to happen: ${b.objective}` : "",
    b.pain ? `Customer's problem: ${b.pain}` : "",
    b.tone ? `Tone: ${b.tone}` : "",
  ].filter(Boolean);
  if (b.facts?.length) {
    lines.push("", "Established facts you may use (and nothing beyond these):");
    for (const f of b.facts.slice(0, 12)) lines.push(`- ${f}`);
  }
  lines.push(
    "",
    "If a detail is missing, write around it rather than inventing it. Do not use bracketed placeholders.",
  );
  return lines.join("\n");
}

// Pull the JSON out of a model reply that may still be wrapped in a fence.
export function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const list = (v: unknown, max = 8): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean).slice(0, max) : [];

// Phrases that mean nothing. If the model produces one anyway, it is a signal
// the copy is generic — reported rather than silently shipped.
const FILLER = [
  "made easy", "a great result", "next level", "unlock your", "game-chang",
  "take your business", "world-class", "cutting-edge", "seamlessly",
];

export function fillerIn(text: string): string[] {
  const lower = text.toLowerCase();
  return FILLER.filter((f) => lower.includes(f));
}

// The deterministic fallback — the OLD behaviour, kept because zero-config demo
// must keep working, but now clearly labelled as template-written.
export function templateCopy(b: CopyBrief): CopyPack {
  const where = b.location ? ` in ${b.location}` : "";
  const who = b.audience || "customers";
  return {
    headline: b.offer ? `${b.product} — ${b.offer}` : `${b.product}${where}`,
    subheadline: `For ${who}${where}.`,
    offerHeadline: b.offer || "What you get",
    offerBullets: [],
    problemHeading: b.pain ? "Sound familiar?" : "",
    problemBody: b.pain ? `Tired of ${b.pain}?` : "",
    benefits: [],
    faq: [],
    primaryCta: b.objective?.toLowerCase().includes("whatsapp") ? "Message us" : "Get in touch",
    hooks: [],
  };
}

export async function writeCopy(brief: CopyBrief, opts: { lang?: string } = {}): Promise<CopyResult> {
  const fallback = templateCopy(brief);
  if (!brief.business?.trim() || !brief.product?.trim()) {
    return {
      ok: false, copy: fallback, written: "template", blocked: [], warnings: [],
      note: "Tell the engine what the business sells — copy written without it is generic by definition.",
    };
  }

  let raw = "";
  let provider: string | undefined;
  try {
    const res = await gatewayComplete({
      system: SYSTEM,
      prompt: briefText(brief),
      maxTokens: 1400,
      lang: opts.lang,
    }, DOCUMENT_BUDGET);
    raw = res.text;
    provider = res.provider;
  } catch (e) {
    // No key configured is a normal state, not an error — but the caller must
    // know the copy was assembled, not written.
    const unconfigured = e instanceof GatewayUnconfiguredError;
    return {
      ok: !unconfigured ? false : true,
      copy: fallback,
      written: "template",
      blocked: [],
      warnings: unconfigured ? [] : [e instanceof Error ? e.message : "The copywriter could not be reached."],
      note: unconfigured
        ? "Written from a template, not by a model — no AI provider is connected. Connect a key and this surface writes real copy grounded in your brand."
        : "The copywriter failed, so the template was used. The copy below is structural, not persuasive.",
    };
  }

  const parsed = extractJson(raw);
  if (!parsed) {
    return {
      ok: false, copy: fallback, written: "template", blocked: [],
      warnings: ["The model did not return usable JSON."],
      note: "Fell back to the template because the reply could not be read.",
    };
  }

  const copy: CopyPack = {
    headline: str(parsed.headline, fallback.headline),
    subheadline: str(parsed.subheadline, fallback.subheadline),
    offerHeadline: str(parsed.offerHeadline, fallback.offerHeadline),
    offerBullets: list(parsed.offerBullets, 6),
    problemHeading: str(parsed.problemHeading, fallback.problemHeading),
    problemBody: str(parsed.problemBody, fallback.problemBody),
    benefits: list(parsed.benefits, 6),
    faq: Array.isArray(parsed.faq)
      ? (parsed.faq as unknown[])
          .map((f) => {
            const o = (f || {}) as Record<string, unknown>;
            return { q: str(o.q), a: str(o.a) };
          })
          .filter((f) => f.q && f.a)
          .slice(0, 6)
      : [],
    primaryCta: str(parsed.primaryCta, fallback.primaryCta),
    hooks: list(parsed.hooks, 5),
  };

  // Everything the model wrote, checked in one pass. The facts it was given are
  // supplied so a figure the CUSTOMER provided is not flagged as invented.
  const everything = [
    copy.headline, copy.subheadline, copy.offerHeadline, copy.problemHeading, copy.problemBody,
    ...copy.offerBullets, ...copy.benefits, ...copy.hooks, ...copy.faq.map((f) => `${f.q} ${f.a}`),
  ].join("\n");
  const supplied = [brief.offer, brief.product, brief.pain, ...(brief.facts || [])].filter(Boolean).join("\n");
  const report = claimReport(everything, supplied);

  const blocked = report.findings.filter((f) => f.severity === "block").map((f) => f.excerpt || f.reason);
  const warnings = report.findings.filter((f) => f.severity !== "block").map((f) => f.reason);

  const filler = fillerIn(everything);
  if (filler.length) {
    warnings.push(`Contains empty phrasing (${filler.join(", ")}) — regenerate for something more specific.`);
  }

  // A blocked claim means an invented testimonial or similar. Refuse the copy
  // rather than shipping it with a warning nobody reads.
  if (blocked.length) {
    return {
      ok: false, copy: fallback, written: "template", blocked, warnings,
      note: `The copy was rejected: it contained ${blocked.length} claim(s) that cannot be substantiated. Nothing invented is ever published — the template is shown instead.`,
    };
  }

  return {
    ok: true, copy, written: "ai", provider, blocked: [], warnings,
    note: `Written for ${brief.business} from the facts you supplied, and checked for unsupported claims before being returned.`,
  };
}
