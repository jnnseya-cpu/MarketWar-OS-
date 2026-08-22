// MAY WE LEARN FROM YOUR WORK? (§89)
//
// A workspace-level switch for whether a customer's content may be used to
// improve the platform. Three things about it are not negotiable.
//
//   1. IT IS OFF UNTIL SOMEBODY TURNS IT ON. Not "on by default with an opt-out
//      in the settings" — a default that takes somebody's work is taking it. The
//      absence of a recorded decision is a NO, and it is reported as "never
//      asked" rather than as a refusal, because those are different and the
//      difference decides whether it is worth asking.
//   2. IT IS ENFORCED AT THE POINT OF USE. `mayUseForTraining` is the only
//      answer, and it is a function rather than a flag on a record so that
//      forgetting to consult it is a missing call rather than a stale boolean.
//   3. TURNING IT OFF CANNOT UNDO WHAT IS ALREADY DONE, AND SAYS SO. Anything
//      already used is already used. Pretending otherwise is a promise that
//      cannot be kept, and this platform does not take somebody's effort for an
//      outcome it cannot deliver.
//
// Pure and shared, so a settings screen and a backend guard read the same rules.

export type ConsentState = "never_asked" | "granted" | "refused" | "withdrawn";

export type ConsentRecord = {
  workspaceId: string;
  state: ConsentState;
  /** Who decided, and when. Absent while nobody has been asked. */
  decidedBy?: string;
  decidedAt?: string;
  /** Set the first time it was ever granted — the boundary of what may already have been used. */
  firstGrantedAt?: string;
  /** Set when a grant is withdrawn. */
  withdrawnAt?: string;
};

export type Decision = {
  allowed: boolean;
  state: ConsentState;
  /** Plain reason, suitable for a log and for a person. */
  reason: string;
};

export function initialConsent(workspaceId: string): ConsentRecord {
  return { workspaceId, state: "never_asked" };
}

/**
 * The only answer to "may we use this".
 *
 * Every state except an active grant is a no, and each no says which kind it is
 * — a workspace that has never been asked is a conversation worth having, and a
 * workspace that refused is not.
 */
export function mayUseForTraining(record: ConsentRecord | null | undefined): Decision {
  const state = record?.state ?? "never_asked";
  switch (state) {
    case "granted":
      return { allowed: true, state, reason: `Granted${record?.decidedAt ? ` on ${record.decidedAt.slice(0, 10)}` : ""}${record?.decidedBy ? ` by ${record.decidedBy}` : ""}.` };
    case "refused":
      return { allowed: false, state, reason: "This workspace was asked and said no. Do not ask again inside the product." };
    case "withdrawn":
      return { allowed: false, state, reason: `Consent was withdrawn${record?.withdrawnAt ? ` on ${record.withdrawnAt.slice(0, 10)}` : ""}. Nothing from this workspace may be used from that point on.` };
    default:
      return { allowed: false, state: "never_asked", reason: "Nobody has been asked, so the answer is no. Absence of a decision is not permission." };
  }
}

export type SetResult =
  | { ok: false; error: string }
  | { ok: true; record: ConsentRecord; note: string; irreversible?: string };

export function setConsent(
  record: ConsentRecord,
  next: "granted" | "refused" | "withdrawn",
  opts: { by: string; at: string },
): SetResult {
  const by = String(opts.by || "").trim();
  if (!by) return { ok: false, error: "A consent decision has to be attributed to somebody. An unattributed change to who may use a customer's work is not a decision, it is an edit." };

  if (next === "withdrawn" && record.state !== "granted") {
    return { ok: false, error: "There is nothing to withdraw — this workspace has not granted consent." };
  }
  if (next === record.state) {
    return { ok: false, error: `Already ${next}.` };
  }

  const updated: ConsentRecord = {
    ...record,
    state: next,
    decidedBy: by,
    decidedAt: opts.at,
    firstGrantedAt: next === "granted" ? (record.firstGrantedAt || opts.at) : record.firstGrantedAt,
    withdrawnAt: next === "withdrawn" ? opts.at : record.withdrawnAt,
  };

  if (next === "withdrawn") {
    return {
      ok: true,
      record: updated,
      note: "Nothing from this workspace will be used from now on.",
      // The honest part. Saying "we have deleted it from the model" would be a
      // promise nobody can keep.
      irreversible: record.firstGrantedAt
        ? `Work used between ${record.firstGrantedAt.slice(0, 10)} and today cannot be taken back out of anything already trained on it. What stops here is future use.`
        : "What stops here is future use.",
    };
  }

  return {
    ok: true,
    record: updated,
    note: next === "granted"
      ? "Thank you — future work in this workspace may be used to improve the platform. This can be withdrawn at any time."
      : "Recorded. Nothing from this workspace will be used, and you will not be asked again inside the product.",
  };
}

export const CONSENT_DOCTRINE = [
  "Off until somebody turns it on. A default that takes somebody's work is taking it, and the absence of a decision is not permission.",
  "'Never asked' and 'refused' are different answers and are reported differently — one is a conversation worth having and the other is not.",
  "Enforcement is a function call, not a flag on a record, so forgetting to check is a missing call rather than a stale boolean.",
  "A decision must be attributed. An unattributed change to who may use a customer's work is an edit, not a decision.",
  "Withdrawing stops future use and says plainly what it cannot undo. Claiming otherwise is a promise nobody can keep.",
];
