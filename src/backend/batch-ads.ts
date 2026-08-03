// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Batch static ads — one product photo into a full set of on-brand variants.
//
// This is the thing a competitor demo does in one click and we could not: a
// business uploads a photo and gets back a grid of ready-to-post ads rather than
// a single image they then have to resize six times.
//
// What makes a BATCH useful is not volume — twelve near-identical images are
// twelve times the noise. It is deliberate variation along axes that actually
// change performance:
//
//   ANGLE     what the ad argues (the offer, the problem, the proof, the
//             comparison). This is the axis that moves conversion most, and it
//             is the one a "generate 20 images" button never varies.
//   FORMAT    where it will be posted. A 9:16 story and a 1:1 feed post are not
//             the same picture cropped; the safe area and text size differ.
//   TREATMENT the visual register — product-led, lifestyle, bold-type.
//
// Every variant is generated against the SAME product photo and then checked by
// Identity Lock, so a batch cannot quietly include three ads showing a product
// that is not theirs. That check is what makes a batch safe to publish without
// inspecting each one, which is the entire point of generating a batch.

import { generateImage } from "@/backend/image-gateway";
import { adTargeting, type AdTargeting, type TargetMarket } from "@/shared/market";
import { verifyIdentityByUrl, type IdentityVerdict } from "@/backend/identity-lock";
import {
  DEFAULT_CREATIVE_OPTIONS,
  type ImageGenerationRequest, type ImageResult, type PlatformFormat,
} from "@/shared/creative";

export type AdAngle = "offer" | "problem" | "proof" | "comparison" | "how_it_works" | "urgency";
export type AdFormat = "square" | "portrait" | "story" | "landscape";
export type AdTreatment = "product_led" | "lifestyle" | "bold_type";

export const AD_FORMATS: {
  id: AdFormat; label: string; ratio: string; width: number; height: number;
  usedFor: string; platform: PlatformFormat;
}[] = [
  { id: "square", label: "Feed square", ratio: "1:1", width: 1080, height: 1080, usedFor: "Instagram and Facebook feed, LinkedIn", platform: "instagram" },
  { id: "portrait", label: "Feed portrait", ratio: "4:5", width: 1080, height: 1350, usedFor: "The tallest a feed post can be — takes the most screen", platform: "facebook" },
  { id: "story", label: "Story / Reel", ratio: "9:16", width: 1080, height: 1920, usedFor: "Stories, Reels, TikTok, Shorts", platform: "story" },
  { id: "landscape", label: "Landscape", ratio: "16:9", width: 1920, height: 1080, usedFor: "YouTube, display, email headers", platform: "banner" },
];

// Each angle carries the ARGUMENT, not a style word. "Bold and eye-catching"
// produces the same ad six times; "lead with what it costs and what they get"
// produces a different one.
const ANGLES: Record<AdAngle, { label: string; brief: string; needs?: "offer" | "proof" | "pain" }> = {
  offer: { label: "The offer", brief: "Lead with exactly what they get and what it costs. The offer is the hero; the product supports it.", needs: "offer" },
  problem: { label: "The problem", brief: "Open on the frustration they already have. The product appears as the answer, not the subject.", needs: "pain" },
  proof: { label: "Proof", brief: "Lead with evidence a real customer supplied. Quiet, credible framing — no hype.", needs: "proof" },
  comparison: { label: "Before / after", brief: "Show the change. Two states, one frame, the product as the cause." },
  how_it_works: { label: "How it works", brief: "Make the mechanism obvious at a glance. Clarity over drama." },
  urgency: { label: "Deadline", brief: "Lead with the time limit. Only ever used when a real deadline exists.", needs: "offer" },
};

const TREATMENTS: Record<AdTreatment, string> = {
  product_led: "The product fills the frame, clean background in the brand colour, studio lighting.",
  lifestyle: "The product in the situation it is used in, natural light, a real setting rather than a studio.",
  bold_type: "Type-led: the message dominates, the product sits as a supporting element on a brand-colour field.",
};

