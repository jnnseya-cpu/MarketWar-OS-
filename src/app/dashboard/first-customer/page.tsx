"use client";

// First Customer — the guided "zero → first paying customer" sprint.
// One screen that runs the real agents in sequence (offer → leads → outreach)
// and mints a self-attributing Stripe checkout link, so a brand-new user is
// walked from nothing to a sendable outreach + payment link in one sitting.
// No ad platforms — owned channels + a margin-safe offer + a frictionless link.
// Every step calls a real engine (/api/agents/* and /api/checkout).

import { useState } from "react";
import Link from "next/link";
import { Building2, BadgePercent, Users, MessageCircle, Link2, Loader2, Copy, Check, Rocket, ArrowRight, Send } from "lucide-react";
import { AgentMarkdown, PageHeader, Pill } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";
import { authedFetch } from "@/frontend/api-client";
import { brandDefaults } from "@/shared/brand";

type CheckoutResult = { ok: boolean; mode: "live" | "demo"; url: string | null; note: string; error?: string };

// Trim generated markdown to a short brief we can feed the next agent.
const brief = (md: string, n = 700) => md.replace(/```[\s\S]*?```/g, "").replace(/[#*_>`]/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);

export default function FirstCustomerPage() {
  const { activeBrand } = useActiveBrand();
  const d = brandDefaults(activeBrand);
  const [form, setForm] = useState({
    business: d.business || "",
    product: d.product || "",
    price: "",
    amount: "",
    targetCustomer: d.audience || "",
    location: d.location || "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const [offer, setOffer] = useState<string | null>(null);
  const [leads, setLeads] = useState<string | null>(null);
  const [outreach, setOutreach] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (key: string, text: string) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };

  async function runAgent(agentId: string, fields: Record<string, string>): Promise<string> {
    const res = await fetch(`/api/agents/${agentId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Agent failed");
    return data.output as string;
  }

  const ready = Boolean(form.business.trim() && form.product.trim());

  async function step1Offer() {
    setBusy("offer");
    try {
      const out = await runAgent("offer-builder", { business: form.business, product: form.product, price: form.price, margin: "", targetCustomer: form.targetCustomer });
      setOffer(out);
    } catch (e) { setOffer(`⚠️ ${e instanceof Error ? e.message : "Failed"}`); } finally { setBusy(null); }
  }
  async function step2Leads() {
    setBusy("leads");
    try {
      const out = await runAgent("lead-hunter", { business: form.business, product: form.product, targetCustomer: form.targetCustomer, location: form.location });
      setLeads(out);
    } catch (e) { setLeads(`⚠️ ${e instanceof Error ? e.message : "Failed"}`); } finally { setBusy(null); }
  }
  async function step3Outreach() {
    setBusy("outreach");
    try {
      const out = await runAgent("outreach-commander", {
        business: form.business, product: form.product, targetCustomer: form.targetCustomer,
        offer: offer ? brief(offer) : form.product, channel: "WhatsApp + email (owned, no ads)",
      });
      setOutreach(out);
    } catch (e) { setOutreach(`⚠️ ${e instanceof Error ? e.message : "Failed"}`); } finally { setBusy(null); }
  }
  async function step4Checkout() {
    if (!activeBrand) return;
    setBusy("checkout");
    try {
      const amt = Number(form.amount) || Number((form.price.match(/[\d.]+/) || [])[0]) || 25;
      const res = await authedFetch("/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: activeBrand.id, source: "First Customer — direct outreach", amountGbp: amt, productName: form.product || "First order" }),
      });
      setCheckout(await res.json());
    } catch { setCheckout({ ok: false, mode: "demo", url: null, note: "Network error" }); } finally { setBusy(null); }
  }

  const Step = ({ n, done, icon: Icon, title, sub }: { n: number; done: boolean; icon: typeof Rocket; title: string; sub: string }) => (
    <div className="mb-3 flex items-center gap-3">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-emerald-500 text-ink-950" : "bg-ink-800 text-slate-400 ring-1 ring-white/10"}`}>{done ? <Check className="h-4 w-4" /> : n}</span>
      <div><h2 className="flex items-center gap-2 font-display font-bold text-white"><Icon className="h-4 w-4 text-emerald-400" /> {title}</h2><p className="text-xs text-slate-500">{sub}</p></div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        kicker="First Customer Sprint"
        title="Zero to your first paying customer — no ads"
        subtitle="One sitting, five moves: engineer the offer, find who to reach, write the outreach, mint a payment link. Owned channels only — no Meta, Google or TikTok spend. Send from your own WhatsApp/email; drop the link when they say yes."
        actions={activeBrand ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-ink-900/60 px-3 py-1.5 text-xs text-slate-300"><Building2 className="h-3.5 w-3.5" style={{ color: activeBrand.color }} /> {activeBrand.name}</span> : <Pill tone="info">Add a brand to attribute the sale</Pill>}
      />

      {/* Setup */}
      <div className="mb-6 card p-5">
        <Step n={0} done={ready} icon={Rocket} title="Set the scene" sub="A few basics — the whole sprint runs off these." />
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Business / brand</label><input className="input" value={form.business} onChange={(e) => set("business", e.target.value)} placeholder="Your business name" /></div>
          <div><label className="label">Product / service</label><input className="input" value={form.product} onChange={(e) => set("product", e.target.value)} placeholder="Flame-grilled family platters" /></div>
          <div><label className="label">Who should buy?</label><input className="input" value={form.targetCustomer} onChange={(e) => set("targetCustomer", e.target.value)} placeholder="Local families within 3 miles" /></div>
          <div><label className="label">Location / area</label><input className="input" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="City or area" /></div>
          <div><label className="label">Usual price</label><input className="input" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="£25 platter" /></div>
          <div><label className="label">First-order price (£) — for the link</label><input className="input" type="number" min="1" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="20" /></div>
        </div>
      </div>

      {/* 1 — Offer */}
      <div className="mb-6 card p-5">
        <Step n={1} done={Boolean(offer)} icon={BadgePercent} title="Engineer the offer" sub="A margin-safe offer that makes a stranger buy — this is what converts without ads." />
        <button className="btn-primary" onClick={step1Offer} disabled={!ready || busy === "offer"}>{busy === "offer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgePercent className="h-4 w-4" />} {offer ? "Regenerate offer" : "Build my offer"}</button>
        {offer && <div className="mt-4 rounded-lg border border-white/[0.07] bg-ink-900/50 p-4"><AgentMarkdown text={offer} /><button onClick={() => copy("offer", offer)} className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">{copied === "offer" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy offer</button></div>}
      </div>

      {/* 2 — Leads */}
      <div className="mb-6 card p-5">
        <Step n={2} done={Boolean(leads)} icon={Users} title="Find who to reach" sub="A real list of prospects + where to find them — direct, no ad platform." />
        <button className="btn-primary" onClick={step2Leads} disabled={!ready || busy === "leads"}>{busy === "leads" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} {leads ? "Regenerate leads" : "Find my first prospects"}</button>
        {leads && <div className="mt-4 rounded-lg border border-white/[0.07] bg-ink-900/50 p-4"><AgentMarkdown text={leads} /><button onClick={() => copy("leads", leads)} className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">{copied === "leads" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy list</button></div>}
      </div>

      {/* 3 — Outreach */}
      <div className="mb-6 card p-5">
        <Step n={3} done={Boolean(outreach)} icon={MessageCircle} title="Write the outreach" sub="Ready-to-send WhatsApp + email messages built around your offer." />
        <button className="btn-primary" onClick={step3Outreach} disabled={!ready || busy === "outreach"}>{busy === "outreach" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} {outreach ? "Rewrite outreach" : "Write my messages"}</button>
        {!offer && <p className="mt-2 text-[11px] text-amber-300">Tip: build the offer first (step 1) so the messages are built around it.</p>}
        {outreach && <div className="mt-4 rounded-lg border border-white/[0.07] bg-ink-900/50 p-4"><AgentMarkdown text={outreach} /><button onClick={() => copy("outreach", outreach)} className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">{copied === "outreach" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy messages</button></div>}
      </div>

      {/* 4 — Payment link */}
      <div className="mb-6 card p-5">
        <Step n={4} done={Boolean(checkout?.url)} icon={Link2} title="Mint the payment link" sub="A self-attributing Stripe link — send it the moment they say yes. This is the money." />
        {!activeBrand && <p className="mb-2 text-xs text-amber-300">Add a brand in the sidebar so the sale attributes to it.</p>}
        <button className="btn-primary" onClick={step4Checkout} disabled={!activeBrand || busy === "checkout"}>{busy === "checkout" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} {checkout?.url ? "New link" : "Create payment link"}</button>
        {checkout && (
          <div className="mt-3 rounded-lg border border-white/[0.07] bg-ink-900/60 p-3">
            {checkout.ok && checkout.url ? (
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${checkout.mode === "live" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{checkout.mode === "live" ? "Live Stripe" : "Demo"}</span>
                <code className="min-w-0 flex-1 truncate text-xs text-sky-300">{checkout.url}</code>
                <button onClick={() => copy("link", checkout.url!)} className="shrink-0 text-slate-400 hover:text-white">{copied === "link" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}</button>
              </div>
            ) : <p className="text-xs text-rose-300">{checkout.error || checkout.note}</p>}
          </div>
        )}
      </div>

      {/* Kit / send */}
      {offer && outreach && checkout?.url && (
        <div className="mb-8 card border-emerald-500/30 bg-emerald-500/[0.05] p-5">
          <div className="mb-2 flex items-center gap-2"><Send className="h-5 w-5 text-emerald-400" /><h2 className="font-display text-lg font-bold text-white">Your first-customer kit is ready</h2></div>
          <p className="mb-3 text-sm text-slate-300">You have everything to land a paying customer without spending on ads:</p>
          <ul className="mb-4 space-y-1.5 text-sm text-slate-300">
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> A margin-safe offer</li>
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> A list of who to reach + where</li>
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Copy-paste WhatsApp/email messages</li>
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> A payment link that attributes the sale</li>
          </ul>
          <p className="mb-3 text-sm font-semibold text-white">Now: send the messages from your own WhatsApp/email to the prospects, and drop the payment link the moment someone says yes.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/whatsapp" className="btn-ghost"><MessageCircle className="h-4 w-4" /> WhatsApp Center</Link>
            <Link href="/dashboard/publish" className="btn-ghost"><Send className="h-4 w-4" /> Post organically</Link>
            <Link href="/dashboard/revenue" className="btn-primary">See the money land <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      )}
    </div>
  );
}
