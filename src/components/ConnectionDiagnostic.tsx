"use client";

// ONE PAGE THAT ANSWERS "WHY IS EVERYTHING BROKEN", WITHOUT ANYBODY GUESSING.
//
// THE COST THIS EXISTS TO STOP. The report from production was:
//
//     ⚠️ Unexpected token '<', "<!DOCTYPE "... is not valid JSON
//
// on every screen. Three theories were formed from that sentence, three fixes
// were shipped, and all three were wrong — not because the reasoning was careless
// but because the sentence contains no evidence. Each round cost a redeploy and
// an hour, and the person paying for it was the owner, who was asked each time to
// copy an error out of a screen that was itself broken.
//
// Meanwhile all 177 API routes were built and probed locally and every one of
// them answered JSON. Both facts are only true at once if something between the
// browser and the app is answering instead of it — and this deployment has two
// candidates, Cloudflare and the Vercel platform, either of which returns HTML
// that `JSON.parse` cannot tell apart from the other's.
//
// So this page runs the measurement FROM THE BROWSER, which is the only place the
// full path exists. It sends the same kind of request the dashboard sends, reads
// the response headers that name each hop, and prints who answered and what to do
// about it. It is one address to open and one button to copy.
//
// IT USES PLAIN `fetch` ON PURPOSE. `authedFetch` adds a token, a language header
// and an automatic human-check retry — all useful, and all of which would change
// what is being measured. This measures the pipe.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Copy, Check } from "lucide-react";
import { whoAnswered, type Origin } from "@/shared/response-origin";

type Probe = {
  label: string;
  /** What a failure here would prove — so a red row is a conclusion, not a worry. */
  proves: string;
  path: string;
  method: "GET" | "POST";
};

// Ordered so the first failure is the most informative one. If the first probe
// fails, every probe after it will fail for the same reason and the cause is the
// transport; if the first passes and a later one does not, the cause is that route.
const PROBES: Probe[] = [
  {
    label: "Health",
    proves: "that this browser can receive data from the platform at all. If this one fails, nothing else on this page means anything — the fault is between you and the app, not in any feature.",
    path: "/api/health/live",
    method: "GET",
  },
  {
    label: "Capabilities",
    proves: "that an ordinary dashboard read works. Every screen calls something like this on load.",
    path: "/api/capabilities",
    method: "GET",
  },
  {
    label: "Engine read",
    proves: "that a feature engine answers a GET.",
    path: "/api/organic-dominance",
    method: "GET",
  },
  {
    label: "Engine write",
    proves: "that a POST gets through. A bot challenge and a firewall rule treat a POST differently from a GET, so a GET that passes and a POST that does not is the signature of one.",
    path: "/api/organic-dominance",
    method: "POST",
  },
  {
    label: "Free audit",
    proves: "that the front door works for a stranger with no account — the one thing on the site that has to work before anybody signs up.",
    path: "/api/audit",
    method: "POST",
  },
];

type Result = {
  probe: Probe;
  status: number | null;
  ms: number;
  /** The response parsed as JSON — the only outcome that means the pipe works. */
  gotData: boolean;
  origin: Origin | null;
  snippet: string;
  transportError: string | null;
};

async function run(probe: Probe): Promise<Result> {
  const started = Date.now();
  try {
    const res = await fetch(probe.path, {
      method: probe.method,
      headers: probe.method === "POST" ? { "content-type": "application/json" } : undefined,
      body: probe.method === "POST" ? "{}" : undefined,
      cache: "no-store",
    });
    const raw = await res.text();
    const ms = Date.now() - started;
    try {
      if (raw) JSON.parse(raw);
      // An empty body with a 2xx is a valid answer; an empty body with an error
      // status is not data either, and is worth showing as such.
      const empty = !raw.trim();
      return {
        probe,
        status: res.status,
        ms,
        gotData: !empty || res.ok,
        origin: empty && !res.ok ? whoAnswered(res.status, res.headers, "") : null,
        snippet: "",
        transportError: null,
      };
    } catch {
      const snippet = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      return { probe, status: res.status, ms, gotData: false, origin: whoAnswered(res.status, res.headers, snippet), snippet, transportError: null };
    }
  } catch (e) {
    // The request did not complete at all — DNS, TLS, a dropped connection, or a
    // browser extension. Distinct from an answer we did not like.
    return {
      probe,
      status: null,
      ms: Date.now() - started,
      gotData: false,
      origin: null,
      snippet: "",
      transportError: e instanceof Error ? e.message : String(e),
    };
  }
}

