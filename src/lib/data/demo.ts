import type {
  BusinessProfile,
  Campaign,
  Competitor,
  Customer,
  DailyAction,
  WhatsAppConversation,
} from "@/lib/types";

// Demo Intelligence dataset. Every dashboard renders from this until the
// platform is connected to live channels, so the product is fully
// explorable with zero configuration.

export const demoBusiness: BusinessProfile = {
  name: "Brixton Grill House",
  industry: "Restaurant & Food Delivery",
  location: "Brixton, London",
  targetCustomer: "Local families and young professionals within 3 miles",
  product: "Flame-grilled chicken meals, family platters, office catering",
  price: "£9.50 average order",
  offer: "Free delivery over £20",
  website: "brixtongrillhouse.co.uk",
  whatsapp: "+44 7700 900123",
  monthlyBudget: 600,
  pastAdSpend: 2400,
  pastResult: "3 orders from £2,400 of boosted posts",
  goal: "40 new weekly orders and 15 office catering contracts",
};

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

export const demoCustomers: Customer[] = [
  { id: "c-01", name: "Amara Okafor", phone: "+44 7700 111222", email: "amara.o@example.com", location: "SW9", source: "Family Platter Friday", segment: "Hot lead", totalSpend: 0, purchaseCount: 0, lastActivityDays: 0, engagementScore: 92, intentScore: 88, churnRisk: 5, recoveryValue: 0, status: "hot" },
  { id: "c-02", name: "Daniel Mensah", phone: "+44 7700 222333", email: "d.mensah@example.com", location: "SW2", source: "WhatsApp referral", segment: "VIP customer", totalSpend: 642, purchaseCount: 21, lastActivityDays: 3, engagementScore: 96, intentScore: 74, churnRisk: 8, recoveryValue: 0, status: "vip" },
  { id: "c-03", name: "Sophie Turner", phone: "+44 7700 333444", email: "sophie.t@example.com", location: "SW4", source: "Google search", segment: "Inactive 60d+", totalSpend: 187, purchaseCount: 6, lastActivityDays: 74, engagementScore: 31, intentScore: 42, churnRisk: 71, recoveryValue: 95, status: "inactive" },
  { id: "c-04", name: "Marcus Boateng", phone: "+44 7700 444555", email: "marcus.b@example.com", location: "SW9", source: "Office Lunch Catering", segment: "Ready to buy", totalSpend: 380, purchaseCount: 2, lastActivityDays: 1, engagementScore: 84, intentScore: 91, churnRisk: 12, recoveryValue: 0, status: "hot" },
  { id: "c-05", name: "Priya Sharma", phone: "+44 7700 555666", email: "priya.s@example.com", location: "SE24", source: "Instagram", segment: "Repeat buyer", totalSpend: 254, purchaseCount: 9, lastActivityDays: 9, engagementScore: 77, intentScore: 62, churnRisk: 18, recoveryValue: 0, status: "active" },
  { id: "c-06", name: "Tom Reeves", phone: "+44 7700 666777", email: "tom.r@example.com", location: "SW8", source: "Boosted post (old)", segment: "Abandoned lead", totalSpend: 0, purchaseCount: 0, lastActivityDays: 41, engagementScore: 22, intentScore: 35, churnRisk: 80, recoveryValue: 28, status: "lost" },
  { id: "c-07", name: "Fatima Al-Rashid", phone: "+44 7700 777888", email: "fatima.a@example.com", location: "SW9", source: "Sunday Roast Reactivation", segment: "Recovered", totalSpend: 118, purchaseCount: 4, lastActivityDays: 2, engagementScore: 68, intentScore: 70, churnRisk: 24, recoveryValue: 0, status: "active" },
  { id: "c-08", name: "James Whitfield", phone: "+44 7700 888999", email: "james.w@example.com", location: "SW11", source: "CSV import", segment: "Inactive 90d+", totalSpend: 312, purchaseCount: 11, lastActivityDays: 96, engagementScore: 14, intentScore: 28, churnRisk: 88, recoveryValue: 156, status: "inactive" },
];

