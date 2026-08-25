"use client";

// Partner self-serve dashboard — where a registered creator/affiliate tracks
// their OWN activity + earnings. Token-gated: the ?t=<token> in the link (issued
// when they applied) is the only credential — no platform login. Reads the live
// engine via the token-gated partner_portal action.

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Wallet, Users, LinkIcon, Copy, ShieldCheck, TrendingUp, Coins, Store, Plus } from "lucide-react";
import { MIN_WITHDRAWAL_GBP } from "@/shared/creator-program";


type WalletData = {
  payoutEligible: boolean; followers: number; followersVerified: boolean;
  cumulativeNetGbp: number; countedEvents: number; flaggedEvents: number;
  lifetimeCreatorGbp: number; paidGbp: number; payableGbp: number; pendingGbp: number;
  programme: "main" | "acu_referral"; acusEarned: number; referralCount: number; gateNote: string;
  band: { id: string; label: string; creatorRate: number; requires: string };
  perCustomer: { ref: string; netGbp: number; creatorGbp: number; platformGbp: number; state: string; progressPct: number }[];
};
type Sub = { code: string; link: string; programme: string; brand: string; destinationUrl: string };
type PublicProduct = { id: string; brandId: string; name: string; url: string; pricePence: number; commissionPence: number; ratePct: number; reason: string };
type PublicProgramme = { id: string; brandId: string; brandName: string; name: string; scope: string; target: string; description: string; ratePct: string };
type Portal = { partner: { name: string; tier: string; followers: number; followersVerified: boolean; payoutEligible: boolean; scoutScore?: number }; wallet: WalletData; subscriptions: Sub[] };

