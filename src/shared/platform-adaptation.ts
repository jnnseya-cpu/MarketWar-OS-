// PLATFORM ADAPTATION (§32) — one master asset, native everywhere.
//
// The alternative, which is what people actually do, is paste the same caption
// into six boxes. It is silently wrong in six different ways: the link is dead
// on Instagram, the caption is cut mid-word on X, the hashtags trip TikTok's
// limit, and the 4:5 image is letterboxed into a 9:16 slot.
//
// THE RULE THAT SHAPES THIS MODULE: A CUT IS A DECISION, AND DECISIONS ARE
// REPORTED.
//
// Truncating a caption and publishing it is the silent failure this codebase
// keeps finding in other forms — the work completes, the file exists, and the
// thing that mattered is gone. So every adaptation returns what it CHANGED and
// why, and where it cannot adapt honestly it refuses instead of shipping
// something broken.
//
// AND THE CALL TO ACTION SURVIVES THE CUT. When a caption is too long, the body
// is shortened and the CTA is kept. Dropping the CTA to fit turns a working post
// into a dead one, and nobody notices until the week's numbers are flat.
//
// Dimensions come from creative.ts's FORMAT_DIMENSIONS rather than a second
// table. One source of truth per concept.

import { FORMAT_DIMENSIONS, type PlatformFormat } from "@/shared/creative";

export type ChannelId =
  | "facebook" | "instagram" | "instagram_story" | "tiktok"
  | "linkedin" | "x" | "pinterest" | "whatsapp";

export type ChannelSpec = {
  id: ChannelId;
  label: string;
  /** The image shape this channel actually wants. */
  format: PlatformFormat;
  captionMax: number;
  /** How much of the caption is visible before "…more". The hook has to fit here. */
  visibleBeforeFold: number;
  hashtagMax: number;
  /** Whether a URL in the caption is clickable. Instagram's is not, and that is the classic dead link. */
  linksClickable: boolean;
};

export const CHANNELS: Record<ChannelId, ChannelSpec> = {
  facebook: { id: "facebook", label: "Facebook", format: "facebook", captionMax: 2000, visibleBeforeFold: 125, hashtagMax: 3, linksClickable: true },
  instagram: { id: "instagram", label: "Instagram", format: "instagram", captionMax: 2200, visibleBeforeFold: 125, hashtagMax: 30, linksClickable: false },
  instagram_story: { id: "instagram_story", label: "Instagram Story", format: "story", captionMax: 250, visibleBeforeFold: 100, hashtagMax: 10, linksClickable: false },
  tiktok: { id: "tiktok", label: "TikTok", format: "tiktok", captionMax: 2200, visibleBeforeFold: 100, hashtagMax: 8, linksClickable: false },
  linkedin: { id: "linkedin", label: "LinkedIn", format: "linkedin", captionMax: 3000, visibleBeforeFold: 210, hashtagMax: 5, linksClickable: true },
  x: { id: "x", label: "X", format: "facebook", captionMax: 280, visibleBeforeFold: 280, hashtagMax: 2, linksClickable: true },
  pinterest: { id: "pinterest", label: "Pinterest", format: "story", captionMax: 500, visibleBeforeFold: 100, hashtagMax: 5, linksClickable: true },
  whatsapp: { id: "whatsapp", label: "WhatsApp", format: "whatsapp", captionMax: 1024, visibleBeforeFold: 300, hashtagMax: 0, linksClickable: true },
};

export type MasterAsset = {
  /** The body of the post, without hashtags or the CTA. */
  body: string;
  /** The one line that asks for the action. Kept whole, always. */
  cta?: string;
  /** Where the CTA points. */
  link?: string;
  hashtags?: string[];
};

export type Adapted = {
  channel: ChannelId;
  label: string;
  ok: boolean;
  caption: string;
  hashtags: string[];
  image: { w: number; h: number; label: string };
  /** Everything that was altered, in words a person can check. */
  changes: string[];
  /** Things a person has to decide — never fixed silently. */
  warnings: string[];
  /** Present only when the channel cannot be served honestly. */
  refusal?: string;
};

/** Trim at a WORD boundary. A caption cut mid-word reads as a broken post, not a short one. */
export function trimToWord(text: string, max: number): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  if (max <= 1) return "";
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const body = (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.!-]+$/, "");
  return body ? `${body}…` : "";
}

