import { NextRequest, NextResponse } from "next/server";
import { listBoard, addToBoard, moveOnBoard } from "@/backend/opportunity-board-store";
import { boardView, type Column } from "@/shared/opportunity-board";
import { resolveBrandAccess } from "@/backend/brand-access";
import {
  scoreOpportunity, rankOpportunities, demoOpportunityRadar,
  SIGNAL_SOURCES, OPPORTUNITY_CATEGORIES,
  type OpportunityInput, type FactorWeights,
} from "@/backend/opportunity-radar";
import { issueBrief, effectiveBrief, listBriefs } from "@/backend/growth-brief-store";
import {
  assess, decide, familiesOf, OPPORTUNITY_WEIGHTS, CONFIDENCE_WEIGHTS, SINGLE_FAMILY_CAP,
  COUNT_GATE, MIN_COMPARABLE_PERIODS, VETOES, SOURCE_FAMILY, FAMILY_QUALITY,
  type Veto,
} from "@/shared/trend-score";
import { BRIEF_CHANNELS, LIVE_DRAFT_CHANNELS, BRIEF_REQUIRED } from "@/shared/growth-brief";
import { buildGrowthBrief, BRIEF_TTL_MS, type BriefCoordinates } from "@/shared/growth-brief-build";

// Content Opportunity Radar API (Organic Dominance §13). Merges demand signals
// into a transparent, re-weightable Opportunity Score. Signals are scored only
// from supplied inputs — never fabricated.
// POST { action: "score", input, weights? }         → one scored opportunity
// POST { action: "rank", inputs[], weights? }        → ranked opportunities
// --- §95, the board that scoring feeds ---
// POST { action: "board",  brandId }                 → the columns, and what has stalled
// POST { action: "adopt",  brandId, id, topic, opportunityScore? } → onto the board
// POST { action: "move",   brandId, id, to, note? }  → between columns, rules enforced
// --- Trend Intelligence §5/§6/§16, on this same route rather than beside it ---
// POST { action: "assess", opportunity{}, confidence{}, vetoes?, sources? }
//        → the activation decision: both scores, the band, and what is vetoed
// POST { action: "issue-brief", brandId, brief{}, gate{} } → a reviewable brief, or the gate it failed
// POST { action: "effective",   brandId, briefId, channel, market?, locale?, topic_id?, policy_version? }
//        → the effective brief for that channel, or the baseline and the reason
// POST { action: "briefs",      brandId }            → what has been issued
// GET  → doctrine, signal sources, categories, BOTH scoring formulas, demo
//
// WHY BOTH SCORES LIVE ON ONE ROUTE. The radar's Opportunity Score and the
// Trend Intelligence score are different functions answering different
// questions — the radar ranks CONTENT opportunities for a brand, the spec's
// ranks DEMAND opportunities for an installation and gates activation. Keeping
// them on one route with both formulas published is how the difference stays
// visible; putting the second one behind its own endpoint is how a platform
// ends up with two numbers called the same thing.

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "rank";
  const weights = (body.weights as FactorWeights) ?? {};

  if (action === "score") {
    const input = body.input as OpportunityInput | undefined;
    if (!input || typeof input.topic !== "string" || input.topic.trim() === "") return NextResponse.json({ error: "score requires input.topic" }, { status: 400 });
    return NextResponse.json(scoreOpportunity(input, weights));
  }

  if (action === "rank") {
    const inputs = Array.isArray(body.inputs) ? (body.inputs as OpportunityInput[]) : null;
    if (!inputs || inputs.length === 0 || inputs.some((i) => !i || typeof i.topic !== "string" || i.topic.trim() === "")) {
      return NextResponse.json({ error: "rank requires a non-empty inputs[] where every item has a topic" }, { status: 400 });
    }
    return NextResponse.json(rankOpportunities(inputs, weights));
  }

  // §5's activation decision. Pure and brand-free, like `score` and `rank`:
  // it reads nothing and spends nothing, so there is no tenant to isolate.
  if (action === "assess") {
    const o = (body.opportunity ?? {}) as Record<string, number>;
    const c = (body.confidence ?? {}) as Record<string, number>;
    if (typeof body.opportunity !== "object" || body.opportunity === null) {
      return NextResponse.json({ error: "assess requires an opportunity object with demand, fit, intent, timing and readiness (0–100 each)" }, { status: 400 });
    }
    // Families may be given as the radar's own signal-source names; the count
    // is then DERIVED rather than asserted, which is the point — a caller
    // cannot claim three independent families by typing the number 3.
    const sources = Array.isArray(body.sources) ? (body.sources as string[]) : null;
    const fam = sources ? familiesOf(sources) : null;
    const decision = assess({
      opportunity: {
        demand: Number(o.demand) || 0, fit: Number(o.fit) || 0, intent: Number(o.intent) || 0,
        timing: Number(o.timing) || 0, readiness: Number(o.readiness) || 0,
      },
      confidence: {
        sourceQuality: Number(c.sourceQuality) || 0,
        independentFamilies: fam ? fam.independentFamilies : Number(c.independentFamilies) || 0,
        coverage: Number(c.coverage) || 0,
        freshness: Number(c.freshness) || 0,
      },
      vetoes: Array.isArray(body.vetoes)
        ? (body.vetoes as string[]).filter((v): v is Veto => (VETOES as readonly string[]).includes(v))
        : undefined,
      autoActionOptIn: body.autoActionOptIn === true,
    });
    return NextResponse.json({
      ...decision,
      families: fam ?? undefined,
      note: fam
        ? `Corroboration was derived from the signal sources given, not taken on trust. ${fam.why}`
        : "No sources were given, so independentFamilies was taken as supplied. Pass `sources` and the count is derived from the family map instead.",
    });
  }

  // The board, and the briefs that come off it. Brand-scoped like everything
  // that belongs to somebody.
  if (action === "issue-brief" || action === "effective" || action === "briefs") {
    const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
    if (!brandId) return NextResponse.json({ error: "brandId is required — a brief is always somebody's." }, { status: 400 });
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const nowISO = new Date().toISOString();

    if (action === "briefs") {
      const list = await listBriefs(brandId);
      return NextResponse.json({
        briefs: list.map((s) => ({
          brief_id: s.brief.brief_id, brief_version: s.brief.brief_version,
          topic_id: s.brief.topic_id, market: s.brief.market, locale: s.brief.locale,
          allowed_channels: s.brief.allowed_channels,
          valid_from: s.brief.valid_from, expires_at: s.brief.expires_at,
          approvalId: s.approvalId, issuedWith: s.issuedWith, issuedAt: s.issuedAt, updatedAt: s.updatedAt,
        })),
        note: "A brief listed here is not necessarily in force: it has to be approved, inside its window, and asked for by a channel it allows. Use action \"effective\" to find out, per channel.",
      });
    }

    if (action === "issue-brief") {
      const gate = (body.gate ?? {}) as Record<string, unknown>;
      if (typeof gate.opportunity !== "number" || typeof gate.confidence !== "number") {
        return NextResponse.json({
          error: "issue-brief requires gate.opportunity and gate.confidence (0–100 each) — the scores this brief is claimed to have earned. They are checked against §5's table, not stored on trust.",
        }, { status: 400 });
      }

      // FROM A SCORED DECISION STRAIGHT TO A BRIEF (§4's coordinator).
      //
      // The caller may hand over a finished brief object, or — far more usefully
      // — the coordinates and let `buildGrowthBrief` assemble one from the
      // decision §5 just made. Without this the coordinator has no importer, and
      // a caller has to hand-assemble 22 fields including the two scores, which
      // is precisely where the scores and the band drift apart.
      let candidate: unknown = body.brief;
      if (!candidate && body.coordinates && typeof body.coordinates === "object") {
        const coords = body.coordinates as Partial<BriefCoordinates>;
        const built = buildGrowthBrief(
          decide({
            opportunity: gate.opportunity, confidence: gate.confidence,
            vetoes: Array.isArray(gate.vetoes) ? (gate.vetoes as string[]).filter((v): v is Veto => (VETOES as readonly string[]).includes(v)) : undefined,
            autoActionOptIn: body.autoActionOptIn === true,
          }),
          { ...(coords as BriefCoordinates), valid_from: typeof coords.valid_from === "string" ? coords.valid_from : nowISO },
        );
        if (!built.ok) {
          return NextResponse.json({ error: `The brief could not be built: ${built.errors.join("; ")}`, code: "invalid", errors: built.errors }, { status: 400 });
        }
        candidate = built.brief;
      }

      const r = await issueBrief({
        brandId, brief: candidate,
        gate: {
          opportunity: gate.opportunity, confidence: gate.confidence,
          vetoes: Array.isArray(gate.vetoes) ? (gate.vetoes as string[]).filter((v): v is Veto => (VETOES as readonly string[]).includes(v)) : undefined,
        },
        // THE VERIFIED IDENTITY, never a body field. Who issued a brief is an
        // audit fact; letting the caller name themselves makes the audit trail
        // decorative. Null in demo/CI, where there are no accounts.
        issuedBy: access.email || access.uid || "you",
        nowISO,
      });
      // 422 rather than 500: a refused issue is the gate working, not failing.
      // And 422 rather than 400, because the request was well-formed — it was
      // the candidate that did not clear the band.
      if (!r.ok) {
        return NextResponse.json(
          { error: r.error, code: r.code, errors: r.errors },
          { status: r.code === "invalid" ? 400 : 422 },
        );
      }
      return NextResponse.json({ brief: r.stored.brief, approvalId: r.stored.approvalId, issuedWith: r.stored.issuedWith, note: r.note });
    }

    const briefId = typeof body.briefId === "string" ? body.briefId.trim() : "";
    const channel = typeof body.channel === "string" ? body.channel.trim() : "";
    if (!briefId || !channel) {
      return NextResponse.json({ error: "effective needs a briefId and the channel you are about to work on." }, { status: 400 });
    }
    const resolved = await effectiveBrief({
      brandId, briefId,
      req: {
        channel,
        market: typeof body.market === "string" ? body.market : undefined,
        locale: typeof body.locale === "string" ? body.locale : undefined,
        topic_id: typeof body.topic_id === "string" ? body.topic_id : undefined,
        policy_version: typeof body.policy_version === "number" ? body.policy_version : undefined,
        nowISO,
      },
    });
    // 200 EVEN WHEN THERE IS NO BRIEF. §14.5 is explicit that no eligible brief
    // means "use baseline behaviour" — that is the spec's 204, an answer and
    // not a failure. Returning 4xx here would teach every caller to treat the
    // ordinary case as an error, and then to ignore errors.
    return NextResponse.json(resolved);
  }

  if (action === "board" || action === "adopt" || action === "move") {
    const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
    if (!brandId) return NextResponse.json({ error: "brandId is required — a board is always somebody's." }, { status: 400 });
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const at = new Date().toISOString();
    const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "you";
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (action === "board") {
      return NextResponse.json(boardView(await listBoard(brandId), at));
    }
    if (action === "adopt") {
      const topic = typeof body.topic === "string" ? body.topic.trim() : "";
      if (!id || !topic) return NextResponse.json({ error: "adopt needs an id and a topic" }, { status: 400 });
      const r = await addToBoard({
        brandId, id, topic, at, by,
        opportunityScore: typeof body.opportunityScore === "number" ? body.opportunityScore : undefined,
        // The activation side, when the caller has assessed it. Absent means
        // "not assessed", which the board shows as exactly that.
        confidence: typeof body.confidence === "number" ? body.confidence : undefined,
        band: typeof body.band === "string" ? body.band : undefined,
        vetoes: Array.isArray(body.vetoes)
          ? (body.vetoes as unknown[]).filter((v): v is string => typeof v === "string" && (VETOES as readonly string[]).includes(v))
          : undefined,
      });
      return r.ok ? NextResponse.json({ item: r.item }) : NextResponse.json({ error: r.error }, { status: 409 });
    }
    const to = typeof body.to === "string" ? (body.to as Column) : ("" as Column);
    const note = typeof body.note === "string" ? body.note : undefined;
    const r = await moveOnBoard({ brandId, id, to, by, note, at });
    // 400 rather than 500: a refused move is the board working, not failing.
    return r.ok ? NextResponse.json({ item: r.item }) : NextResponse.json({ error: r.error }, { status: 400 });
  }

  return NextResponse.json({ error: "Unknown action — use score, rank, board, adopt or move" }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    engine: "Content Opportunity Radar — transparent, re-weightable opportunity scoring",
    doctrine: "Merges 12 demand-signal sources into candidates ranked by a transparent, editable formula: Demand × Commercial Intent × Relevance × Timing × Authority × Conversion ÷ Competition. Every factor is shown so the ranking is auditable, and callers can re-weight any factor. Signals are scored from supplied inputs — never fabricated.",
    formula: "Opportunity Score = Demand × Commercial Intent × Relevance × Timing × Authority Probability × Conversion Probability ÷ Competition",
    signalSources: SIGNAL_SOURCES,
    categories: OPPORTUNITY_CATEGORIES,
    demo: demoOpportunityRadar(),

    // THE SECOND SCORER, PUBLISHED BESIDE THE FIRST, with the difference said
    // out loud. These are two functions answering two questions and the risk is
    // not that both exist — it is that somebody reads one number as the other.
    activation: {
      what: "Trend Intelligence activation scoring (§5). A different question from the formula above: not \"which content opportunity ranks highest for this brand\" but \"has this demand opportunity earned the right to change something\".",
      difference: "The radar's score ranks CONTENT opportunities and is a product/divisor of seven factors. This one is a weighted sum of five factors on 0–100 with a SEPARATE confidence score and hard vetoes, and it gates activation rather than ordering a list. Neither is derived from the other and neither replaces the other.",
      opportunityWeights: OPPORTUNITY_WEIGHTS,
      confidenceWeights: CONFIDENCE_WEIGHTS,
      bands: {
        archive: "opportunity < 60 OR confidence < 55",
        watch: "60–74 opportunity, or 55–74 confidence — watch or draft internally",
        brief: "≥ 75 and ≥ 75, no veto — a reviewable brief",
        auto_eligible: "≥ 85 and ≥ 85, and the tenant has opted in explicitly",
      },
      singleFamilyCap: SINGLE_FAMILY_CAP,
      whyTheCap: `One source family with perfect quality, coverage and freshness scores 75 on the weights alone — which would clear the brief threshold on a single feed. Capping confidence at ${SINGLE_FAMILY_CAP} is what makes "one source is never enough" true rather than merely likely.`,
      countGate: { ...COUNT_GATE, minComparablePeriods: MIN_COMPARABLE_PERIODS },
      vetoes: VETOES,
      vetoDoctrine: "A veto is not a low score. An out-of-market topic with a score of 95 is refused by name so the cause can be fixed, rather than argued with.",
      sourceFamilies: SOURCE_FAMILY,
      familyQuality: FAMILY_QUALITY,
      familyDoctrine: "Corroboration counts independent FAMILIES, not sources. Four articles about one press release are one piece of evidence repeated; so are a support ticket, a sales objection and a web session from the same week, which is why those three are one family.",
    },
    brief: {
      what: "The growth brief (§6) — the contract every agent reads before acting. A closed object: an unexpected field is a rejection, not something ignored, because a brief is partly generated and travels through a model.",
      requiredFields: BRIEF_REQUIRED,
      channels: BRIEF_CHANNELS,
      liveChannels: LIVE_DRAFT_CHANNELS,
      // §17's windows, so a caller does not have to guess how long a brief
      // lasts: a persistent topic runs a week, breaking news a day.
      validityWindowMs: BRIEF_TTL_MS,
      issuedFrom: "Pass `brief` (a finished object) or `coordinates` (topic, market, audience, claims, channels, …) and the decision's own scores assemble one — the scores on the brief then come from the decision rather than a second copy of them.",
      runtimeRules: [
        "valid_from < expires_at, and valid_from <= now < expires_at. At the instant it expires it is expired.",
        "The channel asked for must be one the brief allows.",
        "An explicitly global brief (ZZ) never satisfies a country-targeted request.",
        "The market, locale, topic and policy version must all match what was asked.",
        "A brief must be APPROVED in Collaboration & Approvals; re-issuing it invalidates that approval (§18).",
        "A frozen publish lane refuses every brief, through the same shape as every other refusal (§14).",
        "No eligible brief is not an error — it means use baseline behaviour (§14.5).",
      ],
    },
  });
}
