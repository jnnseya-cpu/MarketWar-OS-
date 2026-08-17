// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// EMERGENCY STOP — one switch that stops the platform acting on the world.
//
// This platform can send email to real people, publish to real accounts, run
// chains unattended at 3am, and move money. Every one of those paths has its own
// guard, its own budget and its own approval queue, and all of that is correct.
// What did not exist is the thing you reach for when something is wrong and you
// do not yet know what: a single switch that stops all of it now and explains
// itself afterwards.
//
// THE DISTINCTION THAT MAKES THIS SAFE RATHER THAN DANGEROUS.
//
// A stop that swallows a password reset locks the owner out of their own account
// during the incident that made them press it. So a halt applies to lanes that
// REACH OUTSIDE THE PLATFORM ON THE PLATFORM'S OWN INITIATIVE — marketing sends,
// publishing, unattended runs, money out. Transactional mail (password resets,
// receipts, security notices, a payout failure notice) has no lane here, and
// therefore cannot be halted by anything in this file. That is enforced by
// construction rather than by remembering: `LANES` is the exhaustive list of
// what a halt can touch, and transactional mail is not in it.
//
// WHAT A HALT IS NOT. It is not a permission system, not a rate limit and not a
// budget. Those already exist and keep working. This is the pause button.
//
// THE HONEST LIMIT, STATED RATHER THAN HIDDEN.
//
// Without Firebase, a halt lives in one server's memory, so it stops the
// instance that received it and cannot reach the others. `engage()` returns
// whether it persisted and every surface reports that, because an operator who
// believes they have stopped the platform and has not is worse off than one who
// knows the switch is local. Same doctrine as the capability contract: never
// take somebody's effort for an outcome that cannot be delivered.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";

/**
 * The exhaustive list of what a halt can stop. An action not in this list runs
 * during a halt, and that is the point rather than an oversight — see the note
 * on transactional mail above.
 */
export const LANES = ["send", "publish", "autonomous", "spend", "payout"] as const;
export type Lane = (typeof LANES)[number];

export const LANE_MEANING: Record<Lane, string> = {
  send: "Marketing email, outreach sequences and campaign messages to real people. Password resets, receipts and security notices are not in this lane and keep working.",
  publish: "Posting to connected accounts — social publishing, scheduled posts, anything that appears in public under the brand's name.",
  autonomous: "Work the platform starts on its own: scheduled chains, autopilot cycles, overnight jobs. Anything a person clicks in front of them still runs.",
  spend: "Money going out to providers on the platform's initiative — ad spend and paid distribution.",
  payout: "Creator and partner payouts leaving the account.",
};

/** Everything. What the button means when somebody presses it in a hurry. */
export const ALL_LANES: Lane[] = [...LANES];

export type Halt = {
  /** The brand it covers, or "*" for the whole platform. */
  scope: string;
  lanes: Lane[];
  /** Required. A halt nobody can explain at 3am is a halt nobody dares release. */
  reason: string;
  engagedBy: string;
  engagedAt: string;
  releasedBy?: string;
  releasedAt?: string;
  releaseNote?: string;
};

export const PLATFORM = "*";

const COLLECTION = "emergency_stops";
const useDb = () => adminConfigured && Boolean(adminDb);

// Live halts by scope, plus the full history. The history is additive — a
// released halt is kept, because "what did we stop, when, and why" is the whole
// value of the switch after the incident is over.
const live = new Map<string, Halt>();
const log: Halt[] = [];

/**
 * The last state we successfully read, whatever its source.
 *
 * A transient Firestore failure must not silently un-halt the platform, and it
 * must not halt a platform that was running either. So a read error falls back
 * to the last thing we actually knew rather than guessing in either direction.
 */
let lastKnownGood: { at: number; scopes: Map<string, Halt> } = { at: 0, scopes: new Map() };

function noteKnownGood(): void {
  lastKnownGood = { at: Date.now(), scopes: new Map(live) };
}

export type EngageInput = {
  scope?: string;
  lanes?: Lane[];
  reason: string;
  engagedBy: string;
  nowISO?: string;
};

export type EngageResult =
  | { ok: false; error: string }
  | { ok: true; halt: Halt; persisted: boolean; note: string };

