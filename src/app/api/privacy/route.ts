import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/backend/guard";
import { resolveBrandAccess } from "@/backend/brand-access";
import { exportBrandData, eraseBrandData, dataRegister } from "@/backend/privacy";
import { record as recordSecurityEvent, actorFor } from "@/backend/sentinel";

// DATA-SUBJECT RIGHTS API — the thing the Settings page was already claiming.
//
// GET                        → the data register: what the platform holds, how
//                              each store is keyed, and what erasure does to
//                              it. No tenant data, so anybody may read it —
//                              this is the transparency answer.
// GET  ?brandId=…            → that brand's full export (Art. 15 access /
//                              Art. 20 portability). Brand-ownership gated.
// POST { brandId, action: "preview" }
//                            → what an erasure WOULD do, counted, changing
//                              nothing. The confirmation screen reads from this
//                              so a person is never asked to confirm a number
//                              nobody measured.
// POST { brandId, action: "erase", confirm: "ERASE" }
//                            → runs it, and returns the receipt.
//
// WHY ERASURE IS A POST WITH A TYPED CONFIRMATION AND NOT A GET: it is
// irreversible. A GET can be prefetched by a browser, followed by a crawler and
// cached by a proxy, and any of those would delete a customer's data without a
// person ever deciding to. The confirmation string is checked server-side, so a
// client that forgets to ask cannot erase anything either.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brandId = (req.nextUrl.searchParams.get("brandId") || "").trim();

  // No brand: the register itself. Deterministic, no tenant data, no store read.
  //
  // IT NAMES THE COLLECTIONS, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT.
  // A reviewer will ask whether publishing 91 internal store names helps an
  // attacker. It does not: Firestore access is decided by `firestore.rules`,
  // which denies by default and is test-guarded, so nothing here depends on a
  // name being unknown — and a system whose safety rests on obscured names is
  // not safe, it is unexamined. Against that, Art. 13/14 ask the controller to
  // say what it holds, and a register written in labels nobody can check back
  // to the code is the kind of transparency that cannot be audited.
  if (!brandId) return NextResponse.json({ register: dataRegister() });

  const rl = rateLimit(clientKey(req, "privacy-export"), 10, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many export requests — wait a minute and try again." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const data = await exportBrandData(brandId);
    // An access request is itself a security-relevant event: it is the one
    // request that legitimately reads everything at once, so it is recorded.
    recordSecurityEvent({ at: new Date().toISOString(), kind: "data_export", actor: actorFor(req, access.uid), path: "/api/privacy", brandId, detail: `${data.recordsExported} records from ${data.storesRead} stores` });
    return NextResponse.json(data, {
      headers: {
        // The browser saves it with a name that says what it is and when.
        "Content-Disposition": `attachment; filename="marketwar-data-export-${brandId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${data.generatedAt.slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Export failed" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "privacy-erase"), 10, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many requests — wait a minute and try again." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  // READ, THEN CHECK. `req.json()` is typed `any`, so annotating its result is
  // a claim nobody verified — and this is the handler that deletes data, which
  // is the last place to take the wire's word for anything.
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }
  const body: Record<string, unknown> = { ...raw };

  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  if (action !== "preview" && action !== "erase") {
    return NextResponse.json({ error: 'action must be "preview" or "erase"' }, { status: 400 });
  }

  const access = await resolveBrandAccess(req, brandId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (action === "erase" && body.confirm !== "ERASE") {
    return NextResponse.json(
      { error: 'Erasure needs confirm: "ERASE". Nothing was changed.' },
      { status: 400 },
    );
  }

  try {
    const receipt = await eraseBrandData(brandId, { dryRun: action === "preview" });
    if (action === "erase") {
      recordSecurityEvent({ at: new Date().toISOString(), kind: "data_erasure", actor: actorFor(req, access.uid), path: "/api/privacy", brandId, detail: `${receipt.documentsErased} deleted, ${receipt.documentsAnonymised} anonymised, ${receipt.storesRetained} stores retained on a legal basis` });
    }
    return NextResponse.json(receipt, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erasure failed" }, { status: 503 });
  }
}
