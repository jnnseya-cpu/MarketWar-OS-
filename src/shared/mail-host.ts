// IS THIS LOGIN BEING PRESENTED TO THE MAILBOX'S OWN MAIL PROVIDER?
//
// THE QUESTION THAT WENT UNASKED FOR FIVE WEEKS. A `535` at the AUTH stage says
// the server refused the credential. It does NOT say the credential is wrong —
// a mailbox that does not exist on the machine being asked is refused at exactly
// the same stage, with exactly the same code, however many times its password is
// reset somewhere else. Every remedy the diagnostic offered was about the
// password, so that is what got reset, three times, with no change.
//
// The mailbox's provider is a published fact: the MX of the domain in the login
// address. Comparing it with SMTP_HOST costs one DNS lookup and separates "wrong
// password" from "right password, wrong server" — which are the two halves of
// that error and have nothing in common.
//
// This lives in `shared/` with one copy, because the check exists in the health
// report and its test, and a test that carries its own reimplementation of the
// rule proves only that the copy agrees with itself. Mutation testing caught
// exactly that: switching the comparison to exact hostnames left the test green.

/**
 * The registrable part of a hostname — the last two labels.
 *
 * DELIBERATELY NOT AN EXACT MATCH. `smtp.hostinger.com` and `mx1.hostinger.com`
 * are one provider and must not read as a mismatch; `smtp.marketwaros.com`
 * against `mx1.hostinger.com` is the case worth shouting about. Two labels is
 * the right approximation here: this decides whether to show a warning, and the
 * multi-part suffixes it gets wrong (`co.uk`) collapse to the same answer on
 * both sides of the comparison, so they cannot produce a false mismatch between
 * two hosts under one provider.
 */
export function registrableDomain(host: unknown): string {
  const parts = String(host ?? "").trim().toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

/**
 * Does `smtpHost` belong to the same provider as any of these MX exchanges?
 *
 * `null` when there is nothing to compare — no MX published, or no host — because
 * "we cannot tell" and "they do not match" call for different sentences, and
 * collapsing them into `false` would accuse a correct configuration.
 */
export function mailProviderMatches(mxExchanges: string[], smtpHost: unknown): boolean | null {
  const want = registrableDomain(smtpHost);
  const have = (mxExchanges ?? []).map(registrableDomain).filter(Boolean);
  if (!want || !have.length) return null;
  return have.includes(want);
}
