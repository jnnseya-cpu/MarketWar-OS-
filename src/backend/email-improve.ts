// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Why the open and click rates are what they are — and the one thing to change.
//
// THIS EXISTS BECAUSE OF A SCREENSHOT. A live account showed three tiles:
// 2,129 sent, OPEN RATE 5.9% (125 opened), CLICK RATE 4.3% (92 clicked). Both
// rates were painted green, which is the platform telling a customer that 5.9%
// is a good result. It is not. Worse, the platform had already worked out that
// those two numbers cannot both be true — 92 clicks from 125 openers is 74% of
// openers clicking, where real people run 10–15% — and it computed that verdict
// server-side and then threw it away before it reached the screen.
//
// So this file does two jobs, and refuses a third.
//
//   IT REPAIRS THE MEASUREMENT. An open is recorded by a 1x1 image. Apple Mail
//   Privacy Protection, Gmail's image cache and every "don't load remote
//   content" default mean a large share of real readers never trip it. The
//   reported open rate is therefore a FLOOR, never a measurement — and its true
//   floor is not the pixel count at all: anybody who CLICKED necessarily opened,
//   whether or not their client fetched the image. Counting opens as pixels only
//   under-reports every reader who clicked without loading images, which is the
//   most engaged group on the list.
//
//   IT NAMES THE CONSTRAINT. A low open rate has causes that are counted, not
//   guessed: mail that is not authenticated goes to spam and spam is not opened;
//   one provider filtering you while the rest are normal is that provider's
//   verdict, not the copy's; a list segment that has received nine messages and
//   opened none is dead weight that lowers both rates and the sending reputation
//   with it. Each of those is arithmetic on the event ledger.
//
//   IT DOES NOT PREDICT A LIFT. There is no "+18% expected". A number like that
//   would be invented, and inventing numbers is exactly the defect this codebase
//   keeps finding in itself. Every figure below is counted from events that
//   happened, or it is labelled as a rule of thumb in the text the customer
//   reads.

import {
  MIN_VOLUME_TO_JUDGE,
  byReceivingProvider,
  reputationVerdict,
  type ProviderBreakdown,
  type ReputationVerdict,
} from "@/backend/deliverability";

