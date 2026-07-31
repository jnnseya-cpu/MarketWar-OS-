import { NextRequest, NextResponse } from "next/server";

import { AGENTS } from "@/shared/agents";
import { runAgent } from "@/backend/provider";
import { gatewayLangFrom } from "@/backend/gateway";
import { logAgentRun } from "@/backend/db";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";
import { checkDomainAuth, normaliseDomain, type DomainAuthReport } from "@/backend/dns-auth";
import { nextStepFrom } from "@/backend/next-step";
import { deepCrawl } from "@/backend/deep-crawl";

// Denial-of-wallet defence: every AI call can spend real provider budget once
// keys are live, so cap requests per caller. 240/min is generous for genuine
// use (and for the smoke suite's ~39 sequential calls) but stops a runaway.
/** Agents whose whole job is about a website, and which therefore get its facts. */
const SITE_AWARE_AGENTS = new Set([
  "website-intelligence", "seo-strategist", "conversion-architect",
  "content-factory", "local-growth", "organic-dominance",
]);

const AGENT_RATE_LIMIT = 240;
const AGENT_WINDOW_MS = 60_000;

// An agent writes a full strategy, not a chat reply.
//
// This route used to allow 60s and let the gateway apply its 50s chat default,
// which the gateway then SPLIT across every configured provider. With three
// configured that was 16.6s each, and the live failure read "anthropic (timed
// out after 17s); openai (timed out after 17s); gemini (timed out after 17s)" —
// three attempts none of which could ever have finished.
//
// So the route now states a real budget and hands the gateway what is actually
// left after the pre-flight work, anchored at the moment the request arrived.
export const maxDuration = 120;
/** Leave room to serialise and return a readable error instead of a 504. */
const ROUTE_BUDGET_MS = 105_000;
/** A single provider attempt at a document-sized answer. */
const AGENT_PER_CALL_MS = 45_000;

