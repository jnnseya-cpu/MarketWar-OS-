import { NextRequest, NextResponse } from "next/server";
import {
  EARN_ACTIONS, MISSION_KINDS, createMission, listMissions, listEarnings,
  walletFrom, trustSignals, creatorScore, squadTotals, earningOutlook,
  worstCasePence, ladderIsSane, SHARE2EARN_DOCTRINE, DISCLOSURE, HOLD_DAYS,
  MIN_ACTIONS_TO_SCORE, MAX_SQUAD_MEMBERS,
  netEligibleValue, saleCommissionPence, productEligible, XP_RULES, LEVELS, levelFor, XP_DOCTRINE,
  recordEarning, brandEarnings, type Earning,
  type MissionKind, type Reward, type EarnActionId,
} from "@/backend/share2earn";
import { COMMISSION_BANDS, ratePct, SHARE2EARN_RATE, SHARE2EARN_RATE_CAP } from "@/shared/creator-program";
import {
  economicsFor, waterfall, campaignLimits, killSwitch, tuneCommission, measuredLift,
  campaignProfit, classifyCustomer, rewardFor, settlementState, FUNDING_MODES,
  DEFAULT_CLASS_POLICY, PROFIT_GUARD_DOCTRINE, type OfferEconomics,
  rewardCapacity, allowedRate, splitCapacity, canCommit, capacityFromTransaction,
  GROWTHGUARD_CEILING, GROWTHGUARD_DOCTRINE, CAPACITY_SPLIT,
} from "@/backend/profit-guard-economics";
import {
  PAYOUT_RAILS, railsForCountry, railConfigured, quoteWithdrawal, taxPosition,
  PAYOUT_DOCTRINE, ADMIN_FEE_RATE, ADMIN_FEE_BASIS,
} from "@/backend/payout-fees";
import {
  submitIdentity, saveIdentity, loadIdentity, payoutAllowed, markVerified, markScreened,
  reportRow, identityProviderConfigured, sanctionsScreeningConfigured, IDENTITY_DOCTRINE,
} from "@/backend/payout-identity";
import { executePayout, listAttempts, paidOutPence, liveRails, EXECUTE_DOCTRINE } from "@/backend/payout-execute";
import {
  brandLiability, approvalQueue, disputeEarning, releaseEarly, withhold,
  saveDispute, listDisputes, DISPUTE_REASONS, DISPUTE_WINDOW_DAYS, APPROVALS_DOCTRINE,
} from "@/backend/payout-approvals";
import {
  PROMOTION_MODES, PROMOTION_DOCTRINE, catalogue, openCatalogue, setPolicy, saveProduct,
  getProduct, getPolicy, claimProduct, promotionDecision, discoverable, setProductPaused, deleteProduct, claimableProgrammes,
} from "@/backend/promotable";
import { joinShare2Earn, JOIN_DOCTRINE, bandFor } from "@/backend/share2earn-signup";
import { getCreator, getCreatorByToken, listSubscriptions, getProgramme, subscribe } from "@/backend/creator-engine";
import { SIGNUP_DOORS, UPGRADE_PATH } from "@/shared/creator-program";
import { getBrandById } from "@/backend/brand-store";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";

