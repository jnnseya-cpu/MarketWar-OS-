"use client";

// Worldwide localization (owner directive 2026-07-19): MarketWar OS is a
// global platform, so it auto-detects the viewer's language and currency from
// their device — no manual setting. Client-side by nature (Intl +
// navigator.language read the OS locale). Server-rendered money falls back to
// a neutral default and is re-localised on hydration via useLocale().
//
// Foundation utility. The money surfaces (26 hardcoded-£ sites) migrate onto
// formatMoney() incrementally — see docs/ai-os/13 localization note.

import { useEffect, useState } from "react";

// Best-effort locale → default currency map for the platform's priority
// markets (UK, EU, Africa corridor, LATAM/SEA/MENA). Falls back to GBP —
// the demo business's home currency — when the region is unknown.
const REGION_CURRENCY: Record<string, string> = {
  GB: "GBP", IE: "EUR", FR: "EUR", DE: "EUR", NL: "EUR", ES: "EUR", BE: "EUR",
  US: "USD", CA: "CAD", AU: "AUD", NZ: "NZD",
  CD: "CDF", NG: "NGN", KE: "KES", ZA: "ZAR", GH: "GHS",
  IN: "INR", BR: "BRL", AE: "AED", SA: "SAR",
};

export function detectLocale(): string {
  if (typeof navigator === "undefined") return "en-GB";
  return navigator.language || (navigator.languages && navigator.languages[0]) || "en-GB";
}

export function currencyForLocale(locale: string): string {
  const region = locale.split("-")[1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || "GBP";
}

// Format a number as money in the viewer's locale + currency. `amount` is a
// plain number in the currency's major unit. Override `currency` to pin one.
export function formatMoney(amount: number, opts?: { locale?: string; currency?: string }): string {
  const locale = opts?.locale ?? detectLocale();
  const currency = opts?.currency ?? currencyForLocale(locale);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
  } catch {
    return `£${amount.toLocaleString()}`;
  }
}

export function formatNumber(value: number, opts?: { locale?: string }): string {
  const locale = opts?.locale ?? detectLocale();
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return value.toLocaleString();
  }
}

// Hook: resolves the viewer's locale after hydration (SSR-safe — starts at the
// neutral default, updates to the real device locale on mount).
export function useLocale(): { locale: string; currency: string; money: (n: number) => string } {
  const [locale, setLocale] = useState("en-GB");
  useEffect(() => {
    setLocale(detectLocale());
  }, []);
  const currency = currencyForLocale(locale);
  return { locale, currency, money: (n: number) => formatMoney(n, { locale, currency }) };
}
