"use client";

// STORES WHO SENT THIS VISITOR, IF THEY HAVE AGREED TO THAT.
//
// Mounted once in the root layout, so a referral link works from whatever page
// it points at rather than only from the two that remembered to look.
//
// It does nothing at all until the visitor accepts cookies — this is affiliate
// attribution, not authentication and not analytics, and PECR is the reason it
// waits. A visitor who refuses is still credited to the creator for the visit
// they produced, because the code rides in the URL and a query parameter is not
// storage on anybody's device. See @/shared/signup-attribution.
//
// It also re-runs on the consent event: somebody who lands on a referral link,
// reads the banner and THEN presses accept has agreed to exactly the thing that
// was about to be stored, and making them click the link again to be counted
// would be a rule nobody could explain to the creator who lost the referral.

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureReferral } from "@/frontend/referral";
import { CONSENT_EVENT } from "@/components/CookieConsent";

export default function ReferralCapture() {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    const run = () => { try { captureReferral(); } catch { /* attribution must never break a page */ } };
    run();
    window.addEventListener(CONSENT_EVENT, run);
    return () => window.removeEventListener(CONSENT_EVENT, run);
    // The query string is the input, so a client-side navigation that changes
    // it has to re-run this.
  }, [pathname, params]);

  return null;
}