export default function ConnectionDiagnostic() {
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults([]);
    // Sequential, not parallel: five simultaneous requests can themselves trip a
    // rate limit or a bot heuristic, and a diagnostic that causes the fault it is
    // measuring is worse than none.
    const out: Result[] = [];
    for (const p of PROBES) {
      const r = await run(p);
      out.push(r);
      setResults([...out]);
    }
    setRunning(false);
  }, []);

  useEffect(() => { void runAll(); }, [runAll]);

  const done = !running && results.length === PROBES.length;
  const failures = results.filter((r) => !r.gotData);
  const allGood = done && failures.length === 0;

  const report = [
    `MarketWar OS connection report — ${new Date().toISOString()}`,
    `page: ${typeof location !== "undefined" ? location.origin : "?"}`,
    "",
    ...results.map((r) => {
      const head = `${r.probe.method} ${r.probe.path} → ${r.transportError ? "no response" : r.status} (${r.ms}ms) ${r.gotData ? "DATA" : "NOT DATA"}`;
      if (r.gotData) return head;
      const lines = [head];
      if (r.transportError) lines.push(`  the request never completed: ${r.transportError}`);
      if (r.origin) {
        lines.push(`  answered by: ${r.origin.answeredBy}`);
        lines.push(`  reached the app: ${r.origin.reachedTheApp === null ? "unknown" : r.origin.reachedTheApp ? "yes" : "NO"}`);
        lines.push(`  ${r.origin.explanation}`);
        lines.push(`  fix: ${r.origin.fix}`);
        lines.push(`  evidence: ${r.origin.evidence.join(" · ")}`);
      }
      if (r.snippet) lines.push(`  page said: "${r.snippet}"`);
      return lines.join("\n");
    }),
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* a browser that refuses the clipboard still shows the text below */ }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void runAll()} disabled={running} className="btn-primary">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {running ? "Testing…" : "Run again"}
        </button>
        {done && (
          <button type="button" onClick={() => void copy()} className="btn-ghost">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy the report"}
          </button>
        )}
      </div>

      {done && (
        <div className={`rounded-xl border p-4 ${allGood ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"}`}>
          <p className="font-display text-base font-bold">
            {allGood
              ? "Every request came back as data. The connection is healthy."
              : `${failures.length} of ${results.length} requests did not come back as data.`}
          </p>
          {!allGood && failures[0]?.origin && (
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              <strong className="text-white">{failures[0].origin.explanation}</strong>{" "}
              {failures[0].origin.fix}
            </p>
          )}
          {!allGood && failures[0]?.transportError && (
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              The first failing request never completed at all: {failures[0].transportError}. That is a network,
              DNS or certificate fault between this browser and the site, not something inside the platform.
            </p>
          )}
        </div>
      )}

      <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-ink-800">
        {PROBES.map((p) => {
          const r = results.find((x) => x.probe === p);
          return (
            <div key={`${p.method} ${p.path}`} className="bg-ink-900/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-white">
                    {!r ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" />
                      : r.gotData ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      : <XCircle className="h-4 w-4 shrink-0 text-rose-400" />}
                    {p.label}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">{p.method} {p.path}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">Proves {p.proves}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-500">
                  {!r ? "…" : `${r.transportError ? "—" : r.status} · ${r.ms}ms`}
                </span>
              </div>

              {r && !r.gotData && (
                <div className="mt-3 space-y-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                  {r.transportError && (
                    <p className="text-xs leading-relaxed text-slate-300">
                      The request never completed: <span className="font-mono">{r.transportError}</span>
                    </p>
                  )}
                  {r.origin && (
                    <>
                      <p className="text-xs leading-relaxed text-white">{r.origin.explanation}</p>
                      <p className="text-xs leading-relaxed text-slate-300">{r.origin.fix}</p>
                      <p className="font-mono text-[10px] leading-relaxed text-slate-500">{r.origin.evidence.join(" · ")}</p>
                    </>
                  )}
                  {r.snippet && (
                    <p className="text-[11px] leading-relaxed text-slate-400">The page said: &ldquo;{r.snippet}&rdquo;</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {done && !allGood && (
        <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
          <p className="text-sm font-semibold text-white">The whole report, as text</p>
          <p className="mt-1 text-xs text-slate-500">Send this and nothing else is needed to find the cause.</p>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-ink-800 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-slate-300">{report}</pre>
        </div>
      )}
    </div>
  );
}
