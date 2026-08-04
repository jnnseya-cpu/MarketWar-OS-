import { NextRequest, NextResponse } from "next/server";
import { HUBS, hubCoverage, hubRoutes } from "@/backend/genz-hubs";
import { playState, ALL_DEED_KINDS, VERIFIED_ONLY, type Deed, type DeedKind } from "@/backend/missions";
import { listWork } from "@/backend/work-library";
import { listVideoJobs } from "@/backend/video-jobs";
import { listEvents } from "@/backend/ledger";
import { listContacts } from "@/backend/contacts";
import { listAsks } from "@/backend/review-asks";
import { brandEvents } from "@/backend/email-events";
import { resolveBrandAccess } from "@/backend/brand-access";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";

// The Gen-Z Growth Layer — six hubs, and the Play board behind them.
//
// GET                                  → the six hubs and their coverage
// POST { action: "play", brandId, timezone? } → today's challenges, XP, streak,
//                                               badges and money missions
//
// NOT METERED, deliberately and consistently. §63 meters every AI ACTION; this
// route runs no model and produces nothing new — it counts work the customer
// already paid for when they did it. Charging to look at your own scoreboard
// would be charging twice, and the other read-only surfaces (`/api/results`,
// `/api/roi`, `/api/command-summary`) are unmetered for the same reason.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Which deed kinds this platform can currently OBSERVE — now all nine.
//
// It was seven. Prospect outreach had no per-contact record and review requests
// were drafted but never logged, so two of the five daily tracks were filtered
// off the board entirely. Both have a ledger behind them now: a review-request
// deed is one entry in the ask ledger, and an outreach deed is one message that
// actually reached one person. The filtering machinery stays — a deed kind that
// stops being observable must still drop off the board rather than sit at zero.
const TRACKABLE: DeedKind[] = ["content", "video", "page", "email", "outreach", "review-request", "customer", "research", "sale"];

async function deedsFor(brandId: string): Promise<Deed[]> {
  const [work, jobs, revenue, contacts, asks, mail] = await Promise.all([
    listWork(brandId).catch(() => []),
    listVideoJobs(brandId).catch(() => []),
    listEvents(brandId).catch(() => []),
    listContacts(brandId).catch(() => []),
    listAsks(brandId).catch(() => []),
    brandEvents(brandId).catch(() => []),
  ]);

  const deeds: Deed[] = [];

  // The Work Library records what was made and when. Its kinds map onto deeds
  // directly except "agent" and "other", which are too vague to count as a
  // specific challenge — they are dropped rather than counted as content.
  const WORK_MAP: Record<string, DeedKind | null> = {
    content: "content", campaign: "content", email: "email",
    page: "page", research: "research", agent: null, other: null,
  };
  for (const w of work) {
    const k = WORK_MAP[String(w.kind || "")];
    if (k && w.createdAt) deeds.push({ kind: k, at: w.createdAt });
  }

  // A video counts when it is DONE. A queued render is an intention.
  for (const j of jobs) {
    if (j.status === "done") deeds.push({ kind: "video", at: j.finishedAt || j.createdAt });
  }

  // Only orders and sales count as a sale. A "lead" event carries £0 and
  // counting it would let a mission called "Make £100" complete on nothing.
  for (const e of revenue) {
    if (e.type !== "order" && e.type !== "sale") continue;
    if (e.at) deeds.push({ kind: "sale", at: e.at, valueGbp: Math.max(0, e.amountGbp || 0) });
  }

  for (const c of contacts) {
    if (c.importedAt) deeds.push({ kind: "customer", at: c.importedAt });
  }

  // One ask, one deed — including the ones sent by hand over WhatsApp, because
  // a message the customer sent on Tuesday still asked somebody on Tuesday.
  for (const a of asks) deeds.push({ kind: "review-request", at: a.at });

  // Outreach is a message that actually reached ONE person. A campaign is not
  // ten prospects contacted; ten delivered messages are.
  for (const e of mail) {
    if (e.type === "sent") deeds.push({ kind: "outreach", at: e.at });
  }

  return deeds.filter((d) => d.at && !Number.isNaN(new Date(d.at).getTime()));
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "genz"), 60, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  if (str("action") !== "play") return NextResponse.json({ error: "Unknown action — use play" }, { status: 400 });

  const brandId = str("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const deeds = await deedsFor(brandId);

  // The reward ceiling is computed from REALISED figures only. Nothing here
  // estimates a margin: with no measured spend the ceiling is zero and the
  // board says why, which is the honest state for almost every new account.
  return NextResponse.json(playState({
    deeds,
    nowISO: new Date().toISOString(),
    timezone: str("timezone") || "UTC",
    spentAcu: typeof body.spentAcu === "number" ? body.spentAcu : 0,
    revenueGbp: typeof body.revenueGbp === "number" ? body.revenueGbp : 0,
    providerCostGbp: typeof body.providerCostGbp === "number" ? body.providerCostGbp : 0,
    trackable: TRACKABLE,
  }));
}

export async function GET() {
  return NextResponse.json({
    layer: "MarketWar OS — Gen-Z Growth Layer",
    premise:
      "Nothing underneath changes. This is a second way in to the OS that already ships, organised by what somebody is trying to do — Create, Grow, Earn, Play, Connect, Build — rather than by which engine does it.",
    hubs: HUBS,
    coverage: hubCoverage(),
    routes: hubRoutes(),
    play: { verifiedOnly: VERIFIED_ONLY, trackable: TRACKABLE, untracked: ALL_DEED_KINDS.filter((k) => !TRACKABLE.includes(k)) },
  });
}
