// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar VideoDominance AI™ — the clip-intelligence brain (OpusClip/
// WayinVideo class). The heavy multimodal work (visual/audio/scene analysis,
// reframe, caption burn-in, B-roll, dubbing) is connector/model-gated; THIS
// module is the deterministic decision core:
//   • Automatic genre detection → clipping behaviour.
//   • Moment ranking (score candidate moments from cheap metadata signals).
//   • FINDING the moments in the first place lives in clip-finder.ts, which
//     reads real Whisper segments. Until it existed, everything here waited on
//     a caller to hand it timestamps it had no way to produce.
//   • MULTI-DIMENSIONAL virality scoring — NOT one vanity number, but 8
//     separate commercial scores so attention is never mistaken for revenue.
//   • Reframe / caption / B-roll spec builders (deterministic recommendations).
//
// Pure + deterministic so it runs in demo mode and unit-checks. Scores are
// labelled ESTIMATES; the engine never fabricates view counts or results — and
// as of the clip-finder work it no longer fabricates the SCORES either: a
// dimension whose inputs were never measured returns null and says so.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

// The seeded FNV helper is gone from this file. It fed three things: the eight
// commercial clip scores (from a hash of the clip id), up to fifteen points of
// a moment's rank, and the genre tie-breaker. All three now come from counted
// evidence or return nothing. Left out rather than kept unused — a score
// generator in arm's reach is how the next one gets written.

// ---------------------------------------------------------------------------
// Automatic genre detection.
// ---------------------------------------------------------------------------
export const GENRES = [
  "podcast", "product_demo", "testimonial", "webinar", "livestream", "real_estate",
  "restaurant", "sports", "gaming", "education", "conference", "news", "fashion_beauty",
  "travel", "music", "event", "support_recording", "sales_call",
] as const;
export type Genre = typeof GENRES[number];

const GENRE_HINTS: Record<Genre, string[]> = {
  podcast: ["episode", "guest", "host", "interview", "conversation"],
  product_demo: ["demo", "how it works", "features", "unbox", "review"],
  testimonial: ["testimonial", "customer", "changed my", "results", "story"],
  webinar: ["webinar", "agenda", "slides", "register", "presentation"],
  livestream: ["live", "stream", "chat", "going live"],
  real_estate: ["property", "bedroom", "listing", "tour", "sqft", "for sale"],
  restaurant: ["menu", "dish", "kitchen", "tasting", "chef", "recipe"],
  sports: ["goal", "match", "score", "highlight", "game"],
  gaming: ["gameplay", "level", "boss", "stream", "clip"],
  education: ["lesson", "learn", "tutorial", "explain", "chapter"],
  conference: ["keynote", "talk", "stage", "conference", "speaker"],
  news: ["breaking", "report", "update", "headline"],
  fashion_beauty: ["outfit", "makeup", "skincare", "haul", "style"],
  travel: ["trip", "destination", "flight", "hotel", "travel"],
  music: ["song", "track", "beat", "album", "cover"],
  event: ["event", "tickets", "lineup", "festival"],
  support_recording: ["support", "ticket", "issue", "help", "troubleshoot"],
  sales_call: ["proposal", "pricing", "objection", "deal", "quote"],
};

export function detectGenre(input: { title?: string; transcript?: string }): { genre: Genre; confidence: number; runnerUp: Genre } {
  const text = `${input.title ?? ""} ${input.transcript ?? ""}`.toLowerCase();
  const scored = GENRES.map((g) => {
    let hits = 0;
    for (const h of GENRE_HINTS[g]) if (text.includes(h)) hits++;
    return { genre: g, score: hits * 10 };
    // Ties break by GENRES order, which is stable and explainable. The old
    // `+ seed(text + g) % 5` tie-breaker was also deterministic, but it decided
    // between two genres with equal evidence using the video's title text — so
    // renaming a file changed what the platform thought the video was.
  }).sort((a, b) => b.score - a.score);
  const top = scored[0];
  const confidence = clamp(top.score >= 10 ? 60 + top.score : 30 + top.score);
  return { genre: top.genre, confidence, runnerUp: scored[1].genre };
}

