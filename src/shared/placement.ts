// WHERE THE MESSAGE ACTUALLY LANDED — measured, or honestly unknown.
//
// THE QUESTION THIS FINALLY ANSWERS. Every deliverability decision in this
// platform until now was about the SHAPE of a message: authentication, the
// stream it belongs to, the headers it carries, the text part it offers (§135).
// Shape is most of the signal and it is not the answer. The answer is which
// folder a real receiver put it in, and no amount of reasoning about headers
// produces it — the only way to know is to send to a mailbox you own and look.
//
// THE HONESTY RULE, WHICH IS THE WHOLE POINT.
//
// A seed that did not report is NOT an inbox and NOT a spam folder. It is
// `missing`, and a report containing one refuses to quote a placement rate,
// because the arithmetic would be a guess dressed as a measurement. This
// platform has already shipped one report that withheld its own rates when the
// sample could not support them (`eventStats`), and that is the precedent here:
// **an unmeasured share is worse than no share.**
//
// WHAT PLACEMENT MEANS ON EACH RECEIVER, because they do not agree.
//
//   Gmail  — the tab is a LABEL, not a folder. A promoted message is still in
//            `\Inbox`; what distinguishes it is `CATEGORY_PROMOTIONS` in
//            `X-GM-LABELS`. Reading only the folder would report every
//            Promotions message as an inbox hit, which is precisely the lie
//            this module exists to avoid.
//   Others — Microsoft, Yahoo, Apple and self-hosted have no tabs. Junk is a
//            separate folder, so the folder name IS the placement.
//
// Pure and in `shared/` so the reader, the report and the tests all use one
// definition; a second opinion about what "promotions" means is how a dashboard
// and a probe come to disagree.

export type Placement =
  | "inbox"        // the main inbox, no promotional category
  | "promotions"   // Gmail's Promotions tab
  | "updates"      // Gmail's Updates tab
  | "social"       // Gmail's Social tab
  | "forums"       // Gmail's Forums tab
  | "spam"         // junk / spam folder
  | "missing";     // never arrived, or arrived somewhere nothing looked

/** The tabs are still the inbox — filed, not rejected. Useful for the headline number. */
export const REACHED_INBOX: Placement[] = ["inbox", "promotions", "updates", "social", "forums"];

/** Gmail's own label names, mapped to what a person would call them. */
const GMAIL_CATEGORY: Record<string, Placement> = {
  "CATEGORY_PROMOTIONS": "promotions",
  "CATEGORY_UPDATES": "updates",
  "CATEGORY_SOCIAL": "social",
  "CATEGORY_FORUMS": "forums",
  "CATEGORY_PERSONAL": "inbox",
};

const SPAM_FOLDER = /(^|\/|\])\s*(spam|junk|junk e-?mail|bulk mail)\s*$/i;
const INBOX_FOLDER = /(^|\/|\])\s*inbox\s*$/i;

export type ImapSighting = {
  /** The mailbox the message was found in, as the server names it. */
  mailbox: string;
  /** Gmail's X-GM-LABELS, when the server offered them. Empty elsewhere. */
  labels?: string[];
};

/**
 * Decide the placement from ONE sighting.
 *
 * Order matters and is not arbitrary: the spam folder wins over any label,
 * because Gmail keeps `CATEGORY_*` on a message it has also junked and reading
 * the label first would report a spam-foldered message as "promotions".
 */
export function placementOf(sighting: ImapSighting | null | undefined): Placement {
  if (!sighting) return "missing";
  const mailbox = String(sighting.mailbox || "");
  const labels = (sighting.labels ?? []).map((l) => String(l).replace(/^"|"$/g, ""));

  if (SPAM_FOLDER.test(mailbox) || labels.some((l) => /^\\?Spam$/i.test(l) || /^\\?Junk$/i.test(l))) return "spam";

  for (const l of labels) {
    const hit = GMAIL_CATEGORY[l.toUpperCase()];
    if (hit) return hit;
  }
  // In the inbox with no category label: Gmail with tabs off, or a receiver
  // that has none. Either way the message is in front of the person.
  if (INBOX_FOLDER.test(mailbox) || labels.some((l) => /^\\?Inbox$/i.test(l))) return "inbox";

  // Found somewhere else entirely — a user filter, an archive. Not the inbox and
  // not junk, and saying "inbox" here would be the flattering guess.
  return "missing";
}

export type SeedResult = {
  /** The seed mailbox, e.g. a@gmail.com. */
  address: string;
  /** Grouped receiver label — Gmail, Microsoft, Yahoo… */
  receiver: string;
  placement: Placement;
  /** Why, in the mailbox's own terms, so a surprising result can be checked. */
  evidence: string;
};

