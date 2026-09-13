// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// SEND A REAL MESSAGE TO MAILBOXES WE OWN, THEN GO AND LOOK WHERE IT LANDED.
//
// THE GAP THIS CLOSES, STATED PLAINLY. Everything this platform knew about
// deliverability was about the SHAPE of a message — authentication, stream,
// headers, the text part (§135). Shape is most of the signal and it is not the
// answer, and the review that shipped §135 said so in as many words: "the
// platform can say what shape a message has, and cannot yet tell you which tab
// it reached." This is the part that tells you.
//
// HOW IT WORKS, AND WHY EACH PIECE IS THAT WAY.
//
//   1. A token is minted and put in the SUBJECT. It is how the reader finds this
//      exact message later among everything else in a seed mailbox, and a
//      subject search is both fast and unambiguous.
//   2. The message goes out THROUGH THE ORDINARY SEND PATH — `sendEmailBatch`,
//      the bulk stream, the real From, the real DKIM key, the real headers. A
//      probe that took a shortcut would measure the shortcut. The whole value of
//      this is that the bytes a seed receives are the bytes a customer receives.
//   3. Each seed mailbox is then read over IMAP with BODY.PEEK and the folder
//      and Gmail labels are turned into a placement by `shared/placement.ts`.
//   4. A seed that does not answer is `missing`, and a report with anything
//      missing refuses to quote a rate. An unmeasured share is a guess.
//
// WHAT IT COSTS AND WHY IT IS ADMIN-ONLY. It sends real mail from the real
// sending domain. Run too often, from too many places, and the thing being
// measured is changed by the measuring — a sender that mails its own seeds all
// day looks to a receiver like a sender with terrible engagement. So the route
// that starts one requires a platform admin and the interval is deliberately
// coarse.
//
// WHAT IT CANNOT DO, SAID HERE RATHER THAN DISCOVERED LATER. Seeds are a SAMPLE
// of receivers, not a verdict about every recipient: Gmail's classifier is
// per-recipient and takes account of what that person has done with your mail
// before. A seed mailbox has no history, so it measures how a receiver treats a
// message from this domain to a STRANGER. That is the number that matters for
// cold outreach and it is the pessimistic end for an engaged list.

import { sendEmailBatch } from "@/backend/email";
import { findByToken, type ImapConfig } from "@/backend/imap";
import { receivingProvider } from "@/backend/deliverability";
import { placementOf, placementReport, type PlacementReport, type SeedResult } from "@/shared/placement";

export type Seed = {
  address: string;
  imap: ImapConfig;
};

/**
 * The seed mailboxes, from `MW_SEED_MAILBOXES`.
 *
 * PLATFORM INFRASTRUCTURE, NOT CUSTOMER DATA — one set of mailboxes measures the
 * sending domain, which is shared by every brand on it. Held in an environment
 * variable rather than the database for the same reason the sending pool is:
 * they are credentials, and credentials do not belong in a collection a support
 * tool can page through.
 *
 * Shape (JSON array):
 *   [{"address":"seed1@gmail.com","host":"imap.gmail.com","port":993,
 *     "user":"seed1@gmail.com","pass":"<app password>"}]
 */
export function seeds(): Seed[] {
  const raw = (process.env.MW_SEED_MAILBOXES || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((s) => ({
        address: String(s.address || s.user || "").trim().toLowerCase(),
        imap: {
          host: String(s.host || "").trim(),
          port: Number(s.port) || 993,
          user: String(s.user || s.address || "").trim(),
          pass: String(s.pass || ""),
        },
      }))
      .filter((s) => s.address && s.imap.host && s.imap.user && s.imap.pass);
  } catch {
    return [];
  }
}

export const seedsConfigured = (): boolean => seeds().length > 0;

