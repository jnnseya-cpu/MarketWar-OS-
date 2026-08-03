// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// See it before two thousand people do.
//
// The Email Centre could send from three places — something typed by hand,
// something the writer generated, a saved template — and none of them showed
// what would actually arrive. The editor rendered the template's own HTML,
// which is not the same thing: the send path merges each contact's fields,
// injects a tracking pixel, rewrites every link through the click redirector
// and appends an unsubscribe block. A campaign that looks right in the editor
// can still go out with a raw `{{ salesRep }}` in the greeting.
//
// SO THIS RUNS THE SEND PATH. Not an approximation of it, not a second
// renderer that drifts — the same mergeTemplate and the same injectTracking the
// campaign will call, in the same order, against a real contact from the real
// list. If the preview and the delivered mail can ever differ, the preview is
// worthless precisely when it matters.
//
// AND IT PREVIEWS A REAL RECIPIENT, not a specimen "John Smith". A made-up
// contact has every field filled in, which is the one case that never goes
// wrong. The contact whose first name is blank is the one you need to look at,
// because that is where the fallback fires or the sentence breaks.

import { mergeTemplate } from "@/backend/email-templates";
import { injectTracking, unsubscribeUrl, trackingBaseFor } from "@/backend/email-events";
import { fixTokens, tokenWarnings, usedTokens } from "@/shared/merge-tokens";
import type { Contact } from "@/backend/contacts";

export type PreviewSource = "written" | "ai" | "template";

export type PreviewCheck = {
  level: "blocker" | "warning";
  /** What is wrong, in the terms of what it does to the recipient. */
  message: string;
  /** Where to look. */
  where: "subject" | "body" | "list";
};

export type PreviewSample = {
  /** The real contact this shows, masked — a preview is not a reason to print a list. */
  to: string;
  name: string;
  subject: string;
  html: string;
  /** What a text-only client, a watch, or a screen reader gets. */
  text: string;
  /** The grey line beside the subject in most inboxes. */
  preheader: string;
};

export type EmailPreview = {
  source: PreviewSource;
  /** Eligible recipients this would go to. */
  recipients: number;
  samples: PreviewSample[];
  checks: PreviewCheck[];
  /** True when nothing blocks the send. The UI gates the button on this. */
  sendable: boolean;
  tokensUsed: string[];
  note: string;
};

// ---------------------------------------------------------------------------
// HTML → text. Not a general converter; a faithful-enough one for the two jobs
// that matter: the plain-text part, and the preheader an inbox shows.
// ---------------------------------------------------------------------------

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

const maskEmail = (e: string): string => {
  const [local = "", domain = ""] = String(e).split("@");
  if (!domain) return e;
  const shown = local.slice(0, 2);
  return `${shown}${local.length > 2 ? "…" : ""}@${domain}`;
};

// ---------------------------------------------------------------------------
// The checks. Every one of these is a way a campaign goes out wrong, and every
// one of them is visible before it does.
// ---------------------------------------------------------------------------

