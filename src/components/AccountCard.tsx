"use client";

// Account panel for Settings — shows the signed-in identity and details
// (email, verification, user id), lets the user change their password in-app,
// and sign out. Demo mode (no Firebase web keys) shows a sign-in prompt.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound, LogOut, Loader2, BadgeCheck, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useAuthUser } from "@/frontend/use-auth-user";
import { firebaseAuth } from "@/frontend/firebase-client";
import ChangePassword from "@/components/ChangePassword";

export default function AccountCard() {
  const router = useRouter();
  const { user, loading, configured, signOutNow } = useAuthUser();
  const [busy, setBusy] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const verified = firebaseAuth?.currentUser?.emailVerified ?? false;

  async function handleSignOut() {
    setBusy(true);
    try { await signOutNow(); router.replace("/login"); } finally { setBusy(false); }
  }

  async function resendVerification() {
    setVerifyMsg(null);
    const u = firebaseAuth?.currentUser;
    if (!u) return;
    try {
      const { sendEmailVerification } = await import("firebase/auth");
      await sendEmailVerification(u, { url: `${window.location.origin}/dashboard` });
      setVerifyMsg("Verification email sent — check your inbox (and spam).");
    } catch (e) {
      setVerifyMsg(e instanceof Error ? e.message.replace("Firebase: ", "") : "Could not send verification email.");
    }
  }

  return (
    <div className="mb-8 card p-5">
      <div className="mb-4 flex items-center gap-2">
        <UserRound className="h-5 w-5 text-emerald-400" />
        <h3 className="font-display text-sm font-bold text-white">Account</h3>
      </div>

      {!configured ? (
        <p className="text-sm text-slate-400">
          Demo mode — <Link href="/login" className="text-emerald-300 hover:underline">sign in</Link> to manage your account.
        </p>
      ) : loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading account…</p>
      ) : !user ? (
        <p className="text-sm text-amber-300">Your session ended — <Link href="/login" className="hover:underline">sign in again</Link>.</p>
      ) : (
        <div className="space-y-5">
          {/* Details */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="Email" value={user.email || "—"} />
            <Detail label="Name" value={user.displayName || "—"} />
            <div>
              <p className="text-[11px] font-semibold text-slate-500">Email status</p>
              {verified ? (
                <p className="flex items-center gap-1.5 text-sm text-emerald-300"><BadgeCheck className="h-4 w-4" /> Verified</p>
              ) : (
                <div>
                  <p className="flex items-center gap-1.5 text-sm text-amber-300"><ShieldAlert className="h-4 w-4" /> Unverified</p>
                  <button onClick={resendVerification} className="mt-1 text-xs font-medium text-emerald-300 hover:underline">Resend verification email</button>
                  {verifyMsg && <p className="mt-1 text-[11px] text-slate-400">{verifyMsg}</p>}
                </div>
              )}
            </div>
            <Detail label="User ID" value={user.uid} mono />
          </div>

          {/* Change password */}
          <div className="border-t border-ink-700/60 pt-4">
            <p className="mb-2 text-xs font-semibold text-slate-300">Change password</p>
            <ChangePassword />
          </div>

          {/* Sign out */}
          <div className="border-t border-ink-700/60 pt-4">
            <button onClick={handleSignOut} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className={`truncate text-sm text-slate-200 ${mono ? "font-mono text-xs" : ""}`} title={value}>{value}</p>
    </div>
  );
}