/**
 * Build one channel's caption.
 *
 * THE CTA IS PLACED FIRST IN THE BUDGET, then the body gets whatever is left.
 * The reverse — fill with body, append the CTA if it fits — is what silently
 * produces a post that asks for nothing.
 */
export function composeCaption(master: MasterAsset, spec: ChannelSpec): { caption: string; changes: string[]; warnings: string[]; refusal?: string } {
  const changes: string[] = [];
  const warnings: string[] = [];

  const cta = (master.cta || "").trim();
  const link = (master.link || "").trim();

  // A link that is not clickable is worse than no link: it looks like a
  // mistake and it teaches people the brand does not know the platform.
  let tail = cta;
  if (link) {
    if (spec.linksClickable) {
      tail = tail ? `${tail} ${link}` : link;
    } else {
      tail = tail ? `${tail} — link in bio` : "Link in bio";
      changes.push(`${spec.label} captions are not clickable, so the URL was replaced with "link in bio". Put the link there before this goes out.`);
      warnings.push("The link only works if the profile's bio link points at it.");
    }
  }

  const reserve = tail ? tail.length + 2 : 0;
  if (reserve > spec.captionMax) {
    return {
      caption: "", changes, warnings,
      refusal: `The call to action alone is ${reserve} characters and ${spec.label} allows ${spec.captionMax}. Shorten the CTA rather than letting this post go out without one.`,
    };
  }

  const bodyBudget = spec.captionMax - reserve;
  const body = (master.body || "").trim();
  let usedBody = body;
  if (body.length > bodyBudget) {
    usedBody = trimToWord(body, bodyBudget);
    changes.push(`Body shortened from ${body.length} to ${usedBody.length} characters to fit ${spec.label}'s ${spec.captionMax}. The call to action was kept whole.`);
  }

  const caption = [usedBody, tail].filter(Boolean).join("\n\n").trim();

  // The hook has to survive the fold, or nobody reads the rest.
  const firstLine = caption.split("\n")[0] || "";
  if (firstLine.length > spec.visibleBeforeFold) {
    warnings.push(`Only the first ${spec.visibleBeforeFold} characters show before "more" on ${spec.label}. Check the hook lands inside that.`);
  }

  return { caption, changes, warnings };
}

export function adaptAsset(master: MasterAsset, channels: ChannelId[]): Adapted[] {
  return channels.map((id) => {
    const spec = CHANNELS[id];
    const { caption, changes, warnings, refusal } = composeCaption(master, spec);

    const all = master.hashtags || [];
    const hashtags = all.slice(0, spec.hashtagMax);
    if (all.length > spec.hashtagMax) {
      changes.push(
        spec.hashtagMax === 0
          ? `${spec.label} does not use hashtags, so all ${all.length} were removed.`
          : `${all.length} hashtags cut to ${spec.hashtagMax} for ${spec.label}. The first ${spec.hashtagMax} were kept — reorder the master if the wrong ones survived.`,
      );
    }

    return {
      channel: id,
      label: spec.label,
      ok: !refusal,
      caption,
      hashtags,
      image: FORMAT_DIMENSIONS[spec.format],
      changes,
      warnings,
      ...(refusal ? { refusal } : {}),
    };
  });
}

/** A one-line summary for a surface. Counts, never adjectives. */
export function adaptationSummary(results: Adapted[]): string {
  const refused = results.filter((r) => !r.ok).length;
  const changed = results.filter((r) => r.ok && r.changes.length > 0).length;
  if (refused > 0) return `${refused} of ${results.length} channels could not be adapted without dropping something that matters. ${changed} of the rest needed changes.`;
  if (changed === 0) return `All ${results.length} channels take the master as it stands.`;
  return `${changed} of ${results.length} channels needed changes, all listed.`;
}

export const ADAPTATION_DOCTRINE = [
  "A cut is a decision, and decisions are reported. Truncating a caption and publishing it is the silent failure where the work completes and the thing that mattered is gone.",
  "The call to action is budgeted first and kept whole. Dropping it to fit turns a working post into a dead one, and nobody notices until the week is flat.",
  "Captions are trimmed at a word boundary. A caption cut mid-word reads as a broken post rather than a short one.",
  "A URL where links are not clickable becomes 'link in bio', and says so. A dead link looks like a mistake and teaches people the brand does not know the platform.",
  "Image sizes come from creative.ts. A second table of dimensions is a second thing to be wrong.",
];