export const demoConversations: WhatsAppConversation[] = [
  { id: "w-01", customer: "Amara Okafor", phone: "+44 7700 111222", campaign: "Family Platter Friday", stage: "offer-sent", intentScore: 88, lastMessage: "Can I swap the wings for extra rice?", lastMessageAgo: "4m", unread: 1, value: 25 },
  { id: "w-02", customer: "Marcus Boateng", phone: "+44 7700 444555", campaign: "Office Lunch Catering", stage: "booking", intentScore: 91, lastMessage: "Friday works. 14 people, invoice to accounts@...", lastMessageAgo: "18m", unread: 2, value: 190 },
  { id: "w-03", customer: "Leah Simmons", phone: "+44 7700 123987", campaign: "Student Night 2-for-1", stage: "qualifying", intentScore: 64, lastMessage: "Is the 2-for-1 on tonight?", lastMessageAgo: "31m", unread: 1, value: 19 },
  { id: "w-04", customer: "Tom Reeves", phone: "+44 7700 666777", campaign: "Family Platter Friday", stage: "ghosted", intentScore: 35, lastMessage: "You: Still want Friday's platter? 10% off if you order today.", lastMessageAgo: "2d", unread: 0, value: 25 },
  { id: "w-05", customer: "Fatima Al-Rashid", phone: "+44 7700 777888", campaign: "Sunday Roast Reactivation", stage: "won", intentScore: 70, lastMessage: "Order confirmed for Sunday 1pm ✅", lastMessageAgo: "1h", unread: 0, value: 34 },
];

export const demoCompetitors: Competitor[] = [
  { id: "cp-01", name: "Flame Republic", offer: "Free side with every meal", pricePosition: "similar", adActivity: "aggressive", weakness: "2.9★ delivery reviews — late orders complaint pattern", threatLevel: 78, lastMove: "Launched £15 meal deal ads targeting SW9 (3 days ago)" },
  { id: "cp-02", name: "Peri Palace", offer: "Student discount 25%", pricePosition: "cheaper", adActivity: "moderate", weakness: "No WhatsApp ordering, website checkout only", threatLevel: 54, lastMove: "New TikTok account, 2 posts/week" },
  { id: "cp-03", name: "The Grill Room SW2", offer: "Premium dine-in experience", pricePosition: "premium", adActivity: "quiet", weakness: "No delivery offer at all", threatLevel: 22, lastMove: "No visible marketing activity in 30 days" },
];

export const demoActions: DailyAction[] = [
  { id: "a-01", priority: "critical", action: "Reply to Marcus Boateng's catering booking (14-person office order)", reason: "£190 order sitting unconfirmed for 18 minutes. Catering leads go cold in under 2 hours.", impact: "+£190 today, ~£2,280/yr if weekly", module: "WhatsApp Sales Center", href: "/dashboard/whatsapp" },
  { id: "a-02", priority: "critical", action: "Scale Family Platter Friday budget from £15 to £21/day", reason: "Cost per order is £3.82 against a £9.50 AOV — you are underspending on a proven winner.", impact: "+8–11 orders/week", module: "Campaign War Room", href: "/dashboard/war-room" },
  { id: "a-03", priority: "high", action: "Send reactivation sequence to 118 remaining inactive customers", reason: "The first wave converted 54% at zero ad cost. £1,240 estimated recoverable revenue remains.", impact: "+£1,240 recoverable", module: "Lead Recovery", href: "/dashboard/recovery" },
  { id: "a-04", priority: "high", action: "Counter Flame Republic's £15 meal deal", reason: "They are targeting your postcode with an aggressive offer. Their weakness: 2.9★ late-delivery reviews.", impact: "Defend ~£400/wk of local demand", module: "Competitor Intelligence", href: "/dashboard/competitors" },
  { id: "a-05", priority: "normal", action: "Add tiered menu PDF to Office Lunch Catering first reply", reason: "6 of 9 leads stalled at pricing. Removing the price-discovery step lifts B2B close rates.", impact: "+1–2 contracts/mo", module: "Campaign Builder", href: "/dashboard/campaigns" },
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

export const demoCampaignSparks: Record<string, number[]> = {
  "cmp-001": [3, 5, 4, 7, 9, 12, 14],
  "cmp-002": [5, 6, 5, 6, 7, 6, 7],
  "cmp-003": [4, 3, 3, 2, 2, 1, 1],
  "cmp-004": [2, 3, 3, 4, 5, 5, 6],
  "cmp-005": [4, 6, 8, 9, 11, 12, 14],
};

export const demoLocalViews = {
  labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  mapViews: [640, 720, 810, 980, 1240, 1860],
  searchViews: [420, 460, 540, 660, 890, 1210],
};

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

// Multi-brand account (owner ruling 2026-07-11): one account, one bill,
// multiple brands running simultaneously. demoBusiness above is the active
// brand; the switcher and billing surfaces render from this roster.
export const demoAccountBrands = [
  {
    id: "brixton-grill",
    name: "Brixton Grill House",
    industry: "Restaurant & Food Delivery",
    bvi: 74,
    acuBurnMonth: 512,
    active: true,
  },
  {
    id: "nseya-beauty",
    name: "Nseya Beauty Studio",
    industry: "Beauty & Personal Care",
    bvi: 68,
    acuBurnMonth: 231,
    active: false,
  },
  {
    id: "carter-fitness",
    name: "Carter Fitness Coaching",
    industry: "Health & Fitness Services",
    bvi: 81,
    acuBurnMonth: 109,
    active: false,
  },
] as const;
