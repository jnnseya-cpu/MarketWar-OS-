// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Weekly visibility runs, and an alert only when something actually moved.
//
// Action 7 of every plan says "re-run this weekly and judge the trend, not the
// run". Nothing made that happen, so it was advice the customer had to remember
// — which means it does not happen. This runs it.
//
// THE ALERT RULE, which is the entire design. These models are not
// deterministic: the same six questions return different companies an hour
// later. So an alert on every change would fire every week regardless of
// anything the customer did, and a notification that always fires is one nobody
// reads. The alert is therefore gated on the SAME noise floor the trend line
// uses — if the movement is within what the models do on their own, no alert is
// sent, and the run is still recorded so the history keeps building.
//
// Weekly, not daily, for the same reason. Daily runs of a non-deterministic
// measurement cost real money to produce a noisier line.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { listRuns, trend, type VisibilityRun } from "@/backend/ai-visibility";

const COLLECTION = "ai_visibility_schedules";
const mem = new Map<string, VisibilitySchedule>();

export type VisibilitySchedule = {
  brandId: string;
  enabled: boolean;
  /** Days between runs. Floored at 7 — see the note above about noise. */
  cadenceDays: number;
  /** The questions to keep asking. Changing them breaks comparability. */
  questions: string[];
  business: string;
  domain?: string;
  lastRunAt: string | null;
  /** Where to send an alert. Empty = record it in the app only. */
  notifyEmail?: string;
  updatedAt: string;
};

export const MIN_CADENCE_DAYS = 7;

const nowIso = () => new Date().toISOString();

function fresh(brandId: string): VisibilitySchedule {
  return {
    brandId, enabled: false, cadenceDays: MIN_CADENCE_DAYS, questions: [],
    business: "", lastRunAt: null, updatedAt: nowIso(),
  };
}

export async function getSchedule(brandId: string): Promise<VisibilitySchedule> {
  const id = (brandId || "").trim();
  if (!id) return fresh("");
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as VisibilitySchedule) : fresh(id);
  }
  return mem.get(id) ?? fresh(id);
}

export async function setSchedule(brandId: string, patch: Partial<VisibilitySchedule>): Promise<VisibilitySchedule> {
  const cur = await getSchedule(brandId);
  const next: VisibilitySchedule = {
    ...cur,
    ...patch,
    brandId,
    // Floored rather than rejected: a customer asking for daily gets weekly and
    // is told why, instead of an error they have to decode.
    cadenceDays: Math.max(MIN_CADENCE_DAYS, Math.round(patch.cadenceDays ?? cur.cadenceDays)),
    updatedAt: nowIso(),
  };
  if (adminConfigured && adminDb) await adminDb.collection(COLLECTION).doc(brandId).set(next, { merge: true });
  else mem.set(brandId, next);
  return next;
}

export function isDue(s: VisibilitySchedule, nowMs = Date.now()): boolean {
  if (!s.enabled || !s.questions.length || !s.business) return false;
  if (!s.lastRunAt) return true;
  const last = Date.parse(s.lastRunAt);
  if (Number.isNaN(last)) return true;
  return nowMs - last >= s.cadenceDays * 86_400_000;
}

export async function listEnabled(): Promise<VisibilitySchedule[]> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection(COLLECTION).where("enabled", "==", true).limit(500).get();
    return snap.docs.map((d) => d.data() as VisibilitySchedule);
  }
  return [...mem.values()].filter((s) => s.enabled);
}

// ---------------------------------------------------------------------------
// The alert
// ---------------------------------------------------------------------------

export type VisibilityAlert = {
  brandId: string;
  brand: string;
  direction: "up" | "down";
  delta: number;
  rate: number;
  previousRate: number;
  /** Rivals that appeared this run and not the one before. */
  newRivals: string[];
  subject: string;
  body: string;
};

/**
 * Should this run wake anyone up?
 *
 * Only when the trend engine itself calls the move real. That engine already
 * refuses to call a swing a trend when it is inside the noise these models
 * generate on their own, and reusing it means the alert and the number on the
 * page can never disagree — which is the failure this codebase keeps having to
 * fix elsewhere.
 */
export function alertFor(runs: VisibilityRun[]): VisibilityAlert | null {
  const usable = runs.filter((r) => r.askedCount > 0);
  if (usable.length < 2) return null;
  const t = trend(usable);
  if (t.direction !== "up" && t.direction !== "down") return null;

  const [latest, previous] = usable;
  const prevNames = new Set(previous.topCompetitors.map((c) => c.name.toLowerCase()));
  const newRivals = latest.topCompetitors
    .filter((c) => !prevNames.has(c.name.toLowerCase()))
    .map((c) => c.name)
    .slice(0, 5);

  const dir = t.direction === "up" ? "up" : "down";
  return {
    brandId: latest.brandId,
    brand: latest.brand,
    direction: dir,
    delta: t.delta,
    rate: latest.visibilityRate,
    previousRate: previous.visibilityRate,
    newRivals,
    subject: `${latest.brand}: AI visibility ${dir} ${Math.abs(t.delta)} points`,
    body: [
      `${latest.brand} was named in ${latest.mentioned} of ${latest.askedCount} AI answers this week (${latest.visibilityRate}%), against ${previous.visibilityRate}% last time.`,
      "",
      t.note,
      "",
      newRivals.length ? `New in the answers this week: ${newRivals.join(", ")}.` : "No new companies appeared in the answers.",
      "",
      "This alert only fires when the movement is bigger than these models produce on their own. Runs inside that noise are recorded silently — check the trend line rather than waiting for an email.",
    ].join("\n"),
  };
}

/** Every run is recorded; only the ones that moved are worth interrupting someone for. */
export async function alertForBrand(brandId: string): Promise<VisibilityAlert | null> {
  return alertFor(await listRuns(brandId, 12));
}
