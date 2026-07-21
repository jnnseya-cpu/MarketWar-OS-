// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar Integration Adapter Layer (spec "Full Independence + External API").
//
// The independence keystone: MarketWar OS is an independent customer-acquisition
// infrastructure, NOT a wrapper. External APIs are OPTIONAL connectors isolated
// behind one standard interface, and EVERY external action has a manual-mode
// fallback — so the core OS still works if Meta, Google, TikTok, WhatsApp,
// Brevo, Mailchimp, HubSpot, Shopify or any provider is disconnected.
//
// This module is data-driven + demo-safe: connection status is derived from env
// keys (none required to run), and each provider carries its manual fallback.

import { quoteAcu } from "@/backend/acu";

export type IntegrationProvider =
  | "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads"
  | "whatsapp_cloud" | "twilio_sms" | "sendgrid_email" | "amazon_ses" | "resend_email" | "mailgun_email"
  | "stripe" | "paypal" | "shopify" | "woocommerce"
  | "google_calendar" | "microsoft_calendar" | "google_business_profile"
  | "facebook_pages" | "instagram_business" | "linkedin_pages" | "zapier" | "make"
  | "brevo_import" | "mailchimp_import" | "hubspot_import"
  | "zernio_publish";

export type IntegrationCategory = "paid_ads" | "messaging" | "email" | "payments" | "calendar" | "ecommerce" | "social" | "automation";
export type DependencyLevel = "optional" | "recommended" | "required_for_feature";
export type CostMode = "free" | "usage_based" | "subscription" | "unknown";

export type IntegrationMeta = {
  provider: IntegrationProvider;
  label: string;
  category: IntegrationCategory;
  dependencyLevel: DependencyLevel;
  costMode: CostMode;
  accelerates: string; // what connecting it unlocks
  envKey: string; // env var that marks it "connected" (empty = manual-only)
  manualFallback: string[]; // how the user does it WITHOUT the API
};