export type LedgerEvent = {
  email: string;
  type: "sent" | "open" | "click" | "bounce" | "complaint" | "unsubscribe";
  campaign?: string;
  meta?: Record<string, string>;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const lower = (s: string | undefined | null) => String(s ?? "").trim().toLowerCase();
const human = (e: LedgerEvent) => e.meta?.machine !== "true";

// ---------------------------------------------------------------------------
// 1. The measurement, repaired
// ---------------------------------------------------------------------------

/**
 * Operational grading lines, NOT anybody's published standard.
 *
 * Google and Yahoo publish complaint and bounce limits (see deliverability.ts)
 * and those are quoted as theirs. Nobody authoritative publishes an open-rate
 * line, and since Apple Mail Privacy Protection landed in 2021 the vendor
 * "industry averages" that do circulate are measuring pixel fetches by Apple's
 * relay as much as they are measuring people. These are stated as the platform's
 * own operating lines and said to be that wherever they are shown.
 */
export const OPEN_GOOD_PCT = 20;
export const OPEN_FAIR_PCT = 10;
export const CLICK_GOOD_PCT = 2.5;
export const CLICK_FAIR_PCT = 1;
/** Below this many messages a percentage is arithmetic on noise. */
export const MIN_VOLUME = MIN_VOLUME_TO_JUDGE;

export type Reach = {
  sent: number;
  /** Unique addresses whose pixel fired. Under-counts, always. */
  pixelOpeners: number;
  /** Unique addresses that clicked. A click proves the message was opened. */
  clickers: number;
  /** Unique addresses KNOWN to have opened: pixel openers ∪ clickers. */
  knownOpeners: number;
  /** Clickers whose open pixel never fired — invisible to the old open count. */
  silentOpeners: number;
  /** knownOpeners / sent. A floor: the true rate is this or higher. */
  openFloorPct: number;
  clickPct: number;
  /** clickers / knownOpeners. */
  clickToOpenPct: number;
  judgeable: boolean;
};

/**
 * What can actually be known about who read this.
 *
 * Deliberately returns FLOORS with floor-shaped names. `openFloorPct` cannot be
 * mistaken for a measurement the way `openRate` could.
 */
export function reach(events: LedgerEvent[]): Reach {
  let sent = 0;
  const pixel = new Set<string>();
  const clicked = new Set<string>();
  for (const e of events) {
    const email = lower(e.email);
    if (!email) continue;
    if (e.type === "sent") sent++;
    else if (e.type === "open" && human(e)) pixel.add(email);
    else if (e.type === "click" && human(e)) clicked.add(email);
  }
  const known = new Set([...pixel, ...clicked]);
  let silent = 0;
  for (const c of clicked) if (!pixel.has(c)) silent++;

  return {
    sent,
    pixelOpeners: pixel.size,
    clickers: clicked.size,
    knownOpeners: known.size,
    silentOpeners: silent,
    openFloorPct: pct(known.size, sent),
    clickPct: pct(clicked.size, sent),
    clickToOpenPct: pct(clicked.size, known.size),
    judgeable: sent >= MIN_VOLUME,
  };
}

export type Grade = "good" | "fair" | "poor" | "unknown";

/** Grade a rate against the operating lines above. Small samples grade `unknown`. */
export function grade(ratePct: number, kind: "open" | "click", sent: number): Grade {
  if (sent < MIN_VOLUME) return "unknown";
  const [good, fair] = kind === "open" ? [OPEN_GOOD_PCT, OPEN_FAIR_PCT] : [CLICK_GOOD_PCT, CLICK_FAIR_PCT];
  if (ratePct >= good) return "good";
  if (ratePct >= fair) return "fair";
  return "poor";
}

// ---------------------------------------------------------------------------
// 2. Per-campaign comparison — measured, and only when it separates
// ---------------------------------------------------------------------------

export type CampaignRow = {
  campaign: string;
  sent: number;
  knownOpeners: number;
  clickers: number;
  openFloorPct: number;
  clickPct: number;
  judgeable: boolean;
};

/** Break the ledger down by campaign, using the same floor arithmetic. */
export function byCampaign(events: LedgerEvent[], minVolume = 50): CampaignRow[] {
  const rows = new Map<string, { sent: number; pixel: Set<string>; click: Set<string> }>();
  const row = (c: string) => {
    let r = rows.get(c);
    if (!r) { r = { sent: 0, pixel: new Set(), click: new Set() }; rows.set(c, r); }
    return r;
  };
  for (const e of events) {
    const email = lower(e.email);
    const campaign = String(e.campaign ?? "").trim();
    if (!email || !campaign) continue;   // untagged sends cannot be attributed
    const r = row(campaign);
    if (e.type === "sent") r.sent++;
    else if (e.type === "open" && human(e)) r.pixel.add(email);
    else if (e.type === "click" && human(e)) r.click.add(email);
  }
  return [...rows.entries()]
    .map(([campaign, r]) => {
      const known = new Set([...r.pixel, ...r.click]);
      return {
        campaign,
        sent: r.sent,
        knownOpeners: known.size,
        clickers: r.click.size,
        openFloorPct: pct(known.size, r.sent),
        clickPct: pct(r.click.size, r.sent),
        judgeable: r.sent >= minVolume,
      };
    })
    .sort((a, b) => b.openFloorPct - a.openFloorPct || b.sent - a.sent);
}

/**
 * Are these two rates actually different, or is it noise?
 *
 * A two-proportion z-test. This is here because "your best subject line was X"
 * is the single easiest place in an email product to publish a coincidence as a
 * finding: with 60 recipients each, 12% and 8% is nothing at all, and a customer
 * who rewrites their copy around it has been misled by their own tool.
 *
 * |z| ≥ 1.96 is the conventional two-sided 95% line.
 */
export function separated(a: { hits: number; of: number }, b: { hits: number; of: number }): {
  separated: boolean; z: number; note: string;
} {
  if (a.of <= 0 || b.of <= 0) return { separated: false, z: 0, note: "One of these had nothing sent to it." };
  const p1 = a.hits / a.of;
  const p2 = b.hits / b.of;
  const pooled = (a.hits + b.hits) / (a.of + b.of);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.of + 1 / b.of));
  if (!se) return { separated: false, z: 0, note: "Both scored identically — there is nothing to separate." };
  const z = Math.round(((p1 - p2) / se) * 100) / 100;
  const sep = Math.abs(z) >= 1.96;
  return {
    separated: sep,
    z,
    note: sep
      ? `${Math.round(p1 * 1000) / 10}% against ${Math.round(p2 * 1000) / 10}% on ${a.of} and ${b.of} messages is a real difference (z=${z}), not chance.`
      : `${Math.round(p1 * 1000) / 10}% against ${Math.round(p2 * 1000) / 10}% on ${a.of} and ${b.of} messages is inside what chance produces (z=${z}). Treat them as the same result and send more before drawing a conclusion from it.`,
  };
}

