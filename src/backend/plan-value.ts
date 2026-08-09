// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// What a plan actually BUYS — in work, not in tokens.
//
// The competition sells "2,500 credits", which tells a buyer nothing: they
// cannot know whether that is a week or a year, and they find out only after
// paying. Every one of their tiers also lists an identical feature set, so the
// page cannot answer the one question a buyer has — what do I get for the extra
// money?
//
// This answers both. Allowances are converted into REAL ACTIONS at the prices
// actually charged, so a plan reads "≈ 200 landing pages, or 50 AI images, or
// 12 video renders" rather than a number with no unit. Nothing here is a
// marketing figure: every count is computed from ACTION_COST_ACU, the same
// table the wallet debits against. If a price changes, this page changes with
// it and cannot drift into being a lie.

import { PLANS, planEconomics } from "@/backend/subscription";
import { ACTION_COST_ACU } from "@/backend/wallet";
import { JOB_COST_ACU } from "@/backend/video-jobs";

export type WorkExample = { label: string; count: number; costEach: number; note: string };

export type PlanCard = {
  id: string;
  name: string;
  monthlyGbp: number;
  annualGbp: number;
  annualSavingGbp: number;
  monthlyAcus: number;
  // Hard limits — the things that genuinely differ between tiers.
  limits: { label: string; value: string }[];
  // Everything included at this tier. Stated per-plan rather than repeated
  // identically across tiers, so the comparison is worth reading.
  includes: string[];
  // What the monthly allowance does, in work.
  buys: WorkExample[];
  bestFor: string;
  popular?: boolean;
};

// Features every paying tier gets. Listing these once, and then listing what is
// ADDED per tier, is the honest structure — repeating the same twelve bullets on
// every plan is padding.
const CORE_INCLUDES = [
  "Customer Vault — import your list, scored and segmented automatically",
  "Landing pages — published live on your own URL, with real visitor tracking",
  "Email campaigns from your own domain, with attachments",
  "Brand Studio — creatives built on your product photo and brand colours",
  "Return Ledger — what you spent, what it produced, and whether you are ahead",
  "Every AI action priced in ACUs, shown before you click",
];

// The order tiers stack in. Each plan includes everything the tiers below it
// include, PLUS its own additions — otherwise a higher plan can appear to offer
// less than a cheaper one, which is both wrong and the fastest way to lose a
// sale on a comparison page.
const TIER_ORDER = ["free", "starter", "growth", "scale", "business", "enterprise", "corporate", "global"];

const TIER_ADDITIONS: Record<string, string[]> = {
  free: [],
  starter: ["WhatsApp click-to-chat on your pages", "Lead capture straight into the Vault"],
  growth: [
    "Multi-brand — run separate brands with separate vaults",
    "A/B testing with honest statistics (no winner declared on a handful of clicks)",
    "SEO autopilot — scheduled, measured articles",
    "Video rendering: trims, social cuts, burned-in captions, upscales",
  ],
  scale: [
    "Voiceovers and 29-language dubbing",
    "Market research with sourced findings — every claim carries its link",
    "Team workspaces with approvals",
    "Priority support",
  ],
  business: ["Dedicated onboarding", "Custom sending domains and IP warm-up", "Usage reporting across every brand"],
  enterprise: ["Single sign-on", "Custom data retention", "Named account manager"],
  corporate: ["Contractual SLAs", "Security review support", "Custom integrations"],
  global: ["Everything, sized to your estate", "Commercial terms agreed with you"],
};

const BEST_FOR: Record<string, string> = {
  free: "Seeing whether it works on your own list before paying anything.",
  starter: "One business, getting the first campaigns out.",
  growth: "A business running marketing every week, or an owner with a few brands.",
  scale: "An agency or a group — several brands, a team, and video in the mix.",
  business: "A marketing department that needs reporting across brands.",
  enterprise: "Procurement, SSO and retention requirements.",
  corporate: "Contractual SLAs and a security review.",
  global: "Bespoke — talk to us.",
};

// The actions worth quoting, because they are what a buyer actually pictures.
function workFor(acus: number): WorkExample[] {
  const rows: { label: string; cost: number; note: string }[] = [
    { label: "AI landing pages, written and published", cost: ACTION_COST_ACU.llm, note: "Copy written for your brand, live on a real URL." },
    { label: "AI images for ads and posts", cost: ACTION_COST_ACU.image, note: "Built on your product photo, identity-checked." },
    { label: "long-form SEO articles", cost: ACTION_COST_ACU.post, note: "Researched and published to your blog." },
    { label: "social clips cut from one video", cost: JOB_COST_ACU.clips, note: "Reframed to 9:16 for TikTok, Reels and Shorts." },
    { label: "videos with captions burned in", cost: JOB_COST_ACU.captions_burn, note: "Transcribed from your real audio." },
    { label: "minutes of presenter video", cost: ACTION_COST_ACU.avatar, note: "A synthetic face reading your script. Billed by the minute, as the providers bill us." },
    { label: "emails sent", cost: ACTION_COST_ACU.email_send, note: "From your own domain, per recipient." },
  ];
  return rows
    .filter((r) => r.cost > 0 && acus >= r.cost)
    .map((r) => ({ label: r.label, count: Math.floor(acus / r.cost), costEach: r.cost, note: r.note }));
}

