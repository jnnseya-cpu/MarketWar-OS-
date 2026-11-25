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
import { DEFAULT_LOCALE, LOCALE_KEY as KEY, effectiveLocale, languageNameOf, normaliseLocale, primaryLanguage } from "@/shared/locale";

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

/**
 * The English name, from the SHARED resolver.
 *
 * This was a private near-copy of the same rule the gateway used, and the two
 * disagreed in the case that mattered: this one returned the raw code when
 * `Intl` knew no name for it, so an unreadable tag became a literal instruction
 * to "write in zz". The shared version returns "" for anything it cannot name,
 * and "" means "the platform's own language" everywhere.
 */
function englishName(code: string): string {
  return languageNameOf(code) || LOCALES.find((l) => l.code === primaryLanguage(code))?.label || "English";
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
    // `navigator.languages` FIRST — it is the ordered list the person actually
    // set, and `navigator.language` is only its first entry. Reading the single
    // value first meant a device listing French then English reported whichever
    // one the browser happened to put in the singular field.
    const device = (typeof navigator !== "undefined" ? (navigator.languages ?? navigator.language) : null);
    setDetected(effectiveLocale({ device }));
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* blocked storage: the device still answers */ }
    // ONE RESOLVER, so the language this screen shows and the language the
    // request carries cannot disagree — they are now the same function.
    setLocaleState(effectiveLocale({ override: saved, device }));
  }, []);

  // `<html lang>` IS DELIBERATELY NOT TOUCHED, and this is the correction of a
  // real defect rather than a missing feature.
  //
  // It used to be set to the READER'S preferred language. `lang` declares the
  // language the content IS IN, not the language its reader would like, and the
  // chrome of this application is written in English. Claiming `lang="fr"` over
  // English text does two measurable harms:
  //
  //   • A SCREEN READER switches voice and pronunciation rules to French and
  //     then reads English words with them, which is worse than unhelpful.
  //   • THE BROWSER'S OWN TRANSLATE OFFER DISAPPEARS. Chrome offers to
  //     translate when the page's language differs from the reader's; told the
  //     page is already French, it stays silent. So the line whose stated
  //     purpose was "so browser translate works" was the thing preventing it.
  //
  // The language a reader PREFERS is carried where it belongs: on the request,
  // as `x-mw-lang`, which makes every engine generate in that language. When
  // the static chrome is genuinely translated, `lang` becomes correct to set —
  // from the strings being rendered, not from the device.

  const setLocale = useCallback((code: string) => {
    // A DELIBERATE CHOICE, stored as one. It outranks the device from now on,
    // which is why the device value is never written here: persisting a
    // detected language would freeze today's device setting as though the
    // person had asked for it, and the platform would stop following the
    // device the moment it first loaded.
    const next = normaliseLocale(code) || DEFAULT_LOCALE;
    setLocaleState(next);
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  }, []);

  const value = useMemo<LocaleValue>(() => {
    const isEnglish = primaryLanguage(locale) === DEFAULT_LOCALE;
    return { locale, languageName: englishName(locale), isEnglish, setLocale, detected };
  }, [locale, setLocale, detected]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleValue {
  return useContext(Ctx);
}
