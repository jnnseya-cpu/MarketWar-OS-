"use client";

// THE PUBLIC HEADER'S ACCOUNT LINKS, WHICH USED TO LIE.
//
// Reported from production: "when you're already logged in and click the logo it
// takes you out and need to re login again."
//
// The session was never lost. The sidebar logo links to "/", and both public
// headers rendered "Log in" and "Get started" as hard-coded links with no idea
// whether anyone was signed in — so a signed-in owner clicking their own logo
// landed on a page telling them to log in, believed they had been signed out,
// and authenticated again. The platform's rule against reporting a state it has
// not checked applies to the header as much as to a send counter.
//
// Signed in → one link back to the dashboard, and no invitation to authenticate
// again. Signed out, or no Firebase configured at all (demo mode) → exactly what
// was there before.
//
// While the persisted session is still rehydrating it claims NEITHER state: a
// spacer holds the layout instead. `firebaseConfigured` is read from env at
// module scope on both the server and the client, so `loading` starts the same
// on both and this does not cause a hydration mismatch.

import Link from "next/link";
import { useAuthUser } from "@/frontend/use-auth-user";

export default function SiteAuthLinks({
  signInHref = "/login",
  signInLabel = "Log in",
  signInClassName = "hidden text-sm font-semibold text-slate-300 transition hover:text-white sm:block",
  ctaHref = "/signup",
  ctaLabel = "Get started",
  ctaClassName = "rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-bold text-ink-950 hover:bg-emerald-400",
}: {
  signInHref?: string;
  signInLabel?: string;
  signInClassName?: string;
  ctaHref?: string;
  ctaLabel?: string;
  ctaClassName?: string;
}) {
  const { user, loading } = useAuthUser();

  // Nothing is known yet. Hold the space rather than guess.
  if (loading) return <span aria-hidden className="block h-9 w-28" />;

  if (user) {
    return (
      <Link href="/dashboard" className={ctaClassName}>
        Go to dashboard
      </Link>
    );
  }

  return (
    <>
      <Link href={signInHref} className={signInClassName}>{signInLabel}</Link>
      <Link href={ctaHref} className={ctaClassName}>{ctaLabel}</Link>
    </>
  );
}
