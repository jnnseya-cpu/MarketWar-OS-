// THE REPORT THE AUDIT PROMISED TO SEND.
//
// The free audit asked for an address with the words "One address, used to send
// you this report and nothing else until you say otherwise", recorded the
// prospect, returned the findings in the HTTP response — and never sent an
// email. Every visitor who handed over their address got nothing in their inbox,
// which is the version of this platform's recurring boundary defect that costs
// the most: the promise is on one side, the send is on the other, and the person
// who believed it is a stranger deciding whether to trust the product.
//
// This renders that report. It is pure and lives in `shared` so it can be tested
// without a network, a provider or a key.
//
// EVERYTHING INTERPOLATED HERE IS ESCAPED, AND THAT IS NOT DECORATION. The
// visitor names a URL and we fetch it; the page title, the finding details and
// the final URL all originate from a site we do not control. Putting any of that
// unescaped into an HTML email injects a stranger's markup into somebody's
// inbox, and the recipient never even visited the page it came from.

export type AuditEmailFinding = {
  area: string;
  label: string;
  severity: "pass" | "warn" | "fail";
  detail: string;
};

export type AuditEmailInput = {
  /** The page as finally fetched (after redirects). */
  url: string;
  score: number;
  grade: string;
  /** Measured findings only — never the ones we could not read. */
  findings: AuditEmailFinding[];
  /** How many checks could not be read from the response. Stated, not hidden. */
  unmeasuredCount?: number;
  /** The page's own title, if it had one. From the crawled page: untrusted. */
  title?: string;
};

/** Escapes the five characters that can break out of HTML text or an attribute. */
export function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TONE: Record<AuditEmailFinding["severity"], { border: string; word: string }> = {
  fail: { border: "#dc2626", word: "Costing you" },
  warn: { border: "#d97706", word: "Worth fixing" },
  pass: { border: "#059669", word: "Already right" },
};

/**
 * The subject line. The score is in it deliberately — it is the one thing the
 * recipient already knows and will recognise a day later in a full inbox.
 */
export function auditEmailSubject(input: { url: string; score: number }): string {
  return `Your website report: ${hostOf(input.url)} scored ${input.score}/100`;
}

/** Host only, for a subject line that is not 90 characters of query string. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The full report as an HTML email.
 *
 * Inline styles and a single-column layout, because every other approach loses
 * to one mail client or another. No images, no tracking pixel, no web font: this
 * is the first thing a stranger receives from us and it should render the same
 * everywhere and load with images switched off.
 */
export function auditEmailHtml(input: AuditEmailInput): string {
  const host = escapeHtml(hostOf(input.url));
  const safeUrl = escapeHtml(input.url);
  const fails = input.findings.filter((f) => f.severity === "fail").length;
  const warns = input.findings.filter((f) => f.severity === "warn").length;

  const rows = input.findings
    .map((f) => {
      const tone = TONE[f.severity] || TONE.warn;
      return [
        `<tr><td style="padding:0 0 14px 0">`,
        `<div style="border-left:3px solid ${tone.border};padding:2px 0 2px 12px">`,
        `<div style="font:600 11px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#64748b;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(f.area)} · ${escapeHtml(tone.word)}</div>`,
        `<div style="font:700 15px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#0f172a;margin-top:3px">${escapeHtml(f.label)}</div>`,
        `<div style="font:400 14px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#475569;margin-top:4px">${escapeHtml(f.detail)}</div>`,
        `</div></td></tr>`,
      ].join("");
    })
    .join("");

  // Said plainly rather than buried: a check we could not read is not a check
  // the site failed, and a report that blurs those two is worthless.
  const unmeasured =
    input.unmeasuredCount && input.unmeasuredCount > 0
      ? `<p style="font:400 13px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#64748b;margin:0 0 18px">${input.unmeasuredCount} further ${input.unmeasuredCount === 1 ? "check" : "checks"} could not be read from your page's HTML — usually because the content is drawn by JavaScript. ${input.unmeasuredCount === 1 ? "It is" : "They are"} left out of the score entirely rather than counted against you.</p>`
      : "";

  const titleLine = input.title
    ? `<p style="font:400 13px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#64748b;margin:0 0 18px">Page title read: “${escapeHtml(input.title)}”</p>`
    : "";

  return [
    `<div style="background:#f8fafc;padding:24px 12px">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">`,
    `<tr><td style="padding:28px 28px 0">`,
    `<div style="font:700 12px/1.4 -apple-system,Segoe UI,Arial,sans-serif;color:#059669;letter-spacing:.12em;text-transform:uppercase">MarketWar OS · Website report</div>`,
    `<h1 style="font:800 24px/1.25 -apple-system,Segoe UI,Arial,sans-serif;color:#0f172a;margin:10px 0 6px">${host} scored ${input.score}/100</h1>`,
    `<p style="font:400 15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#475569;margin:0 0 4px">Grade ${escapeHtml(input.grade)} — ${fails} ${fails === 1 ? "thing is" : "things are"} costing you traffic and ${warns} ${warns === 1 ? "is" : "are"} worth fixing.</p>`,
    `<p style="font:400 13px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#64748b;margin:0 0 18px">Measured on <a href="${safeUrl}" style="color:#0f766e">${safeUrl}</a> when you ran it. Nothing below is an estimate or an industry average.</p>`,
    titleLine,
    `</td></tr>`,
    `<tr><td style="padding:0 28px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table></td></tr>`,
    `<tr><td style="padding:0 28px">${unmeasured}</td></tr>`,
    `<tr><td style="padding:4px 28px 28px;border-top:1px solid #e2e8f0">`,
    `<p style="font:400 13px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#64748b;margin:16px 0 0">You asked for this report on our website audit page. That is the only reason you have it, and it is the only thing we will send unless you ask for more.</p>`,
    `</td></tr></table></div>`,
  ].join("");
}
