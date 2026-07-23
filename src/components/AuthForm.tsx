"use client";

// Shared login/signup form. Uses Firebase Auth when NEXT_PUBLIC_FIREBASE_*
// env vars are present (email/password + Google SSO — auth layer 1 of the
// five-layer model in docs/ai-os/08 §B.4a); otherwise renders the demo-mode
// path so the zero-config platform stays fully usable.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail, User, Ticket } from "lucide-react";
import { BrandLockup } from "@/components/Logo";
import { firebaseAuth } from "@/frontend/firebase-client";

type PublicInvite = { token: string; companyName: string; planId: string; brands: number; status: string };

type Mode = "login" | "signup";

// Mobile browsers block/lose auth pop-ups — use the redirect flow there.
const isMobileBrowser = () => typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Turn raw Firebase error codes into plain, honest, actionable messages.
function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || "";
  const raw = err instanceof Error ? err.message.replace("Firebase: ", "") : "Authentication failed.";
  const map: Record<string, string> = {
    "auth/internal-error": "Sign-in is temporarily unavailable for this site. If it persists, the sign-in providers may still need enabling for this domain.",
    "auth/operation-not-allowed": "This sign-in method isn't switched on yet. Try the other option or contact support.",
    "auth/email-already-in-use": "That email already has an account — log in instead.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/weak-password": "Choose a stronger password — at least 8 characters.",
    "auth/missing-password": "Enter a password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "No account with that email — create one first.",
    "auth/too-many-requests": "Too many attempts — wait a moment and try again.",
    "auth/popup-blocked": "Your browser blocked the Google window — redirecting you instead…",
    "auth/popup-closed-by-user": "The Google window closed before finishing — try again.",
    "auth/cancelled-popup-request": "Google sign-in was interrupted — try again.",
    "auth/unauthorized-domain": "This site isn't authorised for Google sign-in yet.",
    "auth/network-request-failed": "Network problem — check your connection and try again.",
  };
  return map[code] || raw;
}

