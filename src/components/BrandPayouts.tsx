"use client";

// What this brand owes its creators — and the two things it may do about it.
//
// The framing is deliberate and it is the whole point of the screen. There is no
// "approve" button that money waits behind, because a commission is EARNED: a
// creator posted, somebody bought, the sale settled. At that point it is not the
// brand's money and the brand's role is review, not permission.
//
// So this screen offers exactly two actions — DISPUTE with a reason from a fixed
// list, and RELEASE EARLY — and a third that only exists to refuse. Reaching for
// "just hold it" returns the refusal and the reason, because an earned
// commission a payer may keep at will is not a commission, it is a tip.
//
// Every figure comes from the server. The browser does not decide what is owed.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban, Check, Clock, HandCoins, Loader2, ShieldAlert, Users } from "lucide-react";
import { Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Earning = { id: string; creatorId: string; brandId: string; missionId: string; actionId: string; units: number; pence: number; state: string; reason?: string; at: string };
type QueueItem = { earning: Earning; daysHeld: number; daysLeftToDispute: number; payableIn: number; urgent: boolean };
type CreatorRow = { creatorId: string; pendingPence: number; payablePence: number; paidPence: number; disputedPence: number; earnings: number };
type Liability = { totalOwedPence: number; payableNowPence: number; pendingPence: number; disputedPence: number; paidPence: number; creators: CreatorRow[]; note: string };
type Reason = { id: string; label: string; meaning: string; evidenceRequired: boolean };
type Dispute = { id: string; creatorId: string; pence: number; reason: string; note: string; at: string };

const money = (p: number) => `£${((p || 0) / 100).toFixed(2)}`;

export default function BrandPayouts() {
  const { activeBrand } = useActiveBrand();
  const [liability, setLiability] = useState<Liability | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueNote, setQueueNote] = useState("");
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [windowDays, setWindowDays] = useState(0);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [doctrine, setDoctrine] = useState<string[]>([]);
  const [openFor, setOpenFor] = useState<string>("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const post = useCallback(async (body: Record<string, unknown>) => {
    if (!activeBrand?.id) return null;
    setBusy(true); setError("");
    try {
      const res = await authedFetch("/api/share2earn", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: activeBrand.id, ...body }),
      });
      const d = await res.json();
      if (!res.ok) { setError([d?.error, d?.hint, d?.instead].filter(Boolean).join(" — ")); return null; }
      return d;
    } catch { setError("Could not reach the payout service."); return null; }
    finally { setBusy(false); }
  }, [activeBrand?.id]);

  const refresh = useCallback(async () => {
    const l = await post({ action: "liability" });
    if (l) { setLiability(l.liability as Liability); setDisputes(l.disputes || []); setDoctrine(l.doctrine || []); }
    const q = await post({ action: "queue" });
    if (q) { setQueue(q.items || []); setQueueNote(q.note || ""); setReasons(q.reasons || []); setWindowDays(Number(q.windowDays) || 0); }
  }, [post]);

  useEffect(() => { refresh(); }, [refresh]);

  async function dispute(earning: Earning) {
    const d = await post({ action: "dispute", earning, reason, note });
    if (d) { setMsg(String(d.note || "")); setOpenFor(""); setReason(""); setNote(""); refresh(); }
  }

  async function release(earning: Earning) {
    const d = await post({ action: "release-early", earning });
    if (d) { setMsg(String(d.note || "")); refresh(); }
  }

  const selected = reasons.find((r) => r.id === reason);

  if (!activeBrand) return null;

  return (
    <div className="mb-6 card border-emerald-500/25 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <HandCoins className="h-5 w-5 text-emerald-400" />
        <h2 className="font-display text-lg font-bold text-white">What you owe your creators</h2>
        {liability && <Pill tone={liability.totalOwedPence > 0 ? "info" : "neutral"}>{money(liability.totalOwedPence)} owed</Pill>}
      </div>
      <p className="mb-4 text-sm text-slate-400">
        There is no approval button here that money waits behind. A commission is <span className="font-semibold text-slate-300">earned</span> — a creator posted, somebody bought, the sale settled. What you can do is dispute a specific earning with a reason, or release one early.
      </p>

      {liability && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Payable now", value: liability.payableNowPence, tone: "text-emerald-300", hint: "Past its refund window. Owed." },
              { label: "Still settling", value: liability.pendingPence, tone: "text-amber-300", hint: "Inside the refund window — your last chance to catch a problem." },
              { label: "Disputed", value: liability.disputedPence, tone: "text-rose-300", hint: "Withheld, with a reason the creator can see." },
              { label: "Already paid", value: liability.paidPence, tone: "text-slate-200", hint: "Gone out." },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-white/10 bg-ink-900/50 p-3">
                <p className={`font-display text-xl font-bold ${s.tone}`}>{money(s.value)}</p>
                <p className="text-xs font-semibold text-slate-300">{s.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{s.hint}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-slate-400">{liability.note}</p>
        </>
      )}

      {msg && <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-xs leading-relaxed text-emerald-200">{msg}</p>}
      {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm leading-relaxed text-rose-200">{error}</p>}

      {/* The queue — framed as a chance to catch something, not a gate. */}
      <div className="mt-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Clock className="h-3.5 w-3.5" /> In the window
        </p>
        {queueNote && <p className="mb-2 text-xs leading-relaxed text-slate-400">{queueNote}</p>}
        {busy && queue.length === 0 && <p className="text-xs text-slate-500"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…</p>}

        <div className="space-y-2">
          {queue.map((q) => (
            <div key={q.earning.id} className={`rounded-lg border p-3 ${q.urgent ? "border-amber-500/35 bg-amber-500/[0.05]" : "border-white/10 bg-ink-900/50"}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-white">{money(q.earning.pence)}</span>
                <span className="text-xs text-slate-400">{q.earning.actionId.replace(/_/g, " ")} · creator <span className="font-mono">{q.earning.creatorId.slice(0, 12)}</span></span>
                <span className="ml-auto text-xs text-slate-500">
                  {q.payableIn > 0 ? `payable in ${q.payableIn} day${q.payableIn === 1 ? "" : "s"}` : "payable now"}
                  {windowDays > 0 && ` · ${q.daysLeftToDispute} day${q.daysLeftToDispute === 1 ? "" : "s"} left to dispute`}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <button className="rounded-md border border-ink-700 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-emerald-500/40" onClick={() => release(q.earning)} disabled={busy}>
                  <Check className="mr-1 inline h-3 w-3 text-emerald-400" /> Release early
                </button>
                <button className="rounded-md border border-ink-700 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-rose-500/40" onClick={() => { setOpenFor(openFor === q.earning.id ? "" : q.earning.id); setReason(""); setNote(""); }} disabled={busy}>
                  <ShieldAlert className="mr-1 inline h-3 w-3 text-rose-400" /> Dispute
                </button>
              </div>

              {openFor === q.earning.id && (
                <div className="mt-3 rounded-lg border border-white/10 bg-ink-950/60 p-3">
                  <label className="label">Why</label>
                  <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">Choose a reason…</option>
                    {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                  {selected && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{selected.meaning}</p>}
                  {selected?.evidenceRequired && (
                    <>
                      <label className="label mt-2">What makes you think so</label>
                      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="The creator sees this. Be specific." />
                    </>
                  )}
                  <button className="btn-primary mt-3" onClick={() => dispute(q.earning)} disabled={busy || !reason}>
                    <Ban className="h-4 w-4" /> Withhold this one
                  </button>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    The creator is told which reason you chose. A payment that vanishes without one is what makes people stop trusting the whole programme.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Per creator. */}
      {liability && liability.creators.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"><Users className="h-3.5 w-3.5" /> By creator</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="pb-1.5 font-semibold">Creator</th>
                  <th className="pb-1.5 font-semibold">Payable</th>
                  <th className="pb-1.5 font-semibold">Settling</th>
                  <th className="pb-1.5 font-semibold">Disputed</th>
                  <th className="pb-1.5 font-semibold">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {liability.creators.map((c) => (
                  <tr key={c.creatorId}>
                    <td className="py-2 pr-3 font-mono text-slate-300">{c.creatorId.slice(0, 16)}</td>
                    <td className="py-2 pr-3 font-bold text-emerald-300">{money(c.payablePence)}</td>
                    <td className="py-2 pr-3 text-amber-300">{money(c.pendingPence)}</td>
                    <td className="py-2 pr-3 text-rose-300">{money(c.disputedPence)}</td>
                    <td className="py-2 text-slate-400">{money(c.paidPence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {disputes.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Disputes raised</p>
          <ul className="space-y-1.5">
            {disputes.map((d) => (
              <li key={d.id} className="rounded-lg border border-white/[0.06] bg-ink-900/50 p-2.5 text-xs">
                <span className="font-semibold text-white">{money(d.pence)}</span>
                <span className="ml-2 text-slate-400">{d.reason.replace(/_/g, " ")}</span>
                <span className="ml-2 font-mono text-slate-600">{d.creatorId.slice(0, 12)}</span>
                <span className="float-right text-slate-600">{new Date(d.at).toLocaleDateString("en-GB")}</span>
                {d.note && <p className="mt-1 leading-relaxed text-slate-500">{d.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {doctrine.length > 0 && (
        <ul className="mt-5 space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          {doctrine.map((d, i) => (
            <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-500">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" />{d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
