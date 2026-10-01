"use client";

// THE SALE IS REPORTED WHEN THE WALLET SAYS SO, NOT WHEN THE URL DOES.
//
// Landing on a checkout `success_url` is not proof of payment: it is a redirect
// anyone can type, a customer can bookmark, and for several payment methods
// Stripe sends the browser there before the money has settled. So arriving here
// only makes it worth ASKING. What is reported comes from `wallet.lastCredit`,
// which `applyWebhookOutcome` writes in the same transaction as the credit — the
// same guarantee `processed_events` gives, for the same reason.
//
// WHY IT POLLS. The redirect regularly beats Stripe's webhook by a second or
// two, so the first read often shows no credit yet. Giving up on that first read
// would lose a real conversion; polling for a short window and then stopping
// loses nothing and never blocks the page. If the webhook is slow or broken the
// reporter simply reports nothing, which is the correct outcome — an unreported
// sale costs one data point, a reported non-sale corrupts the bidding.
//
// WHY IT REMEMBERS. The de-duplication key is Stripe's own event id, stored per
// browser. A refresh finds the same id and reports nothing; next month's renewal
// is a different id and reports once. Storage being unavailable (private mode) is
// handled by reporting anyway — a duplicate in a hardened browser is a smaller
// fault than a silently missing conversion, and it is noted where it happens.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { authedFetch } from "@/frontend/api-client";
import { track } from "@/frontend/analytics";
import { conversionsFor, returnedFromCheckout, type LastCredit } from "@/shared/conversion-report";

const REPORTED_KEY = "mw-reported-conversions-v1";
/** How long to wait for the webhook, and how often to look. */
const ATTEMPTS = 8;
const GAP_MS = 1_500;

function readReported(): Set<string> {
  try {
    const raw = window.localStorage.getItem(REPORTED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    // Unreadable storage is treated as "nothing reported yet" — see the header.
    return new Set();
  }
}

function remember(key: string): void {
  try {
    const all = readReported();
    all.add(key);
    // Capped: this list only exists to stop a double report, and an unbounded
    // array in localStorage is a slow leak nobody ever looks at.
    window.localStorage.setItem(REPORTED_KEY, JSON.stringify([...all].slice(-50)));
  } catch { /* reported for this visit regardless */ }
}

export default function ConversionReporter() {
  const pathname = usePathname();
  // One attempt per mount, per landing. React may run an effect twice in
  // development and a second poll loop would race the first to report.
  const running = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname) return;
    if (!returnedFromCheckout(pathname, window.location.search)) return;
    if (running.current) return;
    running.current = true;

    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      for (let attempt = 0; attempt < ATTEMPTS && !cancelled; attempt++) {
        if (attempt > 0) await sleep(GAP_MS);
        let last: LastCredit | null = null;
        try {
          const res = await authedFetch("/api/billing/wallet");
          if (!res.ok) continue;
          const body: unknown = await res.json();
          const wallet = (body as { wallet?: { lastCredit?: LastCredit | null } } | null)?.wallet;
          last = wallet?.lastCredit ?? null;
        } catch {
          continue; // a transient network failure is a reason to look again
        }
        if (cancelled) return;

        const decision = conversionsFor(last, readReported());
        if (!decision) continue;

        // Record BEFORE firing. If `track` throws — a blocked tag, a tag that is
        // not there — the alternative is a loop that reports the same sale on
        // every attempt. One lost conversion beats eight duplicated ones.
        remember(decision.key);
        // THE EVENT ID IS PASSED, NOT MINTED. Meta matches this browser event
        // against the Conversions API copy of the same payment on `event_name` +
        // `event_id`; a random id here would make one payment two conversions.
        for (const e of decision.events) track(e.name, e.params, { eventId: e.eventId });
        return;
      }
    })();

    return () => { cancelled = true; };
  }, [pathname]);

  return null;
}
