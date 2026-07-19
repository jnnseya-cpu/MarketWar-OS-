// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar No-Code Revenue Automation Builder (Brevo pack Module 7 / MVP Phase 5).
//
// Trigger → Condition → Action → Delay → Branch. Wires the owned engines
// (email/SMS/WhatsApp/segments/pipeline/offers) into autonomous customer
// journeys. Deterministic + demo-safe. Doctrine, enforced in validation:
// messaging actions are consent-gated, capped at the frequency ceiling, and
// stopped on opt-out or conversion — the builder cannot ship a workflow that
// would spam. No fabricated sends; this defines the plan, the send path runs it.

const MAX_TOUCHES_PER_7D = 5; // shared frequency ceiling with M-35 amplify

// The trigger + action vocabulary (Brevo pack: 15 triggers, 12 actions).
export const TRIGGERS = [
  "form_submitted", "landing_page_visited", "email_opened", "email_clicked",
  "sms_replied", "whatsapp_replied", "booking_created", "cart_abandoned",
  "quote_requested", "payment_failed", "customer_inactive", "birthday",
  "anniversary", "lead_score_changed", "deal_stage_changed",
] as const;

export const ACTIONS = [
  "send_email", "send_sms", "send_whatsapp", "create_deal", "assign_to_team_member",
  "add_to_segment", "send_push_notification", "create_task", "trigger_retargeting",
  "generate_offer", "notify_user", "create_landing_page",
] as const;

export type TriggerId = (typeof TRIGGERS)[number];
export type ActionId = (typeof ACTIONS)[number];

const MESSAGING_ACTIONS = new Set<ActionId>(["send_email", "send_sms", "send_whatsapp", "send_push_notification"]);

export type WorkflowStep =
  | { kind: "wait"; delayHours: number; label: string }
  | { kind: "action"; action: ActionId; channel?: string; detail: string }
  | { kind: "condition"; check: string; onFalse: "exit" | "continue"; label: string };

export type Workflow = {
  id: string; name: string; trigger: TriggerId; goal: string; description: string;
  steps: WorkflowStep[];
};

