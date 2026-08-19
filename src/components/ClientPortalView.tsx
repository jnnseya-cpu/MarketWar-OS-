"use client";

// WHAT THE CLIENT SEES.
//
// One item, three buttons, no navigation. There is no sidebar, no brand
// switcher and no link into the product, because this person is not a user and
// an upsell here costs the agency their credibility rather than earning us a
// customer.
//
// Two decisions worth stating:
//
//   • THE NAME FIELD IS OPTIONAL AND ASKED FOR ANYWAY. An approval attributed
//     to "Client (via approval link)" is worth much less to an agency six
//     months later than one attributed to a person, and asking is free.
//   • A DECIDED ITEM SHOWS NO BUTTONS. The engine returns the legal actions and
//     this renders exactly those, so a client cannot be asked twice — and if
//     somebody re-sends an old link, the page says what already happened.

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, MessageSquareWarning, XCircle, Copy, Check } from "lucide-react";

type PortalView = {
  itemId: string;
  title: string;
  description: string;
  assetUrl?: string;
  state: string;
  actions: string[];
  history: { action: string; at: string; note?: string }[];
  note: string;
};

const ACTION_LABEL: Record<string, { label: string; hint: string; className: string; Icon: typeof CheckCircle2 }> = {
  approve: {
    label: "Approve",
    hint: "Happy for this to go out.",
    className: "bg-emerald-500 text-slate-900 hover:bg-emerald-400",
    Icon: CheckCircle2,
  },
  request_changes: {
    label: "Request changes",
    hint: "Nearly — say what to change.",
    className: "border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20",
    Icon: MessageSquareWarning,
  },
  reject: {
    label: "Reject",
    hint: "Not this one.",
    className: "border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
    Icon: XCircle,
  },
};

export default function ClientPortalView({ token }: { token: string }) {
  const [data, setData] = useState<PortalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // A client's most common next move is not approving — it is forwarding the
  // thing to a colleague and asking what they think. Without this they retype
  // it or screenshot it, which is how a caveat gets lost between two people.
  async function copyDetails() {
    if (!data) return;
    const text = [data.title, "", data.description, data.assetUrl ? `\nFile: ${data.assetUrl}` : ""].join("\n").trim();
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Could not copy — select the text and copy it manually."); }
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/portal?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || "That link could not be opened."); setData(null); }
      else setData(body as PortalView);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function decide(action: string) {
    // The engine refuses a change request with no note, but saying so here saves
    // the client a round trip to be told off by a server.
    if (action !== "approve" && !note.trim()) {
      setError("Add a line saying what needs to change — whoever made this cannot act on a rejection with no reason.");
      return;
    }
    setBusy(action); setError(null);
    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action, note: note.trim() || undefined, name: name.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error || "That did not go through.");
      else { setDone(body.note as string); await load(); }
    } catch {
      setError("Could not reach the server. Nothing was recorded — try again.");
    } finally { setBusy(null); }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>Opening…</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200">
        <p className="font-semibold">This link did not open.</p>
        <p className="mt-2 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {done && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
          <p className="font-semibold">{done}</p>
          <p className="mt-1 text-sm text-emerald-300/80">You can close this page. Nothing else is needed from you.</p>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-xl font-semibold text-white">{data.title}</h2>
        {data.description && <p className="mt-2 whitespace-pre-wrap text-slate-300">{data.description}</p>}
        {data.assetUrl && (
          <a
            href={data.assetUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-4 inline-block text-sm font-medium text-sky-300 underline underline-offset-4 hover:text-sky-200"
          >
            Open the file
          </a>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">{data.note}</p>
          <button
            type="button" onClick={copyDetails}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10"
          >
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy the details"}
          </button>
        </div>
      </div>

      {data.actions.length > 0 && (
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div>
            <label htmlFor="portal-name" className="block text-sm font-medium text-slate-300">Your name <span className="text-slate-500">(optional, but it goes on the record)</span></label>
            <input
              id="portal-name" value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-white placeholder:text-slate-600"
              placeholder="e.g. Priya Anand"
            />
          </div>
          <div>
            <label htmlFor="portal-note" className="block text-sm font-medium text-slate-300">A note <span className="text-slate-500">(required if you are asking for a change)</span></label>
            <textarea
              id="portal-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-white placeholder:text-slate-600"
              placeholder="e.g. Swap the second line for the offer we agreed, then it's good to go."
            />
          </div>

          {error && <p className="text-sm text-rose-300">{error}</p>}

          <div className="flex flex-wrap gap-3">
            {data.actions.map((a) => {
              const meta = ACTION_LABEL[a];
              if (!meta) return null;
              const { Icon } = meta;
              return (
                <button
                  key={a} type="button" onClick={() => decide(a)} disabled={busy !== null}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${meta.className}`}
                  title={meta.hint}
                >
                  {busy === a ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {data.history.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">What has happened so far</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {data.history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex flex-wrap gap-2">
                <span className="text-slate-500">{h.at.slice(0, 10)}</span>
                <span className="font-medium">{h.action.replace(/_/g, " ")}</span>
                {h.note && <span className="text-slate-400">— {h.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
