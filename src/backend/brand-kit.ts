// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Brand Launch Kit — the eight documents a new brand needs on day one, done
// rather than described.
//
// Each one corresponds to a prompt a founder would otherwise paste into a chat
// window and re-answer the same twelve questions for. Here the brand's own
// stored details are the input, so the work is done once and every asset agrees
// with every other one.
//
// TWO RULES CARRIED OVER FROM THE REST OF THE PLATFORM, because they matter
// more here than anywhere else — these are documents a customer hands to a
// designer, prints on a card, or publishes under their own name:
//
//   FACTS ARE SUPPLIED, NEVER INVENTED. A brand guidelines sheet whose hex
//   codes were guessed is worse than no sheet: a freelancer will build to it.
//   A business card with a made-up phone number gets printed five hundred
//   times. So anything the platform does not actually hold is marked
//   [À FOURNIR] / [TO SUPPLY] in the customer's own language and never filled
//   in with something plausible.
//
//   CLAIMS ARE GUARDED. Every asset is scanned for invented statistics,
//   fabricated testimonials and absolute claims before it is returned, using
//   the same guard as the rest of the platform.
//
// Character limits are CHECKED, not requested. Asking a model to "keep it under
// 150 characters" and trusting the answer is how a bio gets rejected by
// Instagram at the moment the customer pastes it.

import { gatewayComplete } from "@/backend/gateway";
import { claimReport, type ClaimFinding } from "@/backend/claim-guard";

export type BrandKitAssetId =
  | "guidelines" | "signature" | "social-profiles" | "pitch"
  | "website-copy" | "moodboard" | "content-calendar" | "launch-post";

export type BrandFacts = {
  name: string;
  product?: string;
  audience?: string;
  location?: string;
  industry?: string;
  website?: string;
  offer?: string;
  goal?: string;
  /** Hex codes the customer actually set. Empty = we do not know them. */
  colours?: string[];
  logoUrl?: string;
  /** Free-text extras the customer typed for this run (fonts, phone, tagline…). */
  extras?: { label: string; value: string }[];
};

export type BrandKitAsset = {
  id: BrandKitAssetId;
  title: string;
  /** Markdown, in the customer's language. */
  content: string;
  /** Facts the asset needed and did not have. */
  needs: string[];
  blockers: ClaimFinding[];
  warnings: ClaimFinding[];
  /** Length checks that were actually measured, not requested. */
  limits: { label: string; used: number; max: number; ok: boolean }[];
  /** The provider ran out of output budget, so this document stops mid-thought. */
  truncated: boolean;
  note: string;
};

// The real limits, as the platforms enforce them. Wrong numbers here would be
// worse than no check — a customer would trust a bio that gets truncated.
export const SOCIAL_LIMITS: { label: string; max: number }[] = [
  { label: "Instagram", max: 150 },
  { label: "Threads", max: 500 },
  { label: "LinkedIn", max: 220 },
  { label: "X", max: 160 },
];

const SHARED_RULES = [
  "Write in the SAME LANGUAGE as the brand details you are given.",
  "State nothing about this business that is not in the BRAND FACTS. No invented certifications, customer numbers, years trading, awards, prices, phone numbers, addresses or email addresses.",
  "Where a section needs a detail you were not given, write [TO SUPPLY: <the detail>] on its own. Never substitute a plausible placeholder such as a fake phone number or a made-up hex code — those get printed, published or built to.",
  "Plain, concrete sentences. No filler, no superlatives you cannot evidence.",
  "Return markdown only. No preamble, no closing commentary.",
].join("\n");

type Spec = { title: string; system: string; maxTokens: number };

