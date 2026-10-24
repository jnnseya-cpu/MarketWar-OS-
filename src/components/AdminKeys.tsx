"use client";

// PLATFORM KEYS — the Admin Control Centre's own key management.
//
// Owner directive: *"All required API keys, to be set up in the admin
// account."* Before this, every credential lived in the hosting dashboard: the
// owner left the product to configure the product, a deploy was needed before a
// key took effect, and the screen that knew which keys were missing could not do
// anything about it.
//
// WHAT THIS SCREEN DELIBERATELY NEVER SHOWS. A value. Not masked, not the last
// four characters. A key that can be read back out of an admin session is a key
// that leaks with the session, and "••••1234" is still four characters of a
// credential in a screenshot. What it shows instead is a FINGERPRINT — a hash —
// which answers the only question the owner actually has when looking at a key
// that is already set: *is the one loaded the one I think it is?* Two different
// keys have two different fingerprints, and neither fingerprint is the key.
//
// THREE STATES PER KEY, AND THE DIFFERENCE MATTERS:
//   • In the admin account — stored here, encrypted. Editable.
//   • In the hosting environment — set in Vercel. Shown as such, and still
//     overridable here, with the override marked, because a silent split brain
//     between two sources of truth is how an afternoon disappears.
//   • Not set — and when it is a secret, what stays dark because of it.
//
// Keys that CANNOT be managed here say why on the row rather than being hidden:
// the Firebase credentials (this store lives in Firestore, so they must already
// work before it can be read), the encryption master key (it decrypts this
// store), and anything NEXT_PUBLIC_ (compiled into the browser bundle at build
// time, so a value saved now cannot change it).

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Eye, KeyRound, Loader2, Lock, RefreshCw, Trash2 } from "lucide-react";
import { Pill } from "@/components/ui";
import { authedFetch } from "@/frontend/api-client";

type Entry = {
  name: string;
  group: string;
  secret: boolean;
  unlocks: string;
  where: string;
  source: "environment" | "admin" | "unset";
  overridesEnvironment: boolean;
  fingerprint?: string;
  updatedAt?: string;
  updatedBy?: string;
  cannotStore: string | null;
};

type Inventory = {
  entries: Entry[];
  total: number;
  setInAdmin: number;
  setInEnvironment: number;
  unset: number;
  missingSecrets: string[];
  encryptionReady: boolean;
  persistenceReady: boolean;
  note: string;
};

/** Read the inventory CHECKING it, rather than asserting the wire's shape. */
function inventoryFromWire(raw: unknown): { inv: Inventory | null; error?: string } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (typeof o.error === "string") return { inv: null, error: o.error };
  if (!Array.isArray(o.entries)) return { inv: null, error: "The key inventory came back in a shape this screen does not recognise." };
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const entries: Entry[] = o.entries.map((row) => {
    const e = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const source = e.source === "admin" ? "admin" : e.source === "environment" ? "environment" : "unset";
    return {
      name: str(e.name), group: str(e.group) || "Other", secret: e.secret === true,
      unlocks: str(e.unlocks), where: str(e.where), source,
      overridesEnvironment: e.overridesEnvironment === true,
      ...(typeof e.fingerprint === "string" ? { fingerprint: e.fingerprint } : {}),
      ...(typeof e.updatedAt === "string" ? { updatedAt: e.updatedAt } : {}),
      ...(typeof e.updatedBy === "string" ? { updatedBy: e.updatedBy } : {}),
      cannotStore: typeof e.cannotStore === "string" ? e.cannotStore : null,
    };
  });
  return {
    inv: {
      entries,
      total: num(o.total) || entries.length,
      setInAdmin: num(o.setInAdmin),
      setInEnvironment: num(o.setInEnvironment),
      unset: num(o.unset),
      missingSecrets: Array.isArray(o.missingSecrets) ? o.missingSecrets.filter((m): m is string => typeof m === "string") : [],
      encryptionReady: o.encryptionReady === true,
      persistenceReady: o.persistenceReady === true,
      note: str(o.note),
    },
  };
}

