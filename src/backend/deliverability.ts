// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Deliverability — where the mail actually went, and the guardrail that stops
// one customer's list damaging everyone else's.
//
// THE PLATFORM RISK, stated plainly because it is the reason this file exists.
// MarketWar sends on shared infrastructure. Reputation at Gmail and Microsoft
// attaches to the sending domain and IP, not to the individual customer, so a
// single brand blasting a stale list drags every other brand's mail toward the
// spam folder with it. A per-brand report is not enough: the platform has to be
// able to STOP a sender before the damage is done, and it has to do that on
// published thresholds rather than a feeling.
//
// THE NUMBERS ARE NOT INVENTED. Since February 2024 Google and Yahoo publish
// bulk-sender requirements: keep the spam complaint rate below 0.3%, and aim
// below 0.1%. Those are the two lines used here. Bounce thresholds are the
// widely-observed operational ones and are labelled as such rather than dressed
// up as somebody's official policy.
//
// AND RATES NEED VOLUME. One complaint in thirty sends is 3.3% and means
// nothing. Nothing is halted below MIN_VOLUME_TO_JUDGE, and the report says so
// instead of showing an alarming percentage computed from noise.

export type DeliverabilityEvent = {
  email: string;
  type: "sent" | "open" | "click" | "bounce" | "complaint" | "unsubscribe";
  meta?: Record<string, string>;
};

/** Google and Yahoo's published bulk-sender limit. */
export const COMPLAINT_HALT_PCT = 0.3;
/** Their stated target, and the point at which a sender should already be worried. */
export const COMPLAINT_WARN_PCT = 0.1;
/** Operational, not official: a list this dirty was not permission-based. */
export const BOUNCE_HALT_PCT = 8;
export const BOUNCE_WARN_PCT = 4;
/** Below this, a percentage is arithmetic on noise. */
export const MIN_VOLUME_TO_JUDGE = 200;

// Consumer mailbox providers, grouped because reputation is judged per provider
// rather than per domain — googlemail.com and gmail.com are the same filter.
const PROVIDER_GROUPS: { label: string; domains: string[] }[] = [
  { label: "Gmail", domains: ["gmail.com", "googlemail.com"] },
  { label: "Microsoft", domains: ["outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.co.uk", "msn.com", "outlook.fr", "hotmail.fr"] },
  { label: "Yahoo", domains: ["yahoo.com", "yahoo.co.uk", "ymail.com", "rocketmail.com"] },
  { label: "Apple", domains: ["icloud.com", "me.com", "mac.com"] },
  { label: "AOL", domains: ["aol.com", "aol.co.uk"] },
  { label: "Proton", domains: ["proton.me", "protonmail.com"] },
  { label: "GMX / Web.de", domains: ["gmx.com", "gmx.de", "web.de"] },
  { label: "Orange / Wanadoo", domains: ["orange.fr", "wanadoo.fr"] },
];

/**
 * Which inbox provider is judging this address?
 *
 * Corporate domains are returned as themselves: each runs its own filter, and a
 * block at one company is a different problem from a block at Gmail.
 */
export function receivingProvider(email: string): string {
  const domain = (email || "").trim().toLowerCase().split("@")[1] || "";
  if (!domain) return "unknown";
  for (const g of PROVIDER_GROUPS) if (g.domains.includes(domain)) return g.label;
  return domain;
}

