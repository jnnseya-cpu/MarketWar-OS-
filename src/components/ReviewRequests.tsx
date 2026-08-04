"use client";

// Review requests — the panel that turns real customers into real reviews.
//
// Everything shown here is computed by src/backend/review-requests.ts. The
// component adds no eligibility logic of its own, because the no-gating rule is
// enforced in the engine and a second copy of the rule in the browser is a
// second place for it to drift.

import { useEffect, useState } from "react";
import { AlertTriangle, Ban, Check, Copy, Info, Loader2, Send, Star } from "lucide-react";
import { Pill } from "@/components/ui";

type Platform = {
  id: string; label: string; ask: "encouraged" | "allowed-with-rules" | "restricted" | "prohibited";
  identifier: string | null; identifierHint: string; buildsLink: boolean;
  rules: string[]; discoveryEffect: string;
};
type Finding = { severity: "blocking" | "warning" | "note"; title: string; detail: string };
type Campaign = {
  platform: { id: string; label: string; ask: string; rules: string[]; discoveryEffect: string };
  link: string;
  eligibility: { eligible: { id: string; name?: string; email?: string }[]; excluded: { id: string; reason: string }[]; counts: { considered: number; eligible: number; excluded: number }; note: string };
  pacing: { perDay: number; days: number; note: string };
  sample: { subject?: string; body: string; chars: number; smsSegments?: number; warnings: string[] };
  findings: Finding[];
  sendable: boolean;
  doctrine: string;
};

const ASK_TONE: Record<Platform["ask"], { tone: "good" | "warn" | "bad" | "info"; label: string }> = {
  encouraged: { tone: "good", label: "asking encouraged" },
  "allowed-with-rules": { tone: "info", label: "asking allowed, with rules" },
  restricted: { tone: "warn", label: "their mechanism only" },
  prohibited: { tone: "bad", label: "asking forbidden" },
};

const SEV: Record<Finding["severity"], { icon: typeof Ban; cls: string }> = {
  blocking: { icon: Ban, cls: "border-rose-500/35 bg-rose-500/[0.06] text-rose-300" },
  warning: { icon: AlertTriangle, cls: "border-amber-500/35 bg-amber-500/[0.06] text-amber-300" },
  note: { icon: Info, cls: "border-sky-500/25 bg-sky-500/[0.05] text-sky-300" },
};

