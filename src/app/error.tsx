"use client";

// Global error boundary — the OS degrades gracefully instead of white-screening.
//
// IT USED TO SWALLOW THE ERROR. It caught the crash, printed "Something broke —
// the OS caught it", and reported it to nobody: no log, no endpoint, not even
// the message on screen. So the customer had a Try again button and no way to
// say what happened, and the one person who could fix it never found out. A
// boundary that eats the error is a nicer white screen, not a fix.
//
// Now it does three things beyond looking calm: it SAYS what threw, it gives a
// reference the customer can quote, and it POSTS the crash to /api/client-error
// so the same failure is countable rather than anecdotal.

import { useEffect, useState } from "react";
import { Check, Copy, RefreshCcw, ShieldAlert } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [ref, setRef] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const route = typeof window !== "undefined" ? window.location.pathname : "";

  useEffect(() => {
    // Reported once per crash. Failing to report must never throw inside the
    // boundary itself — that is how a broken view becomes a broken browser tab.
    let off = false;
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error?.message || String(error),
        route,
        digest: error?.digest || "",
        stack: error?.stack || "",
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (!off && d?.ref) setRef(d.ref); })
      .catch(() => { /* the screen below is still useful without it */ });
    return () => { off = true; };
  }, [error, route]);

  const detail = [error?.message || "", route ? `at ${route}` : "", ref ? `ref ${ref}` : "", error?.digest ? `digest ${error.digest}` : ""]
    .filter(Boolean).join(" · ");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h1 className="font-display text-2xl font-bold text-white">Something broke — the OS caught it.</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        The error is contained to this view; your data and campaigns are untouched.
      </p>

      {/* What actually threw. Shown rather than hidden: "it broke" is not
          something anybody can act on, and the message usually names the thing. */}
      {error?.message && (
        <p className="mt-4 max-w-xl break-words rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-left font-mono text-xs leading-relaxed text-slate-300">
          {error.message}
          {route && <span className="mt-1 block text-slate-500">on {route}</span>}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          <RefreshCcw className="h-4 w-4" /> Try again
        </button>
        {detail && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(detail).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {});
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500/40"
          >
            {copied ? <><Check className="h-4 w-4 text-emerald-400" /> Copied</> : <><Copy className="h-4 w-4" /> Copy details</>}
          </button>
        )}
      </div>

      <p className="mt-4 text-xs text-slate-600">
        {ref ? <>Reported. Quote <span className="font-mono text-slate-400">{ref}</span> and we can find this exact failure.</> : "Reporting this…"}
      </p>
    </div>
  );
}
