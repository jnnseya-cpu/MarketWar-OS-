import { NextRequest, NextResponse } from "next/server";
import {
  recent, assess, summary, standing, actorFor, record,
  EVENT_KINDS, RULES, SENTINEL_DOCTRINE, briefPrompt, type EventKind,
} from "@/backend/sentinel";
import { gateStatus, HUMAN_GATE_DOCTRINE, MACHINE_LANES, PUBLIC_FORM_LANES, SENSITIVE_PREFIXES } from "@/backend/human-gate";
import { humanCheckStatus } from "@/backend/human-check";
import { scan, FIREWALL_DOCTRINE, PATTERNS } from "@/backend/instruction-firewall";
import { gatewayComplete } from "@/backend/gateway";
import { rateLimit, clientKey, requireAuth } from "@/backend/guard";
import { meterAction } from "@/backend/wallet";

// SENTINEL — the anti-intrusion agent's surface.
//
// GET                      → the gate's mode, the counted event summary, live detections
// POST { action: "scan" }  → run the instruction firewall over a piece of text
// POST { action: "brief" } → the AI incident brief for the current detections
// POST { action: "report" }→ record an event a client-side control observed
//
// Reading the security posture requires being signed in, because the shape of
// your defences is itself useful to an attacker. The BRIEF is the only metered
// action here: counting is free and always on, and a model is asked to write
// something only when a person asks for it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const KINDS = new Set(EVENT_KINDS.map((k) => k.kind));

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const now = Date.now();
  const events = recent(24 * 60 * 60_000, now);
  const detections = assess(events, now);

  return NextResponse.json({
    gate: {
      ...gateStatus(),
      machineLanes: MACHINE_LANES,
      publicFormLanes: PUBLIC_FORM_LANES,
      sensitivePrefixes: SENSITIVE_PREFIXES,
      doctrine: HUMAN_GATE_DOCTRINE,
    },
    humanCheck: humanCheckStatus(),
    firewall: { patterns: PATTERNS.map(({ id, severity, what }) => ({ id, severity, what })), doctrine: FIREWALL_DOCTRINE },
    summary: summary(events, now),
    detections,
    rules: RULES.map(({ id, kind, threshold, windowMs, severity, response, title }) => ({ id, kind, threshold, windowMins: Math.round(windowMs / 60_000), severity, response, title })),
    eventsSeen: events.length,
    doctrine: SENTINEL_DOCTRINE,
    // Said plainly rather than left to be assumed: the gate runs on the edge and
    // cannot write into this process, so refusals it makes in ENFORCED mode are
    // counted by the platform's request log, not here.
    coverageNote: "Sentinel counts what reaches a route handler: rate limits, invalid sessions, cross-tenant attempts, refused withdrawals and every firewall finding. The human gate runs in middleware on the edge and cannot write to this process, so requests it blocks outright are visible in the deployment's request log rather than in these counts.",
  });
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(clientKey(req, "sentinel"), 30, 60_000, Date.now());
  if (!rl.ok) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const auth = await requireAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const action = str("action") || "scan";

  if (action === "scan") {
    const text = typeof body.text === "string" ? body.text : "";
    if (!text) return NextResponse.json({ error: "Nothing to scan." }, { status: 400 });
    // Not metered: this is a regular expression over a string, and charging for
    // arithmetic would be charging for nothing.
    return NextResponse.json({ ...scan(text), charged: false });
  }

  if (action === "report") {
    const kind = str("kind") as EventKind;
    if (!KINDS.has(kind)) return NextResponse.json({ error: "Unknown event kind." }, { status: 400 });
    const ev = record({
      at: new Date().toISOString(),
      kind,
      actor: actorFor(req, auth.uid),
      path: str("path") || undefined,
      detail: str("detail").slice(0, 240) || undefined,
    });
    return NextResponse.json({ recorded: ev.id, standing: standing(ev.actor, assess(recent())) });
  }

  if (action === "brief") {
    const detections = assess(recent(24 * 60 * 60_000));
    if (detections.length === 0) {
      // No provider call, because there is nothing to brief. An agent that
      // produces a paragraph about nothing is an agent that costs money to say
      // nothing.
      return NextResponse.json({
        brief: "Nothing to report. No rule crossed its threshold in the last 24 hours — which is the normal state and is worth stating rather than dressing up.",
        detections: [], charged: false,
      });
    }
    // The only metered action in this module. Counting is free and always on;
    // a provider is called only when a person asks for the brief, and then it
    // is charged like any other AI action. A security agent that spent an ACU
    // on every failed login would be a denial-of-wallet attack shipped as a
    // feature.
    const meter = await meterAction(auth, "llm");
    if (!meter.allowed) {
      return NextResponse.json({
        brief: null, detections,
        error: `${meter.error} The detections below were counted without any AI and are unaffected.`,
      }, { status: meter.status });
    }

    const { system, prompt } = briefPrompt(detections);
    try {
      const res = await gatewayComplete({ system, prompt, maxTokens: 700 }, { tier: "fast" });
      return NextResponse.json({ brief: res.text, detections, provider: res.provider, charged: true });
    } catch (e) {
      // The detections stand on their own. An AI that cannot be reached must not
      // take the incident with it.
      return NextResponse.json({
        brief: null,
        detections,
        error: `The incident brief could not be written: ${(e as Error).message}. The detections below were counted without it and are unaffected.`,
      }, { status: 200 });
    }
  }

  return NextResponse.json({ error: "Unknown action — use scan, report or brief." }, { status: 400 });
}
