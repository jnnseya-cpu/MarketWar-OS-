import { NextRequest, NextResponse } from "next/server";
import { emailPosture } from "@/backend/email-metrics";
import { resolveBrandAccess } from "@/backend/brand-access";

// EMAIL COMMAND CENTER HEADLINE FIGURES — counted off the brand's real vault.
//
// POST { brandId, business? } → list health computed from the actual addresses
// with the send's own hygiene verdict and the real suppression ledger, plus the
// last N days of ACTUAL sends from the event ledger.
//
// IT NO LONGER ACCEPTS `listSize`. It used to, and took it from the browser,
// which is how a real contact count went in and a hash of the brand name came
// back out as "96.8% projected inbox rate". There is no number a caller can
// supply that lets this answer without reading the list.
//
// AUTHENTICATED AND TENANT-SCOPED. It returns a breakdown of one tenant's
// mailing list — how many of their contacts are suppressed, how many bounced.
// The old route asked for nothing, because a hash of a brand name needed no
// permission to compute; a real one does.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required — this reads one brand's own list." }, { status: 400 });

  // `resolveBrandAccess` is what every other brand-scoped read in this app uses
  // — the same function, not a second way of asking the same question.
  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const business = typeof body.business === "string" ? body.business : "";
  const days = typeof body.days === "number" ? body.days : 14;
  try {
    return NextResponse.json(await emailPosture(brandId, business, days));
  } catch (e) {
    // NEVER A SYNTHETIC REPORT ON FAILURE. A list that could not be read is
    // unknown, and answering with an empty-but-well-formed report would render
    // as "0 refused, list healthy" — the most reassuring reading available, out
    // of a database error.
    return NextResponse.json(
      { error: `The list could not be read, so its health is unknown: ${e instanceof Error ? e.message : String(e)}` },
      { status: 503 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    engine: "Email Command Center — list health",
    doctrine:
      "Counted, never modelled. Every figure is the result of running the send's own hygiene verdict over the brand's "
      + "actual vault addresses and applying the real suppression ledger; the series is the send event ledger. There "
      + "is no projected inbox, spam or complaint rate here, because no arithmetic over a contact list can produce "
      + "one — placement is MEASURED by /api/placement (seed probe) and /api/postmaster (Gmail's own view).",
    outputs: ["listSize", "withoutEmail", "health.sendable", "health.refused", "health.healthPct", "health.refusedBy", "series.days"],
  });
}
