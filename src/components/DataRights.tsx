"use client";

// YOUR DATA, YOUR RIGHTS — the card that used to be two dead buttons.
//
// WHAT WAS HERE BEFORE. Two <button> elements with no handler, under copy that
// said "Erasure propagates everywhere — including analytics — under the GDPR
// erasure API". There was no erasure API. Pressing either one did nothing and
// said nothing. The page asserted a legal guarantee it had no implementation
// for, which is worse than an unfinished feature: a person exercising a right
// was told it had been honoured.
//
// WHAT IT DOES NOW, and every claim below is a call that happens:
//   • Export downloads a real file, read store by store from the register in
//     src/backend/privacy.ts, including the stores it CANNOT reach and why.
//   • Erasure shows what would be destroyed FIRST — counted against the live
//     data by the same code that does the erasing, never estimated — then needs
//     the word ERASE typed before anything is touched.
//   • The receipt is shown afterwards: deleted, stripped, and what the law
//     keeps. A person who asks what happened gets the numbers, not a tick.
//
// THE COPY NO LONGER OVERSTATES. Suppression lists, financial records and audit
// trails are KEPT, on a basis each one states, and the card says so before the
// button is pressed rather than in a receipt afterwards. "Propagates
// everywhere" was never true of a lawful erasure and is not claimed.

import { useState } from "react";
import { Download, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";

type Receipt = {
  dryRun: boolean;
  persistence: "live" | "memory";
  documentsErased: number;
  documentsAnonymised: number;
  storesRetained: number;
  stores: { collection: string; action: string; documents: number; basis?: string; note?: string }[];
  notReachable: { collection: string; why: string }[];
  statement: string[];
};

/**
 * Read the receipt the server sent, CHECKING each field rather than asserting
 * the shape. `res.json()` is typed `any`, so `as Receipt` would be a promise
 * nobody verified — and this component renders the numbers a person uses to
 * decide whether their data is gone. A missing field reads as zero and an
 * absent list as empty, which is the honest failure: the counts stay visibly
 * wrong instead of the card throwing on `undefined.map`.
 */
function receiptFromWire(raw: unknown): { receipt: Receipt; error?: string } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    error: typeof o.error === "string" ? o.error : undefined,
    receipt: {
      dryRun: o.dryRun === true,
      persistence: o.persistence === "live" ? "live" : "memory",
      documentsErased: num(o.documentsErased),
      documentsAnonymised: num(o.documentsAnonymised),
      storesRetained: num(o.storesRetained),
      stores: list(o.stores).map((row) => {
        const s = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        return {
          collection: str(s.collection), action: str(s.action), documents: num(s.documents),
          ...(typeof s.basis === "string" ? { basis: s.basis } : {}),
          ...(typeof s.note === "string" ? { note: s.note } : {}),
        };
      }),
      notReachable: list(o.notReachable).map((row) => {
        const s = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        return { collection: str(s.collection), why: str(s.why) };
      }),
      statement: list(o.statement).filter((l): l is string => typeof l === "string"),
    },
  };
}