// Every provider is optional; every one has a manual fallback (spec §15).
export const INTEGRATIONS: IntegrationMeta[] = [
  { provider: "meta_ads", label: "Meta Marketing (Facebook/Instagram Ads)", category: "paid_ads", dependencyLevel: "optional", costMode: "usage_based", accelerates: "Publish + manage FB/IG ad campaigns, audiences, metrics", envKey: "META_ACCESS_TOKEN", manualFallback: ["Download the ad creative", "Copy the ad text + audience suggestion", "Copy the campaign structure", "Create the ad manually in Ads Manager"] },
  { provider: "google_ads", label: "Google Ads", category: "paid_ads", dependencyLevel: "optional", costMode: "usage_based", accelerates: "Search/YouTube/PMax campaigns, keywords, conversion tracking", envKey: "GOOGLE_ADS_TOKEN", manualFallback: ["Copy keywords + ad copy", "Copy campaign structure", "Create the campaign manually in Google Ads"] },
  { provider: "tiktok_ads", label: "TikTok Business", category: "paid_ads", dependencyLevel: "optional", costMode: "usage_based", accelerates: "TikTok ad campaigns, creatives, audiences, reporting", envKey: "TIKTOK_ACCESS_TOKEN", manualFallback: ["Download the 9:16 creative", "Copy the hook + caption", "Upload manually in TikTok Ads Manager"] },
  { provider: "linkedin_ads", label: "LinkedIn Marketing", category: "paid_ads", dependencyLevel: "optional", costMode: "usage_based", accelerates: "B2B sponsored content + professional targeting", envKey: "LINKEDIN_ACCESS_TOKEN", manualFallback: ["Copy the post + targeting", "Publish manually in Campaign Manager"] },
  { provider: "whatsapp_cloud", label: "WhatsApp Cloud API", category: "messaging", dependencyLevel: "recommended", costMode: "usage_based", accelerates: "Template + session messages, booking/order flows, status", envKey: "WHATSAPP_TOKEN", manualFallback: ["Generate the WhatsApp message", "Generate a wa.me click-to-chat link", "Export the contact CSV", "User sends manually / broadcasts via an approved method"] },
  { provider: "twilio_sms", label: "Twilio SMS", category: "messaging", dependencyLevel: "optional", costMode: "usage_based", accelerates: "SMS + bulk send, delivery/reply tracking", envKey: "TWILIO_AUTH_TOKEN", manualFallback: ["Export the recipient CSV", "Copy the SMS script", "Send via a local telecom provider / bring-your-own gateway"] },
  { provider: "sendgrid_email", label: "SendGrid (email)", category: "email", dependencyLevel: "recommended", costMode: "usage_based", accelerates: "Bulk + transactional email, deliverability", envKey: "SENDGRID_API_KEY", manualFallback: ["Export the list", "Download the email HTML", "Copy the campaign into any provider"] },
  { provider: "amazon_ses", label: "Amazon SES (email)", category: "email", dependencyLevel: "optional", costMode: "usage_based", accelerates: "Low-cost high-volume email sending", envKey: "AWS_SES_KEY", manualFallback: ["Export the list", "Download the email HTML"] },
  { provider: "resend_email", label: "Resend (email)", category: "email", dependencyLevel: "optional", costMode: "usage_based", accelerates: "Developer-friendly transactional email", envKey: "RESEND_API_KEY", manualFallback: ["Export the list", "Download the email HTML"] },
  { provider: "stripe", label: "Stripe (payments)", category: "payments", dependencyLevel: "recommended", costMode: "usage_based", accelerates: "Subscriptions, ACU top-ups, pay-per-lead, invoices", envKey: "STRIPE_SECRET_KEY", manualFallback: ["Record a manual payment", "Send a bank-transfer invoice", "Admin credits the ACU wallet", "Offline payment confirmation"] },
  { provider: "paypal", label: "PayPal (payments)", category: "payments", dependencyLevel: "optional", costMode: "usage_based", accelerates: "Alternative checkout", envKey: "PAYPAL_CLIENT_SECRET", manualFallback: ["Manual payment record", "Bank-transfer invoice"] },
  { provider: "shopify", label: "Shopify", category: "ecommerce", dependencyLevel: "optional", costMode: "subscription", accelerates: "Import products/customers/orders, cart-abandonment webhooks", envKey: "SHOPIFY_TOKEN", manualFallback: ["Create products manually in the OS", "Import via CSV"] },
  { provider: "woocommerce", label: "WooCommerce", category: "ecommerce", dependencyLevel: "optional", costMode: "free", accelerates: "Import products/customers/orders", envKey: "WOO_CONSUMER_SECRET", manualFallback: ["Create products manually", "Import via CSV"] },
  { provider: "google_calendar", label: "Google Calendar", category: "calendar", dependencyLevel: "optional", costMode: "free", accelerates: "Sync bookings to the operator's calendar", envKey: "GOOGLE_CALENDAR_TOKEN", manualFallback: ["Use the OS's own internal booking calendar (no sync needed)"] },
  { provider: "microsoft_calendar", label: "Outlook Calendar", category: "calendar", dependencyLevel: "optional", costMode: "free", accelerates: "Sync bookings to Outlook", envKey: "MS_CALENDAR_TOKEN", manualFallback: ["Use the OS's own internal booking calendar"] },
  { provider: "google_business_profile", label: "Google Business Profile", category: "social", dependencyLevel: "optional", costMode: "free", accelerates: "Auto-post offers, reviews sync", envKey: "GBP_TOKEN", manualFallback: ["Copy the GBP post", "Publish manually"] },
  { provider: "facebook_pages", label: "Facebook Pages", category: "social", dependencyLevel: "optional", costMode: "free", accelerates: "Publish organic posts", envKey: "FB_PAGE_TOKEN", manualFallback: ["Download the creative", "Copy the caption + hashtags", "Publish manually"] },
  { provider: "instagram_business", label: "Instagram Business", category: "social", dependencyLevel: "optional", costMode: "free", accelerates: "Publish feed/stories", envKey: "IG_TOKEN", manualFallback: ["Download the creative", "Copy the caption + hashtags", "Publish manually"] },
  { provider: "linkedin_pages", label: "LinkedIn Pages", category: "social", dependencyLevel: "optional", costMode: "free", accelerates: "Publish company posts", envKey: "LINKEDIN_PAGE_TOKEN", manualFallback: ["Copy the post", "Publish manually"] },
  { provider: "zapier", label: "Zapier", category: "automation", dependencyLevel: "optional", costMode: "subscription", accelerates: "Connect to 6,000+ apps", envKey: "ZAPIER_KEY", manualFallback: ["Use the OS's own No-Code Automation Builder"] },
  { provider: "make", label: "Make", category: "automation", dependencyLevel: "optional", costMode: "subscription", accelerates: "Visual multi-app automation", envKey: "MAKE_KEY", manualFallback: ["Use the OS's own No-Code Automation Builder"] },
  { provider: "mailgun_email", label: "Mailgun (email)", category: "email", dependencyLevel: "optional", costMode: "usage_based", accelerates: "Transactional + bulk email sending", envKey: "MAILGUN_API_KEY", manualFallback: ["Export the list", "Download the email HTML"] },
  { provider: "brevo_import", label: "Brevo (import)", category: "automation", dependencyLevel: "optional", costMode: "free", accelerates: "One-time import of contacts/lists from Brevo", envKey: "BREVO_API_KEY", manualFallback: ["Export a CSV from Brevo", "Import into the OS Customer Data Platform"] },
  { provider: "mailchimp_import", label: "Mailchimp (import)", category: "automation", dependencyLevel: "optional", costMode: "free", accelerates: "One-time import of audiences from Mailchimp", envKey: "MAILCHIMP_API_KEY", manualFallback: ["Export a CSV from Mailchimp", "Import into the OS Customer Data Platform"] },
  { provider: "hubspot_import", label: "HubSpot (import)", category: "automation", dependencyLevel: "optional", costMode: "free", accelerates: "One-time import of contacts/deals from HubSpot", envKey: "HUBSPOT_API_KEY", manualFallback: ["Export a CSV from HubSpot", "Import into the OS CRM"] },
  { provider: "zernio_publish", label: "Social Publishing (15 channels)", category: "social", dependencyLevel: "recommended", costMode: "usage_based", accelerates: "One-click publish + schedule to Instagram/TikTok/Facebook/YouTube/LinkedIn/X/Pinterest and more — white-label, no per-platform app review", envKey: "ZERNIO_API_KEY", manualFallback: ["Download the creative", "Copy the caption + hashtags", "Publish manually on each channel"] },
];

