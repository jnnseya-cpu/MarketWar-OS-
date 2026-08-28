import { NextRequest, NextResponse } from "next/server";
import { recordUnsubscribe, type UnsubscribeOutcome } from "@/backend/unsubscribe-intake";

// One-click unsubscribe — records an UNSUBSCRIBE (which suppresses the address
// forever) and shows a plain confirmation. Supports GET (link click) and POST
// (RFC 8058 List-Unsubscribe-Post). No auth beyond the signed token, so a
// recipient can always opt out without logging in.
//
// THE DEFECT THIS FILE WAS FOUND WITH, and it is the worst place on the
// platform to have it. The POST handler returned `{ ok }` with a flat HTTP 200
// whether or not the unsubscribe had actually been recorded.
//
// This endpoint is the RFC 8058 `List-Unsubscribe-Post` target — the one-click
// button inside Gmail, Yahoo and Outlook. Those providers read a 2xx as "done":
// they mark the unsubscribe successful, stop offering the control, and move on.
// So an invalid token, an expired token, or a Firestore write that threw all
// produced the same answer to the mail provider as a real unsubscribe, and the
// recipient kept receiving mail with the one mechanism that was supposed to
// stop it reporting success. That is a PECR/GDPR exposure, a Gmail/Yahoo
// bulk-sender-rules failure, and this codebase's own oldest defect — a reported
// success that never happened — on the single path where nobody would notice.
//
// Two more things were wrong underneath it. `handle()` collapsed a FORGED TOKEN
// and a STORAGE OUTAGE into the same `false`, so a Firestore incident during a
// campaign would silently drop every unsubscribe and look identical to bots
// poking the endpoint. And nothing was logged either way, so there was no way
// to discover any of it after the fact.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The three outcomes live in `backend/unsubscribe-intake.ts` so a test can DRIVE
// them. A route file cannot export a helper, which is why the failing branches
// went unverified long enough to ship a false success on this path.
const handle = (t: string): Promise<UnsubscribeOutcome> => recordUnsubscribe(t);

export async function GET(req: NextRequest) {
  const r = await handle(req.nextUrl.searchParams.get("t") || "");

  // A HUMAN CLICKED A LINK, so this stays a rendered page rather than a browser
  // error screen — but the COPY is now accurate in all three cases, and the
  // storage failure carries a 503 so it is visible to monitoring and so the
  // person is told to try again rather than being told they are unsubscribed.
  const [title, message, status] = r.ok
    ? ["You're unsubscribed", "You won't receive further emails from this sender. You can close this page.", 200]
    : r.reason === "bad_token"
      ? ["Link expired", "This unsubscribe link is invalid or has expired. Use the unsubscribe link in a more recent email, or reply to ask to be removed.", 200]
      : ["We could not complete that", "Something on our side failed while recording your request, so it has NOT been saved. Please try the link again in a few minutes — and if it keeps failing, reply to the email and you will be removed by hand.", 503];

  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
  const body = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
  <body style="font-family:system-ui,Arial,sans-serif;background:#0b1020;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
  <div style="text-align:center;padding:24px;max-width:420px">
  <h1 style="font-size:20px;margin:0 0 8px">${esc(title)}</h1>
  <p style="color:#94a3b8;font-size:14px;margin:0">${esc(message)}</p>
  </div></body></html>`;
  return new NextResponse(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  // RFC 8058: List-Unsubscribe-Post=One-Click posts here with the token in the
  // query. THE STATUS CODE IS THE ANSWER — the mail provider does not read the
  // body, so 200 must mean "recorded" and nothing else.
  const r = await handle(req.nextUrl.searchParams.get("t") || "");
  if (r.ok) return NextResponse.json({ ok: true });
  if (r.reason === "bad_token") {
    // 400, not 200: nothing was recorded and retrying will not change that.
    return NextResponse.json({ ok: false, error: "This unsubscribe link is invalid or has expired." }, { status: 400 });
  }
  // 503, not 200: the request was GOOD and we failed. A provider that retries
  // will succeed once storage recovers, which is exactly what should happen.
  return NextResponse.json(
    { ok: false, error: "Could not record the unsubscribe. This is our failure, not yours — retry.", retryable: true },
    { status: 503, headers: { "Retry-After": "300" } },
  );
}