const SPECS: Record<BrandKitAssetId, Spec> = {
  guidelines: {
    title: "Brand guidelines — one page",
    maxTokens: 1800,
    system: [
      "You are a brand identity specialist. Produce a ONE-PAGE brand guidelines sheet a founder can hand straight to a freelance designer.",
      "Include, as headed sections: colour palette (each colour with its hex code and where to use it), typography (heading and body faces, with weights), logo rules (minimum size in px and mm, clear space expressed in multiples of a logo element), and exactly 3 DOs and 3 DON'Ts.",
      "Hex codes and typeface names must come from the BRAND FACTS. If they are absent, say so with [TO SUPPLY: …] — a designer WILL build to whatever hex code is on this sheet, so a guessed one becomes the brand.",
      SHARED_RULES,
    ].join("\n"),
  },
  signature: {
    title: "Email signature + business card",
    maxTokens: 1600,
    system: [
      "You are a brand collateral designer. Produce two things.",
      "1) An email signature: the exact text, line by line, with the font size in px and the line spacing for each line, and which line carries the accent colour.",
      "2) A business card: front and back, described as a layout — what sits where, at what point size, with what margins in mm on a standard 85×55mm card.",
      "Minimal and premium: few elements, generous space, one accent.",
      "Every contact detail must come from the BRAND FACTS. A made-up phone number or email gets printed five hundred times — mark it [TO SUPPLY: …] instead.",
      SHARED_RULES,
    ].join("\n"),
  },
  "social-profiles": {
    title: "Social profile kit",
    maxTokens: 1400,
    system: [
      "You are a social brand designer. Produce a complete profile kit.",
      "Write one bio for each of: Instagram, Threads, LinkedIn, X. Put each bio on its own line under a heading naming the platform, and NOTHING else on that line, so the length can be measured.",
      "Instagram must be ≤150 characters, LinkedIn ≤220, X ≤160, Threads ≤500. Count characters, not words, and stay comfortably inside the limit.",
      "Then: a profile-picture concept (one paragraph) and a banner/header concept (one paragraph), both consistent with the brand's colours and tone.",
      SHARED_RULES,
    ].join("\n"),
  },
  pitch: {
    title: "Spoken pitch — 30s and 10s",
    maxTokens: 1200,
    system: [
      "You are a brand communication coach. Write a 30-second spoken pitch for a networking event or sales call, and a 10-second version for quick introductions.",
      "Both must sound like a person TALKING. Contractions, short sentences, one idea per breath. If it reads like a website headline it is wrong.",
      "Give the approximate spoken word count for each, so the length can be checked against the time.",
      SHARED_RULES,
    ].join("\n"),
  },
  "website-copy": {
    title: "Website copy — 4 pages",
    maxTokens: 3200,
    system: [
      "You are a web copywriter. Write a complete first draft for four pages: Home, About, Services/Offer, Contact.",
      "Each page: a working headline, a subheadline, the body sections with their own subheadings, and one clear call to action.",
      "Concise and conversion-oriented. Clarity over style — the founder will polish the voice, they should not have to unpick the meaning.",
      SHARED_RULES,
    ].join("\n"),
  },
  moodboard: {
    title: "Visual moodboard brief",
    maxTokens: 1400,
    system: [
      "You are an art director. Write a moodboard brief describing this brand's visual world.",
      "Include: 5 descriptive keywords, the reference imagery style (minimal, bold, organic, editorial…), the lighting and photographic tone, and one sentence describing what a visitor should FEEL in the first three seconds on the site.",
      "Concrete enough to shoot or source against — 'warm low side-light, deep shadows' rather than 'nice lighting'.",
      SHARED_RULES,
    ].join("\n"),
  },
  "content-calendar": {
    title: "Launch week — 7-day content calendar",
    maxTokens: 1600,
    system: [
      "You are a content strategist. Build a 7-day calendar to launch this brand's new identity on social media.",
      "Mix announcement posts, behind-the-scenes, and value posts. One line per day: Day N — topic — format (text, carousel, or single image).",
      "Use a markdown table with columns Day / Topic / Format. Nothing else.",
      SHARED_RULES,
    ].join("\n"),
  },
  "launch-post": {
    title: "Launch announcement post",
    maxTokens: 1400,
    system: [
      "You are a launch copywriter. Write a brand launch announcement post for LinkedIn or Threads.",
      "Structure: an opening line that stops the scroll, a short honest story about why this brand was built, and one clear next step for the reader.",
      "Authentic, not promotional. No hashtag walls, no 'thrilled to announce', no invented milestones.",
      SHARED_RULES,
    ].join("\n"),
  },
};

export const ASSET_IDS = Object.keys(SPECS) as BrandKitAssetId[];

