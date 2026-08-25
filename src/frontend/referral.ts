"use client";

// The browser half of signup attribution. The rules live in
// @/shared/signup-attribution; this only stores and reads.
//
// CLIENT-SIDE ON PURPOSE. The cookie is affiliate attribution and waits for
// consent, and the consent choice lives in localStorage where the server cannot
// see it. A server-set cookie on /r/{CODE} would have had to either ignore the
// visitor's answer or guess it, so the redirect stays consent-neutral and the
// decision is made here, where the answer actually is.

import {
  REF_COOKIE, SIGNUP_WINDOW_MS, decodeAttribution, encodeAttribution,
  lastTouch, isExpired, refFromParams, type Attribution,
} from "@/shared/signup-attribution";
import { readConsent } from "@/components/CookieConsent";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function writeCookie(value: string, maxAgeSec: number): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  // Lax, not None: the cookie is only ever read on our own pages, and None
  // would send it on every third-party request that happened to hit us.
  document.cookie = `${REF_COOKIE}=${encodeURIComponent(value)}; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}; Path=/; SameSite=Lax${secure}`;
}

/** The stored attribution, or null if there is none or it has aged out. */
export function storedAttribution(now = Date.now()): Attribution | null {
  const a = decodeAttribution(readCookie(REF_COOKIE));
  if (!a || isExpired(a, now)) return null;
  return a;
}

/** The code carried by the current URL, if any. Needs no consent to read. */
export function urlCode(): string | null {
  if (typeof location === "undefined") return null;
  try { return refFromParams(new URL(location.href).searchParams); } catch { return null; }
}

/**
 * Apply a click to what is stored, if the visitor has agreed to that.
 *
 * Returns the code that should be credited for THIS visit either way — the URL
 * still carries it when consent was refused, which is the whole point of the
 * two tiers.
 */
export function captureReferral(now = Date.now()): string | null {
  const incoming = urlCode();
  if (readConsent() !== "granted") {
    // No storage, no consent question. The visit can still be credited.
    return incoming || null;
  }
  const next = lastTouch(storedAttribution(now), incoming, now);
  if (next) writeCookie(encodeAttribution(next), SIGNUP_WINDOW_MS / 1000);
  return next?.code ?? null;
}

/**
 * Who should be credited if an account is created right now.
 *
 * The URL wins over the cookie: it is this visit's click, and this visit's
 * click is the last touch by definition.
 */
export function creditableCode(now = Date.now()): { code: string; via: "cookie" | "visit" } | null {
  const fromUrl = urlCode();
  if (fromUrl) return { code: fromUrl, via: "visit" };
  const stored = storedAttribution(now);
  return stored ? { code: stored.code, via: "cookie" } : null;
}

/** Carry the code onto a link, so a full page load does not lose it. */
export function withReferral(href: string, code: string | null): string {
  if (!code || !href.startsWith("/")) return href;
  return `${href}${href.includes("?") ? "&" : "?"}ref=${encodeURIComponent(code)}`;
}
