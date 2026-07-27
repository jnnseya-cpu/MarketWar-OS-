// Extract the REAL ad copy (headline / offer / CTA) from an agent's creative
// brief, so a rendered creative carries postable words — never a design note.
//
// Why this is strict: a brief is full of style instructions ("CTA text #FFFFFF on
// red", "Primary #0A2540 navy → background"). A naive "text after the label" grab
// put `white on red` on the CTA button of a real ad. So we (1) prefer a QUOTED
// value — agents put actual copy in quotes — and (2) reject anything that looks
// like a colour/layout spec rather than words a customer would read.

const COLOUR_WORDS = /\b(white|black|navy|teal|cyan|red|blue|green|grey|gray|slate|amber|orange|purple|pink|yellow|magenta)\b/i;

// A style/spec fragment, not ad copy.
export function looksLikeSpec(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/#[0-9a-f]{3,8}/i.test(t)) return true;                 // hex colour
  if (/\b(rgb|hsl)\(/i.test(t)) return true;
  if (/→|->/.test(t)) return true;                             // "navy → background"
  if (/\b\d+\s?(px|pt|%)\b/i.test(t)) return true;             // sizes
  if (/\b\d{3,4}\s?[x×]\s?\d{3,4}\b/i.test(t)) return true;    // dimensions
  if (/\b(top|bottom)[- ](left|right|centre|center)\b/i.test(t)) return true;
  if (/\b(font|palette|gradient|opacity|padding|margin|safe[- ]zone|scrim|overlay|layout|composition|thumb-safe)\b/i.test(t)) return true;
  // "white on red", "on teal", "navy background" — colour-only descriptions.
  if (COLOUR_WORDS.test(t) && /\bon\b|\bbackground\b|\bpanel|\bbutton\b|\btext\b/i.test(t) && t.split(/\s+/).length <= 6) return true;
  // Bare colour list e.g. "deep navy, electric teal"
  if (COLOUR_WORDS.test(t) && t.split(/\s+/).length <= 4 && !/[.!?]$/.test(t)) return true;
  return false;
}

function cleanValue(raw: string): string {
  return raw
    .replace(/[*_`]/g, "")
    .replace(/^[\s:–—-]+/, "")
    .replace(/\s*\((?:teal|navy|red|white|black|blue|green)[^)]*\)\s*/gi, " ") // "(teal, bottom-right)"
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
}

// Find a labelled value, preferring a quoted string on that line.
function grab(md: string, labels: string[], maxWords: number): string | undefined {
  for (const label of labels) {
    // Every line that starts with (or contains) the label.
    const lineRe = new RegExp(`^[^\\n]*\\b${label}\\b[^\\n]*$`, "gim");
    const lines = md.match(lineRe) || [];
    for (const line of lines) {
      // 1) Quoted copy anywhere on the line — the most reliable signal.
      const q = /["“”'‘’]([^"“”'‘’\n]{3,120})["“”'‘’]/.exec(line);
      if (q) {
        const v = cleanValue(q[1]);
        if (v && !looksLikeSpec(v)) return v;
      }
      // 2) Otherwise the text after the first colon.
      const c = line.indexOf(":");
      if (c >= 0) {
        const v = cleanValue(line.slice(c + 1));
        if (v && !looksLikeSpec(v) && v.split(/\s+/).length <= maxWords) return v;
      }
    }
  }
  return undefined;
}

export type AdCopy = { headline?: string; offerText?: string; cta?: string };

export function extractAdCopy(md: string): AdCopy {
  return {
    headline: grab(md, ["Headline", "Primary text", "Hook", "Header"], 14),
    offerText: grab(md, ["Offer", "Price", "Deal", "Pricing"], 10),
    cta: grab(md, ["CTA button", "Call to action", "CTA", "Button"], 5),
  };
}

// Does this text read like an internal design brief rather than publishable copy?
export function looksLikeBrief(md: string): boolean {
  const signals = [/brand theme/i, /creative direction/i, /provider routing/i, /platform variants/i, /#[0-9a-f]{6}/i, /logo & text placement/i, /compliance/i];
  return signals.filter((r) => r.test(md)).length >= 2;
}
