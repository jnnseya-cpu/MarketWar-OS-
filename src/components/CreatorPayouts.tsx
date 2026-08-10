"use client";

// The creator's own money — what they have, what they can take out, and what it
// costs to take it.
//
// THE ONE THING IN HERE THAT IS NOT COSMETIC IS THE requestId.
//
// The server refuses to send the same withdrawal twice by claiming an
// idempotency key derived from (creator, rail, amount, requestId) before it
// calls the provider. That protection is worth exactly nothing if the browser
// mints a fresh id on every click — two clicks would be two different
// withdrawals and the person would be paid twice.
//
// So the id is generated ONCE per intended withdrawal and held in a ref. A retry
// after a failure or a timeout reuses it, which is what makes it a retry. It is
// regenerated only when the withdrawal itself changes — a different amount, a
// different rail, a different destination — or after one has genuinely
// succeeded. Everything else on this screen is a form; this is the part that
// stops a double click becoming a double payment.
//
// Nothing here computes a fee, a balance or a gate. The server does that, and a
// second copy of a payout rule in the browser is a second place for it to be
// wrong — in money, about somebody's wages.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, BadgeCheck, Banknote, CheckCircle2, Clock,
  Info, Loader2, Lock, ShieldCheck, Wallet,
} from "lucide-react";
import { Pill } from "@/components/ui";
import { authedFetch } from "@/frontend/api-client";

type Rail = { id: string; label: string; feePct: number; feeFixedPence: number; minWithdrawalPence: number; speed: string; note: string; live?: boolean };
type Gate = { allowed: boolean; reason: string; fix?: string; missing?: string[] };
type QuoteLine = { label: string; pence: number; whose: "creator" | "rail" | "platform" };
type Quote = {
  ok: boolean; error?: string; hint?: string; minimumPence?: number;
  railLabel?: string; grossPence?: number; netPence?: number; feeSharePct?: number;
  speed?: string; lines?: QuoteLine[]; warning?: string; note?: string;
  cheaper?: { railId: string; label: string; netPence: number };
};
type Attempt = { id: string; railId: string; grossPence: number; feesPence: number; netPence: number; state: string; providerRef?: string; error?: string; createdAt: string };
type Wallet = { availablePence: number; pendingPence: number; lifetimePence: number; rejectedPence: number };

const money = (p: number) => `£${((p || 0) / 100).toFixed(2)}`;
const COUNTRIES = ["GB", "IE", "FR", "DE", "US", "CD", "KE", "TZ", "UG", "SN", "CI", "CM", "GH", "ZM", "NG"];

