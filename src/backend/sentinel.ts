// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// MARKETWAR OS — SENTINEL, the anti-intrusion agent.
//
// Owner directive: activate an anti-hacking AI agent. This is it, and it is
// worth being exact about what "AI agent" means here, because the dishonest
// version of this module is easy to write and looks better.
//
//   THE DETECTION IS ARITHMETIC. Every finding below is a COUNT of events that
//   actually happened, in a stated window, with the events attached. No model
//   decides whether you are under attack. A language model asked "does this look
//   like an attack?" produces a confident answer either way, and a security
//   control that is confidently wrong at 3am is worse than none — you would act
//   on it.
//
//   THE AI DOES THE PART A MODEL IS GOOD AT: reading a confirmed incident and
//   writing what it means and what to do, in the operator's language, at the
//   moment they need it. That call is metered like any other AI action, and it
//   runs on demand rather than on every event — an agent that calls a provider
//   on each failed login is a denial-of-wallet attack you built yourself.
//
// NO RISK SCORES. There is no 0–100 "threat level" anywhere in this file. Such
// a number would be a hash of some counts dressed as a measurement, and this
// codebase has a standing rule against presenting a number as a measurement
// unless something counted it. What Sentinel reports is: this many of this kind
// of event, from this actor, in this window, here they are.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";

export type EventKind =
  | "auth_failed"
  | "gate_refused"
  | "gate_reverify_required"
  | "machine_lane_denied"
  | "tenant_denied"
  | "rate_limited"
  | "injection_flagged"
  | "injection_refused"
  | "payout_refused"
  | "identity_rejected"
  | "disposable_email";

export const EVENT_KINDS: { kind: EventKind; what: string }[] = [
  { kind: "auth_failed", what: "A request presented an invalid or expired session." },
  { kind: "gate_refused", what: "The human gate refused a request with no valid human session." },
  { kind: "gate_reverify_required", what: "A money- or credential-touching request had a session that was too old." },
  { kind: "machine_lane_denied", what: "Something called a webhook or scheduler path without the credential that lane requires." },
  { kind: "tenant_denied", what: "A request tried to act on a brand that belongs to another account." },
  { kind: "rate_limited", what: "A caller exceeded a route's rate limit." },
  { kind: "injection_flagged", what: "Third-party text contained something that reads as an instruction; it was processed as data and flagged." },
  { kind: "injection_refused", what: "Third-party text contained an unambiguous attempt to instruct the assistant; it was refused." },
  { kind: "payout_refused", what: "A withdrawal was refused by the identity gate, the balance check or the fee guard." },
  { kind: "identity_rejected", what: "An identity submission failed validation." },
  { kind: "disposable_email", what: "A signup used a throwaway mailbox." },
];

export type SecurityEvent = {
  id: string;
  at: string;
  kind: EventKind;
  /** Who — a hashed IP, or a uid when there is one. Never a raw address. */
  actor: string;
  path?: string;
  brandId?: string;
  detail?: string;
};

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

// A bounded ring. A flood must never be able to exhaust memory through the
// module that exists to notice floods — the same mistake the rate limiter made
// once, where the defence was the thing the attack consumed.
const MAX_EVENTS = 5_000;
const events: SecurityEvent[] = [];

const hid = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * Who made this request, as an identifier that is stable but not personal.
 *
 * A raw IP address in a security log is personal data with a retention duty
 * attached; a hash of it counts repeat offenders just as well and cannot be
 * read back into somebody's home connection.
 */
export function actorFor(req: { headers: { get(name: string): string | null } }, uid?: string | null): string {
  if (uid) return `uid:${uid}`;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  return `ip:${hid(ip)}`;
}

export function record(e: Omit<SecurityEvent, "id">): SecurityEvent {
  const full: SecurityEvent = { ...e, id: `se_${hid(`${e.at}|${e.kind}|${e.actor}|${e.path || ""}|${events.length}`)}` };
  events.push(full);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  // Fire-and-forget persistence: a security event must never be able to fail a
  // customer's request. The in-memory ring is what the assessment reads.
  if (adminConfigured && adminDb) {
    void adminDb.collection("security_events").doc(full.id).set(full).catch(() => { /* the ring still has it */ });
  }
  return full;
}