// MarketWar SHARE2EARN™ — post, move your audience, earn.
//
// GET                          → the ladder, the ways to earn, the mission kinds
// GET  ?brandId=…              → that brand's missions
// GET  ?creatorId=…            → that creator's wallet, score and trust signals
// POST { action: "mission" }   → a brand publishes a funded mission
// POST { action: "outlook" }   → what a mission could pay THIS creator
// POST { action: "trust" }     → run the fraud checks against supplied counts
//
// NOT METERED. Publishing a mission and reading a wallet are arithmetic over
// data the customer already owns; no provider is called. The money in this
// module is the brand's payout budget, not ACUs.
//
// THE LADDER IS CHECKED BEFORE ANYTHING ELSE. If SHARE2EARN were ever configured
// to pay more than the influencer programme it sits beneath, every write here
// refuses rather than quietly paying the wrong rate — the rate is derived so
// that should be impossible, and this is the belt to that pair of braces.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KINDS = MISSION_KINDS.map((k) => k.id);
const ACTION_IDS = EARN_ACTIONS.map((a) => a.id);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const brandId = (url.searchParams.get("brandId") || "").trim();
  const creatorId = (url.searchParams.get("creatorId") || "").trim();
  const promotable = (url.searchParams.get("promotable") || "").trim();

  // Cross-brand discovery: everything claimable anywhere, in the public shape.
  // A catalogue nobody can find is a catalogue nobody claims from.
  if (url.searchParams.get("discover")) {
    const brands = await discoverable();
    return NextResponse.json({
      brands,
      claimable: brands.reduce((n, b) => n + b.products.length + b.programmes.length, 0),
      claimableProducts: brands.reduce((n, b) => n + b.products.length, 0),
      claimableProgrammes: brands.reduce((n, b) => n + b.programmes.length, 0),
      doors: SIGNUP_DOORS,
      doctrine: PROMOTION_DOCTRINE,
    });
  }

  // What a creator may browse: only the products this brand has opened AND the
  // margin can fund, and never the brand's costs. Public on purpose — a
  // catalogue a creator has to sign in to browse is a catalogue nobody browses.
  if (promotable) {
    const nowISO = new Date().toISOString();
    const policy = await getPolicy(promotable, nowISO);
    return NextResponse.json({
      mode: policy.mode,
      products: await openCatalogue(promotable, nowISO),
      // Programmes the brand created by hand. Three of this brand's four were
      // reachable before this: the auto-minted ones have product cards, and the
      // one somebody typed in had nothing behind it and was invisible.
      programmes: await claimableProgrammes(promotable, policy),
      doctrine: PROMOTION_DOCTRINE,
      note: policy.mode === "mission_only"
        ? "This brand promotes by mission only — there is no self-serve catalogue here. Its missions carry the reward and the funded budget."
        : "Everything listed is claimable right now. Claim one and you get a tracked link to the brand's own page.",
    });
  }

  if (!brandId && !creatorId) {
    return NextResponse.json({
      bands: COMMISSION_BANDS.map((b) => ({ ...b, creatorPct: ratePct(b.creatorRate), totalPct: ratePct(b.totalRate) })),
      rate: ratePct(SHARE2EARN_RATE),
      cap: ratePct(SHARE2EARN_RATE_CAP),
      actions: EARN_ACTIONS,
      missionKinds: MISSION_KINDS,
      holdDays: HOLD_DAYS,
      minActionsToScore: MIN_ACTIONS_TO_SCORE,
      maxSquadMembers: MAX_SQUAD_MEMBERS,
      xp: { rules: XP_RULES, levels: LEVELS, doctrine: XP_DOCTRINE },
      doctrine: SHARE2EARN_DOCTRINE,
      profitGuard: PROFIT_GUARD_DOCTRINE,
      growthGuard: { ceiling: GROWTHGUARD_CEILING, split: CAPACITY_SPLIT, doctrine: GROWTHGUARD_DOCTRINE },
      fundingModes: FUNDING_MODES,
      customerClasses: DEFAULT_CLASS_POLICY,
      payouts: {
        rails: PAYOUT_RAILS.map(({ envKey, ...r }) => ({ ...r, live: railConfigured({ ...r, envKey } as never) })),
        adminFeeRate: ADMIN_FEE_RATE, adminFeeBasis: ADMIN_FEE_BASIS,
        doctrine: PAYOUT_DOCTRINE,
        live: liveRails(),
        identityProvider: identityProviderConfigured(),
        sanctionsScreening: sanctionsScreeningConfigured(),
        identityDoctrine: IDENTITY_DOCTRINE,
        executeDoctrine: EXECUTE_DOCTRINE,
      },
      approvals: { reasons: DISPUTE_REASONS, windowDays: DISPUTE_WINDOW_DAYS, doctrine: APPROVALS_DOCTRINE },
      signup: { doors: SIGNUP_DOORS, upgradePath: UPGRADE_PATH, doctrine: JOIN_DOCTRINE },
      promotion: { modes: PROMOTION_MODES, doctrine: PROMOTION_DOCTRINE },
      disclosure: DISCLOSURE,
      ladder: ladderIsSane(),
    });
  }

  if (brandId) {
    const access = await resolveBrandAccess(req, brandId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    return NextResponse.json({ missions: await listMissions(brandId), disclosure: DISCLOSURE });
  }

  // A creator reads their OWN wallet. The id is taken from the session, never
  // from the query string — otherwise anyone could read anyone's earnings by
  // guessing an id.
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.enforced && auth.uid && auth.uid !== creatorId) {
    return NextResponse.json({ error: "You can only read your own earnings." }, { status: 403 });
  }
  const nowISO = new Date().toISOString();
  const earnings = await listEarnings(creatorId);
  return NextResponse.json({
    wallet: walletFrom(earnings, nowISO),
    earnings: earnings.slice(0, 100),
    holdDays: HOLD_DAYS,
    doctrine: SHARE2EARN_DOCTRINE,
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "share2earn"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const sane = ladderIsSane();
  if (!sane.ok) return NextResponse.json({ error: sane.reason }, { status: 500 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const num = (k: string) => (typeof body[k] === "number" && Number.isFinite(body[k] as number) ? (body[k] as number) : 0);
  const action = str("action") || "mission";
  const nowISO = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // JOIN — the public door. No auth, because requiring an account to get an
  // account is the gate SHARE2EARN says it does not have. Tighter rate limit
  // than the rest of the route: it writes an account and it is unauthenticated.
  // ---------------------------------------------------------------------------
  if (action === "join") {
    const jl = rateLimit(clientKey(req, "share2earn-join"), 10, 60_000, Date.now());
    if (!jl.ok) return NextResponse.json({ error: "Too many attempts — try again shortly." }, { status: 429, headers: { "Retry-After": String(jl.retryAfterSec) } });
    const res = await joinShare2Earn({ name: str("name"), email: str("email"), nowISO });
    if (!res.ok) return NextResponse.json({ error: res.error, field: res.field }, { status: 400 });
    return NextResponse.json({ ...res, doors: SIGNUP_DOORS, upgradePath: UPGRADE_PATH, disclosure: DISCLOSURE });
  }

  if (action === "trust") {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    return NextResponse.json(trustSignals({
      creatorId: str("creatorId"),
      clicks: num("clicks"), distinctVisitors: num("distinctVisitors"),
      selfPurchases: num("selfPurchases"), conversions: num("conversions"),
      sharedDeviceAccounts: num("sharedDeviceAccounts"),
      postsSubmitted: num("postsSubmitted"), postsStillLive: num("postsStillLive"),
      accountAgeDays: num("accountAgeDays"),
    }));
  }

  if (action === "score") {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    return NextResponse.json(creatorScore({
      clicks: num("clicks"), conversions: num("conversions"), leads: num("leads"),
      missionsAccepted: num("missionsAccepted"), missionsCompleted: num("missionsCompleted"),
      postsSubmitted: num("postsSubmitted"), postsStillLive: num("postsStillLive"),
    }));
  }

  // Identity and the withdrawal itself belong to the CREATOR. The id comes from
  // the session and never from the body — otherwise anyone could submit an
  // identity for, or withdraw against, somebody else's account.
  if (action === "identity" || action === "withdraw" || action === "payout-history") {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const me = auth.uid || str("creatorId");
    if (!me) return NextResponse.json({ error: "No creator identity on this session." }, { status: 401 });
    if (auth.enforced && auth.uid && str("creatorId") && str("creatorId") !== auth.uid) {
      return NextResponse.json({ error: "You can only act on your own account." }, { status: 403 });
    }

    if (action === "identity") {
      const res = submitIdentity({
        creatorId: me,
        legalName: str("legalName"), dateOfBirth: str("dateOfBirth"),
        addressLine: str("addressLine"), city: str("city"), postcode: str("postcode"),
        country: str("country"),
        taxReference: str("taxReference") || undefined,
        noTaxReferenceReason: str("noTaxReferenceReason") || undefined,
        nowISO,
      });
      if (!res.ok) return NextResponse.json({ error: res.error, field: res.field }, { status: 400 });
      await saveIdentity(res.identity);
      return NextResponse.json({
        // The tax reference is never echoed back — it went in, it does not come out.
        state: res.identity.state,
        gate: payoutAllowed(res.identity),
        note: res.note,
        doctrine: IDENTITY_DOCTRINE,
      });
    }

    if (action === "payout-history") {
      return NextResponse.json({
        attempts: await listAttempts(me),
        paidOutPence: await paidOutPence(me),
        gate: payoutAllowed(await loadIdentity(me)),
      });
    }

    const out = await executePayout({
      creatorId: me,
      railId: str("railId"),
      amountPence: Math.max(0, Math.round(num("amountPence"))),
      requestId: str("requestId"),
      country: str("country") || undefined,
      availablePence: Math.max(0, Math.round(num("availablePence"))),
      destination: str("destination"),
      nowISO,
    });
    return NextResponse.json(out, { status: out.ok ? 200 : 400 });
  }

  // ---------------------------------------------------------------------------
  // CLAIM — a creator takes a tracked link for a product they chose themselves.
  //
  // The creator is the session, never the body: a claim mints a code that money
  // gets attributed to, so letting the browser name the earner would let anyone
  // put their promotion in somebody else's name. The decision is recomputed
  // server-side from the product and the brand's current policy — what the
  // browser saw is not evidence of what is allowed now.
  // ---------------------------------------------------------------------------
  if (action === "claim" || action === "my-links") {
    // Two ways to prove who you are, ONE thing they prove. A platform session
    // (the dashboard) or the partner's own access token (the link they were
    // issued, which is a bearer credential to exactly this account). Whichever
    // it is, the creator id comes from the credential and never from the body.
    let me = "";
    const token = str("token");
    if (token) {
      const holder = await getCreatorByToken(token);
      if (!holder) return NextResponse.json({ error: "That partner link is not valid." }, { status: 401 });
      me = holder.id;
    } else {
      const auth = await requireAuth(req);
      if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
      me = auth.uid || str("creatorId");
    }
    if (!me) return NextResponse.json({ error: "No creator identity on this session." }, { status: 401 });

    if (action === "my-links") {
      const account = await getCreator(me);
      return NextResponse.json({
        band: bandFor(account),
        links: await listSubscriptions(me),
        upgradePath: UPGRADE_PATH,
      });
    }

    // JOIN A PROGRAMME the brand created by hand. Same identity rules as a
    // product claim — the creator comes from the credential, never the body.
    if (str("programmeId")) {
      const prog = await getProgramme(str("programmeId"));
      if (!prog || prog.active === false) return NextResponse.json({ error: "That programme is not open." }, { status: 404 });
      const policy = await getPolicy(prog.brandId, nowISO);
      const open = await claimableProgrammes(prog.brandId, policy);
      // Re-derived rather than trusted: a programme id posted straight at this
      // route must pass the same gate the listing applied.
      if (!open.some((x) => x.id === prog.id)) {
        return NextResponse.json({ error: "That programme is not open to self-serve joining. Its brand promotes by mission, or the programme has no destination set." }, { status: 403 });
      }
      const sub = await subscribe(me, prog.id, nowISO);
      if (!sub.subscription) return NextResponse.json({ error: sub.error || "Could not issue a tracked code." }, { status: 400 });
      return NextResponse.json({ ok: true, subscription: sub.subscription, programme: { id: prog.id, name: prog.name, brandName: prog.brandName } });
    }

    const product = await getProduct(str("productId"));
    if (!product) return NextResponse.json({ error: "No such product." }, { status: 404 });
    const policy = await getPolicy(product.brandId, nowISO);
    const brand = await getBrandById(product.brandId);
    const res = await claimProduct({
      creatorId: me, product, policy,
      brandName: brand?.name || product.brandId,
      nowISO,
    });
    if (!res.ok) return NextResponse.json({ error: res.error, hint: res.hint }, { status: 400 });
    return NextResponse.json({ ...res, disclosure: DISCLOSURE });
  }

  // Administrator actions on somebody else's identity. Platform admin only, and
  // the administrator's own id is recorded against the decision.
  if (action === "verify-identity" || action === "screen-identity") {
    const auth = await requireAuth(req, { scope: "platform_admin" });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const target = str("creatorId");
    if (!target) return NextResponse.json({ error: "creatorId required" }, { status: 400 });
    const done = action === "verify-identity"
      ? await markVerified(target, auth.uid || "admin", nowISO, str("verificationRef") || undefined)
      : await markScreened(target, body.clear === true, nowISO, str("reason") || undefined);
    if (!done) return NextResponse.json({ error: "No identity on record for that creator." }, { status: 404 });
    return NextResponse.json({ ok: true, gate: payoutAllowed(await loadIdentity(target)) });
  }

  // The annual report row — platform admin only; it contains another person's details.
  if (action === "tax-report") {
    const auth = await requireAuth(req, { scope: "platform_admin" });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const identity = await loadIdentity(str("creatorId"));
    if (!identity) return NextResponse.json({ error: "No identity on record for that creator." }, { status: 404 });
    return NextResponse.json({
      row: reportRow(identity, {
        earnedPence: Math.max(0, Math.round(num("earnedPence"))),
        payoutsPence: await paidOutPence(identity.creatorId),
        feesPence: Math.max(0, Math.round(num("feesPence"))),
      }),
      note: "The creator receives a copy of exactly this. A figure filed about somebody that they cannot see is how disputes start.",
    });
  }

  // Withdrawals belong to the CREATOR, not to a brand. Session identity only —
  // a creatorId in the body would let anyone quote against anyone's balance.
  if (action === "withdraw-quote" || action === "tax") {
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const country = str("country");

    if (action === "tax") {
      return NextResponse.json(taxPosition({
        earnedThisYearPence: Math.max(0, Math.round(num("earnedThisYearPence"))),
        country: country || undefined,
      }));
    }

    const amount = Math.max(0, Math.round(num("amountPence")));
    const quote = quoteWithdrawal({ railId: str("railId"), amountPence: amount, country: country || undefined });
    return NextResponse.json({
      quote,
      rails: railsForCountry(country).map(({ envKey, ...r }) => ({ ...r, live: railConfigured({ ...r, envKey } as never) })),
      doctrine: PAYOUT_DOCTRINE,
    }, { status: quote.ok ? 200 : 400 });
  }

  // Everything below belongs to a brand.
  const brandId = str("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  // ---------------------------------------------------------------------------
  // The brand decides WHAT can be promoted: the mode, and the products.
  //
  // `catalogue` is the brand's own view — it includes the products that fail,
  // and why, because "why can nobody promote this one" is the question a brand
  // actually has. It carries the offer economics, which is why it is behind
  // brand access and the creator-facing GET is a different, narrower shape.
  // ---------------------------------------------------------------------------
  if (action === "promotion-mode") {
    const policy = await setPolicy({
      brandId,
      mode: str("mode") as never,
      defaultDestinationUrl: str("defaultDestinationUrl") || undefined,
      survivalFloorPct: typeof body.survivalFloorPct === "number" ? body.survivalFloorPct : undefined,
      nowISO,
    });
    void policy;
    return NextResponse.json({ modes: PROMOTION_MODES, doctrine: PROMOTION_DOCTRINE, ...(await catalogue(brandId, nowISO)) });
  }

  // PAUSE / RESUME one product. Stops new claims; never touches a link already
  // issued, nor commission already earned.
  if (action === "pause-product") {
    const product = await setProductPaused({ brandId, productId: str("productId"), paused: body.paused !== false, nowISO });
    if (!product) return NextResponse.json({ error: "That product is not in this brand's catalogue." }, { status: 404 });
    const policy = await getPolicy(brandId, nowISO);
    return NextResponse.json({
      product,
      decision: promotionDecision(product, policy),
      note: product.paused
        ? "Paused. Nobody new can claim it; tracked links already out there still work and nothing earned is affected."
        : "Back in the catalogue — creators can claim it again.",
    });
  }

  if (action === "delete-product") {
    const res = await deleteProduct({ brandId, productId: str("productId") });
    // 409, not 400: the request is well formed and the state refuses it.
    if (!res.ok) return NextResponse.json({ ...res, canPauseInstead: true }, { status: res.claimed ? 409 : 404 });
    return NextResponse.json({ ...res, ...(await catalogue(brandId, nowISO)) });
  }

  if (action === "catalogue") {
    return NextResponse.json({ ...(await catalogue(brandId, nowISO)), modes: PROMOTION_MODES, doctrine: PROMOTION_DOCTRINE });
  }

  if (action === "product") {
    const offer = parseOffer(body.offer);
    if (!offer) return NextResponse.json({ error: "A product needs its economics — price at minimum. Without them nobody can say whether it can carry a commission." }, { status: 400 });
    const name = str("name");
    if (!name) return NextResponse.json({ error: "A product needs a name — it is what a creator picks from a list." }, { status: 400 });
    const product = await saveProduct({
      brandId, name, url: str("url"), offer,
      promotable: body.promotable !== false,
      excludedReason: str("excludedReason") || undefined,
      nowISO,
    });
    const policy = await getPolicy(brandId, nowISO);
    return NextResponse.json({ product, decision: promotionDecision(product, policy), policy });
  }

  // ProfitGuard: what can this offer actually afford?
  if (action === "economics") {
    const offer = parseOffer(body.offer);
    if (!offer) return NextResponse.json({ error: "An `offer` with at least a price is required." }, { status: 400 });
    const e = economicsFor(offer);
    const limits = campaignLimits(e, {
      targetCustomers: Math.max(1, Math.round(num("targetCustomers") || 1)),
      leadToSaleRate: typeof body.leadToSaleRate === "number" ? body.leadToSaleRate : undefined,
    });
    return NextResponse.json({ economics: e, limits, doctrine: PROFIT_GUARD_DOCTRINE });
  }

  if (action === "waterfall") {
    const offer = parseOffer(body.offer);
    if (!offer) return NextResponse.json({ error: "An `offer` with at least a price is required." }, { status: 400 });
    const a = (body.allocation || {}) as Record<string, unknown>;
    const flow = waterfall(offer, {
      creatorPence: Math.max(0, Math.round(Number(a.creatorPence) || 0)),
      platformPence: Math.max(0, Math.round(Number(a.platformPence) || 0)),
      reservePence: Math.max(0, Math.round(Number(a.reservePence) || 0)),
      squadPence: Math.max(0, Math.round(Number(a.squadPence) || 0)),
    });
    return NextResponse.json(flow, { status: flow.ok ? 200 : 400 });
  }

  if (action === "health") {
    const offer = parseOffer(body.offer);
    if (!offer) return NextResponse.json({ error: "An `offer` with at least a price is required." }, { status: 400 });
    const e = economicsFor(offer);
    const limits = campaignLimits(e, { targetCustomers: Math.max(1, Math.round(num("targetCustomers") || 1)) });
    const h = (body.health || {}) as Record<string, unknown>;
    const health = {
      spendPence: Math.max(0, Number(h.spendPence) || 0), revenuePence: Math.max(0, Number(h.revenuePence) || 0),
      customers: Math.max(0, Number(h.customers) || 0), leads: Math.max(0, Number(h.leads) || 0),
      refundRatePct: Math.max(0, Number(h.refundRatePct) || 0), fraudRatePct: Math.max(0, Number(h.fraudRatePct) || 0),
      budgetPence: Math.max(0, Number(h.budgetPence) || 0),
      conversionRateNow: typeof h.conversionRateNow === "number" ? h.conversionRateNow : undefined,
      conversionRateBaseline: typeof h.conversionRateBaseline === "number" ? h.conversionRateBaseline : undefined,
    };
    const lift = body.holdout && typeof body.holdout === "object"
      ? measuredLift(body.holdout as { exposed: number; exposedSales: number; holdout: number; holdoutSales: number })
      : measuredLift({ exposed: 0, exposedSales: health.customers, holdout: 0, holdoutSales: 0 });
    return NextResponse.json({
      killSwitch: killSwitch(e, health, limits),
      tuning: tuneCommission({
        currentRewardPence: Math.max(0, Math.round(num("currentRewardPence"))),
        limits, conversions: health.customers, spendPence: health.spendPence,
      }),
      lift,
      profit: campaignProfit({
        economics: e, customers: health.customers, revenuePence: health.revenuePence,
        creatorPayoutsPence: Math.max(0, Math.round(num("creatorPayoutsPence"))),
        platformFeePence: Math.max(0, Math.round(num("platformFeePence"))),
        lift,
      }),
    });
  }

  if (action === "classify") {
    const cls = classifyCustomer({
      hasPurchasedBefore: body.hasPurchasedBefore === true,
      daysSinceLastPurchase: typeof body.daysSinceLastPurchase === "number" ? body.daysSinceLastPurchase : null,
      cameViaCreatorLink: body.cameViaCreatorLink !== false,
      buyerMatchesCreator: body.buyerMatchesCreator === true,
    });
    const base = Math.max(0, Math.round(num("baseRewardPence")));
    const r = rewardFor(base, cls);
    const mode = FUNDING_MODES.find((f) => f.mode === str("fundingMode")) || FUNDING_MODES[0];
    return NextResponse.json({
      customerClass: cls, rewardPence: r.pence, policy: r.policy,
      settlement: settlementState({
        policy: mode, paidAt: str("paidAt") || null,
        refunded: body.refunded === true, chargedBack: body.chargedBack === true, nowISO,
      }),
    });
  }

  // GrowthGuard — what the module is allowed to owe right now.
  if (action === "capacity") {
    const offer = parseOffer(body.offer);
    if (!offer) return NextResponse.json({ error: "An `offer` with at least a price is required." }, { status: 400 });
    const e = economicsFor(offer);
    const floor = typeof body.survivalFloorPct === "number" ? body.survivalFloorPct : undefined;
    const lift = body.holdout && typeof body.holdout === "object"
      ? measuredLift(body.holdout as { exposed: number; exposedSales: number; holdout: number; holdoutSales: number })
      : undefined;
    const capacity = rewardCapacity({
      e,
      verifiedContributionPence: Math.max(0, Math.round(num("verifiedContributionPence"))),
      verifiedRevenuePence: Math.max(0, Math.round(num("verifiedRevenuePence"))) || undefined,
      committedPence: Math.max(0, Math.round(num("committedPence"))),
      survivalFloorPct: floor,
      lift,
    });
    const want = Math.max(0, Math.round(num("wantPence")));
    return NextResponse.json({
      capacity,
      rate: allowedRate(e, floor),
      split: splitCapacity(capacity.availablePence),
      perTransaction: capacityFromTransaction(e, floor),
      commit: want > 0 ? canCommit(capacity, want) : null,
      ceiling: GROWTHGUARD_CEILING,
      doctrine: GROWTHGUARD_DOCTRINE,
    });
  }

  // One sale, end to end: what is commissionable, whether the product qualifies,
  // and what the creator earns.
  if (action === "sale") {
    const lines = (body.sale || {}) as Record<string, unknown>;
    const n = (k: string) => Math.max(0, Math.round(Number(lines[k]) || 0));
    const value = netEligibleValue({
      checkoutTotalPence: n("checkoutTotalPence"), productPence: n("productPence"),
      taxPence: n("taxPence"), deliveryPence: n("deliveryPence"), tipPence: n("tipPence"),
      giftCardPence: n("giftCardPence"), otherExcludedPence: n("otherExcludedPence"),
      refundedPence: n("refundedPence"), cancelled: lines.cancelled === true,
    });
    const offer = parseOffer(body.offer);
    if (!offer) {
      return NextResponse.json({
        value, commissionPence: saleCommissionPence(value.eligiblePence),
        note: "Supply the offer's economics to check whether this product is eligible at all — a commission that the margin cannot fund is refused rather than reduced.",
      });
    }
    const e = economicsFor(offer);
    const allowance = capacityFromTransaction(e, typeof body.survivalFloorPct === "number" ? body.survivalFloorPct : undefined);
    const eligibility = productEligible({
      eligiblePence: value.eligiblePence,
      contributionPence: e.contributionPence,
      growthPoolPence: e.growthPoolPence,
      growthGuardAllowancePence: allowance.pence,
    });
    return NextResponse.json({ value, eligibility, economics: e, allowance });
  }

  // The brand's side: what it owes, and the only two things it may do about it.
  if (action === "liability" || action === "queue") {
    const earnings = Array.isArray(body.earnings) ? (body.earnings as Earning[]) : await brandEarnings(brandId);
    return NextResponse.json(action === "liability"
      ? { liability: brandLiability(brandId, earnings, nowISO), disputes: await listDisputes(brandId), doctrine: APPROVALS_DOCTRINE }
      : { ...approvalQueue(brandId, earnings, nowISO), reasons: DISPUTE_REASONS, windowDays: DISPUTE_WINDOW_DAYS });
  }

  if (action === "dispute" || action === "release-early") {
    const earning = body.earning as Earning | undefined;
    if (!earning || typeof earning !== "object" || !earning.id) {
      return NextResponse.json({ error: "The earning to act on is required." }, { status: 400 });
    }
    const actor = access.uid || "brand";
    const res = action === "dispute"
      ? disputeEarning({ brandId, earning, reason: str("reason"), note: str("note"), actor, nowISO })
      : releaseEarly({ brandId, earning, actor, nowISO });
    if (!res.ok) return NextResponse.json({ error: res.error, hint: res.hint }, { status: 400 });
    await saveDispute(res.record);
    await recordEarning(res.earning);
    return NextResponse.json({ earning: res.earning, record: res.record, note: res.note });
  }

  // Reaching for "just hold it" has to go through the refusal and read why not.
  if (action === "withhold") {
    return NextResponse.json(withhold(), { status: 400 });
  }

  if (action === "quote") {
    // What would this mission cost at worst? Answerable before publishing, so a
    // brand is never surprised by its own offer.
    const rewards = parseRewards(body.rewards);
    const creators = Math.max(1, Math.round(num("expectedCreators") || 1));
    return NextResponse.json({
      worstCasePence: worstCasePence(rewards, creators),
      perCreatorPence: worstCasePence(rewards, 1),
      expectedCreators: creators,
      note: "The worst case is what every creator earning every reward would cost. It is what gets reserved, because a bounty on the card is a debt.",
    });
  }

  if (action === "outlook") {
    const missions = await listMissions(brandId);
    const m = missions.find((x) => x.id === str("missionId"));
    if (!m) return NextResponse.json({ error: "No such mission." }, { status: 404 });
    const hist = body.history && typeof body.history === "object"
      ? body.history as { clicks: number; conversions: number; missionsCompleted: number }
      : null;
    return NextResponse.json(earningOutlook(m, hist));
  }

  if (action === "squad") {
    const members = Array.isArray(body.members) ? body.members as { creatorId: string }[] : [];
    if (members.length > MAX_SQUAD_MEMBERS) return NextResponse.json({ error: `A squad holds at most ${MAX_SQUAD_MEMBERS}.` }, { status: 400 });
    const loaded = await Promise.all(members.map(async (m) => ({ creatorId: m.creatorId, earnings: await listEarnings(m.creatorId) })));
    return NextResponse.json(squadTotals(loaded, nowISO));
  }

  if (action !== "mission") return NextResponse.json({ error: "Unknown action — use mission, quote, outlook, squad, trust or score." }, { status: 400 });

  const kind = KINDS.includes(str("kind") as MissionKind) ? (str("kind") as MissionKind) : "share_and_earn";
  const res = await createMission({
    brandId, kind,
    title: str("title"), brief: str("brief"),
    platforms: Array.isArray(body.platforms) ? (body.platforms as unknown[]).filter((p): p is string => typeof p === "string") : [],
    rewards: parseRewards(body.rewards),
    budgetPence: Math.max(0, Math.round(num("budgetPence"))),
    expectedCreators: Math.max(1, Math.round(num("expectedCreators") || 1)),
    offer: parseOffer(body.offer) || undefined,
    fundingMode: str("fundingMode") === "prepaid" ? "prepaid" : undefined,
    opensAt: str("opensAt") || nowISO,
    closesAt: str("closesAt") || new Date(Date.now() + 7 * 86_400_000).toISOString(),
    nowISO,
  });
  if (!res.ok) return NextResponse.json({ error: res.error, hint: res.hint }, { status: 400 });
  return NextResponse.json({ mission: res.mission, note: res.note, disclosure: DISCLOSURE, charged: false });
}

function parseRewards(raw: unknown): Reward[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .filter((r) => ACTION_IDS.includes(r.actionId as EarnActionId))
    .map((r) => ({
      actionId: r.actionId as EarnActionId,
      units: Math.max(0, Math.round(Number(r.units) || 0)),
      pencePerUnit: typeof r.pencePerUnit === "number" ? Math.max(0, Math.round(r.pencePerUnit)) : undefined,
      bonusPence: typeof r.bonusPence === "number" ? Math.max(0, Math.round(r.bonusPence)) : undefined,
      label: typeof r.label === "string" ? r.label.slice(0, 120) : "",
    }));
}

function parseOffer(raw: unknown): OfferEconomics | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const n = (k: string) => Math.max(0, Math.round(Number(o[k]) || 0));
  if (n("pricePence") <= 0) return null;
  return {
    pricePence: n("pricePence"), cogsPence: n("cogsPence"), fulfilmentPence: n("fulfilmentPence"),
    paymentFeePence: n("paymentFeePence"), taxPence: n("taxPence"),
    returnsAllowancePct: Math.max(0, Math.min(100, Number(o.returnsAllowancePct) || 0)),
    otherVariablePence: n("otherVariablePence"),
    minProtectedMarginPence: o.minProtectedMarginPence != null ? n("minProtectedMarginPence") : undefined,
    minProtectedMarginPct: typeof o.minProtectedMarginPct === "number" ? o.minProtectedMarginPct : undefined,
    ltvMultiple: typeof o.ltvMultiple === "number" ? o.ltvMultiple : undefined,
  };
}
