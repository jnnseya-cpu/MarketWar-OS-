"use client";

// Global error boundary — the OS degrades gracefully instead of white-screening.

import { RefreshCcw, ShieldAlert } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h1 className="font-display text-2xl font-bold text-white">Something broke — the OS caught it.</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        The error is contained to this view; your data and campaigns are untouched.
        {error.digest && <span className="mt-1 block text-xs text-slate-600">Ref: {error.digest}</span>}
      </p>
      <button type="button" onClick={reset} className="btn-primary mt-6">
        <RefreshCcw className="h-4 w-4" /> Try again
      </button>
    </div>
  );
}
