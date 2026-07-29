// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The brand's memory.
//
// The Launch Kit writes eight documents. On its own that is a chat window with
// better manners: used once, never returned to. What makes it infrastructure is
// this file — the structured parts are distilled out and KEPT, so every other
// engine in the OS reads the same answer instead of inventing its own.
//
// Three jobs live here:
//
//   DISTIL   — pull colours, fonts, tagline, positioning, tone, bios and pitch
//              out of the generated documents and store them, each labelled
//              with where it came from.
//   FIDELITY — compare what the brand says about itself with what the
//              assistants actually said in a visibility run. Both halves of
//              that comparison already exist in this platform and nowhere else.
//   CONSISTENCY — check anything the OS produces against the stored identity.
//              A guidelines document's value is not the document, it is whether
//              the emails still match it six months later.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import type { BrandIdentity, IdentityValue, SocialBio, IdentitySource } from "@/shared/brand-identity";
import { identityBrief } from "@/shared/brand-identity";
import { SOCIAL_LIMITS } from "@/backend/brand-kit";
import type { VisibilityRun } from "@/backend/ai-visibility";
import { classifyIntent } from "@/backend/ai-visibility";

export { identityBrief };
export type { BrandIdentity };

const COLLECTION = "brand_identities";
const mem = new Map<string, BrandIdentity>();
const nowIso = () => new Date().toISOString();

const val = <T,>(value: T, source: IdentitySource): IdentityValue<T> => ({ value, source });

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export async function getIdentity(brandId: string): Promise<BrandIdentity | null> {
  const id = (brandId || "").trim();
  if (!id) return null;
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as BrandIdentity) : null;
  }
  return mem.get(id) ?? null;
}

/**
 * Merge, never replace.
 *
 * A value the customer typed outranks one a model proposed, so a later kit
 * rebuild must not quietly overwrite a confirmed colour with a generated one.
 */
export async function saveIdentity(brandId: string, patch: Partial<BrandIdentity>): Promise<BrandIdentity> {
  const cur = (await getIdentity(brandId)) ?? { brandId, updatedAt: nowIso() };
  const next: BrandIdentity = { ...cur, brandId, updatedAt: nowIso() };

  for (const [k, v] of Object.entries(patch)) {
    if (k === "brandId" || k === "updatedAt" || v === undefined) continue;
    if (k === "sourceAssets") {
      next.sourceAssets = [...new Set([...(cur.sourceAssets || []), ...((v as string[]) || [])])];
      continue;
    }
    const incoming = v as IdentityValue<unknown>;
    const existing = (cur as unknown as Record<string, IdentityValue<unknown> | undefined>)[k];
    // Confirmed beats supplied beats generated. Rebuilding the kit must never
    // silently undo a colour the customer went and fixed by hand.
    const rank = (s?: IdentitySource) => (s === "supplied" ? 3 : s === "measured" ? 2 : 1);
    if (existing && rank(existing.source) > rank(incoming?.source)) continue;
    (next as unknown as Record<string, unknown>)[k] = incoming;
  }

  if (adminConfigured && adminDb) await adminDb.collection(COLLECTION).doc(brandId).set(next, { merge: true });
  else mem.set(brandId, next);
  return next;
}

// ---------------------------------------------------------------------------
// Distil — read the structure back out of the documents
// ---------------------------------------------------------------------------

const HEX = /#[0-9a-f]{6}\b/gi;

/** Hex codes actually written in the document, in order, deduplicated. */
export function extractHexes(markdown: string): string[] {
  const found = (markdown || "").match(HEX) || [];
  return [...new Set(found.map((h) => h.toLowerCase()))].slice(0, 8);
}

/** "Heading: Space Grotesk" / "Police de titre : Inter" — both languages, because the kit writes in the customer's. */
export function extractFonts(markdown: string): { heading?: string; body?: string } {
  const pick = (labels: string[]) => {
    for (const l of labels) {
      const re = new RegExp(`${l}[^:\\n]{0,24}:\\s*\\**([A-Za-z][A-Za-z0-9 '._-]{1,40})`, "i");
      const m = re.exec(markdown || "");
      if (m) return m[1].trim().replace(/\*+$/, "").trim();
    }
    return undefined;
  };
  return {
    heading: pick(["heading", "headline", "titre", "titres", "display"]),
    body: pick(["body", "corps", "texte courant", "paragraph"]),
  };
}

/**
 * The bios, measured against the real limits.
 *
 * Reuses the same limit table the kit checks against, so the stored record and
 * the document can never disagree about whether a bio fits.
 */
