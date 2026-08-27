// WHO THE MESSAGE IS FROM — all three answers, reconciled in one place.
//
// THE BUG THIS EXISTS TO KILL. A single send used THREE different addresses and
// no two of them agreed:
//
//   AUTH LOGIN   appuser@marketwaros.com    the mailbox that actually exists
//   MAIL FROM    bounce@marketwaros.com     a default invented in code
//   From:        info@marketwaros.com       what the owner wants people to see
//
// The relay accepted it and returned a queue id, so every check we had said the
// send worked. Nothing was ever delivered, and — this is the part that made it
// take a month — nothing bounced either, because the Return-Path pointed at a
// mailbox nobody had created. THE DELIVERY FAILURE DESTROYED ITS OWN EVIDENCE.
//
// THE RULE, and it is one rule:
//
//   AN ENVELOPE SENDER MUST BE A MAILBOX THAT ACTUALLY EXISTS. A default
//   invented in source code is not configuration, and `bounce@` on a domain
//   nobody has set up is not a mailbox — it is a hole with an @ in it.
//
// So the envelope sender is, in order of preference:
//   1. an EXPLICITLY CONFIGURED bounce address (MW_BOUNCE_ADDRESS, or a VERP
//      address on a configured MW_BOUNCE_HOST) — somebody stated it, so it is
//      real and its bounces get processed;
//   2. otherwise the AUTHENTICATED ACCOUNT. It exists by definition: the relay
//      just accepted its password. Bounces come back to a mailbox somebody can
//      open, and the envelope identity matches the login, which is what most
//      relays actually check before they decide whether to deliver.
//   3. otherwise the visible From, which is the old behaviour and the last
//      resort — used when there is no account either (HTTP providers).
//
// WHAT THIS DELIBERATELY DOES NOT DO: rewrite the visible From. The owner's
// instruction is that `info@` is the main address for everything, and a tool
// that quietly changes the name on outgoing mail because it thinks it knows
// better is a tool nobody can trust with their correspondence. `From:` is
// carried through untouched; when it is not the account that logged in, RFC 5322
// §3.6.2 has a header for exactly that situation and we emit it (`Sender:`), so
// the message declares the arrangement instead of looking forged.