// ---------------------------------------------------------------------------
// 3. Contacts that never engage
// ---------------------------------------------------------------------------

export type DeadWeight = {
  /** Addresses sent to `minSends`+ times with no open and no click, ever. */
  addresses: string[];
  count: number;
  /** Messages spent on them — the part of `sent` that could never have opened. */
  messages: number;
  /** What the open floor would read if these addresses were not on the list. */
  openFloorWithoutPct: number;
  minSends: number;
};

/**
 * Who has never once responded.
 *
 * This is the only lever on this screen that moves both rates AND the sending
 * reputation in the same direction, which is why it is computed rather than
 * advised. Every message to an address that has ignored the last five is a
 * message that dilutes the rate, and mailbox providers read sustained non-
 * engagement as a reason to start routing the whole domain to spam.
 *
 * The counterfactual rate is arithmetic, not a projection: it is the same
 * openers over a smaller denominator. It is described that way to the customer.
 */
export function deadWeight(events: LedgerEvent[], minSends = 3): DeadWeight {
  const sends = new Map<string, number>();
  const engaged = new Set<string>();
  for (const e of events) {
    const email = lower(e.email);
    if (!email) continue;
    if (e.type === "sent") sends.set(email, (sends.get(email) ?? 0) + 1);
    else if ((e.type === "open" || e.type === "click") && human(e)) engaged.add(email);
  }
  const addresses: string[] = [];
  let messages = 0;
  for (const [email, n] of sends) {
    if (n >= minSends && !engaged.has(email)) { addresses.push(email); messages += n; }
  }
  addresses.sort();
  const r = reach(events);
  return {
    addresses,
    count: addresses.length,
    messages,
    openFloorWithoutPct: pct(r.knownOpeners, Math.max(0, r.sent - messages)),
    minSends,
  };
}

// ---------------------------------------------------------------------------
// 4. The findings
// ---------------------------------------------------------------------------

export type Finding = {
  id: string;
  /** What this holds back. */
  affects: "opens" | "clicks" | "both" | "trust";
  severity: "blocking" | "major" | "minor";
  title: string;
  /** What was counted, in the customer's own numbers. */
  evidence: string;
  /** The change to make. One action, not a list. */
  fix: string;
  /** Where in the product that change is made. */
  where: string;
  /**
   * True when every number in `evidence` came from the ledger. False would mean
   * a rule of thumb — nothing here sets it false, and the field exists so a
   * future addition has to declare which kind it is.
   */
  measured: true;
};

