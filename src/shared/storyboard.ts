// ONE CONTINUOUS COMMERCIAL, BUILT OUT OF FIFTEEN-SECOND BEATS.
//
// THE OWNER'S BRIEF, verbatim: *"To have these features but to have a very
// professional and commercial video of up to 1 minute no stop if 15 second each
// with a tool to make them together as 1 video."*
//
// Four requirements in one sentence: up to 60 seconds, built from ~15-second
// pieces, assembled into ONE file, and continuous — *no stop*.
//
// ───────────────────────────────────────────────────────────────────────────
// THE PART WORTH GETTING RIGHT BEFORE WRITING ANY CODE
// ───────────────────────────────────────────────────────────────────────────
//
// The obvious reading is "render four clips and stitch them". That is the wrong
// architecture here, and it would have been a month of work to find out why:
//
//   • Stitching needs ffmpeg. Serverless has no ffmpeg, so it would mean a
//     second piece of infrastructure for one feature.
//   • Four renders means four jobs, four polls, four failure modes, four
//     refunds and four files to keep for ever.
//   • And the joins would SHOW. Separate renders drift: the presenter's head
//     is in a different position at the end of one clip and the start of the
//     next, the lighting re-seeds, the audio level steps. A cut every fifteen
//     seconds is exactly the "stop" the brief rules out.
//
// The provider already solves this. `video_inputs` in HeyGen's v2 API is an
// ARRAY OF SCENES and the response is ONE video id — the same character and
// voice carried across every scene, rendered as a single continuous piece. Our
// adapter had always sent an array of exactly one.
//
// So the engine here does not join videos. It splits a SCRIPT into beats and
// hands them over as scenes in one request. One job, one poll, one charge, one
// file, no seams.
//
// ───────────────────────────────────────────────────────────────────────────
// WHAT THIS MODULE IS RESPONSIBLE FOR
// ───────────────────────────────────────────────────────────────────────────
//
// The split, and nothing else. It is pure and in `shared/` so the screen can
// show the customer exactly what will be rendered BEFORE anything is charged —
// the beats, the seconds each one runs, the total, and any reason it would be
// refused. A customer who can see the split can fix the script; one who cannot
// pays for a video that runs four seconds over and gets cut off.

/**
 * Words per minute of natural presenter speech.
 *
 * THE ONE SOURCE OF TRUTH for every duration in the platform — the avatar
 * gateway bills by it, the shot brief quotes it and the split below plans by
 * it. It lived in the backend, where a screen could not read it, so a UI
 * showing "about 15 seconds" would have been a second estimate free to drift
 * from the one being charged for.
 *
 * 150 is a measured pace for advertising reads: brisk enough to be energetic,
 * slow enough to be understood on a phone speaker in a noisy room.
 */
export const WORDS_PER_MINUTE = 150;

/** The longest a commercial may run, in seconds. The brief's "up to 1 minute". */
export const MAX_COMMERCIAL_SECONDS = 60;

/** The length of one beat. The brief's "if 15 second each". */
export const BEAT_SECONDS = 15;

/** The fewest words a beat can carry and still be a beat rather than a breath. */
const MIN_BEAT_WORDS = 3;

/** How many beats a single commercial may hold. Four at 15s is the brief. */
export const MAX_BEATS = Math.floor(MAX_COMMERCIAL_SECONDS / BEAT_SECONDS) + 2;

export type Beat = {
  /** 1-based, because it is shown to a person. */
  index: number;
  text: string;
  words: number;
  /** How long this beat will run at a natural pace, to one decimal place. */
  seconds: number;
  /** True when the split had to break inside a sentence to fit the beat. */
  split?: boolean;
};

export type Storyboard = {
  beats: Beat[];
  totalSeconds: number;
  totalWords: number;
  /** How it was divided: the writer's own breaks, or ours. */
  dividedBy: "author" | "pace";
  /** Things worth saying before money moves. Never blocking on their own. */
  warnings: string[];
};

export type StoryboardError = { error: string; hint?: string };

