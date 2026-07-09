import type { AuditReport } from "@/lib/types";

export interface AuditInput {
  business: string;
  industry: string;
  location: string;
  product: string;
  price: string;
  offer: string;
  targetCustomer: string;
  pastSpend: number;
  pastResult: string;
  hasWebsite: boolean;
  hasWhatsApp: boolean;
  hasFollowUp: boolean;
  hasReviews: boolean;
  hasTracking: boolean;
}

// Deterministic scoring engine for the Marketing Failure Audit. Scores are
// derived from the intake answers so the report is specific to the business
// even in Demo Intelligence mode. Higher = worse for risk scores,
// higher = better for readiness/trust/page scores.
export function computeAudit(input: AuditInput): AuditReport {
  const offerWeak = scoreOfferWeakness(input.offer);
  const trust = (input.hasReviews ? 55 : 20) + (input.hasWebsite ? 20 : 5) + 10;
  const landingPage = (input.hasWebsite ? 45 : 15) + (input.hasWhatsApp ? 25 : 5) + (input.hasTracking ? 15 : 0);
  const audienceMismatch = input.targetCustomer.trim().length > 25 ? 35 : 70;
  const followUp = input.hasFollowUp ? 70 : 15;
  const spendWasted = input.pastSpend > 0 && /\b(0|no|none|nothing|few|3|couple)\b/i.test(input.pastResult);
  const adCreative = spendWasted ? 30 : 55;
  const conversionRisk = clamp(
    Math.round(
      offerWeak * 0.3 + audienceMismatch * 0.25 + (100 - landingPage) * 0.25 + (100 - followUp) * 0.2
    )
  );
  const revenueLeakage = clamp(Math.round((100 - followUp) * 0.6 + (input.hasTracking ? 10 : 35)));
  const campaignReadiness = clamp(100 - conversionRisk + (input.hasWhatsApp ? 8 : 0));

  const topReasons: string[] = [];
  if (!input.hasWhatsApp)
    topReasons.push("No instant capture channel — clicks had nowhere fast to convert. Ads paid for attention that evaporated.");
  if (offerWeak > 55)
    topReasons.push(`The offer ("${input.offer || "none stated"}") has no urgency or specificity — it gives nobody a reason to act today.`);
  if (audienceMismatch > 50)
    topReasons.push("Targeting is too broad. Local buyers convert; broad audiences click and vanish.");
  if (!input.hasFollowUp)
    topReasons.push("Zero follow-up system — every non-buyer was lost permanently instead of entering a 48-hour sequence.");
  if (!input.hasTracking)
    topReasons.push("No tracking installed — spend decisions were made blind, so losers ran for weeks.");
  if (spendWasted)
    topReasons.push(`£${input.pastSpend} produced "${input.pastResult}" — the objective optimised for engagement, not orders.`);
  if (!input.hasReviews)
    topReasons.push("Thin social proof — strangers had no reason to trust the purchase.");
  while (topReasons.length < 5)
    topReasons.push("Campaigns ran as one-off boosts instead of structured tests with kill criteria.");

  return {
    scores: {
      conversionRisk,
      offerWeakness: clamp(offerWeak),
      audienceMismatch: clamp(audienceMismatch),
      landingPage: clamp(landingPage),
      trust: clamp(trust),
      adCreative: clamp(adCreative),
      followUpReadiness: clamp(followUp),
      revenueLeakage,
      campaignReadiness,
    },
    topReasons: topReasons.slice(0, 5),
    fastestFix: input.hasWhatsApp
      ? "Route every ad click into WhatsApp with a pre-filled message and a 48-hour offer deadline."
      : "Set up WhatsApp Business today and make it the destination of every ad click — one-tap, pre-filled message.",
    biggestRecovery: input.hasFollowUp
      ? "Tighten follow-up timing: every lead answered inside 10 minutes converts ~3x better."
      : "Install a 48-hour follow-up sequence (1h / 24h / 48h). For most small businesses this recovers 20–35% of 'lost' leads.",
    bestChannel: input.hasWhatsApp ? "Meta ads → WhatsApp" : "WhatsApp-first local campaigns",
    recommendedOffer: `A deadline-bound bundle for ${input.targetCustomer || "your core customer"} — specific price, specific window, capped quantity.`,
    firstCampaign: `£15/day, 7-day test in ${input.location || "your area"}: one offer, three hooks, WhatsApp destination, kill criteria locked before launch.`,
    doNotSpendOn: [
      "Brand awareness or follower-growth objectives",
      "Any ad without a tracked destination",
      "Broad national targeting",
      input.hasReviews ? "New creative before the winning hook is found" : "Paid ads at scale before 10+ visible reviews exist",
    ],
    funnelLeaks: [
      { stage: "Attention → Click", leak: spendWasted ? "Creative optimised for likes, not action" : "Hook untested", severity: spendWasted ? 70 : 45 },
      { stage: "Click → Capture", leak: input.hasWhatsApp ? "Capture exists but response time unknown" : "No instant capture channel", severity: input.hasWhatsApp ? 40 : 90 },
      { stage: "Capture → Sale", leak: offerWeak > 55 ? "Offer gives no reason to buy now" : "Offer viable, needs deadline", severity: offerWeak },
      { stage: "Sale → Repeat", leak: input.hasFollowUp ? "Sequence exists, reactivation untapped" : "No follow-up: 100% of non-buyers lost", severity: input.hasFollowUp ? 35 : 85 },
    ],
  };
}

function scoreOfferWeakness(offer: string): number {
  const o = offer.toLowerCase();
  let weakness = 75;
  if (/\d/.test(o)) weakness -= 15; // specific numbers
  if (/(today|only|until|limited|first|cap|deadline|weekend|friday)/.test(o)) weakness -= 20; // urgency
  if (/(free|guarantee|off|save|bundle|bonus)/.test(o)) weakness -= 10; // value mechanic
  if (o.trim().length < 5) weakness = 85;
  return weakness;
}

function clamp(n: number): number {
  return Math.max(2, Math.min(98, n));
}
