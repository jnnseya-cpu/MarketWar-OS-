// IS THIS BRIEF GOING TO COME BACK RIGHT? — checked before a penny is spent.
//
// OWNER'S DIRECTIVE: "best and correct quality products on the first render."
//
// A second render is not half a failure, it is a whole one: the customer paid
// twice, waited twice, and learned that the tool needs coaxing. And the reasons
// a first render comes back wrong are mostly NOT the model. They are knowable
// from the brief itself, before anything is sent:
//
//   • WORDS IN THE FRAME. Every generative video model garbles lettering. Ask
//     for a sign reading "50% OFF" and you get a sign reading "5O% OFE". This is
//     not a quality tier away from working — the flagship garbles it too. The
//     text belongs on afterwards, as real text, in the ad canvas this platform
//     already ships.
//
//   • MORE HAPPENING THAN THE CLIP CAN HOLD. Four seconds is one action. A brief
//     with three "and then"s in it gets compressed into a smear or has two of
//     them silently dropped, and either way the render is wrong before it starts.
//
//   • NOTHING TO RENDER. "Product video" is not a brief. The model will produce
//     something confident and generic, and the customer will not be able to say
//     what is wrong with it, only that it is not theirs.
//
//   • NO SHAPE STATED. A 16:9 clip delivered for a 9:16 Reel is wrong on the
//     first render every time, and the platform could not even ASK for portrait
//     until now — nothing sent an aspect ratio at all.
//
// So this refuses what will predictably fail, improves what it can, and says
// which it did. It is pure, and it lives in `shared/` because the surface should
// be able to show the same verdict BEFORE the button is pressed as the engine
// enforces after it — the cheapest render is the one nobody had to pay for.

export type Aspect = "16:9" | "9:16" | "1:1";
export type Resolution = "720p" | "1080p";

export type BriefIssue = {
  code: string;
  /** What is wrong, in the customer's terms. */
  what: string;
  /** Why it will come back wrong — the reasoning, not an assertion. */
  why: string;
  /** The one thing to do about it. */
  fix: string;
};

export type BriefReview = {
  /** False means DO NOT SPEND. */
  ok: boolean;
  blockers: BriefIssue[];
  /** Applied or advisory — never a reason to refuse. */
  notes: BriefIssue[];
  /** The prompt as it should be sent. */
  prompt: string;
  /** What the model must not put in the frame. */
  negativePrompt: string;
  aspect: Aspect;
  resolution: Resolution;
  /** Distinct actions asked for. */
  beats: number;
  /** The most this length can hold. */
  beatsAllowed: number;
};

/**
 * One clear action per four seconds.
 *
 * Not a preference — it is the shortest span in which a generative model can
 * establish a subject, move it, and land the movement. Below it the action is
 * a smear; a brief with more beats than the clip has room for loses the extra
 * ones without saying so, which is the most expensive kind of wrong: it looks
 * like a successful render.
 */
export const SECONDS_PER_BEAT = 4;

/** Scene changes, however they are written. */
const BEAT_MARKERS = /\b(?:and\s+then|then|after\s+that|next(?:,|\s+we)|cut\s+to|followed\s+by|finally|afterwards|meanwhile|before\s+(?:cutting|switching))\b/gi;

/**
 * Asking for words on screen.
 *
 * Quoted strings are the strongest signal and the most common: somebody writes
 * a sign reading "GRAND OPENING" and gets back a sign reading "GRAN OPEENING".
 * The named asks catch the rest.
 */
const QUOTED = /["“”'‘’]{1}[^"“”'‘’]{2,}["“”'‘’]{1}/;
const WANTS_TEXT = new RegExp([
  String.raw`\b(?:caption|captions|subtitle|subtitles|title\s+card|lower\s+third)\b`,
  String.raw`\bon-?screen\s+text\b`,
  String.raw`\btext\s+(?:overlay|on\s+screen|that\s+says)\b`,
  String.raw`\b(?:lettering|wordmark|typography|headline\s+text)\b`,
  String.raw`\b(?:sign|banner|poster|screen|label|billboard)\s+(?:that\s+)?(?:says|saying|reads|reading)\b`,
  String.raw`\b(?:write|writing|spell|spelling|display)\s+(?:out\s+)?the\s+words?\b`,
  String.raw`\bwith\s+the\s+words?\b`,
].join("|"), "i");

/**
 * What the model must never put in the frame.
 *
 * The logo half of this already existed in the branded prompt as an INSTRUCTION,
 * and instructions in a prompt are suggestions — a negative prompt is the
 * parameter the model actually honours. Both are kept: the instruction explains
 * the intent, this enforces it.
 */