export type ImproveInput = {
  events: LedgerEvent[];
  /** Sending domains for this brand, to know whether mail is authenticated. */
  domains?: { domain: string; status: string }[];
  /** Counted separately by the bot filter; excluded from the rates already. */
  machineOpens?: number;
  machineClicks?: number;
  bounces?: number;
  complaints?: number;
  unsubscribes?: number;
  /** The address mail goes out as when the brand has authenticated nothing. */
  platformFrom?: string;
};

export type ImproveReport = {
  reach: Reach;
  openGrade: Grade;
  clickGrade: Grade;
  findings: Finding[];
  providers: ProviderBreakdown[];
  reputation: ReputationVerdict;
  campaigns: CampaignRow[];
  dead: DeadWeight;
  /** The one sentence to read if nothing else is read. */
  headline: string;
  /** How the numbers above should be understood. Always shown. */
  measurementNote: string;
};

const SEVERITY_ORDER: Record<Finding["severity"], number> = { blocking: 0, major: 1, minor: 2 };

export function improvements(input: ImproveInput): ImproveReport {
  const events = input.events ?? [];
  const r = reach(events);
  const providers = byReceivingProvider(events);
  const reputation = reputationVerdict({
    sent: r.sent,
    bounces: input.bounces ?? events.filter((e) => e.type === "bounce").length,
    complaints: input.complaints ?? events.filter((e) => e.type === "complaint").length,
  });
  const campaigns = byCampaign(events);
  const dead = deadWeight(events);
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "measured">) => findings.push({ ...f, measured: true });

  // --- Authentication. Mail in the spam folder is not opened by anyone. ------
  const verified = (input.domains ?? []).filter((d) => lower(d.status) === "verified");
  const pending = (input.domains ?? []).filter((d) => lower(d.status) !== "verified");
  if (r.sent > 0 && !verified.length) {
    add({
      id: "no-authenticated-domain",
      affects: "both",
      severity: "blocking",
      title: "You are not sending from a domain you have authenticated",
      evidence: pending.length
        ? `${pending.length} domain(s) added and not verified. All ${r.sent.toLocaleString()} messages so far went out on the shared platform address${input.platformFrom ? ` (${input.platformFrom})` : ""}, so the From name in the inbox is not yours.`
        : `No sending domain has been added, so all ${r.sent.toLocaleString()} messages went out on the shared platform address${input.platformFrom ? ` (${input.platformFrom})` : ""}.`,
      fix: "Publish the SPF, DKIM and DMARC records for your own domain, then verify it. Nothing else on this page moves the open rate as much: a message that lands in the spam folder is not opened by anybody, however it is written.",
      where: "/dashboard/email/domains",
    });
  }

  // --- The pixel is a floor, and clicks prove it ----------------------------
  if (r.silentOpeners > 0) {
    add({
      id: "silent-openers",
      affects: "opens",
      severity: "minor",
      title: `${r.silentOpeners} people opened without the tracking pixel firing`,
      evidence: `${r.silentOpeners} address(es) clicked a link but never registered an open. They opened the message — a link cannot be clicked from an unopened email — their client just did not load the image. Counting only pixels puts the open rate at ${pct(r.pixelOpeners, r.sent)}%; counting everyone known to have opened puts it at ${r.openFloorPct}%.`,
      fix: "Read the open rate as a floor, and judge campaigns on clicks. Apple Mail Privacy Protection and image blocking mean the true open figure is above this and cannot be measured by anybody, on any platform.",
      where: "",
    });
  }

  // --- Click-to-open out of physical range ----------------------------------
  if (r.knownOpeners >= 30 && r.clickToOpenPct > 40) {
    add({
      id: "click-to-open-implausible",
      affects: "trust",
      severity: "major",
      title: "The click number is inflated — treat it as an upper bound",
      evidence: `${r.clickers} clickers from ${r.knownOpeners} known openers is ${r.clickToOpenPct}%. Real readers run 10–15%. Corporate mail security — Proofpoint, Mimecast, Barracuda, Microsoft Safe Links — fetches every URL in a message the moment it is delivered, and those fetches look like clicks.${(input.machineClicks ?? 0) ? ` ${input.machineClicks} were identified from their user agent and are already excluded; the rest carried no signature.` : " None of these carried a user agent we could identify, so they are all still counted."}`,
      fix: "Judge this send on replies and on what happened at the other end of the link, not on the click count. The scanners cluster in the first minutes after delivery and hit every link equally — a genuine click pattern spreads over hours and favours one link.",
      where: "",
    });
  }

  // --- One provider filtering you -------------------------------------------
  const judgeable = providers.filter((p) => p.judgeable);
  if (judgeable.length >= 2) {
    const best = judgeable.reduce((a, b) => (a.openRatePct >= b.openRatePct ? a : b));
    for (const p of judgeable) {
      if (p === best) continue;
      if (p.openRatePct >= 3 && p.openRatePct * 3 > best.openRatePct) continue;
      const sep = separated({ hits: p.opened, of: p.sent }, { hits: best.opened, of: best.sent });
      if (!sep.separated) continue;
      add({
        id: `provider-filtering:${p.provider}`,
        affects: "opens",
        severity: "major",
        title: `${p.provider} is filtering you — the copy is not the problem there`,
        evidence: `${p.openRatePct}% opened at ${p.provider} across ${p.sent.toLocaleString()} messages, against ${best.openRatePct}% at ${best.provider} across ${best.sent.toLocaleString()}. ${sep.note} The same subject line, the same body, two different verdicts — that is the receiving filter, not the writing.`,
        fix: `Check the DMARC alignment and the bounce return path for the domain those addresses receive on, and lower the volume to ${p.provider} for a fortnight while engagement recovers. If ${p.provider} is one corporate domain, the fastest route is one recipient there asking their IT to allow the sending domain.`,
        where: "/dashboard/email/domains",
      });
    }
  }

  // --- The list that never responds -----------------------------------------
  if (dead.count > 0 && dead.messages > 0) {
    add({
      id: "never-engaged",
      affects: "both",
      severity: dead.messages / Math.max(1, r.sent) >= 0.25 ? "major" : "minor",
      title: `${dead.count.toLocaleString()} contacts have never opened anything`,
      evidence: `Each has received ${dead.minSends} or more messages and has never opened or clicked one. Together they account for ${dead.messages.toLocaleString()} of your ${r.sent.toLocaleString()} sends (${pct(dead.messages, r.sent)}%). The same openers over the remaining list would read ${dead.openFloorWithoutPct}% rather than ${r.openFloorPct}% — that is the same arithmetic, not a forecast.`,
      fix: "Send this group one plainly-worded message asking whether they still want to hear from you, then stop sending to whoever does not answer. Continuing to mail an address that has ignored five messages is what teaches Gmail and Microsoft to route the whole domain to spam, so this protects delivery to everybody else as well.",
      where: "/dashboard/customers",
    });
  }

  // --- Openers who do not click ---------------------------------------------
  if (r.knownOpeners >= 30 && r.clickToOpenPct > 0 && r.clickToOpenPct < 8) {
    add({
      id: "opens-without-clicks",
      affects: "clicks",
      severity: "major",
      title: "People are reading it and not acting — this is a copy problem, not a delivery one",
      evidence: `${r.knownOpeners} people opened and ${r.clickers} clicked, which is ${r.clickToOpenPct}%. Delivery is working: they received it and they read it. The message did not give them a reason to press anything.`,
      fix: "Cut to one action. A message with a single link, named as what happens next rather than \"click here\", and placed before the fold, is the change that moves this number — the reader who has already opened has told you the subject line is fine.",
      where: "",
    });
  }

  // --- Unsubscribes ---------------------------------------------------------
  const unsubs = input.unsubscribes ?? events.filter((e) => e.type === "unsubscribe").length;
  if (r.judgeable && unsubs > 0) {
    const unsubPct = pct(unsubs, r.sent);
    if (unsubPct >= 0.5) {
      add({
        id: "unsubscribe-rate",
        affects: "both",
        severity: unsubPct >= 1 ? "major" : "minor",
        title: `${unsubPct}% unsubscribed from this list`,
        evidence: `${unsubs.toLocaleString()} of ${r.sent.toLocaleString()} messages ended in an unsubscribe. Above roughly 0.5% the usual cause is frequency or a mismatch between what was signed up for and what is being sent, rather than the individual message.`,
        fix: "Reduce the send frequency and say on the sign-up form what will actually arrive and how often. An unsubscribe is the good outcome here — the alternative is a spam complaint, which damages every other brand sending on this infrastructure.",
        where: "/dashboard/customers",
      });
    }
  }

  // --- Reputation halts everything -----------------------------------------
  if (reputation.halt) {
    add({
      id: "reputation-halt",
      affects: "both",
      severity: "blocking",
      title: "Sending is blocked until the list is cleaned",
      evidence: reputation.reasons.join(" "),
      fix: "Clear the bounces and honour every unsubscribe, then sending resumes. Nothing about the copy matters while the domain is in this state.",
      where: "/dashboard/email",
    });
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // The headline names the one thing to do, or says plainly that there is not
  // enough data to name one. It never fills the space with encouragement.
  const headline = !r.sent
    ? "Nothing has been sent yet, so there is nothing to improve. The first send is what creates these numbers."
    : !r.judgeable
      ? `${r.sent.toLocaleString()} messages is too few for these percentages to mean anything — one open either way moves them by ${Math.round((1 / r.sent) * 1000) / 10} points. Nothing here is judged until ${MIN_VOLUME.toLocaleString()}.`
      : findings.length
        ? findings[0].title
        : `${r.openFloorPct}% opened and ${r.clickPct}% clicked, with nothing counted against the list, the domain or the receiving providers. Improving from here is a copy question, and the only reliable way to answer it is to send two subject lines to comparable halves of the list.`;

  const measurementNote = [
    `The open figure is a FLOOR, not a measurement: ${r.knownOpeners.toLocaleString()} of ${r.sent.toLocaleString()} are KNOWN to have opened${r.silentOpeners ? ` — ${r.pixelOpeners.toLocaleString()} loaded the tracking image and a further ${r.silentOpeners.toLocaleString()} clicked without loading it` : ""}.`,
    "Apple Mail Privacy Protection and image blocking hide an unknown number of real readers from every email platform there is, so the true rate is this or higher and nobody can tell you by how much.",
    (input.machineOpens ?? 0) || (input.machineClicks ?? 0)
      ? `${input.machineOpens ?? 0} open(s) and ${input.machineClicks ?? 0} click(s) were identified as machines and excluded from these rates; they remain in the ledger as evidence of delivery.`
      : "",
    `${OPEN_GOOD_PCT}% and ${CLICK_GOOD_PCT}% are the lines this platform grades against. They are our operating lines, not an industry standard — since Apple's privacy relay began fetching pixels on readers' behalf, published open-rate benchmarks measure that relay as much as they measure people.`,
  ].filter(Boolean).join(" ");

  // A rate the report has just called unreliable must not be graded "good" three
  // inches above the paragraph saying so. If click-to-open is outside what people
  // produce, the click figure is an upper bound and the honest grade is "we do
  // not know" — the tile then renders white instead of green.
  const clickTrusted = !findings.some((f) => f.id === "click-to-open-implausible");

  return {
    reach: r,
    openGrade: grade(r.openFloorPct, "open", r.sent),
    clickGrade: clickTrusted ? grade(r.clickPct, "click", r.sent) : "unknown",
    findings,
    providers,
    reputation,
    campaigns,
    dead,
    headline,
    measurementNote,
  };
}
