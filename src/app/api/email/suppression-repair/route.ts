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

// AN UNENFORCED "YES" IS NOT A YES, AND THIS IS THE ENDPOINT WHERE THAT MATTERS.
//
// `requireAuth` returns `{ ok: true, enforced: false }` when Firebase Admin is
// not configured — a deliberate zero-config affordance that keeps the demo
// working, and it returns before the scope check is ever reached, so
// `{ scope: "platform_admin" }` is silently not applied. Every caller that reads
// only `ok` therefore treats "nobody could be identified" as "an admin asked".
//
// Found by driving this route against a running server rather than by reading
// it: with no Admin credentials, `GET ?brandId=x` answered 200 with the report,
// which NAMES SUPPRESSED EMAIL ADDRESSES, and the POST would have been accepted
// on the same terms.
//
// THE HONEST BOUND ON WHAT THAT EXPOSED, because overstating it would be its own
// kind of fabrication: no Admin also means no Firestore, so in exactly the state
// where the door was open the suppression ledger is the in-memory fallback and
// holds nothing. Production has Admin credentials and was gated correctly. This
// was an open door onto an empty room — but it is the door on the room where a
// brand's contactable list lives, and it should not be open in any state.
//
// It closes because the room does not stay empty by design. `adminConfigured` is
// read from environment presence, so a deployment that loses or has not yet
// received its FIREBASE_* variables reaches this branch, and this platform has
// already spent several sessions believing Admin was down in production. A
// window where isolation cannot be enforced is when this must close, not open.
//
// So this endpoint requires authorisation that was actually ENFORCED. The
// scheduler bearer counts, because `cronAuthorised` verifies a real secret and
// refuses outright when none is set. `/api/email-events` already takes this
// posture for the same reason — it answers 503 rather than serving a brand's
// data without isolation.
type Authorisation = { ok: true } | { ok: false; status: number; error: string };

async function authorise(req: Request): Promise<Authorisation> {
  const guard = await loadModule("@/backend/guard", () => import("@/backend/guard"));
  const cron = guard.cronAuthorised(req instanceof NextRequest ? req : new NextRequest(req));
  if (cron.ok) return { ok: true };

  const auth = await guard.requireAuth(req, { scope: "platform_admin" });
  if (auth.ok && auth.enforced) return { ok: true };
  if (auth.ok && !auth.enforced) {
    return {
      ok: false,
      status: 503,
      error: "Firebase Admin is not configured on this deployment, so no caller can be proved to be a platform admin. This endpoint reads and changes a brand's suppression list, so it refuses rather than answering an unidentified request. Set the FIREBASE_* admin credentials, or call it with the scheduler bearer.",
    };
  }
  return {
    ok: false,
    status: 403,
    error: "This reads and changes which addresses a brand may contact, so it needs a platform-admin session or the scheduler bearer.",
  };
}

export const GET = jsonRoute(async (req: Request) => {
  const brandId = (new URL(req.url).searchParams.get("brandId") || "").trim();
  if (!brandId) return NextResponse.json({ error: "brandId is required." }, { status: 400 });
  const allowed = await authorise(req);
  if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: allowed.status });
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
  const allowed = await authorise(req);
  if (!allowed.ok) return NextResponse.json({ error: allowed.error }, { status: allowed.status });
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