/** Stop the platform acting. Everything by default — that is what the button means. */
export async function engage(input: EngageInput): Promise<EngageResult> {
  const scope = (input.scope || PLATFORM).trim() || PLATFORM;
  const reason = (input.reason || "").trim();
  const engagedBy = (input.engagedBy || "").trim();
  if (reason.length < 8) {
    return { ok: false, error: "A reason of at least 8 characters is required. A halt nobody can explain later is a halt nobody dares release." };
  }
  if (!engagedBy) return { ok: false, error: "engagedBy required — a halt is an act, and an act has an author." };

  const requested = input.lanes && input.lanes.length ? input.lanes : ALL_LANES;
  const lanes = ALL_LANES.filter((l) => requested.includes(l));
  if (!lanes.length) return { ok: false, error: `No known lane requested. Known lanes: ${LANES.join(", ")}.` };

  const halt: Halt = {
    scope,
    lanes,
    reason,
    engagedBy,
    engagedAt: input.nowISO || new Date().toISOString(),
  };

  live.set(scope, halt);
  log.push(halt);
  noteKnownGood();

  let persisted = false;
  if (useDb()) {
    try {
      await adminDb!.collection(COLLECTION).doc(scope.replace(/\//g, "_")).set(halt);
      persisted = true;
    } catch {
      persisted = false;
    }
  }

  return {
    ok: true,
    halt,
    persisted,
    note: persisted
      ? "Halted across every server."
      : "Halted on this server only — nothing is saved, so other instances of the platform are still running. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY for a halt that reaches all of them.",
  };
}

export type ReleaseResult =
  | { ok: false; error: string }
  | { ok: true; released: Halt; persisted: boolean };

/** Start acting again. Requires a note, for the same reason engaging requires a reason. */
export async function release(input: { scope?: string; releasedBy: string; note: string; nowISO?: string }): Promise<ReleaseResult> {
  const scope = (input.scope || PLATFORM).trim() || PLATFORM;
  const releasedBy = (input.releasedBy || "").trim();
  const note = (input.note || "").trim();
  if (!releasedBy) return { ok: false, error: "releasedBy required." };
  if (note.length < 8) return { ok: false, error: "A note of at least 8 characters is required — what changed since the halt." };

  const current = await currentHalt(scope);
  if (!current) return { ok: false, error: `Nothing is halted for scope "${scope}".` };

  const released: Halt = {
    ...current,
    releasedBy,
    releasedAt: input.nowISO || new Date().toISOString(),
    releaseNote: note,
  };

  live.delete(scope);
  log.push(released);
  noteKnownGood();

  let persisted = false;
  if (useDb()) {
    try {
      await adminDb!.collection(COLLECTION).doc(scope.replace(/\//g, "_")).delete();
      persisted = true;
    } catch {
      persisted = false;
    }
  }
  return { ok: true, released, persisted };
}

/** The halt in force for a scope, if any. Reads through to storage so a halt set on another server is seen here. */
export async function currentHalt(scope: string): Promise<Halt | null> {
  const localOnly = live.get(scope) || null;
  if (!useDb()) return localOnly;
  try {
    const doc = await adminDb!.collection(COLLECTION).doc(scope.replace(/\//g, "_")).get();
    const stored = doc.exists ? (doc.data() as Halt) : null;
    if (stored) live.set(scope, stored);
    else if (localOnly && !live.has(scope)) live.delete(scope);
    else if (!stored) live.delete(scope);
    noteKnownGood();
    return stored || null;
  } catch {
    // Storage is unreachable. Answer with the last thing we actually knew rather
    // than inventing either a halt or a green light.
    return lastKnownGood.scopes.get(scope) || localOnly;
  }
}

export type HaltDecision =
  | { halted: false }
  | { halted: true; scope: string; lane: Lane; reason: string; engagedBy: string; engagedAt: string; message: string };

/**
 * May this lane act for this brand right now?
 *
 * A platform-wide halt covers every brand — checked first, because the whole
 * point of the platform scope is that nobody has to enumerate brands during an
 * incident.
 */
export async function haltFor(lane: Lane, brandId?: string): Promise<HaltDecision> {
  const scopes = [PLATFORM, ...(brandId ? [brandId] : [])];
  for (const scope of scopes) {
    const h = await currentHalt(scope);
    if (h && h.lanes.includes(lane)) {
      return {
        halted: true,
        scope,
        lane,
        reason: h.reason,
        engagedBy: h.engagedBy,
        engagedAt: h.engagedAt,
        message:
          scope === PLATFORM
            ? `Everything is paused platform-wide. ${h.engagedBy} stopped it at ${h.engagedAt}: "${h.reason}". Nothing was ${lane === "send" ? "sent" : lane === "publish" ? "published" : lane === "payout" || lane === "spend" ? "paid" : "run"}.`
            : `This brand is paused. ${h.engagedBy} stopped it at ${h.engagedAt}: "${h.reason}". Nothing was ${lane === "send" ? "sent" : lane === "publish" ? "published" : lane === "payout" || lane === "spend" ? "paid" : "run"}.`,
      };
    }
  }
  return { halted: false };
}

/** Everything currently stopped, for the surface that shows it. */
export async function activeHalts(): Promise<Halt[]> {
  if (!useDb()) return Array.from(live.values());
  try {
    const snap = await adminDb!.collection(COLLECTION).get();
    const rows = snap.docs.map((d) => d.data() as Halt).filter((h) => !h.releasedAt);
    live.clear();
    for (const h of rows) live.set(h.scope, h);
    noteKnownGood();
    return rows;
  } catch {
    return Array.from(lastKnownGood.scopes.values());
  }
}

/** Engaged and released, oldest first. Nothing is removed — the record is the point. */
export function haltHistory(): Halt[] {
  return [...log];
}

export const EMERGENCY_STOP_DOCTRINE = [
  "One switch stops everything the platform does on its own initiative: marketing sends, publishing, unattended runs, spend and payouts.",
  "It never stops transactional mail. A stop that swallows a password reset locks the owner out during the incident that made them press it, so transactional mail has no lane here and cannot be halted by this module at all.",
  "Engaging requires a reason and releasing requires a note. Both are kept. A halt nobody can explain later is a halt nobody dares release.",
  "When storage is unreachable the answer is the last state actually known, never a guess — a transient failure must not silently un-halt a platform, and must not halt a running one either.",
  "Without persistence a halt reaches one server. That is reported every time rather than implied away, because an operator who believes the platform is stopped and is wrong is worse off than one who knows the switch is local.",
];

/** Test seam. Never called by product code. */
export function __resetEmergencyStop(): void {
  live.clear();
  log.length = 0;
  lastKnownGood = { at: 0, scopes: new Map() };
}
