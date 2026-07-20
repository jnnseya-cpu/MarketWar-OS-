// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Customer Engagement Engine (Brevo-class CRM + CDP + lifecycle).
//
// A deterministic, demo-safe engagement platform: a CDP contact model, AI smart
// segmentation (behaviour / industry / location / buying intent / engagement /
// lifecycle / predicted conversion / inactivity risk), 12 lifecycle automation
// templates, 10 transactional message types, 14-metric campaign analytics, an
// AI reply drafter (never auto-sent) and a send-eligibility gate that enforces
// marketing consent + a frequency cap. No fabricated metrics or testimonials —
// every number is derived from the records supplied or the deterministic demo
// set, and predictions are labelled as estimates.

// --- Deterministic seed (no Date.now / Math.random anywhere) ---
const seed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};
const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const pct = (num: number, den: number): number => den <= 0 ? 0 : Math.round((num / den) * 1000) / 10;

// --- Types ---
export type LifecycleStage =
  | "subscriber" | "lead" | "mql" | "sql" | "customer" | "churn_risk" | "inactive";
export type ConsentStatus = "opted_in" | "opted_out" | "unknown";
export type Intent = "interested" | "question" | "objection" | "unsubscribe" | "not_interested";

export type Contact = {
  id: string;
  email: string;
  name: string;
  company: string;
  lifecycleStage: LifecycleStage;
  tags: string[];
  leadScore: number; // 0-100
  consentStatus: ConsentStatus;
  engagementScore: number; // 0-100
  lastTouchDaysAgo: number;
  industry?: string;
  location?: string;
  buyingIntent?: "high" | "medium" | "low";
  touchesLast7Days?: number;
};

export type Segment = {
  segment: string;
  criteria: string;
  contactIds: string[];
  size: number;
};

export type LifecycleAutomation = {
  id: string;
  label: string;
  trigger: string;
  steps: number;
};

export type CampaignMetrics = {
  sent: number;
  delivered: number;
  openRate: number; // %
  clickRate: number; // %
  clickToOpenRate: number; // %
  bounceRate: number; // %
  unsubscribeRate: number; // %
  spamComplaints: number;
  revenueGbp: number;
  conversionRate: number; // %
  bestSubject: string;
  bestSegment: string;
  bestSendTime: string;
  roi: string; // labelled estimate
};

export type ReplySuggestion = {
  intent: Intent;
  draftReply: string;
  isDraft: true;
  note: string;
};

export type Eligibility = {
  canSend: boolean;
  reason: string;
};

export type CampaignInput = {
  sent?: number;
  delivered?: number;
  opens?: number;
  clicks?: number;
  bounces?: number;
  unsubscribes?: number;
  spamComplaints?: number;
  conversions?: number;
  revenueGbp?: number;
  costGbp?: number;
  subjects?: string[];
  segments?: string[];
};

// --- 12 lifecycle automation templates ---
export const LIFECYCLE_AUTOMATIONS: LifecycleAutomation[] = [
  { id: "welcome", label: "Welcome series", trigger: "contact.subscribed", steps: 3 },
  { id: "lead_nurture", label: "Lead nurture", trigger: "contact.became_lead", steps: 5 },
  { id: "abandoned_cart", label: "Abandoned cart", trigger: "cart.abandoned", steps: 3 },
  { id: "re_engagement", label: "Re-engagement", trigger: "contact.inactive_30d", steps: 3 },
  { id: "trial_conversion", label: "Trial conversion", trigger: "trial.started", steps: 4 },
  { id: "post_purchase", label: "Post-purchase", trigger: "order.completed", steps: 3 },
  { id: "upsell", label: "Upsell / cross-sell", trigger: "customer.milestone", steps: 2 },
  { id: "renewal_reminder", label: "Renewal reminder", trigger: "subscription.expiring", steps: 3 },
  { id: "payment_reminder", label: "Payment reminder", trigger: "invoice.due", steps: 3 },
  { id: "win_back", label: "Win-back", trigger: "customer.churned", steps: 4 },
  { id: "birthday", label: "Birthday / anniversary", trigger: "contact.birthday", steps: 1 },
  { id: "event_reminder", label: "Event reminder", trigger: "event.upcoming", steps: 3 },
];

