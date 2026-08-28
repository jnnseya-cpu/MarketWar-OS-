// WHY A PROVIDER SAID NO — and what the person reading it should actually do.
//
// THE DEFECT THIS EXISTS TO REMOVE. A 12-second render failed and the platform
// said: "Confirm your Veo/Sora model access, or set GEMINI_VIDEO_MODEL /
// OPENAI_VIDEO_MODEL to a model your account can use." What OpenAI had actually
// returned, in the same message, three lines above:
//
//   429 insufficient_quota — "You have no credits remaining. Add credits to
//   continue using the API at https://platform.openai.com/…/billing/."
//
// The model was fine. The key was fine. The account was empty. The remedy on
// screen sends the owner to change an environment variable that was never the
// problem, and the one action that fixes it — add credit — is not mentioned. A
// fixed remedy string attached to a variable failure is a guess in the shape of
// an instruction, and this repository has now shipped that shape enough times
// for it to be a defect class rather than an incident.
//
// It is also worse than saying nothing: the reader tries the wrong fix, it does
// not work, and the next honest message from the same screen is discounted.
//
// So: classify from what the provider said, and never name a remedy the failure
// does not support. Where nothing is recognised, pass the provider's own words
// through rather than substituting a confident guess for them.
//
// PURE, and in `shared/` on purpose: the same reading is needed by the render
// gateway (which retries), by a surface (which explains), and by a test (which
// must be able to assert on it without a network).

export type FailureKind =
  | "no_key"          // nothing configured for this provider at all
  | "no_credit"       // the account is out of money or allowance
  | "rate_limited"    // too many requests, right now — nothing is wrong
  | "bad_key"         // the credential is invalid or revoked
  | "no_access"       // valid key, not entitled to this
  | "no_model"        // the model id is wrong, retired, or not on this account
  | "content_refused" // the PROMPT was refused; every provider will refuse it
  | "bad_request"     // malformed call — ours to fix, not the customer's
  | "server"          // their fault, transient
  | "network"         // never reached them
  | "unknown";

export type ProviderFailure = {
  kind: FailureKind;
  /** One sentence: what happened, in the reader's terms. */
  why: string;
  /** The ONE action that fixes it. Empty when there is nothing the reader can do. */
  remedy: string;
  /**
   * Is another provider worth trying with the SAME prompt?
   *
   * A refused prompt is not — every engine has the same answer, and retrying
   * spends a second provider's quota to be told no twice. An empty account is:
   * a different supplier has a different balance. This is the whole difference
   * between a failover chain and a way to fail more expensively.
   */
  tryAnotherProvider: boolean;
  /** The provider's own words, kept. Never replaced by our reading of them. */
  detail: string;
};

