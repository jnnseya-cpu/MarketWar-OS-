// WHICH LANGUAGE THIS PERSON SHOULD BE SERVED, decided once.
//
// THE DEFECT THIS EXISTS TO END. The platform already detected the device
// language (`navigator.language`, in `frontend/locale-context.tsx`), already
// had a header to carry it (`x-mw-lang`), and already had a gateway hook that
// turns it into AI output in that language. Three working parts, and the chain
// between them was broken in three places at once:
//
//   1. `authedFetch` read the language from `localStorage` ONLY — and nothing
//      writes that key except the manual selector. So a French device that
//      never touched the picker sent NO language header, and every engine
//      answered in English while the context sat there knowing it was French.
//   2. The gateway read `x-mw-lang` and nothing else, so a request that did not
//      come from our own client — or arrived before the client had mounted —
//      carried no language at all, even though every browser sends
//      `Accept-Language` from the device's own settings on every request.
//   3. `LocaleProvider` was mounted in the dashboard layout only, so the entire
//      marketing site was hard-coded `<html lang="en">` with no detection at
//      all.
//
// The same shape of fault as every other one in this repository: a value that
// exists on one side of a boundary and never crosses it. So the resolution
// lives HERE, pure and in `shared/`, and the client, the server and the React
// context all ask the same function rather than each implementing their own
// nearly-identical rule.

/** What this platform is written in, and what it falls back to. */
export const DEFAULT_LOCALE = "en";

/**
 * Where a deliberate choice is kept.
 *
 * Here rather than in the React context, because the context is not the only
 * reader: `authedFetch` is a plain function on no component's render path and
 * needs the same key. Two string literals for one key is how one of them comes
 * to be `mw.locale.v2` and the other silently stops finding anything.
 */
export const LOCALE_KEY = "mw.locale.v1";

/**
 * A usable language code, or "" when the input is not one.
 *
 * Deliberately permissive about FORM (accepts "fr", "fr-FR", "zh-Hans-CN") and
 * strict about CONTENT: anything that is not letters and hyphens is not a
 * language tag, and `*` — which `Accept-Language` uses to mean "anything" — is
 * the absence of a preference rather than a preference for a language called
 * "*".
 */
export function normaliseLocale(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // `*` — which `Accept-Language` uses to mean "anything" — is the absence of a
  // preference rather than a preference for a language called "*". It needs no
  // clause of its own: the pattern below rejects it, and a mutation sweep
  // proved an explicit check was indistinguishable from no check at all.
  // The primary subtag is 2–3 letters; subtags follow after hyphens.
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(s)) return "";
  const [primary, ...rest] = s.split("-");
  // Language lower-case, region upper-case: `FR-fr` and `fr-FR` are the same
  // preference and must not read as two different ones to anything comparing
  // them.
  return [primary.toLowerCase(), ...rest.map((p) => (p.length === 2 ? p.toUpperCase() : p))].join("-");
}

/** Just the language, without region or script. "fr-FR" → "fr". */
export function primaryLanguage(raw: unknown): string {
  const code = normaliseLocale(raw);
  return code ? code.split("-")[0] : "";
}

/** Is this the platform's own language, where no translation is needed? */
export function isDefaultLanguage(raw: unknown): boolean {
  const p = primaryLanguage(raw);
  return p === "" || p === DEFAULT_LOCALE;
}

/**
 * The device's preferred language, read from an `Accept-Language` header.
 *
 * THIS IS THE SIGNAL THAT NEEDS NOTHING FROM US. Every browser sends it on
 * every request, straight from the operating system's language settings, with
 * no JavaScript, no storage and no cooperation from our own client. It is the
 * most reliable device-language signal there is and this platform was ignoring
 * it entirely.
 *
 * Quality values are honoured, because that is what they are for: a header of
 * `en;q=0.5,fr;q=0.9` is a person who would rather read French, and taking the
 * first entry would hand them English.
 */
export function fromAcceptLanguage(header: unknown): string {
  const raw = String(header ?? "").trim();
  if (!raw) return "";
  const parsed = raw
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.split(";").map((p) => p.trim());
      const qParam = params.find((p) => /^q=/i.test(p));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return {
        code: normaliseLocale(tag),
        // A malformed q is not a preference of zero; it is a missing q.
        q: Number.isFinite(q) && q >= 0 && q <= 1 ? q : 1,
        index,
      };
    })
    // q=0 means "explicitly not this one", which is the opposite of a preference.
    .filter((e) => e.code && e.q > 0)
    // Highest quality first; original order breaks a tie, because that order is
    // itself the person's ranking.
    .sort((a, b) => (b.q - a.q) || (a.index - b.index));
  return parsed.length ? parsed[0].code : "";
}

/**
 * The locale to actually use.
 *
 * THE ORDER IS THE WHOLE POINT, and it is this way round deliberately:
 *
 *   • A PERSON'S EXPLICIT CHOICE WINS, always. Somebody who picked English on a
 *     French laptop meant it — they may be the English-speaking owner of a
 *     French-market business. A device language that quietly overrode that
 *     choice would be a setting that will not stay set.
 *   • Otherwise the DEVICE decides, with no action required. That is the
 *     behaviour being asked for: the platform follows the device by default.
 *   • Otherwise English, because something has to be served.
 */
export function effectiveLocale(input: {
  /** A language the person chose deliberately, if any. */
  override?: unknown;
  /** The device's languages, best first — `navigator.languages`, or one code. */
  device?: unknown;
}): string {
  const chosen = normaliseLocale(input.override);
  if (chosen) return chosen;

  const device = Array.isArray(input.device) ? input.device : [input.device];
  for (const candidate of device) {
    const code = normaliseLocale(candidate);
    if (code) return code;
  }
  return DEFAULT_LOCALE;
}

/**
 * The English NAME of a language, for the gateway's `lang` hook.
 *
 * Returns "" for English and for anything unreadable, because the hook's
 * contract is that an absent language means "write in the platform's own
 * language" — and an instruction to "write in English" is a wasted sentence of
 * prompt on every single call.
 */
export function languageNameOf(raw: unknown): string {
  const primary = primaryLanguage(raw);
  // A FAST PATH, not the guarantee: the `/^english$/i` check below is what
  // actually ensures English never produces an instruction (it also catches the
  // name coming back from `Intl` for tags this line cannot predict). This skips
  // an `Intl` construction on the overwhelmingly common case.
  if (!primary || primary === DEFAULT_LOCALE) return "";
  try {
    const name = new Intl.DisplayNames([DEFAULT_LOCALE], { type: "language" }).of(primary);
    // `Intl.DisplayNames` echoes the input back when it knows no name for it,
    // and "write this in fr" is not an instruction any model should be given.
    if (!name || name === primary) return "";
    return /^english$/i.test(name) ? "" : name;
  } catch {
    return "";
  }
}
