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
import { CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw, Copy, Check } from "lucide-react";
import { whoAnswered, type Origin } from "@/shared/response-origin";

type Probe = {
  label: string;
  /** What a failure here would prove — so a red row is a conclusion, not a worry. */
  proves: string;
  path: string;
  method: "GET" | "POST";
  /**
   * The non-2xx statuses that mean this probe WORKED.
   *
   * A DIAGNOSTIC THAT CRIES WOLF GETS IGNORED, AND THEN IT IS WORSE THAN NONE.
   * With the outage fixed, this page still announced "3 answered properly with an
   * error" and pointed at /api/organic-dominance as though it were the diagnosis.
   * It was not. This page sends its probes with a plain `fetch` carrying no human
   * session and an empty body ON PURPOSE — so a 403 from the gate and a 400 from
   * validation are the two controls DOING THEIR JOB, and reporting them as
   * findings teaches the reader to distrust the whole page.
   *
   * A 500 is never in this list. A route that breaks still goes red.
   */
  expect: number[];
  /** Why that status is the correct answer to THIS probe. Shown when it happens. */
  expectNote: string;
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
    expect: [],
    expectNote: "",
  },
  {
    label: "Capabilities",
    proves: "that an ordinary dashboard read works. Every screen calls something like this on load.",
    path: "/api/capabilities",
    method: "GET",
    expect: [],
    expectNote: "",
  },
  {
    label: "Engine read",
    proves: "that a feature engine answers a GET.",
    path: "/api/organic-dominance",
    method: "GET",
    expect: [403],
    expectNote: "403 is the RIGHT answer here. This page deliberately sends no signed-in session, and the human gate refused it — that refusal is the gate working, and it proves the route ran.",
  },
  {
    label: "Engine write",
    proves: "that a POST gets through. A bot challenge and a firewall rule treat a POST differently from a GET, so a GET that passes and a POST that does not is the signature of one.",
    path: "/api/organic-dominance",
    method: "POST",
    expect: [400, 403],
    expectNote: "403 (no session) or 400 (this probe sends an empty body) are both correct. Either proves the POST reached the route and was judged, rather than being stopped by something in front of it.",
  },
  {
    label: "Free audit",
    proves: "that the front door works for a stranger with no account — the one thing on the site that has to work before anybody signs up.",
    path: "/api/audit",
    method: "POST",
    expect: [400],
    expectNote: "400 is correct: this probe sends no website address, and the audit asks for one. It answered in its own words, which is the front door working.",
  },
];

// THREE OUTCOMES, NOT TWO — AND CONFLATING TWO OF THEM THREW AWAY THE ANSWER.
//
// The first version of this page asked one question: did the body parse as JSON?
// If it did, the row was green and nothing more was shown.
//
// That cost a full round trip. `/api/capabilities` answered **HTTP 500 with a
// perfectly good JSON body naming the module that failed to load** — the exact
// fact this whole page exists to obtain — and the row read "DATA" and printed
// none of it, because parsing had succeeded. "The transport worked" and "the
// request worked" are different questions and only one of them was being asked.
//
// It is this codebase's second recurring defect in its purest form: a check that
// passes for a reason unrelated to what it tests. So the outcomes are now named
// separately and the error body is always shown.
type Outcome =
  /** JSON, and a success status. Nothing to look at. */
  | "ok"
  /** JSON, and exactly the error status this probe is SUPPOSED to get. Also fine. */
  | "expected"
  /** JSON, and an error status nobody predicted — the platform said what was wrong. */
  | "refused"
  /** Not data at all. Something answered with a page. */
  | "not_data";

type Result = {
  probe: Probe;
  status: number | null;
  ms: number;
  outcome: Outcome;
  origin: Origin | null;
  /** The error body, as text, for a `refused` row. This is the payload that matters. */
  body: string;
  snippet: string;
  transportError: string | null;
};