/** Trim, collapse and cap. Never let a key ride along inside an error body. */
export function tidyFailureBody(s: string): string {
  return String(s || "")
    .replace(/(key|token|api[_-]?key)=[^&\s"']+/gi, "$1=***")
    .replace(/\b(sk|xi|AIza)[-_A-Za-z0-9]{12,}/g, "***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

const has = (hay: string, ...needles: string[]) => needles.some((n) => hay.includes(n));

/**
 * Read a provider's refusal.
 *
 * `status` is the HTTP status; use 0 for "never reached them" and -1 for
 * "nothing is configured for this provider".
 *
 * ORDER MATTERS, and one case is why: OpenAI returns an empty account as
 * **429 insufficient_quota**, the same status as an ordinary rate limit. A
 * status-first reading calls it "too many requests, try again shortly" — advice
 * that will never come true, because no amount of waiting adds credit. So the
 * body is read for a credit failure BEFORE the status is read for a rate limit.
 */
export function readProviderFailure(input: { provider: string; status: number; body?: string }): ProviderFailure {
  const provider = input.provider || "the provider";
  const detail = tidyFailureBody(input.body || "");
  const b = detail.toLowerCase();
  const at = (what: string) => `${what} on the account this ${provider} key belongs to`;

  if (input.status === -1 || has(b, "missing api key", "no api key")) {
    return {
      kind: "no_key", detail, tryAnotherProvider: true,
      why: `No key is configured for ${provider}, so nothing was sent.`,
      remedy: `Set ${provider}'s API key, or leave it unset and this engine simply will not be offered.`,
    };
  }

  // CREDIT BEFORE RATE LIMIT. See the note above — they share a status code and
  // have opposite remedies.
  if (has(b, "insufficient_quota", "no credits remaining", "exceeded your current quota", "billing_hard_limit", "out of credits", "credit balance is too low", "quota_exceeded")) {
    return {
      kind: "no_credit", detail, tryAnotherProvider: true,
      why: `${provider} refused because the account has no credit or allowance left. The key and the model are both fine.`,
      remedy: `Add credit (or raise the spend limit) ${at("in the provider's billing settings")}. Changing the model or the key will not help — neither is the problem.`,
    };
  }

  if (input.status === 429) {
    return {
      kind: "rate_limited", detail, tryAnotherProvider: true,
      why: `${provider} is rate-limiting this key right now. Nothing is misconfigured.`,
      remedy: "Wait and run it again, or render on another engine — this clears by itself.",
    };
  }

  // A REFUSED PROMPT IS NOT A PROVIDER PROBLEM. Checked before the status
  // buckets because it arrives as a 400 on one engine and a 403 on another, and
  // it is the one failure where trying a second supplier is pure waste.
  if (has(b, "content_policy", "content policy", "safety", "moderation", "prohibited_content", "violates", "blocked by")) {
    return {
      kind: "content_refused", detail, tryAnotherProvider: false,
      why: `${provider} refused the PROMPT, not the request. This is a content decision.`,
      remedy: "Reword the prompt. Every engine applies a policy of its own, so another one will almost certainly refuse it too — trying them all just spends more quota to be told no again.",
    };
  }

  if (has(b, "model_not_found", "does not exist", "not found for api version", "unsupported model", "no access to model") || input.status === 404) {
    return {
      kind: "no_model", detail, tryAnotherProvider: true,
      why: `${provider} does not recognise the model this deployment asked for, or this account cannot use it.`,
      remedy: `Set the model environment variable for ${provider} to one your account can access.`,
    };
  }

  if (input.status === 401) {
    return {
      kind: "bad_key", detail, tryAnotherProvider: true,
      why: `${provider} rejected the credential itself.`,
      remedy: `Generate a new ${provider} key and replace it. Check its PERMISSIONS as well as its value — a key with the wrong scopes fails exactly like a wrong one.`,
    };
  }

  if (input.status === 403) {
    return {
      kind: "no_access", detail, tryAnotherProvider: true,
      why: `The ${provider} key is valid but is not entitled to this.`,
      remedy: `Enable this API (and its billing) ${at("for the project or organisation")}. A new key will fail the same way.`,
    };
  }

  if (input.status >= 500) {
    return {
      kind: "server", detail, tryAnotherProvider: true,
      why: `${provider} failed on its own side (HTTP ${input.status}).`,
      remedy: "Nothing to change here — run it again, or render on another engine.",
    };
  }

  if (input.status === 0) {
    return {
      kind: "network", detail, tryAnotherProvider: true,
      why: `${provider} was never reached.`,
      remedy: "Check outbound network access from this deployment, then run it again.",
    };
  }

  if (input.status === 400) {
    return {
      kind: "bad_request", detail, tryAnotherProvider: false,
      why: `${provider} rejected the shape of the request. That is ours to fix, not yours.`,
      remedy: "",
    };
  }

  // NOT A GUESS. An unrecognised refusal keeps the provider's own words and
  // offers no remedy, because inventing one is how this file's defect started.
  return {
    kind: "unknown", detail, tryAnotherProvider: true,
    why: `${provider} refused with HTTP ${input.status}${detail ? `: ${detail}` : " and gave no reason"}.`,
    remedy: "",
  };
}

/** One line for a surface: what happened, then the single thing to do about it. */
export function failureLine(f: ProviderFailure): string {
  return [f.why, f.remedy].filter(Boolean).join(" ");
}
