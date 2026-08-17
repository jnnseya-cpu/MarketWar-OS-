"use client";

// THE BUTTON YOU REACH FOR WHEN SOMETHING IS WRONG AND YOU DO NOT YET KNOW WHAT.
//
// Two shapes, one component, because a stop that lives only on a settings page
// is a stop nobody can find during the ten seconds they need it:
//
//   • `banner` — mounted in the dashboard layout. Invisible until something is
//     halted, and then it is on every screen with the reason, who pressed it and
//     the way to release it. A halt nobody can see is a platform that looks
//     broken.
//   • the full control — the settings page. Engaging needs a reason and
//     releasing needs a note, both required by the engine rather than by this
//     form, so the same rule holds for anything else that calls it.
//
// The one thing this deliberately says out loud: whether the halt was saved.
// Without Firebase it stops this server and not the others, and an operator who
// believes the platform is stopped and is wrong is worse off than one who knows
// the switch is local.

import { useCallback, useEffect, useState } from "react";
import { OctagonX, ShieldCheck, Loader2 } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";

type Halt = {
  scope: string;
  lanes: string[];
  reason: string;
  engagedBy: string;
  engagedAt: string;
};
type State = { active: Halt[]; lanes: { id: string; meaning: string }[]; neverHalted: string };

export default function EmergencyStop({ variant = "full" }: { variant?: "full" | "banner" }) {
  const [state, setState] = useState<State | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/emergency-stop");
      if (!res.ok) return;
      setState((await res.json()) as State);
    } catch {
      /* the control still renders; the button is what matters */
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = state?.active?.[0] || null;

  async function post(body: Record<string, unknown>) {
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await authedFetch("/api/emergency-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; note?: string };
      if (!res.ok) { setErr(data.error || "That did not work."); return; }
      setMsg(data.note || "Done.");
      setReason(""); setNote("");
      await load();
    } catch {
      setErr("The request did not reach the server. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  // The banner is nothing at all until something is stopped.
  if (variant === "banner") {
    if (!active) return null;
    return (
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3">
        <OctagonX className="h-4 w-4 shrink-0 text-rose-300" />
        <span className="text-sm font-bold text-rose-200">
          {active.scope === "*" ? "Everything is paused" : "This brand is paused"}
        </span>
        <span className="text-sm text-rose-100/80">
          {active.engagedBy} stopped it at {active.engagedAt.slice(0, 16).replace("T", " ")} — &ldquo;{active.reason}&rdquo;
        </span>
        <a href="/dashboard/settings#emergency-stop" className="ml-auto text-xs font-semibold text-rose-200 underline underline-offset-2">
          Release it
        </a>
      </div>
    );
  }

  return (
    <div id="emergency-stop" className={`card p-5 ${active ? "border-rose-500/40" : ""}`}>
      <div className="mb-1 flex items-center gap-2">
        {active ? <OctagonX className="h-4 w-4 text-rose-400" /> : <ShieldCheck className="h-4 w-4 text-emerald-400" />}
        <h2 className="font-display font-bold text-white">Emergency stop</h2>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Stops everything the platform does on its own — marketing sends, publishing, overnight runs, spend and payouts.
        {state?.neverHalted ? ` ${state.neverHalted}` : ""}
      </p>

      {active ? (
        <>
          <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] p-3">
            <p className="text-sm font-semibold text-rose-200">
              {active.scope === "*" ? "Paused platform-wide" : `Paused for ${active.scope}`}
            </p>
            <p className="mt-1 text-xs text-rose-100/80">
              {active.engagedBy} · {active.engagedAt.slice(0, 16).replace("T", " ")} · &ldquo;{active.reason}&rdquo;
            </p>
            <p className="mt-1 text-[11px] text-rose-100/60">Stopped: {active.lanes.join(", ")}</p>
          </div>
          <label className="mb-1 block text-xs font-semibold text-slate-300" htmlFor="es-note">
            What changed? (required — it goes in the record)
          </label>
          <input
            id="es-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Rotated the leaked key and confirmed no sends went out"
            className="mb-3 w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-600"
          />
          <button
            type="button"
            disabled={busy || note.trim().length < 8}
            onClick={() => void post({ action: "release", scope: active.scope, note })}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-ink-950 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Start again
          </button>
        </>
      ) : (
        <>
          <label className="mb-1 block text-xs font-semibold text-slate-300" htmlFor="es-reason">
            Why? (required — so you can explain it later)
          </label>
          <input
            id="es-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Wrong list loaded into the campaign"
            className="mb-3 w-full rounded-lg border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-white placeholder:text-slate-600"
          />
          <button
            type="button"
            disabled={busy || reason.trim().length < 8}
            onClick={() => void post({ action: "engage", reason })}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <OctagonX className="h-4 w-4" />} Pause all automation
          </button>
        </>
      )}

      {msg && <p className="mt-3 text-xs text-emerald-300">{msg}</p>}
      {err && <p className="mt-3 text-xs text-amber-300">{err}</p>}

      {state?.lanes?.length ? (
        <ul className="mt-4 space-y-1 border-t border-white/[0.06] pt-3">
          {state.lanes.map((l) => (
            <li key={l.id} className="text-[11px] text-slate-500">
              <span className="font-semibold text-slate-400">{l.id}</span> — {l.meaning}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