function configured(envKey: string): boolean {
  return Boolean(envKey && process.env[envKey]);
}

// ---------------------------------------------------------------------------
// Platform-Managed Connectivity (owner directive 2026-07-20)
// ---------------------------------------------------------------------------
// "Users should use these without worrying about anything; we charge them as
//  part of their subscription plan while keeping our margin protection."
//
// Provisioning model — WHO supplies the credential:
//   • platform     — MarketWar owns the key (admin-configured, server-side).
//                    The action runs on OUR infrastructure/accounts, so the
//                    user does NOTHING: no keys, no setup. Usage is billed
//                    through their plan / ACU wallet at the protected margin.
//   • user_connect — the action happens on the USER'S OWN asset or money
//                    (ad account + spend, their payout Stripe, their store,
//                    their social Pages). We can't run these under our own
//                    credential — but the user only ever does a ONE-CLICK
//                    connect (OAuth), never hunts for an API key.
//   • manual_only  — no live provisioning; the manual-mode fallback is the path.
//
// Billing model — HOW the user pays:
//   • included            — bundled in the subscription; no per-use ACU draw.
//   • acu_metered         — drawn from the ACU wallet per use, margin-protected
//                           (≥2× floor / 4× target; provider cost NEVER exposed).
//   • user_billed_direct  — the user pays the external platform directly (ad
//                           spend on their card, their Shopify/Zapier sub).
//
// The platform keys are ADMIN-ONLY: configured once in server env / Secret
// Manager and never surfaced to tenants. Tenants see "Included — ready to use".

export type Provisioning = "platform" | "user_connect" | "manual_only";
export type BillingModel = "included" | "acu_metered" | "user_billed_direct";

export type ProvisioningMeta = {
  provisioning: Provisioning;
  billing: BillingModel;
  platformEnvKey?: string; // admin-owned key that activates central provisioning
  userAction: string;      // what the tenant must do (usually "Nothing")
  reason: string;          // why this model — especially why NOT platform
};

