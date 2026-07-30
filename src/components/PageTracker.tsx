"use client";

// Click tracking for a hosted landing page.
//
// Views are counted server-side when the page renders, so they survive ad
// blockers and JavaScript being off. This handles the part that genuinely needs
// the browser: which CTA a visitor actually pressed.
//
// One delegated listener rather than a handler per button — the page's sections
// are generated, so the set of links is not known up front. sendBeacon is used
// so the request survives the navigation that immediately follows the click,
// which a normal fetch would not.
//
// CTAs carry data-mw-cta. That matters because the primary button on a
// lead-form page points at "#lead", and an earlier version of this file treated
// every "#" href as navigation and discarded it — which silently switched click
// tracking off for exactly the pages that needed it most.

import { useEffect } from "react";

export default function PageTracker({ brandId, slug }: { brandId: string; slug: string }) {
  useEffect(() => {
    if (!brandId || !slug) return;

    const send = (event: "cta_click" | "lead") => {
      const body = JSON.stringify({ brandId, slug, event });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/page-analytics", new Blob([body], { type: "application/json" }));
          return;
        }
      } catch { /* fall through to fetch */ }
      // keepalive matters for the same reason sendBeacon does.
      fetch("/api/page-analytics", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    };

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("a, button");
      if (!el) return;
      const href = el.getAttribute("href") || "";
      const isCta = Boolean((el as HTMLElement).dataset.mwCta);

      // THE BUG THIS FIXES. Every "#…" href used to be discarded as "navigation,
      // not a conversion" — but on a page whose call to action IS the on-page
      // lead form, the primary button's href is exactly "#lead". So the single
      // most important press on the page was thrown away, and five live pages
      // reported 160 visitors and one click between them.
      //
      // A marked CTA counts wherever it points. An unmarked "#" link is still
      // just navigation.
      if (isCta) { send("cta_click"); return; }
      if (!href || href.startsWith("#")) return;
      send("cta_click");
    };

    // The lead form posts its own submission; this catches it for the counter
    // without the form needing to know analytics exists.
    const onSubmit = () => send("lead");

    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [brandId, slug]);

  return null;
}