export async function POST(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const startedAt = Date.now();
  const { agentId } = params;
  if (!AGENTS[agentId]) {
    return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 404 });
  }

  const rl = rateLimit(clientKey(req, "agents"), AGENT_RATE_LIMIT, AGENT_WINDOW_MS, Date.now());
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded — slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  // Require auth + meter ACUs (demo passes through; staff are not metered).
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const meter = await meterAction(auth, "llm");
  if (!meter.allowed) return NextResponse.json({ error: meter.error }, { status: meter.status });

  let input: Record<string, string> = {};
  try {
    const body = await req.json();
    if (body && typeof body === "object") {
      input = Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, String(v ?? "")])
      );
    }
  } catch {
    // empty body is fine — agent runs on defaults
  }

  // Pre-flight: gather the facts the agent would otherwise ASK FOR.
  //
  // The Deliverability Commander used to end every report with "send me the
  // sending domain so I can check its live SPF/DKIM/DMARC records" — a dead end,
  // because the domain was already in the form above it and there was nowhere to
  // reply. SPF, DKIM and DMARC are public DNS records, so the platform reads them
  // itself and hands the agent the answer instead of the question.
  let domainAuth: DomainAuthReport | undefined;
  if (agentId === "email-commander") {
    const domain = normaliseDomain(input.website || input.domain || input.business || "");
    if (domain) {
      try {
        domainAuth = await checkDomainAuth(domain);
        if (!domainAuth.checked) {
          // DNS was unreachable. Handing the model a report of "everything is
          // missing" would have it tell the customer to republish records that
          // may already be correct.
          input.liveDnsFacts = `A live DNS check of ${domainAuth.domain} could not be completed (${domainAuth.error || "resolver unreachable"}). Do NOT state that any record is missing or present — you do not know. Say the check could not run, and build the plan on the assumption that authentication must be VERIFIED before volume sending.`;
        } else input.liveDnsFacts = [
          `LIVE DNS for ${domainAuth.domain} — read from public records just now. These are FACTS. Do not ask the user for them, and do not tell them to send you the domain; you have it and you have checked it.`,
          ...domainAuth.checks.map((c) => `- ${c.label}: ${c.status.toUpperCase()}${c.value ? ` — ${c.value}` : ""}. ${c.detail}`),
          `Authentication score ${domainAuth.score}/100. Ready to send: ${domainAuth.readyToSend ? "yes" : "no"}.`,
          domainAuth.blockers.length ? `Blocking: ${domainAuth.blockers.join(" | ")}` : "",
          "Build the plan around this ACTUAL state. End with the next action the user takes in this product, never with a request for information already given.",
        ].filter(Boolean).join("\n");
      } catch { /* the agent still runs; it just has less to work with */ }
    }
  }

  // The same treatment for the SITE, and for exactly the same reason.
  //
  // The website-intelligence agent ended a live run with "Can't run SiteRaid
  // yet — I have your logo, colours and URL, but zero verified facts about what
  // VeryX actually sells or to whom", then asked the customer four questions.
  // The deep crawl had already read 544 things off that site minutes earlier —
  // the products, the services, the prices, the FAQs, the trust signals. The
  // agent was never shown any of it, so it asked for what the platform held.
  //
  // The facts are handed over, and what is NOT known is named as unknown rather
  // than left for the model to guess at or demand.
  if (SITE_AWARE_AGENTS.has(agentId)) {
    const site = (input.website || input.url || "").trim();
    if (site) {
      try {
        const spent = Date.now() - startedAt;
        const crawl = await deepCrawl(site, { maxPages: 5, budgetMs: Math.max(8_000, 35_000 - spent) });
        const x = crawl.extraction;
        if (x) {
          const list = (label: string, xs: string[]) => (xs.length ? `- ${label}: ${xs.slice(0, 10).join("; ")}` : "");
          input.liveSiteFacts = [
            `LIVE CRAWL of ${crawl.host} — read from the real pages just now, ${crawl.pages.filter((p) => p.ok).length} page(s). These are FACTS. Do NOT ask the user what the business sells, who it sells to, or what it charges: read it here. Do NOT end by requesting information that appears below.`,
            x.brand.name ? `- Business name on the site: ${x.brand.name}` : "",
            x.brand.tagline ? `- How the site describes itself: ${x.brand.tagline}` : "",
            list("Products (from their structured data)", x.products.values),
            list("Services", x.services.values),
            list("Calls to action on the page", x.ctas),
            list("Trust signals they publish", x.trustSignals),
            list("Questions their own FAQ answers", x.faqs.map((f) => f.q)),
            list("Section headings", x.hierarchy.filter((h) => h.level <= 2).map((h) => h.text)),
            x.pricing.length
              ? `- Prices: ${x.pricing.map((pr) => `${pr.value}${pr.currency ? ` ${pr.currency}` : ""}${pr.declared ? " (declared in structured data — quotable)" : " (seen in the page text only — do NOT quote as their price)"}`).slice(0, 8).join("; ")}`
              : "",
            x.reviews.length ? `- Rating published on the site: ${x.reviews.map((r) => `${r.rating ?? "?"} from ${r.count ?? "?"} reviews`).join("; ")}` : "- No rating is published on the site. Do not state one.",
            "",
            "WHAT IS NOT KNOWN, and must not be invented: who the audience is (it is not written in the markup — infer it if useful and LABEL it as an inference), and any figure not listed above.",
            crawl.partial ? "This is a sample of the site, not all of it." : "",
          ].filter(Boolean).join("\n");
        } else {
          input.liveSiteFacts = `A live crawl of ${site} returned nothing readable (${crawl.note}). Say so plainly. Do not invent what the business sells, and do not ask the user to paste their homepage — tell them the page could not be read and why.`;
        }
      } catch { /* the agent still runs; it just has less to work with */ }
    }
  }

  try {
    // Anchored at arrival, not here: the pre-flight DNS/domain checks above have
    // already spent wall-clock, and a budget that ignores that is the fiction
    // that produces a 504 instead of an answer.
    const spent = Date.now() - startedAt;
    const result = await runAgent(agentId, input, gatewayLangFrom(req), {
      budgetMs: Math.max(8_000, ROUTE_BUDGET_MS - spent),
      perCallMs: AGENT_PER_CALL_MS,
      // meterAction already debited this customer's ACUs above, so the provider
      // cost is covered twice over under the pricing law. Their work is exempt
      // from the platform's own ceiling and always runs.
      paid: (meter.charged ?? 0) > 0,
    });
    // Persist the run when Firebase is configured; never block the response.
    logAgentRun(result, input).catch(() => {});
    // The report travels beside the prose so the UI can render the records and
    // the exact values to publish, rather than leaving the customer to retype
    // them out of a paragraph.
    // The closing "Next:" line, routed to the engine that performs it. Without
    // this the plan stalls one step from being used: good advice, no button.
    const nextStep = nextStepFrom(result.output, agentId);
    return NextResponse.json({ ...result, ...(domainAuth ? { domainAuth } : {}), ...(nextStep ? { nextStep } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent execution failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({
    agents: Object.values(AGENTS).map(({ id, name, role, description }) => ({
      id,
      name,
      role,
      description,
    })),
  });
}
