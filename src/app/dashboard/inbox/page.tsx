"use client";

// Unified Inbox — read and reply to campaign replies in-app (the receiving half
// of the ESP). Replies to your sends arrive at your domain's MX, are pushed to
// the platform, and land here per brand. Reply DKIM-signed as your domain,
// without leaving the OS.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Inbox as InboxIcon, Mail, MailOpen, Send, CornerUpLeft, RefreshCcw } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type Msg = { id: string; brandId: string; from: string; fromName?: string; to: string; subject: string; snippet: string; text?: string; html?: string; receivedAt: string; read: boolean };

export default function InboxPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Msg | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async (brandId: string) => {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/inbound?brandId=${encodeURIComponent(brandId)}`);
      const d = await res.json().catch(() => ({}));
      setMessages(Array.isArray(d.messages) ? d.messages : []);
      setUnread(typeof d.unread === "number" ? d.unread : 0);
    } catch { setMessages([]); } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (ready && activeBrand) load(activeBrand.id); else if (ready) setMessages([]); }, [ready, activeBrand, load]);

  async function open(m: Msg) {
    setActive(m); setReply(""); setMsg(null);
    if (!m.read && activeBrand) {
      await authedFetch("/api/inbound", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "markRead", brandId: activeBrand.id, id: m.id, read: true }) });
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
  }

  async function sendReply() {
    if (!activeBrand || !active || !reply.trim()) return;
    setSending(true); setMsg(null);
    try {
      const res = await authedFetch("/api/inbound", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", brandId: activeBrand.id, id: active.id, html: reply.replace(/\n/g, "<br/>"), fromEmail: active.to }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(d.ok ? { text: "Reply sent.", error: false } : { text: d.error || d.detail || "Reply failed", error: true });
      if (d.ok) setReply("");
    } finally { setSending(false); }
  }

  const when = (iso: string) => { try { return iso.slice(0, 16).replace("T", " "); } catch { return iso; } };

  return (
    <div>
      <PageHeader
        kicker="Unified Inbox"
        title="Every reply, in one place"
        subtitle="Replies to your campaigns land here per brand — read and respond DKIM-signed as your own domain, without leaving the OS. Bounces and auto-replies are filtered out (they feed suppression, not your inbox)."
        actions={
          <div className="flex items-center gap-2">
            {unread > 0 && <Pill tone="good">{unread} unread</Pill>}
            {activeBrand && <button className="btn-ghost" onClick={() => load(activeBrand.id)} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Refresh</button>}
          </div>
        }
      />

      {ready && !activeBrand && (
        <div className="card border-emerald-500/20 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><InboxIcon className="h-5 w-5" /></span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">Add a brand first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Pick or add a brand in the switcher to see its inbox.</p>
        </div>
      )}

      {activeBrand && (
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_1fr]">
          {/* Message list */}
          <div className="card h-max overflow-hidden p-0">
            {busy && !messages.length && <p className="p-6 text-center text-xs text-slate-500"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…</p>}
            {!busy && !messages.length && (
              <div className="p-8 text-center">
                <InboxIcon className="mx-auto mb-2 h-7 w-7 text-slate-600" />
                <p className="text-sm font-semibold text-white">No replies yet</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">When people reply to your campaigns, they show up here. (Requires inbound mail set up — see the email guide.)</p>
              </div>
            )}
            <div className="max-h-[70vh] divide-y divide-ink-800 overflow-y-auto">
              {messages.map((m) => (
                <button key={m.id} onClick={() => open(m)} className={`flex w-full items-start gap-2 px-4 py-3 text-left transition hover:bg-ink-850 ${active?.id === m.id ? "bg-ink-850" : ""}`}>
                  <span className={`mt-0.5 ${m.read ? "text-slate-600" : "text-emerald-400"}`}>{m.read ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${m.read ? "text-slate-300" : "font-semibold text-white"}`}>{m.fromName || m.from}</span>
                      <span className="shrink-0 text-[10px] text-slate-500">{when(m.receivedAt)}</span>
                    </span>
                    <span className="block truncate text-xs text-slate-400">{m.subject}</span>
                    <span className="block truncate text-[11px] text-slate-600">{m.snippet}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Reading pane */}
          <div className="card p-5">
            {!active ? (
              <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-slate-500">
                <MailOpen className="mb-2 h-8 w-8" /><p className="text-sm">Select a message to read and reply.</p>
              </div>
            ) : (
              <>
                <div className="mb-3 border-b border-ink-800 pb-3">
                  <h2 className="font-display text-lg font-bold text-white">{active.subject}</h2>
                  <p className="mt-1 text-xs text-slate-400">From <span className="text-slate-200">{active.fromName ? `${active.fromName} <${active.from}>` : active.from}</span> · to {active.to} · {when(active.receivedAt)}</p>
                </div>
                <div className="mb-4 max-h-[38vh] overflow-y-auto rounded-lg border border-ink-800 bg-white p-3">
                  {active.html
                    ? <iframe title="message" className="h-[34vh] w-full" srcDoc={active.html} />
                    : <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">{active.text || active.snippet}</pre>}
                </div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-300"><CornerUpLeft className="h-3.5 w-3.5" /> Reply as {active.to}</div>
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={5} placeholder="Type your reply…" className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/60" />
                <div className="mt-2 flex items-center gap-3">
                  <button className="btn-primary" onClick={sendReply} disabled={sending || !reply.trim()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send reply</button>
                  {msg && <span className={`text-sm font-medium ${msg.error ? "text-rose-300" : "text-emerald-300"}`}>{msg.text}</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