export function recent(withinMs = 60 * 60_000, now: number = Date.now()): SecurityEvent[] {
  const cutoff = now - withinMs;
  return events.filter((e) => new Date(e.at).getTime() >= cutoff);
}

export function __resetSentinel(): void { events.length = 0; }

// ---------------------------------------------------------------------------
// Detection — counted, in a window, with the evidence attached
// ---------------------------------------------------------------------------

export type Response = "block" | "step_up" | "watch";

export type Detection = {
  id: string;
  title: string;
  /** The one thing that decides how loudly this is reported. */
  severity: "critical" | "high" | "medium";
  kind: EventKind;
  actor: string;
  /** How many events of this kind from this actor, in the window. */
  count: number;
  windowMins: number;
  /** The events themselves. A finding you cannot check is a rumour. */
  evidence: SecurityEvent[];
  response: Response;
  why: string;
};

export type Rule = {
  id: string;
  kind: EventKind;
  threshold: number;
  windowMs: number;
  severity: Detection["severity"];
  response: Response;
  title: string;
  why: (count: number, mins: number) => string;
};

/**
 * The rules.
 *
 * Thresholds are set where a normal person's worst day stays below them. Ten
 * failed logins in ten minutes is somebody who cannot find their password;
 * fifty is a list being worked through. Where the honest answer is "we cannot
 * tell those apart", the response is `step_up` — ask for the check again —
 * rather than `block`, because locking out a customer to be safe is still
 * locking out a customer.
 */
export const RULES: Rule[] = [
  {
    id: "credential_stuffing", kind: "auth_failed", threshold: 25, windowMs: 10 * 60_000,
    severity: "critical", response: "block", title: "Credential stuffing",
    why: (n, m) => `${n} invalid sessions from one source in ${m} minutes. A person who has forgotten a password does not produce this shape; a list being worked through does.`,
  },
  {
    id: "tenant_probing", kind: "tenant_denied", threshold: 5, windowMs: 30 * 60_000,
    severity: "critical", response: "block", title: "Probing other accounts' brands",
    why: (n, m) => `${n} attempts to act on brands belonging to other accounts in ${m} minutes. One is a stale tab; five is somebody trying ids.`,
  },
  {
    id: "injection_campaign", kind: "injection_refused", threshold: 3, windowMs: 60 * 60_000,
    severity: "critical", response: "block", title: "Repeated prompt-injection attempts",
    why: (n, m) => `${n} pieces of content in ${m} minutes carried unambiguous attempts to issue instructions to the assistant — credential exfiltration, forged system turns, guard bypass or payout redirection. Once is a copied-in document. Three is deliberate.`,
  },
  {
    id: "payout_targeting", kind: "payout_refused", threshold: 4, windowMs: 60 * 60_000,
    severity: "critical", response: "block", title: "Repeated refused withdrawals",
    why: (n, m) => `${n} withdrawals refused in ${m} minutes. The refusals worked; this is a record of somebody testing where the gate is.`,
  },
  {
    id: "gate_evasion", kind: "gate_refused", threshold: 30, windowMs: 15 * 60_000,
    severity: "high", response: "block", title: "Hammering closed doors",
    why: (n, m) => `${n} requests in ${m} minutes with no valid human session. A browser that lost its session verifies once and continues; this did not.`,
  },
  {
    id: "machine_lane_probing", kind: "machine_lane_denied", threshold: 5, windowMs: 30 * 60_000,
    severity: "high", response: "block", title: "Calling webhook and scheduler paths without credentials",
    why: (n, m) => `${n} calls in ${m} minutes to paths reserved for the scheduler or a signed provider, carrying neither credential. Those paths run agents and spend budget, so they are the ones worth trying.`,
  },
  {
    id: "enumeration", kind: "rate_limited", threshold: 60, windowMs: 15 * 60_000,
    severity: "medium", response: "step_up", title: "Sustained rate limiting",
    why: (n, m) => `${n} rate-limited requests in ${m} minutes. This is as likely to be a broken integration as an attack, so the response is to ask for the check again rather than to shut the caller out.`,
  },
  {
    id: "injection_probing", kind: "injection_flagged", threshold: 8, windowMs: 60 * 60_000,
    severity: "medium", response: "watch", title: "Content that keeps reading like instructions",
    why: (n, m) => `${n} documents in ${m} minutes contained phrasing that reads as an instruction. Each was processed as data, as designed. At this rate it is worth knowing whether it is one customer's template or somebody probing.`,
  },
];