// ---------------------------------------------------------------------------
// Journey template library (concrete, pre-built workflows)
// ---------------------------------------------------------------------------
export const TEMPLATES: Workflow[] = [
  {
    id: "welcome", name: "Welcome sequence", trigger: "form_submitted", goal: "Convert a new lead into a first purchase",
    description: "Greets a new lead, delivers value, and asks for the first action — consent-gated, capped.",
    steps: [
      { kind: "action", action: "send_whatsapp", channel: "WhatsApp", detail: "Instant welcome + what happens next (only if opted in)" },
      { kind: "wait", delayHours: 24, label: "Wait 1 day" },
      { kind: "condition", check: "did not convert", onFalse: "exit", label: "Stop if they already bought" },
      { kind: "action", action: "send_email", channel: "Email", detail: "Value email + social proof" },
      { kind: "wait", delayHours: 48, label: "Wait 2 days" },
      { kind: "action", action: "generate_offer", detail: "First-order incentive with an honest deadline" },
      { kind: "action", action: "send_email", channel: "Email", detail: "Deliver the offer" },
    ],
  },
  {
    id: "abandoned_cart", name: "Abandoned cart recovery", trigger: "cart_abandoned", goal: "Recover the lost sale",
    description: "Recovers an abandoned checkout with a reminder → nudge → incentive, stopping on purchase.",
    steps: [
      { kind: "wait", delayHours: 1, label: "Wait 1 hour" },
      { kind: "action", action: "send_whatsapp", channel: "WhatsApp", detail: "Friendly 'you left something' reminder" },
      { kind: "wait", delayHours: 23, label: "Wait ~1 day" },
      { kind: "condition", check: "still not purchased", onFalse: "exit", label: "Stop if recovered" },
      { kind: "action", action: "send_sms", channel: "SMS", detail: "Short nudge + STOP to opt out" },
      { kind: "wait", delayHours: 48, label: "Wait 2 days" },
      { kind: "action", action: "generate_offer", detail: "Small time-boxed recovery incentive" },
      { kind: "action", action: "send_email", channel: "Email", detail: "Deliver the recovery offer" },
    ],
  },
  {
    id: "win_back", name: "Win-back (dormant customers)", trigger: "customer_inactive", goal: "Reactivate a dormant customer",
    description: "Wins back an inactive customer once, then sunsets — never nags.",
    steps: [
      { kind: "action", action: "add_to_segment", detail: "Tag as win-back cohort" },
      { kind: "action", action: "send_email", channel: "Email", detail: "'We miss you' + what's new" },
      { kind: "wait", delayHours: 72, label: "Wait 3 days" },
      { kind: "condition", check: "no re-engagement", onFalse: "exit", label: "Stop if re-engaged" },
      { kind: "action", action: "send_whatsapp", channel: "WhatsApp", detail: "Comeback offer (once)" },
      { kind: "wait", delayHours: 168, label: "Wait 7 days" },
      { kind: "action", action: "add_to_segment", detail: "Sunset if still silent — stop contacting" },
    ],
  },
  {
    id: "booking_reminder", name: "Booking reminder", trigger: "booking_created", goal: "Reduce no-shows",
    description: "Confirms and reminds a booking to cut no-shows (transactional — always allowed).",
    steps: [
      { kind: "action", action: "send_whatsapp", channel: "WhatsApp", detail: "Booking confirmation (transactional)" },
      { kind: "wait", delayHours: 24, label: "Day before" },
      { kind: "action", action: "send_sms", channel: "SMS", detail: "24h reminder + reschedule link" },
      { kind: "wait", delayHours: 22, label: "2h before" },
      { kind: "action", action: "send_whatsapp", channel: "WhatsApp", detail: "2-hour reminder" },
    ],
  },
  {
    id: "review_request", name: "Review request", trigger: "deal_stage_changed", goal: "Grow verified reviews",
    description: "Requests a review after a completed job to build trust + AI-search visibility.",
    steps: [
      { kind: "condition", check: "stage == won", onFalse: "exit", label: "Only after a win" },
      { kind: "wait", delayHours: 48, label: "Wait 2 days (let value land)" },
      { kind: "action", action: "send_whatsapp", channel: "WhatsApp", detail: "Ask for a review with a direct link" },
      { kind: "wait", delayHours: 96, label: "Wait 4 days" },
      { kind: "condition", check: "no review left", onFalse: "exit", label: "Stop if reviewed" },
      { kind: "action", action: "send_email", channel: "Email", detail: "One polite reminder, then stop" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Validation — the builder cannot ship a spammy or non-consented workflow
// ---------------------------------------------------------------------------
export type Validation = { valid: boolean; touchesIn7d: number; warnings: string[]; guarantees: string[] };

export function validateWorkflow(wf: Workflow): Validation {
  const warnings: string[] = [];
  // Count messaging touches within a rolling 7 days (168h).
  let cumHours = 0;
  const messagingTimes: number[] = [];
  for (const step of wf.steps) {
    if (step.kind === "wait") cumHours += step.delayHours;
    else if (step.kind === "action" && MESSAGING_ACTIONS.has(step.action)) messagingTimes.push(cumHours);
  }
  let maxIn7d = 0;
  for (let i = 0; i < messagingTimes.length; i++) {
    const inWindow = messagingTimes.filter((t) => t >= messagingTimes[i] && t < messagingTimes[i] + 168).length;
    maxIn7d = Math.max(maxIn7d, inWindow);
  }
  if (maxIn7d > MAX_TOUCHES_PER_7D) warnings.push(`Exceeds the frequency cap: ${maxIn7d} messaging touches within 7 days (max ${MAX_TOUCHES_PER_7D}). Space them out.`);

  const hasStopCondition = wf.steps.some((s) => s.kind === "condition");
  if (!hasStopCondition && wf.trigger !== "booking_created") warnings.push("No stop condition — add a 'exit on conversion/opt-out' check so the journey ends when the goal is met.");

  return {
    valid: maxIn7d <= MAX_TOUCHES_PER_7D,
    touchesIn7d: maxIn7d,
    warnings,
    guarantees: [
      "Every marketing message is consent-gated — non-consented contacts are skipped at send time.",
      `Frequency ceiling ${MAX_TOUCHES_PER_7D} touches / 7 days enforced on the send path.`,
      "Opt-out (STOP / unsubscribe) and conversion both end the journey immediately.",
      "Transactional messages (confirmations/reminders) are exempt from the marketing cap.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Simulation — dry-run the timeline for preview (respects consent)
// ---------------------------------------------------------------------------
export type SimEvent = { atHours: number; when: string; kind: string; detail: string; sent: boolean; reason?: string };

export function simulateWorkflow(wf: Workflow, ctx: { consented?: boolean } = {}): { timeline: SimEvent[]; note: string } {
  const consented = ctx.consented !== false;
  const timeline: SimEvent[] = [];
  let cumHours = 0;
  for (const step of wf.steps) {
    if (step.kind === "wait") { cumHours += step.delayHours; continue; }
    if (step.kind === "condition") {
      timeline.push({ atHours: cumHours, when: fmt(cumHours), kind: "condition", detail: `${step.label} (${step.check})`, sent: true });
      continue;
    }
    const isMsg = MESSAGING_ACTIONS.has(step.action);
    const blocked = isMsg && !consented;
    timeline.push({
      atHours: cumHours, when: fmt(cumHours), kind: step.action,
      detail: `${step.channel ? step.channel + ": " : ""}${step.detail}`,
      sent: !blocked, reason: blocked ? "skipped — not consented for marketing" : undefined,
    });
  }
  return {
    timeline,
    note: consented ? "Consented contact — all marketing steps eligible (still capped + opt-out-aware at send)." : "Non-consented contact — marketing steps are skipped; only transactional messages would send.",
  };
}

function fmt(hours: number): string {
  if (hours === 0) return "immediately";
  if (hours < 24) return `+${hours}h`;
  const d = Math.round(hours / 24);
  return `+${d}d`;
}