export type ProviderBreakdown = {
  provider: string;
  sent: number;
  opened: number;
  bounced: number;
  complained: number;
  openRatePct: number;
  bounceRatePct: number;
  /** False when the sample is too small for the percentages to mean anything. */
  judgeable: boolean;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * Break the ledger down by who received it.
 *
 * This is where a low overall open rate becomes actionable: 8.7% across the
 * board is a mystery, but "Gmail 22%, Microsoft 0.4%" names the problem and the
 * company to go and fix it with.
 *
 * Machine-flagged opens are excluded here for the same reason they are excluded
 * from the headline rate — a scanner is not a reader.
 */
export function byReceivingProvider(events: DeliverabilityEvent[], opts: { minVolume?: number } = {}): ProviderBreakdown[] {
  const min = opts.minVolume ?? 30;
  const rows = new Map<string, { sent: Set<string>; opened: Set<string>; bounced: Set<string>; complained: Set<string> }>();
  const row = (p: string) => {
    let r = rows.get(p);
    if (!r) { r = { sent: new Set(), opened: new Set(), bounced: new Set(), complained: new Set() }; rows.set(p, r); }
    return r;
  };

  for (const e of events) {
    const email = (e.email || "").toLowerCase();
    if (!email) continue;
    const r = row(receivingProvider(email));
    if (e.type === "sent") r.sent.add(email);
    else if (e.type === "open") { if (e.meta?.machine !== "true") r.opened.add(email); }
    else if (e.type === "bounce") r.bounced.add(email);
    else if (e.type === "complaint") r.complained.add(email);
  }

  return [...rows.entries()]
    .map(([provider, r]) => ({
      provider,
      sent: r.sent.size,
      opened: r.opened.size,
      bounced: r.bounced.size,
      complained: r.complained.size,
      openRatePct: pct(r.opened.size, r.sent.size),
      bounceRatePct: pct(r.bounced.size, r.sent.size),
      judgeable: r.sent.size >= min,
    }))
    .sort((a, b) => b.sent - a.sent);
}

// ---------------------------------------------------------------------------
// The guardrail
// ---------------------------------------------------------------------------

export type ReputationVerdict = {
  level: "ok" | "watch" | "danger";
  /** Sending is blocked for this brand until the list is cleaned. */
  halt: boolean;
  complaintRatePct: number;
  bounceRatePct: number;
  judgeable: boolean;
  reasons: string[];
  note: string;
};

/**
 * Should this brand be allowed to keep sending?
 *
 * Deliberately blunt. On shared infrastructure the cost of a false "keep going"
 * is borne by every other customer on the platform, and reputation damage takes
 * weeks to undo — while the cost of a false halt is one annoyed sender who can
 * clean their list and carry on.
 */
export function reputationVerdict(input: { sent: number; bounces: number; complaints: number }): ReputationVerdict {
  const sent = Math.max(0, input.sent);
  const complaintRatePct = Math.round(pct(input.complaints, sent) * 100) / 100;
  const bounceRatePct = pct(input.bounces, sent);
  const judgeable = sent >= MIN_VOLUME_TO_JUDGE;
  const reasons: string[] = [];

  if (!judgeable) {
    return {
      level: "ok", halt: false, complaintRatePct, bounceRatePct, judgeable: false, reasons: [],
      note: `Only ${sent} message(s) sent — too few for these percentages to mean anything. Nothing is judged or blocked below ${MIN_VOLUME_TO_JUDGE}, because one complaint in thirty sends reads as 3.3% and is simply noise.`,
    };
  }

  let level: ReputationVerdict["level"] = "ok";
  let halt = false;

  if (complaintRatePct >= COMPLAINT_HALT_PCT) {
    halt = true; level = "danger";
    reasons.push(`Spam complaints at ${complaintRatePct}% are at or above Google and Yahoo's published limit of ${COMPLAINT_HALT_PCT}%. At this level they begin filtering the sending domain itself.`);
  } else if (complaintRatePct >= COMPLAINT_WARN_PCT) {
    level = "watch";
    reasons.push(`Spam complaints at ${complaintRatePct}% are above the ${COMPLAINT_WARN_PCT}% Google asks bulk senders to stay under. Not yet blocking, but the direction matters more than the number.`);
  }

  if (bounceRatePct >= BOUNCE_HALT_PCT) {
    halt = true; level = "danger";
    reasons.push(`${bounceRatePct}% of messages bounced. A list this stale tells every filter the addresses were not collected with permission, and the reputation damage attaches to the sending domain, not to the list.`);
  } else if (bounceRatePct >= BOUNCE_WARN_PCT) {
    if (level === "ok") level = "watch";
    reasons.push(`${bounceRatePct}% bounced. Above roughly ${BOUNCE_WARN_PCT}% a list is usually old enough to need verifying before the next send.`);
  }

  return {
    level, halt, complaintRatePct, bounceRatePct, judgeable, reasons,
    note: halt
      ? `Sending is BLOCKED for this brand. ${reasons.join(" ")} This is not a punishment: MarketWar sends on shared infrastructure, so a list in this state drags every other customer's mail toward the spam folder alongside yours. Clean the list — remove the bounces, honour every unsubscribe — and sending resumes.`
      : level === "watch"
        ? `${reasons.join(" ")} Sending continues, but fix this before the next large send.`
        : "Complaint and bounce rates are inside the thresholds Google and Yahoo publish for bulk senders.",
  };
}

/**
 * The one-line answer the send path needs.
 *
 * Kept separate from the report so a caller cannot accidentally send while
 * displaying a red banner — the check that blocks and the check that explains
 * are the same computation.
 */
export function sendingBlocked(v: ReputationVerdict): { blocked: boolean; reason: string } {
  return v.halt
    ? { blocked: true, reason: v.note }
    : { blocked: false, reason: "" };
}
