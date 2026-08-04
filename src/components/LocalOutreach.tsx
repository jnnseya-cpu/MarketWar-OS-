"use client";

// Flyers and local-group posts — the two parts of local growth that happen off
// the screen. Both are drafted here and published by a person, which is not a
// limitation we are apologising for: there is no supported way for a third-party
// tool to post into somebody else's community group, and the tools that claim
// otherwise get the account restricted.

import { useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, Printer, Users } from "lucide-react";
import { Pill } from "@/components/ui";

type FlyerBlock = { role: string; text: string; maxChars: number; over: boolean };
type FlyerPlanView = {
  spec: { label: string; dpi: number; pixels: { w: number; h: number }; trimPixels: { w: number; h: number }; safeBoxPixels: { w: number; h: number }; notes: string[] };
  blocks: FlyerBlock[];
  qr: { target: string; sizeMm: number; sizePx: number; ok: boolean; note: string } | null;
  warnings: string[];
  readableFrom: string;
  checklist: string[];
};
type GroupPostView = { label: string; post: string; chars: number; rules: string[]; automation: string; cadence: string; warnings: string[] };

const SIZES = [
  { id: "a6", label: "A6 postcard" }, { id: "dl", label: "DL leaflet" }, { id: "a5", label: "A5 flyer" },
  { id: "a4", label: "A4 sheet" }, { id: "a3", label: "A3 poster" },
];
const GROUPS = [
  { id: "facebook-group", label: "Facebook local group" }, { id: "nextdoor", label: "Nextdoor" },
  { id: "whatsapp-community", label: "WhatsApp community" }, { id: "reddit-local", label: "Local subreddit" },
  { id: "noticeboard", label: "Physical noticeboard" }, { id: "local-forum", label: "Local forum" },
];

