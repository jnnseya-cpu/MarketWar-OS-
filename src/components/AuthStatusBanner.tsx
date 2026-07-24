"use client";

// Honest auth-state banner. The #1 cause of "nothing works / everything empty"
// is an unauthenticated session: every brand-scoped data op (vault, publish,
// email, campaigns) 401s when you're not signed in, and silently shows empty.
// This calls /api/health/auth WITH your token (authedFetch) and, only if the
// session is NOT valid, shows a clear banner telling you why — so empty states
// are never a mystery.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";

type Session = { signedIn: boolean; tokenValid?: boolean; reason?: string; fix?: string; note?: string };
type Diag = { session: Session; projectMatch?: { match: boolean; clientProject?: string | null; adminProject?: string | null } };

export default function AuthStatusBanner() {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let on = true;
    // Small delay so Firebase auth can restore the session first.
    const t = setTimeout(() => {
      authedFetch("/api/health/auth")
        .then((r) => r.json())
        .then((d) => { if (on) setDiag(d as Diag); })
        .catch(() => {});
    }, 1200);
    return () => { on = false; clearTimeout(t); };
  }, []);

  if (!diag || dismissed) return null;
  const s = diag.session;
  // Session valid → nothing to show.
  if (s?.signedIn && s?.tokenValid) return null;

  const projectBroken = diag.projectMatch && diag.projectMatch.match === false;
  const message = !s?.signedIn
    ? "You're not signed in — so your data (vault, published pages, campaigns, saved work) can't load or save. Sign in to use the platform."
    : projectBroken
      ? "Your session token isn't accepted because the client and server Firebase projects don't match. This blocks all data features until the environment is fixed."
      : (s?.fix || s?.reason || "Your session isn't valid — sign in again.");

  return (
    <div className="sticky top-0 z-50 border-b border-amber-500/30 bg-amber-500/[0.12] px-4 py-2.5 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <p className="flex-1 text-amber-100">{message}</p>
        {!s?.signedIn && <Link href="/login" className="shrink-0 rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-ink-950 hover:bg-amber-400">Sign in</Link>}
        <button onClick={() => setDismissed(true)} className="shrink-0 text-amber-300/70 hover:text-amber-200" aria-label="Dismiss"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
