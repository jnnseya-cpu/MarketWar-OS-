"use client";

// Competitor Intelligence Center — the threat board.
// Wired to the EXISTING Competitor War Room engine (/api/competitor-warroom,
// backed by src/backend/competitor-warroom.ts): monitors each named rival across
// search / AI answers / social / sentiment, computes a threat level and share of
// voice, and pulls a sales battlecard (their strengths/weaknesses → our ethical
// counter-moves). Works with zero config on the active brand; live signal feeds
// plug in later. Every score is a directional ESTIMATE, clearly badged — we never
// fabricate competitor data or use knocking copy.

import { useEffect, useState } from "react";
import { Loader2, Swords, Radar, Shield } from "lucide-react";
import AgentRunner from "@/components/AgentRunner";
import { HBarList } from "@/components/charts";
import { PageHeader, Pill, StatCard, ScoreBar } from "@/components/ui";
import { useActiveBrand } from "@/frontend/brand-context";

type Momentum = "gaining" | "flat" | "losing";
type SignalBoard = {
  competitor: string;
  searchVisibility: number;
  aiVisibility: number;
  socialAttention: number;
  sentiment: number;
  shareOfVoice: number;
  contentOutput: number;
  momentum: Momentum;
  threatLevel: number;
  estimate: true;
  note: string;
};
type Battlecard = {
  competitor: string;
  theirStrengths: string[];
  theirWeaknesses: string[];
  ourCounters: string[];
  landmines: string[];
  estimate: true;
  note: string;
};
type Rival = { name: string; signals: SignalBoard; battlecard: Battlecard; sovShare: number };
type Report = {
  business: string;
  us: SignalBoard;
  ourSovShare: number;
  rivals: Rival[];
  landmines: string[];
};

const DEFAULT_RIVALS = "Flame Republic, Peri Palace, The Grill Room SW2";

const threatTone = (n: number): "good" | "warn" | "bad" => (n >= 70 ? "bad" : n >= 45 ? "warn" : "good");
const momentumTone = (m: Momentum): "good" | "warn" | "bad" => (m === "gaining" ? "bad" : m === "losing" ? "good" : "warn");

