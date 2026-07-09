// Core domain types for MarketWar OS

export type CampaignVerdict = "SCALE" | "FIX" | "STOP" | "TESTING";

export type Channel =
  | "Meta"
  | "Instagram"
  | "TikTok"
  | "Google"
  | "LinkedIn"
  | "WhatsApp"
  | "SMS"
  | "Email"
  | "Local SEO"
  | "Referral";

export interface BusinessProfile {
  name: string;
  industry: string;
  location: string;
  targetCustomer: string;
  product: string;
  price: string;
  offer: string;
  website: string;
  whatsapp: string;
  monthlyBudget: number;
  pastAdSpend: number;
  pastResult: string;
  goal: string;
}

export interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  goal: string;
  hook: string;
  spend: number;
  leads: number;
  messages: number;
  bookings: number;
  revenue: number;
  ctr: number;
  status: "active" | "paused" | "killed";
  verdict: CampaignVerdict;
  verdictReason: string;
  startedDaysAgo: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  location: string;
  source: string;
  segment: string;
  totalSpend: number;
  purchaseCount: number;
  lastActivityDays: number;
  engagementScore: number;
  intentScore: number;
  churnRisk: number;
  recoveryValue: number;
  status: "hot" | "active" | "inactive" | "lost" | "vip";
}

export interface WhatsAppConversation {
  id: string;
  customer: string;
  phone: string;
  campaign: string;
  stage: "new" | "qualifying" | "offer-sent" | "booking" | "won" | "ghosted";
  intentScore: number;
  lastMessage: string;
  lastMessageAgo: string;
  unread: number;
  value: number;
}

export interface Competitor {
  id: string;
  name: string;
  offer: string;
  pricePosition: "cheaper" | "similar" | "premium";
  adActivity: "aggressive" | "moderate" | "quiet";
  weakness: string;
  threatLevel: number;
  lastMove: string;
}

export interface AuditScores {
  conversionRisk: number;
  offerWeakness: number;
  audienceMismatch: number;
  landingPage: number;
  trust: number;
  adCreative: number;
  followUpReadiness: number;
  revenueLeakage: number;
  campaignReadiness: number;
}

export interface AuditReport {
  scores: AuditScores;
  topReasons: string[];
  fastestFix: string;
  biggestRecovery: string;
  bestChannel: string;
  recommendedOffer: string;
  firstCampaign: string;
  doNotSpendOn: string[];
  funnelLeaks: { stage: string; leak: string; severity: number }[];
}

export interface AgentResult {
  agentId: string;
  agentName: string;
  mode: "live" | "demo";
  output: string;
  generatedAt: string;
}

export interface DailyAction {
  id: string;
  priority: "critical" | "high" | "normal";
  action: string;
  reason: string;
  impact: string;
  module: string;
  href: string;
}
