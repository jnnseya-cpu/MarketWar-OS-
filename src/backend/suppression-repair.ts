// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// GIVING BACK THE ADDRESSES THIS PLATFORM DESTROYED.
//
// WHAT HAPPENED. The campaign route suppressed any send failure whose text
// contained a 5xx code. The mail server was refusing OUR PASSWORD — `535 5.7.8
// Authentication failed` — and 535 is a 5xx. 104 prospects on one brand and 250
// on another were recorded as hard bounces and permanently suppressed, because
// our credential was wrong. One vault went from 104 sendable to 0.
//
// `backend/send-failure.ts` stops it happening again. It does not undo it, and
// "we broke your list, it is gone" is not an acceptable end to that sentence.
//
// THE PROBLEM: A WRONGFUL SUPPRESSION LOOKS EXACTLY LIKE A REAL ONE. Both are
// stored as `{ brandId, email, reason: "bounce", at }`. There is no field that
// distinguishes them, and inventing one retroactively would be guessing about
// customer data — the worst possible place to guess. Restoring everything is
// equally wrong: it would resurrect genuine hard bounces and burn the sending
// reputation this list depends on.
//
// THE EVIDENCE THAT DOES EXIST, and it is conclusive:
//
//   A BOUNCE REQUIRES A DELIVERY. On a day when NOT ONE message was accepted by
//   the mail server, no recipient can have bounced — because no recipient was
//   ever contacted. Those bounces are not evidence about an address; they are a
//   record of our own failed logins.
//
// So the rule is arithmetic on the platform's own ledger, not a heuristic: for
// each day, count the `sent` events and the `bounce` events. Bounces on a day
// with zero sends are impossible, and only those are offered for restoration.
// A day with even one successful send is left completely alone, because from
// then on a bounce might be real and might not, and this module will not gamble
// with somebody's list to look thorough.
//
// NOTHING IS RESTORED AUTOMATICALLY. It reports, a person decides, and every
// restoration is written to the audit log. A platform that silently un-deletes
// customer data is as untrustworthy as one that silently deletes it.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { brandEvents } from "@/backend/email-events";

export type ImpossibleBounce = {
  email: string;
  /** The UTC day, as YYYY-MM-DD. */
  day: string;
  /** Why this one cannot be a real bounce, in words a person can check. */
  why: string;
};

export type RepairReport = {
  brandId: string;
  /** Days examined, so "we found nothing" is distinguishable from "we looked at nothing". */
  daysExamined: number;
  /** Days on which at least one message was accepted — never touched. */
  daysWithSends: number;
  impossible: ImpossibleBounce[];
  /** Suppressions this platform is confident about, and will not offer to undo. */
  keptCount: number;
  verdict: string;
};

const dayOf = (iso: string): string => (iso || "").slice(0, 10);

/**
 * Which suppressions the ledger proves cannot be recipient bounces.
 *
 * Read-only. It changes nothing and is safe to call from a diagnostic.
 */
export async function findImpossibleBounces(brandId: string): Promise<RepairReport> {
  const events = await brandEvents(brandId).catch(() => []);

  // Sends and bounces, bucketed by the day they happened.
  const sentByDay = new Map<string, number>();
  const bouncesByDay = new Map<string, Set<string>>();
  for (const e of events) {
    const day = dayOf(e.at);
    if (!day) continue;
    if (e.type === "sent") sentByDay.set(day, (sentByDay.get(day) ?? 0) + 1);
    if (e.type === "bounce") {
      if (!bouncesByDay.has(day)) bouncesByDay.set(day, new Set());
      bouncesByDay.get(day)!.add(e.email.toLowerCase());
    }
  }

  const impossible: ImpossibleBounce[] = [];
  let kept = 0;
  for (const [day, emails] of bouncesByDay) {
    const sent = sentByDay.get(day) ?? 0;
    if (sent > 0) {
      // At least one message got through that day, so a bounce here MIGHT be
      // real. Left alone — this module does not gamble with a list to look
      // thorough.
      kept += emails.size;
      continue;
    }
    for (const email of emails) {
      impossible.push({
        email,
        day,
        why: `Recorded as a bounce on ${day}, a day when the mail server accepted ZERO messages from this platform. A bounce requires a delivery; with nothing delivered, this is a record of our own failed login rather than anything about this address.`,
      });
    }
  }

  const days = new Set([...sentByDay.keys(), ...bouncesByDay.keys()]);
  const daysWithSends = [...sentByDay.values()].filter((n) => n > 0).length;

  return {
    brandId,
    daysExamined: days.size,
    daysWithSends,
    impossible,
    keptCount: kept,
    verdict: !days.size
      ? "No send or bounce events are recorded for this brand, so there is nothing to examine. That is not the same as nothing being wrong — if a vault lost contacts and no events exist, the ledger itself was unavailable when it happened."
      : impossible.length === 0
        ? `Examined ${days.size} day(s). Every recorded bounce fell on a day when at least one message was actually delivered, so none of them can be attributed to a failed login. Nothing to restore.`
        : `${impossible.length} address(es) were suppressed on ${new Set(impossible.map((i) => i.day)).size} day(s) when NOT ONE message was accepted by the mail server. A bounce requires a delivery, so these are not bounces — they are our own authentication failures written onto somebody else's record. ${kept} other suppression(s) fell on days with real deliveries and are left untouched.`,
  };
}

export type RestoreResult = { restored: string[]; skipped: string[]; note: string };

/**
 * Remove specific suppressions, and only ones this module has already proved
 * impossible.
 *
 * TAKES THE LIST AND RE-VERIFIES IT. A caller could pass any address — including
 * a genuine hard bounce — so the proof is recomputed here rather than trusted
 * from the request. An endpoint that un-suppresses whatever it is handed is a
 * way to burn a sending reputation on purpose.
 */
export async function restoreSuppressions(brandId: string, emails: string[]): Promise<RestoreResult> {
  const report = await findImpossibleBounces(brandId);
  const allowed = new Set(report.impossible.map((i) => i.email));
  const wanted = [...new Set(emails.map((e) => (e || "").trim().toLowerCase()).filter(Boolean))];

  const restored: string[] = [];
  const skipped: string[] = [];
  for (const email of wanted) {
    if (!allowed.has(email)) { skipped.push(email); continue; }
    const id = `${brandId}::${email}`.replace(/\//g, "_");
    if (adminConfigured && adminDb) {
      await adminDb.collection("email_suppressions").doc(id).delete();
      // The bounce EVENT is left in place deliberately. It happened, and
      // deleting history to make a number look better is the habit this
      // platform exists to argue against. The suppression is what was wrong.
      await adminDb.collection("email_events").add({
        brandId, email, type: "restored", at: new Date().toISOString(),
        meta: { reason: "suppressed by a platform authentication failure, not by a recipient" },
      }).catch(() => undefined);
    }
    restored.push(email);
  }

  return {
    restored,
    skipped,
    note: restored.length
      ? `${restored.length} address(es) can be contacted again. The bounce events are deliberately NOT deleted — they happened, and rewriting history to improve a statistic is the opposite of what this platform is for. ${skipped.length ? `${skipped.length} were refused because the ledger does not prove they were wrongful.` : ""}`.trim()
      : `Nothing was restored. ${skipped.length ? "Every address asked for still has a suppression the ledger cannot rule out." : "No addresses were supplied."}`,
  };
}