const COPY: Record<Mode, { title: string; cta: string; alt: string; altHref: string; altCta: string }> = {
  login: {
    title: "Welcome back, Commander",
    cta: "Log in",
    alt: "New to MarketWar OS?",
    altHref: "/signup",
    altCta: "Create your account",
  },
  signup: {
    title: "Take command of your growth",
    cta: "Create account",
    alt: "Already have an account?",
    altHref: "/login",
    altCta: "Log in",
  },
};

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invite, setInvite] = useState<PublicInvite | null>(null);
  const copy = COPY[mode];

  // Invited company? Read ?invite=<token> (client-only, no Suspense needed) and
  // validate it, so sign-up shows who invited them and accepts on completion.
  useEffect(() => {
    if (mode !== "signup" || typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    fetch(`/api/invites/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => { if (d.valid && d.invite) { setInvite(d.invite); if (d.invite.companyName) setName(d.invite.companyName); } })
      .catch(() => {});
  }, [mode]);

  // Complete a Google REDIRECT sign-in (mobile / popup-blocked path): when the
  // user lands back on this page after the Google redirect, finish the flow.
  useEffect(() => {
    if (!firebaseAuth) return;
    (async () => {
      try {
        const { getRedirectResult } = await import("firebase/auth");
        const res = await getRedirectResult(firebaseAuth);
        if (res?.user) {
          setBusy(true);
          await acceptInviteIfAny(res.user.uid);
          const stored = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("mw_auth_dest") : null;
          if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("mw_auth_dest");
          router.push(stored || (mode === "signup" ? "/choose-plan" : "/dashboard"));
        }
      } catch (err) {
        setError(friendlyAuthError(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acceptInviteIfAny(uid?: string) {
    if (!invite) return;
    try {
      await fetch(`/api/invites/${encodeURIComponent(invite.token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid }),
      });
    } catch { /* non-fatal */ }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // After sign-up the user picks a plan; login goes straight to the dashboard.
    const dest = mode === "signup" ? (invite ? "/onboarding" : "/choose-plan") : "/dashboard";
    // Demo mode (no Firebase): the form is real but accounts aren't persisted —
    // continue the flow so it's testable end to end.
    if (!firebaseAuth) { await acceptInviteIfAny(); router.push(dest); return; }
    setBusy(true);
    setError(null);
    try {
      const { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, setPersistence, browserLocalPersistence } = await import(
        "firebase/auth"
      );
      // Keep the session across refreshes (localStorage) so the user stays logged in.
      await setPersistence(firebaseAuth, browserLocalPersistence).catch(() => {});
      if (mode === "login") {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
        // Send the branded email-verification link on sign-up. The action URL
        // returns to the app so the user lands back in MarketWar OS after
        // verifying; the email template + sender name are set in the Firebase
        // console (Authentication → Templates) — see docs/DEPLOYMENT.md.
        try {
          await sendEmailVerification(cred.user, { url: `${window.location.origin}/dashboard` });
        } catch { /* non-fatal — verification can be re-sent from Settings */ }
      }
      await acceptInviteIfAny(firebaseAuth.currentUser?.uid);
      router.push(dest);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    setError(null); setNotice(null);
    if (!firebaseAuth) { setNotice("Demo mode — password reset activates once Firebase Auth is connected."); return; }
    if (!email) { setError("Enter your email above first, then tap Forgot password."); return; }
    setBusy(true);
    try {
      const { sendPasswordResetEmail } = await import("firebase/auth");
      await sendPasswordResetEmail(firebaseAuth, email, { url: `${window.location.origin}/login` });
      setNotice(`Password-reset email sent to ${email}. Check your inbox.`);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const dest = mode === "signup" ? (invite ? "/onboarding" : "/choose-plan") : "/dashboard";
    if (!firebaseAuth) { await acceptInviteIfAny(); router.push(dest); return; }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { GoogleAuthProvider, signInWithPopup, signInWithRedirect, setPersistence, browserLocalPersistence } = await import("firebase/auth");
      await setPersistence(firebaseAuth, browserLocalPersistence).catch(() => {});
      const provider = new GoogleAuthProvider();
      // Remember where to land — the redirect flow leaves and re-enters the page.
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem("mw_auth_dest", dest);

      // Mobile browsers routinely block or drop auth pop-ups → go straight to
      // the redirect flow (the page navigates to Google and back).
      if (isMobileBrowser()) {
        await signInWithRedirect(firebaseAuth, provider);
        return; // navigation happens; getRedirectResult (above) finishes it
      }
      // Desktop: try the pop-up; if the browser blocks/closes it, fall back to
      // redirect instead of dead-ending.
      try {
        await signInWithPopup(firebaseAuth, provider);
      } catch (e) {
        const code = (e as { code?: string })?.code || "";
        if (["auth/popup-blocked", "auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/operation-not-supported-in-this-environment"].includes(code)) {
          await signInWithRedirect(firebaseAuth, provider);
          return;
        }
        throw e;
      }
      await acceptInviteIfAny(firebaseAuth.currentUser?.uid);
      router.push(dest);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <BrandLockup />
        </Link>

        <div className="card p-7">
          <h1 className="mb-1 text-center font-display text-2xl font-bold text-white">{copy.title}</h1>
          <p className="mb-6 text-center text-sm text-slate-400">
            {mode === "login"
              ? "Your command centre is waiting."
              : "23 AI agents, one operating system — live in minutes."}
          </p>

              {invite && mode === "signup" && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-100">
                  <Ticket className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>You&apos;re invited to test <strong className="text-white">{invite.companyName}</strong> on MarketWar OS — {invite.planId} plan, {invite.brands} brands. Create your account to start.</span>
                </div>
              )}
              <form onSubmit={submit} className="space-y-3">
                {mode === "signup" && (
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-400">Full name</span>
                    <span className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 focus-within:border-emerald-500/60">
                      <User className="h-4 w-4 shrink-0 text-slate-500" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Alex Carter"
                        className="w-full bg-transparent text-sm text-white placeholder-slate-600 outline-none"
                      />
                    </span>
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-400">Email</span>
                  <span className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 focus-within:border-emerald-500/60">
                    <Mail className="h-4 w-4 shrink-0 text-slate-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@business.com"
                      className="w-full bg-transparent text-sm text-white placeholder-slate-600 outline-none"
                    />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-400">Password</span>
                  <span className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 focus-within:border-emerald-500/60">
                    <Lock className="h-4 w-4 shrink-0 text-slate-500" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? "Minimum 8 characters" : "••••••••"}
                      className="w-full bg-transparent text-sm text-white placeholder-slate-600 outline-none"
                    />
                  </span>
                </label>

                {mode === "login" && (
                  <div className="flex justify-end">
                    <button type="button" onClick={forgotPassword} disabled={busy} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-60">
                      Forgot password?
                    </button>
                  </div>
                )}

                {error && (
                  <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                    {notice}
                  </p>
                )}

                <button type="submit" disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {copy.cta}
                </button>
              </form>

              <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
                <span className="h-px flex-1 bg-ink-700" /> or <span className="h-px flex-1 bg-ink-700" />
              </div>

              <button
                type="button"
                onClick={google}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-700 bg-ink-850 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-emerald-500/40 disabled:opacity-60"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                  <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06L5.84 9.9c.87-2.6 3.3-4.52 6.16-4.52Z" />
                </svg>
                Continue with Google
              </button>
        </div>

        <p className="mt-5 text-center text-sm text-slate-500">
          {copy.alt}{" "}
          <Link href={copy.altHref} className="font-semibold text-emerald-400 transition hover:text-emerald-300">
            {copy.altCta}
          </Link>
        </p>
      </div>
    </div>
  );
}
