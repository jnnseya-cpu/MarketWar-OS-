// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// M-35 Viral Amplification & Retargeting Engine — the compliant reach engine.
//
// Doctrine (docs/ai-os/12-amplification-engine.md): reach is EARNED and
// follow-up is CONSENTED. Two mechanisms, both lawful:
//   1. Viral loops — referral/UGC/affiliate mechanics that compound reach
//      through people who CHOOSE to share. We measure the viral coefficient
//      honestly; we never claim a fixed multiplier.
//   2. Retargeting — sequenced follow-up aimed ONLY at people who touched the
//      tenant's own funnel (clicked, messaged, started a form…), with
//      per-person frequency caps and a hard opt-out that ends contact
//      immediately. No cross-web surveillance, no uncapped frequency.
//
// This module computes the compliant plan and the honest projections; it
// never tracks arbitrary people and never exceeds the frequency ceiling.

// ---------------------------------------------------------------------------
// Viral coefficient (K) — the honest virality math
// ---------------------------------------------------------------------------

export type ViralInputs = {
  seedAudience: number; // people who see the first wave (consented reach)
  shareRate: number; // fraction who share (0–1)
  invitesPerSharer: number; // avg invites each sharer sends
  inviteConversion: number; // fraction of invites that become new sharers (0–1)
  cycles: number; // how many share cycles to project
};

export type ViralProjection = {
  k: number; // viral coefficient = invitesPerSharer * inviteConversion * shareRate
  viral: boolean; // K >= 1 means self-sustaining growth
  totalReach: number; // seed + all downstream cycles
  perCycle: number[]; // new reach each cycle
  note: string;
};

export function projectVirality(i: ViralInputs): ViralProjection {
  const k = i.invitesPerSharer * i.inviteConversion * i.shareRate;
  const perCycle: number[] = [];
  let current = i.seedAudience;
  let total = i.seedAudience;
  for (let c = 0; c < Math.max(1, Math.min(i.cycles, 20)); c++) {
    current = Math.round(current * k);
    if (current <= 0) break;
    perCycle.push(current);
    total += current;
  }
  const note =
    k >= 1
      ? "K ≥ 1 — self-sustaining viral loop; reach compounds each cycle."
      : "K < 1 — amplifying but not self-sustaining; each cycle multiplies the seed, growth tapers. Raise share rate or reward to push K up.";
  return { k: Math.round(k * 100) / 100, viral: k >= 1, totalReach: total, perCycle, note };
}

// ---------------------------------------------------------------------------
// Retargeting frequency governor — the compliant "follow up until they act"
// ---------------------------------------------------------------------------

// Behaviours that make someone a lawful retargeting subject: they interacted
// with THIS tenant's funnel. Cross-web strangers are never eligible.
export const RETARGETABLE_BEHAVIOURS = [
  "clicked_no_purchase",
  "messaged_then_went_quiet",
  "viewed_landing_page",
  "started_form",
  "watched_video",
  "abandoned_cart",
  "app_install_no_order",
] as const;

export type RetargetSubject = {
  id: string;
  behaviour: (typeof RETARGETABLE_BEHAVIOURS)[number];
  consentedChannels: string[]; // channels the person can lawfully be reached on
  optedOut: boolean;
  touchesLast7d: number; // messages already sent in the rolling window
  converted: boolean;
};

// Governance ceiling: a person is followed up UNTIL they convert or opt out,
// but never more than this many touches in a rolling 7-day window — keeps the
// platform inside ad-network policy, PECR, and deliverability limits.
export const MAX_TOUCHES_PER_7D = 5;

export type RetargetDecision = {
  id: string;
  action: "send" | "hold" | "stop";
  channel: string | null;
  reason: string;
};

export function planRetargeting(subjects: RetargetSubject[]): {
  decisions: RetargetDecision[];
  willSend: number;
  held: number;
  stopped: number;
} {
  const decisions = subjects.map((s): RetargetDecision => {
    if (s.optedOut) return { id: s.id, action: "stop", channel: null, reason: "opted out — contact ends immediately" };
    if (s.converted) return { id: s.id, action: "stop", channel: null, reason: "converted — goal met, sequence complete" };
    if (!s.consentedChannels.length)
      return { id: s.id, action: "hold", channel: null, reason: "no consented channel — cannot lawfully contact" };
    if (s.touchesLast7d >= MAX_TOUCHES_PER_7D)
      return { id: s.id, action: "hold", channel: null, reason: `frequency cap reached (${MAX_TOUCHES_PER_7D}/7d) — resumes next window` };
    return {
      id: s.id,
      action: "send",
      channel: s.consentedChannels[0],
      reason: `eligible — ${s.behaviour}, ${s.touchesLast7d}/${MAX_TOUCHES_PER_7D} touches used`,
    };
  });
  return {
    decisions,
    willSend: decisions.filter((d) => d.action === "send").length,
    held: decisions.filter((d) => d.action === "hold").length,
    stopped: decisions.filter((d) => d.action === "stop").length,
  };
}
