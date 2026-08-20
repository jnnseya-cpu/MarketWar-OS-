"use client";

// Where a blocked request lands.
//
// The human gate refuses to a CHALLENGE, never to a lockout: this page runs the
// same check the signup form runs, and sends you straight back to what you were
// doing. That distinction is the whole design — a security control that strands
// a paying customer on a dead end has just chosen a different way to lose the
// account.
//
// Two arrivals, two sentences, because they are not the same situation:
//   verify   — no session yet. A stranger at the door.
//   reverify — signed in, but about to move money or credentials, and the last
//              check was too long ago to still speak for whoever is holding the
//              laptop now.

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { runHumanCheck } from "@/frontend/human-check";

function Verify() {
  const router = useRouter();
  const params = useSearchParams();
  const action = params.get("action") === "reverify" ? "reverify" : "verify";
  // Only ever a path on this site. An open redirect on the page that exists to
  // stop attacks would be an unusually embarrassing place to put one.
  const raw = params.get("next") || "/dashboard";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

  const [stage, setStage] = useState("Starting the check…");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [mountedAt] = useState(() => Date.now());

  const run = useCallback(async () => {
    setError(null);
    setStage("Starting the check…");
    const res = await runHumanCheck({
      mountedAt,
      onStage: (s) => setStage(s === "requesting" ? "Starting the check…" : s === "solving" ? "Checking you're human…" : "Securing your session…"),
    });
    if (!res.ok) { setError(res.error); return; }
    setDone(true);
    // A full navigation, not a client push: the cookie was set on the response
    // and the destination has to be fetched with it attached.
    window.location.href = next;
  }, [mountedAt, next]);

  useEffect(() => {
    // The timing check rejects a submission faster than a hand — including this
    // automatic one. Wait past the floor before starting.
    const t = setTimeout(() => { void run(); }, 1_500);
    return () => clearTimeout(t);
  }, [run]);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 bg-ink-950 px-6 text-center">
      {done ? <CheckCircle2 className="h-9 w-9 text-emerald-400" /> : error ? <ShieldAlert className="h-9 w-9 text-amber-400" /> : <ShieldCheck className="h-9 w-9 text-emerald-500/70" />}
      <div>
        <h1 className="font-display text-xl font-bold text-white">
          {action === "reverify" ? "Confirm it's still you" : "Checking you're human"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {action === "reverify"
            ? "You're signed in, but this action moves money or credentials, so it needs a check passed in the last few minutes rather than at some point today. Nothing is being asked of you beyond a moment of this device's time."
            : "Every part of MarketWar OS requires a person at the keyboard. This runs a small computation in your browser — no puzzles to solve, no images to click, and nothing about you is collected."}
        </p>
      </div>

      {!done && !error && (
        <p className="flex items-center gap-2 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> {stage}</p>
      )}
      {done && <p className="text-sm text-emerald-300">Verified — taking you back.</p>}
      {error && (
        <div className="w-full rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
          <p className="text-sm text-amber-100">{error}</p>
          <button onClick={() => void run()} className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-ink-950 hover:bg-emerald-400">Try again</button>
        </div>
      )}

      {/* A WAY OUT, AND IT HAS TO BE HERE.
          This page had no link on it anywhere. In the installed app there is no
          address bar and, on iOS, no back button — so a check that fails leaves
          somebody on a screen with a "Try again" button and nothing else, for
          as long as it keeps failing. A gate that fails to a challenge rather
          than a lockout has to include the door out of the challenge. */}
      {error && (
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
          <Link href="/" className="font-semibold text-slate-300 underline underline-offset-4 hover:text-white">Back to the site</Link>
          <Link href="/login" className="font-semibold text-slate-300 underline underline-offset-4 hover:text-white">Sign in</Link>
          <Link href="/contact" className="font-semibold text-slate-300 underline underline-offset-4 hover:text-white">Get help</Link>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-slate-600">
        This check stops scripts and account farms, which is the threat that actually drains a platform. It does not claim to stop a determined person driving a real browser — no web check does, and saying otherwise would be the dishonest part.
      </p>
    </div>
  );
}

export default function VerifyHumanPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-ink-950"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>}>
      <Verify />
    </Suspense>
  );
}
