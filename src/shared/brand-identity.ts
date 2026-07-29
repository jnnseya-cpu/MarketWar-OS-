// The brand's identity record — shared, because both the engines that write it
// and the surfaces that display it need the same shape.
//
// This is the difference between a document dump and infrastructure. The Brand
// Launch Kit writes eight documents; what makes them worth more than a chat
// window is that the STRUCTURED parts are pulled out and kept, so every other
// module in the OS can read the same answer: the email writer uses the tone,
// the page builder uses the colours, the social publisher uses the right bio
// for each platform.
//
// Every field is optional and every one carries its source, because a value
// somebody typed and a value a model proposed are not the same thing and must
// never be presented as if they were.

export type IdentitySource = "measured" | "supplied" | "generated";

export type IdentityValue<T> = {
  value: T;
  /**
   * measured  — read from something real (pixels in the logo, a live page)
   * supplied  — the customer typed it
   * generated — a model proposed it and nobody has confirmed it
   */
  source: IdentitySource;
  confirmedAt?: string;
};

export type SocialBio = { platform: string; text: string; chars: number; limit: number; withinLimit: boolean };

export type BrandIdentity = {
  brandId: string;
  updatedAt: string;

  colours?: IdentityValue<string[]>;
  accent?: IdentityValue<string>;
  fonts?: IdentityValue<{ heading?: string; body?: string }>;
  tagline?: IdentityValue<string>;
  /** One sentence: what this business is, for whom. The thing assistants should repeat. */
  positioning?: IdentityValue<string>;
  /** Adjectives that describe how it should sound. Fed to every writer in the OS. */
  toneWords?: IdentityValue<string[]>;
  /** Words and claims this brand must never use. */
  avoidWords?: IdentityValue<string[]>;
  bios?: IdentityValue<SocialBio[]>;
  pitch?: IdentityValue<{ short?: string; long?: string }>;
  moodboardKeywords?: IdentityValue<string[]>;
  emailSignatureHtml?: IdentityValue<string>;

  /** Which kit assets this was distilled from, so a value can be traced back. */
  sourceAssets?: string[];
};

/** Has enough been captured for the rest of the OS to actually use it? */
export function identityCompleteness(id: BrandIdentity | null | undefined): { filled: number; total: number; percent: number; missing: string[] } {
  const fields: [string, unknown][] = [
    ["colours", id?.colours], ["accent", id?.accent], ["fonts", id?.fonts],
    ["tagline", id?.tagline], ["positioning", id?.positioning], ["toneWords", id?.toneWords],
    ["bios", id?.bios], ["pitch", id?.pitch], ["moodboardKeywords", id?.moodboardKeywords],
  ];
  const missing = fields.filter(([, v]) => !v).map(([k]) => k);
  const filled = fields.length - missing.length;
  return { filled, total: fields.length, percent: Math.round((filled / fields.length) * 100), missing };
}

/**
 * The compact brief every other engine gets.
 *
 * Deliberately small: a writer given three pages of brand doctrine ignores all
 * of it. Only what changes the output goes in — and GENERATED values are
 * labelled as proposals so a downstream engine never states them as fact about
 * the business.
 */
export function identityBrief(id: BrandIdentity | null | undefined): string {
  if (!id) return "";
  const out: string[] = [];
  const tag = (v: IdentityValue<unknown> | undefined) => (v?.source === "generated" ? " (proposed, not confirmed)" : "");
  if (id.positioning) out.push(`Positioning${tag(id.positioning)}: ${id.positioning.value}`);
  if (id.tagline) out.push(`Tagline${tag(id.tagline)}: ${id.tagline.value}`);
  if (id.toneWords?.value.length) out.push(`Tone: ${id.toneWords.value.join(", ")}`);
  if (id.avoidWords?.value.length) out.push(`Never use: ${id.avoidWords.value.join(", ")}`);
  if (id.accent) out.push(`Accent colour${tag(id.accent)}: ${id.accent.value}`);
  if (id.colours?.value.length) out.push(`Palette: ${id.colours.value.join(", ")}`);
  if (id.fonts?.value.heading || id.fonts?.value.body) {
    out.push(`Typefaces: heading ${id.fonts.value.heading || "unset"}, body ${id.fonts.value.body || "unset"}`);
  }
  if (id.moodboardKeywords?.value.length) out.push(`Visual keywords: ${id.moodboardKeywords.value.join(", ")}`);
  return out.join("\n");
}
