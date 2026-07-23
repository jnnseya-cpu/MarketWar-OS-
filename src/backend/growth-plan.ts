// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// 30-Day Growth Sprint generator — turns a brand's context (+ its Failure Audit,
// if run) into ONE concrete, executable 30-day plan: the offer, the 3 owned
// channels, the first campaign, a week-by-week action list, daily rhythm and the
// KPIs to watch. Owned-channels-first doctrine (cheap/fast money before paid).
// Live through the AI gateway; deterministic preview when no provider key.

import { gatewayComplete, GatewayUnconfiguredError } from "@/backend/gateway";

export type GrowthPlanInput = {
  business: string;
  industry?: string;
  location?: string;
  product?: string;
  audience?: string;
  offer?: string;
  price?: string;
  pain?: string;
  goalGbp?: number;      // 30-day revenue target, optional
  auditSummary?: string; // top reasons / scores from the Failure Audit, optional
  lang?: string;         // target output language (English name); English = no-op
};

export type GrowthPlan = { mode: "live" | "demo"; plan: string; business: string };

const SYSTEM = `You are the MarketWar OS 30-Day Growth Sprint planner. Doctrine: stop wasting ad money; win with OWNED channels first (existing customers, email, WhatsApp, referrals, a landing page, local SEO) before any paid ads; every action ties to a customer and a measurable outcome. British English. Be specific, commercial and execution-ready — never generic theory. Output clean Markdown.

Produce ONE 30-day plan with these sections, in order:
1. **The one offer** — a single irresistible, time-limited offer for this business (make it concrete, with the exact wording).
2. **The 3 channels** — the 3 owned/low-cost channels to run (why each, what to post/send).
3. **Week-by-week plan** — Week 1 (diagnose+build offer+assets), Week 2 (launch to owned audience), Week 3 (referrals+content+local), Week 4 (convert+recover+scale). For each week: the focus, 3–5 concrete actions, and the success metric.
4. **The first campaign** — the exact first thing to launch in the next 48 hours (channel, message, CTA, where the lead lands).
5. **Daily rhythm** — a short repeatable daily checklist.
6. **KPIs & targets** — the 3–5 numbers to track and a realistic 30-day target given the inputs.
7. **What to log in the OS** — tell them to log each lead in Customer Vault and each sale in Revenue so the dashboard proves the result.
Keep it tight and doable by a small team. No guaranteed-outcome claims.`;

export async function generateGrowthPlan(input: GrowthPlanInput): Promise<GrowthPlan> {
  const biz = input.business?.trim() || "the business";
  const prompt = [
    "Business context:",
    ...Object.entries({
      Business: input.business,
      Industry: input.industry,
      Location: input.location,
      "Product/service": input.product,
      "Ideal customer": input.audience,
      "Current offer": input.offer,
      "Price point": input.price,
      "What's not working": input.pain,
      "30-day revenue target (£)": input.goalGbp ? String(input.goalGbp) : undefined,
    })
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `- ${k}: ${v}`),
    input.auditSummary ? `\nFailure Audit findings (build the plan to fix these):\n${input.auditSummary}` : "",
    "\nWrite the 30-day sprint now.",
  ].join("\n");

  try {
    const res = await gatewayComplete({ system: SYSTEM, prompt, lang: input.lang });
    return { mode: "live", plan: res.text, business: biz };
  } catch (err) {
    if (err instanceof GatewayUnconfiguredError) {
      if (process.env.REQUIRE_LIVE) throw new Error("Live AI is activating — retry in a moment.");
      return { mode: "demo", plan: demoPlan(biz), business: biz };
    }
    throw err;
  }
}

function demoPlan(biz: string): string {
  return [
    `## 30-Day Growth Sprint — ${biz} (preview)`,
    ``,
    `Add an AI provider key to generate the full, specific plan. In live mode this returns:`,
    `- **The one offer** — a concrete, time-limited offer tailored to ${biz}.`,
    `- **The 3 channels** — the owned channels most likely to produce customers first.`,
    `- **Week-by-week actions** with a success metric each week.`,
    `- **The first 48-hour campaign**, a **daily rhythm**, and the **KPIs** to hit.`,
    `- Every step tied to logging results in Customer Vault + Revenue so the dashboard proves it.`,
  ].join("\n");
}
