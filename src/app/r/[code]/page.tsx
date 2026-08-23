// Public referral entry point — https://…/r/{CODE}. A real tracked link: it
// resolves the partner's subscription by code, finds the programme's BRAND
// destination (the company/bank CTA), and forwards the visitor there with the
// referral code attached so the brand's own site/attribution captures it.
//
// Links ALWAYS lead to the brand's own destination — never back to a MarketWar
// page. If a programme has no destination set yet, we send them to the brand's
// hosted landing rather than a MarketWar signup.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { subscriptionByCode, getProgramme } from "@/backend/creator-engine";
import { recordClick } from "@/backend/referral-clicks";

export const dynamic = "force-dynamic";

// Append the referral code to the brand URL without clobbering existing query.
function withRef(url: string, code: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("ref", code);
    u.searchParams.set("mw_ref", code);
    return u.toString();
  } catch {
    return url + (url.includes("?") ? "&" : "?") + `ref=${encodeURIComponent(code)}`;
  }
}

export default async function ReferralRedirect({ params }: { params: Promise<{ code: string }> }) {
  const code = ((await params).code || "").toUpperCase();
  let dest = "";
  try {
    const sub = await subscriptionByCode(code);
    if (sub) {
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
        const h = await headers();
        await recordClick({
          code,
          brandId: prog?.brandId || sub.programmeId,
          programmeId: sub.programmeId,
          ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
          ua: h.get("user-agent"),
          referer: h.get("referer"),
          nowISO: new Date().toISOString(),
        });
      } catch { /* a counter must never cost a conversion */ }
    }
  } catch { /* fall through */ }
  // Valid code → brand destination. Unknown code / no destination set → home.
  redirect(dest || "/");
}
