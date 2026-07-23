// Public referral entry point — https://…/r/{CODE}. A real tracked link: it
// resolves the partner's subscription by code and forwards the visitor to
// signup with the referral attached (attribution starts here). Unknown codes
// still forward to signup so the link never dead-ends.

import { redirect } from "next/navigation";
import { subscriptionByCode } from "@/backend/creator-engine";

export const dynamic = "force-dynamic";

export default async function ReferralRedirect({ params }: { params: { code: string } }) {
  const code = (params.code || "").toUpperCase();
  let ok = false;
  try { ok = Boolean(await subscriptionByCode(code)); } catch { ok = false; }
  // Attach the referral code so signup can record attribution to this partner.
  redirect(ok ? `/signup?ref=${encodeURIComponent(code)}` : `/signup`);
}
