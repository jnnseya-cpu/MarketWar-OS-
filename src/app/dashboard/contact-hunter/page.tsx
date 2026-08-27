"use client";

// CONTACT HUNTER — the tool.
//
// WHAT THIS PAGE USED TO BE, AND WHY THAT WAS WRONG. It rendered the engine's
// doctrine beside a hardcoded Amanda Brown at exampleconstruction.co.uk. Every
// rule on it was real and every value was fake, and there was no box to type a
// company into. That is a library list, not a product: the owner could read what
// the engine WOULD do and could not make it do anything.
//
// Now the first thing on the page is the input, the second is the results, and
// the doctrine is at the bottom where it belongs — as the explanation of what
// just happened rather than a substitute for it.
//
// WHAT IT SHOWS FOR EVERY ROW, INCLUDING THE FAILURES. A contact tool that only
// renders successes teaches its user nothing: "3 of 8 found" is unactionable
// unless the other five say WHERE they stopped. No site of their own, a site
// with no published address, an address that belonged to their web designer,
// a company that has objected — four different problems, four different fixes,
// and they look identical in a count. So every row renders, and the ones that
// found nothing carry the reason in the same place the others carry the email.

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Pill } from "@/components/ui";
import {
  AlertTriangle, Ban, Building2, CheckCircle2, Copy, Download, Globe, KeyRound, Loader2,
  Mail, Phone, Search, ShieldCheck, User,
} from "lucide-react";
import { authedFetch } from "@/frontend/api-client";
import { useActiveBrand } from "@/frontend/brand-context";
import { exportCsv } from "@/frontend/export";
import {
  READINESS_WEIGHTS, PROHIBITED_CATEGORIES,
  type ContactPoint, type Readiness, type EmploymentFinding, type SourceEvidence,
} from "@/shared/contact-hunter";

type HuntResult = {
  company: string;
  website: string | null;
  email: ContactPoint | null;
  phone: ContactPoint | null;
  person: { name: string | null; title: string | null; employment: EmploymentFinding } | null;
  readiness: Readiness | null;
  stage: string;
  note: string;
  evidence: SourceEvidence[];
};

type HuntReport = {
  mode: "live" | "demo";
  query: string;
  results: HuntResult[];
  stages: Record<string, number>;
  sharedEmailsDropped: number;
  note: string;
  metered?: boolean;
  balanceAcu?: number;
};

// ── The single-person lookup, which is a different question. ────────────────
//
// `hunt` sweeps a trade across towns. This answers "here is a name and a
// company — get me the route to that person", which is the question an owner
// with a target account actually asks, and it is the one the provider waterfall
// was built for. It shares this page rather than getting its own, because a
// second Contact page would be a second place to look for the same thing.

type Confidence = {
  kind: string; score: number; classification: string;
  applied: { key: string; points: number; label: string }[];
  unknown: string[]; why: string;
};

type LookupPerson = {
  fullName: string; jobTitle?: string; company?: string; sourceUrl?: string;
  fromRegistryOnly?: boolean; agreedBy?: string[]; roleNote?: string;
  displayTitle: string | null;
  operationalRole: { ok: boolean; why: string };
  reading: { department: string | null; seniority: string; registryOnly: boolean; why: string };
};

type LookupEmail = {
  value: string; provenance: string; sourceUrl?: string; pattern?: string;
  suppressed: boolean; suppressionReason: string | null;
};

type LookupStep = {
  provider: string; capability: string; ran: boolean;
  ms: number; found: number; costAcu: number; outcome: string;
};

type Lookup = {
  result: {
    company: { legalName: string; domain?: string; status?: string; sourceUrl?: string } | null;
    people: LookupPerson[];
    emails: LookupEmail[];
    verification: { deliverable: boolean | null; catchAll: boolean; invalid: boolean; why: string } | null;
    confidence: { identity?: Confidence; employment?: Confidence; email?: Confidence };
    steps: LookupStep[];
    costAcu: number;
    deadlineHit: boolean;
    progress: string[];
    suppressedCount: number;
    note: string;
  };
  providers: { id: string; configured: boolean; note: string }[];
  notConfigured: { id: string; needs: string; wouldProvide: string }[];
  stopThresholds: { identity: number; employment: number; email: number };
  balanceAcu?: number;
  note: string;
};