// ---------------------------------------------------------------------------
// Moment ranking — score candidate moments from cheap signals.
// ---------------------------------------------------------------------------
export type Moment = {
  id: string;
  startSec: number;
  endSec: number;
  transcript?: string;
  hasFace?: boolean;
  hasProduct?: boolean;
  emotionIntensity?: number; // 0–100 if known
  isQuestion?: boolean;
  isNumberedPoint?: boolean;
};

export type RankedMoment = Moment & { momentScore: number; reasons: string[] };

export function rankMoments(moments: Moment[]): RankedMoment[] {
  return moments.map((m) => {
    const t = (m.transcript ?? "").toLowerCase();
    const reasons: string[] = [];
    // Was `40 + (seed(m.id + t) % 15)` — up to fifteen points of a moment's
    // rank came from a hash of its own id, enough to reorder two moments whose
    // real signals were level. The base is now flat, so every point of
    // separation between two moments is a signal one of them actually has.
    let s = 40;
    if (m.hasFace) { s += 8; reasons.push("on-camera face (retention)"); }
    if (m.hasProduct) { s += 10; reasons.push("product visible (commercial)"); }
    if ((m.emotionIntensity ?? 0) >= 60) { s += 12; reasons.push("high emotional intensity"); }
    if (m.isQuestion || /\?$/.test(t)) { s += 6; reasons.push("question hook (comments)"); }
    if (m.isNumberedPoint || /\b(one|two|three|first|second|1\.|2\.|3\.)\b/.test(t)) { s += 5; reasons.push("listicle structure"); }
    if (/\b(secret|nobody|mistake|actually|stop|before you)\b/.test(t)) { s += 8; reasons.push("curiosity/pattern-break"); }
    const dur = m.endSec - m.startSec;
    if (dur >= 8 && dur <= 60) { s += 6; reasons.push("short-form duration"); }
    return { ...m, momentScore: clamp(s), reasons };
  }).sort((a, b) => b.momentScore - a.momentScore);
}

// ---------------------------------------------------------------------------
// Multi-dimensional virality scoring (spec §4) — 8 separate commercial scores,
// NOT one generic virality number. Attention is never mistaken for revenue.
// ---------------------------------------------------------------------------
export const CLIP_SCORE_DIMENSIONS = [
  "organic_reach", "paid_ad", "engagement", "retention",
  "lead_generation", "conversion", "brand_safety", "profitability",
] as const;
export type ClipScoreDimension = typeof CLIP_SCORE_DIMENSIONS[number];

export type ClipScoreInput = {
  clipId: string;
  hookStrength?: number;      // 0–100
  emotionalIntensity?: number;
  productVisible?: boolean;
  ctaPresent?: boolean;
  buyerIntent?: number;
  reputationRisk?: number;    // 0–100 (higher = worse)
  platform?: string;
};

export type ClipScores = {
  clipId: string;
  /** null where the signals that dimension needs were never measured. */
  scores: { dimension: ClipScoreDimension; score: number | null }[];
  headline: string; // the single most-relevant score for the clip's goal
  note: string;
};

