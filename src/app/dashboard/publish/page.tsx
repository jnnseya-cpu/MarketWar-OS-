"use client";

// Publish Center — platform-managed social publishing (Zernio).
// Connect a brand's socials in one click (white-label, no app review on our
// side), then compose and cross-post to up to 15 channels. Every post passes the
// compliance gate and carries the AI-content watermark. Wired to /api/zernio;
// demo-safe with zero config, live the moment ZERNIO_API_KEY is set.

import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Copy, Link2, Loader2, Send, ShieldCheck, Clock, Facebook, Instagram, CheckCircle2, XCircle, Unlink } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { composerUrl } from "@/shared/social";

type MetaStatus = { connected: boolean; pageName?: string; pageId?: string; igUsername?: string; igConnected: boolean; oauthConfigured?: boolean; tokenSource?: string };

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
  // Native Meta (Facebook Pages + Instagram Business) — our own connector.
  const [meta, setMeta] = useState<MetaStatus | null>(null);
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaMsg, setMetaMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [pageId, setPageId] = useState("");
  const [pageToken, setPageToken] = useState("");

  useEffect(() => {
    authedFetch("/api/zernio").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  const loadMeta = useCallback(async (brandId: string) => {
    try {
      const r = await authedFetch("/api/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", brandId }) });
      setMeta(await r.json());
    } catch { setMeta(null); }
  }, []);

  // Reset per-brand state when the active brand changes; load Meta status.
  useEffect(() => {
    setLink(null); setResult(null); setMetaMsg(null);
    if (activeBrand) loadMeta(activeBrand.id);
  }, [activeBrand?.id, activeBrand, loadMeta]);

  // Surface the OAuth callback outcome (?meta=connected|error) after returning
  // from Facebook, then clean the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const m = p.get("meta");
    if (!m) return;
    if (m === "connected") setMetaMsg({ text: `Connected${p.get("page") ? ` — ${p.get("page")}` : ""}. Facebook & Instagram now publish natively.`, error: false });
    else if (m === "error") setMetaMsg({ text: `Couldn't connect: ${p.get("reason") || "unknown error"}`, error: true });
    window.history.replaceState({}, "", window.location.pathname);
    if (activeBrand) loadMeta(activeBrand.id);
  }, [activeBrand, loadMeta]);

  async function connectFacebook() {
    if (!activeBrand) return;
    setMetaBusy(true); setMetaMsg(null);
    try {
      const r = await authedFetch("/api/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "oauth-url", brandId: activeBrand.id }) });
      const d = await r.json();
      if (r.ok && d.url) { window.location.href = d.url; return; }
      setMetaMsg({ text: d.error || "Connect with Facebook isn't available — use the Page-token option.", error: true });
      setShowToken(true);
    } finally { setMetaBusy(false); }
  }

  async function connectWithToken() {
    if (!activeBrand || !pageId.trim() || !pageToken.trim()) return;
    setMetaBusy(true); setMetaMsg(null);
    try {
      const r = await authedFetch("/api/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect-token", brandId: activeBrand.id, pageId: pageId.trim(), pageAccessToken: pageToken.trim() }) });
      const d = await r.json();
      if (r.ok && d.ok) { setMeta(d.connection); setMetaMsg({ text: `Connected ${d.connection?.pageName || "your Page"}${d.connection?.igConnected ? ` + Instagram (@${d.connection.igUsername})` : ""}.`, error: false }); setPageId(""); setPageToken(""); setShowToken(false); }
      else setMetaMsg({ text: d.error || "Couldn't connect — check the Page ID and token.", error: true });
    } finally { setMetaBusy(false); }
  }

  async function disconnectMeta() {
    if (!activeBrand) return;
    setMetaBusy(true);
    try {
      await authedFetch("/api/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect", brandId: activeBrand.id }) });
      setMeta({ connected: false, igConnected: false, oauthConfigured: meta?.oauthConfigured }); setMetaMsg({ text: "Disconnected.", error: false });
    } finally { setMetaBusy(false); }
  }

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

      {/* Native Meta — Facebook Pages + Instagram Business (our own connector) */}
      <div className="mb-6 card border-sky-500/25 p-5">
        <div className="mb-1 flex items-center gap-2">
          <Facebook className="h-4 w-4 text-sky-400" /><Instagram className="h-4 w-4 text-pink-400" />
          <h2 className="font-display font-bold text-white">Facebook &amp; Instagram — direct connect</h2>
          <Pill tone="info">native · no vendor</Pill>
        </div>
        <p className="mb-3 text-xs text-slate-400">The two channels that matter most publish through MarketWar&apos;s own Meta connector — best margin, no aggregator in the middle. Connect once; then just tick Facebook/Instagram below and publish.</p>

        {meta?.connected ? (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {meta.pageName || "Facebook Page"}</span>
              {meta.igConnected ? (
                <span className="inline-flex items-center gap-1 text-xs text-pink-300"><Instagram className="h-3.5 w-3.5" /> @{meta.igUsername}</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-amber-300"><XCircle className="h-3.5 w-3.5" /> No Instagram linked to this Page</span>
              )}
              <button onClick={disconnectMeta} disabled={metaBusy} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-rose-300"><Unlink className="h-3.5 w-3.5" /> Disconnect</button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">Facebook posts natively. {meta.igConnected ? "Instagram posts natively when a creative image is attached (Instagram requires media)." : "Link an Instagram Business account to this Page in Meta Business settings, then reconnect, to post to Instagram."}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary !bg-[#1877F2] hover:!bg-[#1568d8]" onClick={connectFacebook} disabled={metaBusy}>
                {metaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />} Connect with Facebook
              </button>
              <button className="btn-ghost" onClick={() => setShowToken((v) => !v)}>Use a Page token instead</button>
              {meta && meta.oauthConfigured === false && <span className="text-[11px] text-amber-400">One-click OAuth needs the Meta app keys — the Page-token option works today.</span>}
            </div>
            {showToken && (
              <div className="rounded-lg border border-white/10 bg-ink-950/40 p-3">
                <p className="mb-2 text-[11px] leading-relaxed text-slate-400">Paste a <span className="text-slate-200">Page access token</span> and its <span className="text-slate-200">Page ID</span> (from Meta Business settings / Graph API Explorer). This connects your own Page — no app review needed. The token is stored server-side and never shown again.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="input" placeholder="Page ID (e.g. 1029384756)" value={pageId} onChange={(e) => setPageId(e.target.value)} />
                  <input className="input" placeholder="Page access token" value={pageToken} onChange={(e) => setPageToken(e.target.value)} type="password" />
                </div>
                <button className="btn-primary mt-2" onClick={connectWithToken} disabled={metaBusy || !pageId.trim() || !pageToken.trim()}>{metaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Connect Page</button>
              </div>
            )}
          </div>
        )}
        {metaMsg && (
          <p className={`mt-3 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${metaMsg.error ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>
            {metaMsg.error ? <XCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />} {metaMsg.text}
          </p>
        )}
      </div>

      {/* Connect socials (Zernio — the long-tail channels + failover) */}
      <div className="mb-8 card p-5">
        <div className="mb-1 flex items-center gap-2"><Link2 className="h-4 w-4 text-emerald-400" /><h2 className="font-display font-bold text-white">Connect {activeBrand.name}&apos;s other channels</h2></div>
        <p className="mb-3 text-xs text-slate-400">TikTok, YouTube, LinkedIn, X, Pinterest and more — one click per network opens Zernio&apos;s hosted OAuth (no app review on our side). Facebook &amp; Instagram are covered by the direct connector above; Zernio is their failover if the native post can&apos;t go.</p>
        <button className="btn-primary" onClick={connect} disabled={linkBusy}>{linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} {link ? "Refresh connect links" : "Generate connect links"}</button>
        {link && link.mode === "live-error" && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3">
            <p className="text-sm font-semibold text-rose-300">Couldn&apos;t create the connect links</p>
            <p className="mt-1 text-[11px] text-slate-400">{link.note}</p>
            {link.diagnostic && <p className="mt-1 break-all text-[11px] text-slate-500">{link.diagnostic}</p>}
            <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-emerald-300">You don&rsquo;t have to connect to publish — compose below and use <span className="font-semibold">&ldquo;Post it yourself&rdquo;</span> to post from your own accounts with zero setup.</p>
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
            {result.status === "blocked" && !meta?.connected && /facebook|instagram|connected/i.test(result.note) && (
              <button onClick={connectFacebook} disabled={metaBusy} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#1877F2] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1568d8]">
                <Facebook className="h-3.5 w-3.5" /> Connect Facebook &amp; Instagram now
              </button>
            )}
          </div>
        )}

        {/* Always-works manual path — post from your own accounts, no connection needed. */}
        {text.trim() && selected.size > 0 && (
          <details className="mt-3 rounded-lg border border-white/10 bg-ink-950/40 p-3" open={result?.status === "blocked" || undefined}>
            <summary className="cursor-pointer list-none text-xs font-bold text-emerald-300">Post it yourself — no connection or key needed ↓</summary>
            <div className="mt-2 space-y-2.5">
              <p className="text-[11px] leading-relaxed text-slate-400">Open each network&rsquo;s own composer with your caption ready. Works from your own accounts with zero setup — even if the managed publisher is unavailable.</p>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1400); }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-emerald-300">{copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />} Copy caption</button>
              <div className="flex flex-wrap gap-1.5">
                {[...selected].map((p) => {
                  const label = status?.platforms.find((x) => x.id === p)?.label || p;
                  const url = composerUrl(p, text, activeBrand?.website || "");
                  return url ? (
                    <a key={p} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/40 hover:bg-emerald-500/25">Open {label} <Link2 className="h-3 w-3" /></a>
                  ) : (
                    <span key={p} className="rounded-full bg-ink-850 px-3 py-1.5 text-xs text-slate-400" title="No web composer — copy the caption and post in the app">{label}: copy + app</span>
                  );
                })}
              </div>
            </div>
          </details>
        )}
      </div>

      {status && (
        <p className="text-xs text-slate-600">{status.note} · Billing: {status.billing}.</p>
      )}
    </div>
  );
}