// Everything that can honestly run on MarketWar's own infrastructure is
// platform-managed so the tenant does nothing. Everything touching the
// tenant's own money/assets is one-click connect (never a key to find).
const PROVISIONING: Record<IntegrationProvider, ProvisioningMeta> = {
  // Infrastructure — MarketWar owns the credential; tenant does nothing.
  whatsapp_cloud: { provisioning: "platform", billing: "acu_metered", platformEnvKey: "WHATSAPP_TOKEN", userAction: "Nothing — messages send through the MarketWar messaging pool, billed from your ACU balance.", reason: "Runs on MarketWar's own WhatsApp infrastructure." },
  twilio_sms: { provisioning: "platform", billing: "acu_metered", platformEnvKey: "TWILIO_AUTH_TOKEN", userAction: "Nothing — SMS sends from the platform number pool, billed from your ACU balance.", reason: "Runs on MarketWar's own SMS infrastructure." },
  sendgrid_email: { provisioning: "platform", billing: "acu_metered", platformEnvKey: "SENDGRID_API_KEY", userAction: "Nothing — email sends from the platform's authenticated pool, billed from your ACU balance.", reason: "Runs on MarketWar's own email infrastructure." },
  amazon_ses: { provisioning: "platform", billing: "acu_metered", platformEnvKey: "AWS_SES_KEY", userAction: "Nothing — a failover sender in the platform email pool.", reason: "Runs on MarketWar's own email infrastructure." },
  resend_email: { provisioning: "platform", billing: "acu_metered", platformEnvKey: "RESEND_API_KEY", userAction: "Nothing — a sender in the platform email pool.", reason: "Runs on MarketWar's own email infrastructure." },
  mailgun_email: { provisioning: "platform", billing: "acu_metered", platformEnvKey: "MAILGUN_API_KEY", userAction: "Nothing — a failover sender in the platform email pool.", reason: "Runs on MarketWar's own email infrastructure." },
  // Owned-alternative automation — bundled; the built-in builder needs no account.
  zapier: { provisioning: "user_connect", billing: "user_billed_direct", userAction: "Optional one-click connect — or use the built-in Automation Builder (no account needed).", reason: "Zapier bills on your own Zapier plan; the OS's Automation Builder already covers this." },
  make: { provisioning: "user_connect", billing: "user_billed_direct", userAction: "Optional one-click connect — or use the built-in Automation Builder (no account needed).", reason: "Make bills on your own Make plan; the OS's Automation Builder already covers this." },
  // Calendar — syncs to the tenant's own calendar; internal calendar needs nothing.
  google_calendar: { provisioning: "user_connect", billing: "included", userAction: "One-click connect to sync to your calendar — or use the built-in booking calendar.", reason: "Syncs to YOUR Google calendar; included, no per-use charge." },
  microsoft_calendar: { provisioning: "user_connect", billing: "included", userAction: "One-click connect to sync to Outlook — or use the built-in booking calendar.", reason: "Syncs to YOUR Outlook calendar; included, no per-use charge." },
  // Paid ads — the SPEND is on the tenant's account; we manage after one connect.
  meta_ads: { provisioning: "user_connect", billing: "user_billed_direct", userAction: "One-click connect your ad account — MarketWar then builds, launches and manages campaigns for you.", reason: "Ad spend is charged to YOUR Meta ad account. We manage it for you, but the budget stays on your card — we never spend under the platform's account." },
  google_ads: { provisioning: "user_connect", billing: "user_billed_direct", userAction: "One-click connect your ad account — MarketWar then manages the campaigns for you.", reason: "Ad spend is charged to YOUR Google Ads account; the budget stays on your card." },
  tiktok_ads: { provisioning: "user_connect", billing: "user_billed_direct", userAction: "One-click connect your ad account — MarketWar then manages the campaigns for you.", reason: "Ad spend is charged to YOUR TikTok ad account; the budget stays on your card." },
  linkedin_ads: { provisioning: "user_connect", billing: "user_billed_direct", userAction: "One-click connect your ad account — MarketWar then manages the campaigns for you.", reason: "Ad spend is charged to YOUR LinkedIn ad account; the budget stays on your card." },
  // Payments — the tenant collects into THEIR account (platform billing is separate).
  stripe: { provisioning: "user_connect", billing: "user_billed_direct", userAction: "One-click connect so payments from your customers settle into your account.", reason: "Your customers' payments settle into YOUR Stripe. MarketWar's own subscription + ACU billing runs on the platform's Stripe — separate and already handled for you." },
  paypal: { provisioning: "user_connect", billing: "user_billed_direct", userAction: "One-click connect so payments settle into your PayPal.", reason: "Payments settle into YOUR PayPal account." },
  // Stores — the tenant's own storefront + data.
  shopify: { provisioning: "user_connect", billing: "user_billed_direct", userAction: "One-click connect to import products/customers/orders.", reason: "Your store lives in YOUR Shopify account (billed on your Shopify plan)." },
  woocommerce: { provisioning: "user_connect", billing: "included", userAction: "One-click connect to import products/customers/orders.", reason: "Your store lives on YOUR WooCommerce site; included, no per-use charge." },
  // Social publishing — posting AS the tenant's brand needs their authorisation.
  google_business_profile: { provisioning: "user_connect", billing: "included", userAction: "One-click connect to auto-post offers and sync reviews.", reason: "Posting to YOUR Google Business Profile needs your one-click authorisation; included." },
  facebook_pages: { provisioning: "user_connect", billing: "included", userAction: "One-click connect to publish organic posts.", reason: "Posting to YOUR Facebook Page needs your one-click authorisation; included." },
  instagram_business: { provisioning: "user_connect", billing: "included", userAction: "One-click connect to publish feed/stories.", reason: "Posting to YOUR Instagram needs your one-click authorisation; included." },
  linkedin_pages: { provisioning: "user_connect", billing: "included", userAction: "One-click connect to publish company posts.", reason: "Posting to YOUR LinkedIn Page needs your one-click authorisation; included." },
  // One-time imports — the tenant's existing data in their own account.
  brevo_import: { provisioning: "user_connect", billing: "included", userAction: "One-click connect for a one-time contact import — nothing ongoing.", reason: "Reads YOUR existing Brevo account once; included." },
  mailchimp_import: { provisioning: "user_connect", billing: "included", userAction: "One-click connect for a one-time audience import — nothing ongoing.", reason: "Reads YOUR existing Mailchimp account once; included." },
  hubspot_import: { provisioning: "user_connect", billing: "included", userAction: "One-click connect for a one-time contact/deal import — nothing ongoing.", reason: "Reads YOUR existing HubSpot account once; included." },
  // Social publishing — MarketWar owns ONE white-label Zernio key; each brand
  // one-click connects its own socials (Zernio hosts the OAuth, so no app review
  // on our side). Posting runs through the platform account; billed as plan seats
  // + ACU overflow at the protected margin.
  zernio_publish: { provisioning: "platform", billing: "acu_metered", platformEnvKey: "ZERNIO_API_KEY", userAction: "One-click connect your socials in the Publish Center — then post to 15 channels. Seats are included in your plan; extra connected accounts are metered from your ACU balance.", reason: "Runs through MarketWar's white-label publishing account; you never do per-platform app review." },
};

