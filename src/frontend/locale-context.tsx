"use client";

// Locale provider — detects the user's DEVICE language on first load
// (navigator.language) and lets the whole OS follow it:
//  • sets <html lang> so the browser's native translate + a11y work,
//  • exposes the English language NAME (e.g. "French") for AI generation, so
//    engines return content in the user's language via the gateway's lang hook,
//  • persists a manual override.
// AI-generated content follows the language; static UI chrome is best served by
// the browser's translate (which this enables) until full i18n strings land.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const KEY = "mw.locale.v1";

// A curated set the selector offers explicitly; any device language still works.
export const LOCALES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "ar", label: "العربية" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "hi", label: "हिन्दी" },
  { code: "zh", label: "中文" },
  { code: "sw", label: "Kiswahili" },
  { code: "ln", label: "Lingala" },
];

function englishName(code: string): string {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    return dn.of(code.split("-")[0]) || code;
  } catch {
    return LOCALES.find((l) => l.code === code.split("-")[0])?.label || code;
  }
}

type LocaleValue = {
  locale: string;        // BCP-47-ish code, e.g. "fr" or "fr-FR"
  languageName: string;  // English name for AI, e.g. "French"
  isEnglish: boolean;
  setLocale: (code: string) => void;
  detected: string;      // the device-detected code
};

const Ctx = createContext<LocaleValue>({ locale: "en", languageName: "English", isEnglish: true, setLocale: () => {}, detected: "en" });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [detected, setDetected] = useState("en");
  const [locale, setLocaleState] = useState("en");

  useEffect(() => {
    const dev = (typeof navigator !== "undefined" && (navigator.language || (navigator.languages && navigator.languages[0]))) || "en";
    setDetected(dev);
    let chosen = dev;
    try { const saved = localStorage.getItem(KEY); if (saved) chosen = saved; } catch { /* ignore */ }
    setLocaleState(chosen);
  }, []);

  // Reflect on <html lang> so browser translate + screen readers follow it.
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale.split("-")[0] || "en";
  }, [locale]);

  const setLocale = useCallback((code: string) => {
    setLocaleState(code);
    try { localStorage.setItem(KEY, code); } catch { /* ignore */ }
  }, []);

  const value = useMemo<LocaleValue>(() => {
    const isEnglish = /^en/i.test(locale);
    return { locale, languageName: englishName(locale), isEnglish, setLocale, detected };
  }, [locale, setLocale, detected]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleValue {
  return useContext(Ctx);
}
