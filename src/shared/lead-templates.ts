// Saved lead-search templates for the LeadWar Room (Apollo-inspired).
// Pure, client-safe data (no backend imports) so the prospecting page can
// render template chips without breaching the layer boundary. Each template
// maps a real B2B search intent to the ICP inputs the engine already accepts.
//
// The flagship template, "UK Decision-Maker Hunter", encodes the exact Apollo
// filter set the owner runs today: UK C-suite / directors / heads / partners.

export type LeadTemplate = {
  id: string;
  name: string;
  description: string;
  seniority: string[]; // job-title bands this search hunts
  filters: {
    product?: string;
    targetIndustry?: string;
    targetCountry?: string;
    companySize?: string;
    dealSizeGbp?: number;
    painPoint?: string;
    salesChannel?: string;
  };
};

export const LEAD_TEMPLATES: LeadTemplate[] = [
  {
    id: "uk-decision-maker-hunter",
    name: "UK Decision-Maker Hunter",
    description:
      "UK C-suite, directors, heads and partners at SMB–mid-market firms — the owner's live Apollo filter, ready to run.",
    seniority: ["CEO / Founder", "Managing Director", "Director", "Head of…", "Partner"],
    filters: {
      targetCountry: "United Kingdom",
      targetIndustry: "professional services",
      companySize: "10–250 employees",
      dealSizeGbp: 8000,
      painPoint: "wasted marketing spend and no reliable pipeline",
      salesChannel: "email + LinkedIn",
    },
  },
  {
    id: "local-hospitality-owners",
    name: "Local Hospitality Owners",
    description:
      "Owners and operators of restaurants, cafés and venues in a target city — high-intent, quick sales cycle.",
    seniority: ["Owner", "Founder", "General Manager"],
    filters: {
      targetCountry: "United Kingdom",
      targetIndustry: "hospitality",
      companySize: "5–50 employees",
      dealSizeGbp: 3000,
      painPoint: "empty tables midweek and no repeat-customer engine",
      salesChannel: "WhatsApp + email",
    },
  },
  {
    id: "ecommerce-growth-leads",
    name: "E-commerce Growth Leads",
    description:
      "Founders and marketing heads at scaling online retailers — funding/hiring signals mean budget is moving.",
    seniority: ["Founder", "Head of Marketing", "Head of Growth", "E-commerce Director"],
    filters: {
      targetCountry: "United Kingdom",
      targetIndustry: "e-commerce",
      companySize: "10–200 employees",
      dealSizeGbp: 6000,
      painPoint: "rising ad costs and falling return on ad spend",
      salesChannel: "email + retargeting",
    },
  },
  {
    id: "b2b-saas-buyers",
    name: "B2B SaaS Buyers",
    description:
      "VP/Director-level buyers at software companies — larger deals, longer cycle, high lifetime value.",
    seniority: ["VP Marketing", "VP Sales", "Director of Demand Gen", "CMO"],
    filters: {
      targetCountry: "United Kingdom",
      targetIndustry: "technology / SaaS",
      companySize: "50–500 employees",
      dealSizeGbp: 18000,
      painPoint: "expensive paid acquisition and weak owned distribution",
      salesChannel: "email + LinkedIn + call",
    },
  },
];

export const LEAD_TEMPLATE_BY_ID: Record<string, LeadTemplate> = Object.fromEntries(
  LEAD_TEMPLATES.map((t) => [t.id, t]),
);
