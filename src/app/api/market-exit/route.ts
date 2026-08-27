import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { buildCampaign } from "@/backend/market-exit-campaign";
import { detectClosure } from "@/backend/market-exit-detect";
import { requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";
import {
  observe, assess, moveState, listRecords, getRecord, raiseDispute, resolveDispute, isDisputeOpen,
} from "@/backend/market-exit-store";
import {
  createOpportunity, matchReplacements, coverageGap, allocateLeads, screenPublication,
  demoMarketExit, assessClosure,
  CLOSURE_SOURCES, MATCH_WEIGHTS, MANDATORY_CONTROLS, REQUIRED_DISCLOSURE,
  PROHIBITED_INPUT_FIELDS, EXIT_STAGES, SIGNAL_TYPES, OPPORTUNITY_WINDOW_DAYS,
  PUBLISH_CONFIDENCE_FLOOR, REVIEW_CONFIDENCE_FLOOR, TIER_MAX_INFLUENCE, QUALIFYING_TIERS,
  type ClosureSignal, type ClosedBusiness, type ReplacementCandidate, type ReplacementMatch,
  type CountedDemand, type ExitState, type DemandOpportunity,
} from "@/shared/market-exit";

// Market Exit Capture Engine.
//
// POST { action: "observe",   brandId, businessId, businessName, signals[] } → record + assessment
// POST { action: "assess",    brandId, businessId }                          → re-assess what is stored
// POST { action: "opportunity", brandId, businessId, closedBusiness, counted?, complaints?, candidates[] }
//                                                                            → opportunity + matches + coverage
// POST { action: "match",     opportunity, candidates[] }                    → ranked replacements (stateless)
// POST { action: "campaign",  opportunity, match, destinationUrl?, consentRecorded? } → §5 assets, each screened
// POST { action: "allocate",  leads, matches[], candidates[] }               → lead distribution
// POST { action: "screen",    copy, closedBusinessName?, isOutreach?, consentRecorded? } → the §8 controls
// POST { action: "advance",   brandId, businessId, to, note? }               → pipeline move
// POST { action: "dispute",   brandId, businessId, reason }                  → §8 challenge, blocks publication
// POST { action: "resolve",   brandId, businessId, resolution, note }        → close a dispute
// POST { action: "records",   brandId }                                      → everything held for this brand
// GET  → doctrine, sources, weights, controls, demo
//
// THE PROHIBITED-FIELD SCREEN RUNS ON EVERY ACTION, before anything else and
// before authentication resolves. §8 forbids reusing the closed company's
// customer database, and the way that rule gets broken is not by somebody
// choosing to break it — it is by a customer list arriving inside an otherwise
// ordinary request that some later handler happens to read. Refusing the whole
// request at the door is the only version of that control that cannot be
// routed around by adding a new action later.

export const runtime = "nodejs";
// A detection reads a register, several of a company's own pages and a news
// search. Without a declared duration the platform kills the function mid-run
// AFTER the wallet has been debited.
export const maxDuration = 120;

function prohibitedFields(body: Record<string, unknown>): string[] {
  return PROHIBITED_INPUT_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(body, f));
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const banned = prohibitedFields(body);
  if (banned.length > 0) {
    return NextResponse.json({
      error: `Refused: ${banned.map((b) => `"${b}"`).join(", ")}. The closed business's customer data is never accepted here, whatever its provenance is said to be.`,
      control: MANDATORY_CONTROLS[0],
    }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const at = new Date().toISOString();

  // ── Stateless helpers. No brand, no storage, nothing published. ───────────
  if (action === "match") {
    const opportunity = body.opportunity as DemandOpportunity | undefined;
    const candidates = Array.isArray(body.candidates) ? (body.candidates as ReplacementCandidate[]) : null;
    if (!opportunity?.closedBusiness?.category) return NextResponse.json({ error: "match requires an opportunity with a closedBusiness" }, { status: 400 });
    if (!candidates) return NextResponse.json({ error: "match requires candidates[]" }, { status: 400 });
    const matched = matchReplacements(opportunity, candidates);
    return NextResponse.json({ ...matched, coverage: coverageGap(opportunity, matched), weights: MATCH_WEIGHTS });
  }

  if (action === "allocate") {
    const leads = typeof body.leads === "number" ? body.leads : NaN;
    const matches = Array.isArray(body.matches) ? body.matches : null;
    const candidates = Array.isArray(body.candidates) ? (body.candidates as ReplacementCandidate[]) : null;
    if (!Number.isFinite(leads) || leads < 0) return NextResponse.json({ error: "allocate requires a lead count" }, { status: 400 });
    if (!matches || !candidates) return NextResponse.json({ error: "allocate requires matches[] and candidates[]" }, { status: 400 });
    return NextResponse.json(allocateLeads({ leads, matches: matches as never, candidates }));
  }

  if (action === "campaign") {
    const opportunity = body.opportunity as DemandOpportunity | undefined;
    const match = body.match as ReplacementMatch | undefined;
    if (!opportunity?.closedBusiness?.name) return NextResponse.json({ error: "campaign requires an opportunity" }, { status: 400 });
    if (!match?.name) return NextResponse.json({ error: "campaign requires the matched replacement business" }, { status: 400 });
    return NextResponse.json(buildCampaign({
      opportunity, match,
      consentRecorded: body.consentRecorded === true,
      destinationUrl: typeof body.destinationUrl === "string" ? body.destinationUrl : undefined,
    }));
  }

  if (action === "screen") {
    const result = screenPublication({
      copy: typeof body.copy === "string" ? body.copy : "",
      closedBusinessName: typeof body.closedBusinessName === "string" ? body.closedBusinessName : undefined,
      payload: body,
      isOutreach: body.isOutreach === true,
      consentRecorded: body.consentRecorded === true,
    });
    return NextResponse.json({ ...result, requiredDisclosure: REQUIRED_DISCLOSURE, controls: MANDATORY_CONTROLS });
  }

  // ── Everything below names a real third-party business, so it is brand-scoped
  //    and access-checked. A closure record is always somebody's.
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required — a closure record is always somebody's." }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "you";
  const businessId = typeof body.businessId === "string" ? body.businessId.trim() : "";

  if (action === "records") {
    const records = await listRecords(brandId);
    return NextResponse.json({ records, count: records.length });
  }

  // ── THE PART THAT ACTUALLY GOES AND LOOKS. ───────────────────────────────
  //
  // Produces real signals about a real company from the register, the company's
  // own site and the press, records them, and returns what the rules make of
  // them. It does NOT decide — `assessClosure` does, and it is entitled to
  // refuse everything found here. That refusal is the product.
  if (action === "detect") {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const company = typeof body.company === "string" ? body.company.trim() : "";
    if (!company) return NextResponse.json({ error: "detect needs a company name" }, { status: 400 });
    const meter = await meterAction(auth, "enrich", 1);
    if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });

    const detection = await detectClosure({
      company,
      website: typeof body.website === "string" ? body.website.trim() || undefined : undefined,
      where: typeof body.where === "string" ? body.where.trim() || undefined : undefined,
      at,
    });

    // Recorded under the brand so the evidence accumulates across days — a
    // closure case is built from sources that appear at different times, and a
    // detector that forgets last week's registry filing can never satisfy the
    // two-source rule.
    const businessIdFor = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    let assessment;
    if (detection.signals.length > 0) {
      const r = await observe({ brandId, businessId: businessIdFor, businessName: company, signals: detection.signals, at, by });
      assessment = r.assessment;
    } else {
      assessment = assessClosure({ businessId: businessIdFor, signals: [], assessedAt: at });
    }

    return NextResponse.json({
      detection, assessment, businessId: businessIdFor,
      metered: meter.metered, balanceAcu: meter.balanceAcu,
      requiredDisclosure: REQUIRED_DISCLOSURE,
    });
  }


  if (!businessId) return NextResponse.json({ error: "businessId is required" }, { status: 400 });

  if (action === "observe") {
    const signals = Array.isArray(body.signals) ? (body.signals as ClosureSignal[]) : null;
    const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
    if (!signals || signals.length === 0) return NextResponse.json({ error: "observe requires signals[]" }, { status: 400 });
    if (!businessName) return NextResponse.json({ error: "observe requires the business's name — a record about an id nobody can read is not reviewable." }, { status: 400 });
    const bad = signals.find((s) => !s || typeof s.source !== "string" || typeof s.signalType !== "string" || typeof s.observedAt !== "string");
    if (bad) return NextResponse.json({ error: "Every signal needs source, signalType and observedAt." }, { status: 400 });
    const { record, assessment } = await observe({ brandId, businessId, businessName, signals, at, by });
    return NextResponse.json({ record, assessment });
  }

  if (action === "assess") {
    const assessment = await assess(brandId, businessId, at);
    if (!assessment) return NextResponse.json({ error: "No market-exit record for that business." }, { status: 404 });
    return NextResponse.json({ assessment });
  }

  if (action === "opportunity") {
    const record = await getRecord(brandId, businessId);
    if (!record) return NextResponse.json({ error: "Observe some signals for this business first." }, { status: 404 });

    const closedBusiness = body.closedBusiness as ClosedBusiness | undefined;
    if (!closedBusiness?.category || !closedBusiness?.city || !closedBusiness?.postcodePrefix) {
      return NextResponse.json({ error: "opportunity requires closedBusiness with category, city and postcodePrefix" }, { status: 400 });
    }
    const candidates = Array.isArray(body.candidates) ? (body.candidates as ReplacementCandidate[]) : [];

    const assessment = assessClosure({
      businessId, signals: record.signals, assessedAt: at, disputeOpen: isDisputeOpen(record),
    });

    // Eligibility is counted BEFORE the opportunity is created, because the
    // competition level sets how long the opportunity is worth acting on.
    const provisional = { ...closedBusiness, id: closedBusiness.id || businessId };
    const eligibleCount = candidates.filter((c) =>
      c.active !== false && c.verified && c.acceptingCustomers !== false && (c.booking || c.quotes)).length;

    const created = createOpportunity({
      assessment, closedBusiness: provisional,
      counted: (body.counted as CountedDemand) ?? {},
      complaints: Array.isArray(body.complaints) ? (body.complaints as string[]) : [],
      eligibleReplacements: eligibleCount,
      createdAt: at,
    });

    // 409, not 500: a refused opportunity is the engine working. The evidence
    // rule held, and the caller needs the reason rather than a stack trace.
    if (!created.ok) return NextResponse.json({ error: created.error, assessment }, { status: 409 });

    const matched = matchReplacements(created.opportunity, candidates);
    return NextResponse.json({
      assessment,
      opportunity: created.opportunity,
      ...matched,
      coverage: coverageGap(created.opportunity, matched),
      requiredDisclosure: REQUIRED_DISCLOSURE,
    });
  }

  if (action === "advance") {
    const to = typeof body.to === "string" ? (body.to as ExitState) : ("" as ExitState);
    const note = typeof body.note === "string" ? body.note : undefined;
    const r = await moveState({ brandId, businessId, to, by, note, at });
    // 400 rather than 500: a refused move is the pipeline working, not failing.
    return r.ok ? NextResponse.json({ record: r.record }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  if (action === "dispute") {
    const reason = typeof body.reason === "string" ? body.reason : "";
    const r = await raiseDispute({ brandId, businessId, raisedBy: by, reason, at });
    return r.ok ? NextResponse.json({ record: r.record }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  if (action === "resolve") {
    const resolution = body.resolution === "upheld" || body.resolution === "rejected" ? body.resolution : null;
    const note = typeof body.note === "string" ? body.note : "";
    if (!resolution) return NextResponse.json({ error: "resolve requires resolution: \"upheld\" or \"rejected\"" }, { status: 400 });
    const r = await resolveDispute({ brandId, businessId, resolution, note, by, at });
    return r.ok ? NextResponse.json({ record: r.record }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  return NextResponse.json({ error: "Unknown action — use detect, observe, assess, opportunity, match, campaign, allocate, screen, advance, dispute, resolve or records" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Market Exit Capture — verified closures become expiring customer-acquisition opportunities",
    doctrine:
      "When a business closes, the demand it served does not. This engine detects verified market exits, turns each into an expiring opportunity for an ACTIVE MarketWar business, and refuses to do any of it on thin evidence. Publishing a closure about a trading business is a defamation with a marketing budget behind it, so the evidence rule is a code path: an official register entry, or corroboration from two sources that could have failed independently — and a report from a member of the public is never one of the two. Displaced demand is counted or it is null; there is no fallback estimate, because a fallback is where the invented figure gets in.",
    evidenceRule: {
      publishRequires: "One official-tier source, OR two independent qualifying sources.",
      qualifyingTiers: QUALIFYING_TIERS,
      excluded: "reported — a member of the public can support a case, never make one.",
      publishConfidenceFloor: PUBLISH_CONFIDENCE_FLOOR,
      humanReviewBelow: REVIEW_CONFIDENCE_FLOOR,
      combination: "Strongest signal per independence group, combined by complement product. Ten observations of one fact count once.",
    },
    sources: CLOSURE_SOURCES,
    signalTypes: SIGNAL_TYPES,
    matchFormula: MATCH_WEIGHTS.map((w) => `${w.weight}% ${w.label}`).join(" + "),
    matchWeights: MATCH_WEIGHTS,
    eligibility: "Active, verified, accepting customers, and able to serve the location. Checked before scoring, so an ineligible business never appears in a ranking.",
    allocation: `Match quality decides the order and the share; a subscription tier moves it by at most ${Math.round(TIER_MAX_INFLUENCE * 100)}%, and stated capacity is a hard ceiling. Leads nobody can serve are reported, never silently dropped.`,
    pipeline: EXIT_STAGES,
    opportunityWindowDays: OPPORTUNITY_WINDOW_DAYS,
    mandatoryControls: MANDATORY_CONTROLS,
    requiredDisclosure: REQUIRED_DISCLOSURE,
    prohibitedInputFields: PROHIBITED_INPUT_FIELDS,
    actions: ["detect", "observe", "assess", "opportunity", "match", "campaign", "allocate", "screen", "advance", "dispute", "resolve", "records"],
    demo: demoMarketExit(),
  });
}
