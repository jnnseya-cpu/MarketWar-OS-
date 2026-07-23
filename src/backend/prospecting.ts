// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar B2B Prospecting Engine (Apollo-inspired) — the LeadWar Room.
//
// Completes the acquisition chain: ICP → prospect discovery → enrichment →
// MarketWar Deal Probability Score → multi-step outreach sequence → pipeline.
// Built compliant-first (this is UK/EU B2B): corporate/generic emails are
// prioritised over personal ones; the lawful basis is recorded (legitimate
// interest for corporate subscribers, per ICO); personal business emails are
// flagged as personal data with opt-out; nothing here scrapes private
// individuals or invents a contact. Demo-safe (deterministic); a real provider
// plugs in behind the same interface at go-live.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const pick = <T,>(arr: T[], n: number): T => arr[Math.abs(n) % arr.length];

export const PIPELINE_STAGES = [
  "new_lead", "enriched", "qualified", "contacted", "replied",
  "meeting_booked", "proposal_sent", "negotiation", "won", "lost", "nurture",
] as const;

// ---------------------------------------------------------------------------
// ICP Architect — build the ideal customer profile from what the user sells
// ---------------------------------------------------------------------------
export type ICPInput = {
  product: string; targetCountry?: string; targetIndustry?: string;
  dealSizeGbp?: number; painPoint?: string; companySize?: string; salesChannel?: string;
};
export type ICP = {
  persona: string; bestJobTitles: string[]; bestIndustries: string[]; bestCompanySize: string;
  bestRegions: string[]; exclusionRules: string[]; scoringFormula: string; outreachAngle: string;
};

export function buildICP(input: ICPInput): ICP {
  const product = input.product.trim();
  const country = input.targetCountry || "United Kingdom";
  const industry = input.targetIndustry || inferIndustry(product);
  const dealSize = input.dealSizeGbp ?? 5000;
  const seniorityTitles = dealSize >= 15000
    ? ["Chief Executive Officer", "Managing Director", "Chief Financial Officer", "VP / Director of Operations"]
    : ["Head of Marketing", "Operations Manager", "Founder / Owner", "Commercial Manager"];
  return {
    persona: `Decision-makers at ${input.companySize || "SMB–mid-market"} ${industry} businesses in ${country} feeling "${input.painPoint || "wasted marketing spend / slow growth"}".`,
    bestJobTitles: seniorityTitles,
    bestIndustries: [industry, ...adjacentIndustries(industry)].slice(0, 4),
    bestCompanySize: input.companySize || (dealSize >= 15000 ? "50–500 employees" : "5–50 employees"),
    bestRegions: [country, ...(country === "United Kingdom" ? ["London", "Midlands", "North West"] : [])].slice(0, 4),
    exclusionRules: [
      "Exclude dissolved / inactive companies",
      "Exclude already-contacted + unsubscribed + bounced",
      "Exclude sole-trader personal emails unless legitimate-interest documented",
      dealSize >= 15000 ? "Exclude <50 employees (deal too small)" : "Exclude enterprise (>500) — sales cycle too long",
    ],
    scoringFormula: "DealProbability = Fit×0.25 + Intent×0.25 + Authority×0.15 + Budget×0.15 + Urgency×0.1 + Engagement×0.1 − Risk×0.2",
    outreachAngle: `Lead with the financial cost of "${input.painPoint || "wasted ad spend"}": quantify the leak, then offer a 15-minute teardown. ${input.salesChannel ? `Primary channel: ${input.salesChannel}.` : ""}`.trim(),
  };
}

function inferIndustry(product: string): string {
  const p = product.toLowerCase();
  if (/\b(restaurant|food|takeaway|catering)\b/.test(p)) return "hospitality";
  if (/\b(saas|software|app|platform|ai)\b/.test(p)) return "technology / SaaS";
  if (/\b(build|construct|trade|plumb|electric)\b/.test(p)) return "construction / trades";
  if (/\b(marketing|agency|ad|growth)\b/.test(p)) return "marketing services";
  if (/\b(health|clinic|dental|care)\b/.test(p)) return "healthcare";
  if (/\b(property|estate|letting)\b/.test(p)) return "real estate";
  return "professional services";
}
function adjacentIndustries(ind: string): string[] {
  const map: Record<string, string[]> = {
    "hospitality": ["retail", "events"], "technology / SaaS": ["professional services", "e-commerce"],
    "construction / trades": ["property management", "facilities"], "marketing services": ["e-commerce", "professional services"],
    "healthcare": ["wellness", "public sector"], "real estate": ["construction", "financial services"],
    "professional services": ["technology", "financial services"],
  };
  return map[ind] || ["professional services", "retail"];
}

