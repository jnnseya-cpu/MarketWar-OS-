// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Write the page a brief describes.
//
// The brief already says what the page should argue and — crucially — which
// facts the business must supply. This turns that into a draft.
//
// THE ONE RULE THAT MATTERS. The whole point of the citation work is to get a
// model to repeat what your page says about you. So a page that states things
// you cannot stand behind is not a marketing risk, it is the WORST possible
// outcome: you would be teaching the assistants a claim you would have to
// retract. An invented ISO certification, a made-up customer count, a
// fabricated case study — each of those is worse than not publishing at all.
//
// Therefore: the model is given ONLY the facts the customer typed in, and told
// in the strongest terms not to state anything else about the business. Then
// the output is scanned against those same facts, and anything asserted that
// was not supplied comes back as a blocker. The draft is never auto-published.

import { gatewayComplete } from "@/backend/gateway";
import { claimReport, type ClaimFinding } from "@/backend/claim-guard";

export type ProofAnswer = { question: string; answer: string };

export type CitationPageInput = {
  brand: string;
  domain?: string;
  /** The buying question this page must answer. */
  question: string;
  angle: string;
  outline: string[];
  /** The facts the brief asked for, with whatever the customer actually typed. */
  proof: ProofAnswer[];
  category?: string;
};

export type CitationPageDraft = {
  title: string;
  excerpt: string;
  /** Markdown. */
  content: string;
  /** Claims in the draft that no supplied fact backs. */
  blockers: ClaimFinding[];
  warnings: ClaimFinding[];
  /** Brief items the customer left blank — the page was written without them. */
  unanswered: string[];
  safeToPublish: boolean;
  note: string;
};

const SYSTEM = [
  "You write one web page that answers one buying question, for a business that wants an AI assistant to be able to quote it.",
  "",
  "ABSOLUTE RULE: state NOTHING about this business that is not in the SUPPLIED FACTS below. No certifications, no customer numbers, no years in business, no case studies, no awards, no percentages, no prices, no client names — unless they appear verbatim in the supplied facts.",
  "Where a section of the outline needs a fact you were not given, write the section around what you DO know and add a single line: '[NEEDS: <the fact>]'. Never fill the gap with a plausible number.",
  "",
  "How to write it so a model can quote it:",
  "- Answer the question directly in the first two sentences. Do not warm up.",
  "- Write self-contained sentences. A sentence that only makes sense with the paragraph around it will not be quoted.",
  "- Name competitors honestly where the outline asks for a comparison. A page that only praises itself reads as marketing to a model exactly as it does to a person.",
  "- Plain sentences over adjectives. 'Hosted in London' beats 'world-class infrastructure'.",
  "",
  "Return markdown only: an H1, then the sections from the outline as H2s. No preamble, no closing note about yourself.",
].join("\n");

function excerptFrom(markdown: string): string {
  const firstPara = markdown
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith("[NEEDS:"));
  return (firstPara || "").replace(/[*_`]/g, "").slice(0, 200);
}

function titleFrom(markdown: string, fallback: string): string {
  const h1 = markdown.split("\n").find((l) => /^#\s+/.test(l.trim()));
  return (h1 ? h1.replace(/^#\s+/, "") : fallback).replace(/[*`]/g, "").trim().slice(0, 120);
}

export async function writeCitationPage(
  input: CitationPageInput,
  deps: { complete?: typeof gatewayComplete } = {},
): Promise<CitationPageDraft> {
  const complete = deps.complete ?? gatewayComplete;

  const supplied = input.proof.filter((p) => (p.answer || "").trim());
  const unanswered = input.proof.filter((p) => !(p.answer || "").trim()).map((p) => p.question);

  // The facts block is also what the claim guard scans against, so the model and
  // the checker are working from exactly the same ground truth.
  const facts = supplied.map((p) => `- ${p.question}: ${p.answer.trim()}`).join("\n");

  const res = await complete({
    system: SYSTEM,
    prompt: [
      `BUSINESS: ${input.brand}${input.domain ? ` (${input.domain})` : ""}`,
      input.category ? `CATEGORY: ${input.category}` : "",
      `QUESTION THIS PAGE MUST ANSWER: ${input.question}`,
      `ANGLE: ${input.angle}`,
      `OUTLINE (use these as H2s, in order):\n${input.outline.map((h) => `- ${h}`).join("\n")}`,
      "",
      supplied.length ? `SUPPLIED FACTS (the ONLY things you may state about this business):\n${facts}` : "SUPPLIED FACTS: none were provided. Write the page about the SUBJECT — what a buyer should know, how the category works, how to evaluate options — and mark every place a fact about this business is needed with [NEEDS: …]. Do not invent a single detail about them.",
      unanswered.length ? `\nDELIBERATELY NOT SUPPLIED — mark these [NEEDS: …] rather than guessing:\n${unanswered.map((u) => `- ${u}`).join("\n")}` : "",
    ].filter(Boolean).join("\n"),
    maxTokens: 2200,
  });

  const content = (res.text || "").trim();
  // Scanned against the supplied facts: an assertion the customer never made is
  // a blocker, not a stylistic note.
  const report = claimReport(content, facts);

  // Severity is ESCALATED here, and only here.
  //
  // The shared guard rates an unsupported statistic "warn", which is right for
  // ad copy a person reads before it goes out. It is wrong for this page. The
  // entire purpose of a citation page is to become the thing assistants repeat
  // about you, so an unbacked "cuts rework by 42%" is not a line to check — it
  // is a figure that could be quoted back at you by three different models for
  // as long as it stands. A fabricated statistic or testimonial blocks
  // publication here whatever the shared policy says elsewhere.
  const escalate = (f: ClaimFinding) => f.kind === "statistic" || f.kind === "testimonial";
  const blockers = report.findings.filter((f) => f.severity === "block" || escalate(f));
  const warnings = report.findings.filter((f) => f.severity !== "block" && !escalate(f));
  const needsMarkers = (content.match(/\[NEEDS:/g) || []).length;

  return {
    title: titleFrom(content, input.question),
    excerpt: excerptFrom(content),
    content,
    blockers,
    warnings,
    unanswered,
    // Never auto-publishable with an unbacked claim in it. The gap markers are
    // fine — they are the honest option and a person removes them by filling
    // the fact in, not by deleting the line.
    safeToPublish: blockers.length === 0,
    note: [
      blockers.length
        ? `${blockers.length} claim(s) in this draft are not backed by anything you supplied. They are listed below — either give the evidence or cut the sentence. Publishing an unsupported claim is worse than not publishing: you would be teaching the assistants something you may have to retract.`
        : "No unsupported claims about your business were found in this draft.",
      needsMarkers
        ? `${needsMarkers} place(s) are marked [NEEDS: …] where a fact was missing. Fill those in and regenerate — do not simply delete the markers, or the page loses the specifics that make it quotable.`
        : "",
      unanswered.length
        ? `You left ${unanswered.length} of the brief's fact(s) blank, so the page was written without them.`
        : "",
      "This is a DRAFT. Nothing has been published.",
    ].filter(Boolean).join(" "),
  };
}
