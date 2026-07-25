"use client";

// Go-Live Readiness — one board that answers "can this make money yet?".
// Aggregates the health probes (Stripe, Auth, Storage, providers) into a
// green/amber/red checklist with the exact fix for each. Admin-only: this shows
// operational configuration, not customer data.

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCcw, Rocket } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { authedFetch } from "@/frontend/api-client";
import { useIsAdmin } from "@/frontend/use-is-admin";

type Status = "green" | "amber" | "red" | "loading";
type Check = { key: string; title: string; group: "Money path — required to charge" | "Content hosting" | "Premium providers — optional upsells"; status: Status; detail: string; fix?: string };

const badge = (s: Status) =>
  s === "green" ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300"><CheckCircle2 className="h-3 w-3" /> ready</span>
  : s === "amber" ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300"><AlertTriangle className="h-3 w-3" /> action</span>
  : s === "red" ? <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-300"><XCircle className="h-3 w-3" /> off</span>
  : <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300"><Loader2 className="h-3 w-3 animate-spin" /> …</span>;

const fromVerdict = (v: string): Status => (v.startsWith("GREEN") ? "green" : v.startsWith("AMBER") ? "amber" : "red");

export default function GoLivePage() {
  const { isAdmin, ready: adminReady } = useIsAdmin();
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    const out: Check[] = [];
    const get = async (u: string) => { try { const r = await authedFetch(u); return await r.json(); } catch { return null; } };
    const [stripe, storage, auth, live] = await Promise.all([
      get("/api/health/stripe"), get("/api/health/storage"), get("/api/health/auth"), get("/api/health/live"),
    ]);

    // Stripe (money)
    out.push({ key: "stripe", title: "Stripe — take payments", group: "Money path — required to charge",
      status: stripe?.verdict ? fromVerdict(stripe.verdict) : "red",
      detail: stripe?.verdict || "Probe failed.", fix: stripe?.probe?.fix });

    // Auth (accounts)
    const authOk = auth?.probe?.ok === true && auth?.projectMatch?.match !== false;
    out.push({ key: "auth", title: "Sign-up & accounts (Firebase Auth)", group: "Money path — required to charge",
      status: !auth ? "red" : auth?.probe?.ran ? (authOk ? "green" : "red") : "amber",
      detail: !auth ? "Probe failed." : auth?.probe?.ran ? (auth?.probe?.verdict || (authOk ? "Auth reachable + project matches." : (auth?.probe?.googleReason || "Auth check failed."))) : "Demo mode — no accounts enforced. Set the Firebase web + admin keys to let customers sign up.",
      fix: auth?.probe?.fix || (auth?.projectMatch && auth.projectMatch.match === false ? "Client and Admin Firebase projects differ — align FIREBASE_PROJECT_ID with NEXT_PUBLIC_FIREBASE_PROJECT_ID." : undefined) });

    // Storage (hosting creatives/video)
    out.push({ key: "storage", title: "Media hosting (Firebase Storage)", group: "Content hosting",
      status: storage?.verdict ? fromVerdict(storage.verdict) : "red",
      detail: storage?.verdict || "Probe failed.", fix: storage?.probe?.fix });

    // Providers (optional upsells)
    if (Array.isArray(live?.capabilities)) {
      for (const c of live.capabilities as { capability: string; ready: boolean; note?: string }[]) {
        out.push({ key: `cap:${c.capability}`, title: c.capability, group: "Premium providers — optional upsells",
          status: c.ready ? "green" : "amber", detail: c.ready ? "Live." : (c.note || "Activates when its provider key is set."), });
      }
    }
    setChecks(out); setBusy(false);
  }, []);

  useEffect(() => { if (adminReady && isAdmin) run(); }, [adminReady, isAdmin, run]);

  if (adminReady && !isAdmin) {
    return <div><PageHeader kicker="Go-Live Readiness" title="Operator only" /><div className="card border-amber-500/25 bg-amber-500/[0.05] p-5 text-sm text-slate-300">This board shows platform configuration and is limited to administrators.</div></div>;
  }

  const money = checks.filter((c) => c.group === "Money path — required to charge");
  const moneyReady = money.length > 0 && money.every((c) => c.status === "green");
  const groups = ["Money path — required to charge", "Content hosting", "Premium providers — optional upsells"] as const;

  return (
    <div>
      <PageHeader kicker="Go-Live Readiness" title="Can it make money yet?"
        subtitle="Every money-critical switch, live from the running deployment. Green = ready; Action = one config step (with the exact fix); Off = not set. Premium providers are optional upsells — the platform sells without them."
        actions={<button className="btn-ghost" onClick={run} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Re-check</button>} />

      <div className={`mb-6 card p-5 ${moneyReady ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-amber-500/25 bg-amber-500/[0.04]"}`}>
        <div className="flex items-center gap-3">
          <Rocket className={`h-6 w-6 ${moneyReady ? "text-emerald-400" : "text-amber-400"}`} />
          <div>
            <p className="font-display text-lg font-bold text-white">{busy ? "Checking…" : moneyReady ? "Ready to take money" : "Almost — finish the money-path steps below"}</p>
            <p className="text-xs text-slate-400">{money.filter((c) => c.status === "green").length}/{money.length || "…"} money-critical checks green. Premium providers are optional.</p>
          </div>
        </div>
      </div>

      {groups.map((g) => {
        const rows = checks.filter((c) => c.group === g);
        if (!rows.length) return null;
        return (
          <div key={g} className="mb-6">
            <h2 className="mb-2 font-display text-sm font-bold text-white">{g}</h2>
            <div className="space-y-2">
              {rows.map((c) => (
                <div key={c.key} className="card flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="font-semibold text-white">{c.title}</span> {badge(c.status)}</div>
                    <p className="mt-1 text-xs text-slate-400">{c.detail}</p>
                    {c.fix && c.status !== "green" && <p className="mt-1 text-[11px] text-amber-300/90"><span className="font-semibold">Fix:</span> {c.fix}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="card p-4 text-[11px] text-slate-500">
        <Pill tone="neutral">note</Pill> This reads live from <code>/api/health/*</code> on this deployment. Set the keys in Vercel → Project → Settings → Environment Variables, then redeploy and press Re-check. The platform runs and sells in demo mode without the optional providers; the money path (Stripe + Auth) is what unlocks real revenue.
      </div>
    </div>
  );
}
