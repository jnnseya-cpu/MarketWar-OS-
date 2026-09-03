import { NextResponse } from "next/server";
import { jsonRoute, loadModule } from "@/backend/route-guard";

// WHAT THIS DEPLOYMENT CAN ACTUALLY DO.
//
// Deliberately public and unauthenticated: whether the platform a person is
// about to spend an evening in can perform the thing they are about to attempt
// is not a secret, and putting it behind a login puts the warning on the wrong
// side of the door.
//
// It returns no key values — only whether each is present, which is the same
// thing a customer discovers in thirty seconds by clicking.
//
// ---------------------------------------------------------------------------
// THIS ROUTE IS WHY THE WHOLE OS READ AS BROKEN (2026-09-03)
// ---------------------------------------------------------------------------
//
// `/diagnose` measured it from the owner's browser: five requests, four answered
// data, and this one answered HTTP 500 with Next's own HTML error page —
// `server: vercel`, `x-vercel-id` present, no `cf-ray`. So Cloudflare was not
// involved, the request reached the app, and the app failed.
//
// It failed at MODULE LOAD, not in the handler. That distinction was settled by
// experiment rather than argument (see `backend/route-guard.ts`): a handler throw
// returns an EMPTY 500, while a module that throws while loading returns exactly
// the `500: Internal Server Error` page production sent.
//
// Every dashboard screen calls this route on load. One module failing to load
// therefore printed `Unexpected token '<'` on every screen at once, which is what
// "the whole OS is broken" actually was.
//
// `@/backend/capabilities` pulls in 43 modules — the gateway, Firebase Admin, the
// video gateway, the sending pool. A STATIC import of any of them is evaluated
// before this handler exists, so no try/catch could ever have caught it and no
// wrapper around the handler could either. Loading it HERE, inside the guard, is
// the only place the failure is catchable — and the answer then names the module
// and the real error instead of showing a page nobody can act on.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = jsonRoute(async () => {
  const m = await loadModule("@/backend/capabilities", () => import("@/backend/capabilities"));
  return NextResponse.json({
    capabilities: m.capabilityStates().map(({ id, label, live, because, whenDark, stillWorks, oneAction }) => ({
      id, label, live, because, whenDark, stillWorks, oneAction,
    })),
    summary: m.capabilitySummary(),
    doctrine: m.CAPABILITY_DOCTRINE,
  });
}, { maxSeconds: 10, label: "/api/capabilities" });
