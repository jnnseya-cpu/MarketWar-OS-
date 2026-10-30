import { NextRequest, NextResponse } from "next/server";
import { requireAuthEnforced, rateLimit, clientKey } from "@/backend/guard";
import { costInventory, setProviderCost, clearProviderCost } from "@/backend/provider-costs";
import { poolStatus } from "@/backend/avatar-gateway";
import { unitsForMonth, recentMonths, reconcile } from "@/backend/cost-reconciliation";
import { record as auditRecord, actorFrom } from "@/backend/audit-log";

// WHAT WE PAY OUR PROVIDERS — correctable from the invoice, without a deploy.
//
// GET                        → every cost line, what it produces, and the pool.
// POST   { key, costGbp }    → correct one against a real invoice.
// DELETE ?key=…              → drop the correction, back to the estimate.
//
// THE SAME GATE AS THE KEY SCREEN, AND FOR A STRONGER REASON. These numbers
// decide what every customer is charged. `requireAuthEnforced` alone refuses an
// unidentified caller only in production — below that it passes everybody
// through and returns before it looks at the scope — so this requires an
// IDENTIFIED admin in every mode. There is no demo version of the platform's
// cost base.
//
// A CORRECTION CANNOT BREACH THE FLOOR. It sets the believed provider cost; the
// customer price is still derived by the pricing law, which takes the higher of
// 4x that cost and the minimum that clears 100% net profit. So this screen can
// make the platform CHEAPER when the real invoice beats the estimate, and
// cannot make it unprofitable.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function adminOnly(req: NextRequest): Promise<
  { ok: true; uid: string | null } | { ok: false; status: number; error: string }
> {
  const auth = await requireAuthEnforced(req, { scope: "platform_admin" });
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };
  if (!auth.enforced) {
    return {
      ok: false, status: 503,
      error: "Changing what the platform believes it pays is refused on this deployment, because no caller can be identified: Firebase Admin is not configured, so there is no admin account to check and no database to keep a correction in.",
    };
  }
  return { ok: true, uid: auth.uid };
}

export async function GET(req: NextRequest) {
  const auth = await adminOnly(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const inv = await costInventory();
    // THE DENOMINATOR, which is the whole reason a correction was hard. An
    // invoice total is useless without the number of units it bought, and
    // until now that number was on no screen anywhere.
    const months = recentMonths();
    const asked = (req.nextUrl.searchParams.get("month") || "").trim();
    const month = months.includes(asked) ? asked : months[0];
    const units = await unitsForMonth(month);
    return NextResponse.json({ ...inv, pool: poolStatus(), months, units }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not read the cost table" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "admin-costs"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many price changes — wait a minute." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await adminOnly(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }
  const body: Record<string, unknown> = { ...raw };
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });

  // ----------------------------------------------------------------------
  // RECONCILE — an invoice total and a unit count, turned into a cost.
  //
  // `preview` computes and shows. `apply` commits. They are separate words on
  // purpose: the thing that changes what every customer is charged should be
  // read first and pressed second, never done as a side effect of asking what
  // it would be.
  // ----------------------------------------------------------------------
  if (body.action === "reconcile" || body.action === "preview") {
    const r = reconcile({
      key,
      units: Number(body.units),
      invoiceAmount: Number(body.invoiceAmount),
      currency: typeof body.currency === "string" ? body.currency : "GBP",
      fxToGbp: body.fxToGbp === undefined ? undefined : Number(body.fxToGbp),
    });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    if (body.action === "preview") return NextResponse.json({ preview: r });

    const applied = await setProviderCost(key, r.costPerUnitGbp, auth.uid || "admin", {
      source: "invoice",
      month: typeof body.month === "string" ? body.month : undefined,
      units: r.units,
      invoiceAmount: r.invoiceAmount,
      currency: r.currency,
      fxToGbp: r.fxToGbp,
    });
    if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: applied.status });
    auditRecord({
      ...actorFrom(req, auth.uid), action: "provider_cost.reconciled", resource: "provider_cost", resourceId: key,
      before: { acu: String(applied.wasAcu) },
      after: { acu: String(applied.nowAcu), costGbp: String(applied.costGbp), invoice: `${r.currency} ${r.invoiceAmount}`, units: String(r.units) },
    });
    return NextResponse.json({ ...applied, preview: r, note: r.verdict });
  }

  const costGbp = typeof body.costGbp === "number" ? body.costGbp : Number(body.costGbp);

  const r = await setProviderCost(key, costGbp, auth.uid || "admin");
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  // A PRICE CHANGE IS AN AUDITED EVENT. The one thing worse than a price moving
  // is nobody being able to find out when, or back to what.
  auditRecord({
    ...actorFrom(req, auth.uid), action: "provider_cost.set", resource: "provider_cost", resourceId: key,
    before: { acu: String(r.wasAcu) }, after: { acu: String(r.nowAcu), costGbp: String(r.costGbp) },
  });

  return NextResponse.json({
    ...r,
    note: r.wasAcu === r.nowAcu
      ? `Recorded. The customer price is unchanged at ${r.nowAcu} ACUs — the floor that guarantees 100% net profit is holding it there, not the 4x markup.`
      : `Recorded. The customer price moves from ${r.wasAcu} to ${r.nowAcu} ACUs per unit, on this server now and everywhere within a minute.`,
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await adminOnly(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const key = (req.nextUrl.searchParams.get("key") || "").trim();
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 });

  const r = await clearProviderCost(key, auth.uid || "admin");
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  auditRecord({
    ...actorFrom(req, auth.uid), action: "provider_cost.cleared", resource: "provider_cost", resourceId: key,
    before: { acu: String(r.wasAcu) }, after: { acu: String(r.nowAcu) },
  });
  return NextResponse.json({ ...r, note: `Back to the built-in estimate. The customer price is ${r.nowAcu} ACUs per unit.` });
}