export type ReceiverPlacement = {
  receiver: string;
  seeds: number;
  reported: number;
  inbox: number;
  promotions: number;
  spam: number;
  missing: number;
  /** NULL when any seed on this receiver failed to report — see the honesty rule. */
  inboxRatePct: number | null;
  note: string;
};

export type PlacementReport = {
  receivers: ReceiverPlacement[];
  seeds: number;
  reported: number;
  /** NULL unless every seed reported. */
  inboxRatePct: number | null;
  /** NULL unless every seed reported. */
  spamRatePct: number | null;
  verdict: string;
  /** What to change, most valuable first. Empty when there is nothing to say. */
  advice: string[];
};

const pct = (n: number, of: number): number => (of <= 0 ? 0 : Math.round((n / of) * 1000) / 10);

export function placementReport(results: SeedResult[]): PlacementReport {
  const byReceiver = new Map<string, SeedResult[]>();
  for (const r of results) {
    const list = byReceiver.get(r.receiver) ?? [];
    list.push(r);
    byReceiver.set(r.receiver, list);
  }

  const receivers: ReceiverPlacement[] = [...byReceiver].map(([receiver, list]) => {
    const missing = list.filter((r) => r.placement === "missing").length;
    const reported = list.length - missing;
    const inbox = list.filter((r) => r.placement === "inbox").length;
    const promotions = list.filter((r) => r.placement === "promotions").length;
    const spam = list.filter((r) => r.placement === "spam").length;
    return {
      receiver, seeds: list.length, reported, inbox, promotions, spam, missing,
      // WITHHELD WHEN ANYTHING IS MISSING. A rate computed over the seeds that
      // happened to answer flatters exactly the runs that went worst.
      inboxRatePct: missing ? null : pct(inbox + promotions, list.length),
      note: missing
        ? `${missing} of ${list.length} seed(s) never reported, so no rate is shown for ${receiver} — an unmeasured share would be a guess.`
        : spam
          ? `${spam} of ${list.length} went to spam at ${receiver}.`
          : promotions && !inbox
            ? `Everything reached ${receiver}, all of it filed under Promotions.`
            : `Everything reached the ${receiver} inbox.`,
    };
  }).sort((a, b) => a.receiver.localeCompare(b.receiver));

  const seeds = results.length;
  const missing = results.filter((r) => r.placement === "missing").length;
  const reported = seeds - missing;
  const reachedInbox = results.filter((r) => REACHED_INBOX.includes(r.placement)).length;
  const spam = results.filter((r) => r.placement === "spam").length;
  const promotions = results.filter((r) => r.placement === "promotions").length;
  const primary = results.filter((r) => r.placement === "inbox").length;

  const advice: string[] = [];
  if (spam) {
    advice.push(
      `${spam} seed(s) were junked. Check authentication first — SPF, DKIM and DMARC alignment for the sending domain — `
      + `then the complaint rate. Nothing about the content matters while a receiver is rejecting the sender.`,
    );
  }
  if (!spam && promotions && !primary) {
    advice.push(
      "Everything that arrived was filed under Promotions. For a marketing campaign that is the correct place and not a fault: "
      + "it carries a one-click unsubscribe, which is required of bulk mail and is the clearest signal a classifier has. "
      + "Reaching Primary means sending one-to-one mail from the vault, not dressing marketing up as a personal note.",
    );
  }
  if (missing) {
    advice.push(
      `${missing} seed(s) never reported. That is not a placement — it is a hole in the measurement. `
      + `Check the seed credentials and that the probe actually sent to them before reading anything else here.`,
    );
  }

  // NO SEEDS IS NOT A ZERO PER CENT INBOX RATE.
  //
  // Caught by its own test. With no seeds configured `missing` is 0, so the
  // "withhold when anything is missing" rule did not fire and the report came
  // back claiming 0% reached the inbox and 0% went to spam — which reads as a
  // deployment whose mail is being universally rejected, on a deployment that
  // has never sent a single probe. The most alarming possible number, produced
  // by measuring nothing. Both rates are withheld unless at least one seed
  // actually reported.
  const measurable = seeds > 0 && missing === 0;
  return {
    receivers, seeds, reported,
    inboxRatePct: measurable ? pct(reachedInbox, seeds) : null,
    spamRatePct: measurable ? pct(spam, seeds) : null,
    verdict: !seeds
      ? "No seed mailboxes are configured, so placement has never been measured on this deployment."
      : missing === seeds
        ? "Not one seed reported. Nothing here is a measurement of anything."
        : missing
          ? `${reported} of ${seeds} seeds reported. Rates are withheld until every seed answers.`
          : spam
            ? `${reachedInbox} of ${seeds} reached an inbox; ${spam} were junked.`
            : primary === seeds
              ? `All ${seeds} seeds landed in the main inbox.`
              : `All ${seeds} seeds reached an inbox — ${primary} in Primary, ${promotions} under Promotions.`,
    advice,
  };
}
