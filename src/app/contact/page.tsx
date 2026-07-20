"use client";

import { useState } from "react";
import { Mail, MessageCircle, Building2 } from "lucide-react";
import { MarketingShell, H2, Prose } from "@/components/marketing";

const SUPPORT_EMAIL = "info@marketwaros.com";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("Sales");
  const [message, setMessage] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Honest + functional: compose an email in the visitor's own client. No
    // hidden collection — nothing is stored until the message is actually sent.
    const body = `Name: ${name}\nEmail: ${email}\nTopic: ${topic}\n\n${message}`;
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`[${topic}] MarketWar OS enquiry`)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <MarketingShell
      kicker="Contact"
      title="Talk to the team"
      subtitle="Sales, support, partnerships or press — we read everything. Choose a channel or send us a message and we'll get back to you."
    >
      <Prose>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card p-5"><Mail className="h-5 w-5 text-emerald-400" /><h3 className="mt-2 font-display text-sm font-bold text-white">Email</h3><a href={`mailto:${SUPPORT_EMAIL}`} className="mt-1 block text-sm text-emerald-300 hover:text-emerald-200">{SUPPORT_EMAIL}</a></div>
          <div className="card p-5"><MessageCircle className="h-5 w-5 text-emerald-400" /><h3 className="mt-2 font-display text-sm font-bold text-white">Support</h3><p className="mt-1 text-sm text-slate-400">In-app help for signed-in customers, plus priority support on Scale and above.</p></div>
          <div className="card p-5"><Building2 className="h-5 w-5 text-emerald-400" /><h3 className="mt-2 font-display text-sm font-bold text-white">Enterprise</h3><p className="mt-1 text-sm text-slate-400">Dedicated onboarding, security review and a named success manager.</p></div>
        </div>

        <H2>Send a message</H2>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-400">Name</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60" placeholder="Alex Carter" /></label>
            <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-400">Email</span>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60" placeholder="you@business.com" /></label>
          </div>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-400">Topic</span>
            <select value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60">
              {["Sales", "Support", "Partnerships", "Creator network", "Press", "Other"].map((t) => <option key={t}>{t}</option>)}
            </select></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-400">Message</span>
            <textarea required rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/60" placeholder="How can we help?" /></label>
          <button type="submit" className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400">Send message</button>
        </form>
        <p className="text-[13px] text-slate-500">This opens your email client addressed to {SUPPORT_EMAIL} — nothing is collected until you hit send.</p>
      </Prose>
    </MarketingShell>
  );
}
