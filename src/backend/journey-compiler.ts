// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Turn an agent's WRITTEN journey into a runnable one.
//
// The Lead Capture Agent and the Automation Architect both produce a good plan
// — "+1h: Email …", "+6h: WhatsApp …", "Wait 24h → Condition: signed up?" — and
// then the customer has to rebuild it by hand somewhere else. That is the gap
// this closes: parse the plan into the same Workflow shape the Automation Lab
// validates and simulates, so "Activate" becomes a button rather than an
// afternoon.
//
// Parsing prose is inherently lossy, so the design rule here is: NEVER guess
// silently. Anything the parser could not read with confidence comes back in
// `unparsed`, and anything it filled in comes back in `assumptions`. The
// customer reviews a timeline before a single message is sent.

import { MESSAGING_ACTIONS_LIST, type Workflow, type WorkflowStep, type TriggerId, type ActionId } from "@/backend/automation";

export type CompileResult = {
  ok: boolean;
  workflow?: Workflow;
  steps: { atHours: number; channel: string; text: string; source: string }[];
  unparsed: string[];      // lines that looked like steps but could not be read
  assumptions: string[];   // what the compiler filled in, stated plainly
  error?: string;
};

// "+1h", "+6h", "+24h", "+47h", "+2d", "+30 min", "Wait 24h", "Wait 30 min",
// "after 3 days", "Day 2". Written by a model, so several spellings, all common.
const TIME_PATTERNS: { re: RegExp; hours: (m: RegExpMatchArray) => number }[] = [
  { re: /^\s*\+?\s*(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i, hours: (m) => Number(m[1]) },
  { re: /^\s*\+?\s*(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i, hours: (m) => Number(m[1]) / 60 },
  { re: /^\s*\+?\s*(\d+(?:\.\d+)?)\s*(?:d|day|days)\b/i, hours: (m) => Number(m[1]) * 24 },
  { re: /^\s*\+?\s*(\d+(?:\.\d+)?)\s*(?:w|week|weeks)\b/i, hours: (m) => Number(m[1]) * 168 },
];

export function parseDelay(raw: string): number | null {
  const text = raw.trim();
  for (const p of TIME_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      const h = p.hours(m);
      return Number.isFinite(h) && h >= 0 ? h : null;
    }
  }
  // "Wait 24h →" / "after 3 days" / "Day 2"
  const wait = /(?:wait|after|in)\s+(\d+(?:\.\d+)?)\s*(m(?:in(?:ute)?s?)?|h(?:(?:ou)?rs?)?|d(?:ays?)?|w(?:(?:ee)?ks?)?)\b/i.exec(text);
  if (wait) {
    const n = Number(wait[1]);
    const unit = wait[2].toLowerCase();
    if (unit.startsWith("m")) return n / 60;
    if (unit.startsWith("h")) return n;
    if (unit.startsWith("d")) return n * 24;
    if (unit.startsWith("w")) return n * 168;
  }
  const day = /^\s*day\s+(\d+)/i.exec(text);
  if (day) return (Number(day[1]) - 1) * 24;
  return null;
}

// Which channel a step names. Order matters: "WhatsApp" must beat a bare
// mention of "message".
const CHANNEL_PATTERNS: { re: RegExp; channel: string; action: ActionId }[] = [
  { re: /\bwhatsapp\b|\bwa\b/i, channel: "whatsapp", action: "send_whatsapp" },
  { re: /\bsms\b|\btext message\b/i, channel: "sms", action: "send_sms" },
  { re: /\be-?mail\b/i, channel: "email", action: "send_email" },
  { re: /\bcall\b|\bphone\b/i, channel: "call", action: "create_task" },
];

export function parseChannel(raw: string): { channel: string; action: ActionId } | null {
  for (const p of CHANNEL_PATTERNS) if (p.re.test(raw)) return { channel: p.channel, action: p.action };
  return null;
}

// A line is a candidate step if it starts with a time marker or a list bullet
// that contains one.
const STEP_LINE = /^\s*(?:[-*•]|\d+[.)])?\s*(\+?\s*\d+\s*(?:m(?:in(?:ute)?s?)?|h(?:(?:ou)?rs?)?|d(?:ays?)?|w(?:(?:ee)?ks?)?)\b|wait\s+\d+|day\s+\d+)/i;