// Everything a tier gets: the core, plus every addition from its own tier and
// all tiers beneath it.
export function includesFor(planId: string): string[] {
  if (planId === "free") return CORE_INCLUDES.slice(0, 3);
  const rank = TIER_ORDER.indexOf(planId);
  const stacked = TIER_ORDER.slice(0, rank + 1).flatMap((id) => TIER_ADDITIONS[id] ?? []);
  // Deduplicate, keeping first appearance, so a feature named at two tiers is
  // listed once.
  return [...new Set([...CORE_INCLUDES, ...stacked])];
}

export function planCards(): PlanCard[] {
  return PLANS.map((plan) => {
    const econ = planEconomics(plan);
    const acus = econ.monthlyAcus ?? 0;
    return {
      id: plan.id,
      name: plan.name,
      monthlyGbp: plan.monthlyGbp,
      annualGbp: econ.annualGbp,
      annualSavingGbp: econ.annualSavingGbp,
      monthlyAcus: acus,
      limits: [
        { label: "Brands", value: String(plan.brands) },
        { label: "Team members", value: String(plan.users) },
        { label: "Connected social accounts", value: String(plan.socialAccounts) },
        { label: "Active campaigns", value: String(plan.campaigns) },
        { label: "Storage", value: plan.storageGb >= 1024 ? `${Math.round(plan.storageGb / 1024)} TB` : `${plan.storageGb} GB` },
      ],
      includes: includesFor(plan.id),
      buys: workFor(acus),
      bestFor: BEST_FOR[plan.id] ?? "",
      popular: plan.id === "growth",
    };
  });
}

// ---------------------------------------------------------------------------
// FAQ. Written to answer the question rather than to reassure — a page that
// dodges "what happens when I run out" loses the sale to one that does not.
// ---------------------------------------------------------------------------
export type Faq = { q: string; a: string };

export function pricingFaq(): Faq[] {
  const growth = planCards().find((p) => p.id === "growth");
  const growthWork = growth?.buys[0];
  return [
    {
      q: "How can MarketWar OS help my business?",
      a:
        "It does the marketing work you do not have time for, and then shows you whether it paid. Import your customer list and it is scored and segmented in seconds. Publish a landing page on a real URL. Send a win-back campaign from your own domain. Every lead lands back in your vault tagged with the page that produced it, and the Return Ledger tells you what you spent, what came back, and whether you are ahead. Most businesses see the first result from the win-back email, because selling again to people who already bought is the cheapest sale there is.",
    },
    {
      q: "What do I need to start?",
      a:
        "Your business name, what you sell, and who you sell to. That is enough to publish your first page. If you have an existing customer list, bring it — a CSV of emails is all it takes, and it is where the fastest result comes from. You do not need a website, a designer or an ad budget to begin.",
    },
    {
      q: "How much does it cost?",
      a:
        `Plans start at £${PLANS.find((p) => p.id === "starter")?.monthlyGbp ?? 19} a month, and there is a free tier so you can see it work on your own data before paying. Each plan includes a monthly allowance of ACUs — the unit every AI action is priced in. Growth includes ${growth?.monthlyAcus.toLocaleString() ?? ""} ACUs a month, which is about ${growthWork ? `${growthWork.count} ${growthWork.label}` : "a month of steady output"}. The price of every action is shown before you click it, so nothing is ever spent without you seeing the number.`,
    },
    {
      q: "What is an ACU, and what happens if I run out?",
      a:
        "An ACU is one penny of AI or provider work. A written landing page costs a handful; a video render costs more, because rendering burns real machine time. When your allowance runs out, nothing breaks and nothing is billed automatically — the actions that cost money simply pause until you top up, and everything already published stays live. You can top up any amount at any time.",
    },
    {
      q: "How long are your contracts?",
      a: "There are none. Monthly plans are month to month. Annual plans are paid up front for a discount, and you keep the year you paid for.",
    },
    {
      q: "Can I cancel at any time?",
      a:
        "Yes, from your billing page, and it takes effect at the end of the period you have already paid for. Your published pages stay live and your customer data stays yours — you can export your entire vault as a CSV before or after cancelling.",
    },
    {
      q: "Can I change plan later?",
      a:
        "Yes, up or down, whenever you like. Upgrading applies immediately and the new allowance is added straight away. Downgrading applies at your next renewal so you keep what you have already paid for. Unused ACUs are not taken away when you change plan.",
    },
    {
      q: "Does running ads cost extra?",
      a:
        "The ad spend goes directly to the platform you advertise on — Meta, Google, TikTok — and we never take a cut of it or mark it up. What you pay us covers building and measuring the campaign. You can also run everything here without paid ads at all: the landing page, email and organic side needs no ad budget.",
    },
    {
      q: "Do I need my own API keys?",
      a:
        "No. AI, images, video rendering and search are all included in your plan and priced in ACUs. If you would rather connect your own accounts — your own email domain, your own social channels, your own payment processor — you can, and those send and publish under your own name rather than ours.",
    },
    {
      q: "Will it invent testimonials or statistics about my business?",
      a:
        "No, and this is enforced in code rather than promised. Generated copy is checked before you see it, and anything containing an unsupported claim, an invented customer quote or a statistic nobody can substantiate is rejected rather than published. If you supply a real customer quote with a name, it is used. If you do not, the proof section is simply left out.",
    },
  ];
}
