import { NextRequest, NextResponse } from "next/server";
import { requireAuthEnforced, rateLimit, clientKey } from "@/backend/guard";
import { hasScope } from "@/shared/roles";

// INBOX PLACEMENT — where our mail actually lands, measured rather than argued.
//
// GET  → what a probe would cost and whether one can run at all.
// POST → run one: send to every seed mailbox through the ordinary send path,
//        then read each mailbox and report the folder and the Gmail tab.
//
// WHY THE POST IS ADMIN-ONLY AND THROTTLED. It sends real mail from the real
// sending domain. Run it often enough and the measurement changes the thing
// measured — a sender mailing its own seeds all day looks to a receiver like a
// sender nobody engages with. One an hour is far more than anybody needs and far
// less than would do harm.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Delivery is not instant and the probe waits for it, so this needs the long
// ceiling rather than the default.
export const maxDuration = 300;

export async function GET() {
  const { seedStatus } = await import("@/backend/placement-probe");
  const { emailIsConfigured } = await import("@/backend/email");
  const st = seedStatus();
  return NextResponse.json({
    service: "Inbox placement — which folder a real receiver puts our mail in",
    ...st,
    canRun: st.configured && emailIsConfigured(),
    // NAMES THE BLOCKER, not both possibilities. "It found nothing" having seven
    // identical-looking causes is the fault this platform keeps fixing.
    blocker: !emailIsConfigured()
      ? "No sending pool is configured, so a probe has nothing to send with. Set MW_SENDING_POOL or SMTP_HOST/SMTP_USER/SMTP_PASS."
      : !st.configured
        ? "No seed mailboxes are configured. Set MW_SEED_MAILBOXES."
        : "",
    doctrine:
      "A seed that does not report is not an inbox and not a spam folder — it is missing, and a report "
      + "containing one refuses to quote a rate. Seeds measure how a receiver treats a message from this "
      + "domain to a STRANGER: the honest number for cold outreach, and the pessimistic end for an engaged list.",
  });
}

export async function POST(req: NextRequest) {
  // A probe SPENDS a send from the sending domain's reputation, so it takes the
  // guard that refuses an unidentified caller rather than the one that lets
  // demo mode through.
  const auth = await requireAuthEnforced(req, { scope: "platform_admin" });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // A caller with NO role is not a platform admin. Spelled out rather than
  // relying on `hasScope` to be forgiving about null, because "no role" is
  // exactly the state an unconfigured deployment hands back.
  if (auth.enforced && (!auth.role || !hasScope(auth.role, "platform_admin"))) {
    return NextResponse.json({ error: "Placement probes are a platform-admin action — they send from the shared sending domain." }, { status: 403 });
  }

  const rl = rateLimit(clientKey(req, "placement-probe"), 2, 60 * 60_000, Date.now());
  if (!rl.ok) {
    return NextResponse.json({
      error: "A probe has already run in the last hour. Measuring more often than that changes what is being measured.",
    }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* all fields optional */ }

  const { runPlacementProbe } = await import("@/backend/placement-probe");
  const outcome = await runPlacementProbe({
    from: typeof body.from === "string" ? body.from : undefined,
    subject: typeof body.subject === "string" ? body.subject : undefined,
    html: typeof body.html === "string" ? body.html : undefined,
    waitMs: typeof body.waitMs === "number" ? Math.max(0, Math.min(180_000, body.waitMs)) : undefined,
  });

  return NextResponse.json(outcome);
}