async function post(action: string, input: Record<string, unknown>) {
  const res = await fetch("/api/competitor-warroom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
  return res.json();
}

export default function CompetitorsPage() {
  const { activeBrand } = useActiveBrand();
  const [business, setBusiness] = useState("");
  const [competitors, setCompetitors] = useState(DEFAULT_RIVALS);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed from the active brand; clear the board on brand switch (blank if none).
  useEffect(() => {
    setBusiness(activeBrand?.name ?? "");
    setReport(null);
  }, [activeBrand?.id]);

  async function run() {
    const names = competitors.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
    if (!names.length) return;
    const you = business.trim() || "Your business";
    setBusy(true);
    try {
      const [us, rivalsRaw] = await Promise.all([
        post("monitor", { competitor: you }) as Promise<SignalBoard>,
        Promise.all(
          names.map(async (name) => {
            const [signals, battlecard] = await Promise.all([
              post("monitor", { competitor: name }) as Promise<SignalBoard>,
              post("battlecard", { competitor: name }) as Promise<Battlecard>,
            ]);
            return { name, signals, battlecard };
          }),
        ),
      ]);
      // Share of voice = each entity's shareOfVoice normalized across us + all rivals.
      const total = us.shareOfVoice + rivalsRaw.reduce((a, r) => a + r.signals.shareOfVoice, 0) || 1;
      const rivals: Rival[] = rivalsRaw
        .map((r) => ({ ...r, sovShare: Math.round((r.signals.shareOfVoice / total) * 100) }))
        .sort((a, b) => b.signals.threatLevel - a.signals.threatLevel);
      setReport({
        business: you,
        us,
        ourSovShare: Math.round((us.shareOfVoice / total) * 100),
        rivals,
        landmines: rivals[0]?.battlecard.landmines ?? [],
      });
    } finally {
      setBusy(false);
    }
  }

  const topThreat = report?.rivals[0];

  return (
    <div>
      <PageHeader
        kicker="Competitor Intelligence Center"
        title="The threat board"
        subtitle="Every named rival — monitored across search, AI answers, social and sentiment, scored for threat and share of voice, then turned into a sales battlecard of ethical counter-moves. Scores are directional estimates; live signal feeds plug in at go-live. We win on our genuine strengths, never on knocking copy."
        actions={<Pill tone="info">threat · share of voice · battlecard</Pill>}
      />

      <div className="mb-6 card border-emerald-500/30 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Your business</label><input className="input" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Your business name" /></div>
          <div><label className="label">Known competitors (comma or line separated)</label><textarea className="input min-h-[64px]" value={competitors} onChange={(e) => setCompetitors(e.target.value)} /></div>
        </div>
        <button className="btn-primary mt-4" onClick={run} disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Scanning the battlefield…</> : <><Radar className="h-4 w-4" /> Analyse the battlefield</>}
        </button>
      </div>

      {!report && (
        <div className="mb-8 card border-dashed border-white/10 p-10 text-center">
          <Swords className="mx-auto mb-3 h-8 w-8 text-emerald-400/70" />
          <p className="font-display font-bold text-white">No competitors scanned yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">Add your business and the rivals you want watched, then run the scan to compute threat levels, share of voice and counter-move battlecards.</p>
        </div>
      )}

      {report && (
        <div className="mb-8 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Rivals tracked" value={`${report.rivals.length}`} />
            <StatCard label="Your share of voice" value={`${report.ourSovShare}%`} sub="estimate, across tracked set" tone={report.ourSovShare >= 40 ? "good" : report.ourSovShare >= 25 ? "warn" : "bad"} />
            <StatCard label="Top threat" value={topThreat ? `${topThreat.signals.threatLevel}` : "—"} sub={topThreat?.name} tone={topThreat ? threatTone(topThreat.signals.threatLevel) : "neutral"} />
            <StatCard label="Your momentum" value={report.us.momentum} sub={`social attention ${report.us.socialAttention}`} tone={report.us.momentum === "gaining" ? "good" : report.us.momentum === "losing" ? "bad" : "warn"} />
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-display font-bold text-white">Share of voice (estimate)</h2>
            <HBarList
              data={[
                { label: `${report.business} (you)`, value: report.ourSovShare, note: "%" },
                ...report.rivals.map((r) => ({ label: r.name, value: r.sovShare, note: "%" })),
              ]}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {report.rivals.map((r) => (
              <div key={r.name} className="card p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-white">{r.name}</h3>
                  <div className="flex items-center gap-2">
                    <Pill tone={momentumTone(r.signals.momentum)}>{r.signals.momentum}</Pill>
                    <Pill tone={threatTone(r.signals.threatLevel)}>threat {r.signals.threatLevel}</Pill>
                  </div>
                </div>

                <div className="mt-4 grid gap-2.5">
                  <ScoreBar label="Search visibility" score={r.signals.searchVisibility} />
                  <ScoreBar label="AI answer visibility" score={r.signals.aiVisibility} />
                  <ScoreBar label="Social attention" score={r.signals.socialAttention} />
                  <ScoreBar label="Sentiment" score={r.signals.sentiment} />
                </div>

                {r.battlecard.theirStrengths.length > 0 && (
                  <div className="mt-4">
                    <p className="label">Their positioning strengths</p>
                    <ul className="space-y-1 text-sm text-slate-300">
                      {r.battlecard.theirStrengths.map((s) => <li key={s}>· {s}</li>)}
                    </ul>
                  </div>
                )}

                <div className="mt-3">
                  <p className="label">Exploitable weaknesses (est.)</p>
                  <ul className="space-y-1 text-sm text-slate-400">
                    {r.battlecard.theirWeaknesses.map((w) => <li key={w}>· {w}</li>)}
                  </ul>
                </div>

                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-emerald-300">
                    <Shield className="h-3.5 w-3.5" />
                    <span className="text-xs font-bold uppercase tracking-wider">Recommended counter-moves</span>
                  </div>
                  <ul className="space-y-1 text-sm text-emerald-100/90">
                    {r.battlecard.ourCounters.map((c) => <li key={c}>· {c}</li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          {report.landmines.length > 0 && (
            <div className="card border-amber-500/20 p-5">
              <h2 className="mb-2 font-display font-bold text-white">Rules of engagement</h2>
              <ul className="space-y-1 text-sm text-amber-200/80">
                {report.landmines.map((l) => <li key={l}>· {l}</li>)}
              </ul>
            </div>
          )}

          <p className="text-xs text-slate-500">{report.us.note}</p>
        </div>
      )}

      <h2 className="mb-4 font-display text-lg font-bold text-white">Run the Competitor Spy Agent</h2>
      <AgentRunner
        agentId="competitor-spy"
        buttonLabel="Analyse the battlefield"
        fields={[
          { key: "business", label: "Your business", defaultValue: "Brixton Grill House" },
          { key: "location", label: "Market", defaultValue: "Brixton, London" },
          { key: "competitors", label: "Known competitors", defaultValue: DEFAULT_RIVALS, textarea: true },
        ]}
      />
    </div>
  );
}