export default function LocalOutreach({ brandName, town }: { brandName?: string; town?: string }) {
  const [tab, setTab] = useState<"flyer" | "group">("flyer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [sizeId, setSizeId] = useState("a5");
  const [headline, setHeadline] = useState("");
  const [subhead, setSubhead] = useState("");
  const [offer, setOffer] = useState("");
  const [cta, setCta] = useState("");
  const [contact, setContact] = useState("");
  const [qrTarget, setQrTarget] = useState("");
  const [flyer, setFlyer] = useState<FlyerPlanView | null>(null);

  const [kindId, setKindId] = useState("facebook-group");
  const [what, setWhat] = useState("");
  const [groupOffer, setGroupOffer] = useState("");
  const [link, setLink] = useState("");
  const [post, setPost] = useState<GroupPostView | null>(null);

  async function call(body: Record<string, unknown>, onOk: (d: unknown) => void) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/local-outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || "That did not work."); return; }
      onOk(data);
    } catch { setError("Could not reach the local outreach engine."); } finally { setBusy(false); }
  }

  return (
    <div className="mb-6 card border-sky-500/25 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Printer className="h-5 w-5 text-sky-400" />
        <h2 className="font-display text-lg font-bold text-white">Flyers and local group posts</h2>
        <div className="ml-auto flex gap-1.5">
          <button className={tab === "flyer" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("flyer")}>Flyer</button>
          <button className={tab === "group" ? "btn-primary" : "btn-ghost"} onClick={() => setTab("group")}>Group post</button>
        </div>
      </div>

      {tab === "flyer" ? (
        <>
          <p className="mb-4 text-sm text-slate-400">
            Specified in millimetres, the unit a printer works in — with bleed, a safe area, and a QR code big enough to scan in the light a flyer is actually read in. A social-post size sent to a print shop comes back fuzzy; this does not.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Size</label>
              <select className="input" value={sizeId} onChange={(e) => setSizeId(e.target.value)}>
                {SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div><label className="label">Headline</label><input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="The one thing they must read" /></div>
            <div><label className="label">Sub-line</label><input className="input" value={subhead} onChange={(e) => setSubhead(e.target.value)} placeholder="What you do, plainly" /></div>
            <div><label className="label">Offer (optional)</label><input className="input" value={offer} onChange={(e) => setOffer(e.target.value)} /></div>
            <div><label className="label">Call to action</label><input className="input" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Call, order, visit — say which" /></div>
            <div><label className="label">Contact</label><input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone · address · hours" /></div>
            <div className="sm:col-span-2"><label className="label">QR code goes to</label><input className="input" value={qrTarget} onChange={(e) => setQrTarget(e.target.value)} placeholder="Your site, your menu, or your review link" /></div>
          </div>
          <button className="btn-primary mt-4" onClick={() => call({ action: "flyer", sizeId, headline, subhead, offer, cta, contact, qrTarget }, (d) => setFlyer(d as FlyerPlanView))} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Working it out…</> : <><Printer className="h-4 w-4" /> Build the print spec</>}
          </button>
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-400">
            A post that reads like a neighbour, with the group&apos;s own rules beside it. You publish it yourself — nothing here posts into a community on your behalf, because no platform permits that and the ones that pretend to get accounts restricted.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Where</label>
              <select className="input" value={kindId} onChange={(e) => setKindId(e.target.value)}>
                {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </div>
            <div><label className="label">Offer or news (optional)</label><input className="input" value={groupOffer} onChange={(e) => setGroupOffer(e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="label">What you do, in your words</label><textarea className="input min-h-[80px]" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="We cook West African food and deliver within three miles." /></div>
            <div className="sm:col-span-2"><label className="label">Link (optional)</label><input className="input" value={link} onChange={(e) => setLink(e.target.value)} /></div>
          </div>
          <button className="btn-primary mt-4" onClick={() => call({ action: "group-post", kindId, brandName, town, what, offer: groupOffer, link }, (d) => setPost(d as GroupPostView))} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Drafting…</> : <><Users className="h-4 w-4" /> Draft the post</>}
          </button>
        </>
      )}

      {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200">{error}</p>}

      {tab === "flyer" && flyer && (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="info">{flyer.spec.label}</Pill>
            <span className="text-sm text-slate-300">{flyer.spec.pixels.w}×{flyer.spec.pixels.h}px at {flyer.spec.dpi} DPI · read from {flyer.readableFrom}</span>
          </div>
          {flyer.warnings.length > 0 && (
            <ul className="space-y-1.5">
              {flyer.warnings.map((w, i) => (
                <li key={i} className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2.5 text-xs leading-relaxed text-amber-200/90">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-lg border border-white/10 bg-ink-900/50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Copy blocks</p>
            {flyer.blocks.map((b) => (
              <p key={b.role} className="mb-1 text-sm text-slate-300">
                <span className="mr-2 text-xs uppercase tracking-wider text-slate-600">{b.role}</span>{b.text}
                <span className={`ml-2 text-[11px] ${b.over ? "text-rose-300" : "text-slate-600"}`}>{b.text.length}/{b.maxChars}</span>
              </p>
            ))}
            {flyer.qr && <p className="mt-2 text-xs text-slate-400">QR → {flyer.qr.target} · {flyer.qr.sizeMm}mm ({flyer.qr.sizePx}px). {flyer.qr.note}</p>}
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">Before you order the run</p>
            <ol className="space-y-1">{flyer.checklist.map((c, i) => <li key={i} className="text-xs leading-relaxed text-slate-400">{i + 1}. {c}</li>)}</ol>
            <div className="mt-2 space-y-1">{flyer.spec.notes.map((n, i) => <p key={i} className="text-[11px] leading-relaxed text-slate-600">{n}</p>)}</div>
          </div>
        </div>
      )}

      {tab === "group" && post && (
        <div className="mt-5 space-y-3">
          <div className="rounded-lg border border-white/10 bg-ink-900/50 p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{post.label} · {post.chars} characters</p>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:border-emerald-500/40"
                onClick={() => { navigator.clipboard?.writeText(post.post).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }).catch(() => {}); }}>
                {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-300">{post.post}</pre>
          </div>
          {post.warnings.length > 0 && (
            <ul className="space-y-1.5">
              {post.warnings.map((w, i) => (
                <li key={i} className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2.5 text-xs leading-relaxed text-amber-200/90">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">What this group expects</p>
            <ul className="space-y-1">{post.rules.map((r, i) => <li key={i} className="text-xs leading-relaxed text-slate-400">· {r}</li>)}</ul>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500"><span className="font-semibold text-slate-400">Cadence: </span>{post.cadence}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500"><span className="font-semibold text-slate-400">Automation: </span>{post.automation}</p>
          </div>
        </div>
      )}
    </div>
  );
}
