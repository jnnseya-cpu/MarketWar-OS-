// WHAT KIND OF MAILBOX IS THIS — one answer, used by every module that asks.
//
// THE DEFECT THIS EXISTS TO FIX, measured before it was written. Two modules
// classified the same address and gave opposite answers:
//
//   • `backend/lead-harvest.ts` held GENERIC_MAILBOXES and called `info@` the
//     LOWEST-risk, most lawful contact a business can have — "generic corporate
//     mailbox, legitimate interests is available" — and scored a role account at
//     75 out of 100 in the hunter's readiness model.
//   • `backend/email.ts` held ROLE_LOCALPARTS and refused to SEND to it:
//     "role address — excluded from marketing sends by default".
//
// So the platform found a business's front door, told the customer it was the
// best address on the page, and then would not mail it. Worse, the two lists did
// not even agree with each other: `hello@` and `enquiries@` were sendable while
// `info@`, `sales@`, `contact@`, `office@` and `support@` were not, for no
// reason other than which of two hand-written lists a word had landed in.
//
// ONE SOURCE OF TRUTH PER CONCEPT. Both now read this file.
//
// AND THE SENDABLE RULE IS NARROWER THAN "ROLE". A role address is not a reason
// to refuse; `info@` and `sales@` are where a business asks to be contacted, and
// for B2B they are usually the ONLY published address. What is a reason to refuse
// is a mailbox whose purpose makes marketing mail to it actively harmful, and
// there are only two kinds:
//
//   • THE ABUSE CHANNEL. `abuse@`, `postmaster@`, `hostmaster@` are the RFC 2142
//     addresses that route to a domain's mail administrators. Marketing mail
//     arriving there is reported and blocklisted — sending it is reporting
//     yourself as a spammer to the one person who can act on it.
//   • THE SEND-ONLY MAILBOX. `noreply@`, `mailer-daemon@`, `bounce@` are not
//     read by anybody and frequently reject mail outright, so a message there is
//     a bounce by construction.
//
// Everything else is a business mailbox and gets mailed.

/**
 * What this address is FOR.
 *
 * `system` is the only value that stops a send. `business` and `person` are
 * reported because they want different copy — "Hi there" to a shared mailbox and
 * a name to a person — never because one of them is unmailable.
 */
export type MailboxRole = "system" | "business" | "person";

/**
 * NEVER MAILED, and the list is deliberately short.
 *
 * Every entry is a mailbox where arriving marketing mail does measurable harm to
 * the sender: the first five reach a domain's abuse desk, the rest are unread or
 * reject by design. A word is not in this list because it looks impersonal.
 */
export const SYSTEM_LOCALPARTS: ReadonlySet<string> = new Set([
  // RFC 2142 operations mailboxes — the abuse desk and the mail administrators.
  "abuse", "postmaster", "hostmaster", "spam", "spamreport",
  // Send-only and automated. Mail here is unread, or refused by the host.
  "noreply", "no-reply", "donotreply", "do-not-reply", "nobody",
  "mailer-daemon", "mailerdaemon", "bounce", "bounces", "bounce-handler",
  "undisclosed-recipients", "root", "daemon",
]);

/**
 * SHARED BUSINESS MAILBOXES — mailable, and for B2B usually the best address on
 * the page.
 *
 * This list exists for LABELLING, not for gating: an address not in it is
 * treated as a person's mailbox, which is also mailable. Its only jobs are to
 * let a surface say "this is a shared mailbox, so do not open with a first name"
 * and to tell the compliance engine that no individual is identified by it.
 */
export const BUSINESS_LOCALPARTS: ReadonlySet<string> = new Set([
  "info", "sales", "contact", "contactus", "hello", "hi", "enquiries", "enquiry",
  "inquiries", "inquiry", "office", "admin", "administration", "reception",
  "support", "help", "helpdesk", "service", "customerservice", "customercare",
  "accounts", "accounting", "billing", "invoices", "finance", "payments",
  "marketing", "press", "media", "pr", "partnerships", "partner", "business",
  "bookings", "booking", "orders", "order", "quotes", "quote", "estimates",
  "jobs", "careers", "recruitment", "hr", "procurement", "purchasing", "buying",
  "newsletter", "team", "mail", "email", "general", "post", "shop", "store",
  "webmaster", "security", "privacy", "legal", "dpo", "compliance",
]);