const CONFIDENCE_TONE: Record<string, string> = {
  verified: "text-emerald-300",
  high_confidence: "text-sky-300",
  review: "text-amber-300",
  do_not_export: "text-rose-300",
  blocked: "text-rose-300",
};

/**
 * One of the three scores, with what it is short of and why.
 *
 * A single number is the average of an answer. Identity, employment and the
 * address fail for completely different reasons and are fixed by completely
 * different actions, so they are never added together — and each one shows what
 * it could not check separately from what it checked and did not find.
 */
function ConfidenceBar({ label, c, target }: { label: string; c?: Confidence; target: number }) {
  if (!c) {
    return (
      <div className="rounded-lg border border-white/10 bg-ink-950/60 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-1 text-xs text-slate-500">Not scored — nothing was found to score it on.</p>
      </div>
    );
  }
  const clear = c.score >= target;
  return (
    <div className="rounded-lg border border-white/10 bg-ink-950/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`font-display text-lg font-bold ${CONFIDENCE_TONE[c.classification] ?? "text-slate-300"}`}>
          {c.score}<span className="text-xs font-normal text-slate-500">/{target}</span>
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full ${clear ? "bg-emerald-500" : c.score > 0 ? "bg-amber-500" : "bg-white/10"}`}
          style={{ width: `${Math.max(2, Math.min(100, c.score))}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{c.why}</p>
      {c.unknown.length > 0 && (
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Could not be checked: {c.unknown.join(", ")}. Not scored as failures.
        </p>
      )}
    </div>
  );
}

const STAGE_LABEL: Record<string, string> = {
  found: "Contact found",
  search_unavailable: "Search unavailable",
  no_own_site: "No site of their own",
  site_no_email: "Site found, no address published",
  email_rejected: "Address belonged to somebody else",
  suppressed: "Objected — never contacted",
  no_decision_maker: "No named decision-maker published",
};

const stageTone = (s: string) =>
  s === "found" ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300"
  : s === "suppressed" || s === "email_rejected" ? "border-rose-500/30 bg-rose-500/[0.06] text-rose-300"
  : "border-amber-500/30 bg-amber-500/[0.06] text-amber-300";

