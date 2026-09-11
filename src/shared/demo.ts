import type { Campaign } from "@/shared/types";

// ILLUSTRATIVE FIGURES FOR THE LANDING PAGE. Nothing here reaches a signed-in
// account, and a test now holds that boundary.
//
// THE COMMENT THAT USED TO SIT HERE SAID "every dashboard renders from this",
// and it had been false for a long time. The dashboards moved to real stores;
// the sentence did not move with them, so the file read like the product's data
// layer while it was actually the marketing page's chart fixture. That gap is
// the whole reason the owner could not tell whether this was a demo dressed as
// a platform — the code said one thing and the comment said another.
//
// WHAT WAS REMOVED, AND WHY IT WAS SAFE. Eight of the thirteen exports were
// imported by nothing at all: fabricated customers with names, phone numbers
// and email addresses, invented WhatsApp threads, named competitors, a daily
// action list, a business profile and a brand roster. Unreachable code removes
// no capability, so taking it out downgrades nothing — and person-shaped
// fabrications sitting in a repository are a liability whether or not anything
// renders them.
//
// WHAT STAYS, AND WHY IT MUST. The five below feed the landing page's charts,
// which is the zero-configuration demo this platform is required to keep
// working. They are aggregate figures for one openly fictional business, shown
// to anonymous visitors on a marketing page. They are never presented to a
// signed-in customer as their own numbers.

export const demoCampaigns: Campaign[] = [
  {
    id: "cmp-001",
    name: "Family Platter Friday",
    channel: "Meta",
    goal: "Get WhatsApp orders",
    hook: "Feed 4 for £25 — ready in 20 mins, Brixton only",
    spend: 84,
    leads: 41,
    messages: 38,
    bookings: 22,
    revenue: 610,
    ctr: 4.2,
    status: "active",
    verdict: "SCALE",
    verdictReason: "Cost per order £3.82 vs £9.50 AOV. Raise daily budget 40% and clone to Instagram Reels.",
    startedDaysAgo: 6,
  },
  {
    id: "cmp-002",
    name: "Office Lunch Catering",
    channel: "LinkedIn",
    goal: "Get catering contracts",
    hook: "Your team's Friday lunch, sorted. Hot grill boxes delivered to SW9 offices.",
    spend: 112,
    leads: 9,
    messages: 6,
    bookings: 2,
    revenue: 380,
    ctr: 1.8,
    status: "active",
    verdict: "FIX",
    verdictReason: "Leads qualify but stall at pricing. Send tiered menu PDF in first WhatsApp reply and add a £99 first-order trial box.",
    startedDaysAgo: 11,
  },
  {
    id: "cmp-003",
    name: "Generic Brand Awareness",
    channel: "Instagram",
    goal: "Get followers",
    hook: "The best grill in South London 🔥",
    spend: 96,
    leads: 2,
    messages: 0,
    bookings: 0,
    revenue: 0,
    ctr: 0.6,
    status: "paused",
    verdict: "STOP",
    verdictReason: "£48 per lead with zero orders. Awareness objective burns budget without capture. Killed — budget rerouted to Family Platter Friday.",
    startedDaysAgo: 14,
  },
  {
    id: "cmp-004",
    name: "Student Night 2-for-1",
    channel: "TikTok",
    goal: "Get customers",
    hook: "POV: it's 9pm in Brixton and you're starving 👀",
    spend: 40,
    leads: 17,
    messages: 12,
    bookings: 7,
    revenue: 133,
    ctr: 3.1,
    status: "active",
    verdict: "TESTING",
    verdictReason: "48h into test. Cost per order £5.71 and trending down. Verdict locks at £60 spend.",
    startedDaysAgo: 2,
  },
  {
    id: "cmp-005",
    name: "Sunday Roast Reactivation",
    channel: "WhatsApp",
    goal: "Recover inactive customers",
    hook: "We miss you — your Sunday table is waiting. 20% off this weekend only.",
    spend: 0,
    leads: 26,
    messages: 26,
    bookings: 14,
    revenue: 371,
    ctr: 0,
    status: "active",
    verdict: "SCALE",
    verdictReason: "Zero-cost channel converting at 54%. Extend to the 118 remaining inactive customers in the vault.",
    startedDaysAgo: 4,
  },
];

// 14-day daily series powering the platform's charts.
export const demoDaily = {
  labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  revenue: [42, 58, 51, 74, 88, 96, 110, 98, 122, 134, 128, 155, 171, 190],
  spend: [18, 20, 19, 22, 24, 23, 26, 24, 27, 28, 26, 30, 31, 33],
  leads: [4, 6, 5, 8, 9, 11, 12, 9, 12, 13, 12, 15, 16, 18],
  whatsappThreads: [3, 4, 4, 6, 7, 9, 10, 7, 9, 11, 10, 13, 14, 15],
};

export const demoChannelOrders = [
  { label: "WhatsApp", value: 22 },
  { label: "Meta", value: 12 },
  { label: "TikTok", value: 7 },
  { label: "Google", value: 4 },
];

export const demoFunnel = [
  { label: "Ad reach", value: 18400 },
  { label: "Clicks", value: 862 },
  { label: "WhatsApp threads", value: 214 },
  { label: "Qualified", value: 121 },
  { label: "Orders", value: 45 },
];

export const demoMetrics = {
  spendToday: 23.4,
  spendMonth: 332,
  leadsToday: 14,
  leadsMonth: 95,
  costPerLead: 3.49,
  costPerOrder: 7.38,
  ordersMonth: 45,
  revenueMonth: 1494,
  recoverableRevenue: 1240,
  roas: 4.5,
  bestHook: "Feed 4 for £25 — ready in 20 mins, Brixton only",
  worstAd: "The best grill in South London 🔥",
  bestAudience: "Families 25–44, 2 miles of SW9, evening scrollers",
};

// OWNER RULING, 2026-07-11, KEPT BECAUSE IT IS A DECISION AND NOT A FIXTURE:
// one account, one bill, multiple brands running simultaneously.
//
// The invented three-brand roster that used to sit under this note is gone —
// nothing imported it, and the switcher and billing surfaces render from the
// real account store. The ruling is recorded here so removing dead data does
// not also remove the reason it once existed.