export function previewChecks(input: {
  subject: string;
  html: string;
  rendered: { subject: string; html: string }[];
  recipients: number;
  /** Per token: how many eligible contacts have no value for it. */
  blankByToken?: Record<string, number>;
}): PreviewCheck[] {
  const checks: PreviewCheck[] = [];
  const add = (level: PreviewCheck["level"], where: PreviewCheck["where"], message: string) =>
    checks.push({ level, where, message });

  if (!input.subject.trim()) {
    add("blocker", "subject", "There is no subject line. Most clients show the message as “(no subject)”, and most filters treat it as spam.");
  }

  // THE ONE THAT MATTERS MOST. A token the merge does not know survives to the
  // inbox verbatim, on every copy.
  for (const [label, field] of [["subject", "subject"], ["body", "body"]] as const) {
    const raw = label === "subject" ? input.subject : input.html;
    const broken = fixTokens(raw).removed;
    if (broken.length) {
      add("blocker", field, `The ${label} uses ${broken.map((b) => `{{ ${b} }}`).join(", ")}, which is not a field we hold. Every recipient gets a gap there — or the raw text — because there is nothing to merge in.`);
    }
  }

  // And the belt-and-braces version: whatever the reason, a brace pair that
  // survived the merge is going to be read by a person.
  for (const r of input.rendered) {
    if (/\{\{|\}\}/.test(r.subject)) {
      add("blocker", "subject", `A merge tag survived into the finished subject: “${r.subject.trim().slice(0, 80)}”. That is what lands in the inbox.`);
      break;
    }
  }
  for (const r of input.rendered) {
    if (/\{\{|\}\}/.test(r.html)) {
      add("blocker", "body", "A merge tag survived into the finished body — the recipient sees the braces.");
      break;
    }
  }

  // A TOKEN WITH NO FALLBACK, ON CONTACTS THAT HAVE NO VALUE FOR IT.
  //
  // shared/merge-tokens defines a sensible default for every token that can
  // plausibly be missing — "there", "your business", "your area" — but those
  // are applied by fixTokens(), which rewrites the template text. The send path
  // calls mergeTemplate directly and never sees them. So a template TYPED BY
  // HAND with a bare {{ firstName }} merges to nothing for a contact with no
  // name, and "Hi ," goes out. The fix is one keystroke, and this says which
  // keystroke and how many people it saves.
  const raw = `${input.subject} ${input.html}`;
  for (const [token, blanks] of Object.entries(input.blankByToken ?? {})) {
    if (!blanks) continue;
    const bare = new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "i");
    if (!bare.test(raw)) continue; // it already has a fallback
    add(
      "warning",
      new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, "i").test(input.subject) ? "subject" : "body",
      `{{ ${token} }} has no fallback and ${blanks} contact(s) on this list have no value for it — they receive the sentence with a gap in it ("Hi ,"). Write {{ ${token} | there }} and they get something that reads.`,
    );
  }

  // A subject that renders empty for a real contact.
  for (const r of input.rendered) {
    if (input.subject.trim() && !r.subject.trim()) {
      add("blocker", "subject", "The subject renders empty for at least one contact on this list — every token in it resolved to nothing for them.");
      break;
    }
  }

  const subj = input.subject.trim();
  if (subj.length > 60) {
    add("warning", "subject", `The subject is ${subj.length} characters. Most inboxes cut it around 60, and phones nearer 35 — the end of it will not be read.`);
  }
  if (subj.length >= 8 && subj === subj.toUpperCase() && /[A-Z]{4,}/.test(subj)) {
    add("warning", "subject", "The subject is in capitals. Filters weight that heavily and readers hear it as shouting.");
  }
  if ((subj.match(/!/g) || []).length >= 2) {
    add("warning", "subject", "Several exclamation marks in the subject. It is one of the oldest spam signals there is.");
  }

  // Links. A campaign with nothing to click cannot be measured; a campaign with
  // a dead link wastes the click it did earn.
  const hrefs = [...input.html.matchAll(/href\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1].trim());
  const real = hrefs.filter((h) => h && h !== "#" && !h.startsWith("mailto:") && !h.startsWith("tel:"));
  if (hrefs.some((h) => !h || h === "#")) {
    add("blocker", "body", "There is a link that points nowhere (href=\"#\" or empty). A reader who clicks it gets nothing, and it is usually the call to action.");
  }
  if (real.some((h) => /^http:\/\//i.test(h))) {
    add("warning", "body", "A link uses http rather than https. Some clients warn on it and some corporate filters strip it.");
  }
  if (!real.length) {
    add("warning", "body", "There is nothing to click. Nothing can be measured from this send, and there is no next step for the reader.");
  }

  // Images. Most clients still block them by default on a first message.
  const imgs = [...input.html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const missingAlt = imgs.filter((t) => !/\balt\s*=/i.test(t) && !/width\s*=\s*["']?1["']?/i.test(t));
  if (missingAlt.length) {
    add("warning", "body", `${missingAlt.length} image(s) have no alt text. With images off — which is the default in a lot of clients — that part of the message is simply blank.`);
  }

  if (!input.recipients) {
    add("blocker", "list", "There is nobody to send to: no contact on this list has an email address and consent.");
  }

  // The grammar problems that are legal but read badly on a real list.
  for (const w of tokenWarnings(`${input.subject} ${input.html}`)) add("warning", "body", w);

  return checks;
}

// ---------------------------------------------------------------------------
// The preview itself.
// ---------------------------------------------------------------------------

export async function buildEmailPreview(input: {
  brandId: string;
  subject: string;
  html: string;
  brandName?: string;
  /** The real list. Eligibility is decided the same way the send decides it. */
  contacts: Contact[];
  campaign?: string;
  source: PreviewSource;
  /** Ignore consent when previewing a status-targeted prospect segment. */
  statusFilter?: string;
  samples?: number;
}): Promise<EmailPreview> {
  const brandName = input.brandName ?? "";
  const campaign = input.campaign ?? "";
  // Per-brand: a customer who verified their own email.<domain> CNAME gets
  // their own tracking host, and the preview must show the link that will
  // actually be sent, not the platform default.
  const base = await trackingBaseFor(input.brandId);

  // Eligibility mirrors the campaign route exactly. A preview against a
  // different population than the send would report a recipient count nobody
  // is going to receive.
  const pool = input.statusFilter
    ? input.contacts.filter((c) => (c.status || "").toLowerCase() === input.statusFilter!.toLowerCase())
    : input.contacts;
  const eligible = input.statusFilter
    ? pool.filter((c) => c.email)
    : pool.filter((c) => c.email && c.consent !== false);

  const wanted = Math.max(1, Math.min(5, input.samples ?? 3));
  // Prefer contacts with a MISSING first name in the sample. Those are the ones
  // where a fallback fires or a sentence breaks, and a preview made entirely of
  // complete records shows only the case that was never going to fail.
  const ranked = [...eligible].sort((a, b) => score(a) - score(b));
  const chosen = ranked.slice(0, wanted);

  const samples: PreviewSample[] = chosen.map((contact) => {
    const to = String(contact.email);
    // THE SEND PATH, in the send path's order.
    const subject = mergeTemplate(input.subject, { contact, brand: brandName });
    const merged = mergeTemplate(input.html, { contact, brand: brandName });
    const html = injectTracking(merged, input.brandId, to, campaign, base);
    return {
      to: maskEmail(to),
      name: String(contact.name || "").trim(),
      subject,
      html,
      text: htmlToText(html),
      preheader: preheaderOf(merged),
    };
  });

  // Counted across the WHOLE eligible list, not just the sampled few — the
  // question is how many people receive a broken sentence, and three samples
  // cannot answer it.
  const blankByToken: Record<string, number> = {};
  for (const token of usedTokens(`${input.subject} ${input.html}`)) {
    blankByToken[token] = eligible.filter((c) => !valueOf(c, token, brandName)).length;
  }

  const checks = previewChecks({
    subject: input.subject, html: input.html,
    rendered: samples.map((s) => ({ subject: s.subject, html: s.html })),
    recipients: eligible.length,
    blankByToken,
  });
  const blockers = checks.filter((c) => c.level === "blocker").length;

  return {
    source: input.source,
    recipients: eligible.length,
    samples,
    checks,
    sendable: blockers === 0 && eligible.length > 0,
    tokensUsed: usedTokens(`${input.subject} ${input.html}`),
    note: [
      samples.length
        ? `This is the finished message for ${samples.length === 1 ? "a real contact" : `${samples.length} real contacts`} on this list — merged, tracked, and with the unsubscribe line the send appends. Not a mock-up of it.`
        : "Nothing to preview: no eligible contact on this list.",
      blockers
        ? `${blockers} thing(s) would go wrong for every recipient. Sending is blocked until they are fixed.`
        : checks.length
          ? `${checks.length} thing(s) worth a look. None of them stops the send.`
          : "Nothing found that would go wrong.",
      // The unsubscribe link is per-recipient and signed, so it is real in the
      // preview too — and that is worth saying, because a preview that silently
      // shows a dead one teaches people not to check it.
      samples.length ? "The unsubscribe link is this recipient's own signed link; it works." : "",
    ].filter(Boolean).join(" "),
  };
}

/** What a given token resolves to for one contact — mirrors contactValues. */
function valueOf(c: Contact, token: string, brand: string): string {
  const name = String(c.name || "").trim();
  switch (token) {
    case "firstName": return name.split(/\s+/)[0] || "";
    case "name": return name;
    case "email": return String(c.email || "").trim();
    case "company": return String(c.company || "").trim();
    case "trade": return String(c.trade || "").trim();
    case "town": return String(c.town || "").trim();
    case "area": return String(c.area || "").trim();
    case "brand": return brand.trim();
    default: return "";
  }
}

/** Lower sorts first: the incomplete records are the interesting ones. */
function score(c: Contact): number {
  let n = 0;
  // firstName is derived from `name` by contactValues — a contact with no name
  // at all is exactly where "Hi {{ firstName }}" falls back to "Hi there", and
  // that substitution is the thing worth seeing before it goes out.
  if (String(c.name || "").trim()) n += 2;
  if (String(c.company || "").trim()) n += 1;
  if (String(c.town || "").trim()) n += 1;
  return n;
}

/** The per-recipient one-click unsubscribe header value, for display. */
export async function previewUnsubscribeHeader(brandId: string, email: string, campaign = ""): Promise<string> {
  return unsubscribeUrl(brandId, email, campaign, await trackingBaseFor(brandId));
}
