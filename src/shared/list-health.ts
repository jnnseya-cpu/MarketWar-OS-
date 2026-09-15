// WHAT IS ACTUALLY IN THIS LIST — counted, never modelled.
//
// WHAT THIS REPLACES, AND WHY IT HAD TO GO.
//
// `backend/email-metrics.ts` computed the Email Command Center's headline
// figures from `seed(brandName)` — an FNV-1a hash of the brand's NAME, bit
// shifted into "1.40–3.79% invalid", "0.50–1.79% disposable", and a projected
// inbox rate printed to three significant figures. The list size was real; every
// ratio applied to it was invented, including on a screen whose own empty state
// promised "computed per brand — never a fake number".
//
// It was labelled "ESTIMATE", and that is not a defence. An estimate implies a
// model with some predictive claim behind it. A hash of a brand's name has no
// information about that brand's mailing list in it at all, and printing 96.8%
// is a precision claim on a number with zero content. CLAUDE.md's
// non-negotiable is exact: no placeholder or faked data inside anything
// represented as finished.
//
// THE REAL NUMBERS WERE ALREADY ON THE SAME SCREEN. The send preview computes
// the true audience with the send's own `filterList` + `suppressedEmails`
// (§116). On the owner's own vault it said 70 sendable of 87 consented — 17
// refused — while the panel above it showed an invented 6 of 88 and a list
// health of 93% against a true 80%. The fabricated figure understated the
// problem by nearly threefold, and list health is precisely the number somebody
// uses to decide whether a list is fit to mail.
//
// So this counts. Pure, so it is tested against constructed lists rather than
// only ever running against whatever the vault happens to hold.

/**
 * One address's hygiene verdict, shaped exactly like `backend/email.ts`'s
 * `EmailVerdict` but declared structurally — a shared module must never import
 * a backend one, and the hygiene rules stay in one place either way.
 */
export type HygieneVerdictLike = {
  email: string;
  checks: { syntax: boolean; disposable: boolean; role: boolean; suppressed: boolean };
  /**
   * Has this contact consented? Defaults to TRUE when absent, matching the
   * preview's `consent !== false`.
   *
   * WITHOUT THIS THE COUNT DISAGREES WITH THE SEND, which is the whole defect
   * being fixed rather than a refinement of it. The send applies consent FIRST
   * and hygiene second; a version that checked only hygiene would report a
   * non-consented contact as mailable and print a larger sendable figure than
   * the button underneath it. Caught by driving the module harness, whose vault
   * deliberately contains one contact with `consent: false`.
   */
  consented?: boolean;
};

/** Why an address cannot be mailed. Ordered worst-first; see `reasonFor`. */
export type RefusalReason = "no_consent" | "invalid" | "disposable" | "suppressed" | "role";

export type CompositionRow = {
  label: string;
  count: number;
  kind: "healthy" | "filtered";
  /** Absent on the healthy row. */
  reason?: RefusalReason;
};

export type ListHealth = {
  /** Addresses examined. */
  total: number;
  sendable: number;
  refused: number;
  /**
   * NULL on an empty list rather than 0 or 100.
   *
   * Same rule as the placement report, which refuses to quote an inbox rate when
   * no seed reported (§140), and `eventStats`, which withholds an open rate the
   * ledger cannot support. A health score for nothing is not a health score.
   */
  healthPct: number | null;
  composition: CompositionRow[];
  /** Counts per refusal reason. A reason with none is absent, not a zero row. */
  refusedBy: Partial<Record<RefusalReason, number>>;
  verdict: string;
};

const LABELS: Record<RefusalReason, string> = {
  no_consent: "No consent recorded — not mailable",
  invalid: "Invalid syntax — would hard-bounce",
  disposable: "Disposable / burner domain",
  suppressed: "Suppressed (bounce, complaint or unsubscribe)",
  role: "Role address (info@, sales@) — excluded by default",
};

/**
 * WHY ONE ADDRESS CANNOT BE MAILED, in the SAME PRECEDENCE `validateAddress`
 * uses, so the donut and the send agree about an address that fails two checks
 * at once. Two orderings of the same rule is how a preview and a send come to
 * disagree, which this codebase has already paid for twice.
 *
 * Suppression is passed in rather than read off `checks.suppressed`, because
 * that flag reflects the in-PROCESS ledger while the real one lives in
 * Firestore — the same reason the send and the preview both apply the set
 * separately.
 */