export default function ReviewRequests({ brandId, brandName }: { brandId?: string; brandName?: string }) {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [notBuilt, setNotBuilt] = useState("");
  const [platformId, setPlatformId] = useState("google");
  const [identifier, setIdentifier] = useState("");
  const [pastedUrl, setPastedUrl] = useState("");
  const [channel, setChannel] = useState<"email" | "sms" | "whatsapp">("email");
  const [existingReviews, setExistingReviews] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/review-requests")
      .then((r) => r.json())
      .then((d) => { setPlatforms(Array.isArray(d?.platforms) ? d.platforms : []); setNotBuilt(d?.notBuilt || ""); })
      .catch(() => { /* the form still works; the table is context, not a dependency */ });
  }, []);

  const p = platforms.find((x) => x.id === platformId) || null;

  async function plan() {
    setBusy(true); setError(""); setCampaign(null);
    try {
      const res = await fetch("/api/review-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan", platformId, channel, brandId, brandName,
          identifier: identifier || undefined, pastedUrl: pastedUrl || undefined,
          existingReviews: Number(existingReviews) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError([data?.error, data?.hint].filter(Boolean).join(" — ")); return; }
      setCampaign(data);
    } catch {
      setError("Could not reach the review-request engine.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mb-6 card border-amber-500/25 p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Star className="h-5 w-5 text-amber-400" />
        <h2 className="font-display text-lg font-bold text-white">Ask for reviews — from people you really served</h2>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        Pick the platform, point it at your review link, and the engine works out who is eligible from your Customer Vault: real orders, finished long enough ago to have an opinion, not asked recently, consent respected. Everyone eligible gets the same link.
      </p>

      {notBuilt && (
        <p className="mb-4 rounded-lg border border-rose-500/25 bg-rose-500/[0.05] p-3 text-xs leading-relaxed text-rose-200/90">
          <span className="font-semibold text-rose-200">Not available here: </span>{notBuilt}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Platform</label>
          <select className="input" value={platformId} onChange={(e) => { setPlatformId(e.target.value); setCampaign(null); setError(""); }}>
            {platforms.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Send by</label>
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as "email" | "sms" | "whatsapp")}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        {p?.buildsLink ? (
          <div>
            <label className="label">{p.identifier}</label>
            <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={p.identifier || ""} />
          </div>
        ) : (
          <div>
            <label className="label">Your review link</label>
            <input className="input" value={pastedUrl} onChange={(e) => setPastedUrl(e.target.value)} placeholder="Paste the link from your own dashboard" />
          </div>
        )}
        <div>
          <label className="label">Reviews you already have</label>
          <input className="input" inputMode="numeric" value={existingReviews} onChange={(e) => setExistingReviews(e.target.value)} placeholder="e.g. 42 — sets the pace" />
        </div>
      </div>

      {p && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{p.label}</span>
            <Pill tone={ASK_TONE[p.ask].tone}>{ASK_TONE[p.ask].label}</Pill>
          </div>
          <p className="mb-2 text-xs leading-relaxed text-slate-400">{p.discoveryEffect}</p>
          <ul className="space-y-1">
            {p.rules.map((r, i) => <li key={i} className="text-xs leading-relaxed text-slate-500">· {r}</li>)}
          </ul>
          <p className="mt-2 text-[11px] text-slate-600">{p.identifierHint}</p>
        </div>
      )}

      <button className="btn-primary mt-4" onClick={plan} disabled={busy || p?.ask === "prohibited"}>
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Working out who to ask…</> : <><Send className="h-4 w-4" /> Plan the requests</>}
      </button>

      {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}

      {campaign && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={campaign.sendable ? "good" : "bad"}>{campaign.sendable ? "Ready to send" : "Not sendable yet"}</Pill>
            <span className="text-sm text-slate-300">
              {campaign.eligibility.counts.eligible} eligible of {campaign.eligibility.counts.considered} · {campaign.pacing.perDay}/day over {campaign.pacing.days} day{campaign.pacing.days === 1 ? "" : "s"}
            </span>
          </div>

          {campaign.findings.length > 0 && (
            <ul className="space-y-2">
              {campaign.findings.map((f, i) => {
                const s = SEV[f.severity]; const Icon = s.icon;
                return (
                  <li key={i} className={`rounded-lg border p-3 ${s.cls}`}>
                    <p className="flex items-center gap-1.5 text-xs font-bold"><Icon className="h-3.5 w-3.5" /> {f.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">{f.detail}</p>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="rounded-lg border border-white/10 bg-ink-900/50 p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">The message</p>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:border-emerald-500/40"
                onClick={() => {
                  const t = [campaign.sample.subject, campaign.sample.body].filter(Boolean).join("\n\n");
                  navigator.clipboard?.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {});
                }}
              >
                {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>
            {campaign.sample.subject && <p className="mb-2 text-sm font-semibold text-white">{campaign.sample.subject}</p>}
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-300">{campaign.sample.body}</pre>
            <p className="mt-2 text-[11px] text-slate-600">
              {campaign.sample.chars} characters{campaign.sample.smsSegments ? ` · ${campaign.sample.smsSegments} SMS segment${campaign.sample.smsSegments === 1 ? "" : "s"} per recipient` : ""} · the link is {campaign.link}
            </p>
          </div>

          {campaign.eligibility.excluded.length > 0 && (
            <details className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-slate-500">
                {campaign.eligibility.excluded.length} not asked, and why
              </summary>
              <ul className="mt-2 space-y-1">
                {campaign.eligibility.excluded.slice(0, 50).map((e) => (
                  <li key={e.id} className="text-xs text-slate-500"><span className="font-mono text-slate-400">{e.id}</span> — {e.reason}</li>
                ))}
              </ul>
              {campaign.eligibility.excluded.length > 50 && <p className="mt-1 text-[11px] text-slate-600">…and {campaign.eligibility.excluded.length - 50} more.</p>}
            </details>
          )}

          <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-slate-500">{campaign.doctrine}</p>
        </div>
      )}
    </div>
  );
}