/**
 * Run every rule over the events.
 *
 * Deterministic, side-effect free, and given its inputs rather than reaching for
 * them, so a test can hand it a week of traffic and check exactly what it says.
 */
export function assess(all: SecurityEvent[], now: number = Date.now()): Detection[] {
  const out: Detection[] = [];
  for (const rule of RULES) {
    const cutoff = now - rule.windowMs;
    const inWindow = all.filter((e) => e.kind === rule.kind && new Date(e.at).getTime() >= cutoff);
    const byActor = new Map<string, SecurityEvent[]>();
    for (const e of inWindow) byActor.set(e.actor, [...(byActor.get(e.actor) || []), e]);
    for (const [actor, evs] of byActor) {
      if (evs.length < rule.threshold) continue;
      const mins = Math.round(rule.windowMs / 60_000);
      out.push({
        id: `${rule.id}:${actor}`,
        title: rule.title,
        severity: rule.severity,
        kind: rule.kind,
        actor,
        count: evs.length,
        windowMins: mins,
        // Bounded: the evidence is a sample big enough to check and small enough
        // to read. The count is the full number.
        evidence: evs.slice(-10),
        response: rule.response,
        why: rule.why(evs.length, mins),
      });
    }
  }
  // Loudest first, then biggest.
  const order = { critical: 0, high: 1, medium: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
}

/**
 * What Sentinel is currently doing about one actor.
 *
 * The standing decision, so a guard can act on it without re-running the rules.
 * `clear` is the answer for almost everybody almost always, and saying so
 * plainly matters: a security agent whose default answer is "suspicious" is one
 * nobody reads.
 */
export function standing(actor: string, detections: Detection[]): { response: Response | "clear"; why: string; detections: Detection[] } {
  const mine = detections.filter((d) => d.actor === actor);
  if (mine.length === 0) return { response: "clear", why: "Nothing recorded against this caller.", detections: [] };
  const worst: Response = mine.some((d) => d.response === "block") ? "block"
    : mine.some((d) => d.response === "step_up") ? "step_up" : "watch";
  return { response: worst, why: mine.map((d) => d.why).join(" "), detections: mine };
}

/** The counted summary — every kind, how many, in the last hour. */
export function summary(all: SecurityEvent[], now: number = Date.now()): { kind: EventKind; what: string; count: number }[] {
  const cutoff = now - 60 * 60_000;
  const inWindow = all.filter((e) => new Date(e.at).getTime() >= cutoff);
  return EVENT_KINDS.map((k) => ({ ...k, count: inWindow.filter((e) => e.kind === k.kind).length }));
}

export const SENTINEL_DOCTRINE = [
  "Detection is arithmetic, not judgement. Every finding is a count of events that happened, in a stated window, with the events attached — because a security control that is confidently wrong is worse than none, and you would act on it.",
  "There is no threat score. A number nobody counted is a number nobody can argue with, and this one would decide whether a customer gets locked out.",
  "The AI writes the brief, not the verdict. Reading a confirmed incident and saying what it means is what a model is good at; deciding whether you are under attack is not, and it would call a provider on every failed login to do it badly.",
  "Where the honest answer is 'we cannot tell an attack from a bad integration', the response is to ask for the check again rather than to block. Locking out a customer to be safe is still locking out a customer.",
  "Actors are hashed, never stored as addresses. Counting repeat offenders does not require keeping a record of somebody's home connection.",
];

/** The prompt for the on-demand incident brief. Data in, no instruction from it. */
export function briefPrompt(detections: Detection[]): { system: string; prompt: string } {
  return {
    system: [
      "You are Sentinel, the intrusion-response analyst for MarketWar OS.",
      "You are given DETECTIONS that were produced by counting events. Do not re-decide whether they are real; they are. Explain what they mean for this business and what the operator should do in the next hour, in plain language.",
      "Be specific about what is NOT known. If the evidence cannot distinguish an attack from a misconfigured integration, say so — the operator will act on what you write.",
      "Never invent a number. Use only the counts given.",
    ].join(" "),
    prompt: `Detections:\n${JSON.stringify(detections.map((d) => ({ title: d.title, severity: d.severity, count: d.count, windowMins: d.windowMins, response: d.response, why: d.why })), null, 2)}`,
  };
}
