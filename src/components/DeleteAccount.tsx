"use client";

// Danger zone — permanent account deletion (GDPR right to erasure). Deletes the
// Firebase Auth user client-side; server-side purge of Firestore/Storage data
// runs via the account.deletion webhook/Cloud Function. Requires a recent login;
// if Firebase re-auth is needed the user is sent to sign in again first.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { firebaseAuth, firebaseConfigured } from "@/frontend/firebase-client";

export default function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setError(null);
    setBusy(true);
    try {
      if (!firebaseAuth?.currentUser) { setError("You're in demo mode — account deletion is available once you're signed in with Firebase."); setBusy(false); return; }
      const { deleteUser } = await import("firebase/auth");
      await deleteUser(firebaseAuth.currentUser);
      router.push("/?deleted=1");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Deletion failed.";
      if (/recent|reauth|requires-recent-login/i.test(msg)) {
        setError("For your security, please sign in again, then retry deletion.");
        setTimeout(() => router.push("/login"), 1800);
      } else {
        setError(msg.replace("Firebase: ", ""));
      }
      setBusy(false);
    }
  }

  return (
    <div className="card border-rose-500/25 p-5">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-rose-400" />
        <h2 className="font-display font-bold text-white">Danger zone</h2>
      </div>
      <p className="text-sm text-slate-400">
        Permanently delete your account and request erasure of your personal data. This cannot be undone. Purchased
        top-up ACUs are forfeited; owned exports remain yours if downloaded first.
      </p>

      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-4 rounded-lg border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10">
          Delete my account
        </button>
      ) : (
        <div className="mt-4 space-y-3 rounded-lg border border-rose-500/25 bg-rose-500/5 p-4">
          <p className="text-sm text-slate-300">Type <span className="font-mono font-bold text-rose-300">DELETE</span> to confirm.</p>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE"
            className="w-full max-w-xs rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white outline-none focus:border-rose-500/60" />
          {error && <p className="text-xs text-rose-300">{error}</p>}
          {!firebaseConfigured && <p className="text-xs text-slate-500">Demo mode: connect Firebase to enable real deletion.</p>}
          <div className="flex gap-2">
            <button onClick={del} disabled={busy || confirmText !== "DELETE"} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white hover:bg-rose-400 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Permanently delete
            </button>
            <button onClick={() => { setOpen(false); setConfirmText(""); setError(null); }} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
