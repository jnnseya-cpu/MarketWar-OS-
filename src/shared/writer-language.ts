// WHAT LANGUAGE DOES THIS BRAND WRITE TO ITS CUSTOMERS IN?
//
// THE DEFECT THIS CLOSES, reported from the live platform. A brand selling in
// Kinshasa to francophone merchants asked the writer for a campaign email and
// got English — while the owner's own hand-written version, in French, was
// incomparably better. Two causes, and they compounded:
//
//   1. Both writers opened their system prompt with the words "British English".
//      A hard-coded language in the instruction that is supposed to be neutral.
//   2. The only language input either of them had was `gatewayLangFrom(req)`,
//      which reads the `x-mw-lang` HEADER — the language of the BROWSER the
//      sender happens to be using. So the language of the email was decided by
//      the UI language of the person pressing the button, not by the market it
//      was being sent to. An operator on an English laptop could never produce a
//      French campaign, however francophone their list.
//
// Those are the same boundary defect twice: the brand knows who it sells to and
// nothing carried that to the writer.
//
// WHY THIS IS NOT INFERRED FROM THE COUNTRY. "Location: DRC, therefore French"
// is a guess, and it is wrong often enough to matter — countries hold several
// languages, and a business may sell across borders or deliberately write in a
// second one. Guessing the language you address customers in is exactly the
// class of guess this platform refuses to make on somebody's behalf. So the
// brand STATES it, once, and every writer reads the same answer.

/** The languages offered as one-click choices. `""` means "not stated". */
export const WRITER_LANGUAGES: { code: string; name: string; label: string }[] = [
  { code: "", name: "", label: "Not set — ask before writing" },
  { code: "en", name: "English", label: "English" },
  { code: "fr", name: "French", label: "Français — French" },
  { code: "es", name: "Spanish", label: "Español — Spanish" },
  { code: "pt", name: "Portuguese", label: "Português — Portuguese" },
  { code: "ar", name: "Arabic", label: "العربية — Arabic" },
  { code: "sw", name: "Swahili", label: "Kiswahili — Swahili" },
  { code: "de", name: "German", label: "Deutsch — German" },
  { code: "it", name: "Italian", label: "Italiano — Italian" },
  { code: "nl", name: "Dutch", label: "Nederlands — Dutch" },
];

/**
 * The English NAME of a language, from a code or a name.
 *
 * Accepts what a person or a stored record might plausibly hold — "fr",
 * "fr-CD", "French", "français" — because the value arrives from a select, from
 * a header, and from a brand record written at different times, and a language
 * that fails to resolve silently reverts the email to English.
 */
export function languageName(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const base = v.toLowerCase().split(/[-_]/)[0];

  const byCode = WRITER_LANGUAGES.find((l) => l.code && l.code === base);
  if (byCode) return byCode.name;

  const byName = WRITER_LANGUAGES.find((l) => l.name && l.name.toLowerCase() === v.toLowerCase());
  if (byName) return byName.name;

  // Anything else the platform can name. `Intl.DisplayNames` throws on a
  // malformed tag, so a bad value must never take the caller down with it.
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(base);
    // It echoes the input back when it does not know the tag; that is not a name.
    if (name && name.toLowerCase() !== base) return name;
  } catch { /* not a language tag */ }

  // A name we do not have a code for is still usable as an instruction.
  return /^[\p{L} ]{3,30}$/u.test(v) ? v : "";
}

/**
 * The language a piece of customer-facing copy should be written in.
 *
 * PRECEDENCE, AND EVERY STEP OF IT IS DELIBERATE:
 *   1. `explicit`  — what the customer chose for THIS email. Their most recent
 *                    instruction always wins.
 *   2. `brand`     — the language this brand sells in, stated once on the brand.
 *                    This is the one that fixes the reported defect.
 *   3. `request`   — the browser header, which is a hint about the OPERATOR and
 *                    is therefore the weakest signal, not the strongest. It is
 *                    kept only so that nothing which worked before stops working.
 *   4. ""          — nothing stated. The caller writes in English and SAYS so,
 *                    rather than a writer silently picking one.
 */
export function writerLanguage(input: {
  explicit?: unknown;
  brand?: unknown;
  request?: unknown;
}): string {
  return languageName(input.explicit) || languageName(input.brand) || languageName(input.request) || "";
}

/**
 * The line that goes in a system prompt.
 *
 * Returns "" for English and for "not stated", because the gateway already
 * appends its own instruction for a non-English target and two instructions
 * saying the same thing is how a prompt starts contradicting itself. What this
 * replaces is the hard-coded "British English" that used to sit in both writers
 * and override everything after it.
 */
export function languageInstruction(language: string): string {
  const name = languageName(language);
  if (!name || /^english$/i.test(name)) return "";
  return `Write EVERYTHING — subject, heading, body and button — in ${name}, as a native speaker of ${name} writes to a customer. Not a translation of an English email: the idiom, the courtesy conventions and the sentence rhythm must be ${name}. Keep proper nouns, product names, and URLs exactly as supplied.`;
}
