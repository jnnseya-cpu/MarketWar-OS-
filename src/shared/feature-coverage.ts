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
  { engineId: "contact-hunter", why: "pending", proof: "Confirmed, inferred and provider never convert into one another: an address we read on a page is never relabelled as one a supplier sold us. Plus the 12 lead-harvest checks and a UK/EU/US lawful-basis verdict per row." },
  { engineId: "contact-finder", why: "pending", proof: "A bought list's own columns are carried rather than discarded: a row arriving with a domain costs no search at all, and a Facebook or LinkedIn page is read for the company's own site for free, gated by an ownership rule that refuses a domain it cannot tie to the company." },
  { engineId: "lead-harvest", why: "pending", proof: "PECR regulation 22 applies to an INDIVIDUAL subscriber, so a limited company's info@ is mailable on legitimate interests while a consumer mailbox with nothing on file is not. The platform decides that in one place and writes the ICO's three-part assessment itself." },
  { engineId: "campaign-architect", why: "pending", proof: "A campaign whose reward spend breaches the Safe Reward Ceiling is refused at build time, not reported at the end of the month." },
  { engineId: "buyer-psychology", why: "pending", proof: "The angles are derived from the brand's own stated audience and offer, and the engine never invents a persona statistic." },
  { engineId: "offer-forge", why: "pending", proof: "An offer is costed against the same contribution arithmetic that sets the affiliate ceiling, so a tempting offer that loses money on every order is caught before it is published." },
  { engineId: "visualstrike", why: "pending", proof: "Every size is rendered from one validated palette and a real layout engine, so nothing is stretched to fit a placement it was not composed for." },
  { engineId: "market-listening", why: "pending", proof: "Every number is an ESTIMATE derived only from signals the caller supplied; the engine never invents a mention." },
  { engineId: "opportunity-radar", why: "pending", proof: "An opportunity is scored from the business's own inputs and is reproducible — the same inputs always return the same radar, so a figure cannot drift between two readings of the same week." },
  { engineId: "market-exit", why: "pending", proof: "A market the business should leave is named with the evidence for leaving, which is the recommendation no agency paid on spend will ever make." },
  { engineId: "ad-intel", why: "pending", proof: "An advert entered by hand is counted as entered by hand: observed and measured data never merge into one figure." },
  { engineId: "seo", why: "pending", proof: "Every article the platform publishes is scored by the same crawler it sells, against the live page, and held as a draft below 90 — we fail our own check rather than ship it." },
  { engineId: "programmatic-seo", why: "pending", proof: "A generated page is refused unless it carries something the template cannot: scaled content with nothing specific in it demotes the whole domain, which is the opposite of the product." },
  { engineId: "concierge", why: "pending", proof: "A local answer is grounded in the business's own published information rather than a model's recollection of the area." },
  { engineId: "localisation", why: "pending", proof: "A locale is a market decision and not a translation: currency, consent law and sending rules all change with it, and the platform refuses to send into a destination whose rules it cannot satisfy." },
  { engineId: "engagement", why: "pending", proof: "A frequency cap of five touches in seven days is enforced in the engine, so an enthusiastic campaign cannot exhaust a list." },
  { engineId: "creator-intel", why: "pending", proof: "The Creator Score measures conversion rather than reach, so 800 people who trust somebody can outrank 80,000 who scroll past." },
  { engineId: "reporting", why: "pending", proof: "A white-label report carries the figures the platform actually counted and leaves a gap where it counted nothing, rather than filling it with a projection." },
  { engineId: "youtube", why: "pending", proof: "Retention advice is derived from the channel's own supplied numbers, never from a benchmark nobody here measured." },
  { engineId: "video-intelligence", why: "pending", proof: "A clip is cut on the transcript's own structure, so a recommended moment can be checked against the words that produced it." },
  { engineId: "avatar-gateway", why: "pending", proof: "A presenter video is labelled as synthetic, because passing one off as a filmed person is a disclosure failure before it is a marketing choice." },
  { engineId: "orchestrator", why: "pending", proof: "A chain stops at the first step whose output fails its own check, rather than passing a bad answer down four more steps and charging for all of them." },
  { engineId: "brand-memory", why: "pending", proof: "A fact the platform MEASURED is stored differently from one an agent inferred, and the inferred one is never quoted back as measured." },
  { engineId: "genz", why: "pending", proof: "A growth mission pays on a VERIFIED outcome and never on a claimed one, so a hub cannot be farmed for rewards by people reporting work they did not do." },
  { engineId: "local-outreach", why: "pending", proof: "A printable flyer and a local group post are the two channels with no platform fee, and the engine says so rather than steering spend into paid media." },
  { engineId: "acquisition", why: "pending", proof: "The first ten messages are written per brand from its own offer, and the run reports what it could not do rather than reporting success." },
  { engineId: "onboarding", why: "pending", proof: "Setup finishes with a working deployment or says which capability is dark and what the single action to fix it is — never a green tick over a platform that cannot send." },
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
      + `${pending.length} are customer-facing with the proof identified and the page still to write`
      + `${noProof.length ? `, and ${noProof.length} have nothing specific to say yet` : ""}.`,
  };
}

export const COVERAGE_DOCTRINE = [
  "Every engine is either sold by a page or has a recorded reason it is not. An engine in neither set fails the build, because a gap nobody can see is a gap nobody closes.",
  "A page is written when there is something only this platform can say about the capability. Volume is not the target: a page per feature produced at scale is the pattern Google's scaled-content policy demotes, and it takes the whole domain with it.",
  "An operator-only engine is not a missing page. Admin billing and payout execution are real work with an audience of one.",
  "The counts are computed from the registry and the pages. A number about how much is covered, typed into prose, is wrong within a week.",
];
