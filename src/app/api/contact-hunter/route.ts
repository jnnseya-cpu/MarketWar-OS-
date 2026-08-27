import { NextRequest, NextResponse } from "next/server";
import { resolveBrandAccess } from "@/backend/brand-access";
import { huntByCriteria, huntCompany, learnSitePattern } from "@/backend/contact-hunt-run";
import { requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";
import {
  listSuppressions, recordObjection, getSourcePolicy, setSourcePolicy,
  recordOutcome, sourceVerdicts, defaultPolicy, type SourcePolicy,
} from "@/backend/contact-hunter-store";
import { classifyEmail, verifyEmail, assessCompliance, buildContactRecord } from "@/backend/lead-harvest";
import { findPerson, providerHealth } from "@/backend/enrichment-provider";
import { registerBuiltInProviders, NOT_IMPLEMENTED } from "@/backend/enrichment-adapters";
import { readTitle, claimsOperationalRole, STOP_AT } from "@/shared/contact-confidence";
import { isPersonalProvider } from "@/backend/enrich";
import {
  learnPattern, candidateFromPattern, assessEmployment, normalisePhone,
  readiness, screenIntake, suppressedBy, activationGate, evidenceComplete,
  demoContactHunter,
  READINESS_WEIGHTS, PROHIBITED_CATEGORIES, PROHIBITED_SOURCES, EMAIL_PATTERNS,
  MIN_PATTERN_SAMPLE, EMPLOYMENT_STALE_DAYS, FRESHNESS_STALE_DAYS,
  MIN_QUALITY_SAMPLE, MAX_BOUNCE_RATE, MAX_COMPLAINT_RATE, MAX_WRONG_NUMBER_RATE,
  type SourceEvidence, type ContactPoint, type EmploymentEvidence, type EmailStatus,
} from "@/shared/contact-hunter";

// MarketWar Contact Hunter — public B2B discovery, verification and activation.
//
// POST { action: "pattern",  known[] }                        → the firm's convention, or why not
// POST { action: "candidate", finding, first, last, domain }   → an INFERRED address, marked as one
// POST { action: "employment", evidence[] }                    → current-role confidence, or a conflict
// POST { action: "phone",    raw, countryCode, ... }           → E.164 + an honest status
// POST { action: "score",    ... }                             → readiness, explainable, block-aware
// POST { action: "gate",     ... }                             → CONTACT_ALLOWED with every term shown
// POST { action: "objection", value, reason }                  → platform-wide suppression, immediately
// POST { action: "suppressed", value, channel } (brand-scoped) → is this value blocked for us?
// POST { action: "policy" | "set-policy", domain }             → source governance
// POST { action: "outcome",  sourceDomain, bounces… }          → feeds the auto-disable arithmetic
// POST { action: "sources" }                                   → every source and its verdict
// POST { action: "lookup",  fullName, company, website, … }     → ONE person through the provider
//                                                                 waterfall: free sources first,
//                                                                 three confidences, a deadline
//                                                                 and a spending limit
// GET  → doctrine, prohibitions, weights, thresholds, demo
//
// WHAT THIS ROUTE DELIBERATELY DOES NOT DO: verify an email or decide a lawful
// basis of its own. `lead-harvest.ts` has done both for months — twelve checks
// and a UK/EU/US decision that knows PECR treats a corporate subscriber
// differently from a sole trader. It is called, not reimplemented. A second
// verifier would drift from the first, and the first is the one the email
// sender already consults.

export const runtime = "nodejs";
// A hunt reads up to fifteen companies' own sites, one at a time — sequential on
// purpose, because a burst of parallel requests to a small firm's server is the
// behaviour that gets a crawler blocked for everybody. Six pages each at a nine-
// second ceiling needs room, and without a declared duration the platform kills
// the function mid-run AFTER the wallet has been debited.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  // PROHIBITED CATEGORIES, AT THE DOOR, ON EVERY ACTION — before auth resolves
  // and before any handler reads a field. The way this rule gets broken is not
  // by a decision to break it; it is by a home address arriving inside an
  // otherwise ordinary payload that some later handler happens to store.
  const intake = screenIntake(body);
  if (!intake.ok) {
    return NextResponse.json({
      error: `Refused: ${intake.refusals.map((r) => r.field).join(", ")}. ${intake.refusals[0].why}`,
      refusals: intake.refusals,
      neverCollected: PROHIBITED_CATEGORIES,
    }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const at = new Date().toISOString();

  // ── Pure helpers. No storage, no brand, nothing published. ────────────────
  if (action === "pattern") {
    const known = Array.isArray(body.known) ? (body.known as { email: string; first: string; last: string }[]) : null;
    if (!known) return NextResponse.json({ error: "pattern requires known[] of { email, first, last }" }, { status: 400 });
    return NextResponse.json({ finding: learnPattern(known), minimumSample: MIN_PATTERN_SAMPLE, patterns: EMAIL_PATTERNS });
  }

  if (action === "candidate") {
    const finding = body.finding as ReturnType<typeof learnPattern> | undefined;
    const first = typeof body.first === "string" ? body.first : "";
    const last = typeof body.last === "string" ? body.last : "";
    const domain = typeof body.domain === "string" ? body.domain : "";
    if (!finding) return NextResponse.json({ error: "candidate requires the pattern finding from the \"pattern\" action" }, { status: 400 });
    const r = candidateFromPattern({ finding, first, last, domain, learnedFrom: (body.learnedFrom as SourceEvidence[]) ?? [] });
    if (!r.ok) return NextResponse.json({ error: r.why }, { status: 400 });
    return NextResponse.json({
      candidate: r.candidate, why: r.why,
      warning: "This address is INFERRED. It has not been published anywhere and must never be shown, exported or sent to as confirmed.",
    });
  }

  if (action === "employment") {
    const evidence = Array.isArray(body.evidence) ? (body.evidence as EmploymentEvidence[]) : null;
    if (!evidence) return NextResponse.json({ error: "employment requires evidence[]" }, { status: 400 });
    return NextResponse.json({ finding: assessEmployment(evidence, at), staleAfterDays: EMPLOYMENT_STALE_DAYS });
  }

  if (action === "phone") {
    const raw = typeof body.raw === "string" ? body.raw : "";
    const countryCode = typeof body.countryCode === "string" ? body.countryCode : "";
    if (!raw) return NextResponse.json({ error: "phone requires raw" }, { status: 400 });
    return NextResponse.json({
      finding: normalisePhone(raw, countryCode, {
        businessContextConfirmed: body.businessContextConfirmed === true,
        carrierChecked: body.carrierChecked === true,
        carrierKind: body.carrierKind as never,
        suppressed: body.suppressed === true,
        knownWrongNumber: body.knownWrongNumber === true,
      }),
    });
  }

  if (action === "verify-email") {
    // Straight through to the engine that already does this. The classification
    // and the personal-mailbox suppression are the only things added.
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) return NextResponse.json({ error: "verify-email requires email" }, { status: 400 });
    const cls = classifyEmail(email);
    const verification = verifyEmail(email, (body.context as never) ?? {});
    const personal = isPersonalProvider(email);
    // PERSONAL MAILBOXES ARE SUPPRESSED BY DEFAULT. A gmail address on a company
    // page is somebody's personal mailbox that happens to be used for work, and
    // the default has to be the safe one.
    //
    // Mapped from the engine's own `verdict` and its own checks — never from a
    // field invented here. A catch-all domain is reported as CATCH_ALL rather
    // than folded into "probable", because the two need different handling: one
    // is a guess about a mailbox, the other is a domain that accepts everything
    // and tells you nothing.
    const catchAll = verification.checks.find((c) => c.name === "catch_all")?.pass === false;
    const status: EmailStatus = personal ? "PERSONAL_SUPPRESSED"
      : verification.verdict === "reject" ? "INVALID"
      : catchAll ? "CATCH_ALL"
      : verification.verdict === "safe" ? (cls.contactType === "generic" ? "ROLE_ACCOUNT" : "VERIFIED")
      : "PROBABLE";
    return NextResponse.json({
      email, classification: cls, verification, status,
      personalProvider: personal,
      note: personal
        ? "Personal-provider address, suppressed by default. It may only be used where it is intentionally published for a relevant professional purpose AND the tenant's approved policy permits it."
        : undefined,
    });
  }

  if (action === "score") {
    const employment = body.employment as ReturnType<typeof assessEmployment> | undefined;
    const compliance = body.compliance as { canContact: boolean; lawfulBasis: string; reasons: string[] } | undefined;
    if (!employment || !compliance) return NextResponse.json({ error: "score requires employment and compliance" }, { status: 400 });
    return NextResponse.json({
      readiness: readiness({
        icpFit: typeof body.icpFit === "number" ? body.icpFit : 0,
        employment,
        email: body.email as ContactPoint | undefined,
        phone: body.phone as ContactPoint | undefined,
        evidence: Array.isArray(body.evidence) ? (body.evidence as SourceEvidence[]) : [],
        intentSignals: Array.isArray(body.intentSignals) ? (body.intentSignals as { signal: string; observedAt: string }[]) : [],
        compliance,
        suppression: (body.suppression as never) ?? null,
        refreshedAt: typeof body.refreshedAt === "string" ? body.refreshedAt : undefined,
        asOf: at,
      }),
      weights: READINESS_WEIGHTS,
    });
  }

  if (action === "gate") {
    return NextResponse.json(activationGate({
      sourcePermitted: body.sourcePermitted === true,
      collectionLawful: body.collectionLawful === true,
      purposeCompatible: body.purposeCompatible === true,
      destinationRulePassed: body.destinationRulePassed === true,
      suppression: (body.suppression as never) ?? null,
      channelAllowed: body.channelAllowed === true,
      tenantIdentityComplete: body.tenantIdentityComplete === true,
    }));
  }

  if (action === "compliance") {
    // The existing engine, reached through this door so a caller does not need
    // two. `buildContactRecord` normalises whatever arrived.
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
    if (!email || !sourceUrl) return NextResponse.json({ error: "compliance requires email and sourceUrl — a contact with no source is not a contact" }, { status: 400 });
    const record = buildContactRecord({
      email, sourceUrl,
      country: typeof body.country === "string" ? body.country : "GB",
      company: typeof body.company === "string" ? body.company : "",
      dateExtracted: typeof body.dateExtracted === "string" ? body.dateExtracted : at,
    });
    return NextResponse.json({
      record,
      verdict: assessCompliance({
        record,
        consentOnFile: body.consentOnFile === true,
        liaCompleted: body.liaCompleted === true,
        doNotContact: body.doNotContact === true,
      }),
    });
  }

  if (action === "evidence-check") {
    const point = body.point as ContactPoint | undefined;
    if (!point) return NextResponse.json({ error: "evidence-check requires point" }, { status: 400 });
    return NextResponse.json(evidenceComplete(point));
  }

  // ── An objection needs no brand and no account. ───────────────────────────
  //
  // Deliberately reachable without authentication: the person objecting is not
  // our customer and will not sign up to be left alone. Rate limiting protects
  // it; a login would defeat it.
  if (action === "objection") {
    const value = typeof body.value === "string" ? body.value : "";
    const reason = typeof body.reason === "string" ? body.reason : "";
    const r = await recordObjection({
      value, reason, requestedAt: at,
      channel: (body.channel as never) ?? "ALL",
      scope: body.scope === "TENANT" ? "TENANT" : "PLATFORM",
      tenantId: typeof body.tenantId === "string" ? body.tenantId : undefined,
      by: typeof body.by === "string" ? body.by : undefined,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({
      suppression: r.suppression,
      note: "Recorded. It applies across every tenant and campaign from now, it is permanent, and the value itself was hashed rather than stored.",
    });
  }

  if (action === "sources") {
    return NextResponse.json({
      sources: await sourceVerdicts(),
      thresholds: { minimumSample: MIN_QUALITY_SAMPLE, maxBounceRate: MAX_BOUNCE_RATE, maxComplaintRate: MAX_COMPLAINT_RATE, maxWrongNumberRate: MAX_WRONG_NUMBER_RATE },
    });
  }

  if (action === "policy") {
    const domain = typeof body.domain === "string" ? body.domain : "";
    if (!domain) return NextResponse.json({ error: "policy requires domain" }, { status: 400 });
    return NextResponse.json({ policy: await getSourcePolicy(domain) });
  }

  // ── Brand-scoped from here. ───────────────────────────────────────────────
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required for this action" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "you";

  // ── THE PART THAT ACTUALLY GOES AND LOOKS. ───────────────────────────────
  //
  // Metered before it runs, because it spends a search credit and other
  // people's bandwidth. Demo deployments are not metered (meterAction returns
  // allowed when accounts are not enforced), so the tool keeps working with no
  // keys — it simply reports that live search is unavailable rather than
  // inventing a company.
  if (action === "hunt" || action === "hunt-company" || action === "learn-pattern" || action === "lookup") {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const suppressions = await listSuppressions();

    // ── ONE PERSON, SEVERAL SUPPLIERS, A DEADLINE. ──────────────────────────
    //
    // The waterfall, reachable. `hunt` sweeps a trade across towns; this
    // answers the other question the owner actually asks — "here is a name and
    // a company, get me the route to them" — and it is the action the provider
    // stack exists for. Free sources first (our own crawl, then the register),
    // stop as soon as the three confidences clear their thresholds, and never
    // call a paid provider whose price would take the lookup past its budget.
    if (action === "lookup") {
      const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
      const company = typeof body.company === "string" ? body.company.trim() : "";
      const website = typeof body.website === "string" ? body.website.trim() : "";
      const wantedTitle = typeof body.title === "string" ? body.title.trim() : "";
      if (!fullName && !company) {
        return NextResponse.json({ error: "lookup needs at least a person's name or a company" }, { status: 400 });
      }

      // The base charge covers our own crawl — bandwidth and their server's
      // time, both real and neither billed by anybody else.
      const meter = await meterAction(auth, "enrich", 1);
      if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });

      registerBuiltInProviders();
      const result = await findPerson({
        person: {
          fullName: fullName || undefined,
          company: company || undefined,
          domain: website ? website.replace(/^https?:\/\//i, "").replace(/\/.*$/, "") : undefined,
          title: wantedTitle || undefined,
          country: typeof body.country === "string" ? body.country : "GB",
        },
        deadlineMs: typeof body.deadlineMs === "number" ? body.deadlineMs : 14_000,
        // A paid provider is only ever reached when the caller allowed one. The
        // default is zero, so the free path is the default path.
        maxCostAcu: typeof body.maxCostAcu === "number" ? Math.max(0, Math.min(200, body.maxCostAcu)) : 0,
      });

      // WHAT THE SUPPLIERS ACTUALLY COST, CHARGED AFTER THE FACT — because the
      // waterfall stops early and billing the whole stack for a lookup that
      // used one provider is the dishonest half of this business model.
      //
      // One `enrich` unit is 2 ACUs and one provider ACU is 1, so charging
      // `result.costAcu` units prices supplier spend at exactly 2x: the owner's
      // 100% floor, met by arithmetic rather than by a note.
      let metered = meter.metered;
      let balanceAcu = meter.balanceAcu;
      if (result.costAcu > 0) {
        const paid = await meterAction(auth, "enrich", result.costAcu);
        metered = metered || paid.metered;
        balanceAcu = paid.balanceAcu;
      }

      // Every person carries the refusal, and every address is checked against
      // the suppression list BEFORE it is rendered — a lookup that returns a
      // suppressed address has already leaked it to the screen.
      const people = result.people.map((p) => {
        const reading = readTitle(p.jobTitle ?? "", { fromRegistryOnly: p.fromRegistryOnly });
        const claim = claimsOperationalRole(reading, !p.fromRegistryOnly);
        return {
          ...p,
          reading,
          operationalRole: claim,
          // The register's word is shown as the register's word, never as a job.
          displayTitle: claim.ok ? p.jobTitle ?? null : null,
        };
      });
      const emails = result.emails.map((e) => {
        const block = suppressedBy(e.value, suppressions, { tenantId: brandId, channel: "EMAIL" });
        return { ...e, suppressed: Boolean(block), suppressionReason: block?.reason ?? null };
      });
      const blocked = emails.filter((e) => e.suppressed).length;

      return NextResponse.json({
        result: {
          ...result,
          people,
          emails,
          suppressedCount: blocked,
        },
        providers: providerHealth(),
        notConfigured: NOT_IMPLEMENTED,
        stopThresholds: STOP_AT,
        metered, balanceAcu,
        note: blocked > 0
          ? `${result.note} ${blocked} address${blocked === 1 ? " is" : "es are"} on a suppression list and cannot be used — that block is stronger than any score above it.`
          : result.note,
      });
    }

    if (action === "learn-pattern") {
      const website = typeof body.website === "string" ? body.website.trim() : "";
      if (!/^https?:\/\//i.test(website)) return NextResponse.json({ error: "learn-pattern needs the company's website URL" }, { status: 400 });
      const meter = await meterAction(auth, "search", 1);
      if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });
      const r = await learnSitePattern(website);
      return NextResponse.json({
        ...r,
        note: r.finding.pattern
          ? `${r.finding.why} Learned from ${r.readFrom.length} of their own pages. This is a convention, NOT permission to write to everybody in the building — generating an address is a separate, deliberate step and what it produces is marked inferred.`
          : r.finding.why,
      });
    }

    if (action === "hunt-company") {
      const company = typeof body.company === "string" ? body.company.trim() : "";
      if (!company) return NextResponse.json({ error: "hunt-company needs a company name" }, { status: 400 });
      const meter = await meterAction(auth, "enrich", 1);
      if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });
      const result = await huntCompany({
        company,
        town: typeof body.where === "string" ? body.where : undefined,
        trade: typeof body.what === "string" ? body.what : undefined,
        website: typeof body.website === "string" ? body.website : undefined,
        country: typeof body.country === "string" ? body.country : "GB",
        wantedTitles: Array.isArray(body.titles) ? body.titles.map((t) => String(t)) : [],
        suppressions, tenantId: brandId,
      });
      return NextResponse.json({ result, metered: meter.metered, balanceAcu: meter.balanceAcu });
    }

    const what = typeof body.what === "string" ? body.what.trim() : "";
    if (!what) return NextResponse.json({ error: "hunt needs something to look for — a trade, an industry or a company name" }, { status: 400 });
    const count = typeof body.count === "number" ? Math.min(Math.max(1, body.count), 15) : 5;
    // Charged per company READ, quoted before the run by the surface.
    const meter = await meterAction(auth, "enrich", count);
    if (!meter.allowed) return NextResponse.json({ error: meter.error, balanceAcu: meter.balanceAcu }, { status: meter.status });

    const report = await huntByCriteria({
      what,
      where: typeof body.where === "string" ? body.where : undefined,
      count,
      wantedTitles: Array.isArray(body.titles) ? body.titles.map((t) => String(t)) : [],
      country: typeof body.country === "string" ? body.country : "GB",
      suppressions, tenantId: brandId,
    });
    return NextResponse.json({ ...report, metered: meter.metered, balanceAcu: meter.balanceAcu });
  }

  if (action === "suppressed") {
    const value = typeof body.value === "string" ? body.value : "";
    const channel = body.channel === "PHONE" ? "PHONE" : "EMAIL";
    if (!value) return NextResponse.json({ error: "suppressed requires value" }, { status: 400 });
    const hit = suppressedBy(value, await listSuppressions(), { tenantId: brandId, channel });
    return NextResponse.json({
      suppressed: Boolean(hit),
      suppression: hit,
      note: hit ? "Blocked. This is checked before preview, before export and before send — three times, because a list compliant when it was built is not necessarily compliant when it is used." : "Not suppressed.",
    });
  }

  if (action === "set-policy") {
    const policy = body.policy as SourcePolicy | undefined;
    if (!policy?.domain) return NextResponse.json({ error: "set-policy requires policy.domain" }, { status: 400 });
    return NextResponse.json({ policy: await setSourcePolicy({ ...defaultPolicy(policy.domain), ...policy }, at, by) });
  }

  if (action === "outcome") {
    const sourceDomain = typeof body.sourceDomain === "string" ? body.sourceDomain : "";
    if (!sourceDomain) return NextResponse.json({ error: "outcome requires sourceDomain" }, { status: 400 });
    const stats = await recordOutcome({
      sourceDomain,
      produced: typeof body.produced === "number" ? body.produced : 0,
      bounces: typeof body.bounces === "number" ? body.bounces : 0,
      wrongNumbers: typeof body.wrongNumbers === "number" ? body.wrongNumbers : 0,
      complaints: typeof body.complaints === "number" ? body.complaints : 0,
    });
    return NextResponse.json({ stats, sources: await sourceVerdicts() });
  }

  return NextResponse.json({ error: "Unknown action — use hunt, hunt-company, lookup, learn-pattern, pattern, candidate, employment, phone, verify-email, compliance, score, gate, evidence-check, objection, suppressed, policy, set-policy, outcome or sources" }, { status: 400 });
}

