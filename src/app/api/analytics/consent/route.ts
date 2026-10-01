import { NextRequest, NextResponse } from "next/server";
import { requireAuth, rateLimit, clientKey } from "@/backend/guard";
import {
  recordAnalyticsConsent, analyticsConsentFor, mayReportConversions, CONSENT_VERSION,
} from "@/backend/analytics-consent";

// THE SERVER'S COPY OF THE COOKIE CHOICE.
//
// The banner stores the visitor's answer in `localStorage`, which the server
// cannot read — so without this, a server-side conversion would have no way to
// know whether the person agreed, and the Conversions API would be the one
// tracking path a person cannot refuse. `analytics-consent.ts` has the full
// reasoning; this is the door.
//
// Signed-in callers only, deliberately. A signed-out visitor has no account to
// key a record by, and their choice is enforced where it already is: in the
// browser, by the gate that decides whether a tag loads at all. The server sends
// conversions for PAYING customers, who are by definition signed in.
//
// It records a DENIAL as carefully as a grant. A customer who refuses and is
// never written down looks identical to one who has not been asked, and the two
// want different things said to them.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "analytics-consent"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // NO ACCOUNT, NOTHING TO RECORD — and that is a 200, not an error. The banner
  // calls this on every choice, including from a public page where the visitor
  // may not be signed in, and a 4xx there would put a red line in the console of
  // a page that is working exactly as designed.
  if (!auth.enforced || !auth.uid) {
    return NextResponse.json({
      recorded: false,
      note: "No signed-in account on this request, so there is no server-side record to make. The choice still governs every tag in the browser.",
    });
  }

  let body: unknown = null;
  try { body = await req.json(); } catch { /* handled below */ }
  const choice = (body as { choice?: unknown } | null)?.choice;
  if (choice !== "granted" && choice !== "denied") {
    return NextResponse.json({ error: 'choice must be "granted" or "denied"' }, { status: 400 });
  }

  const surface = (body as { surface?: unknown } | null)?.surface;
  try {
    const rec = await recordAnalyticsConsent({
      uid: auth.uid,
      choice,
      surface: typeof surface === "string" ? surface : undefined,
    });
    // Echo what the server will now DO, not just what it stored — the useful
    // answer, and the one that makes a wrong state visible in one request.
    const permission = await mayReportConversions(auth.uid);
    return NextResponse.json({
      recorded: true,
      choice: rec.choice,
      version: rec.version,
      serverSideReporting: permission.ok,
      note: permission.why,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Could not record the choice: ${e instanceof Error ? e.message : "store error"}` },
      { status: 500 },
    );
  }
}

/** What is on file for the signed-in account. For the privacy page to show. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!auth.enforced || !auth.uid) {
    return NextResponse.json({ consent: null, serverSideReporting: false, version: CONSENT_VERSION });
  }
  const consent = await analyticsConsentFor(auth.uid);
  const permission = await mayReportConversions(auth.uid);
  return NextResponse.json({
    consent: consent ? { choice: consent.choice, version: consent.version, at: consent.at } : null,
    serverSideReporting: permission.ok,
    note: permission.why,
    version: CONSENT_VERSION,
  });
}
