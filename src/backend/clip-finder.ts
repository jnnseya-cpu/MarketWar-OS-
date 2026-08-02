// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The step that was missing: a long video in, clips out.
//
// video-intelligence.ts calls itself "the clip-intelligence brain (OpusClip
// class)" and it does rank moments, score them across eight commercial
// dimensions and build reframe specs. But rankMoments() takes `Moment[]` — an
// array of start times, end times and transcript text that SOMEBODY ELSE has to
// have produced. Nothing in the platform produced it. Grep the repo and the
// only callers are the API route passing straight through from the request
// body, which means the "Clip Intelligence Lab" was a scoring form: a customer
// had to watch their own two-hour podcast, write down the timestamps of the
// good bits, and type them in — at which point they have already done the job
// they came here for.
//
// That job is this file. Whisper already returns real segments with real
// timestamps (transcribe.ts). This turns them into clips.
//
// WHY IT IS NOT JUST "SPLIT EVERY 60 SECONDS":
//
//   1. WHISPER SEGMENTS ARE NOT SENTENCES. They are 5–15 second fragments that
//      break wherever the model felt like breaking. Cutting on one starts your
//      clip halfway through a word. Sentences are rebuilt first, and every clip
//      begins and ends on a sentence boundary — the single biggest quality
//      difference between a usable clip and an obviously automated one.
//
//   2. A CLIP HAS TO MAKE SENSE ALONE. "So then he told me the same thing" is a
//      perfectly good sentence and a terrible opening line, because "he" and
//      "the same thing" are somewhere in the ninety minutes the viewer did not
//      watch. Openings are checked for dangling reference, and it costs points.
//
//   3. THE FIRST LINE IS THE WHOLE CLIP. Short-form is won or lost in about two
//      seconds, so the opening sentence is scored separately and heavily.
//
// EVERY NUMBER HERE IS COUNTED FROM THE ACTUAL WORDS AND SHOWS ITS WORKING.
// There is no hash in this file and there is never going to be one: a clip
// score decides what a customer publishes under their own name, and "trust me"
// is not a reason to publish anything. If there is no transcript, there are no
// clips and it says so, rather than returning something plausible.

import type { Segment } from "@/backend/transcribe";

// ---------------------------------------------------------------------------
// 1. Sentences — the unit a clip may start and end on.
// ---------------------------------------------------------------------------

export type Sentence = {
  text: string;
  startSec: number;
  endSec: number;
  /** Words in this sentence — the density signal, counted not estimated. */
  words: number;
};