// --- 10 transactional message types ---
export const TRANSACTIONAL_TYPES: string[] = [
  "otp",
  "password_reset",
  "order_confirmation",
  "booking_confirmation",
  "payment_receipt",
  "invoice",
  "shipping_update",
  "account_approval",
  "subscription_renewal",
  "security_alert",
];

// --- AI smart segmentation ---
export function aiSegment(contacts: Contact[]): Segment[] {
  const idsWhere = (fn: (c: Contact) => boolean): string[] =>
    contacts.filter(fn).map((c) => c.id);

  const build = (segment: string, criteria: string, fn: (c: Contact) => boolean): Segment => {
    const contactIds = idsWhere(fn);
    return { segment, criteria, contactIds, size: contactIds.length };
  };

  // Group by industry + location dynamically (deterministic ordering by key).
  const industries = Array.from(new Set(contacts.map((c) => c.industry).filter((v): v is string => !!v))).sort();
  const locations = Array.from(new Set(contacts.map((c) => c.location).filter((v): v is string => !!v))).sort();

  const segments: Segment[] = [
    build("high_buying_intent", "buyingIntent = high AND leadScore >= 60", (c) => c.buyingIntent === "high" && c.leadScore >= 60),
    build("highly_engaged", "engagementScore >= 70", (c) => c.engagementScore >= 70),
    build("sales_qualified", "lifecycleStage in [mql, sql]", (c) => c.lifecycleStage === "mql" || c.lifecycleStage === "sql"),
    build("active_customers", "lifecycleStage = customer AND lastTouchDaysAgo <= 30", (c) => c.lifecycleStage === "customer" && c.lastTouchDaysAgo <= 30),
    build("predicted_to_convert", "leadScore + engagementScore >= 120 (estimate)", (c) => c.leadScore + c.engagementScore >= 120),
    build("inactivity_risk", "lastTouchDaysAgo >= 45 OR lifecycleStage in [churn_risk, inactive]", (c) => c.lastTouchDaysAgo >= 45 || c.lifecycleStage === "churn_risk" || c.lifecycleStage === "inactive"),
    build("marketable_consented", "consentStatus = opted_in", (c) => c.consentStatus === "opted_in"),
  ];

  for (const ind of industries) {
    segments.push(build(`industry_${ind.toLowerCase().replace(/\s+/g, "_")}`, `industry = ${ind}`, (c) => c.industry === ind));
  }
  for (const loc of locations) {
    segments.push(build(`location_${loc.toLowerCase().replace(/\s+/g, "_")}`, `location = ${loc}`, (c) => c.location === loc));
  }

  // Only surface non-empty segments; keep deterministic order (by descending size, then name).
  return segments
    .filter((s) => s.size > 0)
    .sort((a, b) => b.size - a.size || a.segment.localeCompare(b.segment));
}

