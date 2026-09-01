"use client";

// LIGHT OR DARK, AND THE CHOICE SURVIVES A RELOAD.
//
// Two things make a theme toggle feel broken, and both are avoided here rather
// than accepted:
//
//   THE FLASH. Reading the stored choice in a `useEffect` means the first paint
//   is always the default, so a light-theme user sees a black page for a frame
//   on every single navigation. The stamp is applied by a blocking script in
//   the document head instead (see `layout.tsx`); this component only reflects
//   and changes what that script already decided.
//
//   THE LIE ON FIRST RENDER. A button that renders "Light" before it has read
//   storage tells the user the wrong current state. It renders nothing until it
//   has read the real value — a control that briefly shows the opposite of the
//   truth is worse than one that arrives a frame late.

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stamped = document.documentElement.getAttribute("data-theme");
    setTheme(stamped === "light" ? "light" : "dark");
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    // Storage can throw — a private window, or a browser set to block site
    // data. The theme must still change for this session if it does.
    try { localStorage.setItem("mw-theme", next); } catch { /* the choice still applies now */ }
  }

  // Nothing until the real value is known. See the note above.
  if (theme === null) return <span className={`inline-block h-8 w-8 ${className}`} aria-hidden />;

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => choose(next)}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-slate-400 transition hover:border-emerald-500/40 hover:text-emerald-300 ${className}`}
      // Says what pressing it DOES, not what the current state is — a control
      // labelled with its own state is the classic toggle ambiguity.
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
