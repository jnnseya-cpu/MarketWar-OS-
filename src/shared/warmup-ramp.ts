// THE REPUTATION GOVERNOR, WHICH DID NOT LOOK AT REPUTATION.
//
// WHAT WAS THERE. `dailyCapForDay(day)` returned a ceiling from a calendar: 50
// on day one, 50,000 from day 22 onward, where `day` is simply the number of
// days since the brand's first send. Nothing else was consulted.
//
// WHY THAT IS DANGEROUS, and the AI Email Deliverability Commander flagged it in
// those words. Send 50 messages on day one, do nothing for six weeks, and on day
// 40 the platform authorises FIFTY THOUSAND messages against a reputation built
// on fifty. That is the classic way to get a domain blocked on its first real
// campaign — mailbox providers read a step change like that as a compromised
// account, and the block lands on the brand's own domain rather than on us.
//
// It is this codebase's second recurring defect exactly: a check that passes for
// a reason unrelated to what it claims to test. Calendar days do not build
// sending reputation. Delivered volume that people did not complain about does.
//
// WHAT REPLACES IT. Two ceilings, and the lower one wins.
//
//   THE SCHEDULE — unchanged, still the published ramp, still an absolute
//   ceiling nothing may exceed.
//
//   WHAT HAS BEEN EARNED — you may send about twice what you have already had
//   accepted on your best single day. That is the standard warm-up doubling, and
//   it makes the ramp track real behaviour: skip six weeks and the cap is still
//   twice your best day, because that is all you have proved.
//
// And the outcomes govern it. Above Gmail's published complaint line the ramp
// stops entirely; above the target it holds; a bounce rate that says the list is
// bad rolls it back. A governor that only ever increases is not a governor.
//
// Pure and separate from storage, so every rule below is tested as arithmetic
// with no Firestore, no clock and no network.

/** The first day's trickle, and the floor the ramp never falls below while sending is allowed. */
export const FIRST_DAY_CAP = 50;

// The published operating lines. Sources named because a threshold nobody can
// check is a number somebody made up.
//
//   0.3% complaints — the rate at which Gmail's Sender Guidelines say bulk
//   senders will be filtered. Not a target: a wall.
//   0.1% complaints — the rate the same guidelines tell senders to stay under.
//   2% / 5% bounces — a list that fails this is a list that was not cleaned, and
//   continuing to ramp on it converts a list problem into a domain problem.
export const COMPLAINT_STOP = 0.003;
export const COMPLAINT_HOLD = 0.001;
export const BOUNCE_ROLLBACK = 0.05;
export const BOUNCE_HOLD = 0.02;

/**
 * The smallest history that may govern the ramp.
 *
 * A rate computed on a handful of messages is noise, and letting noise stop a
 * sender is its own failure — one complaint out of thirty is 3.3% and is also
 * one person having a bad morning. Below this the schedule and the doubling rule
 * apply on their own, which are both conservative by construction.
 */
export const MIN_SAMPLE = 20;
/** And one complaint is never enough to act on, at any volume. */
export const MIN_COMPLAINTS = 2;

/** The published ramp. An absolute ceiling — nothing below may exceed it. */
export function scheduleCapForDay(day: number): number {
  if (day <= 1) return FIRST_DAY_CAP;
  if (day === 2) return 100;
  if (day === 3) return 250;
  if (day === 4) return 500;
  if (day === 5) return 1000;
  if (day <= 7) return 2500;
  if (day <= 10) return 5000;
  if (day <= 14) return 10000;
  if (day <= 21) return 25000;
  return 50000;
}

export type WarmupSignals = {
  /**
   * The most messages accepted by the mail server on any ONE previous day.
   *
   * Previous, not including today: a cap derived from today's own count would
   * raise itself as the day's sending progressed, and a ceiling that moves with
   * the thing it limits is not a ceiling.
   */
  bestDay: number;
  /** Messages accepted, over the brand's whole recorded history. */
  sent: number;
  /** Hard bounces recorded against those sends. */
  bounce: number;
  /** Spam complaints recorded against those sends. */
  complaint: number;
};

export type RampVerdict = "grow" | "hold" | "rollback" | "stop";

export type EarnedCap = {
  cap: number;
  verdict: RampVerdict;
  /** Why, in the words the sender needs — this is printed on their screen. */
  reason: string;
  bounceRatePct: number | null;
  complaintRatePct: number | null;
};

const pct = (n: number, of: number): number | null => (of > 0 ? Math.round((n / of) * 10000) / 100 : null);

/**
 * What this brand's own sending record entitles it to send today.
 *
 * ORDERED BY SEVERITY, and the first that applies wins: a stop is not softened
 * by a good bounce rate elsewhere in the same history.
 */
