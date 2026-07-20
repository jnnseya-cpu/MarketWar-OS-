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

        <H2>Uptime (last 90 days)</H2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["API", "99.98%"], ["Gateway", "99.97%"], ["Dashboard", "99.99%"], ["Webhooks", "100%"]].map(([k, v]) => (
            <div key={k} className="card p-4 text-center"><p className="font-display text-2xl font-bold text-emerald-400">{v}</p><p className="mt-1 text-[12px] text-slate-500">{k}</p></div>
          ))}
        </div>

        <H2>Recent incidents</H2>
        <p className="text-slate-400">No incidents in the last 90 days.</p>
        <p className="text-[13px] text-slate-500">Figures shown are representative until the live status feed is connected. Subscribe to updates via the <a href="/contact" className="text-emerald-400 hover:text-emerald-300">contact page</a>.</p>
      </Prose>
    </MarketingShell>
  );
}
