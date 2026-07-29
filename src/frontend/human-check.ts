// Client half of the human check.
//
// Fetches a challenge, solves it in the browser, and exchanges the solution for
// a short-lived token. The puzzle rule lives in @/shared/proof-of-work so this
// and the verifier cannot drift apart.
//
// The work is a fraction of a second on a modern phone. It is deliberately not
// presented as "prove you are human" theatre — the form says what it is doing
// while it does it, and if it cannot do it the person is told plainly rather
// than being left on a dead button.

import { solve } from "@/shared/proof-of-work";

const STORAGE_KEY = "mw_human_token";

export type HumanCheckOutcome =
  | { ok: true; token: string }
  | { ok: false; error: string; retryable: boolean };

export async function runHumanCheck(input: {
  email?: string;
  honeypot?: string;
  /** When the form was rendered — a submit that beats a human hand is not one. */
  mountedAt: number;
  onStage?: (stage: "requesting" | "solving" | "verifying") => void;
}): Promise<HumanCheckOutcome> {
  try {
    input.onStage?.("requesting");
    const cr = await fetch("/api/auth/human", { method: "GET", cache: "no-store" });
    if (!cr.ok) {
      const d = await cr.json().catch(() => ({}));
      return { ok: false, error: d.error || "Could not start the security check. Try again in a moment.", retryable: true };
    }
    const { challenge } = await cr.json();
    if (!challenge?.nonce) return { ok: false, error: "The security check did not load. Reload the page and try again.", retryable: true };

    input.onStage?.("solving");
    const solved = await solve(challenge.nonce, challenge.bits);
    if (!solved) {
      return { ok: false, error: "The security check could not complete on this device. Reload the page and try again.", retryable: true };
    }

    input.onStage?.("verifying");
    const vr = await fetch("/api/auth/human", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challenge, solution: solved.solution,
        elapsedMs: Date.now() - input.mountedAt,
        honeypot: input.honeypot || "",
        email: input.email || "",
      }),
    });
    const d = await vr.json().catch(() => ({}));
    if (!vr.ok) return { ok: false, error: d.error || "The security check did not pass.", retryable: d.retryable !== false };

    try { sessionStorage.setItem(STORAGE_KEY, d.token); } catch { /* private mode — the claim step just re-runs the check */ }
    return { ok: true, token: d.token };
  } catch (e) {
    return { ok: false, error: `The security check could not run: ${(e as Error).message || "network error"}.`, retryable: true };
  }
}

/**
 * Spend the token on the free allowance, once the account exists.
 *
 * Best-effort by design: a failure here must never block someone from getting
 * into the platform they just signed up for. The allowance can be claimed later
 * from the billing page, and the wallet is the record of whether it happened.
 */
export async function claimSignupAllowance(authedFetch: typeof fetch): Promise<{ granted: number } | null> {
  let token = "";
  try { token = sessionStorage.getItem(STORAGE_KEY) || ""; } catch { /* ignore */ }
  if (!token) return null;
  try {
    const r = await authedFetch("/api/auth/human", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } }
    return typeof d.granted === "number" ? { granted: d.granted } : null;
  } catch {
    return null;
  }
}
