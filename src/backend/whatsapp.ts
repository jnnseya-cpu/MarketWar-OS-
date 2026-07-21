// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar WhatsApp Center Engine — the messaging command overview.
//
// For local businesses WhatsApp converts better than any website: ad →
// WhatsApp → AI qualification → offer → order → follow-up. This engine
// computes that overview DETERMINISTICALLY from the brand so the surface is
// fully explorable in zero-config demo mode — a conversation funnel
// (new → engaged → qualified → booked/ordered), response-time + conversion
// metrics, a 14-day thread trend, and a template pipeline (welcome, abandoned,
// booking, review-request) each with a status.
//
// This is DEMO INTELLIGENCE (clearly badged), never fabricated "live" numbers
// presented as real. Live sending — real broadcasts, real inbound threads —
// activates through the platform's shared WhatsApp pool once WHATSAPP_TOKEN is
// provisioned; the `mode` field says so. No wall-clock / randomness so the same
// brand always renders the same board (demo-safe + testable).

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
// FNV-1a — deterministic, mirrors the segmentation engine's seed.
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };

export type FunnelStage = { key: string; label: string; value: number };

export type TemplateStatus = "live-ready" | "primed" | "draft" | "needs-copy";

export type MessageTemplate = {
  key: string;
  label: string;
  purpose: string;
  trigger: string;
  status: TemplateStatus;
  expectedReplyRate: number; // % — deterministic estimate, labelled
  note: string;
};

export type WhatsAppMetrics = {
  newThreadsWeek: number;
  avgResponseMins: number; // target: under 10
  replyRate: number; // % of new threads that engage
  qualificationRate: number; // % of engaged that qualify
  conversionRate: number; // % of new threads that book/order
  openPipelineGbp: number; // value sitting in qualified-but-not-yet-booked threads
  recoverableThreads: number; // ghosted threads the follow-up engine can re-open
  recoverableGbp: number;
};

export type WhatsAppOverview = {
  business: string;
  mode: "demo-intelligence"; // live sending activates via the platform WhatsApp pool (WHATSAPP_TOKEN)
  badge: string;
  funnel: FunnelStage[];
  metrics: WhatsAppMetrics;
  templates: MessageTemplate[];
  daily: { labels: string[]; threads: number[] }; // 14-day new-thread trend
  liveNote: string;
  note: string;
};

// Deterministic 14-day thread trend around a weekly volume (no wall-clock).
function dailyTrend(s: string, weekly: number): { labels: string[]; threads: number[] } {
  const h = seed(s + "·daily");
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const perDay = Math.max(1, Math.round(weekly / 7));
  // Weekend lift for local/food-style demand; gentle upward drift across the fortnight.
  const shape = [0.7, 0.8, 0.85, 1.0, 1.25, 1.45, 1.2, 0.75, 0.85, 0.9, 1.05, 1.3, 1.5, 1.25];
  const threads = shape.map((f, i) => Math.max(1, Math.round(perDay * f * (0.9 + i * 0.012) + ((h >> (i % 12)) % 3))));
  return { labels, threads };
}

function templates(s: string, aov: number): MessageTemplate[] {
  const h = seed(s + "·templates");
  const pick = (i: number, table: TemplateStatus[]): TemplateStatus => table[(h >> (i * 3)) % table.length];
  return [
    {
      key: "welcome",
      label: "Welcome / first reply",
      purpose: "Greet a new inbound thread in seconds and open qualification.",
      trigger: "New WhatsApp thread from an ad or the tap-to-chat button",
      status: pick(0, ["live-ready", "primed"]),
      expectedReplyRate: clamp(58 + ((h >> 2) % 18)),
      note: "Speed is the whole game — an instant, human first reply is the single biggest lift in WhatsApp conversion.",
    },
    {
      key: "abandoned",
      label: "Abandoned / stalled thread",
      purpose: "Re-open threads that went quiet after an offer was sent.",
      trigger: "No reply for the follow-up window after an offer",
      status: pick(1, ["primed", "draft", "live-ready"]),
      expectedReplyRate: clamp(34 + ((h >> 5) % 16)),
      note: "One honest nudge, then the thread moves to the nurture list — frequency-capped, never spammed.",
    },
    {
      key: "booking",
      label: "Booking / order confirmation",
      purpose: `Lock the order and send confirmation (avg order ~£${aov}).`,
      trigger: "Thread reaches booked/ordered stage",
      status: pick(2, ["live-ready", "primed"]),
      expectedReplyRate: clamp(72 + ((h >> 7) % 14)),
      note: "Confirmation + reminder cuts no-shows and cements the order value in the ledger.",
    },
    {
      key: "review-request",
      label: "Review request",
      purpose: "Turn a happy order into a public review + a referral ask.",
      trigger: "Set time after a completed order",
      status: pick(3, ["primed", "draft", "needs-copy"]),
      expectedReplyRate: clamp(28 + ((h >> 9) % 14)),
      note: "Reviews compound local trust and feed the reputation + referral engines.",
    },
  ];
}

export function whatsappOverview(business: string): WhatsAppOverview {
  const name = (business || "").trim() || "your business";
  const s = seed(name);

  // Weekly inbound volume + funnel conversion — deterministic, within realistic bounds.
  const newThreadsWeek = 48 + (s % 96); // ~48–143 new threads / week
  const engagedRate = 0.55 + ((s >> 3) % 22) / 100; // 0.55–0.76
  const qualifiedRate = 0.46 + ((s >> 5) % 24) / 100; // 0.46–0.69
  const bookedRate = 0.34 + ((s >> 7) % 22) / 100; // 0.34–0.55
  const aov = 18 + (s % 55); // £18–£72 average order

  const engaged = Math.round(newThreadsWeek * engagedRate);
  const qualified = Math.round(engaged * qualifiedRate);
  const booked = Math.round(qualified * bookedRate);

  const funnel: FunnelStage[] = [
    { key: "new", label: "New threads", value: newThreadsWeek },
    { key: "engaged", label: "Engaged", value: engaged },
    { key: "qualified", label: "Qualified", value: qualified },
    { key: "booked", label: "Booked / ordered", value: booked },
  ];

  const recoverableThreads = Math.max(0, engaged - qualified);
  const openPipelineGbp = Math.round((qualified - booked) * aov);
  const recoverableGbp = Math.round(recoverableThreads * aov * 0.5);

  const metrics: WhatsAppMetrics = {
    newThreadsWeek,
    avgResponseMins: 3 + ((s >> 4) % 8), // 3–10 min (target: under 10)
    replyRate: Math.round((engaged / newThreadsWeek) * 100),
    qualificationRate: Math.round((qualified / Math.max(1, engaged)) * 100),
    conversionRate: Math.round((booked / newThreadsWeek) * 100),
    openPipelineGbp,
    recoverableThreads,
    recoverableGbp,
  };

  return {
    business: name,
    mode: "demo-intelligence",
    badge: "Demo intelligence",
    funnel,
    metrics,
    templates: templates(name, aov),
    daily: dailyTrend(name, newThreadsWeek),
    liveNote: "Live sending — real broadcasts and real inbound threads — activates through the platform's shared WhatsApp pool once WHATSAPP_TOKEN is provisioned. Until then this is a deterministic projection from the brand, not live traffic.",
    note: "Deterministic demo intelligence: the funnel and metrics are computed from the brand, not fabricated live figures. Every marketing message is consent-gated and frequency-capped by the follow-up engine; a conversion or opt-out ends contact immediately.",
  };
}
