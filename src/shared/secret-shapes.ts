// A CREDENTIAL, RECOGNISED BY ITS SHAPE — AND TOLD WHERE IT SHOULD HAVE GONE.
//
// WHAT ALREADY EXISTED, read before this was written. `backend/audit-log.ts` has
// had `looksSecret()` for months: seven value shapes, including Meta's
// `EAA…`, and the audit log redacts on it. The detection was not missing.
//
// THREE THINGS WERE.
//
//   ONE: IT LIVED IN A BACKEND MODULE. A shared module may not import a backend
//   one, so the rule was available to the audit log and to nothing else — not the
//   AI gateway, not a form, not a validator. `api-key-hygiene.ts` says it about
//   itself one file away: "a hygiene rule that lives in one provider's adapter
//   is a rule the next provider does not get."
//
//   TWO: IT SAID "provider key". That is enough to redact and useless to act on.
//   `EAA…` is Meta, `sk_live_` is Stripe, `AIza` is Google, `ghp_` is GitHub, and
//   the remedy — which dashboard to rotate it in — is different for every one.
//
//   THREE: NOTHING STOPPED A SECRET BEING SENT SOMEWHERE. Redacting a log entry
//   protects the log. A credential pasted into an agent field is transmitted to
//   Anthropic or OpenAI and stored in the results ledger, and no amount of
//   redaction afterwards recalls it.
//
// CONFIDENCE IS THE WHOLE DESIGN, AND IT IS WHY THIS IS NOT ONE LIST.
//
//   `certain`  — a vendor PREFIX that nothing else produces. `sk_live_`, `AIza`,
//                `ghp_`, `xoxb-`, `EAA…`, a PEM header, a database URL with a
//                password in it. Safe to REFUSE on, because a false positive is
//                close to impossible.
//   `likely`   — a shape that is usually a secret and sometimes is not. Forty hex
//                characters is a credential — and it is also every git commit
//                SHA in existence. Safe to REDACT on, never to refuse on.
//
// That distinction is the difference between a guard and an obstacle. A platform
// that refuses an agent prompt because it mentions a commit hash has not been
// made more secure; it has been made unusable, and the person will work around
// it in a way nobody can see.

export type SecretConfidence = "certain" | "likely";

export type SecretShape = {
  /** Stable id, used by security events and tests. */
  id: string;
  re: RegExp;
  /** The vendor, named. "provider key" is not an answer anybody can act on. */
  provider: string;
  /** What kind of credential it is. */
  what: string;
  confidence: SecretConfidence;
  /**
   * The environment variable this belongs in, from `ENV_CATALOGUE`, or "" when
   * the platform has no home for it (somebody else's key, pasted by mistake).
   */
  envVar: string;
  /** Where the owner rotates it. Specific enough to follow. */
  rotateAt: string;
};

/**
 * ORDER MATTERS: first match wins, so the specific prefixes sit above the
 * general shapes. `sk_live_…` must be read as Stripe before the generic
 * `sk-…` rule sees it.
 */