function Provenance({ p }: { p: ContactPoint["provenance"] }) {
  const m = {
    confirmed: ["CONFIRMED", "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"],
    inferred: ["INFERRED — published nowhere", "border-amber-500/40 bg-amber-500/10 text-amber-300"],
    provider: ["FROM A PROVIDER", "border-sky-500/40 bg-sky-500/10 text-sky-300"],
  }[p];
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m[1]}`}>{m[0]}</span>;
}

function Row({ r }: { r: HuntResult }) {
  const [open, setOpen] = useState(false);
  const found = r.stage === "found";
  return (
    <div className={`rounded-xl border p-4 ${found ? "border-white/10 bg-ink-900/50" : "border-white/[0.06] bg-ink-950/40"}`}>
      <div className="flex flex-wrap items-start gap-2">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{r.company}</p>
          {r.website && (
            <a href={r.website} target="_blank" rel="noreferrer noopener"
               className="inline-flex items-center gap-1 truncate text-[11px] text-slate-400 hover:text-emerald-300">
              <Globe className="h-3 w-3" /> {r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
        <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${stageTone(r.stage)}`}>
          {STAGE_LABEL[r.stage] ?? r.stage}
        </span>
        {r.readiness && (
          <span className="rounded border border-white/10 px-2 py-0.5 text-[11px] font-bold text-white">
            {r.readiness.score} · {r.readiness.activation.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {r.person?.name && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-200">
          <User className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-semibold">{r.person.name}</span>
          {r.person.title && <span className="text-slate-400">— {r.person.title}</span>}
          <span className="text-[11px] text-slate-500">role confidence {r.person.employment.confidence}</span>
        </p>
      )}

      {r.email && (
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-emerald-400" />
          <a href={`mailto:${r.email.value}`} className="text-sm font-semibold text-emerald-200 hover:underline">{r.email.value}</a>
          <Provenance p={r.email.provenance} />
          <span className="text-[11px] text-slate-400">{r.email.emailStatus?.replace(/_/g, " ").toLowerCase()}</span>
          <button
            onClick={() => void navigator.clipboard?.writeText(r.email!.value)}
            className="rounded border border-white/10 p-1 text-slate-400 hover:bg-white/5" title="Copy">
            <Copy className="h-3 w-3" />
          </button>
        </p>
      )}

      {r.phone && (
        <p className="mt-1.5 flex flex-wrap items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-slate-400" />
          <a href={`tel:${r.phone.e164 ?? r.phone.value}`} className="text-sm text-slate-200 hover:underline">{r.phone.e164 ?? r.phone.value}</a>
          <span className="text-[11px] text-slate-400">{r.phone.phoneStatus?.replace(/_/g, " ").toLowerCase()}</span>
        </p>
      )}

      {/* THE FAILURE, IN THE SAME PLACE THE EMAIL WOULD BE. */}
      {!found && <p className="mt-2 text-xs leading-relaxed text-amber-100/90">{r.note}</p>}
      {found && r.note && <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{r.note}</p>}

      {(r.readiness || r.evidence.length > 0) && (
        <>
          <button onClick={() => setOpen(!open)} className="mt-2 text-[11px] font-semibold text-slate-400 hover:text-white">
            {open ? "Hide" : "Show"} how we know ({r.evidence.length} {r.evidence.length === 1 ? "source" : "sources"})
          </button>
          {open && (
            <div className="mt-2 space-y-2 rounded-lg border border-white/[0.07] bg-ink-950/60 p-3">
              {r.evidence.map((e, i) => (
                <a key={`${e.sourceUrl}-${i}`} href={e.sourceUrl} target="_blank" rel="noreferrer noopener"
                   className="block truncate text-[11px] text-sky-300 hover:underline">{e.sourceUrl}</a>
              ))}
              {r.readiness && (
                <>
                  <div className="flex flex-wrap gap-1">
                    {READINESS_WEIGHTS.map((w) => (
                      <span key={w.key} className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {w.label} {r.readiness!.factors[w.key]}
                      </span>
                    ))}
                  </div>
                  {r.readiness.reasons.map((x) => <p key={x} className="text-[11px] leading-relaxed text-slate-400">✓ {x}</p>)}
                  {r.readiness.restrictions.map((x) => <p key={x} className="text-[11px] leading-relaxed text-amber-200/80">— {x}</p>)}
                  {r.readiness.blocks.map((x) => (
                    <p key={x} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-rose-200">
                      <Ban className="mt-0.5 h-3 w-3 shrink-0" /> {x}
                    </p>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ContactHunterPage() {
  const { activeBrand } = useActiveBrand();
  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("");
  const [titles, setTitles] = useState("");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<HuntReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doctrine, setDoctrine] = useState<{ doctrine: string; reuses: Record<string, string> } | null>(null);
  // The search-key diagnostic, run from here rather than from a URL the owner
  // has to know exists. A tool that fails and then asks you to go and find out
  // why somewhere else has not finished failing.
  const [diag, setDiag] = useState<{ verdict: string; keyShape?: { length: number; looksLike: string; hadIssues: string[]; notes: string[]; shapeHint: string | null } } | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  // The single-person lookup.
  const [lkName, setLkName] = useState("");
  const [lkCompany, setLkCompany] = useState("");
  const [lkWebsite, setLkWebsite] = useState("");
  const [lkTitle, setLkTitle] = useState("");
  const [lkBudget, setLkBudget] = useState(0);
  const [lkBusy, setLkBusy] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lkError, setLkError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await authedFetch("/api/contact-hunter");
        const d = await res.json().catch(() => ({}));
        if (res.ok) setDoctrine({ doctrine: d.doctrine, reuses: d.reuses ?? {} });
      } catch { /* the tool works without the doctrine block */ }
    })();
  }, []);

  const run = useCallback(async () => {
    if (!what.trim()) { setError("Say what to look for — a trade, an industry, or a company name."); return; }
    setBusy(true); setError(null); setReport(null);
    try {
      const res = await authedFetch("/api/contact-hunter", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "hunt",
          brandId: activeBrand?.id || "demo",
          what: what.trim(),
          where: where.trim() || undefined,
          titles: titles.split(",").map((t) => t.trim()).filter(Boolean),
          count,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 402) { setError(`${d.error} Balance: ${d.balanceAcu ?? 0} ACUs.`); return; }
      if (!res.ok) { setError(d.error || "The hunt could not run."); return; }
      setReport(d as HuntReport);
    } catch { setError("Network error — nothing was charged."); } finally { setBusy(false); }
  }, [what, where, titles, count, activeBrand?.id]);

  const runLookup = useCallback(async () => {
    if (!lkName.trim() && !lkCompany.trim()) {
      setLkError("Give at least a person's name or a company."); return;
    }
    setLkBusy(true); setLkError(null); setLookup(null);
    try {
      const res = await authedFetch("/api/contact-hunter", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lookup",
          brandId: activeBrand?.id || "demo",
          fullName: lkName.trim() || undefined,
          company: lkCompany.trim() || undefined,
          website: lkWebsite.trim() || undefined,
          title: lkTitle.trim() || undefined,
          maxCostAcu: lkBudget,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 402) { setLkError(`${d.error} Balance: ${d.balanceAcu ?? 0} ACUs.`); return; }
      if (!res.ok) { setLkError(d.error || "The lookup could not run."); return; }
      setLookup(d as Lookup);
    } catch { setLkError("Network error — nothing was charged."); } finally { setLkBusy(false); }
  }, [lkName, lkCompany, lkWebsite, lkTitle, lkBudget, activeBrand?.id]);

  const checkKey = useCallback(async () => {
    setDiagBusy(true); setDiag(null);
    try {
      const res = await authedFetch("/api/health/serper");
      const d = await res.json().catch(() => ({}));
      setDiag(d as typeof diag);
    } catch { setDiag({ verdict: "Could not reach the diagnostic from this browser." }); }
    finally { setDiagBusy(false); }
  }, []);

  const download = useCallback(() => {
    if (!report) return;
    exportCsv(report.results.map((r) => ({
      Company: r.company,
      Website: r.website ?? "",
      Person: r.person?.name ?? "",
      Title: r.person?.title ?? "",
      Email: r.email?.value ?? "",
      "Email provenance": r.email?.provenance ?? "",
      "Email status": r.email?.emailStatus ?? "",
      Phone: r.phone?.e164 ?? r.phone?.value ?? "",
      "Phone status": r.phone?.phoneStatus ?? "",
      Score: r.readiness?.score ?? "",
      Activation: r.readiness?.activation ?? "",
      Outcome: STAGE_LABEL[r.stage] ?? r.stage,
      "Source URL": r.evidence[0]?.sourceUrl ?? "",
      Note: r.note,
    })), { dataset: "contact-hunter", brand: activeBrand });
  }, [report, activeBrand]);

  const found = report?.stages.found ?? 0;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Contact Hunter"
        subtitle="Type what you are looking for. It reads real pages, and every value comes back with the URL it was read from."
      />

      {/* THE INPUT. First thing on the page, because it is the product. */}
      <section className="card p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">What</span>
            <input
              value={what} onChange={(e) => setWhat(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
              placeholder="plumbers · construction companies · Groupe Nseya"
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Where</span>
            <input
              value={where} onChange={(e) => setWhere(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void run(); }}
              placeholder="Leeds · Birmingham · Kinshasa"
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Roles to look for <span className="font-normal normal-case tracking-normal text-slate-500">— optional, comma separated</span>
            </span>
            <input
              value={titles} onChange={(e) => setTitles(e.target.value)}
              placeholder="Managing Director, Procurement Director"
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">How many companies</span>
            <input
              type="number" min={1} max={15} value={count}
              onChange={(e) => setCount(Math.min(15, Math.max(1, Number(e.target.value) || 1)))}
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void run()} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {busy ? "Reading their pages…" : "Find contacts"}
          </button>
          {report && (
            <button onClick={download} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5">
              <Download className="h-4 w-4" /> Download CSV
            </button>
          )}
          <span className="text-[11px] text-slate-500">
            Reads each company&rsquo;s own site, one at a time, respecting robots.txt. Nothing is invented — a
            company with no published address comes back saying so.
          </span>
        </div>
        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-3 text-xs leading-relaxed text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
      </section>

      {/* ONE PERSON, THROUGH THE PROVIDER WATERFALL. */}
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
          <User className="h-4 w-4 text-emerald-400" /> Find one person
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          A name and a company, through every configured supplier in cost order, inside a deadline. Free
          sources run first — their own pages, then the company register — because they cost nothing and
          are the primary source a paid provider sells a copy of. It stops the moment it knows enough.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Person</span>
            <input
              value={lkName} onChange={(e) => setLkName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void runLookup(); }}
              placeholder="Amanda Brown"
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">Company</span>
            <input
              value={lkCompany} onChange={(e) => setLkCompany(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void runLookup(); }}
              placeholder="the registered or trading name"
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Website <span className="font-normal normal-case tracking-normal text-slate-500">— optional</span>
            </span>
            <input
              value={lkWebsite} onChange={(e) => setLkWebsite(e.target.value)}
              placeholder="example.co.uk"
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Role wanted <span className="font-normal normal-case tracking-normal text-slate-500">— optional</span>
            </span>
            <input
              value={lkTitle} onChange={(e) => setLkTitle(e.target.value)}
              placeholder="Procurement Director"
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Paid providers <span className="font-normal normal-case tracking-normal text-slate-500">— ACU limit</span>
            </span>
            <input
              type="number" min={0} max={200} value={lkBudget}
              onChange={(e) => setLkBudget(Math.min(200, Math.max(0, Number(e.target.value) || 0)))}
              className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void runLookup()} disabled={lkBusy}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {lkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
            {lkBusy ? "Working through the suppliers…" : "Look this person up"}
          </button>
          <span className="text-[11px] text-slate-500">
            Zero means free sources only — and that is the default. A paid provider is never called unless
            its price fits the limit you set here, and one that was skipped for cost is named in the result.
          </span>
        </div>

        {lkError && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-3 text-xs leading-relaxed text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {lkError}
          </p>
        )}

        {lookup && (
          <div className="mt-5 space-y-4 border-t border-white/10 pt-5">
            {/* What happened, in the order it happened. */}
            {lookup.result.progress.length > 0 && (
              <ul className="space-y-1">
                {lookup.result.progress.map((p, i) => (
                  <li key={`${p}-${i}`} className="text-xs leading-relaxed text-slate-300">{p}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Pill>{lookup.result.costAcu} ACUs of supplier spend</Pill>
              {lookup.result.deadlineHit && <Pill>Deadline reached</Pill>}
              {lookup.result.suppressedCount > 0 && <Pill>{lookup.result.suppressedCount} suppressed</Pill>}
              {typeof lookup.balanceAcu === "number" && <Pill>{lookup.balanceAcu.toLocaleString("en-GB")} ACUs left</Pill>}
            </div>

            {lookup.result.company && (
              <div className="rounded-lg border border-white/10 bg-ink-950/60 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" /> {lookup.result.company.legalName}
                  {lookup.result.company.status && <span className="text-[11px] font-normal text-slate-400">({lookup.result.company.status})</span>}
                </p>
                {lookup.result.company.sourceUrl && (
                  <a href={lookup.result.company.sourceUrl} target="_blank" rel="noopener noreferrer"
                     className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline">
                    <Globe className="h-3 w-3" /> {lookup.result.company.sourceUrl}
                  </a>
                )}
              </div>
            )}

            {/* THE PEOPLE, AND THE REFUSAL WHERE THERE IS ONE. A person found
                only in the register is shown as an officer with no job title —
                the register records who is legally responsible for filings, not
                who buys anything. */}
            {lookup.result.people.length === 0 ? (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-100">
                No person was found, and none was invented. {lookup.result.note}
              </p>
            ) : (
              <div className="space-y-2">
                {lookup.result.people.map((p, i) => (
                  <div key={`${p.fullName}-${i}`} className="rounded-lg border border-white/10 bg-ink-950/60 p-3">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="text-sm font-semibold text-white">{p.fullName}</p>
                      {p.displayTitle
                        ? <span className="text-xs text-slate-300">{p.displayTitle}</span>
                        : <span className="text-xs text-amber-300">Company officer — operational role not established</span>}
                      {(p.agreedBy?.length ?? 0) > 1 && <Pill>{p.agreedBy?.length ?? 0} sources agree</Pill>}
                      {p.reading.department && <Pill>{p.reading.department}</Pill>}
                    </div>
                    {!p.operationalRole.ok && (
                      <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-amber-200/90">
                        <Ban className="mt-0.5 h-3 w-3 shrink-0" /> {p.operationalRole.why}
                      </p>
                    )}
                    {p.sourceUrl && (
                      <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer"
                         className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline">
                        <Globe className="h-3 w-3" /> read from {p.sourceUrl}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Addresses, with the provenance in the same place every time. */}
            {lookup.result.emails.length > 0 && (
              <div className="space-y-2">
                {lookup.result.emails.map((e) => (
                  <div key={e.value} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-ink-950/60 p-3">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    <span className={`font-mono text-xs ${e.suppressed ? "text-rose-300 line-through" : "text-white"}`}>{e.value}</span>
                    {/* Narrowed rather than cast: this value crossed a network
                        boundary, and asserting its shape is how a value that is
                        not one of these three renders as if it were. */}
                    {(e.provenance === "confirmed" || e.provenance === "inferred" || e.provenance === "provider")
                      ? <Provenance p={e.provenance} />
                      : <span className="text-[11px] text-slate-500">provenance not stated</span>}
                    {e.pattern && <span className="text-[11px] text-slate-500">from the pattern {e.pattern}</span>}
                    {e.suppressed && (
                      <span className="text-[11px] text-rose-300">
                        Suppressed — {e.suppressionReason || "on a suppression list"}. Cannot be used at any score.
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {lookup.result.verification && (
              <p className="text-[11px] leading-relaxed text-slate-400">{lookup.result.verification.why}</p>
            )}

            {/* THREE SCORES, NEVER ONE. */}
            <div className="grid gap-2 sm:grid-cols-3">
              <ConfidenceBar label="Identity" c={lookup.result.confidence.identity} target={lookup.stopThresholds.identity} />
              <ConfidenceBar label="Employment" c={lookup.result.confidence.employment} target={lookup.stopThresholds.employment} />
              <ConfidenceBar label="Email" c={lookup.result.confidence.email} target={lookup.stopThresholds.email} />
            </div>

            <p className="text-xs leading-relaxed text-slate-400">{lookup.note}</p>

            {/* EVERY STEP, INCLUDING THE ONES THAT DID NOT RUN. "We did not call
                the provider that would have found this" is the thing the reader
                most needs to know, and it is the thing these stacks hide. */}
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-white/[0.03] text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Supplier</th>
                    <th className="px-3 py-2 font-semibold">Looking for</th>
                    <th className="px-3 py-2 font-semibold">Time</th>
                    <th className="px-3 py-2 font-semibold">Cost</th>
                    <th className="px-3 py-2 font-semibold">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {lookup.result.steps.map((s, i) => (
                    <tr key={`${s.provider}-${s.capability}-${i}`} className="border-t border-white/5">
                      <td className="px-3 py-2 font-mono text-slate-300">{s.provider}</td>
                      <td className="px-3 py-2 text-slate-400">{s.capability}</td>
                      <td className="px-3 py-2 text-slate-500">{s.ran ? `${s.ms} ms` : "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{s.costAcu > 0 ? `${s.costAcu} ACU` : "free"}</td>
                      <td className={`px-3 py-2 leading-relaxed ${s.ran ? "text-slate-300" : "text-amber-200/90"}`}>{s.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* The suppliers that exist, and the ones that do not — stated, so
                nobody has to guess why a lookup came back short. */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-ink-950/60 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Configured</p>
                <ul className="mt-2 space-y-1.5">
                  {lookup.providers.map((p) => (
                    <li key={p.id} className="text-[11px] leading-relaxed text-slate-400">
                      <span className={p.configured ? "text-emerald-300" : "text-amber-300"}>{p.id}</span> — {p.note}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-white/10 bg-ink-950/60 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Not connected</p>
                <ul className="mt-2 space-y-1.5">
                  {lookup.notConfigured.map((p) => (
                    <li key={p.id} className="text-[11px] leading-relaxed text-slate-500">
                      <span className="font-mono text-slate-400">{p.id}</span> needs{" "}
                      <span className="font-mono text-slate-400">{p.needs}</span> — {p.wouldProvide}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* THE RESULTS, including the ones that found nothing. */}
      {report && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-bold text-white">
              {found} of {report.results.length} with a contact route
            </h2>
            {report.mode === "demo" && <Pill>Live search unavailable</Pill>}
            {report.sharedEmailsDropped > 0 && <Pill>{report.sharedEmailsDropped} shared inbox dropped</Pill>}
            {typeof report.balanceAcu === "number" && <Pill>{report.balanceAcu.toLocaleString("en-GB")} ACUs left</Pill>}
          </div>
          <p className="text-xs leading-relaxed text-slate-400">{report.note}</p>

          {report.results.length === 0 && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
              <p className="text-sm leading-relaxed text-amber-100">
                Nothing came back, and nothing was invented to fill the gap. {report.note}
              </p>
              {report.mode === "demo" && (
                <>
                  <button
                    onClick={() => void checkKey()} disabled={diagBusy}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-500/40 px-4 py-2 text-xs font-bold text-amber-100 hover:bg-amber-500/10 disabled:opacity-60"
                  >
                    {diagBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                    Check the search key
                  </button>
                  {diag && (
                    <div className="mt-3 space-y-2 rounded-lg border border-white/10 bg-ink-950/60 p-3">
                      <p className="text-xs font-semibold leading-relaxed text-white">{diag.verdict}</p>
                      {diag.keyShape && diag.keyShape.length > 0 && (
                        <p className="text-[11px] leading-relaxed text-slate-400">
                          The value is {diag.keyShape.length} characters, {diag.keyShape.looksLike}.{" "}
                          {diag.keyShape.hadIssues.length === 0 ? "Its shape is fine." : `Problems with the value itself: ${diag.keyShape.hadIssues.join(", ")}.`}
                        </p>
                      )}
                      {diag.keyShape?.notes.map((n) => (
                        <p key={n} className="text-[11px] leading-relaxed text-amber-200/90">{n}</p>
                      ))}
                      {diag.keyShape?.shapeHint && (
                        <p className="text-[11px] leading-relaxed text-amber-200/90">{diag.keyShape.shapeHint}</p>
                      )}
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        This never returns the key itself — only its length and first and last two characters, which is
                        enough to recognise which one you pasted.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {report.results.map((r, i) => <Row key={`${r.company}-${i}`} r={r} />)}
        </section>
      )}

      {/* The doctrine, at the bottom, as the explanation of what just happened. */}
      {doctrine && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> The rules this ran under
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{doctrine.doctrine}</p>
          <ul className="mt-3 space-y-1.5">
            {Object.entries(doctrine.reuses).map(([k, v]) => (
              <li key={k} className="text-[11px] leading-relaxed text-slate-500">
                <span className="font-mono text-slate-400">{k}</span> — {v}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-400" />
            Refused at the door on every request, before anything is read or stored:{" "}
            {PROHIBITED_CATEGORIES.slice(0, 8).join(", ")} and {PROHIBITED_CATEGORIES.length - 8} more.
          </p>
        </section>
      )}
    </div>
  );
}
