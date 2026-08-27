// WHAT THE ENVIRONMENT VARIABLE ACTUALLY CONTAINS.
//
// THE MISDIAGNOSIS THIS EXISTS TO STOP. A provider returns 401, the platform
// says "the key was rejected — regenerate it", the owner regenerates a perfectly
// good key, pastes it in, and gets 401 again. Round and round, for a key that
// was right the whole time and simply arrived with a pair of quotes around it.
//
// It happens because of how keys get into a deployment. People copy from a
// dashboard that includes the surrounding quotes, or from a `.env` line, or from
// a terminal that appends a newline, or from a document that has turned the
// hyphen into an en-dash. Every one of those produces a value that is not the
// key, and every one of them looks identical in a dashboard that renders the
// variable as ●●●●●●●●.
//
// So before any provider failure is blamed on the key's VALIDITY, this checks
// its SHAPE — and the fix, where there is one, is applied rather than merely
// reported, because a platform that knows the value has a trailing newline and
// sends it anyway is choosing to fail.
//
// Pure and shared: every provider key in this platform goes through the same
// door, and a hygiene rule that lives in one provider's adapter is a rule the
// next provider does not get.

export type KeyIssue =
  | "surrounding-quotes"
  | "leading-or-trailing-whitespace"
  | "internal-whitespace"
  | "non-ascii"
  | "looks-like-assignment"
  | "placeholder";

export type KeyCheck = {
  /** The value to actually send. Cleaned where cleaning is unambiguous. */
  key: string;
  /** True when the raw value was not the same as what should be sent. */
  changed: boolean;
  issues: KeyIssue[];
  /** One sentence per issue, in the order they were found. */
  notes: string[];
  /** Length of the cleaned key, so a surface can show it without the value. */
  length: number;
};

/** Values people paste in when they mean "not set yet". */
const PLACEHOLDERS = new Set([
  "", "your-api-key", "your_api_key", "yourapikey", "changeme", "change-me",
  "xxx", "xxxx", "todo", "tbd", "none", "null", "undefined", "replace-me", "sk-...", "...",
]);

/**
 * Clean a key and say what was wrong with it.
 *
 * WHAT IT WILL FIX: surrounding quotes, surrounding whitespace, and a
 * `NAME=value` line pasted whole. All three are unambiguous — there is no key
 * on earth whose real value includes its own wrapping quotes.
 *
 * WHAT IT WILL NOT FIX: whitespace or non-ASCII INSIDE the key. Those are
 * reported and left alone, because a space in the middle might be part of the
 * value, and silently deleting a character from a credential is how a working
 * key becomes an unexplainable one.
 */
export function cleanKey(raw: string | undefined | null): KeyCheck {
  const original = String(raw ?? "");
  const issues: KeyIssue[] = [];
  const notes: string[] = [];
  let key = original;

  if (key !== key.trim()) {
    issues.push("leading-or-trailing-whitespace");
    notes.push("The value has whitespace around it — usually a newline from a copy-paste. Removed before sending; fix it at the source so every other reader gets the clean value too.");
    key = key.trim();
  }

  // `SERPER_API_KEY=abc123` pasted whole into the value box.
  const assignment = key.match(/^[A-Z][A-Z0-9_]{2,}\s*=\s*(.+)$/);
  if (assignment) {
    issues.push("looks-like-assignment");
    notes.push("The value looks like a whole `NAME=value` line rather than the value. Using the part after the `=`; set just the value.");
    key = assignment[1].trim();
  }

  // Quotes on BOTH ends, matching. One quote on one end is not a wrapper and is
  // left alone — it might be the key.
  const quoted = key.match(/^(["'`])([\s\S]*)\1$/);
  if (quoted) {
    issues.push("surrounding-quotes");
    notes.push("The value is wrapped in quotes. A dashboard stores the quotes as part of the value, so the provider receives a key it has never seen. Removed before sending.");
    key = quoted[2].trim();
  }

  if (/\s/.test(key)) {
    issues.push("internal-whitespace");
    notes.push("There is whitespace INSIDE the value. Not removed — a character deleted from a credential is worse than one reported — but no provider key contains a space, so this is almost certainly a bad paste.");
  }

  // eslint-disable-next-line no-control-regex
  if (/[^\x20-\x7E]/.test(key)) {
    issues.push("non-ascii");
    notes.push("There is a non-ASCII character in the value — usually a hyphen turned into an en-dash by a document editor, or a smart quote. Not removed, because guessing which character was meant is not something to do to a credential.");
  }

  if (PLACEHOLDERS.has(key.toLowerCase())) {
    issues.push("placeholder");
    notes.push("The value is a placeholder rather than a key.");
  }

  return { key, changed: key !== original, issues, notes, length: key.length };
}

/**
 * Read a key from the environment, cleaned.
 *
 * The one call every provider adapter should use. Returns "" for a placeholder,
 * so "set but meaningless" and "not set" behave identically rather than
 * producing a confident 401 from a value of "changeme".
 */
export function keyFromEnv(value: string | undefined): string {
  const c = cleanKey(value);
  return c.issues.includes("placeholder") ? "" : c.key;
}

/**
 * Does this look like the provider's key format?
 *
 * A SHAPE MISMATCH IS A HINT, NEVER A REFUSAL. Providers change their formats
 * and a platform that refuses to send a key because it does not match a pattern
 * hard-coded months ago is a platform that breaks itself on somebody else's
 * schedule. It is reported beside the failure so the owner can see that the
 * value they pasted was never going to work — and the request is still sent.
 */
export function shapeHint(provider: string, key: string): string | null {
  if (!key) return null;
  const shapes: Record<string, { re: RegExp; looks: string }> = {
    serper: { re: /^[0-9a-f]{40}$/i, looks: "40 hexadecimal characters" },
    anthropic: { re: /^sk-ant-[A-Za-z0-9_-]{20,}$/, looks: "sk-ant-… " },
    openai: { re: /^sk-[A-Za-z0-9_-]{20,}$/, looks: "sk-… " },
    stripe: { re: /^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/, looks: "sk_live_… or sk_test_… " },
  };
  const s = shapes[provider.toLowerCase()];
  if (!s || s.re.test(key)) return null;
  return `This does not look like a ${provider} key, which is normally ${s.looks}. That is a hint rather than a verdict — the request is still sent, because providers change their formats and a platform that refuses on a pattern breaks itself on somebody else's schedule.`;
}