export function earnedCap(signals: WarmupSignals): EarnedCap {
  const sent = Math.max(0, Math.floor(signals.sent || 0));
  const bounce = Math.max(0, Math.floor(signals.bounce || 0));
  const complaint = Math.max(0, Math.floor(signals.complaint || 0));
  const bestDay = Math.max(0, Math.floor(signals.bestDay || 0));

  const bounceRate = sent > 0 ? bounce / sent : 0;
  const complaintRate = sent > 0 ? complaint / sent : 0;
  const rates = { bounceRatePct: pct(bounce, sent), complaintRatePct: pct(complaint, sent) };
  // Enough history to judge? Bounces are mechanical and a handful is already
  // evidence; a single complaint never is.
  const judgeable = sent >= MIN_SAMPLE;

  if (judgeable && complaint >= MIN_COMPLAINTS && complaintRate >= COMPLAINT_STOP) {
    return {
      cap: 0, verdict: "stop", ...rates,
      reason: `Sending is paused: ${rates.complaintRatePct}% of your messages have been reported as spam, and mailbox providers filter a sender at 0.3%. Continuing would move the problem from this campaign to your domain. Clean the list down to people who asked to hear from you, then start again — the ramp restarts from what you can prove.`,
    };
  }
  if (judgeable && bounceRate >= BOUNCE_ROLLBACK) {
    return {
      cap: Math.max(FIRST_DAY_CAP, Math.floor(bestDay / 2)), verdict: "rollback", ...rates,
      reason: `Today's allowance is halved: ${rates.bounceRatePct}% of your messages bounced, and above 5% the addresses are the problem rather than the sending. Run the hygiene filter over the list before sending more — every bounce is charged against your domain, not the list you bought it from.`,
    };
  }
  if (judgeable && ((complaint >= MIN_COMPLAINTS && complaintRate >= COMPLAINT_HOLD) || bounceRate >= BOUNCE_HOLD)) {
    return {
      cap: Math.max(FIRST_DAY_CAP, bestDay), verdict: "hold", ...rates,
      reason: bounceRate >= BOUNCE_HOLD
        ? `The ramp is held at your current volume rather than growing: ${rates.bounceRatePct}% of your messages bounced, against a target under 0.5%. Nothing is blocked — the allowance simply stops rising until the list is cleaner.`
        : `The ramp is held at your current volume rather than growing: ${rates.complaintRatePct}% of your messages were reported as spam, against Gmail's 0.1% target. Nothing is blocked — the allowance stops rising until the reports settle.`,
    };
  }

  // The healthy path: roughly double what has actually been accepted.
  const cap = Math.max(FIRST_DAY_CAP, bestDay * 2);
  return {
    cap, verdict: "grow", ...rates,
    reason: bestDay === 0
      ? `Nothing has been sent from this brand yet, so today starts at ${FIRST_DAY_CAP} messages. The allowance roughly doubles each day you actually send and the results stay clean.`
      : `Your best day so far had ${bestDay.toLocaleString()} messages accepted, so today allows about twice that. The allowance grows from what you have actually sent, not from the calendar.`,
  };
}

export type WarmupCap = {
  /** What may be sent today. The lower of the two ceilings. */
  cap: number;
  /** The published ramp for this day number. */
  scheduleCap: number;
  /** What this brand's own record entitles it to. */
  earned: number;
  verdict: RampVerdict;
  /** Which ceiling is actually binding, so the reason shown is the true one. */
  governedBy: "schedule" | "reputation";
  reason: string;
  bounceRatePct: number | null;
  complaintRatePct: number | null;
};

/**
 * Today's allowance: the schedule and the earned ceiling, lower one wins.
 *
 * THE WHOLE POINT IS THE `Math.min`. Either ceiling alone is wrong — the
 * schedule alone authorises 50,000 messages from a sender who has proved
 * nothing, and the doubling alone would let a brand that started six months ago
 * climb past the published ramp in a fortnight.
 */
export function warmupCap(input: { day: number; signals: WarmupSignals }): WarmupCap {
  const scheduleCap = scheduleCapForDay(Math.max(1, Math.floor(input.day || 1)));
  const earned = earnedCap(input.signals);
  const cap = Math.min(scheduleCap, earned.cap);
  const governedBy: "schedule" | "reputation" = earned.cap <= scheduleCap ? "reputation" : "schedule";
  return {
    cap,
    scheduleCap,
    earned: earned.cap,
    verdict: earned.verdict,
    governedBy,
    reason: governedBy === "reputation"
      ? earned.reason
      : `Day ${input.day} of the published warm-up ramp allows ${scheduleCap.toLocaleString()} messages, and that is the lower of the two limits today.`,
    bounceRatePct: earned.bounceRatePct,
    complaintRatePct: earned.complaintRatePct,
  };
}