/** The bare address out of `Name <a@b.com>` or `a@b.com`. Lower-cased. */
export function mailboxOf(addr: string): string {
  const raw = String(addr ?? "").trim();
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

/** Deliberately the same shape the audit and the signup form use. */
export function isAddress(value: string): boolean {
  return /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(String(value ?? "").trim());
}

/** The domain half, or "" when there is not one. */
export function domainOf(addr: string): string {
  const at = mailboxOf(addr).lastIndexOf("@");
  return at > 0 ? mailboxOf(addr).slice(at + 1) : "";
}

export type SenderIdentity = {
  /** What the recipient sees. NEVER rewritten. */
  headerFrom: string;
  /** MAIL FROM / Return-Path — where a bounce goes and what SPF authenticates. */
  envelopeFrom: string;
  /**
   * RFC 5322 `Sender:` — the account that actually submitted the message, set
   * only when that is not the mailbox in `From`. Empty means From IS the sender
   * and the header must be omitted; emitting `Sender:` equal to `From:` is a
   * spam signal rather than a nicety.
   */
  senderHeader: string;
  /** True when the account, the envelope and the From are one mailbox. */
  aligned: boolean;
  /** Whether the envelope sender was chosen or merely defaulted into. */
  envelopeSource: "configured-bounce" | "authenticated-account" | "from-header";
  /** One sentence, for the ledger, the health check and the log. */
  why: string;
};

/**
 * Reconcile the three addresses for one send.
 *
 * Pure: no env, no I/O, no clock. Every caller passes what it already has, so
 * the sender, the batch sender and the health check cannot disagree about what
 * a real send does — which they have twice, and each time the disagreement was
 * what made the fault untraceable.
 */
export function resolveSender(input: { from: string; authUser?: string; bounce?: string }): SenderIdentity {
  const headerFrom = String(input.from ?? "").trim();
  const fromBox = mailboxOf(headerFrom);
  const account = mailboxOf(input.authUser || "");
  const bounce = mailboxOf(input.bounce || "");

  const accountUsable = isAddress(account);
  const bounceUsable = isAddress(bounce);

  const envelopeFrom = bounceUsable ? bounce : accountUsable ? account : fromBox;
  const envelopeSource: SenderIdentity["envelopeSource"] =
    bounceUsable ? "configured-bounce" : accountUsable ? "authenticated-account" : "from-header";

  // Only when the account is a real address AND is not the From mailbox. With no
  // account (an HTTP provider) there is no submitter to declare.
  const senderHeader = accountUsable && account !== fromBox ? account : "";

  const aligned = Boolean(fromBox) && fromBox === envelopeFrom && (!accountUsable || account === fromBox);

  const why = aligned
    ? `Account, envelope and From are all <${fromBox}>.`
    : envelopeSource === "configured-bounce"
      ? `From <${fromBox}>, sent by <${account || "no account"}>, bounces to the configured <${bounce}>.`
      : envelopeSource === "authenticated-account"
        ? `From <${fromBox}> is not the account that logs in (<${account}>), so the envelope and Sender: are the account — bounces reach a mailbox that exists.${sameOrganisation(account, fromBox) ? " Both are on one domain, so SPF and DMARC align and there is nothing to change." : ` They are on different domains, so DMARC will not align — see the remedy.`}`
        : `From <${fromBox}>, with no authenticated account to fall back on.`;

  return { headerFrom, envelopeFrom, senderHeader, aligned, envelopeSource, why };
}

/**
 * Are these two mailboxes on the same organisational domain?
 *
 * WHY IT DECIDES ANYTHING. DMARC does not compare mailboxes, it compares
 * DOMAINS, and its relaxed policy — the default — passes when the envelope
 * domain and the From domain share an organisational domain. So
 * `appuser@marketwaros.com` sending as `info@marketwaros.com` is ALIGNED to
 * every receiver on earth, and `os@notifications.marketwaros.com` is too.
 *
 * Deliberately conservative: equal, or one a subdomain of the other. It never
 * tries to work out a registrable domain, because `co.uk` makes that a public
 * suffix list rather than a string operation, and a wrong "same organisation"
 * would tell somebody their mail is fine when it is being rejected.
 */
export function sameOrganisation(a: string, b: string): boolean {
  const x = domainOf(a), y = domainOf(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

/**
 * The operator's fix for a misaligned sender, or "" when there is nothing wrong.
 *
 * Named here rather than in a runbook because a policy written in a note is a
 * policy nothing executes — this string is what the health check prints.
 *
 * IT MUST NOT NAG. This string was demanding `SMTP_USER` be changed to the From
 * address on every health check, for a deployment where the two mailboxes sit on
 * one domain and nothing was wrong — so the owner was asked, session after
 * session, to make a change that would have altered nothing. A remedy printed
 * for a condition that is not a fault trains people to ignore remedies, and then
 * the one that matters goes unread too. `aligned` stays false because the three
 * addresses genuinely are not one mailbox and the ledger should record that;
 * whether it is a FAULT is a different question, and this is where it is asked.
 */
export function alignmentRemedy(id: SenderIdentity): string {
  if (id.aligned) return "";
  const from = mailboxOf(id.headerFrom);
  if (id.envelopeSource === "configured-bounce") {
    return `Confirm <${id.envelopeFrom}> is a real mailbox or forward on a domain with SPF, otherwise every bounce is silently discarded and a delivery failure leaves no trace.`;
  }
  if (id.envelopeSource === "authenticated-account") {
    // Same domain: DMARC-aligned, bounces land in a real mailbox, `Sender:`
    // declares the arrangement. Nothing to do — and saying so is the point.
    if (sameOrganisation(id.envelopeFrom, from)) return "";
    return `Mail is sent as <${id.envelopeFrom}> but signed From <${from}>, and they are on DIFFERENT domains, so SPF authenticates one domain while the recipient reads another — DMARC fails. Either set EMAIL_FROM to an address on ${domainOf(id.envelopeFrom)}, or set SMTP_USER to ${from} with that mailbox's own password.`;
  }
  return `There is no authenticated account, so nothing proves this deployment may send as <${from}>.`;
}