export const SECRET_SHAPES: readonly SecretShape[] = [
  {
    id: "pem-private-key",
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    provider: "a private key", what: "private key", confidence: "certain",
    envVar: "FIREBASE_PRIVATE_KEY",
    rotateAt: "Google Cloud → IAM → Service accounts → Keys. Delete the old key after the new one is set.",
  },
  {
    id: "meta-access-token",
    // Meta user and system-user tokens. Long, base64url, and the `EAA` prefix is
    // theirs — it encodes the app id, which is why every one of them starts this
    // way. 60 characters keeps it clear of the `EAA` that occurs inside ordinary
    // base64 payloads, which the first version of this rule did not.
    re: /\bEAA[A-Za-z0-9]{60,}/,
    provider: "Meta (Facebook / Instagram)", what: "Graph API access token", confidence: "certain",
    envVar: "META_CAPI_ACCESS_TOKEN",
    rotateAt: "Meta Business Settings → Users → System Users → the system user → Generate new token, then revoke the old one. Scope `ads_management` for the Conversions API.",
  },
  {
    id: "stripe-secret-key",
    re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/,
    provider: "Stripe", what: "secret API key", confidence: "certain",
    envVar: "STRIPE_SECRET_KEY",
    rotateAt: "dashboard.stripe.com → Developers → API keys → Roll key. A live key that has been pasted anywhere must be rolled, not reused.",
  },
  {
    id: "stripe-webhook-secret",
    re: /\bwhsec_[A-Za-z0-9]{16,}/,
    provider: "Stripe", what: "webhook signing secret", confidence: "certain",
    envVar: "STRIPE_WEBHOOK_SECRET",
    rotateAt: "dashboard.stripe.com → Developers → Webhooks → the endpoint → Roll secret.",
  },
  {
    id: "anthropic-api-key",
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}/,
    provider: "Anthropic", what: "API key", confidence: "certain",
    envVar: "ANTHROPIC_API_KEY",
    rotateAt: "console.anthropic.com → API keys → revoke it and create another.",
  },
  {
    id: "openai-api-key",
    re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
    provider: "OpenAI", what: "API key", confidence: "certain",
    envVar: "OPENAI_API_KEY",
    rotateAt: "platform.openai.com → API keys → revoke it and create another.",
  },
  {
    id: "google-api-key",
    re: /\bAIza[A-Za-z0-9_-]{30,}/,
    provider: "Google", what: "API key", confidence: "certain",
    envVar: "GEMINI_API_KEY",
    rotateAt: "aistudio.google.com → Get API key (or Google Cloud → Credentials) → delete this key and create another.",
  },
  {
    id: "github-token",
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/,
    provider: "GitHub", what: "access token", confidence: "certain",
    envVar: "",
    rotateAt: "github.com → Settings → Developer settings → Personal access tokens → revoke it.",
  },
  {
    id: "slack-token",
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
    provider: "Slack", what: "token", confidence: "certain",
    envVar: "",
    rotateAt: "api.slack.com → your app → OAuth & Permissions → revoke and reinstall.",
  },
  {
    id: "aws-access-key-id",
    re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
    provider: "AWS", what: "access key id", confidence: "certain",
    envVar: "",
    rotateAt: "AWS IAM → the user → Security credentials → deactivate and delete the key.",
  },
  {
    id: "db-url-with-password",
    re: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp)s?:\/\/[^\s:@/]+:[^\s@/]+@/i,
    provider: "a database", what: "connection string with a password in it", confidence: "certain",
    envVar: "",
    rotateAt: "Your database provider's console — rotate the role's password. A URL with the password in it is a credential, however it is labelled.",
  },
  {
    id: "jwt",
    // Three base64url segments. A signed token, and the payload is readable by
    // anybody who has it — which is how a Meta token once arrived INSIDE one.
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    provider: "a signed token (JWT)", what: "signed token", confidence: "certain",
    envVar: "",
    rotateAt: "Whichever service issued it — the `iss` claim in the payload names it. Note that a JWT's payload is NOT encrypted, so anything inside it is exposed too, which is how a Meta access token once arrived wrapped in one.",
  },
  {
    id: "bearer-header",
    re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,
    provider: "an unidentified service", what: "bearer token", confidence: "certain",
    envVar: "",
    rotateAt: "Whichever service issued it — the `Bearer` prefix is the HTTP scheme and says nothing about who minted the token, so check what you were authenticating against and revoke it there.",
  },
  {
    id: "generic-sk-key",
    re: /\bsk-[A-Za-z0-9_-]{20,}/,
    provider: "an unidentified AI provider", what: "API key", confidence: "certain",
    envVar: "",
    rotateAt: "The provider's own dashboard — the `sk-` prefix is shared by several of them, so check which service you created it on and revoke it there.",
  },
  // ---------------------------------------------------------------------------
  // LIKELY, NOT CERTAIN. Redact on these; never refuse on them.
  // ---------------------------------------------------------------------------
  {
    id: "hex-40",
    // A credential — and also every git commit SHA, and a SHA-1 of anything.
    re: /\b[a-f0-9]{40}\b/i,
    provider: "possibly a provider", what: "40 hex characters, which is a key shape and also a git SHA", confidence: "likely",
    envVar: "",
    rotateAt: "If it is a key, the issuing provider's dashboard. If it is a commit hash, nothing needs doing.",
  },
  {
    id: "hex-64",
    re: /\b[a-f0-9]{64}\b/i,
    provider: "possibly a provider", what: "64 hex characters — a key, a secret, or a SHA-256", confidence: "likely",
    envVar: "",
    rotateAt: "If it is a key, the issuing provider's dashboard.",
  },
  {
    id: "opaque-token",
    // A long unbroken base64-ish run with a mix of cases or digits. Anchored to
    // the whole value, so it only fires when the WHOLE field is the token —
    // inside prose it would match half the base64 in the codebase.
    re: /^[A-Za-z0-9_\-+/=.]{40,}$/,
    provider: "unidentified", what: "opaque token", confidence: "likely",
    envVar: "",
    rotateAt: "Whichever service issued it, if it is a credential at all.",
  },
];

export type SecretFinding = {
  shape: SecretShape;
  /** The first six characters of the match, which identifies it without exposing it. */
  prefix: string;
  /** How long the matched run was. Enough to recognise it; not enough to use it. */
  length: number;
};

export const REDACTED = "[redacted]";

/**
 * Every credential shape present in this text.
 *
 * NEVER RETURNS THE SECRET. A finding carries the shape, a six-character prefix
 * and a length — enough for a person to recognise which key it was, and not
 * enough for anybody to use it. A detector that hands back the value it found
 * has moved the problem rather than solved it, and its own error messages become
 * the next place the credential leaks.
 */
