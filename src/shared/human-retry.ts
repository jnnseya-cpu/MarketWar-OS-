// THE MIDDLEWARE'S REMEDY, READ BY SOMEBODY.
//
// THE HOLE THIS CLOSES. src/middleware.ts refuses a money-touching API call with
// a machine-readable remedy — `humanCheckRequired: true`, the `action` needed
// ("verify" or "reverify") and `where` to go — and its own comment states the
// design: "It fails to a CHALLENGE, never a lockout: pages redirect to
// /verify-human with where they were going, APIs answer 403 with what to do
// about it."
//
// Half of that was true. A PAGE navigation redirects and the person passes the
// check and lands back where they were. An API call is a fetch, and no client
// in this codebase had ever read those three fields: `authedFetch` returned the
// 403 like any other error and the screen printed the sentence out of `error`.
// So somebody who filled in a ProfitGuard offer, a GrowthGuard pool and a whole
// reward ladder, then pressed "Publish the mission" sixteen minutes after
// signing in, was told their check was "21 minutes ago" — with no button to
// pass one, no link to the page that could, and a form they would lose if they
// went looking. The control did exactly what /verify-human's own comment says
// it must never do: "a security control that strands a paying customer on a
// dead end has just chosen a different way to lose the account."
//
// This is the client half of that contract. The refusal is recognised, the
// check is run in place, and the original request is sent again — once. The
// person sees a short pause instead of a wall, and nothing they typed moves.
//
// WHAT IS DELIBERATELY NOT DONE:
//   • No automatic redirect to /verify-human. It would pass the check and lose
//     the draft, which is the same dead end with extra steps.
//   • No second retry. A 403 that survives a fresh, passed check is a real
//     refusal; looping would respin the proof-of-work forever against a session
//     that is never going to pass.
//   • No back-dating of the form clock to walk past the 1.2s submission floor.
//     The re-check is automatic, so it waits for real — a control you route
//     around on your own behalf is not a control.

export type HumanRemedy = {
  /** "verify" — no session at all. "reverify" — signed in, but the check is stale. */
  action: "verify" | "reverify";
  /** The server's own sentence. Shown as-is; it already says what happened. */
  reason: string;
  /** The page that can issue a fresh check. Always a path on this site. */
  where: string;
};

export type HumanRetryOutcome = { ok: boolean; error?: string };

/**
 * Is this refusal the human gate asking for a check, or an ordinary 403?
 *
 * Shape-checked rather than assumed. A 403 from a brand-ownership refusal must
 * never trigger a proof-of-work the person cannot benefit from.
 */
export function humanRemedyFrom(status: number, body: unknown): HumanRemedy | null {
  if (status !== 403) return null;
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.humanCheckRequired !== true) return null;
  const reason = typeof b.error === "string" && b.error.trim()
    ? b.error.trim()
    : "This action needs a human check before it can run.";
  const where = typeof b.where === "string" && b.where.startsWith("/") && !b.where.startsWith("//")
    ? b.where
    : "/verify-human";
  return { action: b.action === "reverify" ? "reverify" : "verify", reason, where };
}

/**
 * Can this request body be sent a second time?
 *
 * A stream is consumed by the first attempt, so retrying it would post an empty
 * body — a mission published with no reward ladder is worse than a refusal.
 * Everything else the platform sends (JSON strings, FormData, URLSearchParams,
 * blobs) re-sends intact.
 */
export function replayable(body: unknown): boolean {
  if (body === undefined || body === null) return true;
  if (typeof body === "string") return true;
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) return false;
  return true;
}

/** What the person is told when the in-place check could not be passed. */
export function blockedMessage(remedy: HumanRemedy, outcome: HumanRetryOutcome): string {
  const detail = (outcome.error || "").trim();
  return [
    remedy.reason,
    `We tried to run that check here and it did not pass${detail ? `: ${detail}` : "."}`,
    `Open ${remedy.where} in another tab, pass the check there, then come back and press this again — nothing you have typed on this screen is lost.`,
  ].join(" ");
}

/**
 * Send, and if the human gate refuses, pass its check and send once more.
 *
 * `send` and `check` are injected so the whole decision is testable without a
 * browser, a Firebase session or a network — the three things that made this
 * path unverifiable, and therefore the reason it shipped broken.
 */
export async function fetchWithHumanRetry(opts: {
  send: (attempt: 1 | 2) => Promise<Response>;
  check: (remedy: HumanRemedy) => Promise<HumanRetryOutcome>;
  /** False when the body cannot survive a second send. Defaults to true. */
  bodyReplayable?: boolean;
}): Promise<Response> {
  const first = await opts.send(1);
  if (first.status !== 403) return first;

  // Read a COPY: the caller still owns the original body and will want to
  // render the message out of it if this turns out not to be a gate refusal.
  let body: unknown;
  try { body = await first.clone().json(); } catch { return first; }

  const remedy = humanRemedyFrom(first.status, body);
  if (!remedy) return first;

  if (opts.bodyReplayable === false) {
    return refusal(body, remedy, { ok: false, error: "This request cannot be sent twice, so it was not retried automatically." });
  }

  const outcome = await opts.check(remedy);
  if (!outcome.ok) return refusal(body, remedy, outcome);

  const second = await opts.send(2);
  if (second.status !== 403) return second;

  // The check passed and the gate still refused. Say exactly that rather than
  // repeating "your check was 21 minutes ago", which is now untrue.
  try {
    const b2 = await second.clone().json();
    const r2 = humanRemedyFrom(403, b2);
    if (r2) return refusal(b2, r2, { ok: false, error: "the check passed, but this browser did not keep the session it issued" });
  } catch { /* not our JSON — hand back what the server said */ }
  return second;
}

/** The original refusal, with a sentence that has somewhere to go. */
function refusal(body: unknown, remedy: HumanRemedy, outcome: HumanRetryOutcome): Response {
  const base = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return new Response(
    JSON.stringify({ ...base, error: blockedMessage(remedy, outcome), humanCheckRequired: true, action: remedy.action, where: remedy.where }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}
