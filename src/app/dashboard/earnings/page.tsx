"use client";

// A creator's own money, on its own page.
//
// Deliberately separate from /dashboard/partner-network, which is the BRAND's
// view: programmes, commission ledgers, who to recruit. This is the other side
// of the same deal — what one person has earned and how they get it out — and
// mixing the two on one screen makes both harder to read.

import { PageHeader, Pill } from "@/components/ui";
import CreatorPayouts from "@/components/CreatorPayouts";
import { useAuthUser } from "@/frontend/use-auth-user";

export default function EarningsPage() {
  // A CREATOR IS A PERSON, NOT A BRAND. The first version of this page passed
  // the active brand's id, which would have filed one person's tax details
  // against a company and, in demo mode where the server falls back to the
  // supplied id, paid out against the wrong account entirely. It is the
  // signed-in user; the server takes it from the session regardless of what the
  // browser sends, and this is only so the page can read its own wallet.
  const { user, configured } = useAuthUser();

  return (
    <div>
      <PageHeader
        kicker="SHARE2EARN"
        title="Your earnings"
        subtitle="What you have made, what is still settling, and how to take it out. You are paid gross — nothing is deducted for tax, because you are not an employee. Every withdrawal fee is shown before you confirm it."
        actions={<Pill tone="info">0.5% of verified eligible sales</Pill>}
      />
      {!configured && (
        <p className="mb-6 rounded-lg border border-sky-500/25 bg-sky-500/[0.05] p-3 text-xs leading-relaxed text-sky-200">
          Demo mode — no accounts are configured on this deployment, so there is no signed-in creator and no real balance. Everything below is the real engine; it simply has nobody to pay.
        </p>
      )}
      <CreatorPayouts creatorId={user?.uid} />
    </div>
  );
}
