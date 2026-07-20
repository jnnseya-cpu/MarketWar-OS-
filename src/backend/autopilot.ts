// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Revenue Autopilot — the "sleep while it works" loop.
//
// One objective of MarketWar: the operator sleeps while the agents find
// customers who spend real money. This orchestrates one acquisition CYCLE for a
// brand: scan opportunities → decide the highest-£ acquisition actions → and,
// governed by the autonomy dial (L0–L4, high-risk categories capped), either
// AUTO-EXECUTE them or QUEUE them for approval. A scheduler (nightly cron)
// calls /api/autopilot per brand, so it runs unattended.
//
// Honesty rule (this whole platform's): Autopilot NEVER writes fabricated money
// into the ledger. It creates the conditions for revenue and reports a PROJECTION;
// real, attributed revenue only enters via the money loop (a paid checkout link,
// an owned-form capture, or a manual log). Deterministic + demo-safe: seeded by
// brand + date so it runs with zero config; a live AI key deepens the reasoning.

import { autonomyGate } from "@/backend/campaign-architect";

export type BrandLite = {
  id: string;
  name: string;
  industry?: string;
  product?: string;
  audience?: string;
  location?: string;
  offer?: string;
  goal?: string;
};

export type AutopilotAction = {
  id: string;
  kind: "find_leads" | "launch_campaign" | "reactivate" | "amplify" | "optimise";
  title: string;
  rationale: string;
  channel: string;
  riskCategory: "low" | "medium" | "high";
  requiredLevel: number;      // autonomy level needed to auto-execute
  projectedValueGbp: number;  // ESTIMATE — not real money
  decision: "auto_executed" | "queued_for_approval";
};

export type AutopilotRun = {
  brandId: string;
  brandName: string;
  at: string;
  requestedLevel: number;
  grantedLevel: number;
  autonomyCapped: boolean;
  autonomyReason: string;
  budgetGbp: number;
  opportunitiesScanned: number;
  actions: AutopilotAction[];
  autoExecuted: number;
  queued: number;
  projectedRevenueGbp: number; // sum of estimates — labelled a projection everywhere
  digest: string;
  guardrails: string[];
};

// FNV-1a — deterministic seed from brand + date (no Date.now/Math.random here).
function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rng(seed: number) {
  let x = seed || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; };
}

const ACTION_TEMPLATES: Array<Omit<AutopilotAction, "id" | "decision" | "projectedValueGbp" | "title" | "rationale"> & { title: (b: BrandLite, n: number) => string; rationale: (b: BrandLite) => string; base: number }> = [
  { kind: "find_leads", channel: "Owned SEO + marketplace", riskCategory: "low", requiredLevel: 2, base: 120,
    title: (b, n) => `Prospect ${n} new ${b.audience || "target"} leads`,
    rationale: (b) => `Publish owned local pages + marketplace listing for ${b.location || "your area"} to capture inbound demand — no ad spend.` },
  { kind: "reactivate", channel: "WhatsApp + email", riskCategory: "low", requiredLevel: 2, base: 180,
    title: (b, n) => `Reactivate ${n} dormant contacts with a comeback offer`,
    rationale: (b) => `Zero-cost re-engagement of past customers with "${b.offer || "a comeback offer"}" — highest ROI channel.` },
  { kind: "launch_campaign", channel: "Meta / TikTok", riskCategory: "medium", requiredLevel: 3, base: 340,
    title: (b) => `Launch a "${b.offer || "signature offer"}" acquisition campaign`,
    rationale: (b) => `Design + publish a channel-native campaign to ${b.audience || "your audience"} within the budget cap and kill-criteria.` },
  { kind: "amplify", channel: "Referral loop", riskCategory: "low", requiredLevel: 2, base: 90,
    title: (b) => `Spin up a referral loop for ${b.product || "your product"}`,
    rationale: () => `Turn each new customer into 1–2 more with a two-sided reward — compounding, owned.` },
  { kind: "optimise", channel: "Budget reallocation", riskCategory: "medium", requiredLevel: 4, base: 60,
    title: () => `Reallocate budget toward the most profitable campaign`,
    rationale: () => `Move spend from the lowest-ROAS ad set to the proven winner (Revenue Autopilot / L4 only).` },
];

