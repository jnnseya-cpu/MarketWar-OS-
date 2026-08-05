"use client";

// Connect THIS BRAND's YouTube channel.
//
// The captions reader was built, the route accepted a brandId, and there was no
// way for a customer to reach it: the only Google connect button on the platform
// lives on the admin-only Go-Live board and connects the PLATFORM's account. A
// capability nobody can switch on is a capability nobody has.
//
// What it says is as important as what it does. Asking somebody to hand over a
// Google account is asking for trust, so the panel states the whole exchange
// before the button: what is read, what is not, and whose connection it is.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Youtube } from "lucide-react";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

export default function ConnectYouTube() {
  const { activeBrand } = useActiveBrand();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [clientReady, setClientReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeBrand?.id) { setConnected(null); return; }
    try {
      const r = await authedFetch(`/api/google/connect?brandId=${encodeURIComponent(activeBrand.id)}`);
      const d = await r.json();
      if (r.ok) { setConnected(Boolean(d.connected)); setClientReady(d.clientReady !== false); }
    } catch { /* the panel simply offers the button */ }
  }, [activeBrand?.id]);

  useEffect(() => { load(); }, [load]);

  async function connect() {
    if (!activeBrand?.id) return;
    setBusy(true); setError("");
    try {
      const r = await authedFetch(`/api/google/connect?brandId=${encodeURIComponent(activeBrand.id)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const d = await r.json();
      if (r.ok && d.url) { window.location.href = d.url; return; }
      setError(d.error || "Couldn't start the Google connect flow.");
    } catch { setError("Couldn't start the Google connect flow."); } finally { setBusy(false); }
  }

  if (!activeBrand?.id) return null;

  return (
    <div className="mb-6 card border-rose-500/25 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Youtube className="h-5 w-5 text-rose-400" />
        <h2 className="font-display text-lg font-bold text-white">YouTube — {activeBrand.name}</h2>
        {connected === true && (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] px-2 py-0.5 text-xs font-semibold text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> connected
          </span>
        )}
      </div>

      <p className="mb-3 text-sm text-slate-400">
        Connect the Google account that owns this brand&apos;s channel and you can paste a YouTube link straight into the
        Caption Engine and the Clip Finder. The words come from the caption track YouTube already holds for your video —
        which is more accurate than transcribing a re-encoded copy, has no file-size limit, returns immediately, and costs
        no ACUs.
      </p>

      <ul className="mb-4 space-y-1">
        {[
          "Read: the caption tracks of videos on your own channel.",
          "Never: the video file itself — YouTube does not permit that, and nothing here downloads one.",
          "Never: posting, editing or deleting anything on your channel.",
          "Yours alone: each brand connects its own account, and the platform's connection is never used on your behalf.",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />{line}
          </li>
        ))}
      </ul>

      {!clientReady && (
        <p className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-200">
          Google sign-in is not configured on this deployment yet, so the button will not do anything.
        </p>
      )}
      {error && <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}

      <button className={connected ? "btn-ghost" : "btn-primary"} onClick={connect} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Youtube className="h-4 w-4" />}
        {connected ? "Reconnect, or switch account" : "Connect this brand's YouTube"}
      </button>
    </div>
  );
}