export function findSecrets(text: string, opts: { minConfidence?: SecretConfidence } = {}): SecretFinding[] {
  const value = String(text ?? "");
  if (!value) return [];
  const only = opts.minConfidence;
  const out: SecretFinding[] = [];
  const seen = new Set<string>();
  for (const shape of SECRET_SHAPES) {
    if (only === "certain" && shape.confidence !== "certain") continue;
    const m = value.match(shape.re);
    if (!m) continue;
    // One finding per shape. Ten matches of the same shape is one problem with
    // one remedy, and a list of ten is a wall of text that hides the next one.
    if (seen.has(shape.id)) continue;
    seen.add(shape.id);
    out.push({ shape, prefix: m[0].replace(/^Bearer\s+/i, "").slice(0, 6), length: m[0].length });
  }
  return out;
}

/** The first credential in this text, or null. The common case, cheaply. */
export function firstSecret(text: string, opts: { minConfidence?: SecretConfidence } = {}): SecretFinding | null {
  return findSecrets(text, opts)[0] ?? null;
}

/**
 * The same text with every credential replaced.
 *
 * REDACTS ON `likely` TOO, and that asymmetry is deliberate: over-redacting a
 * log costs a line of diagnostics, while under-redacting one puts a live key in
 * a store that outlives the request. The opposite trade applies to refusing,
 * which is why `refuseIfSecret` reads only `certain`.
 */
export function redactSecrets(text: string): string {
  let out = String(text ?? "");
  for (const shape of SECRET_SHAPES) {
    // The anchored opaque-token shape cannot be replaced piecewise; it either is
    // the whole value or it is not.
    if (shape.id === "opaque-token") {
      if (shape.re.test(out)) return `${REDACTED} (opaque token)`;
      continue;
    }
    out = out.replace(new RegExp(shape.re.source, shape.re.flags.includes("i") ? "gi" : "g"),
      `${REDACTED} (${shape.provider})`);
  }
  return out;
}

export type SecretRefusal = {
  /** The sentence to show. Names the provider, the remedy and where it belongs. */
  message: string;
  /** For a security event — no value, only the shape. */
  detail: string;
  finding: SecretFinding;
};

/**
 * Should this text be refused, and what should the person be told?
 *
 * `certain` ONLY. See the header: refusing on a `likely` shape would reject an
 * agent prompt that mentions a commit hash, and a guard people route around is
 * worse than no guard.
 */
/**
 * Is this match obviously a placeholder rather than a credential?
 *
 * WHY IT ONLY AFFECTS REFUSAL. Documentation is pasted into agent fields all the
 * time — "Authorization: Bearer YOUR_TOKEN_HERE", AWS's own
 * `AKIAIOSFODNN7EXAMPLE`, a row of X's. Refusing those teaches people that the
 * guard is noise, and a guard people route around protects nothing. They are
 * still DETECTED, so a log still redacts them; they are simply not a reason to
 * stop the work.
 */
export function looksLikePlaceholder(match: string): boolean {
  const v = match.replace(/^Bearer\s+/i, "");
  if (/YOUR|EXAMPLE|PLACEHOLDER|REPLACE|CHANGEME|TOKEN_HERE|KEY_HERE|SAMPLE|DUMMY|REDACTED|\.\.\./i.test(v)) return true;
  // `xxxxxxxx…`, `aaaaaaaa…`, `00000000…` — a run with almost no distinct
  // characters is not a credential anybody issued.
  const body = v.replace(/^[A-Za-z_-]*[_-]/, "");
  if (body.length >= 12 && new Set(body.toLowerCase()).size <= 2) return true;
  return false;
}

export function refuseIfSecret(text: string, where: string): SecretRefusal | null {
  const value = String(text ?? "");
  const finding = firstSecret(value, { minConfidence: "certain" });
  if (!finding) return null;
  // See `looksLikePlaceholder`: detected, redactable, but not a reason to refuse.
  const matched = value.match(finding.shape.re)?.[0] ?? "";
  if (looksLikePlaceholder(matched)) return null;
  const { shape } = finding;
  const home = shape.envVar
    ? `On this platform it belongs in the environment variable \`${shape.envVar}\`, set in your host's dashboard — never in a field, a prompt or a message.`
    : "It does not belong in any field on this platform.";
  return {
    finding,
    detail: `${shape.id} in ${where} (${finding.length} chars, starts ${finding.prefix}…)`,
    message:
      `That looks like a ${shape.provider} ${shape.what} — ${finding.length} characters starting \`${finding.prefix}…\` — and it was about to be sent in ${where}. `
      + `Nothing was sent. ${home} `
      + `Treat this one as compromised and rotate it: ${shape.rotateAt}`,
  };
}