function factsBlock(f: BrandFacts): string {
  const lines: string[] = [`Brand name: ${f.name}`];
  const add = (label: string, v?: string) => { if ((v || "").trim()) lines.push(`${label}: ${v!.trim()}`); };
  add("What they sell", f.product);
  add("Who it is for", f.audience);
  add("Where they operate", f.location);
  add("Industry", f.industry);
  add("Website", f.website);
  add("Current offer", f.offer);
  add("Current objective", f.goal);
  const colours = (f.colours || []).filter((c) => /^#?[0-9a-f]{3,8}$/i.test(c.trim()));
  if (colours.length) lines.push(`Brand colours (hex, USE THESE EXACTLY): ${colours.map((c) => (c.startsWith("#") ? c : `#${c}`)).join(", ")}`);
  if (f.logoUrl) lines.push("A logo exists and is hosted; refer to it as 'the logo' rather than describing one.");
  for (const e of f.extras || []) if (e.value.trim()) lines.push(`${e.label}: ${e.value.trim()}`);
  return lines.join("\n");
}

/** What the asset asked for and did not get. Read from the output, not guessed. */
export function findNeeds(markdown: string): string[] {
  const out = new Set<string>();
  // Both spellings: the model writes in the customer's language, and the French
  // instruction produces "[À FOURNIR: …]".
  const re = /\[(?:TO SUPPLY|À FOURNIR|A FOURNIR)\s*:?\s*([^\]]{0,120})\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown || ""))) out.add(m[1].trim() || "unspecified detail");
  return [...out].slice(0, 12);
}

/**
 * Measure the bios against the real platform limits.
 *
 * Measured, not requested. A model told to "keep it under 150 characters" will
 * cheerfully return 180, and the customer discovers it when Instagram rejects
 * the paste. The bio line is the first non-empty line under the platform's
 * heading, which is why the prompt insists on one bio per line.
 */
export function measureBios(markdown: string): { label: string; used: number; max: number; ok: boolean }[] {
  const lines = (markdown || "").split("\n");
  const out: { label: string; used: number; max: number; ok: boolean }[] = [];
  for (const { label, max } of SOCIAL_LIMITS) {
    const at = lines.findIndex((l) => new RegExp(`^#{0,6}\\s*\\*{0,2}${label}\\b`, "i").test(l.trim()));
    if (at === -1) continue;
    const bio = lines.slice(at + 1).find((l) => l.trim() && !/^#{1,6}\s/.test(l.trim()));
    if (!bio) continue;
    const used = bio.replace(/^[-*>\s]+/, "").replace(/\*\*/g, "").trim().length;
    out.push({ label, used, max, ok: used <= max });
  }
  return out;
}

export async function buildAsset(
  id: BrandKitAssetId,
  facts: BrandFacts,
  deps: { complete?: typeof gatewayComplete } = {},
  opts: { lang?: string } = {},
): Promise<BrandKitAsset> {
  const spec = SPECS[id];
  if (!spec) throw new Error(`Unknown brand kit asset "${id}".`);
  const complete = deps.complete ?? gatewayComplete;

  const supplied = factsBlock(facts);
  const res = await complete({
    system: spec.system,
    prompt: `BRAND FACTS (the only things you may state about this business):\n${supplied}`,
    maxTokens: spec.maxTokens,
    lang: opts.lang,
  });

  const content = (res.text || "").trim();
  // Truncation is reported, never hidden. A live run handed a customer a
  // seven-day calendar containing one row and a moodboard brief that stopped at
  // a heading, both presented as finished documents. Half a deliverable passed
  // off as a whole one is the same class of dishonesty as an invented statistic.
  const truncated = Boolean(res.truncated);
  const report = claimReport(content, supplied);
  // Same escalation as the citation page: these are documents that get printed,
  // published, or built to by a third party. An unbacked figure is not a note
  // to check later.
  const escalate = (f: ClaimFinding) => f.kind === "statistic" || f.kind === "testimonial";
  const blockers = report.findings.filter((f) => f.severity === "block" || escalate(f));
  const warnings = report.findings.filter((f) => f.severity !== "block" && !escalate(f));

  const needs = findNeeds(content);
  const limits = id === "social-profiles" ? measureBios(content) : [];
  const over = limits.filter((l) => !l.ok);

  return {
    id, title: spec.title, content, needs, blockers, warnings, limits, truncated,
    note: [
      truncated
        ? "THIS DOCUMENT IS INCOMPLETE — the model ran out of output budget and stopped mid-thought. Build this one on its own to give it the whole budget."
        : "",
      blockers.length
        ? `${blockers.length} claim(s) here are not backed by anything you supplied. Cut them or provide the evidence — this is a document you hand to someone else.`
        : "No unsupported claims found.",
      needs.length
        ? `${needs.length} detail(s) are marked as needing your input. They were left blank deliberately: a guessed hex code becomes your brand the moment a designer builds to it, and a guessed phone number gets printed.`
        : "",
      over.length
        ? `Over the limit: ${over.map((l) => `${l.label} ${l.used}/${l.max}`).join(", ")}. Shorten before posting — these were measured, not assumed.`
        : limits.length ? "Every bio is inside its platform's character limit (measured, not assumed)." : "",
    ].filter(Boolean).join(" "),
  };
}
