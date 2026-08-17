// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Claim Guard — the CODE gate on what an agent hands a customer to publish.
//
// A prompt rule can be ignored by a model; this cannot. Every agent's output is
// scanned here before it reaches the user, because the platform's real exposure
// is not a bad sentence — it is the customer PUBLISHING something they cannot
// defend:
//   • a fabricated testimonial or review  → illegal advertising (UK CAP/ASA,
//     US FTC endorsement rules); liability lands on the CUSTOMER;
//   • an invented statistic in an ad ("cost a UK site £40k", "boost output 40%")
//     → an unsubstantiated claim they cannot evidence if challenged;
//   • an absolute/superlative guarantee   → handled by compliance.verifyClaim.
//
// Both were produced by live agents: a Sales Funnel run invented a contractor
// testimonial AND a £40k figure, while the Viral Hook agent's own kill-list
// forbids exactly that. Two agents, opposite behaviour — so the rule belongs in
// code, applied to all of them, not in each prompt.
//
// This never rewrites the agent's words. It FLAGS, so the user is warned before
// publishing and the platform keeps a record of what was warned about.

import { verifyClaim } from "@/backend/compliance";

export type ClaimSeverity = "block" | "warn";
export type ClaimFinding = {
  kind: "testimonial" | "statistic" | "superlative" | "guarantee";
  severity: ClaimSeverity;
  excerpt: string;   // the offending fragment, trimmed
  reason: string;
  fix: string;
};

const trim = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\s+/g, " ").trim();

// A quoted sentence followed (or preceded) by a person/company attribution is the
// shape of a testimonial. Real supplied quotes are fine — but an agent has no
// source, so any quote it authors is fabricated by definition.
const QUOTE_ATTRIB = /["“”']([^"“”'\n]{15,220})["“”']\s*[—–-]{1,2}\s*([A-Z][\w.& ]{2,40})/g;
const TESTIMONIAL_LABEL = /^\s*(?:\|\s*)?(testimonial|review|case study|customer quote|client quote)\b/gim;

// A number that would be read as evidence: %, £/$/€ amounts, "Nx", or a large
// count next to a claim verb. Deliberately narrow — we do not want to flag
// prices, dates, dimensions or the customer's own supplied figures.
const STAT_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\b\d{1,3}(?:\.\d+)?\s?%\s*(?:more|less|faster|higher|lower|increase|decrease|growth|uplift|improvement|conversion|roi)\b/gi, why: "a percentage improvement" },
  { re: /\b(?:boost|increase|grow|cut|reduce|save|slash)\w*\s+[^.\n]{0,24}\b\d{1,3}(?:\.\d+)?\s?%/gi, why: "a percentage improvement" },
  { re: /[£$€]\s?\d[\d,.]*\s?(?:k|m|bn|million|billion)?\b[^.\n]{0,40}\b(?:saved|lost|cost|wasted|generated|revenue|rework|extra)\b/gi, why: "a money outcome" },
  { re: /\b(?:saved|lost|cost|wasted|generated|earned)\b[^.\n]{0,24}[£$€]\s?\d[\d,.]*\s?(?:k|m|bn)?/gi, why: "a money outcome" },
  { re: /\b\d{1,3}(?:\.\d+)?\s?x\s+(?:more|faster|better|higher|growth|roi|return)\b/gi, why: "a multiplier" },
  { re: /\b(?:trusted by|used by|join|over|more than)\s+[\d,]{3,}\+?\s+(?:businesses|companies|customers|users|clients|teams|brands)/gi, why: "a customer count" },
  { re: /\b[\d,]{3,}\+?\s+(?:businesses|companies|customers|users|clients)\s+(?:trust|use|rely)/gi, why: "a customer count" },
  // "87% of businesses see results in 30 days" — the exact shape the platform's
  // own doctrine bans by name ("no invented benchmarks, no NN% of businesses")
  // and which nothing here matched, because the patterns above all require the
  // percentage to sit next to a comparison word. A bare proportion of a
  // population is the most quoted fabricated statistic in marketing copy.
  { re: /\b\d{1,3}(?:\.\d+)?\s?%\s+of\s+(?:businesses|companies|customers|users|clients|people|marketers|buyers|shoppers|consumers|brands|teams)\b/gi, why: "a proportion of a population" },
];

