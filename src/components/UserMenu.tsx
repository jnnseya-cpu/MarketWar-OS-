"use client";

// Signed-in identity + Sign out. Shows the current user's email (proof the
// session survived the refresh) and a working logout. In demo mode (no Firebase
// web keys) it shows a "Sign in" link instead of a fake account.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, Loader2, UserRound } from "lucide-react";
import { useAuthUser } from "@/frontend/use-auth-user";

export default function UserMenu({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { user, loading, configured, signOutNow } = useAuthUser();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOutNow();
      router.replace("/login");
    } finally {
      setBusy(false);
    }
  }

  // Demo mode — no accounts. Offer a way in, never a fake identity.
  if (!configured) {
    return (
      <Link href="/login" className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-emerald-300">
        <UserRound className="h-4 w-4" /> Sign in
      </Link>
    );
  }

  if (loading) {
    return <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking session…</p>;
  }

  if (!user) {
    return (
      <Link href="/login" className="flex items-center gap-2 text-xs font-medium text-amber-400 hover:text-amber-300">
        <UserRound className="h-4 w-4" /> Session ended — sign in
      </Link>
    );
  }

  const label = user.displayName || user.email || "Signed in";
  const initial = (user.email || user.displayName || "?").charAt(0).toUpperCase();

  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300">{initial}</span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-200" title={label}>{label}</p>
          {!compact && <p className="text-[10px] text-slate-500">Signed in</p>}
        </div>
      </div>
      <div className={compact ? "flex items-center gap-1" : "flex items-center gap-2"}>
        <Link href="/dashboard/settings" title="Account & settings" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 hover:bg-ink-800 hover:text-slate-200">
          <Settings className="h-3.5 w-3.5" /> {compact ? "" : "Account"}
        </Link>
        <button onClick={handleSignOut} disabled={busy} title="Sign out" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />} {compact ? "" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
