// TEXT THAT MUST SURVIVE TRANSLATION UNCHANGED.
//
// The platform is now translatable everywhere — the device's language reaches
// every engine (§186), and the chrome correctly declares itself English so the
// browser offers to translate it. Which creates the opposite problem, and it is
// the dangerous one: **an automatic translation that reaches a machine-readable
// value corrupts it**, and the person reading the screen cannot tell.
//
// THE CASE THAT MADE THIS NECESSARY. The Sending Domains screen prints the DNS
// records a customer must publish to authenticate their mail:
//
//     v=spf1 include:_spf.example.com ~all
//     v=DMARC1; p=none; rua=mailto:dmarc@example.com
//
// Those are not gibberish to a translation engine. `include`, `all` and `none`
// are ordinary English words, and a translated SPF record published into a DNS
// panel is an email domain that silently fails authentication — discovered
// weeks later, as mail landing in spam, by somebody who followed the
// instructions exactly as shown.
//
// The same applies to every environment-variable name, API endpoint, selector,
// identifier and fingerprint the interface shows: they are instructions to a
// machine that happen to be rendered for a person.
//
// HOW IT IS DONE, and why both halves. `translate="no"` is the HTML standard
// attribute and is what Chrome, Edge and Safari honour. The `notranslate` class
// is Google Translate's own long-standing convention, which the Translate
// WIDGET and several other tools read instead. Setting one and not the other
// protects the value from some translators and not others, which is the worst
// outcome: it would look protected.
//
// WHAT THIS IS NOT FOR. Prose. A sentence wrapped in this is a sentence that
// can never be translated for anybody, which is the exact opposite of what the
// platform is for. It marks VALUES — things a person copies, types into
// another system, or compares character by character.

import type { ElementType, ReactNode } from "react";

/**
 * The attributes, for a call site that already renders its own element and
 * only needs to be marked.
 *
 * Spread rather than copied, so there is one definition of "do not translate
 * this" on the platform and a tool added tomorrow can be honoured in one edit.
 */
export const DO_NOT_TRANSLATE = {
  translate: "no",
  className: "notranslate",
} as const;

/** Merge the marker with a call site's own classes without losing either. */
export function verbatimProps(className?: string) {
  return {
    translate: "no" as const,
    className: className ? `notranslate ${className}` : "notranslate",
  };
}

/**
 * A value rendered for a person and read by a machine.
 *
 * `dir="ltr"` is set deliberately and is not decoration: a DNS record, a key
 * name or a URL is left-to-right regardless of the language around it, and
 * inside an Arabic or Hebrew paragraph a bidirectional algorithm will otherwise
 * reorder the punctuation in it — turning `v=spf1 include:_spf.x.com ~all` into
 * something that still looks plausible and no longer works.
 */
export default function Verbatim({
  as: Tag = "span",
  className,
  children,
  title,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <Tag {...verbatimProps(className)} dir="ltr" title={title}>
      {children}
    </Tag>
  );
}
