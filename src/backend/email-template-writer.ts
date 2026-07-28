// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The AI writer behind the Email Template editor.
//
// The template editor shipped with a sparkle button that only ran string
// concatenation — it looked like AI and wrote nothing. Everything on that page
// was typed by hand, which is why a customer ends up sending
//
//     "Dear {{ firstName }} {{ name }} there are 1000s of leads waiting for
//      {{ company }} to get more work"
//
// — a sentence that renders as "Dear Marie Marie Jolaine…" for every recipient,
// with an unsupported "1000s" claim attached to it.
//
// This module writes the template properly. Three things make it safe:
//
//   GROUNDED   The model gets the brand's own facts and is told it may add no
//              others. Output goes through claim-guard; a fabricated statistic
//              or testimonial is rejected, not shipped.
//   TOKEN-SAFE A merge token the send-time engine does not know renders as an
//              EMPTY STRING to every recipient. So every token the model emits
//              is checked against MERGE_VARS: known aliases are rewritten,
//              unknown ones are removed, and a token with no fallback gets one.
//              This is the difference between a template that looks fine in the
//              editor and one that survives contact with a real list.
//   STRUCTURED It returns the editor's OWN fields (heading, body, CTA label,
//              CTA link, subject, template name), so the draft lands in the
//              Design tab and the customer edits it — rather than a blob of
//              prose they then have to take apart.

import { gatewayComplete, GatewayUnconfiguredError } from "@/backend/gateway";
import { claimReport } from "@/backend/claim-guard";
import { MERGE_VARS } from "@/backend/email-templates";

export type EmailPurposeId =
  | "win_back" | "new_offer" | "welcome" | "follow_up"
  | "announcement" | "review_request" | "referral_ask" | "reminder";

export type EmailPurpose = {
  id: EmailPurposeId;
  label: string;
  /** What this email has to achieve — given to the model as the job, not as a style note. */
  brief: string;
  /** A material requirement. Missing it does not block, but the writer is told to work around it. */
  needs?: "offer";
  /** Suggested template name, so the customer is not asked to invent one. */
  nameHint: string;
};

export const EMAIL_PURPOSES: EmailPurpose[] = [
  { id: "win_back", label: "Win back a quiet customer", nameHint: "Win-back",
    brief: "They bought before and have gone quiet. Acknowledge the gap without guilt-tripping, remind them what they got last time, and give one easy way back in." },
  { id: "new_offer", label: "Announce an offer", nameHint: "Offer announcement", needs: "offer",
    brief: "State the offer plainly in the first line — what it is, who it is for, and what they do next. The offer is the message; everything else supports it." },
  { id: "welcome", label: "Welcome a new customer", nameHint: "Welcome",
    brief: "Thank them, set expectations for what happens next, and give them one useful thing to do now. No selling in this one." },
  { id: "follow_up", label: "Follow up an enquiry", nameHint: "Enquiry follow-up",
    brief: "They asked and did not book. Remove the thing that is probably stopping them — price, timing, or not knowing what happens next — and make replying trivial." },
  { id: "announcement", label: "Announce something new", nameHint: "Announcement",
    brief: "Lead with what changed and why it matters to them. Do not open with 'we are excited to announce'." },
  { id: "review_request", label: "Ask for a review", nameHint: "Review request",
    brief: "Ask for a review from someone who has already bought. Short, specific, one link, no incentive offered unless one was supplied." },
  { id: "referral_ask", label: "Ask for a referral", nameHint: "Referral ask",
    brief: "Ask a happy customer to pass your name on. Name who you would like to be introduced to, so the ask is easy to act on." },
  { id: "reminder", label: "Appointment / deadline reminder", nameHint: "Reminder",
    brief: "Remind them of a booking or a date. Facts first: what, when, where, and what to do if it needs changing." },
];

export type TemplateBrief = {
  business: string;
  product?: string;
  audience?: string;
  location?: string;
  offer?: string;
  website?: string;
  purpose?: EmailPurposeId;
  /** The customer's own instruction — the single most useful input on the page. */
  notes?: string;
  tone?: string;
  lang?: string;
};

export type TemplateDraft = {
  name: string;
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
};

export type TemplateWriteResult = {
  ok: boolean;
  draft: TemplateDraft;
  written: "ai" | "template";
  provider?: string;
  /** Merge tokens that survived into the final draft. */
  tokensUsed: string[];
  /** Claims that were rejected outright — the draft is not returned when this is non-empty. */
  blocked: string[];
  warnings: string[];
  note: string;
};

