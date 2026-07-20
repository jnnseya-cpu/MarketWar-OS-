// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar OS — Communication Event Architecture.
//
// ONE event engine. Every product event is defined once in a catalogue and
// fans out across the wired channels (email · in-app · SMS · push · WhatsApp),
// honouring each recipient's opt-outs — except MANDATORY notices (security,
// billing-critical, compliance, outage) which bypass opt-outs by law/necessity.
//
// Pure + deterministic so it runs in demo mode and unit-checks. Actual sends
// route through the provider adapters (email.ts, WhatsApp/SMS connectors); this
// module is the catalogue + routing + template-QA brain. Consent + the 5-touch
// frequency cap apply to MARKETING journeys, never to these transactional/
// operational notices — which is exactly why mandatory notices are separated.

export const CHANNELS = ["email", "inapp", "sms", "push", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];
export type Severity = "info" | "success" | "warning" | "critical";

export type CommsEvent = {
  id: string;          // dot.namespaced event key
  name: string;        // human label
  subject: string;     // default subject / title ({{tokens}} interpolated)
  category: string;
  severity: Severity;
  channels: Channel[]; // channels this event fires on by default
  mandatory?: boolean; // bypasses opt-outs (security/billing/compliance/outage)
};

// Compact builder: channels as a space string of e/i/s/p/w.
const CH: Record<string, Channel> = { e: "email", i: "inapp", s: "sms", p: "push", w: "whatsapp" };
const ch = (s: string): Channel[] => s.split(" ").filter(Boolean).map((k) => CH[k]);
function ev(id: string, name: string, subject: string, severity: Severity, channels: string, mandatory = false): CommsEvent {
  const category = CURRENT_CATEGORY;
  return { id, name, subject, category, severity, channels: ch(channels), mandatory };
}
let CURRENT_CATEGORY = "";
function cat(name: string, build: () => CommsEvent[]): CommsEvent[] { CURRENT_CATEGORY = name; return build(); }