export default function DataRights({ brandId }: { brandId: string | null }) {
  const [busy, setBusy] = useState<"" | "export" | "preview" | "erase">("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Receipt | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [exported, setExported] = useState<string | null>(null);

  const noBrand = !brandId;

  async function doExport() {
    if (!brandId) return;
    setError(null); setExported(null); setBusy("export");
    try {
      const res = await authedFetch(`/api/privacy?brandId=${encodeURIComponent(brandId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Export failed (${res.status})`);
      }
      // The response is the file. Saved from the blob rather than by navigating,
      // because the request carries an authorisation header a plain link cannot.
      const text = await res.text();
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `marketwar-data-export-${brandId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      const parsed: unknown = JSON.parse(text);
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      const o = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      setExported(`${num(o.recordsExported)} records from ${num(o.storesRead)} stores — downloaded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy("");
    }
  }

  async function run(action: "preview" | "erase") {
    if (!brandId) return;
    setError(null); setBusy(action);
    try {
      const res = await authedFetch("/api/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, action, ...(action === "erase" ? { confirm: "ERASE" } : {}) }),
      });
      const body = receiptFromWire(await res.json());
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      if (action === "preview") setPreview(body.receipt);
      else { setReceipt(body.receipt); setPreview(null); setConfirmText(""); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="card p-5">
      <h2 className="mb-2 font-display font-bold text-white">Your data, your rights</h2>
      <p className="mb-1 text-xs text-slate-400">
        Export everything the OS holds under this brand, or have it erased. The export is read store by store and
        lists the stores it cannot reach, with the reason for each.
      </p>
      <p className="mb-3 text-xs text-slate-500">
        Erasure keeps three things, and says so before you press it: your unsubscribe lists (deleting them would let
        us email those people again), financial records we must keep for six years, and the security audit trail.
        Everything else goes.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button" onClick={doExport} disabled={noBrand || busy !== ""}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:border-emerald-500/50 disabled:opacity-50"
        >
          {busy === "export" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export my data
        </button>
        <button
          type="button" onClick={() => run("preview")} disabled={noBrand || busy !== ""}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3.5 py-2 text-xs font-bold text-rose-300 transition hover:border-rose-500/60 disabled:opacity-50"
        >
          {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Request erasure
        </button>
      </div>

      {noBrand && <p className="mt-2 text-xs text-slate-500">Select a brand first — these rights are exercised per brand.</p>}
      {exported && <p className="mt-2 text-xs text-emerald-300">{exported}</p>}
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

      {preview && (
        <div className="mt-4 space-y-3 rounded-lg border border-rose-500/25 bg-rose-500/5 p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
            <p className="text-sm font-bold text-white">This is what erasure would do. Nothing has changed yet.</p>
          </div>
          <ul className="space-y-1 text-xs text-slate-300">
            <li><span className="font-bold text-rose-300">{preview.documentsErased}</span> records deleted</li>
            <li><span className="font-bold text-amber-300">{preview.documentsAnonymised}</span> records kept with identifying fields removed</li>
            <li><span className="font-bold text-slate-200">{preview.storesRetained}</span> stores kept on a stated legal basis</li>
            <li><span className="font-bold text-slate-200">{preview.notReachable.length}</span> stores not reachable from a brand — listed in the receipt, not hidden</li>
          </ul>
          {preview.persistence === "memory" && (
            <p className="text-xs text-slate-500">
              This workspace has no database configured, so the only data that exists is in the running process.
            </p>
          )}
          <p className="text-sm text-slate-300">Type <span className="font-mono font-bold text-rose-300">ERASE</span> to confirm. This cannot be undone.</p>
          <input
            value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="ERASE"
            className="w-full max-w-xs rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white outline-none focus:border-rose-500/60"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button" onClick={() => run("erase")} disabled={confirmText !== "ERASE" || busy !== ""}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-sm font-bold text-white hover:bg-rose-400 disabled:opacity-50"
            >
              {busy === "erase" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Erase it
            </button>
            <button
              type="button" onClick={() => { setPreview(null); setConfirmText(""); }}
              className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {receipt && (
        <div className="mt-4 space-y-2 rounded-lg border border-ink-700 bg-ink-850 p-4">
          <p className="text-sm font-bold text-white">Erasure receipt</p>
          {receipt.statement.map((line, i) => <p key={i} className="text-xs text-slate-400">{line}</p>)}
          <details className="mt-1">
            <summary className="cursor-pointer text-xs font-semibold text-slate-300">Store by store</summary>
            <ul className="mt-2 space-y-1">
              {receipt.stores.map((s) => (
                <li key={s.collection} className="text-[11px] text-slate-400">
                  <span className="font-mono text-slate-300">{s.collection}</span>
                  {" — "}{s.action}{s.documents ? ` (${s.documents})` : ""}
                  {s.basis ? <span className="block pl-3 text-slate-500">{s.basis}</span> : null}
                  {s.note ? <span className="block pl-3 text-rose-300">{s.note}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
