"use client";

// THE DOT THAT MEANS SOMETHING.
//
// "Connected" was measuring whether a row exists in a database. A Page token
// that expired last Tuesday is still stored, still returns a Page name, and
// still shows green — right up until a scheduled post fails at 3am and nobody
// finds out for a week.
//
// Every line below is read out of recorded publish attempts, so a red or amber
// state can always answer "which post, and what did the platform actually say".
// When nothing has failed, it says nothing has failed — not a prediction about
// when a token might expire, which would be a fabrication dressed as a
// diagnosis.

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, CircleX, Loader2 } from "lucide-react";
import { authedFetch } from "@/frontend/api-client";
import { useActiveBrand } from "@/frontend/brand-context";

type Health = {
  channel: string;
  state: "connected" | "action_required" | "disconnected" | "unknown";
  faults: string[];
  note: string;
  fix?: string;
  recentFailures: number;
};

const TONE: Record<Health["state"], { icon: typeof CircleCheck; cls: string; label: string }> = {
  connected: { icon: CircleCheck, cls: "text-emerald-400", label: "Connected" },
  action_required: { icon: CircleAlert, cls: "text-amber-400", label: "Action required" },
  disconnected: { icon: CircleX, cls: "text-rose-400", label: "Disconnected" },
  unknown: { icon: CircleAlert, cls: "text-slate-500", label: "Unknown" },
};

export default function ChannelHealth() {
  const { activeBrand } = useActiveBrand();
  const [rows, setRows] = useState<Health[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeBrand) { setRows(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await authedFetch(`/api/connection-health?brandId=${encodeURIComponent(activeBrand.id)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { channels: Health[] };
        if (!cancelled) setRows(data.channels || []);
      } catch {
        /* the rest of the page still works */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeBrand]);

  if (!activeBrand) return null;

  return (
    <div className="mb-8 card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-display font-bold text-white">Channel health</h2>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600" />}
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Read from every publish attempt actually recorded — not from whether a connection row exists.
      </p>

      {rows === null ? (
        <p className="text-sm text-slate-500">Checking…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No channels connected yet, and nothing has been published, so there is nothing to report either way.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const t = TONE[r.state];
            const Icon = t.icon;
            return (
              <li key={r.channel} className="flex gap-2.5">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${t.cls}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold capitalize text-white">
                    {r.channel} <span className={`text-xs font-medium ${t.cls}`}>· {t.label}</span>
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{r.note}</p>
                  {r.fix && <p className="mt-1 text-xs leading-relaxed text-amber-300/90">{r.fix}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
