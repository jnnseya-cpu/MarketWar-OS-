// THE GAP NOBODY COUNTS.
//
// The operating system's splash disappears the instant the document loads,
// which is BEFORE the app knows who you are. On this platform that landed on a
// lone spinner on an unstyled background while Firebase resolved the session,
// so opening the installed app looked like: dark branded splash → flash → a
// spinner in the middle of nothing → dashboard.
//
// The flash is the part people feel. Nobody minds waiting a second for an app
// to open; everybody notices it changing colour twice on the way.
//
// So this is the same dark, the same mark and the same proportions as the iOS
// launch images and the Android manifest splash. The handover is invisible
// because there is nothing to hand over — the screen simply does not change
// until there is something to show.
//
// DELIBERATELY A SERVER COMPONENT WITH NO STATE AND NO EFFECTS. It has to paint
// on the first frame; anything that waits for hydration to render is the very
// blank frame it exists to remove.

import { SPLASH_BACKGROUND } from "@/shared/pwa-splash";

export default function AppSplash({ label = "Opening MarketWar OS" }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center"
      style={{ backgroundColor: SPLASH_BACKGROUND }}
      role="status"
      aria-live="polite"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/marketwar-os-mark.png"
        alt=""
        width={96}
        height={96}
        // Eager and high priority: this is the only thing on screen, and a
        // lazily-loaded splash mark is a blank splash.
        loading="eager"
        // @ts-expect-error -- fetchPriority lands as fetchpriority in the DOM; React 18's types do not carry it yet.
        fetchpriority="high"
        className="h-24 w-24 select-none"
        draggable={false}
      />
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-600">
        {label}
      </p>
      {/* A bar rather than a spinner. A spinner says "something is happening";
          a bar that fills says "this is nearly done", and on a cold start the
          difference is whether somebody closes the app. */}
      <div className="mt-4 h-[2px] w-28 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full w-1/3 animate-[splash_1.1s_ease-in-out_infinite] rounded-full bg-emerald-400/70" />
      </div>
      <style>{`@keyframes splash{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}`}</style>
    </div>
  );
}