export function provisioningOf(provider: IntegrationProvider): ProvisioningMeta {
  return PROVISIONING[provider];
}

// Interchangeable provider pools — the anti-dependency mechanism. Every
// platform-managed connector belongs to a pool; within a pool the platform
// routes across providers with automatic failover, so NO single vendor is a
// foundation. If one changes pricing/policy/access, the platform reroutes and
// the tenant never notices. (The email engine already pools SMTP→Resend→
// SendGrid→SES→demo; SMS and WhatsApp pool the same way.)
export const PROVIDER_POOLS: Record<string, { pool: string; members: IntegrationProvider[]; failover: string }> = {
  email: { pool: "Email sending pool", members: ["sendgrid_email", "amazon_ses", "resend_email", "mailgun_email"], failover: "SMTP → Resend → SendGrid → SES → demo — automatic, per send." },
  sms: { pool: "SMS pool", members: ["twilio_sms"], failover: "Add a second SMS vendor and the platform load-balances + fails over automatically." },
  whatsapp: { pool: "WhatsApp pool", members: ["whatsapp_cloud"], failover: "Falls back to SMS/email + wa.me manual link if the WhatsApp provider is unavailable." },
  publishing: { pool: "Social publishing pool", members: ["zernio_publish", "facebook_pages", "instagram_business", "linkedin_pages", "google_business_profile"], failover: "White-label aggregator fans out to 15 channels; if it is unavailable, falls back to direct page connectors or the download-and-post-manually path — the OS still works." },
};

