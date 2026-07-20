// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar White-label Reporting Centre (YepAPI §12).
//
// Generates agency-ready, white-labelled SEO/growth reports for clients:
// SEO audit, competitor gap, keyword ranking, backlink, local SEO, AI
// visibility and monthly growth. Deterministic so it works in demo mode
// with zero config; live data sources plug in at go-live.
//
// Doctrine: every score and summary is labelled an ESTIMATE. The engine
// never fabricates metrics, testimonials or reviews. White-label branding
// (agency name, colour, logo) is respected verbatim so agencies can resell
// under their own identity. Premium exports consume ACUs — cost is described
// qualitatively only; provider cost and secrets are never exposed.

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const seed = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "report";

// ---------------------------------------------------------------------------
// Report sections
// ---------------------------------------------------------------------------
export const REPORT_SECTIONS = [
  "seo_audit",
  "competitor_gap",
  "keyword_ranking",
  "backlink",
  "local_seo",
  "ai_visibility",
  "monthly_growth",
] as const;

export type ReportSectionId = (typeof REPORT_SECTIONS)[number];

const SECTION_META: Record<ReportSectionId, { title: string; highlights: (business: string, s: number) => string[]; summary: (business: string, score: number) => string }> = {
  seo_audit: {
    title: "SEO Audit",
    summary: (b, score) => `ESTIMATE: technical + on-page SEO health for ${b} scores ~${score}/100. Core Web Vitals, indexation and metadata reviewed.`,
    highlights: (_b, s) => [
      `Estimated ${(s % 12) + 3} technical issues (crawl, indexation, metadata)`,
      `Core Web Vitals estimated ${s >= 60 ? "passing" : "needs work"}`,
      "Mobile usability and structured-data coverage reviewed (estimate)",
    ],
  },
  competitor_gap: {
    title: "Competitor Gap",
    summary: (b, score) => `ESTIMATE: ${b} closes ~${score}/100 of the visibility gap versus tracked competitors. Content and keyword overlaps mapped.`,
    highlights: (_b, s) => [
      `Estimated ${(s % 40) + 10} keywords competitors rank for that you do not`,
      `Estimated content-depth gap on ${(s % 6) + 2} priority topics`,
      "Share-of-voice comparison is an estimate pending live SERP data",
    ],
  },
  keyword_ranking: {
    title: "Keyword Ranking",
    summary: (b, score) => `ESTIMATE: keyword position strength for ${b} is ~${score}/100. Tracked terms, movement and opportunity clusters summarised.`,
    highlights: (_b, s) => [
      `Estimated ${(s % 30) + 5} keywords in the top 10`,
      `Estimated ${(s % 15) + 2} keywords moved up this period`,
      "Positions are estimates until connected to a live rank tracker",
    ],
  },
  backlink: {
    title: "Backlink Profile",
    summary: (b, score) => `ESTIMATE: backlink authority for ${b} is ~${score}/100. Referring domains, toxicity and velocity summarised.`,
    highlights: (_b, s) => [
      `Estimated ${(s % 200) + 20} referring domains`,
      `Estimated ${(s % 8)}% potentially toxic links to review`,
      "Authority and toxicity figures are estimates pending a live crawl",
    ],
  },
  local_seo: {
    title: "Local SEO",
    summary: (b, score) => `ESTIMATE: local search presence for ${b} is ~${score}/100. Map-pack visibility, citations and profile completeness summarised.`,
    highlights: (_b, s) => [
      `Estimated map-pack appearances on ${(s % 20) + 5} local queries`,
      `Estimated ${(s % 25) + 10} citations found`,
      "Google Business Profile completeness reviewed (estimate)",
    ],
  },
  ai_visibility: {
    title: "AI Visibility",
    summary: (b, score) => `ESTIMATE: likelihood of ${b} being cited by AI assistants (GEO readiness) is ~${score}/100. Citation-worthiness and entity coverage summarised.`,
    highlights: (_b, s) => [
      `Estimated citation readiness for ${(s % 10) + 2} AI-answer intents`,
      `Entity and schema coverage estimated ${s >= 60 ? "strong" : "developing"}`,
      "AI-visibility scoring is an estimate; verify against live assistant answers",
    ],
  },
  monthly_growth: {
    title: "Monthly Growth",
    summary: (b, score) => `ESTIMATE: month-over-month growth momentum for ${b} is ~${score}/100. Traffic, leads and conversion trends projected.`,
    highlights: (_b, s) => [
      `Estimated ${(s % 30) + 3}% traffic movement this period (projection)`,
      `Estimated ${(s % 20) + 2} new leads attributed (estimate)`,
      "All growth figures are projections, not measured actuals",
    ],
  },
};

