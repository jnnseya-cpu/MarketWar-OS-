// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// "Next:" — turning the last line of an agent's output into something you can do.
//
// Every agent finishes by naming the next move: "Next: Build out the WhatsApp
// outreach script for the FREE Lead offer." It is good advice and it went
// nowhere. The customer read the instruction, had no button, and either did it
// by hand or dropped it — which is the whole plan stalling one step from use.
//
// Two jobs here:
//
//   ROUTE. Match the instruction to the engine that performs it, so the line
//   becomes a button that runs with the work already done carried forward.
//
//   REFUSE. Some "Next" lines ask the CUSTOMER for information the platform
//   already holds — "send me the sending domain so I can check its DNS" when the
//   domain is in the form above. That is a prompt defect, not a next step, and
//   it gets no button: a button that reopens a dead end is worse than none.

import { AGENTS } from "@/shared/agents";

export type NextStep = {
  /** The instruction, as the agent wrote it. */
  text: string;
  /** The engine that performs it, when one matches. */
  agentId?: string;
  agentName?: string;
  /** Why there is no button, when there is none. */
  blocked?: "asks_the_user" | "no_engine";
  reason?: string;
};

// A "next step" that is really a question back to the customer. The agent has
// been given every fact the platform holds, so asking for more is the prompt
// failing — and the customer has nowhere to reply.
const ASKS_THE_USER = [
  /^\s*(?:please\s+)?(?:send|share|provide|give|supply|forward|paste|upload)\s+me\b/i,
  /^\s*(?:please\s+)?(?:send|share|provide|give|supply)\s+(?:me\s+)?(?:the|your|a)\b/i,
  /^\s*(?:let me know|tell me|confirm|clarify|what is|what's|do you have|can you (?:send|share|provide|confirm))\b/i,
  /\bso (?:i|we) can (?:check|review|look at|verify)\b/i,
];

/**
 * The instruction the agent left for the reader.
 *
 * Takes the LAST such line: agents often mention next steps mid-report, and the
 * one that closes the document is the one being handed over.
 */
export function parseNextStep(output: string): string {
  const lines = (output || "").split("\n");
  let found = "";
  for (const raw of lines) {
    const line = raw.trim().replace(/^[>*\-\s]+/, "");
    // "Next: …", "**Next:** …", "Next step — …", "## Next Steps: …"
    const m = /^(?:#{1,4}\s*)?(?:\*\*)?next(?:\s+steps?)?(?:\*\*)?\s*[:：—–-]\s*(.+)$/i.exec(line);
    if (m && m[1].trim().length > 3) found = m[1].trim();
  }
  return found.replace(/^\*\*|\*\*$/g, "").replace(/\s+/g, " ").trim();
}

// Instruction → engine. Ordered: the first entry whose words appear wins, so the
// more specific channels sit above the general ones.
const ROUTES: { agentId: string; needs: RegExp }[] = [
  { agentId: "outreach-commander", needs: /\b(outreach|cold (?:email|dm|message)|prospect(?:ing)?|sequence|follow[- ]up script)\b/i },
  { agentId: "executive-email-writer", needs: /\b(email (?:script|copy|sequence|campaign)|newsletter|broadcast)\b/i },
  { agentId: "email-commander", needs: /\b(deliverability|spf|dkim|dmarc|warm[- ]?up|inbox placement|bounce)\b/i },
  { agentId: "landing-page-architect", needs: /\b(landing page|squeeze page|opt[- ]in page|sales page)\b/i },
  { agentId: "offer-builder", needs: /\b(offer|pricing|package|bundle|guarantee)\b/i },
  { agentId: "ad-creative", needs: /\b(ad creative|ad copy|advert|paid (?:ad|social)|creative brief)\b/i },
  { agentId: "content-factory", needs: /\b(content (?:plan|calendar)|posts?|reels?|captions?|social calendar)\b/i },
  { agentId: "video-commander", needs: /\b(video|reel script|vsl|storyboard)\b/i },
  { agentId: "lead-capture", needs: /\b(lead magnet|capture form|opt[- ]in|lead form)\b/i },
  { agentId: "audience-segmentation", needs: /\b(segment|audience split|list segmentation)\b/i },
  { agentId: "icp-architect", needs: /\b(icp|ideal customer|buyer persona|customer avatar)\b/i },
  { agentId: "competitor-spy", needs: /\b(competitor|rival|competitive analysis)\b/i },
  { agentId: "campaign-commander", needs: /\b(campaign plan|launch plan|go[- ]to[- ]market)\b/i },
  { agentId: "automation-architect", needs: /\b(automation|workflow|nurture (?:flow|sequence)|drip)\b/i },
  { agentId: "local-growth", needs: /\b(local seo|google business|maps listing|near me)\b/i },
  { agentId: "geo-recon", needs: /\b(seo|search ranking|keywords?|organic search)\b/i },
  { agentId: "reputation-guardian", needs: /\b(reviews?|reputation|testimonials? (?:collection|request))\b/i },
  { agentId: "budget-protection", needs: /\b(budget|ad spend|cost control|waste)\b/i },
  { agentId: "viral-hook", needs: /\b(hooks?|scroll[- ]stop|opening lines?)\b/i },
];

// WhatsApp has no agent of its own — it is a channel the outreach engine writes
// for — so it is routed explicitly rather than left unmatched.
const CHANNEL_HINTS: { agentId: string; needs: RegExp }[] = [
  { agentId: "outreach-commander", needs: /\bwhats ?app\b/i },
];

export function routeNextStep(text: string, currentAgentId?: string): NextStep {
  const step = (text || "").trim();
  if (!step) return { text: "", blocked: "no_engine" };

  if (ASKS_THE_USER.some((re) => re.test(step))) {
    return {
      text: step,
      blocked: "asks_the_user",
      reason:
        "This asks you for information the platform already has, so there is nothing to press. It is a fault in the agent's prompt, not a step you need to take.",
    };
  }

  const hit =
    ROUTES.find((r) => r.needs.test(step)) ??
    CHANNEL_HINTS.find((r) => r.needs.test(step));

  // Never route an engine straight back to itself — pressing "next" and getting
  // the same report again is the dead end with an extra click on it.
  if (!hit || hit.agentId === currentAgentId || !AGENTS[hit.agentId]) {
    return {
      text: step,
      blocked: "no_engine",
      reason: "No engine on the platform performs this one — it is yours to do.",
    };
  }

  return { text: step, agentId: hit.agentId, agentName: AGENTS[hit.agentId].name };
}

/** Parse and route in one call — what a route handler wants. */
export function nextStepFrom(output: string, currentAgentId?: string): NextStep | null {
  const text = parseNextStep(output);
  if (!text) return null;
  return routeNextStep(text, currentAgentId);
}
