"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Shield } from "lucide-react";
import type { AuditReport } from "@/lib/types";

interface Intake {
  business: string;
  industry: string;
  location: string;
  product: string;
  price: string;
  offer: string;
  targetCustomer: string;
  pastSpend: string;
  pastResult: string;
  hasWebsite: boolean;
  hasWhatsApp: boolean;
  hasFollowUp: boolean;
  hasReviews: boolean;
  hasTracking: boolean;
}

const EMPTY: Intake = {
  business: "",
  industry: "",
  location: "",
  product: "",
  price: "",
  offer: "",
  targetCustomer: "",
  pastSpend: "",
  pastResult: "",
  hasWebsite: false,
  hasWhatsApp: false,
  hasFollowUp: false,
  hasReviews: false,
  hasTracking: false,
};

const STEPS = ["The business", "The market", "Past spend", "Your assets"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [intake, setIntake] = useState<Intake>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<Intake>) => setIntake((i) => ({ ...i, ...patch }));

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...intake, pastSpend: Number(intake.pastSpend) || 0 }),
      });
      if (!res.ok) throw new Error(`Audit failed (${res.status})`);
      const report = (await res.json()) as AuditReport;
      sessionStorage.setItem("mwos.audit", JSON.stringify(report));
      sessionStorage.setItem("mwos.intake", JSON.stringify(intake));
      router.push("/dashboard/audit?from=onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <div className="mx-auto max-w-xl px-5 py-14">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> MarketWar OS
        </Link>

        <div className="mb-2 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-ink-950">
            <Shield className="h-5 w-5" />
          </span>
          <h1 className="font-display text-2xl font-bold text-white">Build your Business Brain</h1>
        </div>
        <p className="mb-8 text-slate-400">
          Ten answers. The OS diagnoses why marketing failed and issues your first battle plan.
        </p>

        {/* Stepper */}
        <div className="mb-8 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-emerald-500" : "bg-ink-700"}`} />
              <p className={`mt-1.5 text-[11px] font-semibold ${i === step ? "text-emerald-400" : "text-slate-600"}`}>
                {s}
              </p>
            </div>
          ))}
        </div>

        <div className="card space-y-5 p-6">
          {step === 0 && (
            <>
              <Field label="Business name" value={intake.business} onChange={(v) => set({ business: v })} placeholder="Brixton Grill House" />
              <Field label="Industry" value={intake.industry} onChange={(v) => set({ industry: v })} placeholder="Restaurant & food delivery" />
              <Field label="Location / service area" value={intake.location} onChange={(v) => set({ location: v })} placeholder="Brixton, London (SW9)" />
              <Field label="Product or service" value={intake.product} onChange={(v) => set({ product: v })} placeholder="Flame-grilled meals, family platters, office catering" textarea />
            </>
          )}
          {step === 1 && (
            <>
              <Field label="Who exactly should buy?" value={intake.targetCustomer} onChange={(v) => set({ targetCustomer: v })} placeholder="Local families and young professionals within 3 miles" textarea />
              <Field label="Current price point" value={intake.price} onChange={(v) => set({ price: v })} placeholder="£9.50 average order" />
              <Field label="Current offer (if any)" value={intake.offer} onChange={(v) => set({ offer: v })} placeholder="Free delivery over £20" />
            </>
          )}
          {step === 2 && (
            <>
              <Field label="Total spent on marketing so far (£)" value={intake.pastSpend} onChange={(v) => set({ pastSpend: v.replace(/[^\d.]/g, "") })} placeholder="2400" />
              <Field label="What did that spend produce?" value={intake.pastResult} onChange={(v) => set({ pastResult: v })} placeholder="3 orders from boosted posts, mostly likes" textarea />
            </>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">Tick everything you already have:</p>
              <Toggle label="A working website or order page" checked={intake.hasWebsite} onChange={(v) => set({ hasWebsite: v })} />
              <Toggle label="WhatsApp Business (or willing to set it up)" checked={intake.hasWhatsApp} onChange={(v) => set({ hasWhatsApp: v })} />
              <Toggle label="A follow-up system for leads (messages/emails)" checked={intake.hasFollowUp} onChange={(v) => set({ hasFollowUp: v })} />
              <Toggle label="10+ visible customer reviews" checked={intake.hasReviews} onChange={(v) => set({ hasReviews: v })} />
              <Toggle label="Ad tracking (pixel / conversions) installed" checked={intake.hasTracking} onChange={(v) => set({ hasTracking: v })} />
            </div>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <button
              className="btn-ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || loading}
            >
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button className="btn-primary" onClick={() => setStep((s) => s + 1)}>
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button className="btn-primary" onClick={submit} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Diagnosing…" : "Run my failure audit"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {textarea ? (
        <textarea className="input min-h-[80px]" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
        checked
          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
          : "border-ink-600 bg-ink-850 text-slate-300 hover:border-slate-500"
      }`}
    >
      {label}
      <span
        className={`flex h-5 w-5 items-center justify-center rounded border text-xs font-bold ${
          checked ? "border-emerald-400 bg-emerald-500 text-ink-950" : "border-ink-600"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
    </button>
  );
}