function cleanText(line: string): string {
  return line
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")             // bullet
    .replace(/^\s*\+?\s*\d+\s*[a-z]+\s*[:—–-]\s*/i, "")  // "+6h: " / "+6h — "
    .replace(/^\s*wait\s+\d+\s*[a-z]*\s*(?:→|->)?\s*/i, "")
    .replace(/^\s*day\s+\d+\s*[:—–-]\s*/i, "")
    .replace(/\*\*/g, "")
    .trim();
}

export function compileJourney(input: {
  text: string;
  name?: string;
  trigger?: TriggerId;
  brandId?: string;
}): CompileResult {
  const raw = (input.text || "").trim();
  if (!raw) return { ok: false, steps: [], unparsed: [], assumptions: [], error: "Nothing to compile — run the agent first." };

  const lines = raw.split(/\r?\n/);
  const parsed: CompileResult["steps"] = [];
  const unparsed: string[] = [];
  const assumptions: string[] = [];

  for (const line of lines) {
    if (!STEP_LINE.test(line)) continue;
    const hours = parseDelay(line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ""));
    if (hours === null) { unparsed.push(line.trim()); continue; }
    const text = cleanText(line);
    const ch = parseChannel(line);
    if (!ch) {
      // A timed step with no channel named is real, but we will not GUESS how
      // to contact someone — that is how a customer ends up SMSing a list that
      // only consented to email.
      unparsed.push(line.trim());
      continue;
    }
    parsed.push({ atHours: hours, channel: ch.channel, text: text || `${ch.channel} message`, source: line.trim() });
  }

  if (!parsed.length) {
    return {
      ok: false, steps: [], unparsed, assumptions,
      error:
        "No runnable steps found. A step needs a time and a channel — for example “+6h: WhatsApp — Stuck on anything?”. " +
        (unparsed.length ? `${unparsed.length} line${unparsed.length === 1 ? "" : "s"} looked close but could not be read.` : ""),
    };
  }

  // Absolute times → the wait/action pairs a Workflow is made of.
  parsed.sort((a, b) => a.atHours - b.atHours);
  const steps: WorkflowStep[] = [];
  let cursor = 0;
  for (const p of parsed) {
    const delta = Math.max(0, p.atHours - cursor);
    if (delta > 0) {
      steps.push({ kind: "wait", delayHours: Number(delta.toFixed(4)), label: `wait ${humanise(delta)}` });
      cursor = p.atHours;
    }
    const action = CHANNEL_PATTERNS.find((c) => c.channel === p.channel)?.action ?? "send_email";
    steps.push({ kind: "action", action, channel: p.channel, detail: p.text });
  }

  // Every journey needs a way out. If the plan did not state one, add it and
  // SAY so — a sequence with no exit is the thing that turns follow-up into
  // harassment.
  const mentionsStop = /\b(stop|opt[- ]?out|unsubscrib|convert|signed up|purchase|reply)\b/i.test(raw);
  steps.push({ kind: "condition", check: "converted_or_opted_out", onFalse: "continue", label: "Stop on conversion or opt-out" });
  if (!mentionsStop) {
    assumptions.push("The plan did not state when to stop, so a stop-on-conversion-or-opt-out check was added. Every journey must be able to end.");
  }

  if (unparsed.length) {
    assumptions.push(`${unparsed.length} line${unparsed.length === 1 ? "" : "s"} could not be turned into a step — most often because no channel was named. They are listed so you can add them yourself rather than having a channel guessed for you.`);
  }

  const workflow: Workflow = {
    id: `jrn_${Date.now().toString(36)}`,
    name: input.name?.trim() || "Journey from the agent",
    trigger: input.trigger || "form_submitted",
    goal: "Convert the enrolled contact, then stop.",
    description: `Compiled from an agent plan: ${parsed.length} timed message${parsed.length === 1 ? "" : "s"} across ${new Set(parsed.map((p) => p.channel)).size} channel(s).`,
    steps,
  };

  return { ok: true, workflow, steps: parsed, unparsed, assumptions };
}

function humanise(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Number(hours.toFixed(1))}h`;
  return `${Math.round(hours / 24)}d`;
}

// How many of the compiled steps are marketing (and therefore subject to the
// frequency cap and consent) versus transactional.
export function messagingStepCount(workflow: Workflow): number {
  return workflow.steps.filter((s) => s.kind === "action" && MESSAGING_ACTIONS_LIST.includes(s.action)).length;
}
