"use client";

// Publish Center — platform-managed social publishing (Zernio).
// Connect a brand's socials in one click (white-label, no app review on our
// side), then compose and cross-post to up to 15 channels. Every post passes the
// compliance gate and carries the AI-content watermark. Wired to /api/zernio;
// demo-safe with zero config, live the moment ZERNIO_API_KEY is set.

import { useEffect, useState } from "react";
import { Building2, Check, Copy, Link2, Loader2, Send, ShieldCheck, Clock } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Platform = { id: string; label: string };
type Status = { configured: boolean; whiteLabel: boolean; platforms: Platform[]; billing: string; userAction: string; note: string };
type PlatformConnect = { platform: string; label: string; url: string };
type ConnectLink = { mode: "live" | "demo" | "live-error"; connectUrl: string; platformLinks?: PlatformConnect[]; note: string; diagnostic?: string };
type PublishResult = {
  mode: "live" | "demo";
  status: "published" | "scheduled" | "blocked";
  postId: string | null;
  platforms: string[];
  compliance: { pass: boolean; reasons: string[] };
  watermarked: boolean;
  scheduledFor: string | null;
  note: string;
};

export default function PublishCenterPage() {
  const { activeBrand } = useActiveBrand();
  const [status, setStatus] = useState<Status | null>(null);
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["instagram", "facebook", "tiktok"]));
  const [scheduleAt, setScheduleAt] = useState("");
  const [link, setLink] = useState<ConnectLink | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authedFetch("/api/zernio").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);
  // Reset per-brand state when the active brand changes.
  useEffect(() => { setLink(null); setResult(null); }, [activeBrand?.id]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function connect() {
    if (!activeBrand) return;
    setLinkBusy(true); setCopied(false);
    try {
      const r = await authedFetch("/api/zernio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect", brandId: activeBrand.id, brandName: activeBrand.name }) });
      setLink(await r.json());
    } finally { setLinkBusy(false); }
  }

  async function publish() {
    if (!activeBrand || !text.trim() || selected.size === 0) return;
    setBusy(true); setResult(null);
    try {
      const r = await authedFetch("/api/zernio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", brandId: activeBrand.id, text, platforms: [...selected], scheduleAt: scheduleAt || undefined }) });
      setResult(await r.json());
    } finally { setBusy(false); }
  }

  if (!activeBrand) {
    return (
      <div>
        <PageHeader kicker="Publish Center" title="One-click publishing to 15 channels" subtitle="Platform-managed, white-label social publishing." />
        <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Building2 className="h-8 w-8 text-emerald-500/60" />
          <p className="max-w-sm text-sm text-slate-400">Add a brand in the sidebar, connect its socials once, then publish to every channel from here.</p>
        </div>
      </div>
    );
  }

  const platforms = status?.platforms ?? [];

  return (
    <div>
      <PageHeader
        kicker="Publish Center"
        title="One-click publishing to 15 channels"
        subtitle="One MarketWar account fans out to Instagram, TikTok, Facebook, YouTube, LinkedIn, X, Pinterest and more. Each brand connects its own socials in one click — no app review on our side. Every post passes the compliance gate and carries the AI-content watermark."
        actions={
          <span className="inline-flex items-center gap-2">
            <Pill tone={status?.configured ? "good" : "info"}>{status?.configured ? "Live publishing" : "Demo — activates with key"}</Pill>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-ink-900/60 px-3 py-1.5 text-xs text-slate-300"><Building2 className="h-3.5 w-3.5" style={{ color: activeBrand.color }} /> {activeBrand.name}</span>
          </span>
        }
      />

      {/* Connect socials */}
      <div className="mb-8 card p-5">
        <div className="mb-1 flex items-center gap-2"><Link2 className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">Connect {activeBrand.name}&apos;s socials</h2></div>
        <p className="mb-3 text-xs text-slate-400">One click per network opens Zernio&apos;s hosted OAuth — the brand authorises their own account, no app review on our side. Once connected, publish below.</p>
        <button className="btn-primary" onClick={connect} disabled={linkBusy}>{linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} {link ? "Refresh connect links" : "Generate connect links"}</button>
        {link && link.mode === "live-error" && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3">
            <p className="text-sm font-semibold text-rose-300">Couldn&apos;t create the connect links</p>
            <p className="mt-1 text-[11px] text-slate-400">{link.note}</p>
            {link.diagnostic && <p className="mt-1 break-all text-[11px] text-slate-500">{link.diagnostic}</p>}
          </div>
        )}
        {link && link.mode !== "live-error" && (
          <div className="mt-3 rounded-lg border border-white/[0.07] bg-ink-900/60 p-3">
            {link.platformLinks && link.platformLinks.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {link.platformLinks.map((pl) => (
                  <a key={pl.platform} href={pl.url} target="_blank" rel="noopener noreferrer"
                     className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/20">
                    <Link2 className="h-3.5 w-3.5" /> Connect {pl.label}
                  </a>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${link.mode === "live" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{link.mode === "live" ? "Live link" : "Demo link"}</span>
                <code className="min-w-0 flex-1 truncate text-xs text-sky-300">{link.connectUrl}</code>
                <button onClick={() => { navigator.clipboard?.writeText(link.connectUrl); setCopied(true); }} className="shrink-0 text-slate-400 hover:text-white" title="Copy">{copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}</button>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-500">{link.note}</p>
          </div>
        )}
      </div>

      {/* Compose & publish */}
      <div className="mb-8 card p-5">
        <div className="mb-3 flex items-center gap-2"><Send className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">Compose &amp; publish</h2></div>
        <textarea className="input min-h-[110px]" placeholder={`What should ${activeBrand.name} post?`} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-1 text-right text-[11px] text-slate-600">{text.length}/5000</div>

        <p className="label mt-2">Channels</p>
        <div className="flex flex-wrap gap-1.5">
          {platforms.map((p) => (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${selected.has(p.id) ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40" : "bg-ink-850 text-slate-400 hover:text-slate-200"}`}>{p.label}</button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label flex items-center gap-1"><Clock className="h-3 w-3" /> Schedule (optional)</label>
            <input className="input" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={publish} disabled={busy || !text.trim() || selected.size === 0}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {scheduleAt ? "Schedule" : "Publish now"}</button>
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Compliance gate + AI-content watermark applied automatically</span>
        </div>

        {result && (
          <div className={`mt-4 rounded-lg border p-3.5 ${result.status === "blocked" ? "border-rose-500/30 bg-rose-500/[0.06]" : "border-emerald-500/25 bg-emerald-500/[0.05]"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${result.mode === "live" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{result.mode}</span>
              <span className={`text-sm font-semibold ${result.status === "blocked" ? "text-rose-300" : "text-emerald-300"}`}>{result.status === "published" ? "Published" : result.status === "scheduled" ? `Scheduled for ${result.scheduledFor}` : "Blocked"}</span>
              {result.status !== "blocked" && <span className="text-xs text-slate-400">→ {result.platforms.join(", ")}</span>}
              {result.watermarked && <Pill tone="neutral">watermarked</Pill>}
            </div>
            {!result.compliance.pass && <ul className="mt-2 list-disc pl-5 text-xs text-rose-300">{result.compliance.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            <p className="mt-2 text-[11px] text-slate-500">{result.note}</p>
          </div>
        )}
      </div>

      {status && (
        <p className="text-xs text-slate-600">{status.note} · Billing: {status.billing}.</p>
      )}
    </div>
  );
}
