"use client";

// A PAGE VIEW PER ROUTE, NOT PER SESSION.
//
// Both the Meta Pixel and the Google Tag container fire one PageView when they
// load. This is a single-page app: every navigation after that is a client-side
// route change with no page load, so without this a visitor who reads six pages
// is reported as having read one. Every funnel built on top then understates
// every step but the first.
//
// It sends the PATH ONLY — never the query string. Search parameters on this
// platform carry brand ids, tokens and, on the audit page, the address somebody
// typed in. None of that belongs at an advertising network.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/frontend/analytics";

export default function AnalyticsRouteTracker() {
  const pathname = usePathname();
  // The tags fire their own PageView on load, so the first route would be
  // counted twice. Skip it and report only the navigations they cannot see.
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (pathname) trackPageView(pathname);
  }, [pathname]);

  return null;
}
