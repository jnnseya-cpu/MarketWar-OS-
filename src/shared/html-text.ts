// HTML → readable text. ONE definition, because it now has two callers that
// must never disagree.
//
// WHY IT MOVED HERE. This lived in `backend/email-preview.ts`, where it fed the
// preview screen and nothing else. The value it produces — a plain-text reading
// of the message — is exactly what every outgoing email was missing: the wire
// builder sent HTML only, so the text part was COMPUTED AND NEVER CARRIED ACROSS
// THE BOUNDARY. That is this repository's most repeated defect, and the fix is
// the same every time: put the value where both sides can reach it.
//
// It cannot stay in `backend/` because `email-preview` imports `email-events`,
// which imports `email` — so `email` importing the preview would close a cycle.
// Pure, dependency-free, and in `shared/`, both sides import the same function.

export function htmlToText(html: string): string {
  return (html || "")
    // Anything invisible must not become the preheader. A tracking pixel's alt
    // text or a display:none block would otherwise be the first thing the
    // inbox shows beside the subject line.
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+style\s*=\s*"[^"]*display\s*:\s*none[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The ~90 characters an inbox shows next to the subject. */
export function preheaderOf(html: string): string {
  const t = htmlToText(html).replace(/\s+/g, " ").trim();
  return t.length <= 90 ? t : `${t.slice(0, 89).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// The text PART of a message is not quite the preview text.
// ---------------------------------------------------------------------------
//
// A reader who only gets the text alternative still has to be able to act. The
// HTML's links are in `href` attributes, which `htmlToText` throws away with
// every other tag, so a plain-text reader would see "Book a call" with nothing
// to click. Anchors therefore keep their destination alongside the label.
//
// Tracking links are the exception. A redirector URL is unreadable, identifies
// the recipient, and tells a person nothing about where they are going; in a
// text part it is also the single most spam-like thing on the page. The label
// is kept and the wrapper dropped.

export function textPartFrom(html: string): string {
  const withLinks = (html || "").replace(
    /<a\b[^>]*href\s*=\s*"(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, url: string, label: string) => {
      const text = htmlToText(label).replace(/\s+/g, " ").trim();
      if (/\/api\/track\//.test(url)) return text;
      if (!text) return url;
      // A link whose label already IS the address reads as a stutter written twice.
      if (text === url || url.startsWith(text) || text.startsWith(url)) return url;
      return `${text} (${url})`;
    },
  );
  return htmlToText(withLinks);
}