/**
 * CONSUMER MAILBOX PROVIDERS — the union of the lists this codebase already had
 * in three places, because an address at one of these is a PERSON's own mailbox
 * and that changes what may lawfully be sent to it (see `subscriberType`).
 *
 * `backend/deliverability.ts` keeps its own grouping deliberately: it needs
 * LABELS ("Microsoft" covers nine domains) to judge reputation per filter, which
 * is a different question from "is this somebody's personal mailbox".
 */
export const CONSUMER_MAILBOX_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "outlook.co.uk", "outlook.fr", "outlook.de", "outlook.es",
  "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.it",
  "live.com", "live.co.uk", "live.fr", "live.nl", "msn.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.fr", "yahoo.de", "yahoo.ca", "yahoo.com.au",
  "ymail.com", "rocketmail.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "aol.co.uk",
  "protonmail.com", "proton.me", "pm.me",
  "gmx.com", "gmx.de", "gmx.net", "web.de", "mail.com", "email.com",
  "zoho.com", "fastmail.com", "hushmail.com", "tutanota.com", "tuta.com",
  // UK ISP mailboxes — very common for sole traders and small trades.
  "btinternet.com", "btopenworld.com", "virginmedia.com", "blueyonder.co.uk",
  "sky.com", "talktalk.net", "tiscali.co.uk", "ntlworld.com", "plus.net",
  "orange.fr", "wanadoo.fr", "free.fr", "laposte.net", "sfr.fr",
  "t-online.de", "libero.it", "virgilio.it", "terra.es", "telefonica.net",
]);

/** Disposable / burner domains — a bounce and a spam-trap risk, never mailed. */
export const DISPOSABLE_MAILBOX_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwaway.email", "yopmail.com", "sharklasers.com",
  "getnada.com", "trashmail.com", "fakeinbox.com", "dispostable.com",
  "maildrop.cc", "mintemail.com", "mohmal.com", "emailondeck.com",
  "tempr.email", "discard.email", "spam4.me", "grr.la",
]);

const localOf = (email: string): string =>
  String(email ?? "").trim().toLowerCase().split("@")[0] ?? "";

export const domainOf = (email: string): string =>
  String(email ?? "").trim().toLowerCase().split("@")[1] ?? "";

/**
 * What this mailbox is for.
 *
 * A trailing digit or a department suffix is stripped before the lookup —
 * `sales2@`, `info-uk@` and `support.london@` are the same kind of mailbox as
 * the bare word, and a list written without that produces a platform that mails
 * `info@` and refuses `info-uk@`.
 */
export function mailboxRole(email: string): MailboxRole {
  const local = localOf(email);
  if (!local) return "person";
  const stem = local
    .replace(/[+].*$/, "")              // info+tag@ is still info@
    .replace(/[._-]?\d+$/, "")          // sales2, info_2
    .replace(/[._-](uk|us|eu|gb|ie|team|dept|department|group)$/, "");
  for (const candidate of [local, stem]) {
    if (SYSTEM_LOCALPARTS.has(candidate)) return "system";
  }
  for (const candidate of [local, stem]) {
    if (BUSINESS_LOCALPARTS.has(candidate)) return "business";
  }
  return "person";
}

/** True when marketing mail to this mailbox would harm the sender. See above. */
export const isSystemMailbox = (email: string): boolean => mailboxRole(email) === "system";

/** True for a shared business mailbox — mailable, but nobody's first name. */
export const isBusinessMailbox = (email: string): boolean => mailboxRole(email) === "business";

export const isConsumerMailbox = (email: string): boolean =>
  CONSUMER_MAILBOX_DOMAINS.has(domainOf(email));

export const isDisposableMailbox = (email: string): boolean =>
  DISPOSABLE_MAILBOX_DOMAINS.has(domainOf(email));

