"use client";

// Change password for a signed-in user. Uses Firebase updatePassword, which
// requires a recent login — so if Firebase asks for re-auth, we transparently
// re-authenticate with the current password (EmailAuthProvider) and retry. No
// email round-trip needed, which matters for login-only addresses (e.g. the
// admin account) that have no mailbox to receive a reset link.

import { useState } from "react";
import { KeyRound, Loader2, Check } from "lucide-react";
import { firebaseAuth, firebaseConfigured } from "@/frontend/firebase-client";

export default function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setDone(false);
    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("New password and confirmation don't match."); return; }
    const user = firebaseAuth?.currentUser;
    if (!firebaseConfigured || !user || !user.email) { setError("Sign in first to change your password."); return; }

    setBusy(true);
    try {
      const { updatePassword, reauthenticateWithCredential, EmailAuthProvider } = await import("firebase/auth");
      try {
        await updatePassword(user, next);
      } catch (err) {
        // Firebase requires a recent login for password changes — re-auth with
        // the current password and retry once.
        if (err instanceof Error && /recent|reauth|requires-recent-login/i.test(err.message)) {
          const cred = EmailAuthProvider.credential(user.email, current);
          await reauthenticateWithCredential(user, cred);
          await updatePassword(user, next);
        } else {
          throw err;
        }
      }
      setDone(true);
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      const msg = err instanceof Error ? err.message.replace("Firebase: ", "") : "Could not change password.";
      setError(/wrong-password|invalid-credential/i.test(msg) ? "Current password is incorrect." : msg);
    } finally {
      setBusy(false);
    }
  }

  if (!firebaseConfigured) {
    return <p className="text-xs text-slate-500">Demo mode — password changes activate once Firebase Auth is connected.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-400">Current password</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password"
            className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/60" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-400">New password</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password"
            className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/60" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-400">Confirm new</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
            className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/60" />
        </label>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {done && <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-300"><Check className="h-3.5 w-3.5" /> Password updated. Use it next time you sign in.</p>}
      <button type="submit" disabled={busy} className="btn-primary justify-center disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Update password
      </button>
    </form>
  );
}
