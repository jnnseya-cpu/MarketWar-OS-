"use client";

// Language selector — shows the auto-detected device language and lets the user
// override it. AI-generated content then comes back in the chosen language; the
// browser's native translate handles the static chrome (html lang follows this).

import { Globe } from "lucide-react";
import { LOCALES, useLocale } from "@/frontend/locale-context";

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
        title={`Detected: ${detected}`}
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </label>
  );
}