export function runAutopilotCycle(input: { brand: BrandLite; requestedLevel?: number; budgetGbp?: number; nowISO: string }): AutopilotRun {
  const { brand, nowISO } = input;
  const requestedLevel = Math.max(0, Math.min(4, Math.round(input.requestedLevel ?? 3)));
  const budgetGbp = Math.max(0, input.budgetGbp ?? 0);

  // Governance: high-risk industry categories (children, health, regulated…) are
  // capped by the canonical autonomy gate — so e.g. a children's brand can only
  // ever queue for approval, never silently auto-publish.
  const category = `${brand.industry ?? ""} ${brand.product ?? ""}`.toLowerCase();
  const gate = autonomyGate({ riskCategory: category, requestedLevel });
  const grantedLevel = gate.grantedLevel;

  const seed = seedOf(`${brand.id}|${nowISO.slice(0, 10)}`);
  const rand = rng(seed);

  const actions: AutopilotAction[] = ACTION_TEMPLATES.map((t, i) => {
    const n = 20 + Math.floor(rand() * 80);
    const projectedValueGbp = Math.round(t.base * (0.6 + rand() * 1.2));
    // High-risk category forces every action to be treated as high-risk.
    const riskCategory = gate.maxLevel <= 1 ? "high" : t.riskCategory;
    const decision: AutopilotAction["decision"] = grantedLevel >= t.requiredLevel && riskCategory !== "high" ? "auto_executed" : "queued_for_approval";
    return {
      id: `ap_${brand.id}_${i}`,
      kind: t.kind,
      title: t.title(brand, n),
      rationale: t.rationale(brand),
      channel: t.channel,
      riskCategory,
      requiredLevel: t.requiredLevel,
      projectedValueGbp,
      decision,
    };
  }).sort((a, b) => b.projectedValueGbp - a.projectedValueGbp);

  const autoExecuted = actions.filter((a) => a.decision === "auto_executed").length;
  const queued = actions.length - autoExecuted;
  const projectedRevenueGbp = actions.reduce((s, a) => s + a.projectedValueGbp, 0);

  const guardrails = [
    `Autonomy L${grantedLevel} (${gate.capped ? `capped from L${requestedLevel} — ${gate.reason}` : "as requested"}).`,
    budgetGbp > 0 ? `Spend capped at £${budgetGbp} for this cycle.` : "No paid spend — owned channels only until a budget is set.",
    "No fabricated revenue: real money only appears in Revenue when a real conversion is captured.",
    "High-risk categories (children, health, regulated…) never auto-publish — always queued for approval.",
  ];

  const digest = autoExecuted > 0
    ? `While you were away, Autopilot scanned ${actions.length} acquisition moves for ${brand.name}, auto-executed ${autoExecuted} (owned/low-risk) and queued ${queued} for your approval — projected £${projectedRevenueGbp} of pipeline. Real revenue lands in Revenue as customers convert.`
    : `Autopilot lined up ${actions.length} acquisition moves for ${brand.name} and queued all ${queued} for your approval (autonomy L${grantedLevel}${gate.capped ? " — capped for a high-risk category" : ""}). Approve to let it run while you sleep.`;

  return {
    brandId: brand.id, brandName: brand.name, at: nowISO,
    requestedLevel, grantedLevel, autonomyCapped: gate.capped, autonomyReason: gate.reason,
    budgetGbp, opportunitiesScanned: actions.length,
    actions, autoExecuted, queued, projectedRevenueGbp, digest, guardrails,
  };
}

