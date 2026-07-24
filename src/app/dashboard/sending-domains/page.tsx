"use client";

// Sending Domains — the ESP domain-authentication console.
// Add your own domain → the platform generates a per-domain DKIM key and shows
// the EXACT DNS records to publish → click Verify to run a live DNS check → once
// the required records resolve, the domain is authenticated and every campaign
// sends AS that domain (From + Reply-To on your address, DKIM-signed) so mail
// lands in the inbox and replies come back to you. No third-party ESP involved.

import { useCallback, useEffect, useState } from "react";
import { Loader2, AtSign, Plus, ShieldCheck, Copy, Check, RefreshCcw, Trash2, AlertTriangle, CircleDot } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";

type DnsRecord = { purpose: string; type: "TXT" | "CNAME"; host: string; value: string; required: boolean; verified?: boolean; detail?: string };
type DomainView = { brandId: string; domain: string; selector: string; publicKey: string; status: "pending" | "verified"; createdAt: string; verifiedAt?: string; records: DnsRecord[] };

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* clipboard blocked */ } }}
      className="shrink-0 rounded p-1 text-slate-400 hover:bg-ink-800 hover:text-emerald-300"
      title="Copy"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function SendingDomainsPage() {
  const { activeBrand, ready } = useActiveBrand();
  const [domains, setDomains] = useState<DomainView[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async (brandId: string) => {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/sending-domains?brandId=${encodeURIComponent(brandId)}`);
      const d = await res.json().catch(() => ({}));
      setDomains(Array.isArray(d.domains) ? d.domains : []);
    } catch { setDomains([]); } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (ready && activeBrand) load(activeBrand.id); else if (ready) setDomains([]); }, [ready, activeBrand, load]);

  async function addDomain() {
    if (!activeBrand || !input.trim()) return;
    setAdding(true); setMsg(null);
    try {
      const res = await authedFetch("/api/sending-domains", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", brandId: activeBrand.id, domain: input.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ text: d.error || "Could not add domain", error: true }); return; }
      setInput("");
      setMsg({ text: `Added ${d.domain}. Publish the DNS records below, then click Verify.`, error: false });
      await load(activeBrand.id);
    } finally { setAdding(false); }
  }

  async function verify(domain: string) {
    if (!activeBrand) return;
    setVerifying(domain); setMsg(null);
    try {
      const res = await authedFetch("/api/sending-domains", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", brandId: activeBrand.id, domain }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ text: d.error || "Verify failed", error: true }); return; }
      setDomains((prev) => prev.map((x) => (x.domain === domain ? d : x)));
      setMsg(d.status === "verified"
        ? { text: `${domain} is authenticated — campaigns now send as this domain, DKIM-signed.`, error: false }
        : { text: `${domain} not verified yet — some records haven't propagated. DNS can take up to 24–48h.`, error: true });
    } finally { setVerifying(null); }
  }

  async function remove(domain: string) {
    if (!activeBrand || !confirm(`Remove ${domain}? Its DKIM key is deleted and sends stop signing as it.`)) return;
    await authedFetch(`/api/sending-domains?brandId=${encodeURIComponent(activeBrand.id)}&domain=${encodeURIComponent(domain)}`, { method: "DELETE" });
    await load(activeBrand.id);
  }

  return (
    <div>
      <PageHeader
        kicker="Authenticated Sending"
        title="Send from your own domain — no third-party ESP"
        subtitle="Authenticate your domain once and MarketWar OS sends every campaign as you: From and Reply-To on your own address (replies land in your inbox), cryptographically DKIM-signed so inboxes trust it. Add your domain, publish the DNS records, verify — that's the whole setup."
        actions={<Pill tone="info">SPF · DKIM · DMARC</Pill>}
      />

      {ready && !activeBrand && (
        <div className="card border-emerald-500/20 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><AtSign className="h-5 w-5" /></span>
          <h2 className="mt-4 font-display text-lg font-bold text-white">Add a brand first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Pick or add a brand in the switcher, then authenticate that brand&apos;s sending domain here.</p>
        </div>
      )}

      {activeBrand && (
        <>
          {/* Add domain */}
          <div className="mb-6 card border-emerald-500/25 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-400" />
              <h2 className="font-display text-sm font-bold text-white">Add a sending domain</h2>
            </div>
            <p className="mb-3 text-xs text-slate-400">Use a domain you control (e.g. <span className="text-slate-300">{activeBrand.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com</span>). We generate a unique DKIM key for it — nothing to buy, no other provider.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={input} onChange={(e) => setInput(e.target.value)} placeholder="yourbusiness.com"
                onKeyDown={(e) => { if (e.key === "Enter") addDomain(); }}
                className="min-w-[220px] flex-1 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60"
              />
              <button className="btn-primary" onClick={addDomain} disabled={adding || !input.trim()}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add domain
              </button>
            </div>
            {msg && (
              <p className={`mt-3 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${msg.error ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>
                {msg.error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />} {msg.text}
              </p>
            )}
          </div>

          {busy && !domains.length && (
            <div className="card p-10 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-5 w-5 animate-spin text-emerald-400" /><p className="mt-3">Loading domains…</p></div>
          )}

          {!busy && !domains.length && (
            <div className="card p-10 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><AtSign className="h-5 w-5" /></span>
              <h2 className="mt-4 font-display text-lg font-bold text-white">No sending domains yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Add your domain above to authenticate it. Until then, campaigns send from the shared platform address instead of your own.</p>
            </div>
          )}

          {domains.map((d) => (
            <div key={d.domain} className="mb-6 card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AtSign className="h-4 w-4 text-emerald-400" />
                  <h3 className="font-display text-base font-bold text-white">{d.domain}</h3>
                  {d.status === "verified"
                    ? <Pill tone="good"><ShieldCheck className="mr-1 inline h-3 w-3" /> Authenticated</Pill>
                    : <Pill tone="warn"><CircleDot className="mr-1 inline h-3 w-3" /> Pending DNS</Pill>}
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-ghost" onClick={() => verify(d.domain)} disabled={verifying === d.domain}>
                    {verifying === d.domain ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Verify DNS
                  </button>
                  <button className="btn-ghost !text-rose-300" onClick={() => remove(d.domain)}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              <p className="mb-3 text-xs text-slate-400">Add these records in your domain&apos;s DNS (at your registrar / DNS host). Required records must all pass before the domain authenticates. DNS changes can take up to 24–48h to propagate.</p>

              <div className="space-y-2">
                {d.records.map((r) => (
                  <div key={r.purpose} className="rounded-lg border border-ink-700 bg-ink-850/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xs font-bold text-white">{r.purpose}</span>
                        <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">{r.type}</span>
                        {r.required ? <span className="text-[10px] text-slate-500">required</span> : <span className="text-[10px] text-slate-600">optional</span>}
                      </div>
                      {r.verified === true ? <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400"><Check className="h-3 w-3" /> verified</span>
                        : r.verified === false ? <span className="flex items-center gap-1 text-[11px] text-amber-400"><CircleDot className="h-3 w-3" /> not found</span>
                        : null}
                    </div>
                    <div className="grid gap-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-slate-500">Host</span>
                        <code className="flex-1 truncate rounded bg-ink-900 px-2 py-1 font-mono text-slate-200">{r.host}</code>
                        <CopyBtn text={r.host} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-slate-500">Value</span>
                        <code className="flex-1 truncate rounded bg-ink-900 px-2 py-1 font-mono text-slate-200">{r.value}</code>
                        <CopyBtn text={r.value} />
                      </div>
                      {r.detail && <p className="pl-14 text-[11px] text-slate-500">{r.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>

              {d.status === "verified" && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" /> Live. Set the campaign From to an address on <span className="font-mono">{d.domain}</span> in the Email Center and it sends signed as you.
                </p>
              )}
            </div>
          ))}

          <div className="card border-amber-500/20 bg-amber-500/[0.04] p-4 text-xs text-amber-200/90">
            <p className="mb-1 font-bold">How delivery works</p>
            <p className="text-amber-200/70">
              Authentication (these DNS records + DKIM) is what makes inboxes trust your mail. The messages are handed to recipient servers by MarketWar&apos;s sending infrastructure — no Brevo, SendGrid or Resend account of yours is used. Your domain reputation is your own, built as you send.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
