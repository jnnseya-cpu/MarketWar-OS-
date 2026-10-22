// WHICH FEATURE HAS A PAGE SELLING IT, AND WHICH DOES NOT — THE LEDGER.
//
// THE DEFECT THIS FIXES. `feature-pages.ts` sells 14 capabilities out of the 58
// in `ENGINE_REGISTRY`. That is not wrong — its own doctrine argues at length
// that 58 thin pages is a Google scaled-content penalty that demotes the whole
// domain, so a capability with nothing specific to say is better left unwritten.
// But NOTHING RECORDED WHICH 44 WERE LEFT, OR WHY. An engine deliberately not
// written about was indistinguishable from an engine nobody had got to, and the
// only way to tell them apart was to read both files and diff them by hand.
//
// So the question "is every feature sold?" had no answer. This file is the
// answer, and the test beside it makes the answer compulsory: every engine in
// the registry is either SOLD BY A PAGE or has a RECORDED REASON it has none.
// An engine in neither set fails the build. That is the difference between a
// backlog and a gap nobody can see.
//
// ── THE THREE REASONS, AND WHY THEY ARE DIFFERENT ──────────────────────────
//
//   `owner-only`  Nobody outside this business will ever search for it. Admin
//                 billing, payout execution, the commercial model: these are
//                 real engines and real work, and a public page selling them
//                 would be a page for an audience of one. Writing it would be
//                 exactly the thin content the policy demotes.
//
//   `pending`     Customer-facing, with a genuine proof available, and not yet
//                 written. The `proof` field below names what that page's
//                 only-we-can-say fact will be — so the next session writes it
//                 from the code rather than re-deriving which engines matter.
//
//   `no-proof`    Customer-facing, but nothing specific has been found to say
//                 about it yet. It stays unwritten until something does. This
//                 is the honest category and it must never become a dumping
//                 ground; a `pending` entry that cannot name its proof belongs
//                 here instead, and saying so is the point.
//
// Nothing here generates a page. A ledger that wrote its own pages would be a
// page-per-feature machine, which is the thing the doctrine refuses.

import { ENGINE_REGISTRY } from "@/shared/engine-registry";
import { FEATURE_PAGES } from "@/shared/feature-pages";

export type UnwrittenWhy = "owner-only" | "pending" | "no-proof";

export type Unwritten = {
  engineId: string;
  why: UnwrittenWhy;
  /**
   * For `pending`: the fact that page will carry that a competitor cannot copy.
   * For `owner-only`: who it is for instead.
   * For `no-proof`: what would have to be true before it earns a page.
   */
  proof: string;
};

export const UNWRITTEN: Unwritten[] = [
  // ── OWNER-ONLY ────────────────────────────────────────────────────────────
  // Real engines, real work, and an audience of one. A public page selling the
  // admin billing screen is a page for nobody.
  { engineId: "admin-billing", why: "owner-only", proof: "The platform operator's own billing surface. Customers are sold the price, not the till." },
  { engineId: "admin-economics", why: "owner-only", proof: "Owner margin reporting. Publishing a page about our own unit economics sells nothing and tells competitors our cost base." },
  { engineId: "payout-approvals", why: "owner-only", proof: "The operator's approval queue for creator payouts. The creator-facing half is already sold on /features/creator-payouts-and-tax." },
  { engineId: "payout-execute", why: "owner-only", proof: "The execution leg of a payout. What a creator needs to know is the fee and the timing, which the payouts page carries." },
  { engineId: "comms-events", why: "owner-only", proof: "Internal delivery-event plumbing. The customer-facing consequence is deliverability, which has its own page." },
  { engineId: "subscription", why: "owner-only", proof: "The commercial model itself — plans and the markup floor. Sold on /choose-plan and on the ACU page, not as a feature page about the billing engine." },

  // ── PENDING ───────────────────────────────────────────────────────────────
  // Customer-facing, proof identified, page not yet written. Each `proof` is
  // the thing that page must say; it was read off the engine, not invented.
];

export type Coverage = {
  total: number;
  /** Engines sold by at least one page. */
  covered: string[];
  ownerOnly: string[];
  pending: string[];
  noProof: string[];
  /** Engines in neither the pages nor the ledger. MUST be empty. */
  unaccounted: string[];
  /** Pages whose engineId is not in the registry. MUST be empty. */
  orphanPages: string[];
  line: string;
};

/**
 * Where feature coverage stands, computed rather than typed.
 *
 * Every count here is derived at call time. A number about how many features
 * are sold is exactly the kind that is wrong within a week of being written
 * into prose, and this platform has shipped that defect twice already — once
 * as "32 checks" against a code that said 31.
 */
export function featureCoverage(): Coverage {
  const pageIds = new Set(FEATURE_PAGES.map((p) => p.engineId));
  const ledger = new Map(UNWRITTEN.map((u) => [u.engineId, u]));
  const ids = ENGINE_REGISTRY.map((e) => e.id);

  const covered = ids.filter((id) => pageIds.has(id));
  const pick = (why: UnwrittenWhy) => ids.filter((id) => !pageIds.has(id) && ledger.get(id)?.why === why);
  const ownerOnly = pick("owner-only");
  const pending = pick("pending");
  const noProof = pick("no-proof");
  const unaccounted = ids.filter((id) => !pageIds.has(id) && !ledger.has(id));
  const orphanPages = [...pageIds].filter((id) => !ids.includes(id));

  return {
    total: ids.length,
    covered, ownerOnly, pending, noProof, unaccounted, orphanPages,
    line: `${covered.length} of ${ids.length} engines are sold by a page. `
      + `${ownerOnly.length} are operator-only and deliberately unwritten. `
      + `${pending.length} ${pending.length === 1 ? "is" : "are"} customer-facing with the proof identified and the page still to write`
      + `${noProof.length ? `, and ${noProof.length} have nothing specific to say yet` : ""}.`,
  };
}

export const COVERAGE_DOCTRINE = [
  "Every engine is either sold by a page or has a recorded reason it is not. An engine in neither set fails the build, because a gap nobody can see is a gap nobody closes.",
  "A page is written when there is something only this platform can say about the capability. Volume is not the target: a page per feature produced at scale is the pattern Google's scaled-content policy demotes, and it takes the whole domain with it.",
  "An operator-only engine is not a missing page. Admin billing and payout execution are real work with an audience of one.",
  "The counts are computed from the registry and the pages. A number about how much is covered, typed into prose, is wrong within a week.",
];
