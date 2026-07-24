import { NextRequest, NextResponse } from "next/server";
import { runAutopilotCycle, autopilotDigestEmail, type BrandLite, type AutopilotRun } from "@/backend/autopilot";
import { sendEmail } from "@/backend/email";
import { rateLimit, clientKey } from "@/backend/guard";

// Nightly Autopilot digest — the "here's what I did overnight and what needs
// approval" email. A scheduler (cron) calls this once a day with the account's
// active brands + the operator's email. Runs a cycle per brand and sends ONE
// combined morning digest via the SMTP email engine.
//
// POST { brands: BrandLite[], to, recipientName?, requestedLevel?, budgetGbp?,
//        dashboardUrl?, nowISO? }  → runs cycles + sends the digest.
// Demo-safe: with no SMTP/HTTP email keys the send is simulated (mode: demo).
export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_PRODUCTION_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "autopilot-nightly"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  // This route sends REAL email to a client-supplied recipient — it must be
  // gated. It's a scheduler endpoint: require the CRON_SECRET header (set on the
  // cron job) OR a signed-in user. Without either, refuse — an open email relay
  // from the platform's authenticated domain is an abuse/reputation risk.
  const cronSecret = req.headers.get("x-cron-secret") || "";
  const cronOk = process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;
  if (!cronOk) {
    const { requireAuth } = await import("@/backend/guard");
    const auth = await requireAuth(req);
    if (!auth.ok) return NextResponse.json({ error: "Unauthorised — set the x-cron-secret header (scheduler) or sign in." }, { status: auth.status });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to) return NextResponse.json({ error: "to (recipient email) is required" }, { status: 400 });

  const rawBrands = Array.isArray(body.brands) ? body.brands : [];
  const brands: BrandLite[] = rawBrands
    .map((b) => (b ?? {}) as Record<string, unknown>)
    .filter((b) => typeof b.id === "string" && b.id && typeof b.name === "string" && b.name)
    .map((b) => ({
      id: String(b.id), name: String(b.name),
      industry: typeof b.industry === "string" ? b.industry : undefined,
      product: typeof b.product === "string" ? b.product : undefined,
      audience: typeof b.audience === "string" ? b.audience : undefined,
      location: typeof b.location === "string" ? b.location : undefined,
      offer: typeof b.offer === "string" ? b.offer : undefined,
      goal: typeof b.goal === "string" ? b.goal : undefined,
    }));
  if (brands.length === 0) return NextResponse.json({ error: "brands[] is required (at least one brand with id + name)" }, { status: 400 });

  const nowISO = typeof body.nowISO === "string" && body.nowISO ? body.nowISO : new Date().toISOString();
  const requestedLevel = typeof body.requestedLevel === "number" ? body.requestedLevel : Number(body.requestedLevel) || 3;
  const budgetGbp = typeof body.budgetGbp === "number" ? body.budgetGbp : Number(body.budgetGbp) || 0;
  const dashboardUrl = (typeof body.dashboardUrl === "string" && body.dashboardUrl) ? body.dashboardUrl : `${APP_URL}/dashboard/autopilot`;
  const recipientName = typeof body.recipientName === "string" ? body.recipientName : undefined;

  const runs: AutopilotRun[] = brands.map((brand) => runAutopilotCycle({ brand, requestedLevel, budgetGbp, nowISO }));
  const { subject, html } = autopilotDigestEmail(runs, { recipientName, dashboardUrl });

  const send = await sendEmail({ to, subject, html, transactional: true });

  return NextResponse.json({
    sent: send.ok,
    mode: send.mode,
    provider: send.provider,
    subject,
    detail: send.detail,
    // Include the rendered HTML only when explicitly previewing (keeps sends lean).
    html: body.preview === true ? html : undefined,
    brands: runs.map((r) => ({ brand: r.brandName, autoExecuted: r.autoExecuted, queued: r.queued, projectedRevenueGbp: r.projectedRevenueGbp, grantedLevel: r.grantedLevel })),
  });
}

export async function GET() {
  return NextResponse.json({
    engine: "Nightly Autopilot digest email",
    doctrine: "Cron calls this daily with the account's active brands + operator email. Runs an Autopilot cycle per brand and sends one combined morning digest via the SMTP email engine (demo-safe: simulated without email keys).",
    schedule: "0 6 * * * (06:00 daily) → POST /api/autopilot/nightly { brands, to }",
  });
}