export function scoreClip(input: ClipScoreInput): ClipScores {
  // THESE DEFAULTS WERE A HASH OF THE CLIP ID:
  //
  //   const s    = (salt) => seed(input.clipId + salt) % 30;
  //   const hook = input.hookStrength ?? 50 + s("hook");
  //
  // So a clip with no measured signals still produced eight confident
  // "commercial scores" — reach, conversion, profitability — from the
  // characters of its own identifier. Rename the clip and its business case
  // changed. clip-finder.ts now measures hook strength off the actual opening
  // line, so the honest answer when nothing was measured is to say so and score
  // only what we have.
  const measured = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? clamp(v) : null);
  const hook = measured(input.hookStrength);
  const emo = measured(input.emotionalIntensity);
  const buyer = measured(input.buyerIntent);
  const risk = measured(input.reputationRisk);
  const cta = input.ctaPresent ? 20 : 0;
  const product = input.productVisible ? 15 : 0;

  // A dimension is scored only when every input it depends on was measured.
  // Missing means null, and null is never averaged in as if it were a zero.
  const need = (...vals: (number | null)[]) => (vals.every((v) => v !== null) ? (vals as number[]) : null);

  const raw: Record<ClipScoreDimension, number | null> = {
    organic_reach: need(hook, emo) && clamp(hook! * 0.6 + emo! * 0.4),
    paid_ad: need(hook, buyer) && clamp(hook! * 0.4 + buyer! * 0.3 + product + cta),
    engagement: need(emo, hook) && clamp(emo! * 0.6 + hook! * 0.3),
    // Retention used to carry `+ s("ret") * 0.3` — a hash term inside an
    // arithmetic expression, which is the hardest kind to notice.
    retention: need(hook) && clamp(hook! * 0.5 + 40),
    lead_generation: need(buyer) && clamp(buyer! * 0.5 + cta + product * 0.5),
    conversion: need(buyer) && clamp(buyer! * 0.5 + cta + product),
    brand_safety: need(risk) && clamp(100 - risk!),
    profitability: need(buyer, risk) && clamp(buyer! * 0.4 + product + cta - risk! * 0.3 + 30),
  };
  const scores = CLIP_SCORE_DIMENSIONS.map((d) => ({ dimension: d, score: raw[d] === null || raw[d] === undefined ? null : (raw[d] as number) }));
  const measuredScores = scores.filter((x) => x.score !== null) as { dimension: ClipScoreDimension; score: number }[];
  const missing = CLIP_SCORE_DIMENSIONS.filter((d) => raw[d] === null || raw[d] === undefined);
  // The headline is the profitability-aware winner, not the biggest reach — and
  // there is no headline at all when nothing was measured.
  const headlineDim = [...measuredScores].filter((x) => x.dimension !== "brand_safety").sort((a, b) => b.score - a.score)[0];
  return {
    clipId: input.clipId,
    scores,
    headline: headlineDim ? `${headlineDim.dimension.replace(/_/g, " ")} ${headlineDim.score}/100` : "not scored",
    note: missing.length === CLIP_SCORE_DIMENSIONS.length
      ? "Nothing was measured for this clip, so nothing is scored. Run it through the clip finder — it reads hook strength, payoff, pace and calls to action off the actual transcript — or supply the signals yourself."
      : missing.length
        ? `${measuredScores.length} of ${CLIP_SCORE_DIMENSIONS.length} commercial scores. The other ${missing.length} (${missing.join(", ")}) need signals nobody measured for this clip and are left blank rather than filled in. Never one vanity number; brand-safety gates publishing.`
        : "Eight separate commercial scores (reach/ad/engagement/retention/lead/conversion/brand-safety/profitability) — never one vanity number. Estimates from measured signals; brand-safety gates publishing.",
  };
}

// Reframe + caption + B-roll spec builders (deterministic recommendations).
export const REFRAME_LAYOUTS = ["9:16", "1:1", "16:9", "split_screen", "pip", "grid", "product_plus_presenter", "before_after"] as const;

export function reframeSpec(genre: Genre): { primary: string; layout: string; tracking: string[]; safeZones: string[] } {
  const layout =
    genre === "gaming" ? "gameplay_plus_facecam" :
    genre === "product_demo" ? "product_plus_presenter" :
    genre === "podcast" || genre === "conference" ? "9:16" : "9:16";
  return {
    primary: "9:16",
    layout,
    tracking: ["active_speaker", "face", genre === "product_demo" ? "product" : genre === "sports" ? "ball" : "subject"],
    safeZones: ["text_safe_zone", "logo_safe_zone", "platform_ui_safe_zone"],
  };
}