/** Seconds a run of words takes at a natural pace. */
export function secondsFor(words: number): number {
  const w = Number.isFinite(words) && words > 0 ? words : 0;
  return Math.round((w / WORDS_PER_MINUTE) * 60 * 10) / 10;
}

/** The most words that fit in one beat. */
export function wordsPerBeat(beatSeconds = BEAT_SECONDS): number {
  return Math.max(MIN_BEAT_WORDS, Math.floor((beatSeconds / 60) * WORDS_PER_MINUTE));
}

const countWords = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/**
 * Split text into sentences, keeping the punctuation that ends each one.
 *
 * Abbreviations are the trap: "Mr. Patel" and "£4.99" are not sentence ends,
 * and a naive split on every full stop produces a beat that starts mid-name.
 * So a break needs end punctuation followed by whitespace AND a capital or a
 * digit, and never fires after a known title or inside a number.
 */
function sentences(text: string): string[] {
  const out: string[] = [];
  const titles = /(?:^|\s)(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|inc|ltd|co|no|approx|eg|ie)\.$/i;
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    buf += text[i];
    if (!/[.!?]/.test(text[i])) continue;
    if (titles.test(buf)) continue;
    // Carry any closing quote or bracket into the sentence that owns it.
    while (/["'”’)\]]/.test(text[i + 1] || "")) { buf += text[++i]; }
    const rest = text.slice(i + 1);
    // A SENTENCE END IS FOLLOWED BY WHITESPACE, and the two lines below are
    // what keep "£4.99" whole — the "9" after the point is not whitespace, and
    // what follows is not the start of a new sentence either. A third,
    // explicit decimal check used to sit above this and NO INPUT COULD TELL
    // THE TWO APART: removing it changed nothing a test could see, which makes
    // it one more rule to keep true for no behaviour. The case is covered here
    // and proven by `AN ABBREVIATION IS NOT THE END OF A SENTENCE`.
    if (rest && !/^\s/.test(rest)) continue;
    if (rest.trim() && !/^\s+["'“‘(]?[A-Z0-9£$]/.test(rest)) continue;
    out.push(buf.trim());
    buf = "";
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

/**
 * Break one over-long run of words at the best place available.
 *
 * In order of preference: a clause boundary (comma, semicolon, colon, dash),
 * then a plain word boundary. NEVER inside a word — a beat that ends mid-word
 * is a presenter cut off mid-syllable, which is the one thing the viewer
 * definitely notices.
 */
function breakUp(text: string, budget: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= budget) return [text];

  const pieces: string[] = [];
  let from = 0;
  while (from < words.length) {
    const remaining = words.length - from;
    if (remaining <= budget) { pieces.push(words.slice(from).join(" ")); break; }

    // Look for a clause boundary inside the budget, preferring the latest one
    // so the beats stay as full as they can.
    let cut = -1;
    for (let i = Math.min(from + budget, words.length) - 1; i > from; i--) {
      if (/[,;:—–-]$/.test(words[i])) { cut = i + 1; break; }
    }
    if (cut <= from) cut = from + budget;
    pieces.push(words.slice(from, cut).join(" "));
    from = cut;
  }
  return pieces.filter((p) => p.trim().length > 0);
}

/**
 * Turn a script into the scenes that will be rendered.
 *
 * TWO WAYS A SCRIPT ARRIVES, and the difference is respected rather than
 * flattened. A marketer who has written four beats separated by blank lines or
 * `---` has already made the editorial decision about where the cuts fall;
 * re-splitting that by word count would move their cuts and they would never
 * know why. A script written as prose has no such decision in it, so it is
 * divided by pace.
 */
export function storyboard(
  script: string,
  opts: { beatSeconds?: number; maxSeconds?: number } = {},
): Storyboard | StoryboardError {
  const text = (script || "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    return { error: "There is no script. A commercial with nothing to say renders a person staring." };
  }

  const beatSeconds = Math.max(3, Math.min(30, opts.beatSeconds || BEAT_SECONDS));
  const maxSeconds = Math.max(beatSeconds, Math.min(180, opts.maxSeconds || MAX_COMMERCIAL_SECONDS));
  const budget = wordsPerBeat(beatSeconds);
  const warnings: string[] = [];

  // --- the writer's own breaks, when there are any -------------------------
  const authored = text
    .split(/\n\s*(?:-{3,}|\*{3,}|={3,})\s*\n|\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const dividedBy: "author" | "pace" = authored.length > 1 ? "author" : "pace";

  let raw: string[];
  if (dividedBy === "author") {
    raw = [];
    for (const part of authored) {
      const words = countWords(part);
      if (words <= budget) { raw.push(part); continue; }
      // An authored beat that runs long is still split — but it is said out
      // loud, because the writer's intended cut has moved.
      const pieces = breakUp(part, budget);
      warnings.push(`One of your beats runs ${secondsFor(words)}s, longer than ${beatSeconds}s, so it was divided into ${pieces.length}. Shorten it if you want the cut somewhere else.`);
      raw.push(...pieces);
    }
  } else {
    // --- divided by pace, sentence by sentence -----------------------------
    raw = [];
    let current: string[] = [];
    let currentWords = 0;
    for (const sentence of sentences(text.replace(/\s+/g, " "))) {
      const words = countWords(sentence);
      if (words > budget) {
        // A sentence too long for any beat. Close what is open, then break it.
        if (current.length) { raw.push(current.join(" ")); current = []; currentWords = 0; }
        raw.push(...breakUp(sentence, budget));
        continue;
      }
      if (currentWords + words > budget && current.length) {
        raw.push(current.join(" "));
        current = []; currentWords = 0;
      }
      current.push(sentence);
      currentWords += words;
    }
    if (current.length) raw.push(current.join(" "));
  }

  const beats: Beat[] = raw.map((t, i) => {
    const words = countWords(t);
    return { index: i + 1, text: t, words, seconds: secondsFor(words), ...(words > budget ? { split: true } : {}) };
  });

  const totalWords = beats.reduce((n, b) => n + b.words, 0);
  const totalSeconds = Math.round(beats.reduce((n, b) => n + b.seconds, 0) * 10) / 10;

  // --- the two refusals ----------------------------------------------------
  //
  // Both are REFUSALS rather than truncations. Cutting a script to fit would
  // render a commercial that stops mid-sentence, and the customer would have
  // paid for it.
  if (totalSeconds > maxSeconds) {
    const over = Math.round((totalSeconds - maxSeconds) * 10) / 10;
    const trim = Math.ceil((totalSeconds - maxSeconds) * (WORDS_PER_MINUTE / 60));
    return {
      error: `That script runs about ${totalSeconds}s, which is ${over}s over the ${maxSeconds}s a commercial may run.`,
      hint: `Cut roughly ${trim} words. A sixty-second ad carries about ${Math.floor((maxSeconds / 60) * WORDS_PER_MINUTE)} — anything more is read too fast to follow on a phone.`,
    };
  }
  if (beats.length > MAX_BEATS) {
    return {
      error: `That divides into ${beats.length} scenes, and a commercial may have at most ${MAX_BEATS}.`,
      hint: "Join some of the beats together: more scenes than this is a slideshow rather than an advert, and every cut is a chance for the viewer to leave.",
    };
  }

  // --- the things worth saying, which do not block -------------------------
  if (beats.length === 1) {
    warnings.push("This is one continuous take. That is fine for a short read, but a commercial usually earns its attention by changing something — a new framing or a new idea — every few seconds.");
  }
  const thin = beats.filter((b) => b.words < MIN_BEAT_WORDS);
  if (thin.length) {
    warnings.push(`${thin.length} beat${thin.length > 1 ? "s run" : " runs"} under ${MIN_BEAT_WORDS} words, which is a breath rather than a scene. They will still render.`);
  }
  if (totalSeconds < beatSeconds) {
    warnings.push(`The whole thing runs ${totalSeconds}s. That is shorter than a single beat, and most platforms want at least ${beatSeconds}s.`);
  }

  return { beats, totalSeconds, totalWords, dividedBy, warnings };
}

/** Did the storyboard refuse? A reader that narrows the type for every caller. */
export function storyboardFailed(s: Storyboard | StoryboardError): s is StoryboardError {
  return "error" in s;
}
