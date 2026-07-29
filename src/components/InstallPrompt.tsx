"use client";

// "Install MarketWar" — the bit that makes a PWA an app people actually have.
//
// Two paths, because the platforms genuinely differ:
//
//   ANDROID / DESKTOP CHROME fire `beforeinstallprompt`. The event must be
//   captured and re-fired from a real user gesture; it cannot be triggered on a
//   timer. So it is stored and the button calls prompt() on click.
//
//   iOS SAFARI fires nothing and has no API. The only route is Share → Add to
//   Home Screen. Showing an "Install" button that does nothing on iPhone is
//   worse than showing none, so iOS gets instructions instead of a button.
//
// Shown once and remembered. A banner that reappears on every visit after
// someone has said no is an advert, not a feature.

import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "mw.install.dismissed.v1";

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own flag — it does not implement display-mode: standalone.
    (window.navigator as { standalone?: boolean }).standalone === true);

const isIos = () =>
  typeof navigator !== "undefined" &&
  /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !/crios|fxios/i.test(navigator.userAgent);

export default function InstallPrompt() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [gone, setGone] = useState(true);

  useEffect(() => {
    // Already installed, or already declined: nothing to say.
    if (isStandalone()) return;
    try { if (localStorage.getItem(DISMISSED_KEY)) return; } catch { /* private mode */ }

    const onPrompt = (e: Event) => {
      // Chrome shows its own mini-infobar unless this is prevented; we want the
      // prompt at a moment we choose, not while someone is mid-task.
      e.preventDefault();
      setEvt(e as InstallEvent);
      setGone(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    if (isIos()) { setShowIos(true); setGone(false); }

    const onInstalled = () => { setGone(true); dismiss(); };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setGone(true);
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* private mode — it will ask again */ }
  }

  async function install() {
    if (!evt) return;
    await evt.prompt();
    // Either way this banner has done its job. A declined prompt cannot be
    // re-fired with the same event, so keeping the button would give a dead one.
    await evt.userChoice.catch(() => null);
    dismiss();
  }

  if (gone || (!evt && !showIos)) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(1rem+var(--safe-bottom))] pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))]"
      role="dialog"
      aria-label="Install MarketWar OS"
    >
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-xl border border-emerald-500/25 bg-ink-900/95 p-3.5 shadow-2xl backdrop-blur-xl">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
          <Download className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-white">Install MarketWar OS</p>
          {showIos ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] leading-relaxed text-slate-400">
              Tap <Share className="inline h-3 w-3" aria-label="Share" /> in Safari, then
              <strong className="text-slate-200">Add to Home Screen</strong>.
              iPhone has no install button — this is the only way, and it is Apple&apos;s, not ours.
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              Full screen, no address bar, its own icon. It still needs a connection — every figure here is measured live.
            </p>
          )}
          {!showIos && (
            <button onClick={install} className="btn-primary mt-2 !py-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />Install
            </button>
          )}
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded p-1 text-slate-500 hover:text-slate-300">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
