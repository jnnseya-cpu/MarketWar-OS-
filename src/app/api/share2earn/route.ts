import { NextRequest, NextResponse } from "next/server";
import {
  EARN_ACTIONS, MISSION_KINDS, createMission, listMissions, listEarnings,
  walletFrom, trustSignals, creatorScore, squadTotals, earningOutlook,
  worstCasePence, ladderIsSane, SHARE2EARN_DOCTRINE, DISCLOSURE, HOLD_DAYS,
  MIN_ACTIONS_TO_SCORE, MAX_SQUAD_MEMBERS,
  type MissionKind, type Reward, type EarnActionId,
} from "@/backend/share2earn";
import { COMMISSION_BANDS, ratePct, SHARE2EARN_RATE, SHARE2EARN_RATE_CAP } from "@/shared/creator-program";
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
      doctrine: SHARE2EARN_DOCTRINE,
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

  // Everything below belongs to a brand.
  const brandId = str("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

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