// ---------------------------------------------------------------------------
// The catalogue — 15 MarketWar categories.
// ---------------------------------------------------------------------------
export const EVENTS: CommsEvent[] = [
  ...cat("Identity & Account", () => [
    ev("account.registration.requested", "Account requested", "Welcome to MarketWar OS — confirm your account", "info", "e i"),
    ev("account.email_verification_required", "Email verification required", "Verify your email address", "warning", "e i"),
    ev("account.verification.successful", "Verification successful", "Your account is verified", "success", "e i"),
    ev("account.verification.expired", "Verification expired", "Your verification link expired", "warning", "e i"),
    ev("account.registration.abandoned", "Registration abandoned", "Finish setting up your MarketWar OS account", "info", "e i"),
    ev("org.created", "Organisation created", "{{org}} is ready on MarketWar OS", "success", "e i"),
    ev("org.brand_added", "Brand added", "New brand added: {{brand}}", "info", "i"),
    ev("workspace.created", "Workspace created", "Workspace created: {{item}}", "info", "i"),
    ev("invitation.sent", "User invited", "{{actor}} invited you to {{org}} on MarketWar OS", "info", "e i"),
    ev("invitation.accepted", "Invitation accepted", "{{name}} accepted your invitation", "success", "i"),
    ev("invitation.expired", "Invitation expired", "Your invitation has expired", "info", "e i"),
  ]),
  ...cat("Login & Security", () => [
    ev("auth.login.success", "Successful login", "New sign-in to your account", "info", "i"),
    ev("auth.login.suspicious", "Suspicious login", "Unusual sign-in detected", "critical", "e i s", true),
    ev("auth.device.new", "New device detected", "New device signed in", "warning", "e i", true),
    ev("password.forgot", "Forgot password", "Reset your MarketWar OS password", "info", "e i"),
    ev("password.reset.successful", "Password reset successful", "Your password was reset", "success", "e i s", true),
    ev("password.changed", "Password changed", "Your password was changed", "success", "e i", true),
    ev("mfa.otp_code", "OTP code", "Your MarketWar OS verification code", "info", "e i s"),
    ev("mfa.enabled", "MFA enabled", "Two-factor authentication enabled", "success", "e i", true),
    ev("security.alert", "Security alert", "Security alert on your account", "critical", "e i s", true),
    ev("account.locked", "Account locked", "Your account has been locked", "critical", "e i s", true),
    ev("session.revoked", "Session revoked", "A session was signed out", "warning", "e i", true),
  ]),
  ...cat("Subscription & Billing", () => [
    ev("subscription.trial_started", "Trial started", "Your MarketWar OS trial has started", "success", "e i"),
    ev("subscription.trial_ending", "Trial ending", "Your trial ends in 3 days", "warning", "e i"),
    ev("subscription.activated", "Subscription activated", "Your {{plan}} subscription is active", "success", "e i"),
    ev("subscription.renewed", "Subscription renewed", "Your subscription renewed", "info", "e i"),
    ev("subscription.cancelled", "Subscription cancelled", "Your subscription was cancelled", "warning", "e i"),
    ev("subscription.plan_changed", "Plan changed", "Your plan is now {{plan}}", "info", "e i"),
    ev("payment.successful", "Payment successful", "Payment received — {{amount}}", "success", "e i"),
    ev("payment.failed", "Payment failed", "Your payment failed", "warning", "e i s", true),
    ev("payment.card_expiring", "Card expiring", "Your card expires soon", "warning", "e i"),
    ev("invoice.generated", "Invoice generated", "Invoice {{number}} is ready", "info", "e i"),
    ev("invoice.overdue", "Invoice overdue", "Invoice {{number}} is overdue", "warning", "e i s", true),
    ev("payment.waiver_granted", "Payment waived", "A payment waiver was applied to your account", "info", "e i"),
    ev("discount.applied", "Discount applied", "Your discount {{code}} was applied", "success", "e i"),
  ]),
  ...cat("ACU & AI Economy", () => [
    ev("acu.allocated", "ACUs allocated", "{{amount}} ACUs added to your wallet", "success", "i"),
    ev("acu.topup_successful", "Top-up successful", "{{amount}} ACUs added", "success", "e i"),
    ev("acu.low_balance", "Low ACU balance", "Your ACU balance is running low", "warning", "e i p"),
    ev("acu.hard_stop", "ACU hard stop", "AI actions paused — top up to continue", "critical", "e i p", true),
    ev("acu.reservation_released", "Reservation released", "Reserved ACUs were released (no charge)", "info", "i"),
    ev("acu.recycled", "ACUs recycled", "A reusable output earned recycled margin", "success", "i"),
    ev("margin.amber", "Margin amber", "AI gross margin dipped to amber on {{feature}}", "warning", "i p"),
    ev("margin.red", "Margin red", "AI gross margin is red on {{feature}} — arbitrating", "critical", "e i", true),
    ev("provider.failover", "Provider failover", "Routed to a backup AI provider automatically", "info", "i"),
    ev("provider.circuit_open", "Provider circuit open", "An AI provider is temporarily blocked", "warning", "i p"),
    ev("export.charge", "Export charged", "Premium export consumed {{amount}} ACUs", "info", "i"),
  ]),
  ...cat("Team & Access", () => [
    ev("user.activated", "User activated", "Your account is active", "success", "e i"),
    ev("user.suspended", "User suspended", "Your account has been suspended", "warning", "e i", true),
    ev("user.removed", "Access removed", "Your access has been removed", "warning", "e i", true),
    ev("role.assigned", "Role assigned", "Your role was updated", "info", "e i"),
    ev("permission.changed", "Permission changed", "Your permissions changed", "info", "i"),
    ev("team.member_added", "Added to team", "You were added to {{item}}", "info", "i p"),
    ev("team.member_removed", "Removed from team", "You were removed from {{item}}", "info", "i"),
    ev("wallet.controlled_limit", "Wallet limit set", "A spending limit was set on {{brand}}", "info", "i"),
  ]),
  ...cat("Approvals & Autonomy", () => [
    ev("approval.requested", "Approval requested", "Approval needed: {{item}}", "warning", "e i p"),
    ev("approval.reminder", "Approval reminder", "Reminder: approval pending for {{item}}", "warning", "e i p"),
    ev("approval.approved", "Approved", "{{item}} was approved", "success", "e i p"),
    ev("approval.rejected", "Rejected", "{{item}} was rejected", "warning", "e i p"),
    ev("approval.sla_breach", "SLA breach", "SLA breach: {{item}} approval overdue", "critical", "e i s", true),
    ev("autonomy.escalated_manager", "Escalated to manager", "Approval escalated to manager", "warning", "e i p"),
    ev("autonomy.escalated_executive", "Escalated to executive", "Approval escalated to executive", "critical", "e i s", true),
    ev("autonomy.autopilot_capped", "Autopilot capped", "High-risk action held for review (autopilot capped)", "warning", "e i", true),
    ev("autonomy.level_changed", "Autonomy level changed", "Publishing autonomy set to Level {{item}}", "info", "i"),
  ]),
  ...cat("Campaigns & Content", () => [
    ev("campaign.created", "Campaign created", "Campaign created: {{campaign}}", "info", "i"),
    ev("campaign.generated", "Campaign generated", "Your AI campaign is ready: {{campaign}}", "success", "e i p"),
    ev("campaign.scheduled", "Campaign scheduled", "Campaign scheduled: {{campaign}}", "info", "i"),
    ev("campaign.published", "Campaign published", "Campaign is live: {{campaign}}", "success", "i p"),
    ev("campaign.paused", "Campaign paused", "Campaign paused: {{campaign}}", "warning", "e i"),
    ev("content.generated", "Content generated", "New content pack ready", "success", "i p"),
    ev("content.claim_blocked", "Claim blocked", "An unsubstantiated claim was blocked before publish", "warning", "e i", true),
    ev("experiment.winner", "Experiment winner", "A/B winner found for {{campaign}}", "success", "i p"),
    ev("rights.incomplete", "Rights incomplete", "Publishing blocked — content rights are incomplete", "warning", "e i", true),
    ev("trend.opportunity", "Trend opportunity", "A brand-safe trend to hijack: {{item}}", "info", "i p"),
  ]),
  ...cat("Leads & CRM", () => [
    ev("lead.captured", "Lead captured", "New lead: {{name}}", "success", "i p"),
    ev("lead.scored", "Lead scored", "Deal probability updated for {{name}}", "info", "i"),
    ev("lead.hot", "Hot lead", "High-intent lead detected: {{name}}", "success", "e i p w"),
    ev("quote.requested", "Quote requested", "New quote request: {{item}}", "info", "e i p w"),
    ev("meeting.booked", "Meeting booked", "Meeting booked with {{name}}", "success", "e i p"),
    ev("meeting.reminder", "Meeting reminder", "Reminder: meeting with {{name}}", "info", "e i s p w"),
    ev("pipeline.stage_changed", "Pipeline stage changed", "{{name}} moved to {{item}}", "info", "i"),
    ev("lead.recovery", "Lead recovery", "Recoverable revenue detected: {{item}}", "info", "e i"),
    ev("inbox.new_message", "New message", "New message from {{name}}", "info", "i p w"),
    ev("inbox.sla_breach", "Inbox SLA breach", "A conversation is past its SLA", "warning", "e i p", true),
  ]),
  ...cat("Reputation & Reviews", () => [
    ev("review.new", "New review", "New {{item}}-star review", "info", "i p"),
    ev("review.negative", "Negative review", "A negative review needs a reply", "warning", "e i p"),
    ev("review.reply_drafted", "Reply drafted", "An AI reply is drafted for your approval", "info", "i"),
    ev("reputation.crisis", "Reputation crisis", "Crisis signal detected — {{item}}", "critical", "e i s p", true),
    ev("reputation.trustscore_up", "TrustScore up", "Your TrustScore improved to {{item}}", "success", "i"),
    ev("reputation.fake_review", "Fake review flagged", "A suspicious review was flagged", "warning", "e i"),
  ]),
  ...cat("Deliverability & Messaging", () => [
    ev("deliverability.warmup_started", "Warm-up started", "Sending warm-up has started", "info", "i"),
    ev("deliverability.bounce_spike", "Bounce spike", "Bounce rate spiked — sending throttled", "warning", "e i", true),
    ev("deliverability.complaint_spike", "Complaint spike", "Spam-complaint rate is high — review your list", "critical", "e i", true),
    ev("deliverability.reputation_drop", "Reputation drop", "Sender reputation dropped for {{item}}", "warning", "e i"),
    ev("deliverability.suppression_added", "Suppressed", "A contact was added to suppression", "info", "i"),
    ev("whatsapp.optin_needed", "WhatsApp opt-in needed", "Opt-in required before WhatsApp send", "warning", "i"),
    ev("send.blocked_compliance", "Send blocked", "A send was blocked by the compliance gate", "warning", "e i", true),
  ]),
  ...cat("AI Engine & Automation", () => [
    ev("ai.insight_generated", "Insight generated", "New insight from {{actor}}", "info", "i p"),
    ev("ai.opportunity_identified", "Opportunity identified", "Opportunity identified: {{item}}", "success", "e i p"),
    ev("ai.risk_detected", "Risk detected", "AI risk alert: {{item}}", "warning", "e i p"),
    ev("ai.budget_risk", "Budget risk", "AI budget alert on {{campaign}}", "warning", "e i p"),
    ev("automation.journey_started", "Journey started", "Automation journey started: {{item}}", "info", "i"),
    ev("automation.frequency_capped", "Frequency capped", "A message was held by the 5-touch cap", "info", "i"),
    ev("engine.job_completed", "Job completed", "{{item}} finished", "success", "i p"),
    ev("engine.job_failed", "Job failed", "{{item}} failed — retrying", "warning", "e i p"),
    ev("ai.human_intervention_required", "Human intervention required", "Action needed: {{item}}", "critical", "e i p", true),
  ]),
  ...cat("Reporting & Intelligence", () => [
    ev("report.generated", "Report ready", "Report ready: {{item}}", "info", "i"),
    ev("report.scheduled_ready", "Scheduled report ready", "Your scheduled report is ready", "info", "e i"),
    ev("report.export_completed", "Export completed", "Your export is ready", "success", "e i"),
    ev("briefing.daily", "Daily briefing", "Your daily command briefing is ready", "info", "e i p"),
    ev("kpi.threshold_breached", "KPI breached", "KPI alert: {{item}}", "warning", "e i p"),
    ev("kpi.recovered", "KPI recovered", "KPI recovered: {{item}}", "success", "i"),
    ev("executive.alert", "Executive alert", "Executive alert: {{item}}", "critical", "e i s", true),
    ev("attribution.revenue_won", "Revenue attributed", "{{amount}} revenue attributed to {{campaign}}", "success", "i"),
  ]),
  ...cat("Creator & Growth Network", () => [
    ev("creator.application_received", "Application received", "Your creator application was received", "info", "e i"),
    ev("creator.approved", "Creator approved", "You're approved for the MarketWar creator network", "success", "e i p"),
    ev("creator.brief_assigned", "Brief assigned", "New campaign brief: {{item}}", "info", "e i p"),
    ev("creator.content_approved", "Content approved", "Your content was approved", "success", "i p"),
    ev("creator.milestone_paid", "Milestone paid", "Payout released: {{amount}}", "success", "e i p w"),
    ev("creator.fraud_flag", "Fraud flag", "A payout was held for review", "warning", "e i", true),
    ev("referral.converted", "Referral converted", "A referral converted — reward earned", "success", "e i p w"),
    ev("affiliate.payout", "Affiliate payout", "Your affiliate payout is on the way", "success", "e i"),
  ]),
  ...cat("Compliance & Privacy", () => [
    ev("privacy.consent_request", "Consent request", "We need your consent", "info", "e i", true),
    ev("privacy.consent_updated", "Consent updated", "Your consent preferences were updated", "info", "e i"),
    ev("privacy.data_export_ready", "Data export ready", "Your data export is ready", "success", "e i"),
    ev("privacy.account_deletion_requested", "Deletion requested", "Account deletion requested", "warning", "e i", true),
    ev("privacy.account_deletion_completed", "Deletion completed", "Your account has been deleted", "info", "e i", true),
    ev("compliance.lawful_basis_required", "Lawful basis required", "A contact needs a lawful basis before outreach", "warning", "e i", true),
    ev("compliance.breach", "Compliance breach", "Compliance breach detected", "critical", "e i s", true),
    ev("compliance.resolved", "Compliance resolved", "Compliance issue resolved", "success", "e i"),
    ev("regulatory.update", "Regulatory update", "Regulatory update", "info", "e i"),
  ]),
  ...cat("Platform Administration", () => [
    ev("system.maintenance_scheduled", "Scheduled maintenance", "Scheduled maintenance on {{date}}", "info", "e i"),
    ev("system.maintenance_emergency", "Emergency maintenance", "Emergency maintenance in progress", "warning", "e i s", true),
    ev("system.outage", "System outage", "Service disruption", "critical", "e i s", true),
    ev("system.service_restored", "Service restored", "Service restored", "success", "e i"),
    ev("audit.completed", "Audit completed", "Audit completed", "info", "i"),
    ev("audit.policy_violation", "Policy violation", "Policy violation detected", "critical", "e i s", true),
    ev("provider.deprecation", "Provider deprecation", "An AI model is being deprecated — migrating", "warning", "e i"),
  ]),
];