// ---------------------------------------------------------------------------
// Merge-token safety. This is the part that decides whether a template works on
// a real list or quietly ships blanks to a thousand people.
// ---------------------------------------------------------------------------

const KNOWN = new Map(MERGE_VARS.map((v) => [v.token.toLowerCase(), v.token]));

// Names a model reaches for that mean a token we DO have. Rewriting these is
// strictly better than deleting them — the intent was right, the spelling was not.
export const TOKEN_ALIASES: Record<string, string> = {
  first_name: "firstName", firstname: "firstName", fname: "firstName", forename: "firstName",
  full_name: "name", fullname: "name", customer: "name", customer_name: "name", contact: "name",
  company_name: "company", business: "brand", business_name: "brand", brand_name: "brand",
  sender: "brand", your_business: "brand", organisation: "company", organization: "company",
  city: "town", location: "town", region: "area", county: "area",
  sector: "trade", industry: "trade", profession: "trade",
  email_address: "email",
};

// A token with no fallback renders as nothing when the contact's field is
// blank — "Hi ," or "for  to get more work". Every token that can plausibly be
// missing gets a default fallback so the sentence still reads.
const DEFAULT_FALLBACK: Record<string, string> = {
  firstName: "there",
  name: "there",
  company: "your business",
  trade: "your trade",
  town: "your area",
  area: "your area",
};

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

export type TokenFix = {
  text: string;
  used: string[];
  rewritten: { from: string; to: string }[];
  removed: string[];
  fallbacksAdded: string[];
};

/**
 * Canonicalise every merge token in a piece of text:
 *   known token      → kept, with a fallback added if it had none
 *   known alias      → rewritten to the real token
 *   anything else    → removed (replaced by its fallback, or nothing)
 */
export function fixTokens(text: string): TokenFix {
  const used = new Set<string>();
  const rewritten: { from: string; to: string }[] = [];
  const removed: string[] = [];
  const fallbacksAdded = new Set<string>();

  const out = (text || "").replace(TOKEN_RE, (_m, rawKey: string, fallback?: string) => {
    const key = rawKey.toLowerCase();
    let token = KNOWN.get(key);
    if (!token) {
      const aliasTarget = TOKEN_ALIASES[key];
      const alias = aliasTarget && KNOWN.get(aliasTarget.toLowerCase());
      if (alias) {
        token = alias;
        rewritten.push({ from: rawKey, to: alias });
      }
    }
    if (!token) {
      // Unknown token: the send engine would merge it to empty for EVERY
      // recipient. Keep the fallback text if the model supplied one, otherwise
      // drop it entirely — a visible gap is better than an invisible one.
      removed.push(rawKey);
      return (fallback ?? "").trim();
    }
    used.add(token);
    const fb = (fallback ?? "").trim() || DEFAULT_FALLBACK[token];
    if (!fallback?.trim() && fb) fallbacksAdded.add(token);
    return fb ? `{{ ${token} | ${fb} }}` : `{{ ${token} }}`;
  });

  return {
    // Collapse the double spaces a removed token leaves behind.
    text: out.replace(/[ \t]{2,}/g, " ").replace(/ +([,.!?;:])/g, "$1"),
    used: [...used],
    rewritten,
    removed,
    fallbacksAdded: [...fallbacksAdded],
  };
}