/** Keep a body readable and bounded; a diagnostic that dumps a megabyte is unread. */
const BODY_LIMIT = 600;

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
    const empty = !raw.trim();
    try {
      if (!empty) JSON.parse(raw);
      // An empty body on a 2xx is a legitimate answer. An empty body on an error
      // status is not data either — and it is exactly what a handler throw
      // produces, so it is worth naming rather than passing.
      if (empty && !res.ok) {
        return { probe, status: res.status, ms, outcome: "not_data", origin: whoAnswered(res.status, res.headers, ""), body: "", snippet: "", transportError: null };
      }
      return {
        probe,
        status: res.status,
        ms,
        outcome: res.ok ? "ok" : probe.expect.includes(res.status) ? "expected" : "refused",
        origin: null,
        body: res.ok ? "" : raw.slice(0, BODY_LIMIT),
        snippet: "",
        transportError: null,
      };
    } catch {
      const snippet = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      return { probe, status: res.status, ms, outcome: "not_data", origin: whoAnswered(res.status, res.headers, snippet), body: "", snippet, transportError: null };
    }
  } catch (e) {
    // The request did not complete at all — DNS, TLS, a dropped connection, or a
    // browser extension. Distinct from an answer we did not like.
    return {
      probe,
      status: null,
      ms: Date.now() - started,
      outcome: "not_data",
      origin: null,
      body: "",
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
  /** Something answered with a page. The transport or the platform is at fault. */
  const broken = results.filter((r) => r.outcome === "not_data");
  /** An error status nobody predicted. The BODY is the diagnosis. */
  const refused = results.filter((r) => r.outcome === "refused");
  /** The error this probe is SUPPOSED to get. A control working, not a finding. */
  const expected = results.filter((r) => r.outcome === "expected");
  const allGood = done && broken.length === 0 && refused.length === 0;

  const LABEL: Record<Outcome, string> = {
    ok: "DATA",
    expected: "DATA, EXPECTED REFUSAL",
    refused: "DATA, UNEXPECTED ERROR",
    not_data: "NOT DATA",
  };

  const report = [
    `MarketWar OS connection report — ${new Date().toISOString()}`,
    `page: ${typeof location !== "undefined" ? location.origin : "?"}`,
    "",
    ...results.map((r) => {
      const head = `${r.probe.method} ${r.probe.path} → ${r.transportError ? "no response" : r.status} (${r.ms}ms) ${LABEL[r.outcome]}`;
      if (r.outcome === "ok") return head;
      // An expected refusal is a control doing its job. Print one line saying so
      // and move on — burying it in the same detail as a real fault is what made
      // a healthy platform read as three problems.
      if (r.outcome === "expected") return `${head}\n  correct: ${r.probe.expectNote}`;
      const lines = [head];
      if (r.transportError) lines.push(`  the request never completed: ${r.transportError}`);
      if (r.origin) {
        lines.push(`  answered by: ${r.origin.answeredBy}`);
        lines.push(`  reached the app: ${r.origin.reachedTheApp === null ? "unknown" : r.origin.reachedTheApp ? "yes" : "NO"}`);
        lines.push(`  ${r.origin.explanation}`);
        lines.push(`  fix: ${r.origin.fix}`);
        lines.push(`  evidence: ${r.origin.evidence.join(" · ")}`);
      }
      // THE LINE THAT WAS MISSING, AND IT COST A ROUND TRIP. The platform answers
      // its own failures in JSON that names the cause; printing the status and
      // withholding the body is withholding the entire diagnosis.
      if (r.body) lines.push(`  it answered: ${r.body}`);
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
              ? "Everything answered correctly. The platform is healthy."
              : [
                  broken.length ? `${broken.length} of ${results.length} answered with a page instead of data` : "",
                  refused.length ? `${refused.length} returned an error nobody expected` : "",
                ].filter(Boolean).join(", ") + "."}
          </p>
          {allGood && expected.length > 0 && (
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {expected.length} of the {results.length} answered with a refusal, and that is the correct
              result: this page sends no signed-in session and an empty body on purpose, so the human
              gate and the input validation are supposed to say no. Each row below says why.
            </p>
          )}
          {broken[0]?.origin && (
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              <strong className="text-white">{broken[0].origin.explanation}</strong>{" "}
              {broken[0].origin.fix}
            </p>
          )}
          {broken[0]?.transportError && (
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              The first failing request never completed at all: {broken[0].transportError}. That is a network,
              DNS or certificate fault between this browser and the site, not something inside the platform.
            </p>
          )}
          {!broken.length && refused[0] && (
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Nothing is wrong with the connection itself — the platform answered every request properly.
              What it said about {refused[0].probe.path} is below, and that message IS the diagnosis.
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
                      : r.outcome === "ok" || r.outcome === "expected" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      : r.outcome === "refused" ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
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

              {r && r.outcome === "expected" && (
                <div className="mt-3 space-y-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-xs leading-relaxed text-white">{r.probe.expectNote}</p>
                  {r.body && (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded border border-ink-800 bg-black/30 p-2 font-mono text-[11px] leading-relaxed text-slate-400">{r.body}</pre>
                  )}
                </div>
              )}

              {r && r.outcome !== "ok" && r.outcome !== "expected" && (
                <div className={`mt-3 space-y-2 rounded-lg border p-3 ${r.outcome === "refused" ? "border-amber-500/20 bg-amber-500/5" : "border-rose-500/20 bg-rose-500/5"}`}>
                  {r.outcome === "refused" && (
                    <p className="text-xs leading-relaxed text-white">
                      This status was not expected here. The platform answered properly and said why:
                    </p>
                  )}
                  {r.body && (
                    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded border border-ink-800 bg-black/30 p-2 font-mono text-[11px] leading-relaxed text-slate-300">{r.body}</pre>
                  )}
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

      {done && (
        <div className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
          <p className="text-sm font-semibold text-white">The whole report, as text</p>
          <p className="mt-1 text-xs text-slate-500">Send this and nothing else is needed to find the cause.</p>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-ink-800 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-slate-300">{report}</pre>
        </div>
      )}
    </div>
  );
}