// ---------------------------------------------------------------------------
// Catalogue statistics (derived — never hardcoded).
// ---------------------------------------------------------------------------
export function catalogueStats() {
  const categories = [...new Set(EVENTS.map((e) => e.category))];
  const channelCoverage: Record<Channel, number> = { email: 0, inapp: 0, sms: 0, push: 0, whatsapp: 0 };
  for (const e of EVENTS) for (const c of e.channels) channelCoverage[c]++;
  return {
    totalEvents: EVENTS.length,
    categoryCount: categories.length,
    categories,
    mandatoryCount: EVENTS.filter((e) => e.mandatory).length,
    channels: CHANNELS,
    channelCoverage,
    byCategory: categories.map((c) => ({ category: c, count: EVENTS.filter((e) => e.category === c).length })),
  };
}

export function eventsByCategory(): Record<string, CommsEvent[]> {
  const out: Record<string, CommsEvent[]> = {};
  for (const e of EVENTS) (out[e.category] ??= []).push(e);
  return out;
}

// ---------------------------------------------------------------------------
// Fan-out — resolve an event → channels for a recipient, honouring opt-outs.
// Mandatory events bypass opt-outs. In-app is always on (it's the ledger).
// ---------------------------------------------------------------------------
export type ChannelPrefs = Partial<Record<Channel, boolean>>; // false = opted out
export type Fanout = { event: string; mandatory: boolean; delivered: { channel: Channel; reason: "sent" | "mandatory" | "in-app" }[]; suppressed: { channel: Channel; reason: string }[] };

