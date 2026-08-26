// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHAT WAS ACTUALLY SENT, WRITTEN DOWN.
//
// THE HOLE THIS CLOSES. The owner reported "never send any emails". Every check
// built to answer it came back healthy — the credentials authenticate, the relay
// accepts an envelope, SPF and DMARC are published, and a real message through
// the real code path returns `ok: true`. All of that was true, and none of it
// could answer the question, because THE PLATFORM KEPT NO RECORD OF ANY MESSAGE
// IT HAD EVER SENT.
//
// The only thing written down was `recordNodeSend` — an in-memory counter, per
// serverless instance, per day, that dies with the invocation. The provider's
// own queue id came back on the `250 ... queued as ...` line and was discarded.
// So "did the audit email go out on Tuesday?" had no answer anywhere in the
// system, and the honest reply to the owner was a request for another
// screenshot.
//
// This is the record. It exists to be taken to the provider's outbound log: an
// id and a timestamp turn "nothing sends" into "here are the fourteen messages
// we handed you, what did you do with them?" — which is a question a support
// desk can act on and an argument nobody has to have twice.
//
// WHAT IT DELIBERATELY DOES NOT DO:
//   • It never stores the message body. A ledger of what was said to whom is a
//     different thing with different obligations, and this only needs to answer
//     whether a message left.
//   • It never fails a send. A ledger that could stop a message from going out
//     would be worse than no ledger. Every write is best-effort and swallowed.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

const useDb = () => adminConfigured && Boolean(adminDb);
const COLLECTION = "email_sends";

export type SendAttempt = {
  id: string;
  /** The recipient. Already stored elsewhere for suppression, so no new exposure. */
  to: string;
  subject: string;
  /** The provider's own id — the thing to quote at their support desk. */
  providerId: string;
  /** Which sending node carried it, for a pool with more than one. */
  node: string;
  ok: boolean;
  /** Category on failure: not_configured, provider, hygiene, halted. */
  failure: string;
  /** The provider's own words, when it refused. Never a paraphrase. */
  detail: string;
  /**
   * The three addresses, written down TOGETHER.
   *
   * A send used an authenticated account, an envelope sender and a visible From
   * that were three different mailboxes, and no record anywhere held more than
   * one of them at a time. So "it says it sent, and nothing arrived" could not
   * be answered without another screenshot. Optional because rows written
   * before this existed must still read back.
   */
  headerFrom?: string;
  envelopeFrom?: string;
  at: string;
};

const mem: SendAttempt[] = [];
const MEM_MAX = 200;

const idFor = (to: string, at: string): string =>
  `snd_${Buffer.from(`${to}|${at}`).toString("base64url").slice(0, 40)}`;

/**
 * Write down one attempt. Never throws, never blocks, never fails a send.
 */
export async function recordAttempt(input: Omit<SendAttempt, "id">): Promise<void> {
  const row: SendAttempt = { ...input, id: idFor(input.to, input.at) };
  try {
    mem.unshift(row);
    if (mem.length > MEM_MAX) mem.length = MEM_MAX;
    if (useDb()) await adminDb!.collection(COLLECTION).doc(row.id).set(row, { merge: true });
  } catch {
    // A ledger that could stop a message going out would be worse than none.
  }
}

/**
 * The most recent attempts, newest first.
 *
 * Reads WITHOUT asserting the stored shape — the cast on `.data()` is the
 * pattern that put two crashes into production, and a row written before a field
 * existed must not take this endpoint down when somebody is using it to work out
 * why their mail is missing.
 */
export async function recentSends(limit = 20): Promise<SendAttempt[]> {
  const n = Math.min(Math.max(1, Math.round(limit)), 100);
  try {
    if (useDb()) {
      const snap = await adminDb!.collection(COLLECTION).orderBy("at", "desc").limit(n).get();
      return snap.docs.map((d) => attemptFromStored(d.data())).filter((r): r is SendAttempt => Boolean(r));
    }
  } catch {
    // Fall through to whatever this instance remembers.
  }
  return mem.slice(0, n);
}

export function attemptFromStored(raw: unknown): SendAttempt | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const to = str(r.to), at = str(r.at);
  if (!to || !at) return null;
  return {
    id: str(r.id) || idFor(to, at),
    to, at,
    subject: str(r.subject),
    providerId: str(r.providerId),
    ...(str(r.headerFrom) ? { headerFrom: str(r.headerFrom) } : {}),
    ...(str(r.envelopeFrom) ? { envelopeFrom: str(r.envelopeFrom) } : {}),
    node: str(r.node),
    ok: r.ok === true,
    failure: str(r.failure),
    detail: str(r.detail),
  };
}

export function __resetSendLedger(): void { mem.length = 0; }