export async function GET() {
  // REGISTERED BEFORE THE HEALTH IS READ. Without this the doctrine reported an
  // empty provider list — "no suppliers configured" on a platform with two —
  // because registration only happened inside the POST that used them. A status
  // block that is only correct after you have already run the thing it describes
  // is worse than no status block.
  registerBuiltInProviders();
  return NextResponse.json({
    engine: "MarketWar Contact Hunter — public B2B discovery, verification and compliant activation",
    doctrine:
      "Find the right business, find the right decision-maker, verify the route, start the conversation. Fewer contacts, fresher and defensible, rather than everything that can be scraped. Every contact carries a traceable source; an INFERRED address is never presented as a confirmed one and cannot be activated until something verifies it; a valid phone format is never called verification; conflicting employment evidence goes to a person rather than being averaged into a confident wrong title; and no score clears a legal block.",
    reuses: {
      "lead-harvest": "12-check email verification and the UK/EU/US lawful-basis decision, including PECR's corporate-subscriber distinction. Called, never reimplemented.",
      "prospecting": "ICP construction and real company discovery (live via Serper; clearly-labelled sample otherwise).",
      "enrich": "personal-provider detection, so a free-mail address is suppressed by default.",
      "robots": "robots.txt parsing, crawl-delay and per-agent rules, before any fetch.",
    },
    provenance: {
      confirmed: "A human published this value somewhere we read. There is a URL.",
      inferred: "Generated from the firm's pattern. Published nowhere. Never contactable until verified.",
      provider: "A licensed supplier asserted it. Their evidence, not ours.",
    },
    // The single-person waterfall, and what it will and will not do.
    waterfall: {
      what: "One name plus one company, through every configured supplier in cost order, inside a deadline. Free sources first — our own crawl of the company's own pages, then the UK register — because they cost nothing AND are the primary source a paid provider is selling a copy of.",
      stopsWhen: STOP_AT,
      budget: "A paid provider is called only when its price fits the ACU limit the caller set. The default limit is zero, so the free path is the default path, and a provider that was skipped for cost is named in the result rather than silently omitted.",
      chargedFor: "Only the calls that actually ran and actually returned something. A provider that timed out or found nothing is not charged for.",
      directorsAreNotBuyers:
        "A person found ONLY in the company register is returned as an officer with no department and no operational title. A registered director is a legal role about filings and liability; the person who buys things is usually not on that list. The engine will not present one as a Procurement, Commercial or Project Director until a source other than the register says so.",
      providers: providerHealth(),
      notConfigured: NOT_IMPLEMENTED,
    },
    readinessWeights: READINESS_WEIGHTS,
    readinessFormula: READINESS_WEIGHTS.map((w) => `${w.weight}% ${w.label}`).join(" + "),
    activation: {
      "85–100": "READY — controlled outreach.",
      "70–84": "REVIEW, or EMAIL_ONLY where the phone is not carrier-verified.",
      "50–69": "ENRICH — and every inferred address lands here regardless of score.",
      "below 50": "DO_NOT_ACTIVATE.",
      any: "A compliance failure, a suppression, a missing source or conflicting employment evidence is BLOCKED — a floor of zero, not a deduction.",
    },
    neverCollected: PROHIBITED_CATEGORIES,
    neverSourcedFrom: PROHIBITED_SOURCES,
    thresholds: {
      minimumPatternSample: MIN_PATTERN_SAMPLE,
      employmentStaleAfterDays: EMPLOYMENT_STALE_DAYS,
      recordStaleAfterDays: FRESHNESS_STALE_DAYS,
      sourceMinimumSample: MIN_QUALITY_SAMPLE,
      maxBounceRate: MAX_BOUNCE_RATE,
      maxComplaintRate: MAX_COMPLAINT_RATE,
      maxWrongNumberRate: MAX_WRONG_NUMBER_RATE,
    },
    unreviewedSourcePolicy: "A domain nobody has reviewed permits nothing. Unreviewed is not permission.",
    actions: ["hunt", "hunt-company", "learn-pattern", "pattern", "candidate", "employment", "phone", "verify-email", "compliance", "score", "gate", "evidence-check", "objection", "suppressed", "policy", "set-policy", "outcome", "sources"],
    demo: demoContactHunter(),
  });
}