/** What a caller needs to know before spending a probe. Never includes a password. */
export function seedStatus(): { configured: boolean; count: number; receivers: string[]; note: string } {
  const list = seeds();
  const receivers = [...new Set(list.map((s) => receivingProvider(s.address)))].sort();
  return {
    configured: list.length > 0,
    count: list.length,
    receivers,
    note: list.length
      ? `${list.length} seed mailbox(es) across ${receivers.join(", ")}.`
      : "No seed mailboxes are configured, so placement has never been measured on this deployment. "
        + "Set MW_SEED_MAILBOXES to a JSON array of mailboxes you own — one per receiver you care about — "
        + "and this becomes answerable. Until then nothing here is a measurement.",
  };
}

export type ProbeOutcome = {
  token: string;
  startedAt: string;
  /** What the SEND did, before anything was read. A probe nobody received is not a placement. */
  sent: number;
  failed: number;
  sendNote: string;
  results: SeedResult[];
  report: PlacementReport;
};

/** The token that identifies one probe. Readable, so it can be found by hand too. */
export const probeToken = (now = Date.now()): string => `MWP-${now.toString(36).toUpperCase()}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one probe end to end.
 *
 * `waitMs` exists because delivery is not instant and a read that happens too
 * early reports `missing` for a message that arrives a second later — which
 * would be the measurement lying in the most damaging direction. The default is
 * generous; callers running against a local relay can shorten it.
 */
export async function runPlacementProbe(opts: {
  from?: string;
  subject?: string;
  html?: string;
  waitMs?: number;
  now?: number;
} = {}): Promise<ProbeOutcome> {
  const list = seeds();
  const token = probeToken(opts.now ?? Date.now());
  const startedAt = new Date(opts.now ?? Date.now()).toISOString();

  if (!list.length) {
    return {
      token, startedAt, sent: 0, failed: 0,
      sendNote: seedStatus().note,
      results: [],
      report: placementReport([]),
    };
  }

  // THE SUBJECT CARRIES THE TOKEN AND READS LIKE A REAL MESSAGE. A subject of
  // pure machine noise is itself a spam signal, so the probe would measure the
  // probe rather than the sender.
  const subject = `${opts.subject || "Checking our email is reaching you"} [${token}]`;
  const html = opts.html
    || `<p>This is an automated delivery check sent to a mailbox we own.</p>`
    + `<p>It is how we find out whether our mail is reaching the inbox before we send anything to a customer.</p>`
    + `<p>Reference ${token}.</p>`;

  const items = list.map((s) => ({ to: s.address, subject, html }));
  // The ordinary bulk path: same builder, same headers, same DKIM key. A probe
  // that is shaped differently from a campaign measures nothing about campaigns.
  const sendResults = await sendEmailBatch(items, { from: opts.from, campaign: "placement-probe" });
  const sent = sendResults.filter((r) => r.ok).length;
  const failed = sendResults.length - sent;

  if (!sent) {
    return {
      token, startedAt, sent, failed,
      sendNote: `Nothing left the machine: ${sendResults[0]?.detail || "the send path refused every seed"}. `
        + "Placement cannot be measured from a probe that was never delivered.",
      results: [],
      report: placementReport([]),
    };
  }

  await sleep(opts.waitMs ?? 45_000);

  const results: SeedResult[] = [];
  for (const s of list) {
    let sighting = null;
    let evidence = "";
    try {
      sighting = await findByToken(s.imap, token);
      evidence = sighting
        ? `found in ${sighting.mailbox}${sighting.labels.length ? ` with labels ${sighting.labels.join(", ")}` : " (no Gmail labels offered)"}`
        : "not found in the inbox or any junk folder this server names";
    } catch (e) {
      // A MAILBOX WE COULD NOT READ IS NOT AN EMPTY MAILBOX. Reporting this as
      // "missing" is correct — it is missing from the measurement — and the
      // evidence says it was our reader that failed, not the receiver.
      evidence = `could not read this seed: ${e instanceof Error ? e.message : String(e)}`;
    }
    results.push({
      address: s.address,
      receiver: receivingProvider(s.address),
      placement: placementOf(sighting),
      evidence,
    });
  }

  return {
    token, startedAt, sent, failed,
    sendNote: `${sent} of ${list.length} seed(s) accepted by the relay${failed ? `, ${failed} refused` : ""}.`,
    results,
    report: placementReport(results),
  };
}