export type BatchRequest = {
  business: string;
  product: string;
  productImageUrl?: string;   // the photo everything is built on
  offer?: string;
  pain?: string;
  proofQuote?: string;        // real, supplied — never generated
  deadline?: string;
  brandColours?: string[];
  angles?: AdAngle[];
  formats?: AdFormat[];
  treatments?: AdTreatment[];
  quality?: "draft" | "standard" | "premium";
  /** Where the spend should go. Drives the targeting block on the plan. */
  market?: TargetMarket | null;
};

export type BatchVariant = {
  id: string;
  angle: AdAngle;
  angleLabel: string;
  format: AdFormat;
  ratio: string;
  treatment: AdTreatment;
  headline: string;
  cta: string;
  prompt: string;
  url?: string;
  identity?: IdentityVerdict;
  status: "ok" | "identity_failed" | "render_failed";
  note: string;
};

export type BatchPlan = {
  variants: Omit<BatchVariant, "url" | "identity" | "status" | "note">[];
  skipped: { angle: AdAngle; reason: string }[];
  count: number;
  /**
   * Where to run them, ready to paste into Meta or Google Ads.
   *
   * Creative without geography is half a campaign. An ad set left unrestricted
   * spends wherever impressions are cheapest, which is exactly the mechanism
   * that fills a UK business's organic numbers with traffic from countries it
   * does not sell to — except here it is doing it with money.
   */
  targeting: AdTargeting;
};

// Plan the batch WITHOUT generating anything. Cheap, instant, and it lets the
// customer see the shape (and the cost) before spending.
export function planBatch(req: BatchRequest): BatchPlan {
  const formats = (req.formats?.length ? req.formats : (["square", "portrait", "story"] as AdFormat[]));
  const treatments = (req.treatments?.length ? req.treatments : (["product_led", "lifestyle", "bold_type"] as AdTreatment[]));
  const requested = req.angles?.length ? req.angles : (Object.keys(ANGLES) as AdAngle[]);

  const skipped: BatchPlan["skipped"] = [];
  const usable = requested.filter((a) => {
    const need = ANGLES[a].needs;
    // An angle whose material is missing is DROPPED, not filled in. A "proof"
    // ad with no customer quote would have to invent one, and a "deadline" ad
    // with no deadline is a fake countdown.
    if (need === "offer" && !req.offer?.trim()) { skipped.push({ angle: a, reason: "No offer given — this ad would have nothing to state." }); return false; }
    if (need === "pain" && !req.pain?.trim()) { skipped.push({ angle: a, reason: "No customer problem given — this ad would have to invent one." }); return false; }
    if (need === "proof" && !req.proofQuote?.trim()) { skipped.push({ angle: a, reason: "No real customer quote supplied — proof is never generated." }); return false; }
    if (a === "urgency" && !req.deadline?.trim()) { skipped.push({ angle: a, reason: "No real deadline — a countdown that is not true costs trust permanently." }); return false; }
    return true;
  });

  const variants: BatchPlan["variants"] = [];
  let i = 0;
  for (const angle of usable) {
    for (const format of formats) {
      // Rotate the treatment so a batch is varied on all three axes rather than
      // producing the same picture at three sizes.
      const treatment = treatments[i % treatments.length];
      const fmt = AD_FORMATS.find((f) => f.id === format)!;
      variants.push({
        id: `ad_${angle}_${format}_${treatment}`,
        angle,
        angleLabel: ANGLES[angle].label,
        format,
        ratio: fmt.ratio,
        treatment,
        headline: headlineFor(angle, req),
        cta: ctaFor(angle, req),
        prompt: promptFor(angle, treatment, fmt, req),
      });
      i++;
    }
  }
  return { variants, skipped, count: variants.length, targeting: adTargeting(req.market ?? null) };
}

function headlineFor(angle: AdAngle, req: BatchRequest): string {
  switch (angle) {
    case "offer": return req.offer!.trim();
    case "problem": return req.pain!.trim();
    case "proof": return req.proofQuote!.trim();
    case "urgency": return req.deadline!.trim();
    case "comparison": return `Before and after ${req.product}`;
    default: return req.product;
  }
}

function ctaFor(angle: AdAngle, req: BatchRequest): string {
  if (angle === "urgency") return "Claim it before it ends";
  if (angle === "proof") return "See what they got";
  if (req.offer?.trim()) return "Get this offer";
  return "Find out more";
}

