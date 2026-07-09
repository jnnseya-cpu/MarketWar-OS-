import type { ReactNode } from "react";
import type { CampaignVerdict } from "@/lib/types";

export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && (
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
            {kicker}
          </p>
        )}
        <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-rose-400"
        : tone === "warn"
          ? "text-amber-400"
          : "text-white";
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${toneClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function VerdictBadge({ verdict }: { verdict: CampaignVerdict }) {
  const styles: Record<CampaignVerdict, string> = {
    SCALE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
    FIX: "bg-amber-500/15 text-amber-400 border-amber-500/40",
    STOP: "bg-rose-500/15 text-rose-400 border-rose-500/40",
    TESTING: "bg-sky-500/15 text-sky-400 border-sky-500/40",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold tracking-wide ${styles[verdict]}`}
    >
      {verdict}
    </span>
  );
}

export function ScoreBar({
  label,
  score,
  invert = false,
}: {
  label: string;
  score: number;
  // invert=true means high score is BAD (risk scores)
  invert?: boolean;
}) {
  const good = invert ? score < 40 : score >= 60;
  const bad = invert ? score >= 65 : score < 40;
  const color = bad ? "bg-rose-500" : good ? "bg-emerald-500" : "bg-amber-500";
  const text = bad ? "text-rose-400" : good ? "text-emerald-400" : "text-amber-400";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className={`font-display font-bold ${text}`}>{score}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink-700">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "good" | "bad" | "warn" | "info" | "neutral" }) {
  const styles = {
    good: "bg-emerald-500/15 text-emerald-300",
    bad: "bg-rose-500/15 text-rose-300",
    warn: "bg-amber-500/15 text-amber-300",
    info: "bg-sky-500/15 text-sky-300",
    neutral: "bg-ink-700 text-slate-300",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[tone]}`}>
      {children}
    </span>
  );
}

// Minimal markdown renderer for agent output: headers, bold, lists, tables.
export function AgentMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-300">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length === 0) return null;

        if (lines[0].startsWith("|")) {
          const rows = lines
            .filter((l) => !/^\|[\s:-]+\|/.test(l.replace(/\|/g, "|")))
            .filter((l) => !/^\|[-\s|:]+\|?$/.test(l))
            .map((l) =>
              l
                .replace(/^\||\|$/g, "")
                .split("|")
                .map((c) => c.trim())
            );
          const [head, ...body] = rows;
          return (
            <div key={bi} className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-600 text-xs uppercase tracking-wider text-slate-500">
                    {head.map((h, i) => (
                      <th key={i} className="py-2 pr-4 font-semibold">
                        <Inline text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri} className="border-b border-ink-800">
                      {row.map((c, ci) => (
                        <td key={ci} className="py-2 pr-4">
                          <Inline text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <div key={bi} className="space-y-1.5">
            {lines.map((line, li) => {
              if (line.startsWith("## ")) {
                return (
                  <h3 key={li} className="pt-2 font-display text-base font-bold text-emerald-400">
                    {line.slice(3)}
                  </h3>
                );
              }
              if (line.startsWith("# ")) {
                return (
                  <h2 key={li} className="pt-2 font-display text-lg font-bold text-white">
                    {line.slice(2)}
                  </h2>
                );
              }
              if (/^[-*] /.test(line)) {
                return (
                  <p key={li} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>
                      <Inline text={line.slice(2)} />
                    </span>
                  </p>
                );
              }
              const numbered = line.match(/^(\d+)\.\s+(.*)$/);
              if (numbered) {
                return (
                  <p key={li} className="flex gap-2">
                    <span className="font-display font-bold text-emerald-400">{numbered[1]}.</span>
                    <span>
                      <Inline text={numbered[2]} />
                    </span>
                  </p>
                );
              }
              return (
                <p key={li}>
                  <Inline text={line} />
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