export function captionSpec(input: { keywords?: string[]; children?: boolean }): { style: string; controls: string[]; highlight: string[] } {
  return {
    style: "word_by_word_karaoke",
    controls: ["safe_zone_protection", "reading_speed_control", input.children ? "children_friendly_mode" : "accessibility_mode", "profanity_masking", "brand_fonts", "brand_colours"],
    highlight: ["keyword_animation", "product_name_highlight", "price_highlight", "cta_highlight", ...(input.keywords ?? [])],
  };
}

// ---------------------------------------------------------------------------
// Natural-language "Find Moments" (spec §16/§18) — a search over supplied
// moments by plain-language query. Deterministic keyword/flag matching; returns
// timestamped, transcript-evidenced results (never fabricates a moment).
// ---------------------------------------------------------------------------
export type FoundMoment = RankedMoment & { matchReason: string };

export function findMoments(moments: Moment[], query: string): { query: string; results: FoundMoment[]; note: string } {
  const q = query.toLowerCase();
  const wantQuestion = /\bquestion|ask|objection\b/.test(q);
  const wantProduct = /\bproduct|price|pricing|demo\b/.test(q);
  const wantEmotion = /\blaugh|funny|react|emotion|excit|intense\b/.test(q);
  const wantTestimonial = /\btestimonial|customer|saved|results|story\b/.test(q);
  const wantAd = /\b(advert|ad|tiktok|15-second|15 second|short)\b/.test(q);
  // Content words from the query (for topical match).
  const words = q.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 3 &&
    !["find", "show", "every", "moment", "moments", "where", "clips", "clip", "suitable", "strongest", "point", "points", "with", "that", "this", "about", "there"].includes(w));

  const ranked = rankMoments(moments);
  const results: FoundMoment[] = [];
  for (const m of ranked) {
    const t = (m.transcript ?? "").toLowerCase();
    const reasons: string[] = [];
    if (wantQuestion && (m.isQuestion || /\?/.test(t) || /objection|why|how|what/.test(t))) reasons.push("question/objection");
    if (wantProduct && (m.hasProduct || /product|price|£|demo/.test(t))) reasons.push("product/price");
    if (wantEmotion && ((m.emotionIntensity ?? 0) >= 55 || /laugh|wow|amazing|love/.test(t))) reasons.push("emotional/reaction");
    if (wantTestimonial && /customer|saved|results|story|changed/.test(t)) reasons.push("testimonial");
    if (wantAd) { const dur = m.endSec - m.startSec; if (dur >= 6 && dur <= 30) reasons.push("ad-length"); }
    const topical = words.filter((w) => t.includes(w));
    if (topical.length) reasons.push(`topic: ${topical.join(", ")}`);
    if (reasons.length) results.push({ ...m, matchReason: reasons.join("; ") });
  }
  return {
    query,
    results: results.sort((a, b) => b.momentScore - a.momentScore),
    note: `Matched ${results.length} moment(s) by natural-language query, each with a timestamp + transcript evidence. Only supplied moments are searched — none are invented.`,
  };
}

// ---------------------------------------------------------------------------
// Deterministic demo so the engine renders with zero config.
// ---------------------------------------------------------------------------
export function demoVideoIntelligence() {
  const genre = detectGenre({ title: "Product demo: how our grill works", transcript: "let me demo the features and unbox it" });
  const moments = rankMoments([
    { id: "c1", startSec: 12, endSec: 34, transcript: "the secret nobody tells you about grilling", hasFace: true, emotionIntensity: 70 },
    { id: "c2", startSec: 90, endSec: 108, transcript: "three reasons customers switch", hasProduct: true, isNumberedPoint: true },
    { id: "c3", startSec: 200, endSec: 320, transcript: "long slow intro", hasFace: false },
  ]);
  const clipScores = scoreClip({ clipId: "c2", hookStrength: 78, productVisible: true, ctaPresent: true, buyerIntent: 72, reputationRisk: 8, platform: "tiktok" });
  return { genre, moments, clipScores, reframe: reframeSpec(genre.genre), captions: captionSpec({ keywords: ["grill"], children: false }) };
}
