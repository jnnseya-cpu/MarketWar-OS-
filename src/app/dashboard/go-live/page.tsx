"use client";

// Go-Live Readiness — one board that answers "can this make money yet?".
// Aggregates the health probes (Stripe, Auth, Storage, providers) into a
// green/amber/red checklist with the exact fix for each. Admin-only: this shows
// operational configuration, not customer data.

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCcw, Rocket, Link2, Gift } from "lucide-react";
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
  const [googleMsg, setGoogleMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  // Grant-ACUs (pilot funding) state.
  const [grantEmail, setGrantEmail] = useState("");
  const [grantAmount, setGrantAmount] = useState("50000");
  const [grantPlan, setGrantPlan] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantMsg, setGrantMsg] = useState<{ text: string; error: boolean } | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    const out: Check[] = [];
    const get = async (u: string) => { try { const r = await authedFetch(u); return await r.json(); } catch { return null; } };
    const [stripe, storage, auth, live, serper, apollo, google] = await Promise.all([
      get("/api/health/stripe"), get("/api/health/storage"), get("/api/health/auth"), get("/api/health/live"), get("/api/health/serper"), get("/api/health/apollo"), get("/api/health/google"),
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

    // Serper — real Google/Places data for leads + prospects
    out.push({ key: "serper", title: "Real prospect data (Serper / Google)", group: "Premium providers — optional upsells",
      status: serper?.verdict ? fromVerdict(serper.verdict) : "amber",
      detail: serper?.verdict || "Not set — lead/prospect engines show sample data.", fix: serper?.probe?.fix });

    // Apollo — verified business emails for Find emails + prospecting
    out.push({ key: "apollo", title: "Verified business emails (Apollo)", group: "Premium providers — optional upsells",
      status: apollo?.verdict ? fromVerdict(apollo.verdict) : "amber",
      detail: apollo?.verdict || "Not set — email-finding uses the free scraper only.", fix: apollo?.probe?.fix });

    // Google — real rankings (Search Console) + local listings (Business Profile)
    out.push({ key: "google", title: "Real SEO/local data (Google Search Console + Business Profile)", group: "Premium providers — optional upsells",
      status: google?.verdict ? fromVerdict(google.verdict) : "amber",
      detail: google?.verdict || "Not set — SEO/local modules show estimates.", fix: google?.fix });

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

  // Surface the Google connect result (?google=connected|error) and clean the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const g = p.get("google");
    if (!g) return;
    if (g === "connected") setGoogleMsg({ text: "Google connected — Search Console + Business Profile are now authorised for this account.", error: false });
    else if (g === "error") setGoogleMsg({ text: `Couldn't connect Google: ${p.get("reason") || "unknown error"}`, error: true });
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  async function grantAcus() {
    setGranting(true); setGrantMsg(null);
    const acus = Math.round(Number(grantAmount) || 0);
    if (!grantEmail.trim()) { setGrantMsg({ text: "Enter the pilot's account email.", error: true }); setGranting(false); return; }
    if (!(acus > 0)) { setGrantMsg({ text: "Enter an ACU amount greater than zero.", error: true }); setGranting(false); return; }
    try {
      const r = await authedFetch("/api/admin/grant-acus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: grantEmail.trim(), acus, planId: grantPlan || undefined }),
      });
      const d = await r.json();
      if (r.ok && d.ok) setGrantMsg({ text: d.note || `Granted ${acus} ACUs.`, error: false });
      else setGrantMsg({ text: d.error || "Couldn't grant ACUs.", error: true });
    } catch { setGrantMsg({ text: "Couldn't reach the grant endpoint.", error: true }); }
    finally { setGranting(false); }
  }

  async function connectGoogle() {
    setConnectingGoogle(true); setGoogleMsg(null);
    try {
      const r = await authedFetch("/api/google/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json();
      if (r.ok && d.url) { window.location.href = d.url; return; }
      setGoogleMsg({ text: d.error || "Couldn't start the Google connect flow.", error: true });
    } catch { setGoogleMsg({ text: "Couldn't start the Google connect flow.", error: true }); }
    finally { setConnectingGoogle(false); }
  }

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

      {/* One-click Google connect — no OAuth Playground, no client-mismatch. */}
      <div className="mb-6 card border-sky-500/25 p-5">
        <div className="mb-1 flex items-center gap-2"><Link2 className="h-4 w-4 text-sky-400" /><h2 className="font-display text-sm font-bold text-white">Connect Google (Search Console + Business Profile)</h2></div>
        <p className="mb-3 text-xs text-slate-400">One click authorises this account for real rankings + local listing data. The OS mints and stores the token itself — no OAuth Playground, and it can never mismatch your client.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary !bg-[#1877F2] hover:!bg-[#1568d8]" onClick={connectGoogle} disabled={connectingGoogle}>
            {connectingGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Connect Google
          </button>
          <span className="text-[11px] text-slate-500">Needs GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET set (you have these).</span>
        </div>
        <p className="mt-2 rounded-md bg-ink-900/60 px-3 py-2 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">One-time:</span> in your Google Cloud OAuth client, add this exact Authorized redirect URI, then click Connect:
          <code className="mt-1 block break-all text-sky-300">https://www.marketwaros.com/api/google/callback</code>
        </p>
        {googleMsg && (
          <p className={`mt-3 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${googleMsg.error ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>
            {googleMsg.error ? <XCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />} {googleMsg.text}
          </p>
        )}
      </div>

      {/* Fund a pilot's ACU wallet — comp AI usage without a payment. */}
      <div className="mb-6 card border-emerald-500/25 p-5">
        <div className="mb-1 flex items-center gap-2"><Gift className="h-4 w-4 text-emerald-400" /><h2 className="font-display text-sm font-bold text-white">Grant ACUs to a pilot</h2></div>
        <p className="mb-3 text-xs text-slate-400">Fund a design-partner or trial customer&apos;s wallet so they can use every AI engine freely — they stay a normal metered tenant, just never stall at the paywall. They must have signed up first.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">Pilot account email
            <input type="email" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="founder@theircompany.com" className="w-64 rounded-md border border-white/10 bg-ink-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-600" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">ACUs
            <input type="number" min={1} value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} className="w-28 rounded-md border border-white/10 bg-ink-900/70 px-3 py-2 text-sm text-white" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">Plan (optional)
            <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)} className="w-32 rounded-md border border-white/10 bg-ink-900/70 px-3 py-2 text-sm text-white">
              <option value="">— keep —</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="scale">Scale</option>
              <option value="business">Business</option>
            </select>
          </label>
          <button className="btn-primary" onClick={grantAcus} disabled={granting}>
            {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />} Grant
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">£1 = 100 ACUs. 50,000 ACUs ≈ a full, generous pilot. Credited instantly to their wallet.</p>
        {grantMsg && (
          <p className={`mt-3 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${grantMsg.error ? "bg-rose-500/10 text-rose-300" : "bg-emerald-500/10 text-emerald-300"}`}>
            {grantMsg.error ? <XCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />} {grantMsg.text}
          </p>
        )}
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