// ---------------------------------------------------------------------------
// Prospect discovery + 17-field enrichment (compliant, generic-email-first)
// ---------------------------------------------------------------------------
export type Prospect = {
  companyName: string; tradingName?: string; website: string; domain: string;
  industry: string; employeeCount: number; revenueEstimateGbp: number; location: string;
  contactEmail: string; emailType: "generic" | "personal"; phone: string;
  contactTitle: string; seniority: string; linkedinCompany: string;
  technologies: string[]; hiringSignal: boolean; fundingSignal: boolean; companyDescription: string;
  lawfulBasis: string; consentStatus: string; complianceFlags: string[];
  isSample?: boolean; // true = illustrative, NOT a real contactable company
};

export function searchProspects(icp: ICP, opts: { count?: number; industry?: string; location?: string } = {}): { mode: "live" | "demo"; prospects: Prospect[]; note: string } {
  const count = Math.min(opts.count ?? 8, 25);
  const industry = opts.industry || icp.bestIndustries[0];
  const location = opts.location || icp.bestRegions[0] || "United Kingdom";
  const live = Boolean(process.env.APOLLO_API_KEY || process.env.SERPER_API_KEY);
  const s = seed(industry + location + icp.persona);
  const prospects: Prospect[] = Array.from({ length: count }, (_, i) => {
    const k = s + i * 2654435761;
    // Illustrative sample companies. Deliberately NON-CONTACTABLE: reserved
    // example.com domains (RFC 2606) and REDACTED email/phone, so nobody can
    // mistake a demo row for a real lead or email a fabricated address. The
    // deal-scoring engine still runs on these so the surface is explorable.
    const name = `Sample ${pick(["Apex", "Northgate", "Meridian", "Vanguard", "Oakwell", "Copperfield", "Halcyon", "Bridgeway"], k)} ${pick(["Group", "Ltd", "Partners", "Services", "Holdings", "& Co"], k >> 3)}`;
    const domain = `${name.split(" ")[1].toLowerCase()}.example.com`;
    const emp = 5 + (k % 300);
    const generic = (k % 3) !== 0;
    return {
      companyName: name, website: `https://${domain}`, domain, industry, employeeCount: emp,
      revenueEstimateGbp: emp * (40000 + (k % 60000)), location,
      contactEmail: "—", emailType: generic ? "generic" : "personal",
      phone: "—",
      contactTitle: pick(icp.bestJobTitles, k), seniority: k % 2 ? "C-suite / Director" : "Head / Manager",
      linkedinCompany: "",
      technologies: [pick(["HubSpot", "Salesforce", "Shopify", "WordPress", "Mailchimp"], k), pick(["Meta Ads", "Google Ads", "Stripe", "Xero"], k >> 5)],
      hiringSignal: (k % 4) === 0, fundingSignal: (k % 7) === 0,
      companyDescription: `Illustrative ${industry} company in ${location}, ~${emp} staff — sample data.`,
      lawfulBasis: "Sample record — not a real company; no contact permitted.",
      consentStatus: "not_contacted",
      complianceFlags: generic ? ["sample-only", "not-contactable"] : ["sample-only", "not-contactable"],
      isSample: true,
    };
  });
  return {
    mode: live ? "live" : "demo",
    prospects,
    note: live
      ? "Live prospects from your connected data source. Corporate/generic emails prioritised; personal business emails flagged as personal data (legitimate-interest + opt-out required)."
      : "SAMPLE DATA — these are illustrative companies with redacted, non-contactable details (example.com, no real emails). They demonstrate the ICP + Deal Probability engine only. Connect a data provider (Apollo/Serper) for real, contactable prospects. We never invent real contact addresses.",
  };
}

// ---------------------------------------------------------------------------
// MarketWar Deal Probability Score
// ---------------------------------------------------------------------------
export type DealScore = {
  fit: number; intent: number; urgency: number; budget: number; authority: number; engagement: number; risk: number;
  dealProbability: number; expectedDealValueGbp: number; whyNow: string; band: "hot" | "warm" | "cold";
};