/**
 * CORPORATE OR INDIVIDUAL SUBSCRIBER — the distinction UK law actually draws,
 * and the one this platform was getting wrong.
 *
 * PECR regulation 22 (consent before unsolicited electronic marketing) applies
 * to an INDIVIDUAL SUBSCRIBER. A limited company, LLP, Scottish partnership or
 * public body is a CORPORATE subscriber and regulation 22 does not apply to it —
 * which is why B2B email marketing is lawful in the UK without consent, with
 * identification, an opt-out and the right to object, and why the ICO's own
 * guidance separates the two.
 *
 * `info@company.co.uk` and `dave@company.co.uk` are BOTH corporate subscribers.
 * The named one is additionally personal data under the UK GDPR, so it needs a
 * lawful basis for the processing — legitimate interests, with a balancing test
 * — but that is a document the sender writes, not permission the recipient
 * grants. Treating the two as the same thing is what produced "cannot contact
 * until a lawful basis is established" on every named business address in the
 * country.
 *
 * WHAT THIS CANNOT TELL YOU, stated because it matters: a SOLE TRADER or an
 * unincorporated partnership is an INDIVIDUAL subscriber under PECR even on
 * their own domain, and no amount of address parsing reveals which companies
 * those are. So a corporate verdict carries `soleTraderRisk` and the surface
 * says so; marking a contact as a sole trader moves it to the individual rule.
 */
export type SubscriberType = "corporate" | "individual";

export type SubscriberVerdict = {
  type: SubscriberType;
  /** True when the address identifies a person, so UK GDPR applies to it too. */
  personalData: boolean;
  /**
   * TRUE on every corporate verdict reached from a domain alone. A sole trader
   * on their own domain is an individual subscriber and looks identical here.
   */
  soleTraderRisk: boolean;
  why: string;
};

export function subscriberType(email: string, opts: { soleTrader?: boolean } = {}): SubscriberVerdict {
  const role = mailboxRole(email);
  const consumer = isConsumerMailbox(email);
  const personalData = role === "person";

  if (consumer) {
    return {
      type: "individual", personalData: true, soleTraderRisk: false,
      why: `${domainOf(email)} is a consumer mailbox provider, so this is a person's own mailbox — an individual subscriber under PECR. It needs consent, or a soft opt-in from an existing enquiry or purchase.`,
    };
  }
  if (opts.soleTrader) {
    return {
      type: "individual", personalData: true, soleTraderRisk: false,
      why: "Marked as a sole trader or unincorporated partnership, which PECR treats as an individual subscriber even on its own domain. Consent or a soft opt-in is required.",
    };
  }
  return {
    type: "corporate", personalData, soleTraderRisk: true,
    why: personalData
      ? `A named mailbox at ${domainOf(email)} — a corporate subscriber, so PECR regulation 22 does not require consent. It is still personal data, so the lawful basis for the processing is legitimate interests and the balancing test has to be on file.`
      : `A shared mailbox at ${domainOf(email)} — a corporate subscriber identifying no individual, so neither PECR consent nor a UK GDPR lawful basis for personal data is engaged.`,
  };
}

/**
 * COMMON MISTYPED DOMAINS → what was meant.
 *
 * Every key here is a domain that resolves to nothing, so the correction is
 * offered beside a removal rather than applied silently: changing the address
 * somebody typed is a guess about what they meant, and a wrong guess mails a
 * stranger. Shown to the customer, never auto-sent.
 */
export const DOMAIN_TYPOS: Readonly<Record<string, string>> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com", "gmail.con": "gmail.com", "gmil.com": "gmail.com",
  "gnail.com": "gmail.com", "ggmail.com": "gmail.com", "gmaill.com": "gmail.com",
  "hotmai.com": "hotmail.com", "hotmial.com": "hotmail.com", "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com", "hotmaill.com": "hotmail.com", "hotmal.com": "hotmail.com",
  "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com", "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com", "yahhoo.com": "yahoo.com",
  "outlook.co": "outlook.com", "outlok.com": "outlook.com", "outllook.com": "outlook.com",
  "icloud.co": "icloud.com", "iclould.com": "icloud.com",
  "live.co": "live.com", "aol.co": "aol.com",
  "btinternet.co": "btinternet.com", "virgimedia.com": "virginmedia.com",
};

/** What this domain was probably meant to be, or null. Never applied for you. */
export const typoCorrection = (domainOrEmail: string): string | null => {
  const value = String(domainOrEmail ?? "").trim().toLowerCase();
  const domain = value.includes("@") ? domainOf(value) : value;
  return DOMAIN_TYPOS[domain] ?? null;
};

