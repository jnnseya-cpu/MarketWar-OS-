// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Claims & Compliance Engine — Shared Intelligence layer.
//
// Fuses three agents:
//   • Claim Verification Agent — classifies every marketing claim and blocks
//     unsubstantiated superlatives ("best", "#1", "guaranteed", "cures", ...).
//   • Compliance Agent — flags regulated categories (health/finance/…) and
//     requires synthetic-content disclosure for AI-generated assets.
//   • Provenance — emits a C2PA-style record so AI assets always carry a label
//     and creator consent is recorded.
//
// Doctrine: HONESTY. Predictions/scores are ESTIMATES, never invented facts.
// An unsubstantiated claim is NEVER publishable, and AI assets ALWAYS carry a
// disclosure. Deterministic + demo-safe: no Date/Math.random, seeded hashing.

const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

export type ClaimStatus = "verified" | "user_confirmed" | "inferred_pending" | "prohibited";

export type ClaimVerification = {
  text: string;
  status: ClaimStatus;
  publishable: boolean;
  reason: string;
};

export const REGULATED_CATEGORIES = [
  "health",
  "finance",
  "alcohol",
  "gambling",
  "political",
  "children",
  "weapons",
  "crypto",
] as const;

export type RegulatedCategory = (typeof REGULATED_CATEGORIES)[number];

// Unsubstantiated superlatives / absolute promises — never publishable as-is.
const PROHIBITED_TERMS = [
  "best",
  "#1",
  "number one",
  "cheapest",
  "guaranteed",
  "clinically proven",
  "cures",
  "cure",
  "risk-free",
  "100% effective",
  "miracle",
];

// Health / financial / absolute triggers — need evidence before publishing.
const EVIDENCE_REQUIRED_TERMS = [
  "clinically",
  "proven",
  "scientifically",
  "doctor recommended",
  "fda",
  "returns",
  "roi",
  "profit",
  "guaranteed income",
  "lose weight",
  "reduces",
  "prevents",
  "treats",
  "always",
  "never",
  "everyone",
  "instantly",
];

export type ClaimInput = { text: string; evidenceSource?: string; substantiated?: boolean };

// ---------------------------------------------------------------------------
// Term matching. This used to be lower.includes(term), which is wrong in a way
// that actively damages trust: a perfectly clean CTA — "Secure your FREE lead
// now" — was flagged as an unsubstantiated medical claim, because "secure"
// contains "cure". The same bug flags "asbestos" as the superlative "best",
// "Detroit" as "roi", "non-profit" as "profit" and "unproven" as "proven".
//
// A compliance gate that cries wolf is worse than none: the customer learns to
// dismiss the warnings, and then misses the real one. So terms match on WORD
// BOUNDARIES, and a term negated by its prefix is not a claim at all.
// ---------------------------------------------------------------------------

const NEGATING_PREFIXES = ["non-", "un-", "not-", "not for ", "not-for-", "no ", "never "];

function termPattern(term: string): RegExp {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // \b is unreliable when a term starts or ends with punctuation ("#1"), so the
  // boundary is expressed as "not preceded/followed by a word character".
  return new RegExp(`(?<!\\w)${esc}(?!\\w)`, "i");
}

/** The first term that genuinely appears as a word, or undefined. */
export function findTerm(text: string, terms: readonly string[]): string | undefined {
  const lower = (text || "").toLowerCase();
  for (const term of terms) {
    const m = termPattern(term).exec(lower);
    if (!m) continue;
    // "non-profit" and "unproven" are the OPPOSITE of the claim being guarded
    // against; flagging them tells the customer off for being careful.
    const before = lower.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0);
    if (NEGATING_PREFIXES.some((p) => before.endsWith(p))) continue;
    return term;
  }
  return undefined;
}