// Scan one block of agent output. `suppliedFacts` is whatever the user actually
// gave us — a number they supplied is THEIRS to stand behind, so it is not a
// fabrication and must not be flagged.
export function scanClaims(output: string, suppliedFacts = ""): ClaimFinding[] {
  const text = output || "";
  if (!text.trim()) return [];
  const supplied = suppliedFacts.toLowerCase();
  const findings: ClaimFinding[] = [];
  const seen = new Set<string>();

  const push = (f: ClaimFinding) => {
    const key = `${f.kind}:${f.excerpt.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };

  // 1) Fabricated testimonials — quote + attribution, or a labelled row.
  for (const m of text.matchAll(QUOTE_ATTRIB)) {
    const quote = m[1];
    if (supplied.includes(quote.toLowerCase().slice(0, 40))) continue; // the user gave us this
    push({
      kind: "testimonial", severity: "block", excerpt: trim(m[0]),
      reason: "This looks like a customer testimonial the AI wrote. Publishing an endorsement from a person who did not say it is illegal advertising (UK CAP/ASA, US FTC) and the liability is yours.",
      fix: "Replace it with a real quote you have permission to use, or delete it. Ask a happy customer for one line and their consent in writing.",
    });
  }
  for (const m of text.matchAll(TESTIMONIAL_LABEL)) {
    const line = text.slice(m.index ?? 0).split("\n")[0];
    // Only flag if the row carries actual quoted content — a section heading alone is fine.
    if (!/["“”']/.test(line)) continue;
    push({
      kind: "testimonial", severity: "block", excerpt: trim(line),
      reason: "A testimonial has been written for you. It is not from a real customer.",
      fix: "Collect a genuine quote before this goes anywhere public.",
    });
  }

  // 2) Invented statistics presented as evidence.
  for (const { re, why } of STAT_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const frag = m[0];
      const digits = frag.match(/[\d.,]+/)?.[0] ?? "";
      if (digits && supplied.includes(digits)) continue; // the user's own figure
      push({
        kind: "statistic", severity: "warn", excerpt: trim(frag),
        reason: `Contains ${why} that you did not supply, so there is no evidence behind it. A specific figure you cannot defend is worse than no figure.`,
        fix: "Delete the number and make the claim without it, or replace it with a figure from your own records that you can evidence.",
      });
    }
  }

  // 3) Superlatives / guarantees — reuse the existing compliance engine so there
  // is ONE definition of an unsubstantiated claim across the platform.
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/^[|>#*\-\s]+/, "").trim();
    if (line.length < 12 || line.length > 240) continue;
    const v = verifyClaim({ text: line });
    if (!v.publishable && v.status === "prohibited") {
      push({
        kind: v.reason?.toLowerCase().includes("guarantee") ? "guarantee" : "superlative",
        severity: "warn", excerpt: trim(line),
        reason: v.reason || "Unsubstantiated absolute claim.",
        fix: "Soften it, or attach evidence you can show if challenged.",
      });
    }
  }

  return findings;
}

export type ClaimReport = {
  clean: boolean;
  blocking: number;
  warnings: number;
  findings: ClaimFinding[];
  summary: string;
};

export function claimReport(output: string, suppliedFacts = ""): ClaimReport {
  const findings = scanClaims(output, suppliedFacts);
  const blocking = findings.filter((f) => f.severity === "block").length;
  const warnings = findings.length - blocking;
  return {
    clean: findings.length === 0,
    blocking, warnings, findings,
    summary: findings.length === 0
      ? "Nothing flagged — no invented testimonials, statistics or absolute claims detected."
      : `${blocking ? `${blocking} item(s) MUST NOT be published as written` : "No blocking items"}${warnings ? `, ${warnings} to check before publishing` : ""}. Review the flags before this goes anywhere public.`,
  };
}