const SENTENCE_END = /[.!?…]["')\]]?\s*$/;

/**
 * Rebuild sentences from Whisper's segments.
 *
 * Timing is carried honestly: a sentence starts when its first segment started
 * and ends when its last one ended. Where a segment holds more than one
 * sentence, the boundary inside it is interpolated by character position —
 * approximate, and the only approximation in this file, because Whisper does
 * not tell us where inside a segment a full stop fell. It is off by a fraction
 * of a second on a segment that holds two sentences, which is well inside the
 * padding a clip gets anyway.
 */
export function sentencesFrom(segments: Segment[]): Sentence[] {
  const out: Sentence[] = [];
  let buf = "";
  let start: number | null = null;
  let end = 0;

  const flush = () => {
    const text = buf.trim();
    if (text) out.push({ text, startSec: start ?? 0, endSec: end, words: countWords(text) });
    buf = ""; start = null;
  };

  for (const seg of segments) {
    const raw = (seg.text || "").trim();
    if (!raw) continue;
    const segStart = Math.max(0, Number(seg.start) || 0);
    const segEnd = Math.max(segStart, Number(seg.end) || segStart);

    // A segment can hold several sentences. Split it, and interpolate the
    // internal boundaries across the segment's own span by character share.
    const parts = raw.split(/(?<=[.!?…])\s+/).filter(Boolean);
    let consumed = 0;
    const total = raw.length || 1;

    for (const part of parts) {
      const partStartFrac = consumed / total;
      consumed += part.length + 1;
      const partEndFrac = Math.min(1, consumed / total);
      const pStart = segStart + (segEnd - segStart) * partStartFrac;
      const pEnd = segStart + (segEnd - segStart) * partEndFrac;

      if (start === null) start = parts.length > 1 ? pStart : segStart;
      buf = buf ? `${buf} ${part}` : part;
      end = parts.length > 1 ? pEnd : segEnd;
      if (SENTENCE_END.test(part)) flush();
    }
  }
  flush();
  return out;
}

const countWords = (s: string) => (s.trim().match(/[\p{L}\p{N}'’-]+/gu) || []).length;

// ---------------------------------------------------------------------------
// 2. The measured signals. Each returns a count or a boolean, never a feeling.
// ---------------------------------------------------------------------------

/** Openers that make a first line depend on something the viewer did not see. */
const DANGLING_OPENER =
  /^(so|and|but|then|also|because|which|that's|thats|anyway|however|therefore|plus|yeah|no|right|ok|okay|well)\b/i;
/** A pronoun with no antecedent inside the clip is the same problem. */
const BARE_PRONOUN_OPENER = /^(he|she|they|it|this|that|these|those|him|her|them)\b/i;

/** Words that open a loop the viewer wants closed. Counted, not weighted by vibe. */
const CURIOSITY = /\b(secret|nobody|never|mistake|wrong|actually|truth|why|reason|stop|before you|most people|everyone|the problem|what if|here'?s)\b/gi;
/** Structure a viewer can follow without context. */
const LISTICLE = /\b(one|two|three|four|five|first|second|third|finally|step \d|\d+\s*(?:ways|reasons|things|steps|rules|mistakes|tips))\b/gi;
/** Direct address — the difference between a lecture and a message. */
const SECOND_PERSON = /\b(you|your|you're|youre|yours)\b/gi;
/** A concrete figure is the most quotable thing in any transcript. */
const CONCRETE_NUMBER = /(?:£|\$|€)\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:%|percent|million|billion|thousand|k\b|x\b|times|days?|weeks?|months?|years?|hours?|minutes?)/gi;
/** A landing — the thing that makes a clip feel finished rather than cut off. */
const PAYOFF = /\b(so that'?s|that'?s (?:why|how|the)|the (?:point|answer|result|lesson|takeaway)|in short|which means|turns out|and that'?s|bottom line)\b/gi;
/** Asking for something. Present or absent — it changes which score matters. */
const CTA = /\b(subscribe|follow|comment|link in bio|sign up|book a|get in touch|download|dm me|check out|visit|join|try it|learn more)\b/gi;
/**
 * Commercial language — the difference between a clip that travels and a clip
 * that sells.
 *
 * Countable, which is why it is here and why emotional intensity and
 * reputation risk are not. A transcript tells you someone said "worth every
 * penny"; it does not tell you how they said it, or whether the thing behind
 * the camera was defensible. Guessing those two would put the platform back
 * where it started.
 */
const BUYING = /\b(price|pricing|cost|costs|worth it|worth every|invest|investment|budget|roi|return on|revenue|profit|margin|save[ds]?|paying|pay for|customers?|clients?|buy|bought|purchase|subscription|plan|package|deal|quote|refund|guarantee)\b/gi;

const count = (text: string, re: RegExp) => (text.match(re) || []).length;

export type ClipSignal = {
  name: string;
  /** 0–100, always derived from `evidence`. */
  score: number;
  /** The count, phrase or fact the score came from. Shown to the customer. */
  evidence: string;
};

// ---------------------------------------------------------------------------
// 3. A clip candidate.
// ---------------------------------------------------------------------------

export type ClipCandidate = {
  id: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  /** The exact words in the clip — quotable, checkable, and the caption source. */
  text: string;
  /** The opening line on its own, because it decides whether the rest is seen. */
  hookLine: string;
  signals: ClipSignal[];
  /** Average of the signals. Every point of it traces to a count above. */
  score: number;
  /** Sentence indices, so a caller can widen or narrow a clip precisely. */
  sentenceRange: { from: number; to: number };
  why: string;
};

export type FindClipsOptions = {
  /** Shortest clip worth cutting. Under ~10s there is no room for a hook. */
  minSec?: number;
  /** Longest. Beyond ~90s retention falls off a cliff on every short-form feed. */
  maxSec?: number;
  /** How many to return. */
  limit?: number;
  /** Overlap above this share means two candidates are the same clip. */
  maxOverlap?: number;
};

export type FindClipsResult = {
  clips: ClipCandidate[];
  sentences: number;
  /** Seconds of transcript we had to work with. */
  durationSec: number;
  note: string;
};

const DEFAULTS = { minSec: 15, maxSec: 75, limit: 10, maxOverlap: 0.5 };

/** The opening line's job, scored on the opening line alone. */
export function hookSignals(first: string): ClipSignal[] {
  const curiosity = count(first, CURIOSITY);
  const listicle = count(first, LISTICLE);
  const you = count(first, SECOND_PERSON);
  const numbers = count(first, CONCRETE_NUMBER);
  const isQuestion = /\?/.test(first);
  const dangling = DANGLING_OPENER.test(first.trim());
  const barePronoun = BARE_PRONOUN_OPENER.test(first.trim());

  return [
    {
      name: "Hook",
      score: Math.min(100, curiosity * 30 + listicle * 25 + numbers * 20 + (isQuestion ? 25 : 0) + you * 10),
      evidence: [
        curiosity ? `${curiosity} curiosity phrase(s)` : "",
        listicle ? `${listicle} list marker(s)` : "",
        numbers ? `${numbers} concrete figure(s)` : "",
        isQuestion ? "opens on a question" : "",
        you ? `${you} direct address to the viewer` : "",
      ].filter(Boolean).join(", ") || "nothing in the opening line asks the viewer to stay — no question, figure, list or curiosity phrase.",
    },
    {
      name: "Stands alone",
      // A clip that opens mid-thought is the most common way automated clipping
      // is spotted. Both faults can apply, and both cost.
      score: Math.max(0, 100 - (dangling ? 45 : 0) - (barePronoun ? 45 : 0)),
      evidence: dangling || barePronoun
        ? `the first line opens with "${first.trim().split(/\s+/)[0]}", which points at something the viewer has not seen`
        : "the opening line makes sense with no earlier context",
    },
  ];
}

/** What the body of the clip does, scored on the whole thing. */
export function bodySignals(text: string, durationSec: number, words: number): ClipSignal[] {
  const payoff = count(text, PAYOFF);
  const numbers = count(text, CONCRETE_NUMBER);
  const cta = count(text, CTA);
  const buying = count(text, BUYING);
  const wordsPerSec = durationSec > 0 ? words / durationSec : 0;
  const finished = SENTENCE_END.test(text);

  return [
    {
      name: "Payoff",
      score: Math.min(100, payoff * 40 + numbers * 15 + (finished ? 30 : 0)),
      evidence: [
        payoff ? `${payoff} conclusion phrase(s)` : "",
        numbers ? `${numbers} concrete figure(s)` : "",
        finished ? "ends on a completed sentence" : "ends mid-sentence",
      ].filter(Boolean).join(", "),
    },
    {
      name: "Pace",
      // Measured straight off the timestamps. Natural speech runs about 2.2–3.3
      // words a second; well under that is dead air or a long pause, well over
      // is a rush nobody follows.
      score: wordsPerSec >= 2.2 && wordsPerSec <= 3.6 ? 90
        : wordsPerSec >= 1.6 && wordsPerSec < 2.2 ? 65
        : wordsPerSec > 3.6 ? 60
        : wordsPerSec > 0 ? 30 : 0,
      evidence: `${words} words in ${Math.round(durationSec)}s — ${wordsPerSec.toFixed(1)} words/second`,
    },
    {
      name: "Length",
      // Short-form bands, from the platforms' own retention behaviour rather
      // than from an opinion about the ideal length.
      score: durationSec >= 20 && durationSec <= 60 ? 95
        : durationSec >= 15 && durationSec < 20 ? 80
        : durationSec > 60 && durationSec <= 75 ? 70
        : 50,
      evidence: `${Math.round(durationSec)}s${durationSec >= 20 && durationSec <= 60 ? " — inside the band every short-form feed favours" : durationSec > 60 ? " — long for a short; strongest openings survive it, most do not" : " — short, so the hook has to land immediately"}`,
    },
    {
      name: "Buying signal",
      // Feeds the commercial scorer's buyerIntent, which used to default to a
      // hash of the clip id. Counted words are a weak proxy for intent and a
      // vastly better one than that.
      score: Math.min(100, buying * 20),
      evidence: buying
        ? `${buying} commercial term(s) — price, cost, customers, ROI and the like`
        : "nothing commercial is said in this clip; it may still be the right one to post, but it will not sell anything by itself",
    },
    {
      name: "Ask",
      // Not a quality judgement: a clip with no ask is fine for reach and poor
      // for leads, and the eight-dimension scorer downstream needs to know
      // which it is looking at.
      score: cta ? 100 : 0,
      evidence: cta ? `${cta} call(s) to action in the clip` : "no call to action — good for reach, nothing for the viewer to do next",
    },
  ];
}

/**
 * Find the clips.
 *
 * Windows are anchored on sentence boundaries and grown until they fit the
 * duration band, so a clip never starts or ends mid-word. Overlapping
 * candidates are collapsed to the best one, because ten variations of the same
 * forty seconds is not ten clips.
 */
export function findClips(segments: Segment[], opts: FindClipsOptions = {}): FindClipsResult {
  const minSec = opts.minSec ?? DEFAULTS.minSec;
  const maxSec = opts.maxSec ?? DEFAULTS.maxSec;
  const limit = Math.max(1, opts.limit ?? DEFAULTS.limit);
  const maxOverlap = opts.maxOverlap ?? DEFAULTS.maxOverlap;

  const sentences = sentencesFrom(segments);
  const durationSec = sentences.length ? sentences[sentences.length - 1].endSec - sentences[0].startSec : 0;

  if (!sentences.length) {
    return {
      clips: [], sentences: 0, durationSec: 0,
      note: "No clips: there is no transcript to cut. Transcribe the video first — nothing here guesses where the good bits are.",
    };
  }

  const candidates: ClipCandidate[] = [];
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i; j < sentences.length; j++) {
      const start = sentences[i].startSec;
      const end = sentences[j].endSec;
      const dur = end - start;
      if (dur < minSec) continue;     // still growing
      if (dur > maxSec) break;        // and every longer j is worse

      const span = sentences.slice(i, j + 1);
      const text = span.map((s) => s.text).join(" ");
      const words = span.reduce((n, s) => n + s.words, 0);
      const hookLine = sentences[i].text;

      const signals = [...hookSignals(hookLine), ...bodySignals(text, dur, words)];
      // A flat average, deliberately. A weighted blend nobody can reproduce is
      // how a score stops being checkable, and every weight would be an opinion
      // dressed as arithmetic.
      const score = Math.round(signals.reduce((n, s) => n + s.score, 0) / signals.length);

      candidates.push({
        id: `clip_${Math.round(start * 100)}_${Math.round(end * 100)}`,
        startSec: round2(start), endSec: round2(end), durationSec: round2(dur),
        text, hookLine, signals, score,
        sentenceRange: { from: i, to: j },
        why: signals.filter((s) => s.score >= 60).map((s) => `${s.name}: ${s.evidence}`).join(" · ")
          || signals.map((s) => `${s.name}: ${s.evidence}`).join(" · "),
      });
    }
  }

  // Best first, then drop anything that is mostly the same footage as a clip
  // already taken.
  candidates.sort((a, b) => b.score - a.score || a.startSec - b.startSec);
  const kept: ClipCandidate[] = [];
  for (const c of candidates) {
    if (kept.length >= limit) break;
    if (kept.some((k) => overlapShare(c, k) > maxOverlap)) continue;
    kept.push(c);
  }

  return {
    clips: kept, sentences: sentences.length, durationSec: round2(durationSec),
    note: kept.length
      ? `${kept.length} clip(s) from ${sentences.length} sentences of transcript. Every clip starts and ends on a sentence boundary, and every score is the average of seven counted signals — the counts are on each clip, so you can disagree with the ranking and still use the timestamps.`
      : `No clip fits between ${minSec}s and ${maxSec}s: the transcript covers ${Math.round(durationSec)}s across ${sentences.length} sentence(s). Widen the range, or the source is shorter than a clip.`,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Shared footage as a share of the SHORTER clip — how a subset is caught. */
export function overlapShare(a: { startSec: number; endSec: number }, b: { startSec: number; endSec: number }): number {
  const shared = Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec);
  if (shared <= 0) return 0;
  const shortest = Math.min(a.endSec - a.startSec, b.endSec - b.startSec);
  return shortest > 0 ? shared / shortest : 0;
}

// ---------------------------------------------------------------------------
// 4. Subtitles for one clip — rebased to the clip's own start.
// ---------------------------------------------------------------------------

/**
 * The .srt for a single clip, with timings starting at zero.
 *
 * A subtitle file whose first cue is at 42:17 is useless against a clip that is
 * forty seconds long, so the times are shifted and the cues clipped to the
 * clip's own bounds. This is what makes the output usable the moment it comes
 * back, with or without an FFmpeg worker: every platform accepts an uploaded
 * .srt.
 */
export function srtForClip(segments: Segment[], startSec: number, endSec: number): string {
  const inside = segments
    .filter((s) => s.end > startSec && s.start < endSec)
    .map((s) => ({
      start: Math.max(0, s.start - startSec),
      end: Math.min(endSec, s.end) - startSec,
      text: (s.text || "").trim(),
    }))
    .filter((s) => s.text && s.end > s.start);

  return inside
    .map((s, i) => `${i + 1}\n${srtStamp(s.start)} --> ${srtStamp(s.end)}\n${s.text}\n`)
    .join("\n");
}

function srtStamp(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
}