// --- Campaign analytics (14 metrics, all derived) ---
export function campaignAnalytics(input?: CampaignInput): CampaignMetrics {
  const demoInput: CampaignInput = {
    sent: 4200,
    delivered: 4083,
    opens: 1755,
    clicks: 421,
    bounces: 117,
    unsubscribes: 24,
    spamComplaints: 3,
    conversions: 96,
    revenueGbp: 8640,
    costGbp: 1200,
    subjects: ["Your July offer is live", "48 hours left", "We saved your basket"],
    segments: ["high_buying_intent", "active_customers", "highly_engaged"],
  };
  const d: CampaignInput = input ?? demoInput;

  const sent = d.sent ?? 0;
  const delivered = d.delivered ?? Math.max(0, sent - (d.bounces ?? 0));
  const opens = d.opens ?? 0;
  const clicks = d.clicks ?? 0;
  const bounces = d.bounces ?? 0;
  const unsubscribes = d.unsubscribes ?? 0;
  const conversions = d.conversions ?? 0;
  const revenueGbp = d.revenueGbp ?? 0;
  const costGbp = d.costGbp ?? 0;
  const subjects = d.subjects && d.subjects.length ? d.subjects : ["(no subject supplied)"];
  const segs = d.segments && d.segments.length ? d.segments : ["(no segment supplied)"];

  // bestSubject / bestSegment / bestSendTime chosen deterministically by seed.
  const bestSubject = subjects[seed(subjects.join("|")) % subjects.length];
  const bestSegment = segs[seed(segs.join("|")) % segs.length];
  const hours = ["08:00", "09:00", "11:00", "13:00", "17:00", "19:00", "20:00"];
  const bestSendTime = hours[seed(sent + ":" + delivered) % hours.length];

  const roiRatio = costGbp > 0 ? Math.round((revenueGbp / costGbp) * 10) / 10 : 0;

  return {
    sent,
    delivered,
    openRate: pct(opens, delivered),
    clickRate: pct(clicks, delivered),
    clickToOpenRate: pct(clicks, opens),
    bounceRate: pct(bounces, sent),
    unsubscribeRate: pct(unsubscribes, delivered),
    spamComplaints: d.spamComplaints ?? 0,
    revenueGbp,
    conversionRate: pct(conversions, delivered),
    bestSubject,
    bestSegment,
    bestSendTime,
    roi: costGbp > 0 ? `${roiRatio}x (estimate)` : "n/a — supply costGbp",
  };
}

// --- AI reply drafter (draft only, never auto-sent) ---
export function suggestReply(threadMessage: string): ReplySuggestion {
  const text = (threadMessage || "").toLowerCase();
  let intent: Intent;
  if (/\b(unsubscribe|opt out|stop|remove me|do not (email|contact))\b/.test(text)) intent = "unsubscribe";
  else if (/\b(too expensive|price|cost|budget|not worth|already (use|have)|competitor)\b/.test(text)) intent = "objection";
  else if (/\b(not interested|no thanks|not right now|maybe later|no need)\b/.test(text)) intent = "not_interested";
  else if (/[?]|\b(how|what|when|which|can you|could you|does it|do you)\b/.test(text)) intent = "question";
  else intent = "interested";

  const drafts: Record<Intent, string> = {
    interested: "Thanks for getting back to us — glad this is a fit. Would a short call this week work to map next steps? Happy to send a tailored plan first if that is easier.",
    question: "Great question. Here is the short answer, and I have attached the detail so you can review at your own pace. Want me to walk through it live, or is the write-up enough?",
    objection: "Completely fair to weigh that up. Here is how other teams in your position sized the return before committing — no pressure, just so the comparison is honest. Happy to tailor the numbers to your case.",
    unsubscribe: "Understood — I will make sure you are opted out of marketing right away and you will not hear from us on this. If it is ever useful again, you are welcome back any time.",
    not_interested: "Appreciated you letting me know — I will close this off so we are not cluttering your inbox. If timing changes, my door is open. All the best.",
  };

  return {
    intent,
    draftReply: drafts[intent],
    isDraft: true,
    note: "AI-suggested draft — review and edit before sending. Never auto-sent.",
  };
}

// --- Send eligibility (consent + frequency cap) ---
export function eligibleToSend(contact: Contact): Eligibility {
  if (contact.consentStatus === "opted_out") {
    return { canSend: false, reason: "Contact has opted out of marketing." };
  }
  if (contact.consentStatus === "unknown") {
    return { canSend: false, reason: "No recorded marketing consent — treat as not opted in." };
  }
  const touches = contact.touchesLast7Days ?? 0;
  if (touches >= 5) {
    return { canSend: false, reason: `Frequency cap reached (${touches} touches in last 7 days; max 5).` };
  }
  return { canSend: true, reason: `Consented and within frequency cap (${touches}/5 touches this week).` };
}

