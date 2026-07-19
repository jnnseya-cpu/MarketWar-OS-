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

export type IntegrationProvider =
  | "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads"
  | "whatsapp_cloud" | "twilio_sms" | "sendgrid_email" | "amazon_ses" | "resend_email" | "mailgun_email"
  | "stripe" | "paypal" | "shopify" | "woocommerce"
  | "google_calendar" | "microsoft_calendar" | "google_business_profile"
  | "facebook_pages" | "instagram_business" | "linkedin_pages" | "zapier" | "make"
  | "brevo_import" | "mailchimp_import" | "hubspot_import";

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
];

function configured(envKey: string): boolean {
  return Boolean(envKey && process.env[envKey]);
}

export type IntegrationStatus = {
  provider: IntegrationProvider; label: string; category: IntegrationCategory;
  dependencyLevel: DependencyLevel; costMode: CostMode; accelerates: string;
  status: "connected" | "disconnected"; manualFallback: string[];
};

export function integrationStatus(): { integrations: IntegrationStatus[]; connectedCount: number; note: string } {
  const integrations = INTEGRATIONS.map((m) => ({
    provider: m.provider, label: m.label, category: m.category, dependencyLevel: m.dependencyLevel,
    costMode: m.costMode, accelerates: m.accelerates,
    status: (configured(m.envKey) ? "connected" : "disconnected") as "connected" | "disconnected",
    manualFallback: m.manualFallback,
  }));
  const connectedCount = integrations.filter((i) => i.status === "connected").length;
  return {
    integrations, connectedCount,
    note: `${connectedCount}/${integrations.length} connected. The OS is fully functional with ZERO connected — every external action has a manual-mode fallback. External APIs are optional accelerators, never foundations.`,
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
