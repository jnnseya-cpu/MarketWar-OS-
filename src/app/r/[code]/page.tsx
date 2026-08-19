// Public referral entry point — https://…/r/{CODE}. A real tracked link: it
// resolves the partner's subscription by code, finds the programme's BRAND
// destination (the company/bank CTA), and forwards the visitor there with the
// referral code attached so the brand's own site/attribution captures it.
//
// Links ALWAYS lead to the brand's own destination — never back to a MarketWar
// page. If a programme has no destination set yet, we send them to the brand's
// hosted landing rather than a MarketWar signup.

import { redirect } from "next/navigation";
import { subscriptionByCode, getProgramme } from "@/backend/creator-engine";

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

export default async function ReferralRedirect({ params }: { params: { code: string } }) {
  const code = (params.code || "").toUpperCase();
  let dest = "";
  try {
    const sub = await subscriptionByCode(code);
    if (sub) {
      const prog = await getProgramme(sub.programmeId);
      // The brand's own CTA destination — where the code always leads.
      if (prog?.destinationUrl) dest = withRef(prog.destinationUrl, code);
    }
  } catch { /* fall through */ }
  // Valid code → brand destination. Unknown code / no destination set → home.
  redirect(dest || "/");
}