export function fanout(eventId: string, prefs: ChannelPrefs = {}): Fanout | { error: string } {
  const e = EVENTS.find((x) => x.id === eventId);
  if (!e) return { error: `Unknown event "${eventId}".` };
  const delivered: Fanout["delivered"] = [];
  const suppressed: Fanout["suppressed"] = [];
  for (const c of e.channels) {
    if (c === "inapp") { delivered.push({ channel: c, reason: "in-app" }); continue; }
    if (e.mandatory) { delivered.push({ channel: c, reason: "mandatory" }); continue; }
    if (prefs[c] === false) { suppressed.push({ channel: c, reason: "recipient opted out" }); continue; }
    delivered.push({ channel: c, reason: "sent" });
  }
  return { event: e.id, mandatory: Boolean(e.mandatory), delivered, suppressed };
}

// ---------------------------------------------------------------------------
// Template QA — preview the branded email a recipient actually receives.
// ---------------------------------------------------------------------------
export type Brand = { name: string; brandColour?: string; logoText?: string; fromEmail?: string };
export function previewEmail(eventId: string, brand: Brand, tokens: Record<string, string> = {}) {
  const e = EVENTS.find((x) => x.id === eventId);
  if (!e) return { error: `Unknown event "${eventId}".` };
  const subject = e.subject.replace(/{{(\w+)}}/g, (_, k) => tokens[k] ?? `{{${k}}}`);
  return {
    event: e.id,
    from: brand.fromEmail ?? "info@marketwaros.com",
    brand: brand.name,
    brandColour: brand.brandColour ?? "#10b981",
    logo: brand.logoText ?? brand.name,
    subject,
    severity: e.severity,
    channels: e.channels,
    previewHtmlSummary: `Branded email — ${brand.name} logo + colour, subject "${subject}", with the event body and a clear CTA. Powered-by footer + one-click unsubscribe on marketing categories only.`,
  };
}

