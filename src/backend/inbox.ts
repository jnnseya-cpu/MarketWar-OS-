// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Unified Inbox + CRM Pipeline Engine (Brevo/Yelp-class).
//
// Collapses every customer conversation channel into one prioritised inbox,
// then drafts (never auto-sends) AI replies, and models the deal pipeline
// with a weighted forecast. Deterministic so it works in demo mode; live
// channel connectors (email/SMS/WhatsApp/reviews/social) plug in at go-live.
//
// Doctrine (house honesty law): AI replies are labelled DRAFTS and are NEVER
// auto-sent — a human sends. Summaries, priorities and forecasts are labelled
// ESTIMATES; the engine never fabricates a message, contact or metric. Where a
// reply becomes an outbound marketing touch, consent + a frequency cap of max
// 5 touches per 7 days apply upstream (see amplify/email engines).

// ---------------------------------------------------------------------------
// Channels + threads
// ---------------------------------------------------------------------------
export const CHANNELS = [
  "email",
  "sms",
  "whatsapp",
  "webform",
  "review",
  "facebook",
  "google",
  "chat",
  "missed_call",
] as const;
export type Channel = (typeof CHANNELS)[number];

export type ThreadStatus = "open" | "pending" | "closed";
export type Priority = "high" | "medium" | "low";

export type Thread = {
  id: string;
  channel: Channel;
  contact: string;
  lastMessage: string;
  status: ThreadStatus;
  waitingMinutes: number;
  slaBreached: boolean;
};

export type EnrichedThread = Thread & {
  aiSummary: string; // ESTIMATE
  suggestedReply: string; // DRAFT — never auto-sent
  suggestedNextAction: string;
  priority: Priority;
};

export type UnifiedInboxReport = {
  slaMinutes: number;
  threadCount: number;
  openCount: number;
  breachedCount: number;
  threads: EnrichedThread[];
  disclaimer: string;
};

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
export const PIPELINE_STAGES = [
  "new",
  "qualified",
  "contacted",
  "replied",
  "meeting",
  "proposal",
  "negotiation",
  "won",
  "lost",
  "nurture",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type Deal = {
  id: string;
  stage: PipelineStage;
  valueGbp: number;
};

export type StageBucket = {
  stage: PipelineStage;
  count: number;
  valueGbp: number;
};

export type PipelineReport = {
  byStage: StageBucket[];
  totalValueGbp: number;
  weightedForecastGbp: number; // ESTIMATE
  openDeals: number;
  wonValueGbp: number;
  disclaimer: string;
};

// Fixed win-probability table (deterministic weighting for the forecast).
const WIN_PROBABILITY: Record<PipelineStage, number> = {
  new: 0.05,
  qualified: 0.15,
  contacted: 0.25,
  replied: 0.35,
  meeting: 0.5,
  proposal: 0.65,
  negotiation: 0.8,
  won: 1,
  lost: 0,
  nurture: 0.1,
};

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------
const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const round0 = (n: number): number => Math.round(n);

const CHANNEL_LABEL: Record<Channel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  webform: "Web form",
  review: "Review",
  facebook: "Facebook",
  google: "Google",
  chat: "Live chat",
  missed_call: "Missed call",
};

// AI summary is an ESTIMATE derived from channel + wait + status.
function summarise(t: Thread): string {
  const label = CHANNEL_LABEL[t.channel];
  const first = t.lastMessage.length > 90 ? `${t.lastMessage.slice(0, 87)}...` : t.lastMessage;
  return `ESTIMATE — ${label} thread from ${t.contact}, ${t.status}, waiting ${t.waitingMinutes}m. Gist: "${first}"`;
}

// Reply is always a DRAFT — the route + doctrine forbid auto-send.
function draftReply(t: Thread): string {
  const openers: Record<Channel, string> = {
    email: `Hi ${t.contact}, thanks for your email — `,
    sms: `Hi ${t.contact}, `,
    whatsapp: `Hi ${t.contact}! Thanks for messaging us on WhatsApp — `,
    webform: `Hi ${t.contact}, thanks for reaching out via our website — `,
    review: `Hi ${t.contact}, thank you for taking the time to leave a review — `,
    facebook: `Hi ${t.contact}, thanks for your message — `,
    google: `Hi ${t.contact}, thanks for getting in touch — `,
    chat: `Hi ${t.contact}, thanks for chatting with us — `,
    missed_call: `Hi ${t.contact}, sorry we missed your call — `,
  };
  const body =
    t.channel === "review"
      ? "we really appreciate the feedback and we're on it."
      : "we're looking into this right now and will come straight back to you.";
  return `DRAFT (not sent — review & send manually): ${openers[t.channel]}${body}`;
}

function nextAction(t: Thread, breached: boolean): string {
  if (breached) return "Respond now — SLA breached; escalate to on-shift agent.";
  if (t.channel === "missed_call") return "Call back within the hour; log outcome.";
  if (t.channel === "review") return "Send drafted reply publicly after human review; thank or resolve.";
  if (t.status === "pending") return "Awaiting customer — set a follow-up reminder.";
  return "Send drafted reply after human review, then move to CRM stage.";
}

