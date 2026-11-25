"use client";

// Language selector — shows the auto-detected device language and lets the user
// override it.
//
// WHAT IT ACTUALLY CONTROLS, stated accurately: everything the platform
// GENERATES comes back in the chosen language, because the choice travels on
// every request as `x-mw-lang`. The static chrome is English and is translated
// by the browser's own offer, which appears precisely BECAUSE the page honestly
// declares itself English — the note here used to say "html lang follows this",
// and that behaviour was the thing suppressing the offer (§186).

import { Globe } from "lucide-react";
import { LOCALES, useLocale } from "@/frontend/locale-context";
import { t } from "@/shared/i18n";

export default function LanguageSelector() {
  const { locale, setLocale, detected } = useLocale();
  const short = locale.split("-")[0];
  const known = LOCALES.some((l) => l.code === short);

  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <Globe className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <select
        value={known ? short : "en"}
        onChange={(e) => setLocale(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-ink-700 bg-ink-850 px-2 py-1 text-xs text-slate-200 outline-none focus:border-emerald-500/50"
        // THE EXPLANATION IS ITSELF TRANSLATED, and its French says something
        // different on purpose: the menus are no longer simply "English". The
        // sentence that describes the platform's language support is the last
        // sentence that may lie about it.
        title={t(
          locale,
          "Detected from this device: {detected}. Everything the platform writes — agents, campaigns, articles, emails — comes back in this language. The menus and labels are English and your browser will offer to translate them.",
          { detected }
        )}
      >
        {LOCALES.map((l) => (
          // EACH NAME IN ITS OWN LANGUAGE, and never translated: a language's
          // own name is not a word to render into another one — "Deutsch"
          // turned into "German" in a German interface is a list that has
          // stopped describing itself. `lang` also tells a screen reader which
          // voice to use for each entry.
          <option key={l.code} value={l.code} lang={l.code} translate="no" className="notranslate">{l.label}</option>
        ))}
      </select>
    </label>
  );
}