/** Problems that are legal but produce a bad email on a real list. */
export function tokenWarnings(text: string): string[] {
  const warnings: string[] = [];
  const t = text || "";

  // "Dear {{ firstName }} {{ name }}" → "Dear Marie Marie Jolaine".
  if (/\{\{\s*firstName[^}]*\}\}[\s,]*\{\{\s*name[^}]*\}\}/i.test(t) ||
      /\{\{\s*name[^}]*\}\}[\s,]*\{\{\s*firstName[^}]*\}\}/i.test(t)) {
    warnings.push("First name and full name are used next to each other — every recipient sees their name twice. Keep one.");
  }

  const counts = new Map<string, number>();
  for (const m of t.matchAll(TOKEN_RE)) {
    const k = (KNOWN.get(m[1].toLowerCase()) || m[1]);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const [token, n] of counts) {
    if (n >= 4) warnings.push(`{{ ${token} }} appears ${n} times — repeated personalisation reads as automated, not personal.`);
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// The writer
// ---------------------------------------------------------------------------

function systemPrompt(purpose: EmailPurpose): string {
  return [
    "You write short commercial emails for small businesses. British English. Plain, specific, no hype.",
    "",
    `THE JOB: ${purpose.label}. ${purpose.brief}`,
    "",
    "ABSOLUTE RULES:",
    "1. Use ONLY the facts supplied below. Never invent a statistic, a number of customers, a price, an award, a rating, a testimonial, a client name or a capability. If a detail is missing, write around it.",
    "2. No superlatives you cannot prove — no 'best', 'leading', 'number one', 'award-winning', 'trusted by thousands'.",
    "3. No invented urgency. Only mention a deadline if one is given.",
    "4. No filler: 'we are excited to announce', 'take it to the next level', 'game-changing', 'unlock your potential', 'in today's fast-paced world'.",
    "5. 80–160 words in the body. Short paragraphs. Mobile-first — the first line must earn the second.",
    "6. Subject line under 60 characters, specific, no clickbait, no emoji, no ALL CAPS.",
    "",
    "PERSONALISATION — this is a reusable template sent to many people. You may use ONLY these merge tokens, written exactly like this:",
    ...MERGE_VARS.map((v) => `  {{ ${v.token} }}   — ${v.label}`),
    "Write a fallback for any token that could be blank, like {{ firstName | there }}.",
    "Never invent a token that is not on that list. Never use square brackets, [Name], or any other placeholder style.",
    "Do NOT write a greeting line — the template already opens with 'Hi {{ firstName | there }},'. Start at the first real sentence.",
    "",
    "Reply with JSON ONLY — no markdown fence, no commentary — matching exactly:",
    "{",
    '  "name": "a short internal name for this template, 2-4 words",',
    '  "subject": "the subject line",',
    '  "heading": "one short line shown above the message, or an empty string if the email reads better without one",',
    '  "body": "the email body. Use a blank line between paragraphs.",',
    '  "ctaLabel": "the button text, 2-5 words, an action",',
    '  "ctaUrl": "the link for the button, or an empty string if none was supplied"',
    "}",
  ].join("\n");
}

function briefText(b: TemplateBrief, purpose: EmailPurpose): string {
  const lines = [
    `Business: ${b.business}`,
    b.product ? `What they sell: ${b.product}` : "",
    b.audience ? `Who they sell to: ${b.audience}` : "",
    b.location ? `Where they operate: ${b.location}` : "",
    b.offer ? `Current offer: ${b.offer}` : "",
    b.website ? `Their link for the button: ${b.website}` : "",
    b.tone ? `Tone: ${b.tone}` : "Tone: direct, warm, no hype",
  ].filter(Boolean);
  if (purpose.needs === "offer" && !b.offer?.trim()) {
    lines.push("No offer was supplied — do NOT invent one. Write the email around what they sell and invite a reply instead.");
  }
  if (b.notes?.trim()) {
    lines.push("", "What this specific email must say (the business owner's own words — follow it):", b.notes.trim());
  }
  lines.push("", "If a detail is missing, write around it rather than inventing it. No bracketed placeholders.");
  return lines.join("\n");
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" && v.trim() ? v.trim() : fallback);

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = (text || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>; }
  catch { return null; }
}

// Only a real absolute link ships. The model sometimes echoes an instruction
// ("the website link") or invents a path on a domain it was never given, and a
// button pointing at nothing is worse than no button — it burns the one click
// the email was written to earn. When what it returned is not a link, fall back
// to the brand's OWN website rather than to nothing.
function normaliseUrl(raw: string, website?: string): string {
  for (const candidate of [raw, website || ""]) {
    const pick = candidate.trim();
    if (!pick) continue;
    if (/^https?:\/\/\S+\.\S+/i.test(pick)) return pick;
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(pick)) return `https://${pick}`;
  }
  return "";
}

/** The honest zero-config draft: structural, obviously a starting point, never pretending to be written. */
export function templateFallback(b: TemplateBrief, purpose: EmailPurpose): TemplateDraft {
  const what = b.product?.trim() || "what we do";
  return {
    name: purpose.nameHint,
    subject: b.offer?.trim() ? b.offer.trim().slice(0, 60) : `A quick note from ${b.business}`,
    heading: "",
    body: [
      `${purpose.brief}`,
      "",
      `Write the message here — this is a structural outline, not written copy. Cover: what you are offering ${b.audience?.trim() ? `${b.audience.trim()}` : "your customer"}, why it matters to them, and the one thing you want them to do next.`,
      "",
      `About ${b.business}: ${what}.`,
    ].join("\n"),
    ctaLabel: "Get in touch",
    ctaUrl: normaliseUrl("", b.website),
  };
}

// The gateway call is injectable so the repair-and-guard pipeline can be tested
// against a model reply without a provider key. Feature code always uses the
// default; only tests pass their own.
export type CompleteFn = typeof gatewayComplete;