// Simulated test send (sandbox unless a provider key is set — the route reports which).
export function sendTest(eventId: string, prefs: ChannelPrefs = {}) {
  const f = fanout(eventId, prefs);
  if ("error" in f) return f;
  return { ...f, mode: "sandbox", note: "Recorded in sandbox — set a provider key to fire live. Every send is logged event × channel × recipient with a status." };
}

// Deterministic recent-deliveries sample for the dashboard.
export function demoDeliveries() {
  return [
    { channel: "email", event: "campaign.generated", status: "sent", via: "resend", at: "12:03:23" },
    { channel: "push", event: "lead.hot", status: "logged", via: "push", at: "12:03:23" },
    { channel: "whatsapp", event: "quote.requested", status: "sent", via: "whatsapp-cloud", at: "12:02:58" },
    { channel: "email", event: "invoice.generated", status: "sent", via: "resend", at: "11:58:10" },
    { channel: "sms", event: "security.alert", status: "sent", via: "sms", at: "11:41:06" },
    { channel: "inapp", event: "acu.low_balance", status: "logged", via: "in-app", at: "11:40:52" },
  ];
}

export function demoComms() {
  return {
    stats: catalogueStats(),
    recentDeliveries: demoDeliveries(),
    examplePreview: previewEmail("account.registration.requested", { name: "Brixton Grill House", brandColour: "#10b981" }),
    exampleFanout: fanout("security.alert", { sms: false }), // mandatory → still sends SMS
  };
}