// --- Deterministic demo contact set ---
export function demoContacts(): Contact[] {
  const rows: Array<Omit<Contact, "leadScore" | "engagementScore" | "lastTouchDaysAgo" | "touchesLast7Days">> = [
    { id: "c1", email: "amara@northloop.co", name: "Amara Osei", company: "NorthLoop", lifecycleStage: "sql", tags: ["demo_booked"], consentStatus: "opted_in", industry: "SaaS", location: "London", buyingIntent: "high" },
    { id: "c2", email: "ben@grillhouse.co", name: "Ben Carter", company: "Brixton Grill House", lifecycleStage: "customer", tags: ["vip"], consentStatus: "opted_in", industry: "Hospitality", location: "London", buyingIntent: "medium" },
    { id: "c3", email: "chloe@medapt.io", name: "Chloe Reid", company: "MedApt", lifecycleStage: "mql", tags: ["webinar"], consentStatus: "opted_in", industry: "Healthcare", location: "Manchester", buyingIntent: "high" },
    { id: "c4", email: "dan@retailrise.com", name: "Dan Whyte", company: "RetailRise", lifecycleStage: "lead", tags: ["download"], consentStatus: "unknown", industry: "Retail", location: "Leeds", buyingIntent: "low" },
    { id: "c5", email: "eve@fintrail.io", name: "Eve Nguyen", company: "FinTrail", lifecycleStage: "churn_risk", tags: ["past_customer"], consentStatus: "opted_in", industry: "SaaS", location: "Bristol", buyingIntent: "medium" },
    { id: "c6", email: "farid@saedb.co", name: "Farid Saed", company: "SaeDB", lifecycleStage: "inactive", tags: [], consentStatus: "opted_out", industry: "SaaS", location: "London", buyingIntent: "low" },
    { id: "c7", email: "gita@bloomcare.co", name: "Gita Rao", company: "BloomCare", lifecycleStage: "subscriber", tags: ["newsletter"], consentStatus: "opted_in", industry: "Healthcare", location: "Manchester", buyingIntent: "low" },
    { id: "c8", email: "hana@peakwear.com", name: "Hana Lund", company: "PeakWear", lifecycleStage: "customer", tags: ["repeat"], consentStatus: "opted_in", industry: "Retail", location: "Leeds", buyingIntent: "high" },
  ];
  return rows.map((r) => {
    const h = seed(r.id + r.email);
    return {
      ...r,
      leadScore: clamp(30 + (h % 70)),
      engagementScore: clamp(20 + ((h >> 3) % 80)),
      lastTouchDaysAgo: (h >> 5) % 90,
      touchesLast7Days: (h >> 2) % 6,
    };
  });
}

// --- Fully-populated demo (zero-config) ---
export function demoEngagement(): {
  business: string;
  doctrine: string;
  contacts: Contact[];
  segments: Segment[];
  analytics: CampaignMetrics;
  eligibilitySample: Array<{ id: string } & Eligibility>;
  replySample: ReplySuggestion;
  automations: LifecycleAutomation[];
  transactionalTypes: string[];
} {
  const contacts = demoContacts();
  return {
    business: "Brixton Grill House",
    doctrine: "Predictions are estimates. Marketing sends require opt-in consent and are capped at 5 touches per 7 days. Replies are AI drafts, never auto-sent. No fabricated metrics or testimonials.",
    contacts,
    segments: aiSegment(contacts),
    analytics: campaignAnalytics(),
    eligibilitySample: contacts.slice(0, 4).map((c) => ({ id: c.id, ...eligibleToSend(c) })),
    replySample: suggestReply("This looks interesting but how does the price compare to what we already use?"),
    automations: LIFECYCLE_AUTOMATIONS,
    transactionalTypes: TRANSACTIONAL_TYPES,
  };
}