export async function writeEmailTemplate(
  brief: TemplateBrief,
  deps: { complete?: CompleteFn } = {},
): Promise<TemplateWriteResult> {
  const complete = deps.complete ?? gatewayComplete;
  const purpose = EMAIL_PURPOSES.find((p) => p.id === brief.purpose) || EMAIL_PURPOSES[0];
  const fallback = templateFallback(brief, purpose);

  if (!brief.business?.trim()) {
    return {
      ok: false, draft: fallback, written: "template", tokensUsed: [], blocked: [], warnings: [],
      note: "Pick a brand first — the email is written from that brand's own details, and there is nothing honest to say without them.",
    };
  }

  let raw = "";
  let provider: string | undefined;
  try {
    const res = await complete({
      system: systemPrompt(purpose),
      prompt: briefText(brief, purpose),
      maxTokens: 900,
      lang: brief.lang,
    });
    raw = res.text;
    provider = res.provider;
  } catch (e) {
    const unconfigured = e instanceof GatewayUnconfiguredError;
    return {
      ok: false,
      draft: fallback,
      written: "template",
      tokensUsed: [],
      blocked: [],
      warnings: unconfigured ? [] : [e instanceof Error ? e.message : "The writer could not be reached."],
      note: unconfigured
        ? "No AI provider is connected, so this is an outline rather than written copy. Connect an AI key and this button writes the email from your brand's details."
        : "The writer failed, so an outline was returned instead. Nothing was charged for copy that was not produced.",
    };
  }

  const parsed = extractJson(raw);
  if (!parsed) {
    return {
      ok: false, draft: fallback, written: "template", tokensUsed: [], blocked: [],
      warnings: ["The model did not return usable JSON."],
      note: "Fell back to an outline because the reply could not be read. Try again.",
    };
  }

  const bodyFix = fixTokens(str(parsed.body, fallback.body));
  const subjectFix = fixTokens(str(parsed.subject, fallback.subject));
  const headingFix = fixTokens(str(parsed.heading));

  const draft: TemplateDraft = {
    name: str(parsed.name, purpose.nameHint).slice(0, 60),
    subject: subjectFix.text.slice(0, 140),
    heading: headingFix.text.slice(0, 120),
    body: bodyFix.text,
    ctaLabel: str(parsed.ctaLabel, "Get in touch").slice(0, 40),
    ctaUrl: normaliseUrl(str(parsed.ctaUrl), brief.website),
  };

  const warnings: string[] = [];
  const removed = [...new Set([...bodyFix.removed, ...subjectFix.removed, ...headingFix.removed])];
  const rewritten = [...bodyFix.rewritten, ...subjectFix.rewritten, ...headingFix.rewritten];
  if (rewritten.length) {
    warnings.push(`Corrected ${rewritten.length} merge tag(s) the writer got wrong: ${[...new Set(rewritten.map((r) => `{{ ${r.from} }} → {{ ${r.to} }}`))].join(", ")}.`);
  }
  if (removed.length) {
    warnings.push(`Removed ${removed.length} merge tag(s) this platform cannot fill (${[...new Set(removed)].join(", ")}) — left in, they would have sent blanks to every recipient.`);
  }
  warnings.push(...tokenWarnings([draft.subject, draft.heading, draft.body].join("\n")));

  // Claim-guard the whole draft against the facts the customer actually gave.
  const everything = [draft.subject, draft.heading, draft.body, draft.ctaLabel].filter(Boolean).join("\n");
  const supplied = [brief.business, brief.product, brief.audience, brief.location, brief.offer, brief.notes].filter(Boolean).join("\n");
  const report = claimReport(everything, supplied);
  const blocked = report.findings.filter((f) => f.severity === "block").map((f) => f.excerpt || f.reason);
  warnings.push(...report.findings.filter((f) => f.severity !== "block").map((f) => f.reason));

  if (blocked.length) {
    return {
      ok: false, draft: fallback, written: "template", tokensUsed: [], blocked, warnings,
      note: `Rejected: the draft contained ${blocked.length} claim(s) about your business that cannot be substantiated. Nothing invented is ever put in front of your customers — write it yourself, or add the real figures to the brief and try again.`,
    };
  }

  const tokensUsed = [...new Set([...bodyFix.used, ...subjectFix.used, ...headingFix.used])];
  return {
    ok: true,
    draft,
    written: "ai",
    provider,
    tokensUsed,
    blocked: [],
    warnings,
    note: `Written for ${brief.business} from the details you supplied, personalisation checked against the ${MERGE_VARS.length} merge tags this platform can actually fill. Edit anything before you save it.`,
  };
}
