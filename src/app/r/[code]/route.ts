// Public referral entry point — https://…/r/{CODE}. A real tracked link: it
// resolves the partner's subscription by code, finds the programme's BRAND
// destination (the company/bank CTA), and forwards the visitor there with the
// referral code attached so the brand's own site/attribution captures it.
//
// Links ALWAYS lead to the brand's own destination — never back to a MarketWar
// page. If a programme has no destination set yet, we send them to the brand's
// hosted landing rather than a MarketWar signup.
//
// A ROUTE HANDLER RATHER THAN A PAGE, since this change. It renders nothing —
// it always redirects — and a Server Component cannot set a cookie during
// render, which is what a page was silently unable to do:
//
//   The no-destination branch used to redirect to "/" and THROW THE CODE AWAY.
//   Real traffic from a creator's link landed on the MarketWar home page with
//   nothing carrying who sent them, and it could not be repaired afterwards
//   because recordClick stores a per-day-rotating salted hash on purpose. The
//   code now travels on, so the visit can still be credited.
//
// NO COOKIE IS SET HERE, deliberately. The 90-day attribution cookie is
// affiliate tracking and waits for consent, and consent lives in the browser
// where this code cannot read it. The cookie is written client-side by
// ReferralCapture once the visitor has accepted; the URL parameter below needs
// no consent and carries the visit either way. See shared/signup-attribution.ts.

import { NextResponse, type NextRequest } from "next/server";
import { subscriptionByCode, getProgramme } from "@/backend/creator-engine";
import { recordClick } from "@/backend/referral-clicks";
import { normaliseCode, REF_PARAMS } from "@/shared/signup-attribution";

export const dynamic = "force-dynamic";

// Append the referral code to the brand URL without clobbering existing query.
function withRef(url: string, code: string, base?: string): string {
  try {
    const u = new URL(url, base);
    for (const p of REF_PARAMS) u.searchParams.set(p, code);
    return u.toString();
  } catch {
    return url + (url.includes("?") ? "&" : "?") + `ref=${encodeURIComponent(code)}`;
  }
}

// `params` is a plain object in Next 14 and a promise in Next 15, and each
// version's generated validator REJECTS the other's type — a union satisfies 14
// and fails 15. So the framework's own argument is left unconstrained and
// `await` handles both (awaiting a non-promise returns it unchanged). Nothing is
// asserted about the value: the code is pulled out with a typeof check and then
// validated by `normaliseCode`, which is the only thing that decides whether it
// is a code at all. The branches differ on that migration and a public redirect
// is not the place to discover which version is deployed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(req: NextRequest, ctx: { params: any }) {
  const resolved = await ctx.params;
  const raw = typeof resolved?.code === "string" ? resolved.code : "";
  const code = normaliseCode(raw);
  let dest = "";
  // Only a code somebody actually minted travels any further. A guessed or
  // mistyped one is dropped here rather than propagated into a signup URL,
  // where it would look like an attribution right up until it was refused.
  let known = false;

  if (code) {
    try {
      const sub = await subscriptionByCode(code);
      if (sub) {
        known = true;
        const prog = await getProgramme(sub.programmeId);
        // The brand's own CTA destination — where the code always leads.
        if (prog?.destinationUrl) dest = withRef(prog.destinationUrl, code);

        // RECORD THE CLICK. This used to redirect and write nothing, so there was
        // no evidence behind any attribution claim and no way to see a creator
        // sending a thousand clicks from one machine. Only a salted hash of the
        // address is kept — the visitor is a member of the public who clicked a
        // link and has consented to nothing.
        //
        // Awaited, but it never throws and never blocks on a failure: the visitor
        // is mid-journey to the brand's site, and losing a click costs far less
        // than losing the customer.
        try {
          await recordClick({
            code,
            brandId: prog?.brandId || sub.programmeId,
            programmeId: sub.programmeId,
            ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
            ua: req.headers.get("user-agent"),
            referer: req.headers.get("referer"),
            nowISO: new Date().toISOString(),
          });
        } catch { /* a counter must never cost a conversion */ }
      }
    } catch { /* fall through */ }
  }

  // Valid code, brand destination set → the brand's page, as before. Valid code
  // with no destination → our home page STILL CARRYING THE CODE, so the visit
  // can be credited if they sign up. Unknown code → home, clean: a typo must not
  // create an attribution nobody can trace.
  const home = known && !dest ? withRef("/", code!, req.url) : new URL("/", req.url).toString();
  return NextResponse.redirect(dest || home, { status: 302 });
}