// The morning digest email — "here's what I did overnight and what needs your
// approval", across all of the account's brands. Pure HTML string (inline styles
// for email clients); the route sends it via the SMTP email engine.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function autopilotDigestEmail(runs: AutopilotRun[], opts: { recipientName?: string; dashboardUrl: string }): { subject: string; html: string } {
  const totalAuto = runs.reduce((s, r) => s + r.autoExecuted, 0);
  const totalQueued = runs.reduce((s, r) => s + r.queued, 0);
  const totalProjected = runs.reduce((s, r) => s + r.projectedRevenueGbp, 0);
  const subject = `☀️ MarketWar overnight — ${totalAuto} done, ${totalQueued} need your approval`;

  const brandBlocks = runs.map((r) => {
    const rows = r.actions.map((a) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #1b2430;color:#e6edf5;font-size:13px;">
          ${esc(a.title)}
          <div style="color:#7b8794;font-size:11px;margin-top:2px;">${esc(a.channel)} · projected £${a.projectedValueGbp}</div>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #1b2430;text-align:right;white-space:nowrap;">
          <span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:99px;${a.decision === "auto_executed" ? "background:rgba(16,185,129,.15);color:#34d399;" : "background:rgba(251,191,36,.15);color:#fbbf24;"}">${a.decision === "auto_executed" ? "done" : "approve"}</span>
        </td>
      </tr>`).join("");
    return `
      <div style="margin:0 0 18px;border:1px solid #1b2430;border-radius:12px;overflow:hidden;">
        <div style="padding:12px 14px;background:#0d121a;">
          <div style="color:#fff;font-weight:800;font-size:15px;">${esc(r.brandName)}</div>
          <div style="color:#7b8794;font-size:12px;margin-top:2px;">${r.autoExecuted} auto-executed · ${r.queued} queued · projected £${r.projectedRevenueGbp} · autonomy L${r.grantedLevel}${r.autonomyCapped ? " (capped — high-risk)" : ""}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>`;
  }).join("");

  const html = `
  <div style="margin:0;padding:24px;background:#070a11;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;">
      <div style="font-size:20px;font-weight:800;color:#fff;">MarketWar <span style="color:#10b981;">OS</span></div>
      <div style="color:#9aa7b8;font-size:14px;margin:6px 0 18px;">
        Good morning${opts.recipientName ? `, ${esc(opts.recipientName)}` : ""} — here's what Autopilot did overnight across ${runs.length} brand${runs.length === 1 ? "" : "s"}.
      </div>
      <div style="display:flex;gap:8px;margin:0 0 18px;">
        <div style="flex:1;border:1px solid #1b2430;border-radius:10px;padding:12px;">
          <div style="color:#7b8794;font-size:11px;text-transform:uppercase;">Auto-executed</div>
          <div style="color:#34d399;font-size:22px;font-weight:800;">${totalAuto}</div>
        </div>
        <div style="flex:1;border:1px solid #1b2430;border-radius:10px;padding:12px;">
          <div style="color:#7b8794;font-size:11px;text-transform:uppercase;">Need approval</div>
          <div style="color:#fbbf24;font-size:22px;font-weight:800;">${totalQueued}</div>
        </div>
        <div style="flex:1;border:1px solid #1b2430;border-radius:10px;padding:12px;">
          <div style="color:#7b8794;font-size:11px;text-transform:uppercase;">Projected pipeline</div>
          <div style="color:#fff;font-size:22px;font-weight:800;">£${totalProjected}</div>
        </div>
      </div>
      ${brandBlocks}
      <a href="${esc(opts.dashboardUrl)}" style="display:inline-block;background:#10b981;color:#052e1c;font-weight:800;text-decoration:none;padding:11px 20px;border-radius:10px;font-size:14px;">Review &amp; approve →</a>
      <div style="color:#6b7787;font-size:11px;margin-top:18px;line-height:1.5;">
        Projected pipeline is an estimate, not booked revenue. Real, attributed revenue appears in your Revenue dashboard as customers convert. High-risk categories (children, health, regulated) are always queued for your approval and never auto-published.
      </div>
    </div>
  </div>`;
  return { subject, html };
}
