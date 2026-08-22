// ONE EVENT LIST, TWO DESTINATIONS.
//
// Meta Pixel and Google Tag are wanted across the whole OS. The way that goes
// wrong is a `fbq(...)` here and a `dataLayer.push(...)` there, drifting until
// the two dashboards disagree about how many signups there were and nobody can
// say which is right. So there is one canonical event list, every call site
// names an event FROM it, and the transport fans out to both.
//
// A name not in this list cannot be tracked. That is the point: an event
// invented at a call site is one nobody configured a conversion for at the other
// end, so it silently does nothing while looking like it works.
//
// META STANDARD EVENTS ARE NOT FREE-FORM. Meta only optimises for its own
// standard set; anything else must go through `trackCustom` and can never be a
// conversion objective. Each row below states which it is, so the choice is
// visible rather than discovered months later in Ads Manager.
//
// WHAT NEVER LEAVES THIS PLATFORM: any personal data. Meta and Google are third
// parties, the visitor consented to analytics and not to having their email
// handed to an advertising network, and the platform's own privacy policy says
// so. `sanitiseParams` enforces it by construction rather than by everyone
// remembering — see the note there.

/** Meta's standard events. Anything outside this set is a custom event. */
export const META_STANDARD = [
  "PageView", "ViewContent", "Search", "Lead", "Contact", "CompleteRegistration",
  "InitiateCheckout", "AddPaymentInfo", "Purchase", "Subscribe", "StartTrial",
  "SubmitApplication", "Schedule",
] as const;
export type MetaStandardEvent = (typeof META_STANDARD)[number];

export type MwEvent = {
  /** The canonical name. Used verbatim as the GA4/GTM event name. */
  name: string;
  /** What it means — so a second person wires it to the same moment. */
  means: string;
  /** Meta's event. A standard one is optimisable; anything else is custom. */
  meta: MetaStandardEvent | { custom: string };
  /** True when the event carries a real money value, in GBP. */
  hasValue?: boolean;
};

export const MW_EVENTS: MwEvent[] = [
  // --- Reach and interest -------------------------------------------------
  { name: "page_view", means: "A route was viewed, including client-side navigations.", meta: "PageView" },
  { name: "view_pricing", means: "The price table was actually looked at.", meta: "ViewContent" },
  { name: "view_feature", means: "A feature or answer page was read.", meta: "ViewContent" },
  { name: "search", means: "The customer searched their own work.", meta: "Search" },

  // --- The free audit: the front door of the whole acquisition machine -----
  { name: "audit_started", means: "Somebody typed a website in and ran the free audit.", meta: { custom: "AuditStarted" } },
  { name: "audit_lead", means: "They gave an address to receive the full report. A real lead.", meta: "Lead" },

  // --- Account ------------------------------------------------------------
  { name: "sign_up", means: "An account was created.", meta: "CompleteRegistration" },
  { name: "login", means: "An existing account signed in.", meta: { custom: "Login" } },
  { name: "onboarding_complete", means: "A brand finished setup and the OS is usable.", meta: { custom: "OnboardingComplete" } },

  // --- Money --------------------------------------------------------------
  { name: "begin_checkout", means: "A plan was chosen and checkout was opened.", meta: "InitiateCheckout", hasValue: true },
  { name: "purchase", means: "Payment completed. Only ever fired on a confirmed payment.", meta: "Purchase", hasValue: true },
  { name: "subscribe", means: "A recurring plan started.", meta: "Subscribe", hasValue: true },
  { name: "start_free_plan", means: "The free plan was activated — no money, so no value.", meta: { custom: "StartFreePlan" } },
  { name: "topup", means: "Credits were bought outside a plan.", meta: "Purchase", hasValue: true },

  // --- Doing the actual work (retention, not acquisition) -----------------
  { name: "agent_run", means: "An AI agent produced something.", meta: { custom: "AgentRun" } },
  { name: "campaign_sent", means: "An email campaign actually left the machine.", meta: { custom: "CampaignSent" } },
  { name: "content_published", means: "Something was published to a channel.", meta: { custom: "ContentPublished" } },
  { name: "recording_made", means: "A screen or camera recording was produced.", meta: { custom: "RecordingMade" } },
  { name: "contact_request", means: "A contact or demo form was submitted.", meta: "Contact" },
];

const BY_NAME = new Map(MW_EVENTS.map((e) => [e.name, e]));

/** The event, or null when the name is not one this platform tracks. */
export function eventByName(name: string): MwEvent | null {
  return BY_NAME.get(name) ?? null;
}

/** True when Meta can optimise a campaign for this event. */
export function isStandard(e: MwEvent): boolean {
  return typeof e.meta === "string";
}

/** What to pass to fbq, and whether it is `track` or `trackCustom`. */
export function metaCall(e: MwEvent): { method: "track" | "trackCustom"; event: string } {
  return typeof e.meta === "string"
    ? { method: "track", event: e.meta }
    : { method: "trackCustom", event: e.meta.custom };
}

// ---------------------------------------------------------------------------
// The parameter allowlist.
// ---------------------------------------------------------------------------
//
// AN ALLOWLIST, NOT A BLOCKLIST, AND THE DIFFERENCE IS THE WHOLE POINT. A
// blocklist ("strip anything called email") fails the first time somebody passes
// `contact`, `to`, `owner` or a free-text note that happens to contain an
// address — and that failure is invisible, because the event still sends. An
// allowlist fails the other way: a parameter nobody thought about is dropped,
// which costs a dimension in a report and never leaks a person.

const ALLOWED_KEYS = new Set([
  "value", "currency", "plan", "cycle", "step", "channel", "agent", "kind",
  "count", "score", "grade", "placement", "source", "surface", "result",
]);

/** Numeric-only keys. A string here would be a label smuggled into a metric. */
const NUMERIC_KEYS = new Set(["value", "count", "score"]);

export type EventParams = Record<string, string | number | boolean | undefined>;

/**
 * The parameters that may leave for a third party.
 *
 * Anything not on the allowlist is dropped. Strings are capped and must look
 * like identifiers rather than prose — a long free-text field is exactly where
 * a name or an address ends up by accident.
 */
export function sanitiseParams(raw: EventParams | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!ALLOWED_KEYS.has(k) || v === undefined || v === null) continue;
    if (NUMERIC_KEYS.has(k)) {
      // A value must be a finite number. "£49" is a string and would arrive at
      // Meta as a broken conversion value rather than an error.
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      continue;
    }
    if (typeof v === "boolean" || typeof v === "number") { out[k] = v; continue; }
    const s = String(v).trim();
    // Belt and braces on top of the allowlist: never an address, never prose.
    if (!s || s.length > 40 || s.includes("@")) continue;
    out[k] = s;
  }
  return out;
}

/**
 * The final payload for an event, or null when it must not be sent.
 *
 * Returns null for an unknown name, and for a money event with no real value —
 * a Purchase reported to Meta without an amount trains the ad algorithm on a
 * conversion worth nothing, which is worse than not reporting it at all.
 */
export function buildPayload(
  name: string,
  params?: EventParams,
): { event: MwEvent; params: Record<string, string | number | boolean> } | null {
  const event = eventByName(name);
  if (!event) return null;
  const clean = sanitiseParams(params);
  if (event.hasValue) {
    if (typeof clean.value !== "number" || !(clean.value >= 0)) return null;
    clean.currency = typeof clean.currency === "string" ? clean.currency : "GBP";
  }
  return { event, params: clean };
}