// ---------------------------------------------------------------------------
// MAY THIS ADDRESS RECEIVE A BULK MARKETING EMAIL — one answer, one place.
// ---------------------------------------------------------------------------
//
// THE DEFECT THIS CLOSES, and it is where the owner's report came from. The
// First Customer sprint finds real businesses in public listings and saves them
// to the vault with `consent: false`, with a comment explaining that marking
// them consented "would be a lie". Correct — and then the SENDER read that same
// `false` as a refusal, excluded every one of them, and the list-health panel
// labelled them "No consent recorded — not mailable".
//
// So the platform's own prospecting feature wrote a field the platform's own
// sender treated as "this person asked not to be emailed", about companies that
// had never been asked anything. That is the "pretending they were taken without
// consent" in one line of code, and it is the same boundary defect as always: one
// side wrote `false` meaning "no opt-in on file", the other read it meaning "no".
//
// ABSENCE AND REFUSAL ARE OPPOSITE FACTS. Three states, not two:
//
//   consent === false   they asked not to be emailed. Always excluded. Not a
//                       judgement call and not overridable by any basis.
//   consent === true    opted in. Mailable, whoever they are.
//   consent undefined   NOTHING IS RECORDED — which is not a refusal. For a
//                       corporate subscriber it is fine (PECR regulation 22 does
//                       not apply to one); for a person's own mailbox it is not,
//                       and consent or a soft opt-in is needed.
//
// That last line is the whole rule, and it is why this cannot be fixed by simply
// deleting the consent check: dropping it would make a found `gmail.com` address
// bulk-mailable, which is the case that really is unlawful.

export type MailBasis =
  /** They opted in. */
  | "consent"
  /** PECR's soft opt-in: an existing sale or enquiry, similar products, opt-out offered. */
  | "soft_opt_in"
  /** A corporate subscriber. Lawful with identification, opt-out and the right to object. */
  | "legitimate_interest"
  /** They asked not to be emailed. */
  | "opted_out"
  /** An individual subscriber with nothing on file. */
  | "needs_consent";

export type MailEligibility = {
  mailable: boolean;
  basis: MailBasis;
  /** One sentence, in terms of what is recorded rather than what was assumed. */
  why: string;
};

/**
 * May this address receive a bulk marketing email?
 *
 * PURE, and shared, because the send, the preview and the list-health panel must
 * give the same answer — three implementations of "who receives this" is how a
 * preview comes to disagree with the button underneath it, which this codebase
 * has already paid for twice.
 */
export function bulkEligibility(input: {
  email: string;
  /** `undefined` means nothing is recorded — NOT a refusal. See above. */
  consent?: boolean;
  /** For PECR's soft opt-in. */
  relationship?: "purchase" | "enquiry" | "negotiation" | "none";
  similarProducts?: boolean;
  optOutOfferedAtCollection?: boolean;
  /** A sole trader or unincorporated partnership is an individual subscriber. */
  soleTrader?: boolean;
}): MailEligibility {
  // AN OPT-OUT OUTRANKS EVERY BASIS. Nothing below can reach this.
  if (input.consent === false) {
    return {
      mailable: false, basis: "opted_out",
      why: "This person asked not to be emailed. No lawful basis overrides an objection, and honouring it immediately is itself the requirement.",
    };
  }
  if (input.consent === true) {
    return {
      mailable: true, basis: "consent",
      why: "Consent is on file, which is the strongest basis there is.",
    };
  }

  const sub = subscriberType(input.email, { soleTrader: input.soleTrader });
  if (sub.type === "corporate") {
    return {
      mailable: true, basis: "legitimate_interest",
      why: `${sub.why} Every message carries one-click opt-out and identifies the sender.`,
    };
  }

  // AN INDIVIDUAL SUBSCRIBER. PECR's soft opt-in is the other lawful route, and
  // it needs all three of its conditions — a bought list has none of them.
  const soft = input.relationship && input.relationship !== "none"
    && input.similarProducts === true && input.optOutOfferedAtCollection === true;
  if (soft) {
    return {
      mailable: true, basis: "soft_opt_in",
      why: `The address was obtained during a ${input.relationship}, the marketing is for similar products, and an opt-out was offered at collection — PECR's soft opt-in.`,
    };
  }
  return {
    mailable: false, basis: "needs_consent",
    why: `${sub.why} Nothing is recorded against it, so there is no lawful route to a marketing email yet — this is a missing record, not a refusal by the person.`,
  };
}
