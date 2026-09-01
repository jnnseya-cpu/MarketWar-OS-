"use client";

// The SHARE2EARN door — two fields and you are in.
//
// Deliberately NOT the application form. /growth asks for your channels and
// your audience because the influencer bands pay 1% and 0.75% and a verified
// follower count is what unlocks them. This asks for a name and an email
// because SHARE2EARN pays 0.5% to anyone, and a review queue in front of that
// is a queue that exists only to turn people away.
//
// The form has no follower field on purpose, and the server it posts to has no
// parameter for one. If this page ever grows one, the rate would still not
// move — which is the point of putting the guarantee in the function signature
// rather than in a validation rule.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Copy, Link as LinkIcon, Loader2, Cpu, Store } from "lucide-react";
import { SIGNUP_DOORS, UPGRADE_PATH, ratePct, SHARE2EARN_RATE } from "@/shared/creator-program";
import { authedFetch } from "@/frontend/api-client";

type PublicProduct = { id: string; brandId: string; name: string; url: string; pricePence: number; commissionPence: number; ratePct: number; reason: string };
type Discovery = { brands: { brandId: string; mode: string; products: PublicProduct[] }[]; claimable: number };
type Joined = { creatorId: string; band: { label: string; creatorRate: number }; alreadyRegistered: boolean; dashboardUrl?: string; message: string; next: string[] };

const money = (p: number) => `£${(p / 100).toFixed(2)}`;

export default function JoinShare2Earn() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);

  // What is claimable right now, across every brand with an open catalogue.
  // Shown before joining, because "what could I actually promote" is the first
  // question and sending somebody through a form to find out is how you lose
  // them.
  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch("/api/share2earn?discover=1");
        if (res.ok) setDiscovery(await res.json());
      } catch { /* the page works without it */ }
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      // The public-form lane. /api/share2earn itself moves money and requires a
      // recently-checked human session; asking for one on the form that creates
      // the account would be circular.
      const res = await fetch("/api/share2earn/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Could not complete that — try again."); return; }
      setJoined(d as Joined);
    } catch { setError("Network error — please try again."); }
    finally { setBusy(false); }
  }

  const s2eDoor = SIGNUP_DOORS.find((d) => d.id === "share2earn")!;
  const growthDoor = SIGNUP_DOORS.find((d) => d.id === "growth")!;

  if (joined) {
    return (
      <div className="not-prose space-y-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-5">
          <p className="flex items-center gap-2 font-display text-lg font-bold text-emerald-200"><CheckCircle2 className="h-5 w-5" /> {joined.alreadyRegistered ? "You already have an account" : "You're in"}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{joined.message}</p>
          {joined.dashboardUrl && (
            <div className="mt-4 rounded-lg border border-white/10 bg-ink-950/50 p-3">
              <p className="text-xs text-slate-400">This link is your dashboard and your only credential. Save it now — we do not show it again on a public page.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="flex-1 break-all rounded bg-ink-900/80 px-2 py-1.5 font-mono text-xs text-emerald-300">{joined.dashboardUrl}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${joined.dashboardUrl}`)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-white/5"><Copy className="h-3.5 w-3.5" /> Copy</button>
                <Link href={joined.dashboardUrl} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-emerald-400">Open <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </div>
          )}
          <ol className="mt-4 space-y-2">
            {joined.next.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-300">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <Feed discovery={discovery} />
      </div>
    );
  }

  return (
    <div className="not-prose space-y-5">
      {/* The two doors, side by side, so nobody picks the slower one by accident. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[s2eDoor, growthDoor].map((d) => (
          <div key={d.id} className={`rounded-xl border p-4 ${d.id === "share2earn" ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-white/10 bg-ink-900/50"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-sm font-bold text-white">{d.label}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${d.reviewed ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>{d.reviewed ? "Reviewed" : "Instant"}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-400"><span className="text-slate-300">You give:</span> {d.requires}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400"><span className="text-slate-300">Then:</span> {d.then}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400"><span className="text-slate-300">Pays:</span> {d.pays}</p>
            {d.id === "growth" && <Link href={d.href} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200">Apply instead <ArrowRight className="h-3.5 w-3.5" /></Link>}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="rounded-xl border border-white/10 bg-ink-900/60 p-5">
        <p className="flex items-center gap-2 font-display text-base font-bold text-white"><Cpu className="h-4 w-4 text-emerald-400" /> Join SHARE2EARN</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          No application. No follower count — we do not ask, and there is nowhere to put one. You earn {ratePct(SHARE2EARN_RATE)} of the eligible net value of every verified sale your link produces.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-300">Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" placeholder="Alex Mbala" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-300">Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className="w-full rounded-lg border border-white/10 bg-ink-950/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50" placeholder="you@example.com" />
          </label>
        </div>
        {error && <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-2.5 text-xs text-rose-200">{error}</p>}
        <button type="submit" disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Start earning
        </button>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{UPGRADE_PATH}</p>
      </form>

      <Feed discovery={discovery} />
    </div>
  );
}

/**
 * What is claimable right now.
 *
 * Counted, never estimated: if no brand has opened a catalogue yet this says
 * so, because a marketing page that invents products to browse is exactly the
 * kind of thing this platform is built not to do.
 */
function Feed({ discovery }: { discovery: Discovery | null }) {
  if (!discovery) return null;
  const products = discovery.brands.flatMap((b) => b.products);
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/40 p-5">
      <p className="flex items-center gap-2 font-display text-sm font-bold text-white"><Store className="h-4 w-4 text-emerald-400" /> Open to claim right now</p>
      {products.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          No brand has opened a self-serve catalogue yet, so there is nothing to browse here. Brands can still publish missions — those carry their own funded reward, and you will see them in your dashboard once you have joined. This counter shows what actually exists; it does not invent a shopfront.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-400">{products.length} product{products.length === 1 ? "" : "s"} across {discovery.brands.length} brand{discovery.brands.length === 1 ? "" : "s"}. Claim one from your dashboard and you get a tracked link to the brand&rsquo;s own page.</p>
          <div className="mt-3 space-y-2">
            {products.slice(0, 12).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-ink-950/40 p-3 text-sm">
                <div>
                  <p className="font-semibold text-white">{p.name}</p>
                  <p className="text-xs text-slate-500">{money(p.pricePence)} · you earn {money(p.commissionPence)} per verified sale</p>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300"><LinkIcon className="h-3 w-3" /> {p.ratePct}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