function newRequestId(): string {
  try { if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID(); } catch { /* older browser */ }
  return `wd_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export default function CreatorPayouts({ creatorId }: { creatorId?: string }) {
  const [rails, setRails] = useState<Rail[]>([]);
  const [doctrine, setDoctrine] = useState<string[]>([]);
  const [identityDoctrine, setIdentityDoctrine] = useState<string[]>([]);
  const [gate, setGate] = useState<Gate | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [paidOut, setPaidOut] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Identity
  const [legalName, setLegalName] = useState("");
  const [dob, setDob] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("GB");
  const [taxReference, setTaxReference] = useState("");
  const [noRefReason, setNoRefReason] = useState("");
  const [idField, setIdField] = useState("");
  const [idNote, setIdNote] = useState("");

  // Withdrawal
  const [railId, setRailId] = useState("stripe_bank");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [sent, setSent] = useState<{ note: string; ref?: string } | null>(null);

  // THE IDEMPOTENCY KEY. One per intended withdrawal, reused on every retry.
  const requestId = useRef<string>(newRequestId());
  // What that id was minted for. If any of it changes, the withdrawal is a
  // different withdrawal and needs its own id.
  const requestFor = useRef<string>("");

  const post = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const res = await authedFetch("/api/share2earn", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId, ...body }),
      });
      const d = await res.json();
      if (!res.ok) { setError([d?.error, d?.hint].filter(Boolean).join(" — ")); return { ...d, __failed: true }; }
      return d;
    } catch { setError("Could not reach the payout service."); return null; }
    finally { setBusy(false); }
  }, [creatorId]);

  const refresh = useCallback(async () => {
    const d = await post({ action: "payout-history" });
    if (d && !d.__failed) {
      setAttempts(Array.isArray(d.attempts) ? d.attempts : []);
      setPaidOut(Number(d.paidOutPence) || 0);
      if (d.gate) setGate(d.gate as Gate);
    }
    if (!creatorId) return;
    try {
      const r = await authedFetch(`/api/share2earn?creatorId=${encodeURIComponent(creatorId)}`);
      const w = await r.json();
      if (r.ok && w?.wallet) setWallet(w.wallet as Wallet);
    } catch { /* the rest of the screen still works */ }
  }, [post, creatorId]);

  useEffect(() => {
    fetch("/api/share2earn").then((r) => r.json()).then((d) => {
      const p = d?.payouts;
      if (!p) return;
      const live: Record<string, boolean> = Object.fromEntries((p.live || []).map((l: { railId: string; live: boolean }) => [l.railId, l.live]));
      setRails((p.rails || []).map((r: Rail) => ({ ...r, live: live[r.id] })));
      setDoctrine(p.doctrine || []);
      setIdentityDoctrine(p.identityDoctrine || []);
    }).catch(() => { /* the forms still post */ });
    refresh();
  }, [refresh]);

  const available = wallet?.availablePence ?? 0;
  const amountPence = Math.round(Number(amount) * 100) || 0;
  const rail = rails.find((r) => r.id === railId);

  /** Mint a new id only when the withdrawal itself is a different one. */
  function idFor(): string {
    const signature = `${railId}|${amountPence}|${destination.trim()}`;
    if (requestFor.current !== signature) {
      requestId.current = newRequestId();
      requestFor.current = signature;
    }
    return requestId.current;
  }

  async function saveIdentity() {
    setIdField(""); setIdNote("");
    const d = await post({
      action: "identity", legalName, dateOfBirth: dob, addressLine, city, postcode, country,
      taxReference: taxReference || undefined, noTaxReferenceReason: noRefReason || undefined,
    });
    if (!d) return;
    if (d.__failed) { setIdField(String(d.field || "")); return; }
    setIdNote(String(d.note || ""));
    if (d.gate) setGate(d.gate as Gate);
    // The reference is never echoed back, so it is cleared here too.
    setTaxReference("");
    refresh();
  }

  async function getQuote() {
    setSent(null);
    const d = await post({ action: "withdraw-quote", railId, amountPence, country });
    if (d) setQuote((d.quote || d) as Quote);
  }

  async function withdraw() {
    const d = await post({
      action: "withdraw", railId, amountPence, destination,
      requestId: idFor(), country, availablePence: available,
    });
    if (!d || d.__failed) { refresh(); return; }
    setSent({ note: String(d.note || ""), ref: d.attempt?.providerRef });
    // It succeeded, so the next withdrawal is genuinely a new one.
    requestFor.current = "";
    setAmount(""); setQuote(null);
    refresh();
  }

  const open = gate?.allowed === true;

  return (
    <div className="space-y-6">
      {/* The money itself, first. It is what they came for. */}
      <div className="card border-emerald-500/25 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Wallet className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">Your earnings</h2>
          <Pill tone={open ? "good" : "warn"}>{open ? "Payouts open" : "Payouts closed"}</Pill>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Available", value: available, tone: "text-emerald-300", hint: "Past its refund window — you can take this out now." },
            { label: "Pending", value: wallet?.pendingPence ?? 0, tone: "text-amber-300", hint: "Yours, but the refund window on the sale has not closed yet." },
            { label: "Paid out", value: paidOut, tone: "text-slate-200", hint: "Already sent to you." },
            { label: "Lifetime", value: wallet?.lifetimePence ?? 0, tone: "text-white", hint: "Everything you have earned here." },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-white/10 bg-ink-900/50 p-3">
              <p className={`font-display text-xl font-bold ${s.tone}`}>{money(s.value)}</p>
              <p className="text-xs font-semibold text-slate-300">{s.label}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{s.hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* The gate, stated as the blocker plus the fix — never a bare "no". */}
      {gate && !gate.allowed && (
        <div className="card border-amber-500/30 bg-amber-500/[0.04] p-5">
          <p className="mb-1 flex items-center gap-1.5 font-display text-sm font-bold text-amber-200">
            <Lock className="h-4 w-4" /> {gate.reason}
          </p>
          {gate.fix && <p className="text-xs leading-relaxed text-slate-300">{gate.fix}</p>}
        </div>
      )}

      {/* Identity. Asked once, and the reason is given rather than assumed. */}
      <div className="card p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-sky-400" />
          <h2 className="font-display text-lg font-bold text-white">Your payout details</h2>
          {open && <Pill tone="good">Verified</Pill>}
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Asked once, before your first payout. We need it because a platform that pays people for services has to report who it paid — and because money leaving to an unverified account is money anyone who guesses your password can take. <span className="font-semibold text-slate-300">Nothing is deducted from what you earn.</span>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["legalName", "Full legal name, as on your ID", legalName, setLegalName, "Not your username"],
            ["dateOfBirth", "Date of birth", dob, setDob, "YYYY-MM-DD"],
            ["addressLine", "Street address", addressLine, setAddressLine, ""],
            ["city", "Town or city", city, setCity, ""],
            ["postcode", "Postcode", postcode, setPostcode, "If you have one"],
          ] as const).map(([field, label, value, set, hint]) => (
            <div key={field}>
              <label className="label">{label}</label>
              <input
                className={`input ${idField === field ? "border-rose-500/50" : ""}`}
                type={field === "dateOfBirth" ? "date" : "text"}
                value={value} onChange={(e) => set(e.target.value)} placeholder={hint}
              />
            </div>
          ))}
          <div>
            <label className="label">Country</label>
            <select className={`input ${idField === "country" ? "border-rose-500/50" : ""}`} value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Tax reference{country === "GB" ? " (National Insurance number)" : ""}</label>
            <input className={`input ${idField === "taxReference" ? "border-rose-500/50" : ""}`} value={taxReference} onChange={(e) => setTaxReference(e.target.value)} placeholder={country === "GB" ? "e.g. AB123456C" : "Your tax identification number"} />
            <p className="mt-1 text-[11px] text-slate-500">Stored encrypted and never shown back to you or to anyone else. If you genuinely do not have one, leave it blank and say why below — that reason is reported in its place.</p>
          </div>
          {!taxReference && (
            <div className="sm:col-span-2">
              <label className="label">Why you have no tax reference</label>
              <input className="input" value={noRefReason} onChange={(e) => setNoRefReason(e.target.value)} placeholder="e.g. Not registered for tax in my country" />
            </div>
          )}
        </div>

        <button className="btn-primary mt-4" onClick={saveIdentity} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><BadgeCheck className="h-4 w-4" /> Save my details</>}
        </button>
        {idNote && <p className="mt-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.05] p-3 text-xs leading-relaxed text-sky-200">{idNote}</p>}
      </div>

      {/* Withdrawal. */}
      <div className="card p-5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Banknote className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">Take your money out</h2>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Wherever you are — bank, card, PayPal, Wise, or mobile money. No bank account needed on the mobile rails. Every fee is shown before you confirm.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Where to</label>
            <select className="input" value={railId} onChange={(e) => { setRailId(e.target.value); setQuote(null); setSent(null); }}>
              {rails.map((r) => (
                <option key={r.id} value={r.id}>{r.label}{r.live ? "" : " — not connected yet"}</option>
              ))}
            </select>
            {rail && <p className="mt-1 text-[11px] text-slate-500">{rail.speed} · minimum {money(rail.minWithdrawalPence)}</p>}
          </div>
          <div>
            <label className="label">Amount (£)</label>
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(null); setSent(null); }} placeholder={(available / 100).toFixed(2)} />
            <button type="button" className="mt-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300" onClick={() => { setAmount((available / 100).toFixed(2)); setQuote(null); }}>
              Use all {money(available)}
            </button>
          </div>
          <div>
            <label className="label">Account</label>
            <input className="input" value={destination} onChange={(e) => { setDestination(e.target.value); setQuote(null); setSent(null); }} placeholder={railId.includes("stripe") ? "acct_…" : railId === "paypal" ? "PayPal email" : "Mobile number"} />
          </div>
        </div>

        {rail && rail.live === false && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200">
            <span className="font-bold">{rail.label} is not connected on this deployment yet. </span>
            You can still see exactly what it would cost — nothing will be sent, and your balance is untouched.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn-secondary" onClick={getQuote} disabled={busy || amountPence <= 0}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Info className="h-4 w-4" />} What will it cost?
          </button>
          <button className="btn-primary" onClick={withdraw} disabled={busy || !open || amountPence <= 0 || !destination.trim()}>
            <ArrowRight className="h-4 w-4" /> Withdraw {amountPence > 0 ? money(amountPence) : ""}
          </button>
          {!open && <span className="text-xs text-slate-500">Complete your payout details first.</span>}
        </div>

        {quote && quote.ok === false && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200">
            <span className="font-bold">{quote.error} </span>{quote.hint}
          </p>
        )}

        {quote && quote.ok && quote.lines && (
          <div className="mt-4 rounded-lg border border-white/10 bg-ink-900/60 p-3">
            <div className="divide-y divide-white/[0.06]">
              {quote.lines.map((l, i) => (
                <div key={i} className={`flex items-center justify-between gap-3 py-2 text-sm ${i === quote.lines!.length - 1 ? "font-bold text-emerald-300" : l.pence < 0 ? "text-slate-400" : "text-white"}`}>
                  <span>{l.label}{l.whose === "rail" ? " — theirs" : l.whose === "platform" ? " — ours" : ""}</span>
                  <span className="font-mono">{l.pence < 0 ? "−" : ""}{money(Math.abs(l.pence))}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{quote.speed} · fees are {quote.feeSharePct}% of this withdrawal. {quote.note}</p>
            {quote.warning && <p className="mt-2 text-[11px] leading-relaxed text-amber-200/90">{quote.warning}</p>}
            {quote.cheaper && (
              <button
                type="button"
                className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300"
                onClick={() => { setRailId(quote.cheaper!.railId); setQuote(null); }}
              >
                <ArrowRight className="h-3 w-3" /> {quote.cheaper.label} would leave you {money(quote.cheaper.netPence)} — switch to it
              </button>
            )}
          </div>
        )}

        {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}
        {sent && (
          <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-sm leading-relaxed text-emerald-200">
            <CheckCircle2 className="mr-1.5 inline h-4 w-4" />{sent.note}
          </p>
        )}
      </div>

      {/* History — including the failures, because a payout that vanished
          without a trace is the thing that destroys trust fastest. */}
      {attempts.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-white"><Clock className="h-4 w-4 text-slate-400" /> Your withdrawals</h2>
          <div className="divide-y divide-white/[0.06]">
            {attempts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <Pill tone={a.state === "sent" ? "good" : a.state === "failed" ? "bad" : "info"}>{a.state}</Pill>
                <span className="font-semibold text-white">{money(a.netPence)}</span>
                <span className="text-xs text-slate-500">of {money(a.grossPence)} · {a.railId.replace(/_/g, " ")}</span>
                <span className="ml-auto text-xs text-slate-600">{new Date(a.createdAt).toLocaleDateString("en-GB")}</span>
                {a.providerRef && <span className="w-full font-mono text-[11px] text-slate-600">ref {a.providerRef}</span>}
                {a.error && <span className="w-full text-[11px] leading-relaxed text-rose-300/80">{a.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(doctrine.length > 0 || identityDoctrine.length > 0) && (
        <div className="card p-5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"><AlertTriangle className="h-3.5 w-3.5" /> How this works</p>
          <ul className="space-y-1.5">
            {[...doctrine, ...identityDoctrine].map((d, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-slate-500">· {d}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