export default function AdminKeys() {
  const [inv, setInv] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>("");
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [onlyMissing, setOnlyMissing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch("/api/admin/keys");
      const { inv: parsed, error: err } = inventoryFromWire(await res.json());
      if (!res.ok || !parsed) throw new Error(err || `Could not read the keys (${res.status})`);
      setInv(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the keys.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(name: string) {
    const value = (draft[name] || "").trim();
    if (!value) return;
    setBusy(name); setError(null);
    try {
      const res = await authedFetch("/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, value }),
      });
      const body = await res.json();
      const msg = body && typeof body === "object" && typeof (body as Record<string, unknown>).error === "string"
        ? String((body as Record<string, unknown>).error) : "";
      if (!res.ok) throw new Error(msg || `Could not save ${name} (${res.status})`);
      // The value leaves the browser's memory the moment it is stored.
      setDraft((d) => ({ ...d, [name]: "" }));
      setSaved((s) => ({ ...s, [name]: "Saved and live." }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not save ${name}.`);
    } finally {
      setBusy("");
    }
  }

  async function clear(name: string) {
    setBusy(name); setError(null);
    try {
      const res = await authedFetch(`/api/admin/keys?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body && typeof body === "object" && typeof (body as Record<string, unknown>).error === "string"
          ? String((body as Record<string, unknown>).error) : "";
        throw new Error(msg || `Could not remove ${name} (${res.status})`);
      }
      setSaved((s) => ({ ...s, [name]: "Removed." }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not remove ${name}.`);
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading the key inventory…
      </div>
    );
  }

  if (!inv) {
    return (
      <div className="card p-5">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <h2 className="font-display font-bold text-white">Platform keys</h2>
        </div>
        <p className="text-sm text-rose-300">{error || "The key inventory is unavailable."}</p>
      </div>
    );
  }

  const groups = [...new Set(inv.entries.map((e) => e.group))];
  const shown = (e: Entry) => !onlyMissing || e.source === "unset";

  return (
    <div className="card p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-emerald-400" />
          <h2 className="font-display font-bold text-white">Platform keys</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button" onClick={() => setOnlyMissing((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${onlyMissing ? "border-emerald-500/50 text-emerald-300" : "border-ink-700 text-slate-300 hover:border-slate-500"}`}
          >
            {onlyMissing ? "Showing what is missing" : "Show only what is missing"}
          </button>
          <button
            type="button" onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-bold text-slate-300 transition hover:border-slate-500"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-400">
        Set every key the platform needs here instead of in the hosting dashboard. Values are encrypted before they
        are stored, are never shown again — not even partly — and take effect on this server immediately and on every
        other instance within a minute.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone="good">{inv.setInAdmin} set here</Pill>
        <Pill tone="info">{inv.setInEnvironment} from the hosting environment</Pill>
        <Pill tone={inv.missingSecrets.length ? "warn" : "good"}>{inv.missingSecrets.length} credentials still missing</Pill>
        {!inv.persistenceReady && <Pill tone="bad">no database — nothing can be stored yet</Pill>}
        {inv.persistenceReady && !inv.encryptionReady && <Pill tone="bad">no master key — storing is refused</Pill>}
      </div>

      {!inv.encryptionReady && inv.persistenceReady && (
        <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">
          <span className="font-bold">FIELD_ENCRYPTION_MASTER_KEY is not set.</span> A key could only be stored in
          plain text, so saving is refused rather than done quietly. Set that one variable in the hosting environment
          and every other key can be managed from this screen.
        </p>
      )}

      {error && <p className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-200">{error}</p>}
      {inv.note && <p className="mb-4 text-xs text-slate-500">{inv.note}</p>}

      <div className="space-y-5">
        {groups.map((group) => {
          const rows = inv.entries.filter((e) => e.group === group && shown(e));
          if (!rows.length) return null;
          return (
            <div key={group}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{group}</h3>
              <div className="space-y-2">
                {rows.map((e) => (
                  <div key={e.name} className="rounded-lg border border-white/[0.07] bg-ink-900/50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs font-semibold text-white">{e.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">{e.unlocks}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Where to get it: {e.where}</p>
                        {e.fingerprint && (
                          <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <Eye className="h-3 w-3" /> fingerprint <span className="font-mono text-slate-400">{e.fingerprint}</span>
                            {e.updatedAt ? ` · set ${e.updatedAt.slice(0, 10)}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {e.source === "admin" ? (
                          <Pill tone="good"><Check className="mr-1 inline h-3 w-3" />set here</Pill>
                        ) : e.source === "environment" ? (
                          <Pill tone="info">from the environment</Pill>
                        ) : e.secret ? (
                          <Pill tone="warn">missing</Pill>
                        ) : (
                          <Pill tone="neutral">not set</Pill>
                        )}
                      </div>
                    </div>

                    {e.overridesEnvironment && (
                      <p className="mt-2 text-[11px] text-amber-300">
                        This is overriding a different value in the hosting environment. The one stored here is what the
                        platform uses. Remove it to fall back to the environment value.
                      </p>
                    )}

                    {e.cannotStore ? (
                      <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-slate-500">
                        <Lock className="mt-0.5 h-3 w-3 shrink-0" /> <span>{e.cannotStore}</span>
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          type="password" autoComplete="off" spellCheck={false}
                          value={draft[e.name] || ""}
                          onChange={(ev) => setDraft((d) => ({ ...d, [e.name]: ev.target.value }))}
                          placeholder={e.source === "unset" ? "Paste the key" : "Paste a new key to replace it"}
                          className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 font-mono text-xs text-white outline-none focus:border-emerald-500/60"
                        />
                        <button
                          type="button" onClick={() => void save(e.name)}
                          disabled={!((draft[e.name] || "").trim()) || busy === e.name || !inv.encryptionReady || !inv.persistenceReady}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-ink-950 transition hover:bg-emerald-400 disabled:opacity-40"
                        >
                          {busy === e.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
                        </button>
                        {e.source === "admin" && (
                          <button
                            type="button" onClick={() => void clear(e.name)} disabled={busy === e.name}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-bold text-rose-300 transition hover:border-rose-500/60 disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                          </button>
                        )}
                        {saved[e.name] && <span className="text-[11px] text-emerald-300">{saved[e.name]}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
