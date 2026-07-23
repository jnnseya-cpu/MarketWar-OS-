// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MarketWar AI Customer Resurrection / Lead Recovery Engine.
//
// Recovers money from the database the business already owns before spending on
// cold ads. Reuses the segmentation engine's per-contact RFM/LTV/churn/intent
// scores (scoredCustomerList) and sorts every scored contact into disjoint
// RECOVERABLE cohorts — abandoned-checkout, churn-risk, inactive-60d+,
// price-sensitive — each with a computed recoverable £ value, a multi-wave touch
// plan (channel + timing + message template) and its highest-value contacts.
// Deterministic: no wall-clock, no randomness. Values are COMPUTED from the
// (sample or real) customer base and labelled demo vs live — never fabricated.

import { scoredCustomerList, type CustomerRecord, type ScoredCustomer } from "@/backend/segments";

const round = (n: number) => Math.round(n);

export type RecoveryTouch = { wave: number; channel: string; timing: string; message: string };

type CohortSpec = {
  label: string;
  description: string;
  // Expected win-back probability for this cohort (drives recoverable £).
  recoveryProbability: number;
  // Predicate over a scored contact (evaluated in priority order; first match wins
  // so cohorts stay disjoint and recoverable sums never double-count).
  match: (c: ScoredCustomer) => boolean;
  waves: (business: string) => RecoveryTouch[];
};

// Priority order matters — a contact lands in the FIRST cohort it matches.
const COHORT_SPECS: { key: string; spec: CohortSpec }[] = [
  {
    key: "abandoned_checkout",
    spec: {
      label: "Abandoned checkout / never converted",
      description: "Signed up or showed buying intent but never completed a first order — the intent is still warm.",
      recoveryProbability: 0.34,
      match: (c) => (c.orderCount ?? 0) === 0,
      waves: (b) => [
        { wave: 1, channel: "WhatsApp + email", timing: "0h — immediate", message: `Hi — you were one tap from ordering with ${b}. Your basket's still saved. Complete it now and we'll take care of you.` },
        { wave: 2, channel: "WhatsApp", timing: "+24h if no reply", message: `Still deciding? Here's why regulars choose ${b} — plus a first-order welcome to make it easy. Reply YES and it's locked in.` },
        { wave: 3, channel: "SMS", timing: "+72h — final", message: `Last nudge from ${b}: your welcome offer expires tonight. Tap to finish your first order before it's gone.` },
      ],
    },
  },
  {
    key: "churn_risk",
    spec: {
      label: "Churn risk (slipping away)",
      description: "Bought before but the signals say they're about to leave — retention beats re-acquisition.",
      recoveryProbability: 0.27,
      match: (c) => c.churnRisk >= 60,
      waves: (b) => [
        { wave: 1, channel: "WhatsApp + email", timing: "0h — immediate", message: `We've missed you at ${b}. Anything we could've done better? Reply and a real person will sort it — no bots.` },
        { wave: 2, channel: "Email", timing: "+48h if no reply", message: `A small thank-you for coming back to ${b} — a retention reward on your next order, because loyal customers matter most.` },
      ],
    },
  },
  {
    key: "inactive_60d",
    spec: {
      label: "Inactive 60d+ (win-back)",
      description: "Prior customers who've gone quiet for two months or more — a comeback offer reactivates them.",
      recoveryProbability: 0.18,
      match: (c) => (c.lastOrderDaysAgo ?? 0) >= 60 && (c.orderCount ?? 0) >= 1,
      waves: (b) => [
        { wave: 1, channel: "Email", timing: "0h — immediate", message: `It's been a while — your usual from ${b} is one tap away. Here's a comeback offer to welcome you back this week.` },
        { wave: 2, channel: "SMS", timing: "+72h if unopened", message: `${b}: your comeback offer's still live but not for long. Tap to reorder your favourite before the weekend.` },
        { wave: 3, channel: "WhatsApp", timing: "+7d — last call", message: `Final call from ${b} — we'd love you back. This is the last reminder for your win-back reward.` },
      ],
    },
  },
  {
    key: "price_sensitive",
    spec: {
      label: "Price-sensitive / low-frequency",
      description: "Low-order-value, deal-driven contacts — recover with a value bundle, not a margin-killing discount.",
      recoveryProbability: 0.22,
      match: (c) => c.segment === "price_sensitive_customers" || c.segment === "high_intent_customers",
      waves: (b) => [
        { wave: 1, channel: "Email", timing: "0h — immediate", message: `More for your money at ${b} — a value bundle built to give you the best deal without cutting corners.` },
        { wave: 2, channel: "WhatsApp", timing: "+96h if no order", message: `Popular with savvy regulars at ${b}: the bundle that gets you more for less. Want it? Reply BUNDLE.` },
      ],
    },
  },
];