// Classify a single marketing claim. ESTIMATE — heuristic, not legal advice.
export function verifyClaim(input: ClaimInput): ClaimVerification {
  const text = (input.text || "").trim();
  const lower = text.toLowerCase();
  const hasEvidence = typeof input.evidenceSource === "string" && input.evidenceSource.trim().length > 0;

  if (!text) {
    return { text, status: "prohibited", publishable: false, reason: "Empty claim — nothing to substantiate." };
  }

  const hitProhibited = findTerm(lower, PROHIBITED_TERMS);
  if (hitProhibited && !hasEvidence) {
    return {
      text,
      status: "prohibited",
      publishable: false,
      reason: `Unsubstantiated superlative/absolute claim ("${hitProhibited}") — remove it or attach verifiable evidence.`,
    };
  }

  const hitEvidence = findTerm(lower, EVIDENCE_REQUIRED_TERMS);

  if (hasEvidence) {
    return {
      text,
      status: "verified",
      publishable: true,
      reason: `Substantiated by evidence source "${input.evidenceSource}".`,
    };
  }

  if (hitEvidence || hitProhibited) {
    return {
      text,
      status: "inferred_pending",
      publishable: false,
      reason: `Health/financial/absolute claim ("${hitEvidence ?? hitProhibited}") requires an evidence source before publishing (ESTIMATE).`,
    };
  }

  if (input.substantiated === true) {
    return {
      text,
      status: "user_confirmed",
      publishable: true,
      reason: "Claim confirmed by the account owner; publishable pending spot-check.",
    };
  }

  return {
    text,
    status: "user_confirmed",
    publishable: true,
    reason: "Ordinary marketing statement with no regulated/absolute triggers.",
  };
}

export type CampaignReviewInput = {
  claims?: string[];
  category?: string;
  hasDisclosure?: boolean;
  aiGenerated?: boolean;
};

export type CampaignReview = {
  verdict: "approved" | "changes_required" | "blocked";
  claimResults: ClaimVerification[];
  restrictions: string[];
  requiredDisclosures: string[];
};

// Run a full campaign through claim + compliance review.
export function reviewCampaign(input: CampaignReviewInput): CampaignReview {
  const claims = Array.isArray(input.claims) ? input.claims : [];
  const claimResults = claims.map((c) => verifyClaim({ text: c }));

  const restrictions: string[] = [];
  const requiredDisclosures: string[] = [];

  const category = typeof input.category === "string" ? input.category.toLowerCase() : "";
  if ((REGULATED_CATEGORIES as readonly string[]).includes(category)) {
    restrictions.push(
      `Regulated category "${category}": age-gating, geo/platform ad-policy checks and mandatory legal review apply before launch.`,
    );
  }

  // Synthetic-content disclosure is mandatory for AI-generated creative.
  if (input.aiGenerated === true) {
    requiredDisclosures.push("AI-generated content disclosure (synthetic media label) is required on every asset.");
    if (input.hasDisclosure !== true) {
      restrictions.push("Missing AI-generated content disclosure — add a synthetic-media label before publishing.");
    }
  }

  const hasProhibited = claimResults.some((r) => r.status === "prohibited");
  const hasPending = claimResults.some((r) => r.status === "inferred_pending");
  const missingAiDisclosure = input.aiGenerated === true && input.hasDisclosure !== true;

  let verdict: CampaignReview["verdict"];
  if (hasProhibited) {
    verdict = "blocked";
  } else if (hasPending || missingAiDisclosure || restrictions.length > 0) {
    verdict = "changes_required";
  } else {
    verdict = "approved";
  }

  return { verdict, claimResults, restrictions, requiredDisclosures };
}

export type ProvenanceInput = { assetId: string; aiGenerated: boolean; creatorConsent?: boolean };

export type ProvenanceRecord = {
  assetId: string;
  aiDisclosure: boolean;
  label: string;
  consentRecorded: boolean;
  c2paCompatible: true;
};

// C2PA-style provenance record. AI assets ALWAYS carry a disclosure label.
export function provenanceMetadata(input: ProvenanceInput): ProvenanceRecord {
  const assetId = (input.assetId || `asset-${seed(input.assetId || "unknown")}`).trim();
  const aiDisclosure = input.aiGenerated === true;
  const label = aiDisclosure
    ? "AI-generated — synthetic media (C2PA disclosure attached)"
    : "Human-authored — no synthetic media";
  return {
    assetId,
    aiDisclosure,
    label,
    consentRecorded: input.creatorConsent === true,
    c2paCompatible: true,
  };
}

// Zero-config demo: a mix of safe and prohibited claims on an AI-made campaign.
export function demoCompliance(): CampaignReview {
  return reviewCampaign({
    claims: [
      "Fresh, locally sourced ingredients delivered to your door.",
      "The #1 best grill in London — guaranteed to be the cheapest.",
      "Clinically proven to boost your energy all day.",
      "Order on WhatsApp in under two minutes.",
    ],
    category: "health",
    hasDisclosure: false,
    aiGenerated: true,
  });
}