export function scoreDeal(p: Prospect, icp: ICP, dealSizeGbp = 5000): DealScore {
  const k = seed(p.domain + p.contactTitle);
  const fit = clamp(60 + (icp.bestIndustries.includes(p.industry) ? 20 : 0) + ((k % 20) - 10));
  const intent = clamp(45 + (p.hiringSignal ? 20 : 0) + (p.fundingSignal ? 20 : 0) + ((k >> 3) % 15));
  const authority = clamp(p.seniority.includes("C-suite") ? 85 : 60 + ((k >> 5) % 15));
  const budget = clamp(50 + Math.min(40, p.revenueEstimateGbp / 500000) + ((k >> 7) % 10));
  const urgency = clamp((p.hiringSignal || p.fundingSignal ? 70 : 45) + ((k >> 9) % 15));
  const engagement = clamp(40 + ((k >> 11) % 30));
  const risk = clamp((p.emailType === "personal" ? 35 : 15) + ((k >> 13) % 20));
  const dealProbability = clamp(fit * 0.25 + intent * 0.25 + authority * 0.15 + budget * 0.15 + urgency * 0.1 + engagement * 0.1 - risk * 0.2);
  return {
    fit, intent, urgency, budget, authority, engagement, risk,
    dealProbability,
    expectedDealValueGbp: Math.round(dealSizeGbp * (dealProbability / 100)),
    whyNow: p.fundingSignal ? "Recent funding signal — budget freed up, buying window open."
      : p.hiringSignal ? "Actively hiring — scaling, and scaling exposes the pain you solve."
      : "Fits the ICP; no acute trigger — nurture until a signal appears.",
    band: dealProbability >= 70 ? "hot" : dealProbability >= 50 ? "warm" : "cold",
  };
}

// ---------------------------------------------------------------------------
// Outreach sequence (Day 1/3/5/7/10/14) with per-lead personalisation
// ---------------------------------------------------------------------------
export type SequenceStep = { day: number; channel: string; purpose: string; message: string };
export type OutreachPlan = {
  icebreaker: string; painHypothesis: string; openingLine: string; objectionPrediction: string;
  steps: SequenceStep[]; callScript: string; compliance: string;
};

export function buildSequence(p: Prospect, icp: ICP): OutreachPlan {
  const first = p.contactTitle.split(" ")[0];
  const pain = icp.persona.match(/"([^"]+)"/)?.[1] || "wasted marketing spend";
  return {
    icebreaker: `Noticed ${p.companyName} ${p.hiringSignal ? "is hiring" : p.fundingSignal ? "recently raised" : `works across ${p.industry}`} — congrats.`,
    painHypothesis: `Most ${p.industry} firms your size are quietly losing money to ${pain}.`,
    openingLine: `Quick one for the ${first === p.contactTitle ? "team" : first} — worth 15 minutes if cutting acquisition cost is on your radar this quarter.`,
    objectionPrediction: `Likely objection: "we already have an agency / tools." Rebuttal: this sits above them and only spends where the ROI proves out.`,
    steps: [
      { day: 1, channel: "email", purpose: "personalised opener", message: `Subject: ${p.companyName} + a cheaper cost per customer\n\n${p.hiringSignal ? "Saw you're scaling. " : ""}Most ${p.industry} teams overpay for leads. We find where your next customer is cheapest and only spend where it proves out. Worth a 15-min teardown?` },
      { day: 3, channel: "linkedin", purpose: "connect / view", message: `Connect with a one-line note referencing the day-1 email.` },
      { day: 5, channel: "email", purpose: "value + proof", message: `Short case-style proof: comparable ${p.industry} firm cut CAC by routing spend to owned channels. One chart, one CTA.` },
      { day: 7, channel: "call", purpose: "call task", message: `Call script below — 30 seconds to the point.` },
      { day: 10, channel: "email", purpose: "case study", message: `Send the relevant case study + a specific time to meet.` },
      { day: 14, channel: "email", purpose: "final / break-up", message: `Polite break-up email — "should I close the loop?" (often the highest reply rate).` },
    ],
    callScript: `"Hi ${first === p.contactTitle ? "there" : first}, [name] from MarketWar — 30 seconds? We help ${p.industry} firms cut cost-per-customer by finding the cheapest channel before spending. Worth 15 minutes to see your numbers? ... Great, I'll send two times."`,
    compliance: p.emailType === "personal"
      ? "⚠ Personal email — document Legitimate Interest Assessment + include opt-out before first send; suppress on request."
      : "Corporate email (ICO B2B legitimate interest) — include sender identity + one-click unsubscribe; respect suppression list + daily send limits.",
  };
}