export function reasonFor(v: HygieneVerdictLike, suppressed: ReadonlySet<string>): RefusalReason | null {
  // CONSENT FIRST, because the send applies it first. Ordering it after hygiene
  // would classify a non-consented disposable address as "disposable", and the
  // donut would then disagree with the send about why somebody was dropped.
  if (v.consented === false) return "no_consent";
  if (!v.checks.syntax) return "invalid";
  if (v.checks.disposable) return "disposable";
  if (v.checks.suppressed || suppressed.has(v.email.trim().toLowerCase())) return "suppressed";
  if (v.checks.role) return "role";
  return null;
}

export function listHealth(
  verdicts: readonly HygieneVerdictLike[],
  suppressed: ReadonlySet<string> = new Set(),
): ListHealth {
  const refusedBy: Partial<Record<RefusalReason, number>> = {};
  let sendable = 0;
  for (const v of verdicts) {
    const why = reasonFor(v, suppressed);
    if (why) refusedBy[why] = (refusedBy[why] ?? 0) + 1;
    else sendable++;
  }
  const total = verdicts.length;
  const refused = total - sendable;

  const composition: CompositionRow[] = [
    { label: "Sendable", count: sendable, kind: "healthy" as const },
    ...(["no_consent", "invalid", "disposable", "suppressed", "role"] as RefusalReason[])
      .filter((r) => (refusedBy[r] ?? 0) > 0)
      .map((r) => ({ label: LABELS[r], count: refusedBy[r] as number, kind: "filtered" as const, reason: r })),
  ];

  return {
    total, sendable, refused,
    healthPct: total ? Math.round((sendable / total) * 100) : null,
    composition, refusedBy,
    verdict: !total
      ? "There are no addresses in this list, so there is nothing to score. That is not a health of zero."
      : refused === 0
        ? `All ${total} address(es) pass the hygiene pipeline and can be mailed.`
        : `${sendable} of ${total} can be mailed. ${refused} cannot, and every one of them is a bounce that will not `
          + "happen — but they are also people this list thinks it can reach and cannot.",
  };
}

// ---------------------------------------------------------------------------
// WHAT WAS ACTUALLY SENT — from the event ledger, not a weekday-shaped curve.
//
// The chart this replaces plotted `peakSend * weekdayWeight[dow] * jitter`,
// where the jitter came from the same brand-name hash. It was captioned
// "14-day projection", which is what a forecast is called; a forecast is a claim
// about the future derived from something, and this was derived from the letters
// in a company's name.
// ---------------------------------------------------------------------------

export type SendEventLike = { type: string; at: string };

export type DayPoint = { date: string; label: string; sent: number; failed: number };

export type SendSeries = {
  days: DayPoint[];
  /** TRUE when nothing was sent in the window — the caller must not draw a flat line and call it data. */
  empty: boolean;
  note: string;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Real daily sends and hard failures over the last `days`, ending today.
 *
 * `now` is injected so the series is testable without freezing the clock, and so
 * a caller on a server in one timezone and a reader in another can be given the
 * same window deliberately rather than by accident.
 */
export function sendSeries(events: readonly SendEventLike[], days = 14, now = new Date()): SendSeries {
  const n = Math.max(1, Math.min(90, Math.round(days)));
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const buckets = new Map<string, DayPoint>();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 86_400_000);
    buckets.set(key(d), { date: key(d), label: DOW[d.getUTCDay()], sent: 0, failed: 0 });
  }

  for (const e of events) {
    const t = Date.parse(e.at);
    if (!Number.isFinite(t)) continue;
    const b = buckets.get(key(new Date(t)));
    if (!b) continue;
    if (e.type === "sent") b.sent++;
    // A bounce and a complaint are both "this send did harm rather than good",
    // and they are counted together because separating two numbers that are
    // usually 0 and 0 tells a reader nothing they cannot see in the stat cards.
    else if (e.type === "bounce" || e.type === "complaint") b.failed++;
  }

  const list = [...buckets.values()];
  const total = list.reduce((s, d) => s + d.sent, 0);
  return {
    days: list,
    empty: total === 0,
    note: total === 0
      ? `Nothing has been sent in the last ${n} days, so there is no line to draw. This fills in on its own once a `
        + "campaign goes out — it is the send ledger, not a forecast."
      : `${total} message(s) actually sent in the last ${n} days, counted from the send ledger.`,
  };
}
