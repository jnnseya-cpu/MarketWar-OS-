import { NextRequest, NextResponse } from "next/server";
import { jsonRoute, loadModule } from "@/backend/route-guard";

// UNDO THE SUPPRESSIONS THIS PLATFORM CAUSED, AND ONLY THOSE.
//
//   GET  ?brandId=…   what the ledger PROVES was wrongful. Changes nothing.
//   POST { brandId, emails[] }  restores those, re-verifying each one.
//
// WHY IT EXISTS. The campaign route suppressed any failure containing a 5xx
// code, and the mail server was refusing our own password with `535`. 104
// prospects on one brand and 250 on another were marked as hard bounces and
// permanently suppressed because our credential was wrong. Stopping it (see
// `shared/send-failure.ts`) does not give them back.
//
// WHY IT IS NOT AUTOMATIC. Restoring an address that genuinely bounced burns
// sending reputation for every other address on the list. So this reports, a
// person decides, and `backend/suppression-repair.ts` re-proves every address at
// the moment of restoration rather than trusting the request — an endpoint that
// un-suppresses whatever it is handed is a way to wreck a domain on purpose.
//
// ADMIN-GATED, because it changes who this platform is allowed to contact.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorise(req: Request) {
  const guard = await loadModule("@/backend/guard", () => import("@/backend/guard"));
  const cron = guard.cronAuthorised(req instanceof NextRequest ? req : new NextRequest(req));
  if (cron.ok) return { ok: true as const };
  const auth = await guard.requireAuth(req, { scope: "platform_admin" });
  return auth.ok ? { ok: true as const } : { ok: false as const };
}

export const GET = jsonRoute(async (req: Request) => {
  const brandId = (new URL(req.url).searchParams.get("brandId") || "").trim();
  if (!brandId) return NextResponse.json({ error: "brandId is required." }, { status: 400 });
  if (!(await authorise(req)).ok) {
    return NextResponse.json({
      error: "This reports which of a brand's suppressed addresses were suppressed by our own fault, so it needs a platform-admin session or the scheduler bearer.",
    }, { status: 403 });
  }
  const mod = await loadModule("@/backend/suppression-repair", () => import("@/backend/suppression-repair"));
  const report = await mod.findImpossibleBounces(brandId);
  return NextResponse.json({
    ...report,
    // The instruction, beside the evidence, so the reader does not have to go
    // and find out what to do with a list of addresses.
    howToRestore: report.impossible.length
      ? `POST to this same address with { "brandId": "${brandId}", "emails": [ … ] }. Each one is re-proved before it is restored, so a genuine bounce sent here is refused rather than resurrected.`
      : "Nothing to restore.",
  });
}, { maxSeconds: 60, label: "/api/email/suppression-repair" });

export const POST = jsonRoute(async (req: Request) => {
  if (!(await authorise(req)).ok) {
    return NextResponse.json({ error: "Restoring an address changes who this platform may contact, so it needs a platform-admin session or the scheduler bearer." }, { status: 403 });
  }
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brandId is required." }, { status: 400 });
  const emails = Array.isArray(body.emails) ? body.emails.filter((e): e is string => typeof e === "string") : [];
  if (!emails.length) return NextResponse.json({ error: "Give the addresses to restore, from this endpoint's own GET. Nothing is restored in bulk without naming it." }, { status: 400 });

  const mod = await loadModule("@/backend/suppression-repair", () => import("@/backend/suppression-repair"));
  const result = await mod.restoreSuppressions(brandId, emails);

  // Written to the audit log, because a platform that silently un-deletes
  // customer data is as untrustworthy as one that silently deletes it.
  try {
    const audit = await loadModule("@/backend/audit-log", () => import("@/backend/audit-log"));
    await audit.record({
      actorType: "user", actor: "platform-admin",
      action: "suppression.restore",
      resource: "email_suppressions", resourceId: brandId, brandId,
      // Counts, never the addresses: an audit entry is read by more people than
      // the list itself and must not become a second copy of it.
      after: { restored: String(result.restored.length), refused: String(result.skipped.length), cause: "platform authentication failure, not a recipient bounce" },
      nowISO: new Date().toISOString(),
    });
  } catch { /* the audit write must not undo a restoration that already happened */ }

  return NextResponse.json(result);
}, { maxSeconds: 60, label: "/api/email/suppression-repair" });