export const NEGATIVE_PROMPT = [
  "on-screen text", "captions", "subtitles", "watermarks", "logos", "wordmarks",
  "garbled lettering", "misspelled words", "distorted faces", "extra fingers",
  "warped hands", "duplicated limbs", "blurry", "low resolution",
].join(", ");

/** Split a brief into the actions it is asking for. */
export function countBeats(prompt: string): number {
  const text = String(prompt || "").trim();
  if (!text) return 0;
  const markers = (text.match(BEAT_MARKERS) || []).length;
  // Sentences also separate actions, but a trailing full stop is not a beat and
  // a decimal point is not a sentence.
  const sentences = text
    .replace(/\d\.\d/g, "0")
    .split(/[.!?]+\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3).length;
  return Math.max(1, markers + 1, sentences);
}

/**
 * Read the brief, and say whether it is worth paying for.
 *
 * `aspect` is taken as given when supplied — the caller knows where the clip is
 * going. When it is not, 16:9 is chosen and SAID, rather than defaulted in
 * silence: a portrait ad delivered landscape is wrong on the first render, and
 * "you did not tell me" is a better answer than a wrong one.
 */
export function reviewBrief(input: {
  prompt: string;
  seconds: number;
  aspect?: string;
  resolution?: string;
}): BriefReview {
  const raw = String(input.prompt || "").trim();
  const seconds = Math.max(1, Math.round(Number(input.seconds) || 0));
  const blockers: BriefIssue[] = [];
  const notes: BriefIssue[] = [];

  const aspect: Aspect = input.aspect === "9:16" ? "9:16" : input.aspect === "1:1" ? "1:1" : "16:9";
  const resolution: Resolution = input.resolution === "1080p" ? "1080p" : "720p";
  if (!input.aspect) {
    notes.push({
      code: "aspect_assumed",
      what: "No shape was given, so this renders 16:9 landscape.",
      why: "A portrait ad delivered landscape is wrong on the first render every time, and cropping a landscape clip to 9:16 throws away most of the frame.",
      fix: "Say 9:16 for Reels, Shorts and TikTok, 1:1 for a feed square, 16:9 for YouTube and websites.",
    });
  }

  const beatsAllowed = Math.max(1, Math.floor(seconds / SECONDS_PER_BEAT));
  const beats = countBeats(raw);

  // NOTHING TO RENDER.
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length < 4) {
    blockers.push({
      code: "no_brief",
      what: "There is not enough here to render.",
      why: "A model given a couple of words produces something confident and generic. It will not be wrong in a way anybody can point at, and it will not be the customer's.",
      fix: "Say WHO or WHAT is on screen, what it DOES, and where it is. One sentence is enough: \"a plumber in a clean van pulls up outside a terraced house, morning light\".",
    });
  }

  // WORDS IN THE FRAME.
  const quoted = QUOTED.test(raw);
  if (quoted || WANTS_TEXT.test(raw)) {
    blockers.push({
      code: "text_in_frame",
      what: "This asks for words in the picture.",
      why: "Every generative video model garbles lettering — a sign reading \"50% OFF\" comes back reading \"5O% OFE\". This is not a better-model problem; the flagship garbles it too, and the clip has to be thrown away.",
      fix: "Take the words out of the brief and describe the scene without them. Add the text afterwards in the Ad Canvas, where it is real text you can edit, translate and keep on brand.",
    });
  }

  // MORE HAPPENING THAN THE CLIP CAN HOLD.
  if (beats > beatsAllowed) {
    const need = beats * SECONDS_PER_BEAT;
    blockers.push({
      code: "too_many_beats",
      what: `This asks for ${beats} separate things to happen in ${seconds} seconds, which holds ${beatsAllowed}.`,
      why: "A model given more actions than the length allows compresses them into a smear or drops the extra ones — and a render that quietly dropped half the brief still looks like a success.",
      fix: `Either cut it to ${beatsAllowed} action${beatsAllowed === 1 ? "" : "s"}, or ask for ${need} seconds and let it breathe.`,
    });
  }

  notes.push({
    code: "negatives_applied",
    what: "Text, watermarks and invented logos are excluded at the model level.",
    why: "The branded prompt already asks for this in words, and a prompt instruction is a suggestion. The negative-prompt parameter is the one the model actually honours.",
    fix: "",
  });

  return {
    ok: blockers.length === 0,
    blockers, notes,
    prompt: raw,
    negativePrompt: NEGATIVE_PROMPT,
    aspect, resolution, beats, beatsAllowed,
  };
}

/** Everything wrong with a brief, as one paragraph a surface can print. */
export function briefRefusal(review: BriefReview): string {
  if (review.ok) return "";
  return review.blockers.map((b) => `${b.what} ${b.why} ${b.fix}`).join(" ");
}