const money = (n: number) => `£${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;


/**
 * CLAIM SOMETHING TO PROMOTE.
 *
 * The other half of the answer to "what can I promote": brands that opened a
 * catalogue are listed here, and claiming issues a tracked link on the spot —
 * no approval, no message to the brand, no wait. Brands on missions-only never
 * appear, by their own choice; their missions carry their own reward.
 *
 * The token is the credential. The server derives the earner from it and never
 * from anything this page sends, because a claim mints the code money gets
 * attributed to.
 */
function ClaimShelf({ token, onClaimed }: { token: string; onClaimed: () => void }) {
  const [products, setProducts] = useState<PublicProduct[] | null>(null);
  // PROGRAMMES A BRAND CREATED BY HAND, which had no way to reach a creator at
  // all. Reported from the live dashboard: a brand had four programmes and only
  // three were reachable, because the other three were minted by claiming a
  // product and this shelf lists products. The fourth was typed into the create
  // form, had no product behind it, and was therefore invisible to everybody.
  const [programmes, setProgrammes] = useState<PublicProgramme[]>([]);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/share2earn?discover=1");
        if (!res.ok) return;
        const d = await res.json();
        setProducts((d.brands || []).flatMap((b: { products?: PublicProduct[] }) => b.products || []));
        setProgrammes((d.brands || []).flatMap((b: { programmes?: PublicProgramme[] }) => b.programmes || []));
      } catch { /* the dashboard works without it */ }
    })();
  }, []);

  async function claim(id: string, kind: "product" | "programme" = "product") {
    setBusy(id); setError(null); setNote(null);
    try {
      const res = await fetch("/api/share2earn", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "programme"
          ? { action: "claim", token, programmeId: id }
          : { action: "claim", token, productId: id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Could not claim that."); return; }
      setNote(d.note || (d.subscription ? `Joined ${d.programme?.name || "that programme"} — your tracked link is below.` : null));
      onClaimed();
    } catch { setError("Network error — please try again."); }
    finally { setBusy(""); }
  }

  if (!products) return null;
  const nothing = products.length === 0 && programmes.length === 0;

  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display font-bold text-white"><Store className="h-4 w-4 text-emerald-400" /> Claim something to promote</h2>
      {nothing ? (
        <p className="text-sm text-slate-400">No brand has opened a self-serve catalogue yet. When one does, its products appear here and you can take a tracked link without asking anyone.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-400">Pick anything. Claiming issues you a tracked link to the brand&rsquo;s own page — no approval needed, and the rate is the same on everything listed.</p>
          <div className="space-y-2">
            {products.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-ink-950/40 p-3 text-sm">
                <div>
                  <p className="font-semibold text-white">{p.name}</p>
                  <p className="text-xs text-slate-500">{money(p.pricePence / 100)} · you earn {money(p.commissionPence / 100)} per verified sale ({p.ratePct}%)</p>
                </div>
                <button onClick={() => void claim(p.id)} disabled={busy === p.id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
                  {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Claim
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {programmes.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Programmes you can join</p>
          <p className="mb-2 text-xs text-slate-400">A brand set these up itself rather than listing a single product. Joining issues a tracked link the same way.</p>
          <div className="space-y-2">
            {programmes.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-ink-950/40 p-3 text-sm">
                <div>
                  <p className="font-semibold text-white">{g.name}</p>
                  <p className="text-xs text-slate-500">{g.brandName} · {g.scope === "brand" ? "the whole brand" : g.target} · you earn {g.ratePct} of eligible net value per verified sale</p>
                </div>
                <button onClick={() => void claim(g.id, "programme")} disabled={busy === g.id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-ink-950 hover:bg-emerald-400 disabled:opacity-60">
                  {busy === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Join
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {note && <p className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-xs leading-relaxed text-emerald-200">{note}</p>}
      {error && <p className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-3 text-xs text-rose-200">{error}</p>}
    </div>
  );
}

function PartnerDashboard() {
  const params = useSearchParams();
  const token = params.get("t") || "";
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The middleware already tells us HOW to get past a refusal — `action` and
  // `where` are in the body. This page rendered `error` and dropped both, so a
  // check that needed re-passing became a screen with nothing on it.
  const [gate, setGate] = useState<{ action: string; where: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!token) { setError("This dashboard needs your personal link. Check the email/confirmation from when you applied."); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch("/api/creator-engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "partner_portal", token }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(d.error || "Couldn't load your dashboard.");
          if (typeof d.where === "string" && d.where) setGate({ action: String(d.action || "verify"), where: d.where });
          return;
        }
        setData(d as Portal);
      } catch { setError("Network error — please try again."); }
      finally { setLoading(false); }
    })();
  }, [token, reloadKey]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-ink-950"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>;
  if (error || !data) return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 bg-ink-950 px-6 text-center">
      <ShieldCheck className="h-8 w-8 text-emerald-500/60" />
      <h1 className="font-display text-lg font-bold text-white">Partner dashboard</h1>
      <p className="text-sm text-slate-400">{error}</p>
      {/* A refusal must always leave somewhere to go. This screen said "pass a
          check" and offered no way to pass it — the message, a shield, and a
          dead end on a phone at two in the morning. */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {gate && (
          <a
            href={`${gate.where}?next=${encodeURIComponent(typeof window === "undefined" ? "/partner" : window.location.pathname + window.location.search)}&action=${encodeURIComponent(gate.action)}`}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-ink-950 hover:bg-emerald-400"
          >
            {gate.action === "reverify" ? "Pass the check again" : "Pass the check"}
          </a>
        )}
        <button
          type="button"
          onClick={() => { setError(null); setGate(null); setLoading(true); setReloadKey((k) => k + 1); }}
          className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500"
        >
          Try again
        </button>
      </div>
      {!token && (
        <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
          Your dashboard link was emailed to you when you joined. If it never arrived, contact support — for your security this page cannot show an existing account&rsquo;s link to whoever opens it.
        </p>
      )}
    </div>
  );

  const { partner, wallet, subscriptions } = data;
  const isMain = wallet.programme === "main";

  return (
    <div className="min-h-screen bg-ink-950 px-5 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Partner dashboard</p>
          <h1 className="font-display text-2xl font-bold text-white">Welcome, {partner.name}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {partner.tier} · {partner.followers.toLocaleString()} followers {partner.followersVerified ? "(verified)" : "(unverified)"}{partner.scoutScore != null ? ` · Scout ${partner.scoutScore}/100` : ""}
          </p>
        </div>

        {/* Earnings */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4"><div className="flex items-center gap-1.5 text-xs text-slate-400"><Wallet className="h-3.5 w-3.5" /> Payable now</div><p className="mt-1 font-display text-2xl font-bold text-emerald-300">{money(wallet.payableGbp)}</p></div>
          {/* "Pending (to 10K)" was the follower gate showing through, and it
              was the panel that contradicted "no follower count" one screen
              below. Cash is payable from the first verified sale now, so the
              only thing left to tell somebody is how far off a withdrawal is —
              which is a distance, not a permission. */}
          {wallet.payableGbp >= MIN_WITHDRAWAL_GBP ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4"><div className="flex items-center gap-1.5 text-xs text-slate-400"><TrendingUp className="h-3.5 w-3.5" /> Ready to withdraw</div><p className="mt-1 font-display text-2xl font-bold text-emerald-300">Yes</p></div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-ink-900/60 p-4"><div className="flex items-center gap-1.5 text-xs text-slate-400"><TrendingUp className="h-3.5 w-3.5" /> To reach the £{MIN_WITHDRAWAL_GBP} withdrawal</div><p className="mt-1 font-display text-2xl font-bold text-white">{money(Math.max(0, MIN_WITHDRAWAL_GBP - wallet.payableGbp))}</p></div>
          )}
          <div className="rounded-xl border border-white/10 bg-ink-900/60 p-4"><div className="text-xs text-slate-400">Lifetime earned</div><p className="mt-1 font-display text-2xl font-bold text-white">{money(wallet.lifetimeCreatorGbp)}</p></div>
          <div className="rounded-xl border border-white/10 bg-ink-900/60 p-4"><div className="flex items-center gap-1.5 text-xs text-slate-400"><Coins className="h-3.5 w-3.5" /> ACUs earned</div><p className="mt-1 font-display text-2xl font-bold text-white">{wallet.acusEarned.toLocaleString()}</p></div>
        </div>
        <p className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-900/50 p-3 text-xs text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> {wallet.gateNote}</p>
        {wallet.band && (
          <p className="rounded-lg border border-white/10 bg-ink-900/50 p-3 text-xs text-slate-400">
            <span className="font-semibold text-white">{wallet.band.label} — {Math.round(wallet.band.creatorRate * 10000) / 100}%.</span> {wallet.band.requires} The rate follows you, not the link: verify a follower count and the same earnings recompute at the higher band.
          </p>
        )}

        {/* Performance */}
        <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
          <h2 className="mb-3 font-display font-bold text-white">Performance</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div><p className="text-xs text-slate-500">Referred customers</p><p className="font-bold text-white">{wallet.referralCount}</p></div>
            <div><p className="text-xs text-slate-500">Verified conversions</p><p className="font-bold text-white">{wallet.countedEvents}</p></div>
            <div><p className="text-xs text-slate-500">Net revenue driven</p><p className="font-bold text-white">{money(wallet.cumulativeNetGbp)}</p></div>
            <div><p className="text-xs text-slate-500">Already paid out</p><p className="font-bold text-white">{money(wallet.paidGbp)}</p></div>
          </div>
        </div>

        {/* Programme (£20K cap per customer) */}
        {wallet.perCustomer.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
            <h2 className="mb-3 font-display font-bold text-white">Earnings by referred customer</h2>
            <div className="space-y-2">
              {wallet.perCustomer.map((c) => (
                <div key={c.ref} className="rounded-lg border border-white/[0.06] bg-ink-950/40 p-3 text-sm">
                  <div className="flex items-center justify-between"><span className="text-slate-200">{c.ref} <span className="text-slate-500">· you {money(c.creatorGbp)}</span></span><span className="text-[11px] uppercase tracking-wide text-slate-500">{c.state.replace(/_/g, " ").toLowerCase()}</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700/60"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.progressPct}%` }} /></div>
                  <p className="mt-1 text-[11px] text-slate-500">{c.progressPct}% to the £20,000 cap</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <ClaimShelf token={token} onClaimed={() => setReloadKey((k) => k + 1)} />

        {/* Codes & links */}
        <div className="rounded-xl border border-white/10 bg-ink-900/50 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display font-bold text-white"><LinkIcon className="h-4 w-4 text-emerald-400" /> Your programmes & tracked links</h2>
          {subscriptions.length === 0 ? (
            <p className="text-sm text-slate-400">No programmes yet. Brands you&rsquo;re matched to will issue you a code/link here.</p>
          ) : (
            <div className="space-y-2">
              {subscriptions.map((s) => (
                <div key={s.code} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-ink-950/40 p-3 text-sm">
                  <div><p className="font-semibold text-white">{s.programme || s.brand}</p><p className="font-mono text-xs text-emerald-300">{s.code}</p></div>
                  <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${s.link}`)} className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"><Copy className="h-3.5 w-3.5" /> Copy link</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-600">This is your private link — keep it safe. Earnings shown are computed on verified revenue; {isMain ? "you're on the cash programme" : "you're on the cash programme"}.</p>
      </div>
    </div>
  );
}

export default function PartnerPage() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-ink-950"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>}><PartnerDashboard /></Suspense>;
}