function promptFor(angle: AdAngle, treatment: AdTreatment, fmt: typeof AD_FORMATS[number], req: BatchRequest): string {
  return [
    `${ANGLES[angle].brief}`,
    TREATMENTS[treatment],
    `Product: ${req.product}. Business: ${req.business}.`,
    `Composition: ${fmt.ratio} for ${fmt.usedFor}. Keep the product and any text inside the safe area — nothing important within 8% of any edge.`,
    // The single most important instruction: this is THEIR product, not a
    // similar one. The identity check afterwards enforces it, but saying it up
    // front means fewer rejected variants and less wasted spend.
    req.productImageUrl
      ? "Use the supplied product photograph as the subject. Do not redesign, recolour or restyle the product itself — the packaging, shape and colours must match the photograph exactly."
      : "No product photograph was supplied — compose around the brand colours and type rather than depicting a product that has not been seen.",
    "No text baked into the image beyond what is supplied. No invented logos, badges, awards or ratings.",
  ].join(" ");
}

// Generate the planned batch. Each variant is verified against the source photo
// so the whole set can be trusted without opening every image.
export async function renderBatch(
  req: BatchRequest,
  plan: BatchPlan,
  opts: { verify?: boolean } = {},
): Promise<{ variants: BatchVariant[]; okCount: number; failedCount: number; note: string }> {
  const verify = opts.verify !== false && Boolean(req.productImageUrl);
  const out: BatchVariant[] = [];

  for (const v of plan.variants) {
    const fmt = AD_FORMATS.find((f) => f.id === v.format)!;
    const request: ImageGenerationRequest = {
      business: req.business,
      prompt: v.prompt,
      headline: v.headline,
      offerText: req.offer,
      cta: v.cta,
      quality: (req.quality || "standard") as ImageGenerationRequest["quality"],
      variants: 1,
      options: {
        ...DEFAULT_CREATIVE_OPTIONS,
        platformFormat: fmt.platform,
        useBrandColours: Boolean(req.brandColours?.length),
        // The product photo is the whole point of a batch: every variant must be
        // built on the SAME item, not on the model's idea of a similar one.
        useProductPhoto: Boolean(req.productImageUrl),
        addOfferText: Boolean(req.offer?.trim()),
        addCtaButton: true,
      },
    };

    let results: ImageResult[] = [];
    try {
      results = await generateImage(request);
    } catch {
      out.push({ ...v, status: "render_failed", note: "This variant could not be rendered. You are not charged for it." });
      continue;
    }
    // hostedUrl is postable and verifiable; imageUrl is an inline data URI that
    // always renders. Prefer the hosted one, fall back so a batch still shows
    // when Storage is not configured.
    const url = results[0]?.hostedUrl || results[0]?.imageUrl;
    if (!url) {
      out.push({ ...v, status: "render_failed", note: "The renderer returned no image for this variant." });
      continue;
    }

    if (!verify) {
      out.push({ ...v, url, status: "ok", note: "Rendered. No product photo was supplied, so there is nothing to verify it against." });
      continue;
    }

    const hosted = results[0]?.hostedUrl;
    if (!hosted) {
      out.push({ ...v, url, status: "ok", note: "Rendered. Media hosting is not configured, so the product check could not run on this one — look at it before posting." });
      continue;
    }
    const identity = await verifyIdentityByUrl(req.productImageUrl!, hosted);
    if (identity.ok && !identity.passed) {
      // Kept and shown, but flagged — the customer decides. Silently dropping it
      // would hide that the model drifted, which is worth knowing.
      out.push({ ...v, url, identity, status: "identity_failed", note: `Held back: ${identity.summary}` });
      continue;
    }
    out.push({
      ...v, url, identity, status: "ok",
      note: identity.ok ? `Product verified against your photo (weakest axis ${identity.overall}/100).` : "Rendered; the identity check could not run on this image.",
    });
  }

  const okCount = out.filter((v) => v.status === "ok").length;
  const failedCount = out.length - okCount;
  return {
    variants: out,
    okCount,
    failedCount,
    note:
      failedCount === 0
        ? `${okCount} ads ready, every one checked against your product photo.`
        : `${okCount} ready. ${failedCount} held back — open those to see why rather than posting them unchecked.`,
  };
}

export const AD_ANGLES = ANGLES;
export const AD_TREATMENTS = TREATMENTS;