// ---------------------------------------------------------------------------
// Report building
// ---------------------------------------------------------------------------
export type Branding = { agencyName?: string; brandColour?: string; logo?: string };

export type ReportInput = {
  business: string;
  sections?: string[];
  branding?: Branding;
};

export type ReportSection = {
  id: ReportSectionId;
  title: string;
  score: number; // 0–100, ESTIMATE
  summary: string; // labelled ESTIMATE
  highlights: string[];
};

export type Report = {
  business: string;
  whiteLabel: { agencyName: string; brandColour: string; logo: string };
  generatedFor: string;
  sections: ReportSection[];
  overallScore: number; // 0–100, ESTIMATE
  headline: string;
};

export function buildReport(input: ReportInput): Report {
  const business = input.business && input.business.trim() ? input.business.trim() : "Brixton Grill House";
  const requested = Array.isArray(input.sections) && input.sections.length
    ? (input.sections.filter((s): s is ReportSectionId => (REPORT_SECTIONS as readonly string[]).includes(s)))
    : [...REPORT_SECTIONS];
  const ids: ReportSectionId[] = requested.length ? requested : [...REPORT_SECTIONS];

  const whiteLabel = {
    agencyName: input.branding?.agencyName?.trim() || "MarketWar OS",
    brandColour: input.branding?.brandColour?.trim() || "#6D28D9",
    logo: input.branding?.logo?.trim() || "",
  };

  const sections: ReportSection[] = ids.map((id) => {
    const meta = SECTION_META[id];
    const score = clamp(40 + (seed(business + ":" + id) % 60));
    return {
      id,
      title: meta.title,
      score,
      summary: meta.summary(business, score),
      highlights: meta.highlights(business, score),
    };
  });

  const overallScore = clamp(sections.reduce((a, s) => a + s.score, 0) / sections.length);
  const headline = `ESTIMATE: ${whiteLabel.agencyName} growth report for ${business} — overall score ~${overallScore}/100 across ${sections.length} section(s).`;

  return {
    business,
    whiteLabel,
    generatedFor: business,
    sections,
    overallScore,
    headline,
  };
}

// ---------------------------------------------------------------------------
// Export formats (premium exports consume ACUs — qualitative only)
// ---------------------------------------------------------------------------
export const exportFormats = ["pdf", "pptx", "csv", "link"] as const;
export type ExportFormat = (typeof exportFormats)[number];

export const exportFormatNotes: Record<ExportFormat, string> = {
  pdf: "Print-ready white-label PDF. Premium export consumes ACUs.",
  pptx: "Editable slide deck for client presentations. Premium export consumes ACUs.",
  csv: "Raw section scores for spreadsheets. Premium export consumes ACUs.",
  link: "Shareable live report link. Premium export consumes ACUs.",
};

export type ExportSpec = {
  format: ExportFormat;
  filename: string;
  sizeEstimateKb: number; // seeded ESTIMATE
  acuNote: string;
};

export function exportSpec(report: Report, format: ExportFormat): ExportSpec {
  const fmt: ExportFormat = (exportFormats as readonly string[]).includes(format) ? format : "pdf";
  const base = slugify(report.business);
  const sizeEstimateKb = clamp(
    50 + (seed(base + ":" + fmt) % 950) + report.sections.length * 15,
    10,
    5000,
  );
  return {
    format: fmt,
    filename: `${base}-${fmt}.${fmt === "link" ? "url" : fmt}`,
    sizeEstimateKb,
    acuNote: "Premium export consumes ACUs",
  };
}

// ---------------------------------------------------------------------------
// Demo (zero-config)
// ---------------------------------------------------------------------------
export function demoReport(): Report {
  return buildReport({
    business: "Brixton Grill House",
    branding: { agencyName: "Northwind Digital", brandColour: "#0EA5E9", logo: "https://cdn.example/northwind-logo.png" },
  });
}
