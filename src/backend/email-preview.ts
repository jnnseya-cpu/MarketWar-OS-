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
import { selectByGroups } from "@/shared/contact-groups";
import { looksUnwritten } from "@/backend/email-template-writer";
// The preview's text and preheader come from the SAME converter the wire
// builder uses, so what this screen shows is what the recipient's text
// alternative actually says. Re-exported because callers and tests import them
// from here, and the additive rule keeps that surface working.
import { htmlToText, preheaderOf, textPartFrom } from "@/shared/html-text";
export { htmlToText, preheaderOf };
import { registrableDomain } from "@/shared/mail-host";

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
  /**
   * How many contacts the status/group selection matched, BEFORE email and
   * consent were applied. It separates "the selection is empty" from "the
   * selection is fine and those people have no usable address" — two different
   * faults with two different fixes, which used to share one sentence.
   */
  matched?: number;
  /** True when a status or group selection was actually applied. */
  narrowed?: boolean;
  /** Per token: how many eligible contacts have no value for it. */
  blankByToken?: Record<string, number>;
  /** The From address the send will use — needed to judge link alignment. */
  fromEmail?: string;
  /** The tracking host every link is rewritten through. */
  trackingBase?: string;
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

  // AN OUTLINE IS NOT AN EMAIL, AND THIS PANEL SAID IT WAS.
  //
  // WHAT HAPPENED. The AI writer failed ("the model did not return usable
  // JSON"), the honest structural outline was returned instead and landed in the
  // editor — and this preview then reported "Nothing found that would go wrong.
  // 836 recipients." beside a body reading "They bought before and have gone
  // quiet. Acknowledge the gap without guilt-tripping…", which is the internal
  // brief handed to the model. One click from 836 people receiving it.
  //
  // A BLOCKER, not a warning: "no placeholder or faked data inside anything
  // represented as finished" is a rule of this platform, and the preview is the
  // last thing standing between an outline and a customer's list.
  if (looksUnwritten(`${input.subject} ${input.html}`)) {
    add("blocker", "body", "This is still the outline, not written copy — it contains the instructions the writer was given rather than a message to your customers. Replace the body before sending.");
  }

  if (!input.recipients) {
    // NAME THE CAUSE THAT ACTUALLY APPLIES. This said "no contact on this list
    // has an email address and consent" whatever the reason — including when the
    // list was full of perfectly good addresses and a status or group selection
    // had simply matched nobody. Being told your contacts have no email, about
    // contacts that do, sends somebody to fix the vault instead of the filter.
    add("blocker", "list",
      input.matched === 0
        ? (input.narrowed
            ? "There is nobody to send to: the status or group you selected matches no contact at all. The addresses are fine — the selection is what is empty."
            : "There is nobody to send to: this list has no contacts in it yet.")
        : `There is nobody to send to: ${input.matched} contact(s) match, but none of them has both an email address and consent. Add addresses, or send to a selection that has them.`);
  }

  // ---- WHERE THIS WILL LAND, HONESTLY -------------------------------------
  //
  // A campaign is bulk mail. It carries one-click unsubscribe because every
  // large receiver now requires that of bulk mail — and that header is also the
  // clearest signal a classifier has that a message is marketing. So a campaign
  // usually lands in Promotions, and nothing here will pretend otherwise: the
  // way to reach somebody's Primary tab is to write to them personally from the
  // vault, not to dress marketing up as a personal note. Stripping the header to
  // chase the tab does not move the message to Primary; it moves it to spam, and
  // it takes the domain's personal mail down with it.
  //
  // What these three check is the difference between a campaign filed under
  // Promotions and one filed under spam, which is the difference that matters.

  // THE LINK DOMAIN. Every link is rewritten through the tracking host so the
  // click can be counted. When the customer has not verified their own sending
  // domain that host is ours, so mail claiming to come from their business
  // carries links to somebody else's domain — the shape of a phishing message,
  // and weighed accordingly.
  const fromDomain = registrableDomain(String(input.fromEmail || "").split("@")[1] || "");
  const linkDomain = registrableDomain(String(input.trackingBase || "").replace(/^https?:\/\//, "").split("/")[0] || "");
  if (fromDomain && linkDomain && fromDomain !== linkDomain) {
    add("warning", "body", `The message comes from ${fromDomain} but every link in it points at ${linkDomain}. Receivers weigh that mismatch heavily — it is the shape of a phishing message. Verify ${fromDomain} in Sending Domains and the links move onto it.`);
  }

  // THE TEXT ALTERNATIVE. Every message now goes out with one; a body that
  // yields no readable text produces an empty one, which is the case a filter
  // scores worst — and is what a watch or a screen reader is left with.
  const plain = textPartFrom(input.html).trim();
  if (input.html.trim() && !plain) {
    add("warning", "body", "This body produces no readable plain text, so the text alternative every message carries would be empty. That is the version a watch, a screen reader and most spam filters read.");
  } else if (imgs.length >= 3 && plain.length < 200) {
    add("warning", "body", `${imgs.length} images and ${plain.length} characters of text. A message that is mostly picture is read as an advert by filters and shows as a blank rectangle wherever images are off.`);
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
  /**
   * The named vault groups the campaign is aimed at — the SAME selection the
   * send applies.
   *
   * IT WAS MISSING, AND THAT IS THE WHOLE POINT OF A PREVIEW. Groups were added
   * to the send path and not to this one, so the panel headed "what actually
   * arrives" was computed against a different audience from the one that would
   * receive it. An empty selection is everyone, exactly as on the send.
   */
  groups?: string[];
  samples?: number;
  /**
   * The From address the send will use. Optional, because the panel can be
   * opened before one is chosen — and when it is absent the link-alignment
   * check stays silent rather than guessing at a domain.
   */
  fromEmail?: string;
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
  const byStatus = input.statusFilter
    ? input.contacts.filter((c) => (c.status || "").toLowerCase() === input.statusFilter!.toLowerCase())
    : input.contacts;
  // The same module the send calls, not a second copy of the rule — two
  // implementations of "who is in this group" is how a preview and a send come
  // to disagree in the first place.
  const groupFilter = (input.groups ?? []).filter((g) => typeof g === "string" && g.trim().length > 0);
  const pool = groupFilter.length ? selectByGroups(byStatus, groupFilter) : byStatus;
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
      // THE TEXT THE RECIPIENT ACTUALLY GETS. `htmlToText` drops every link, so
      // the preview showed a text version stripped of the very thing the message
      // asks the reader to do. The wire sends `textPartFrom`, so this does too.
      text: textPartFrom(html),
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
    matched: pool.length,
    narrowed: Boolean(input.statusFilter) || groupFilter.length > 0,
    blankByToken,
    // The two values the placement checks need. `base` is already resolved
    // above — the host every link in this campaign is rewritten through.
    fromEmail: input.fromEmail,
    trackingBase: base,
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
