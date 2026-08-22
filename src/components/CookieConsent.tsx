"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";

// Consent before tracking, because that is the order the law puts them in.
//
// Google Tag Manager was loaded in the root layout for every visitor, on every
// route, the moment the page rendered. GTM's whole job is to drop and read
// cookies that are not necessary for the site to work, and PECR regulation 6
// requires consent BEFORE that happens — not a notice afterwards, not a banner
// that appears while the tag is already running. A UK site selling to the
// public with an ungated container is a straightforward breach, and it is also
// the first thing anyone technical checks.
//
// So: nothing analytical loads until the visitor has actually chosen.
//
// WHAT MAKES A CHOICE A CHOICE, per the ICO's own guidance:
//   • Refusing must be as easy as accepting. Two buttons, same size, same
//     prominence — no greyed-out "Reject" hidden behind a settings pane.
//   • Silence is not consent. No choice means denied, and denied is the state
//     the page starts in, so a visitor who scrolls past the banner and never
//     touches it is never tracked.
//   • The choice must be changeable. /privacy links back here.
//   • Essential cookies are not up for negotiation and are not claimed to be:
//     the banner says plainly that sign-in and security cookies are always on,
//     because they are what makes an account work at all.
//
// Consent Mode v2 defaults are pushed as DENIED before anything else touches
// dataLayer, so even if a container were loaded by some other path, the tags
// inside it start from no.

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-MFF3H6F8";

// The Meta Pixel loads through THIS gate, not a second one.
//
// A separate component would have to re-derive "may I load?" from storage, and
// two components answering that question independently is how one of them ends
// up loading a tracker for somebody who said no. There is one gate; it now
// carries two tags. With no ID set nothing renders — the pixel is simply absent
// on a deployment that has not configured one.
const META_PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "").trim();

// Bump when the purposes change — an old "yes" must not silently cover new use.
const STORAGE_KEY = "mw-cookie-consent-v1";

export type ConsentChoice = "granted" | "denied";

/** What the visitor previously chose, or null if they have not been asked. */
export function readConsent(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    // Storage blocked (private mode, hardened browser). Treat as unasked, which
    // resolves to denied — failing towards not tracking someone is the only
    // safe direction for this particular failure.
    return null;
  }
}

/**
 * The event everything else listens to.
 *
 * Consent used to live only in this component's own state, so nothing else could
 * ask "may I track?" without re-reading storage and guessing when it changed.
 * Broadcasting it means there is still exactly ONE place a choice is made, and
 * the pixel, the tag and the event transport all follow it rather than each
 * keeping a copy that can go stale.
 */
export const CONSENT_EVENT = "mw:consent";

function broadcast(choice: ConsentChoice): void {
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
  } catch { /* a browser that cannot dispatch still has the state above */ }
}

function pushConsent(choice: ConsentChoice): void {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({
    event: "consent_update",
    analytics_storage: choice,
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
  });
  broadcast(choice);
}

export default function CookieConsent() {
  // null = not yet read from storage. Nothing renders and nothing loads until
  // the client has actually looked, so the server-rendered HTML never contains
  // a banner state that the browser then contradicts.
  const [choice, setChoice] = useState<ConsentChoice | null | undefined>(undefined);

  useEffect(() => {
    const existing = readConsent();
    setChoice(existing);
    // Consent Mode starts denied for everyone, including returning visitors,
    // and is only raised by an explicit grant below.
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({
      event: "default_consent",
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    if (existing === "granted") pushConsent("granted");
  }, []);

  const decide = useCallback((next: ConsentChoice) => {
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* choice still applies for this visit */ }
    setChoice(next);
    pushConsent(next);
  }, []);

  // Re-opened from the privacy page ("Cookie settings").
  useEffect(() => {
    const reopen = () => setChoice(null);
    window.addEventListener("mw:cookie-settings", reopen);
    return () => window.removeEventListener("mw:cookie-settings", reopen);
  }, []);

  if (choice === undefined) return null;

  return (
    <>
      {/* The container loads ONLY on an explicit grant. Not on page load, not
          optimistically, not "pending" a choice. */}
      {choice === "granted" && GTM_ID ? (
        <>
          <Script id="gtm-base" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0" width="0" style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        </>
      ) : null}

      {/* Same grant, same moment. The stub queues any event fired before the
          script finishes loading, so an early conversion is not lost. */}
      {choice === "granted" && META_PIXEL_ID ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('consent','grant');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      ) : null}

      {choice === null ? (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Cookies"
          className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-ink-950/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-ink-950/80"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-slate-300">
              <span className="font-semibold text-white">Cookies.</span>{" "}
              Sign-in and security cookies are always on — without them an account cannot work. Beyond those we would like to use analytics cookies to see which pages help and which do not. That part is entirely your call, and saying no changes nothing about how the product behaves for you.{" "}
              <a href="/privacy" className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300">Privacy Policy</a>
            </p>
            {/* Equal prominence: refusing must be exactly as easy as accepting. */}
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => decide("denied")}
                className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.06]"
              >
                Reject analytics
              </button>
              <button
                onClick={() => decide("granted")}
                className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.06]"
              >
                Accept analytics
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
