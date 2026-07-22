import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell, H2, Prose } from "@/components/marketing";
import { ENGINE_REGISTRY } from "@/shared/engine-registry";

export const metadata: Metadata = {
  title: "Developers · MarketWar OS",
  description: "Build on MarketWar OS: 37 deterministic AI engines behind one internal API, the ModelGate provider-neutral gateway, ACU billing and webhooks.",
};

export default function DevelopersPage() {
  return (
    <MarketingShell
      kicker="Developers"
      title="Build on the growth OS"
      subtitle="Every capability in MarketWar OS is a deterministic engine behind a clean API. One provider-neutral gateway, one ACU billing model, one normalised response schema — provider identity and cost are never exposed."
    >
      <Prose>
        <H2>Principles</H2>
        <ul className="space-y-2">
          {[
            "No AI provider key in the frontend; no direct browser-to-provider request.",
            "One internal contract (ModelGate) regardless of provider — OpenAI, Anthropic, Google or future models.",
            "Every AI request gets a request id; every billable op an idempotency key.",
            "ACUs are reserved before execution and reconciled after; provider failure never charges the customer.",
            "Models live in a central registry; provider prices are configurable without a code deploy.",
          ].map((r) => (
            <li key={r} className="flex items-start gap-2 text-[14px] text-slate-300"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> {r}</li>
          ))}
        </ul>

        <H2>The gateway contract</H2>
        <pre className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-4 text-[12.5px] leading-relaxed text-slate-300">{`POST /api/modelgate            // classify · route · reserve · reconcile · compare
POST /api/subscription         // quote-acus · plan · upgrade · contribution
POST /api/webhooks/stripe      // subscription -> ACU allocation (idempotent)

// Pricing rule (utility-company economics):
Required ACUs = ceil(providerCostGBP x 4 x 100)   // 4x = 300% markup = 75% margin
// £1 = 100 ACUs. Provider cost is used internally only, never returned.`}</pre>

        <H2>The engine catalogue</H2>
        <p>
          {ENGINE_REGISTRY.length} engines are live behind their own API today — each with a GET that returns a
          doctrine plus a fully-populated demo (zero config, no keys). Explore them in the in-app
          {" "}<Link href="/signup" className="text-emerald-400 hover:text-emerald-300">AI Engines index</Link>.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {ENGINE_REGISTRY.slice(0, 12).map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-900/50 px-3 py-2">
              <span className="text-[13px] font-semibold text-slate-200">{e.name}</span>
              <code className="text-[11px] text-emerald-300">/api/{e.id}</code>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-slate-500">…and {ENGINE_REGISTRY.length - 12} more.</p>

        <H2>Auth & security</H2>
        <p>
          Requests carry a Firebase ID token + App Check token; the Vercel BFF verifies both before forwarding to the
          gateway. Secrets live in managed secret storage — never in the browser, Firestore, or git. Financial
          collections are Admin-SDK-write-only; clients can never modify a balance directly.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400">Open the engine index</Link>
          <Link href="/contact" className="rounded-lg border border-ink-700 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:border-emerald-500">Request API access</Link>
        </div>
        <p className="mt-4 text-[13px] text-slate-500">Full public API keys and rate-limited developer plans roll out with the production gateway release.</p>
      </Prose>
    </MarketingShell>
  );
}
