import type { Metadata } from "next";
import { MarketingShell, H2, Prose } from "@/components/marketing";

export const metadata: Metadata = {
  title: "Platform status · MarketWar OS",
  description: "Live operational status of MarketWar OS components and AI providers.",
};

const COMPONENTS: { name: string; status: "operational" | "degraded" | "maintenance"; note: string }[] = [
  { name: "Web app & dashboard (Vercel)", status: "operational", note: "All regions" },
  { name: "AI Engines API", status: "operational", note: "37 engines · demo + live" },
  { name: "ModelGate AI gateway", status: "operational", note: "Routing + reservations healthy" },
  { name: "OpenAI provider", status: "operational", note: "Circuit closed" },
  { name: "Anthropic Claude provider", status: "operational", note: "Circuit closed" },
  { name: "Google Gemini provider", status: "operational", note: "Circuit closed" },
  { name: "Firebase (Auth / Firestore / Storage)", status: "operational", note: "EU region" },
  { name: "Stripe billing & webhooks", status: "operational", note: "Signature verification active" },
];

const DOT = { operational: "bg-emerald-400", degraded: "bg-amber-400", maintenance: "bg-sky-400" } as const;
const LABEL = { operational: "Operational", degraded: "Degraded", maintenance: "Maintenance" } as const;

export default function StatusPage() {
  const allOk = COMPONENTS.every((c) => c.status === "operational");
  return (
    <MarketingShell
      kicker="Status"
      title="Platform status"
      subtitle="Live operational status of every MarketWar OS component and connected AI provider."
    >
      <Prose>
        <div className={`flex items-center gap-3 rounded-xl border p-4 ${allOk ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
          <span className={`h-3 w-3 rounded-full ${allOk ? "bg-emerald-400" : "bg-amber-400"}`} />
          <p className="font-display text-base font-bold text-white">{allOk ? "All systems operational" : "Some systems degraded"}</p>
        </div>

        <H2>Components</H2>
        <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-ink-800">
          {COMPONENTS.map((c) => (
            <div key={c.name} className="flex items-center justify-between gap-3 bg-ink-900/40 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">{c.name}</p>
                <p className="text-[12px] text-slate-500">{c.note}</p>
              </div>
              <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-300">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT[c.status]}`} /> {LABEL[c.status]}
              </span>
            </div>
          ))}
        </div>

        <H2>Uptime history</H2>
        <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
          <p className="text-sm text-slate-300">Uptime tracking begins at public launch.</p>
          <p className="mt-1 text-[13px] text-slate-500">We&rsquo;re invitation-only and new — so we don&rsquo;t publish uptime percentages we haven&rsquo;t measured yet. Once the live status feed (external monitor) is connected, verified 90-day figures appear here. The component list above shows each service&rsquo;s configured baseline, not a live health probe.</p>
        </div>

        <H2>Recent incidents</H2>
        <p className="text-slate-400">None recorded since this page went live.</p>
        <p className="text-[13px] text-slate-500">Subscribe to status updates via the <a href="/contact" className="text-emerald-400 hover:text-emerald-300">contact page</a>.</p>
      </Prose>
    </MarketingShell>
  );
}