export function poolOf(provider: IntegrationProvider): string | undefined {
  const entry = Object.values(PROVIDER_POOLS).find((p) => p.members.includes(provider));
  return entry?.pool;
}

// The autonomy guarantee — MarketWar's founding objective: never depend on any
// external platform to run the business. Data-backed so it can be surfaced and
// tested, not just asserted in copy.
export function autonomyGuarantee() {
  return {
    objective: "Autonomy — the business runs without depending on any external platform. External APIs are optional accelerators; owned channels + manual mode are the foundation.",
    guarantees: [
      "Owned channels run first — landing pages, marketplace, referral network, SEO pages, CRM, email list, automation and analytics need NO external API.",
      "Managed connectors are pooled + interchangeable — email/SMS/WhatsApp route across providers with automatic failover, so no single vendor is a foundation.",
      "Every external action has a manual-mode fallback — the OS is fully functional with 0 connectors connected.",
      "Provider isolation behind one adapter — a pricing/policy/access change at any vendor never breaks the OS; the platform reroutes or falls back.",
      "Platform keys are admin-owned and swappable — the tenant is never locked to a vendor they had to sign up for.",
    ],
    pools: Object.values(PROVIDER_POOLS),
    worksWithZeroConnected: true,
  };
}

export type IntegrationStatus = {
  provider: IntegrationProvider; label: string; category: IntegrationCategory;
  dependencyLevel: DependencyLevel; costMode: CostMode; accelerates: string;
  status: "connected" | "disconnected"; manualFallback: string[];
  // Platform-managed connectivity (owner directive 2026-07-20):
  provisioning: Provisioning; billing: BillingModel; userAction: string; reason: string;
  platformManaged: boolean;   // true = MarketWar owns the key, tenant does nothing
  userDoesNothing: boolean;   // true = no keys AND no per-use action for the tenant
  adminConfigured: boolean;   // admin-only signal: is the platform key in place?
  userStatus: "ready" | "connect" | "manual"; // what the tenant sees
  pool?: string;              // interchangeable provider pool (anti-dependency)
};

export function integrationStatus(): { integrations: IntegrationStatus[]; connectedCount: number; platformManagedCount: number; userConnectCount: number; note: string } {
  const integrations: IntegrationStatus[] = INTEGRATIONS.map((m) => {
    const p = PROVISIONING[m.provider];
    const platformManaged = p.provisioning === "platform";
    // A platform connector is "connected" once its admin key is set; a
    // user_connect one is only connected per-tenant (never in demo) — so it
    // reports disconnected here and the tenant sees a one-click "connect".
    const adminConfigured = platformManaged ? configured(p.platformEnvKey || "") : configured(m.envKey);
    const userStatus: "ready" | "connect" | "manual" =
      platformManaged ? "ready" : p.provisioning === "user_connect" ? "connect" : "manual";
    return {
      provider: m.provider, label: m.label, category: m.category, dependencyLevel: m.dependencyLevel,
      costMode: m.costMode, accelerates: m.accelerates,
      status: (configured(m.envKey) ? "connected" : "disconnected") as "connected" | "disconnected",
      manualFallback: m.manualFallback,
      provisioning: p.provisioning, billing: p.billing, userAction: p.userAction, reason: p.reason,
      platformManaged, userDoesNothing: platformManaged, adminConfigured, userStatus,
      pool: poolOf(m.provider),
    };
  });
  const connectedCount = integrations.filter((i) => i.status === "connected").length;
  const platformManagedCount = integrations.filter((i) => i.platformManaged).length;
  const userConnectCount = integrations.filter((i) => i.provisioning === "user_connect").length;
  return {
    integrations, connectedCount, platformManagedCount, userConnectCount,
    note: `${platformManagedCount} connectors are fully managed for you — no keys, no setup, billed through your plan at the protected margin. ${userConnectCount} connect your own account in one click (their spend/data stays yours). Every external action still has a manual-mode fallback — the OS works with everything disconnected.`,
  };
}

