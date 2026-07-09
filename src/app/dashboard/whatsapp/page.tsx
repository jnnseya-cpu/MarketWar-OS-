import { MessageCircle } from "lucide-react";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { demoConversations } from "@/lib/data/demo";
import type { WhatsAppConversation } from "@/lib/types";

const STAGE_META: Record<WhatsAppConversation["stage"], { label: string; tone: "good" | "bad" | "warn" | "info" | "neutral" }> = {
  new: { label: "New", tone: "info" },
  qualifying: { label: "Qualifying", tone: "info" },
  "offer-sent": { label: "Offer sent", tone: "warn" },
  booking: { label: "Booking", tone: "good" },
  won: { label: "Won", tone: "good" },
  ghosted: { label: "Ghosted", tone: "bad" },
};

export default function WhatsAppCenterPage() {
  const pipelineValue = demoConversations
    .filter((c) => c.stage !== "won" && c.stage !== "ghosted")
    .reduce((sum, c) => sum + c.value, 0);
  const ghosted = demoConversations.filter((c) => c.stage === "ghosted");

  return (
    <div>
      <PageHeader
        kicker="WhatsApp Sales Center"
        title="Live conversation pipeline"
        subtitle="Ad → WhatsApp → AI qualification → offer → order → follow-up. For local businesses, WhatsApp converts better than any website."
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open pipeline" value={`£${pipelineValue}`} sub="in active threads" tone="good" />
        <StatCard label="Threads today" value={`${demoConversations.length}`} />
        <StatCard label="Avg. response time" value="7 min" sub="target: under 10" tone="good" />
        <StatCard label="Ghosted (recoverable)" value={`${ghosted.length}`} sub="follow-up armed" tone="warn" />
      </div>

      <div className="card divide-y divide-ink-800">
        {demoConversations.map((c) => {
          const stage = STAGE_META[c.stage];
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-4 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-white">{c.customer}</p>
                  <Pill tone={stage.tone}>{stage.label}</Pill>
                  <span className="text-xs text-slate-500">via {c.campaign}</span>
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-400">{c.lastMessage}</p>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Intent</p>
                  <p className={`font-display font-bold ${c.intentScore >= 75 ? "text-emerald-400" : c.intentScore >= 50 ? "text-amber-400" : "text-rose-400"}`}>
                    {c.intentScore}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Value</p>
                  <p className="font-display font-bold text-white">£{c.value}</p>
                </div>
                <div className="w-12">
                  <p className="text-xs text-slate-500">{c.lastMessageAgo}</p>
                  {c.unread > 0 && (
                    <span className="mt-1 inline-block rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-ink-950">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 card border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200">
        <span className="font-bold">AI WhatsApp Agent:</span> Tom Reeves (ghosted, £25) gets his final
        follow-up at 6pm — &ldquo;Kitchen caps at 40 platters. Want me to hold yours?&rdquo; If no reply
        in 24h he moves to the nurture list automatically.
      </div>
    </div>
  );
}