export function extractBios(markdown: string): SocialBio[] {
  const lines = (markdown || "").split("\n");
  const out: SocialBio[] = [];
  for (const { label, max } of SOCIAL_LIMITS) {
    const at = lines.findIndex((l) => new RegExp(`^#{0,6}\\s*\\*{0,2}${label}\\b`, "i").test(l.trim()));
    if (at === -1) continue;
    const raw = lines.slice(at + 1).find((l) => l.trim() && !/^#{1,6}\s/.test(l.trim()));
    if (!raw) continue;
    const text = raw.replace(/^[-*>\s]+/, "").replace(/\*\*/g, "").trim();
    out.push({ platform: label, text, chars: text.length, limit: max, withinLimit: text.length <= max });
  }
  return out;
}

/** The first substantial sentence — what the brand says it is. */
export function firstSentence(markdown: string, minLen = 30): string | undefined {
  for (const line of (markdown || "").split("\n")) {
    const t = line.trim().replace(/^[#>*\-\s]+/, "").replace(/\*\*/g, "").trim();
    if (t.length < minLen || t.startsWith("[")) continue;
    const stop = t.search(/[.!?](\s|$)/);
    return (stop === -1 ? t : t.slice(0, stop + 1)).slice(0, 300);
  }
  return undefined;
}

/** Words a moodboard brief lists as its keywords. */
export function extractKeywords(markdown: string): string[] {
  const m = /(?:keywords?|mots[- ]cl[ée]s?)[^:\n]{0,20}:\s*([^\n]{3,160})/i.exec(markdown || "");
  const line = m?.[1] ?? "";
  return line
    .split(/[,;•|]/)
    .map((w) => w.replace(/[*_"'.]/g, "").trim().toLowerCase())
    .filter((w) => w.length >= 3 && w.length <= 28)
    .slice(0, 8);
}

export type KitAssetLike = { id: string; content: string };

/**
 * Turn a built kit into an identity record.
 *
 * Everything read out of a generated document is marked `generated` — a
 * proposal, not a fact about the business. Measured values (a palette counted
 * from the logo) and supplied values (what the customer typed) are passed in
 * separately and outrank it.
 */
export function distilIdentity(
  brandId: string,
  assets: KitAssetLike[],
  extra: { measuredColours?: string[]; measuredAccent?: string; suppliedFonts?: { heading?: string; body?: string }; suppliedTagline?: string } = {},
): Partial<BrandIdentity> {
  const by = (id: string) => assets.find((a) => a.id === id)?.content || "";
  const guidelines = by("guidelines");
  const patch: Partial<BrandIdentity> = { sourceAssets: assets.map((a) => a.id) };

  // Colours: measured beats written-in-a-document, always.
  if (extra.measuredColours?.length) {
    patch.colours = val(extra.measuredColours, "measured");
    if (extra.measuredAccent) patch.accent = val(extra.measuredAccent, "measured");
  } else {
    const hexes = extractHexes(guidelines);
    if (hexes.length) {
      patch.colours = val(hexes, "generated");
      patch.accent = val(hexes[0], "generated");
    }
  }

  if (extra.suppliedFonts?.heading || extra.suppliedFonts?.body) {
    patch.fonts = val(extra.suppliedFonts, "supplied");
  } else {
    const fonts = extractFonts(guidelines);
    if (fonts.heading || fonts.body) patch.fonts = val(fonts, "generated");
  }

  if (extra.suppliedTagline) patch.tagline = val(extra.suppliedTagline, "supplied");

  const bios = extractBios(by("social-profiles"));
  if (bios.length) patch.bios = val(bios, "generated");

  const pitchDoc = by("pitch");
  if (pitchDoc.trim()) {
    const lines = pitchDoc.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p && !p.startsWith("#"));
    patch.pitch = val({ long: lines[0]?.slice(0, 900), short: lines[1]?.slice(0, 400) }, "generated");
  }

  const positioning = firstSentence(by("website-copy")) || firstSentence(by("launch-post")) || firstSentence(pitchDoc);
  if (positioning) patch.positioning = val(positioning, "generated");

  const keywords = extractKeywords(by("moodboard"));
  if (keywords.length) {
    patch.moodboardKeywords = val(keywords, "generated");
    patch.toneWords = val(keywords.slice(0, 5), "generated");
  }

  return patch;
}

// ---------------------------------------------------------------------------
// Fidelity — what you say you are vs what the assistants say you are
// ---------------------------------------------------------------------------

export type FidelityReport = {
  scored: boolean;
  /** Share of the brand's own positioning words the assistants actually used. */
  overlap: number;
  yourWords: string[];
  theirWords: string[];
  missing: string[];
  /** Words the assistants used about you that your positioning never claims. */
  invented: string[];
  note: string;
};

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "your", "you", "our", "are", "was", "have", "has",
  "from", "into", "they", "them", "their", "its", "it's", "a", "an", "of", "to", "in", "on", "is",
  "be", "by", "as", "at", "or", "we", "us", "not", "can", "will", "more", "most", "who", "what",
  "which", "when", "how", "than", "then", "also", "but", "one", "all", "any", "some", "such",
  "company", "business", "platform", "solution", "service", "services", "provider", "providers",
]);

function contentWords(text: string): string[] {
  return [...new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  )];
}

/**
 * Does the assistants' description of you match your own?
 *
 * The moat, and the reason it can be computed honestly here and nowhere else:
 * this platform holds BOTH halves — what the brand says about itself (the
 * identity record) and what the models said about it (a recorded visibility
 * run, with the raw answers kept).
 *
 * Only the BRAND-NAME question is used. That is the one where an assistant was
 * asked to describe this specific business, so its answer is a description to
 * compare against. A buying answer that never mentions the brand says nothing
 * about how the brand is understood.
 *
 * The number is a word overlap, and it is called that. It is not a semantic
 * judgement and must not be dressed up as one.
 */
export function brandFidelity(identity: BrandIdentity | null, run: VisibilityRun | null): FidelityReport {
  const positioning = identity?.positioning?.value || identity?.tagline?.value || "";
  if (!positioning || !run) {
    return {
      scored: false, overlap: 0, yourWords: [], theirWords: [], missing: [], invented: [],
      note: !positioning
        ? "No positioning statement is stored yet, so there is nothing to compare the assistants' description against. Build the Launch Kit first."
        : "No visibility run is recorded yet, so nothing has been asked of the assistants.",
    };
  }

  const described = run.results
    .filter((r) => classifyIntent(r.question.text, run.brand) === "brand")
    .flatMap((r) => r.verdicts.filter((v) => v.asked && v.mentioned).map((v) => v.answer))
    .join("\n");

  if (!described.trim()) {
    return {
      scored: false, overlap: 0, yourWords: [], theirWords: [], missing: [], invented: [],
      note: "No assistant described this brand in the latest run, so there is no description to compare. That is itself the finding: they cannot repeat a positioning they do not have.",
    };
  }

  const yours = contentWords(positioning);
  const theirs = contentWords(described);
  const theirSet = new Set(theirs);
  const matched = yours.filter((w) => theirSet.has(w));
  const missing = yours.filter((w) => !theirSet.has(w));
  const yourSet = new Set(yours);
  // Only the words they lean on — a full diff would be every word in a 250-word
  // answer and would tell the customer nothing.
  const invented = theirs.filter((w) => !yourSet.has(w)).slice(0, 12);
  const overlap = yours.length ? Math.round((matched.length / yours.length) * 100) : 0;

  return {
    scored: true,
    overlap,
    yourWords: yours.slice(0, 20),
    theirWords: theirs.slice(0, 20),
    missing: missing.slice(0, 12),
    invented,
    note: [
      `The assistants' description of ${run.brand} reuses ${overlap}% of the distinctive words in your own positioning.`,
      overlap >= 60
        ? "They are broadly describing you the way you describe yourself."
        : missing.length
          ? `They never used: ${missing.slice(0, 6).join(", ")}. If those are the words you want repeated, they have to appear on pages other than your own — that is what the citation plan is for.`
          : "",
      "This is a word overlap, not a judgement of meaning. It tells you whether your language is reaching the models, not whether they think well of you.",
    ].filter(Boolean).join(" "),
  };
}

// ---------------------------------------------------------------------------
// Consistency — is what the OS produces still on-brand?
// ---------------------------------------------------------------------------

export type ConsistencyIssue = {
  kind: "colour" | "tagline" | "tone" | "forbidden";
  severity: "warn" | "error";
  detail: string;
  found?: string;
};

/**
 * Check a produced artefact against the stored identity.
 *
 * The recurring half of the whole module. A brand guidelines document is worth
 * nothing on its own; it is worth something if the emails still match it in six
 * months. Cheap and deterministic on purpose — no model call, so it can run on
 * everything the OS produces without a bill.
 */
export function checkConsistency(
  content: string,
  identity: BrandIdentity | null,
  opts: { expectTagline?: boolean } = {},
): { ok: boolean; issues: ConsistencyIssue[]; note: string } {
  const issues: ConsistencyIssue[] = [];
  if (!identity) {
    return { ok: true, issues: [], note: "No identity is stored for this brand yet, so there is nothing to check against. Build the Launch Kit to set one." };
  }
  const text = content || "";

  const approved = new Set((identity.colours?.value || []).map((c) => c.toLowerCase()));
  if (approved.size) {
    // Neutrals are not brand decisions. Flagging #ffffff on every email would
    // train the customer to ignore this check entirely.
    // Pure white, pure black and true greys (r=g=b) are structural, not brand
    // decisions.
    const isNeutral = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return r === g && g === b;
    };
    for (const hex of extractHexes(text)) {
      if (approved.has(hex)) continue;
      if (isNeutral(hex)) continue;
      issues.push({
        kind: "colour", severity: "warn", found: hex,
        detail: `${hex} is not in the brand palette (${[...approved].join(", ")}). Either it is off-brand or the palette is out of date — both are worth knowing.`,
      });
    }
  }

  const tagline = identity.tagline?.value;
  if (opts.expectTagline && tagline && !text.toLowerCase().includes(tagline.toLowerCase())) {
    issues.push({
      kind: "tagline", severity: "warn",
      detail: `The brand tagline ("${tagline}") does not appear. Fine for a one-off, a problem if it has quietly stopped appearing anywhere.`,
    });
  }

  for (const w of identity.avoidWords?.value || []) {
    const re = new RegExp(`(?<!\\w)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\w)`, "i");
    if (re.test(text)) {
      issues.push({ kind: "forbidden", severity: "error", found: w, detail: `"${w}" is on this brand's do-not-use list.` });
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  return {
    ok: errors === 0,
    issues,
    note: issues.length
      ? `${issues.length} consistency issue(s)${errors ? `, ${errors} of them blocking` : ""}. Checked against the stored identity, not against taste.`
      : "Consistent with the stored brand identity.",
  };
}

/**
 * Build the email signature as HTML the mail engine can actually send.
 *
 * The kit used to DESCRIBE a signature — font sizes and spacing in prose, which
 * the customer then had to rebuild by hand in their mail client. This produces
 * the thing itself, from the identity, so "install my signature" is a button
 * rather than an afternoon.
 *
 * Table-based and inline-styled on purpose: that is what survives Outlook and
 * Gmail. A flexbox signature looks right in the preview and collapses in the
 * inbox, which is the same class of error as a bio that fails on paste.
 */
export function signatureHtml(input: {
  name: string;
  personName?: string;
  role?: string;
  email?: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
}, identity: BrandIdentity | null): string {
  const accent = identity?.accent?.value || "#10b981";
  const face = identity?.fonts?.value.body || "Arial, Helvetica, sans-serif";
  const esc = (v: string) => v.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
  const row = (html: string) => `<tr><td style="padding:0;font:400 13px/1.5 ${esc(face)};color:#334155;">${html}</td></tr>`;

  const lines: string[] = [];
  if (input.personName) lines.push(row(`<strong style="font-size:14px;color:#0f172a;">${esc(input.personName)}</strong>${input.role ? ` <span style="color:#64748b;">· ${esc(input.role)}</span>` : ""}`));
  lines.push(row(`<span style="font-weight:700;color:${esc(accent)};">${esc(input.name)}</span>${identity?.tagline?.value ? ` <span style="color:#64748b;">— ${esc(identity.tagline.value)}</span>` : ""}`));
  const contact: string[] = [];
  if (input.email) contact.push(`<a href="mailto:${esc(input.email)}" style="color:#334155;text-decoration:none;">${esc(input.email)}</a>`);
  if (input.phone) contact.push(esc(input.phone));
  if (input.website) contact.push(`<a href="${esc(input.website)}" style="color:${esc(accent)};text-decoration:none;">${esc(input.website.replace(/^https?:\/\//, ""))}</a>`);
  if (contact.length) lines.push(row(contact.join(' <span style="color:#cbd5e1;">|</span> ')));

  const logo = input.logoUrl
    ? `<td style="padding:0 14px 0 0;vertical-align:top;"><img src="${esc(input.logoUrl)}" alt="${esc(input.name)}" width="44" style="display:block;border:0;width:44px;height:auto;" /></td>`
    : "";

  return [
    `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">`,
    `<tr>${logo}<td style="padding:0;border-left:3px solid ${esc(accent)};padding-left:12px;">`,
    `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${lines.join("")}</table>`,
    `</td></tr></table>`,
  ].join("");
}

/** Test seam — module memory would otherwise leak between cases. */
export function __resetIdentities(): void { mem.clear(); }
