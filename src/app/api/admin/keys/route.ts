import { NextRequest, NextResponse } from "next/server";
import { requireAuthEnforced, rateLimit, clientKey } from "@/backend/guard";
import { keyInventory, setPlatformKey, clearPlatformKey, hydratePlatformKeys } from "@/backend/platform-keys";
import { record as recordSecurityEvent, actorFor } from "@/backend/sentinel";
import { record as auditRecord, actorFrom } from "@/backend/audit-log";

// PLATFORM KEYS — the admin account's own key management.
//
// GET                                  → the whole catalogue with status. Never a value.
// POST   { name, value }               → store a key.
// DELETE ?name=…                       → remove a stored key (the environment value, if any, comes back).
// POST   { action: "rehydrate" }       → re-read the store into this instance now.
//
// FOUR THINGS THIS ROUTE WILL NOT DO, each one a way key management goes wrong:
//
//  • IT NEVER RETURNS A VALUE. Not masked, not truncated, not "last four". A
//    key readable from an admin session is a key that leaks with the session.
//    The inventory carries a fingerprint — a hash — so the owner can tell two
//    keys apart and confirm which one is loaded without the value existing in
//    any response body, log line or browser history.
//  • IT NEVER ACCEPTS A VALUE IN THE QUERY STRING. A secret in a URL is in the
//    access log, the referrer header and the browser's history. POST body only,
//    which is why `DELETE` takes a name and `POST` takes the value.
//  • IT IS LOCKED TO platform_admin, enforced. `/api/admin` is already in the
//    human gate's sensitive prefixes, so a stale session has to re-verify
//    before it gets here.
//  • IT RECORDS EVERY WRITE. Who, which key, when — in the audit log and as a
//    security event. The one thing worse than a key being changed is nobody
//    being able to find out when.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE GATE FOR THIS ROUTE, AND IT IS STRICTER THAN THE PLATFORM'S DEFAULT ON
 * PURPOSE. A DRIVER CAUGHT THIS SERVING THE KEY INVENTORY TO NOBODY.
 *
 * `requireAuthEnforced` refuses an unidentified caller — but only when
 * NODE_ENV is production, because `isolationUnavailable()` is written that way
 * so zero-config demo mode keeps working. Below production, `requireAuth`
 * returns `{ ok: true, enforced: false }` and, as its own doc comment warns,
 * returns BEFORE the scope is looked at. So `{ scope: "platform_admin" }` was
 * not a check at all on a keyless deployment, and `GET /api/admin/keys`
 * answered an anonymous request with the whole inventory: every credential the
 * platform reads, which are set, and the fingerprint of each one.
 *
 * That pass-through is correct for the surfaces it was written for — a demo
 * dashboard has demo data and nothing to protect. It is wrong here, because
 * THERE IS NO DEMO VERSION OF THE PLATFORM'S KEY INVENTORY. Nothing is lost by
 * refusing either: without Firebase there is no database to keep a key in, so
 * the screen could not work in that mode regardless.
 *
 * So this route requires an IDENTIFIED admin — `enforced` as well as `ok` —
 * which fails closed in every mode instead of only in production.
 */
async function adminOnly(req: NextRequest): Promise<
  { ok: true; uid: string | null } | { ok: false; status: number; error: string }
> {
  const auth = await requireAuthEnforced(req, { scope: "platform_admin" });
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };
  if (!auth.enforced) {
    return {
      ok: false, status: 503,
      error: "Key management is refused on this deployment because no caller can be identified: Firebase Admin is not configured, so there is no admin account to check and no database to keep a key in. Set the FIREBASE_* admin credentials in the hosting environment — they are the one set that cannot be managed from this screen — and this screen then manages everything else.",
    };
  }
  return { ok: true, uid: auth.uid };
}

export async function GET(req: NextRequest) {
  const auth = await adminOnly(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json(await keyInventory(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not read the key inventory" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  // Tight, because this is the door to every credential the platform holds.
  const rl = rateLimit(clientKey(req, "admin-keys"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many key changes — wait a minute." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

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

  // Re-read the store into this instance. Useful after setting a key on another
  // instance, and it is the only action here that is not a write.
  if (body.action === "rehydrate") {
    const r = await hydratePlatformKeys();
    return NextResponse.json({ ok: true, applied: r.applied.length, refused: r.refused.length, overriding: r.overriding, readAt: r.readAt });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const value = typeof body.value === "string" ? body.value : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 });

  const result = await setPlatformKey(name, value, auth.uid || "admin");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // The fingerprint, never the value — in the trail as in the response.
  const who = actorFrom(req, auth.uid);
  auditRecord({ ...who, action: "platform_key.set", resource: "platform_key", resourceId: name, meta: { fingerprint: result.fingerprint } });
  recordSecurityEvent({ at: new Date().toISOString(), kind: "credential_set", actor: actorFor(req, auth.uid), path: "/api/admin/keys", detail: `${name} set from the admin account (fingerprint ${result.fingerprint})` });

  return NextResponse.json({ ok: true, name: result.name, fingerprint: result.fingerprint, note: "Stored, encrypted, and live on this server instance. Other instances pick it up within a minute." });
}

export async function DELETE(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "admin-keys"), 20, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Too many key changes — wait a minute." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await adminOnly(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const name = (req.nextUrl.searchParams.get("name") || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const result = await clearPlatformKey(name, auth.uid || "admin");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const who = actorFrom(req, auth.uid);
  auditRecord({ ...who, action: "platform_key.cleared", resource: "platform_key", resourceId: name });
  recordSecurityEvent({ at: new Date().toISOString(), kind: "credential_set", actor: actorFor(req, auth.uid), path: "/api/admin/keys", detail: `${name} cleared from the admin account` });

  return NextResponse.json({ ok: true, name, note: "Removed. If the hosting environment also sets this key, that value is in use again." });
}
