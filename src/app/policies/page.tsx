import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, Prose } from "@/components/marketing";

export const metadata: Metadata = {
  title: "All policies · MarketWar OS",
  description: "Every MarketWar OS legal and trust policy in one place.",
};

const POLICIES: { name: string; href: string; blurb: string; live?: boolean }[] = [
  { name: "Terms of Service", href: "/terms", blurb: "The agreement governing your use of the platform.", live: true },
  { name: "Privacy Policy", href: "/privacy", blurb: "How we collect, use, protect and share personal data (UK/EU GDPR-aligned).", live: true },
  { name: "Acceptable Use Policy", href: "/terms", blurb: "No unlawful, deceptive or non-consensual marketing; no fabricated reviews; no bypassing safeguards." },
  { name: "Cookie Policy", href: "/privacy", blurb: "Essential cookies for auth/security and limited product analytics." },
  { name: "Data Processing Addendum (DPA)", href: "/contact", blurb: "For customers acting as controllers — sub-processors, SCCs and security measures. Available on request." },
  { name: "Anti-Spam & Consent Policy", href: "/terms", blurb: "Consent-gated marketing, a 5-touch / 7-day frequency cap, suppression lists and instant opt-out." },
  { name: "Content Rights & AI Disclosure", href: "/terms", blurb: "Rights records, mandatory AI-generated-content disclosure, no impersonation or synthetic testimonials." },
  { name: "Refund & Cancellation Policy", href: "/contact", blurb: "Subscription cancellation, downgrade protection; top-up ACUs non-refundable once partially used." },
  { name: "Service Level & Support", href: "/status", blurb: "Availability targets, support tiers, and the live status page." },
  { name: "Responsible AI Policy", href: "/terms", blurb: "Estimates labelled, unsubstantiated claims blocked, restricted categories human-gated." },
];

export default function PoliciesPage() {
  return (
    <MarketingShell
      kicker="Trust centre"
      title="All policies"
      subtitle="Everything that governs how MarketWar OS operates — legal, privacy, anti-spam, rights and responsible-AI — in one place."
    >
      <Prose>
        <div className="grid gap-3 sm:grid-cols-2">
          {POLICIES.map((p) => (
            <Link key={p.name} href={p.href} className="card block p-5 transition hover:border-emerald-500/40">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-white">{p.name}</h3>
                {p.live
                  ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">LIVE</span>
                  : <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">SUMMARY</span>}
              </div>
              <p className="mt-2 text-sm text-slate-400">{p.blurb}</p>
            </Link>
          ))}
        </div>
        <p className="mt-8 text-[13px] text-slate-500">Policies marked SUMMARY are described within the Terms/Privacy documents today and will be published as standalone pages before commercial launch. Need a signed DPA or bespoke terms? <Link href="/contact" className="text-emerald-400 hover:text-emerald-300">Contact us</Link>.</p>
      </Prose>
    </MarketingShell>
  );
}
