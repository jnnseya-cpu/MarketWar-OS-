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
  AlertTriangle, Ban, Building2, CheckCircle2, Copy, Download, Globe, Loader2,
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
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-sm leading-relaxed text-amber-100">
              Nothing came back, and nothing was invented to fill the gap. {report.note}
            </p>
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