function priorityOf(t: Thread, breached: boolean): Priority {
  if (breached) return "high";
  if (t.status === "closed") return "low";
  if (t.waitingMinutes >= 30 || t.channel === "missed_call") return "high";
  if (t.waitingMinutes >= 10) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Unified inbox
// ---------------------------------------------------------------------------
export function unifiedInbox(threads: Thread[], slaMinutes = 60): UnifiedInboxReport {
  const sla = slaMinutes > 0 ? slaMinutes : 60;
  const enriched: EnrichedThread[] = threads.map((t) => {
    const breached = t.status !== "closed" && t.waitingMinutes > sla;
    return {
      ...t,
      slaBreached: breached,
      aiSummary: summarise(t),
      suggestedReply: draftReply(t),
      suggestedNextAction: nextAction(t, breached),
      priority: priorityOf(t, breached),
    };
  });

  // Sort by priority: breached SLA first, then longest wait first, then a
  // deterministic tiebreak on id so ordering is stable.
  enriched.sort((a, b) => {
    if (a.slaBreached !== b.slaBreached) return a.slaBreached ? -1 : 1;
    if (a.waitingMinutes !== b.waitingMinutes) return b.waitingMinutes - a.waitingMinutes;
    return seed(a.id) - seed(b.id);
  });

  return {
    slaMinutes: sla,
    threadCount: enriched.length,
    openCount: enriched.filter((t) => t.status !== "closed").length,
    breachedCount: enriched.filter((t) => t.slaBreached).length,
    threads: enriched,
    disclaimer:
      "AI summaries + priorities are ESTIMATES; suggested replies are DRAFTS and are never auto-sent — a human reviews and sends.",
  };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
export function pipeline(deals: Deal[]): PipelineReport {
  const byStage: StageBucket[] = PIPELINE_STAGES.map((stage) => {
    const inStage = deals.filter((d) => d.stage === stage);
    return {
      stage,
      count: inStage.length,
      valueGbp: round0(inStage.reduce((sum, d) => sum + (Number.isFinite(d.valueGbp) ? d.valueGbp : 0), 0)),
    };
  });

  const totalValueGbp = round0(deals.reduce((sum, d) => sum + (Number.isFinite(d.valueGbp) ? d.valueGbp : 0), 0));
  const weightedForecastGbp = round0(
    deals.reduce((sum, d) => sum + (Number.isFinite(d.valueGbp) ? d.valueGbp : 0) * WIN_PROBABILITY[d.stage], 0),
  );
  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost").length;
  const wonValueGbp = round0(
    deals.filter((d) => d.stage === "won").reduce((sum, d) => sum + (Number.isFinite(d.valueGbp) ? d.valueGbp : 0), 0),
  );

  return {
    byStage,
    totalValueGbp,
    weightedForecastGbp,
    openDeals,
    wonValueGbp,
    disclaimer:
      "weightedForecastGbp is an ESTIMATE — pipeline value weighted by a fixed win-probability table, not a guaranteed figure.",
  };
}

// ---------------------------------------------------------------------------
// Demo data (zero-config)
// ---------------------------------------------------------------------------
export function demoThreads(): Thread[] {
  const raw: Omit<Thread, "slaBreached">[] = [
    { id: "t1", channel: "whatsapp", contact: "Amara O.", lastMessage: "Is the lamb grill available for delivery to SW9 tonight?", status: "open", waitingMinutes: 8 },
    { id: "t2", channel: "missed_call", contact: "07700 900123", lastMessage: "Missed call — no voicemail left.", status: "open", waitingMinutes: 95 },
    { id: "t3", channel: "review", contact: "Daniel K.", lastMessage: "Order arrived cold and 40 minutes late. Taste was fine but delivery let it down.", status: "open", waitingMinutes: 130 },
    { id: "t4", channel: "email", contact: "info@partnercafe.co.uk", lastMessage: "Following up on the wholesale pricing proposal we discussed.", status: "pending", waitingMinutes: 42 },
    { id: "t5", channel: "webform", contact: "Priya S.", lastMessage: "Do you cater for events of 30+ people?", status: "open", waitingMinutes: 15 },
    { id: "t6", channel: "sms", contact: "Marcus T.", lastMessage: "Thanks, food was great!", status: "closed", waitingMinutes: 0 },
    { id: "t7", channel: "google", contact: "Lena V.", lastMessage: "What are your opening hours on bank holidays?", status: "open", waitingMinutes: 22 },
  ];
  return raw.map((t) => ({ ...t, slaBreached: false }));
}

export function demoDeals(): Deal[] {
  return [
    { id: "d1", stage: "new", valueGbp: 1200 },
    { id: "d2", stage: "qualified", valueGbp: 3400 },
    { id: "d3", stage: "contacted", valueGbp: 2100 },
    { id: "d4", stage: "meeting", valueGbp: 5000 },
    { id: "d5", stage: "proposal", valueGbp: 8200 },
    { id: "d6", stage: "negotiation", valueGbp: 6400 },
    { id: "d7", stage: "won", valueGbp: 4700 },
    { id: "d8", stage: "lost", valueGbp: 1900 },
    { id: "d9", stage: "nurture", valueGbp: 2600 },
  ];
}

export type DemoInbox = {
  inbox: UnifiedInboxReport;
  pipeline: PipelineReport;
};

export function demoInbox(): DemoInbox {
  return {
    inbox: unifiedInbox(demoThreads()),
    pipeline: pipeline(demoDeals()),
  };
}