export type RecoveryContact = {
  name: string;
  ltvGbp: number;
  recoveryGbp: number;
  lastOrderDaysAgo: number | null;
  churnRisk: number;
  orders: number;
};

export type RecoveryCohort = {
  key: string;
  label: string;
  description: string;
  size: number;
  consentedSize: number;
  recoverableGbp: number;
  recoveryProbability: number;
  avgLtvGbp: number;
  waves: RecoveryTouch[];
  topContacts: RecoveryContact[];
};

export type RecoveryReport = {
  business: string;
  live: boolean;
  totalRecoverableGbp: number;
  totalRecoverableContacts: number;
  cohorts: RecoveryCohort[];
  note: string;
};

// Honest empty report for a real brand whose Customer Vault has no contacts yet.
// No fabricated cohorts, no sample base — the surface tells the truth: import first.
export function emptyRecovery(business: string): RecoveryReport {
  return {
    business,
    live: true,
    totalRecoverableGbp: 0,
    totalRecoverableContacts: 0,
    cohorts: [],
    note: "No contacts in this brand's Customer Vault yet. Import CSV / CRM / Stripe / WhatsApp and the engine sorts them into win-back cohorts and computes recoverable revenue instantly — from your real database, never a sample.",
  };
}

export function recoverRevenue(business: string, customers: CustomerRecord[]): RecoveryReport {
  const live = customers.length > 0;
  const scored = scoredCustomerList(business, customers);

  const buckets = new Map<string, ScoredCustomer[]>();
  for (const c of scored) {
    for (const { key, spec } of COHORT_SPECS) {
      if (spec.match(c)) {
        const a = buckets.get(key) ?? [];
        a.push(c);
        buckets.set(key, a);
        break; // first-match-wins keeps cohorts disjoint
      }
    }
  }

  const cohorts: RecoveryCohort[] = COHORT_SPECS.filter(({ key }) => (buckets.get(key)?.length ?? 0) > 0).map(({ key, spec }) => {
    const members = buckets.get(key)!;
    const consented = members.filter((m) => m.consent !== false);
    // Recovery value = LTV × cohort win-back probability, contactable (consented) only.
    const withRecovery = members.map((m) => ({ m, recoveryGbp: round(m.ltvGbp * spec.recoveryProbability) }));
    const recoverableGbp = withRecovery
      .filter(({ m }) => m.consent !== false)
      .reduce((s, { recoveryGbp }) => s + recoveryGbp, 0);
    const avgLtvGbp = members.length ? round(members.reduce((s, m) => s + m.ltvGbp, 0) / members.length) : 0;
    const topContacts: RecoveryContact[] = withRecovery
      .sort((a, b) => b.recoveryGbp - a.recoveryGbp)
      .slice(0, 4)
      .map(({ m, recoveryGbp }) => ({
        name: m.name ?? m.id,
        ltvGbp: m.ltvGbp,
        recoveryGbp,
        lastOrderDaysAgo: m.lastOrderDaysAgo ?? null,
        churnRisk: m.churnRisk,
        orders: m.orderCount ?? 0,
      }));
    return {
      key,
      label: spec.label,
      description: spec.description,
      size: members.length,
      consentedSize: consented.length,
      recoverableGbp,
      recoveryProbability: spec.recoveryProbability,
      avgLtvGbp,
      waves: spec.waves(business),
      topContacts,
    };
  }).sort((a, b) => b.recoverableGbp - a.recoverableGbp);

  const totalRecoverableGbp = cohorts.reduce((s, c) => s + c.recoverableGbp, 0);
  const totalRecoverableContacts = cohorts.reduce((s, c) => s + c.size, 0);

  return {
    business,
    live,
    totalRecoverableGbp,
    totalRecoverableContacts,
    cohorts,
    note: live
      ? "Recoverable value = each contact's scored LTV × the cohort's win-back probability, counting only marketing-consented contacts. Computed from your imported records."
      : "Deterministic demo intelligence — a sample base scored by the live engine. Recoverable value = scored LTV × cohort win-back probability (consented only). Import CSV/CRM/Stripe/WhatsApp to recover from your real database.",
  };
}

// Engine doctrine for the GET route.
export const RECOVERY_DOCTRINE = {
  engine: "AI Customer Resurrection / Lead Recovery Engine",
  doctrine:
    "Recover money from the database you already own before spending on cold ads. Contacts are sorted into disjoint recoverable cohorts; each recoverable £ is computed from the contact's scored LTV × the cohort win-back probability, consented contacts only. Multi-wave touch plans sequence channel + timing + message. No fabricated absolute numbers.",
  cohorts: COHORT_SPECS.map(({ key, spec }) => ({ key, label: spec.label, recoveryProbability: spec.recoveryProbability })),
};