// Cost of a platform-managed connector action, in ACUs — margin-protected and
// with the provider cost NEVER exposed. Reuses the ACU engine so the owner
// pricing law (≥2× floor / 4× target) is enforced in exactly one place.
// Only valid for platform + acu_metered connectors; anything else is answered
// with why the tenant is not charged ACUs.
export function connectorCharge(input: {
  provider: IntegrationProvider;
  providerCostGbp: number; // internal only — server-side, never returned
  units?: number;
}): { provider: IntegrationProvider; billable: true; acus: number; marginMultiplier: number; marginPct: number; grossMarginPct: number; note: string }
 | { provider: IntegrationProvider; billable: false; reason: string } {
  const p = PROVISIONING[input.provider];
  if (!p) return { provider: input.provider, billable: false, reason: "Unknown provider" };
  if (p.billing !== "acu_metered") {
    return {
      provider: input.provider, billable: false,
      reason: p.billing === "included"
        ? "Included in your subscription — no per-use ACU charge."
        : "Billed directly by the external platform (e.g. ad spend on your own card) — not from your ACU wallet.",
    };
  }
  const units = Math.max(1, input.units ?? 1);
  // Messaging/email are light actions; the ACU engine applies the 4× markup on
  // top of the true provider cost (floored at 2×). We surface only the ACUs and
  // the margin — never the underlying provider cost.
  const q = quoteAcu({ providerCostGbp: Math.max(0, input.providerCostGbp), actionClass: "low", variants: units });
  return {
    provider: input.provider, billable: true,
    acus: q.acus, marginMultiplier: q.marginMultiplier, marginPct: q.marginPct, grossMarginPct: q.grossMarginPct,
    note: `${q.acus} ACUs · margin protected at ${q.marginMultiplier}× (${q.marginPct}% markup = ${q.grossMarginPct}% gross margin). Provider cost is never shown.`,
  };
}

export function manualMode(provider: IntegrationProvider): { provider: IntegrationProvider; steps: string[] } | { error: string } {
  const m = INTEGRATIONS.find((x) => x.provider === provider);
  if (!m) return { error: `Unknown provider: ${provider}` };
  return { provider, steps: m.manualFallback };
}

// Dependency classification (spec §11): what the OS MUST own vs optional vs never-fully-depend-on.
export function dependencyClassification() {
  return {
    mustOwnInternally: [
      "Business/Customer/Offer/Campaign/Landing-Page/Revenue Brains", "Customer database + CRM", "Forms + landing pages",
      "Segmentation", "Content + campaign generation", "Referral system", "Loyalty system", "Marketplace listing",
      "Analytics", "ACU billing", "Automation builder", "Stop/Fix/Scale intelligence",
    ],
    optionalExternal: INTEGRATIONS.filter((i) => i.dependencyLevel !== "required_for_feature").map((i) => i.label),
    neverFullyDependOn: ["Meta", "Google", "TikTok", "Brevo", "Mailchimp", "HubSpot", "Canva", "Buffer", "Hootsuite", "Klaviyo", "Shopify"],
    rule: "Use external platforms as bridges, not foundations. If a provider changes pricing, access or policy, the OS still works.",
  };
}

// Owned channels built first (spec §10) — no external API required.
export const OWNED_CHANNELS = [
  { name: "Owned Landing Page Network", pattern: "marketwar.site/{business}/{campaign}" },
  { name: "Owned Business Marketplace", pattern: "marketwar.com/discover/{city}/{service}" },
  { name: "Owned Referral Network", pattern: "marketwar.com/r/{business}/{referral_code}" },
  { name: "Owned SEO Pages", pattern: "marketwar.com/local/{city}/{service}" },
  { name: "Owned CRM + Email List + Automation + Analytics", pattern: "internal (no external API)" },
];
