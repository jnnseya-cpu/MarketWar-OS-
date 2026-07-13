"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Stethoscope } from "lucide-react";
import { PageHeader, Pill, ScoreBar } from "@/components/ui";
import type { AuditReport } from "@/shared/types";

const DEMO_INPUT = {
  business: "Brixton Grill House",
  industry: "Restaurant & Food Delivery",
  location: "Brixton, London",
  product: "Flame-grilled meals, family platters, office catering",
  price: "£9.50 average order",
  offer: "Free delivery over £20",
  targetCustomer: "Local families and young professionals within 3 miles of SW9",
  pastSpend: 2400,
  pastResult: "3 orders from boosted posts",
  hasWebsite: true,
  hasWhatsApp: true,
  hasFollowUp: false,
  hasReviews: false,
  hasTracking: false,
};

export default function AuditPage() {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"onboarding" | "demo" | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("mwos.audit");
    if (stored) {
      try {
        setReport(JSON.parse(stored) as AuditReport);
        setSource("onboarding");
        return;
      } catch {
        sessionStorage.removeItem("mwos.audit");
      }
    }
  }, []);

  async function runDemo() {
    setLoading(true);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(DEMO_INPUT),
      });
      setReport((await res.json()) as AuditReport);
      setSource("demo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        kicker="Module 2"
        title="Marketing Failure Audit"
        subtitle="Before a penny is spent, the OS diagnoses why marketing is not converting — with scores, not opinions."
        actions={
          source && (
            <Pill tone={source === "onboarding" ? "good" : "info"}>
              {source === "onboarding" ? "Your business" : "Demo business"}
            </Pill>
          )
        }
      />

      {!report ? (
        <div className="card flex flex-col items-center p-12 text-center">
          <Stethoscope className="mb-4 h-10 w-10 text-emerald-500/70" />
          <h2 className="font-display text-xl font-bold text-white">No audit on file</h2>
          <p className="mt-2 max-w-md text-sm text-slate-400">
            Run the onboarding intake to audit your own business, or generate the demo report for
            Brixton Grill House to see what the diagnosis looks like.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/onboarding" className="btn-primary">
              Audit my business <ArrowRight className="h-4 w-4" />
            </Link>
            <button className="btn-ghost" onClick={runDemo} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Diagnosing…" : "Show demo report"}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Scores */}
          <div className="card space-y-4 p-6">
            <h2 className="font-display font-bold text-white">Risk & readiness scores</h2>
            <ScoreBar label="Conversion risk" score={report.scores.conversionRisk} invert />
            <ScoreBar label="Offer weakness" score={report.scores.offerWeakness} invert />
            <ScoreBar label="Audience mismatch" score={report.scores.audienceMismatch} invert />
            <ScoreBar label="Revenue leakage" score={report.scores.revenueLeakage} invert />
            <div className="border-t border-ink-700 pt-4" />
            <ScoreBar label="Trust score" score={report.scores.trust} />
            <ScoreBar label="Landing / ordering experience" score={report.scores.landingPage} />
            <ScoreBar label="Ad creative score" score={report.scores.adCreative} />
            <ScoreBar label="Follow-up readiness" score={report.scores.followUpReadiness} />
            <ScoreBar label="Campaign readiness" score={report.scores.campaignReadiness} />
          </div>

          {/* Why you got 0 customers */}
          <div className="space-y-6">
            <div className="card p-6">
              <h2 className="font-display font-bold text-rose-400">Why you got 0 customers</h2>
              <ol className="mt-3 space-y-2.5">
                {report.topReasons.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-slate-300">
                    <span className="font-display font-bold text-rose-400">{i + 1}.</span>
                    {r}
                  </li>
                ))}
              </ol>
            </div>

            <div className="card p-6">
              <h2 className="font-display font-bold text-white">Funnel leak map</h2>
              <div className="mt-3 space-y-3">
                {report.funnelLeaks.map((l) => (
                  <div key={l.stage}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-semibold text-slate-200">{l.stage}</span>
                      <span className={l.severity >= 65 ? "text-rose-400" : l.severity >= 40 ? "text-amber-400" : "text-emerald-400"}>
                        {l.severity >= 65 ? "Severe leak" : l.severity >= 40 ? "Leaking" : "Minor"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">{l.leak}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Orders */}
          <div className="card p-6 lg:col-span-2">
            <h2 className="font-display font-bold text-emerald-400">Marching orders</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <Order label="Fastest fix (do today)" text={report.fastestFix} />
              <Order label="Biggest revenue recovery" text={report.biggestRecovery} />
              <Order label="Best channel to start" text={report.bestChannel} />
              <Order label="Recommended offer" text={report.recommendedOffer} />
              <Order label="Recommended first campaign" text={report.firstCampaign} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-rose-400">Do NOT spend on yet</p>
                <ul className="mt-1.5 space-y-1 text-sm text-slate-300">
                  {report.doNotSpendOn.map((d) => (
                    <li key={d} className="flex gap-2">
                      <span className="text-rose-400">✕</span> {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 border-t border-ink-700 pt-5">
              <Link href="/dashboard/offers" className="btn-primary">
                Rebuild my offer <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/dashboard/campaigns" className="btn-ghost">
                Build the first campaign
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Order({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">{label}</p>
      <p className="mt-1.5 text-sm text-slate-300">{text}</p>
    </div>
  );
}
