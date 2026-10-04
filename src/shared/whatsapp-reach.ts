// CAN WE REACH THIS PERSON ON WHATSAPP — AND THE ONE THING NOBODY CAN TELL YOU.
//
// THE CONSTRAINT THAT DECIDES THIS WHOLE FILE. There is no longer any way to ask
// WhatsApp whether a phone number is registered on WhatsApp:
//
//   • the On-Premises API had a `/contacts` endpoint that answered it. From
//     client 2.45.1 it stopped being accurate — it returned "valid" with a
//     WhatsApp ID for every number, registered or not — and the whole
//     On-Premises API was sunset on 23 October 2025.
//   • the Cloud API, which is now the only supported WhatsApp Business API, has
//     no equivalent. There is no endpoint that answers "is this number on
//     WhatsApp".
//
// Products that claim to check it in bulk are driving WhatsApp Web through an
// unofficial wrapper. That breaches WhatsApp's terms, and the account it is done
// from is the one that gets banned — which on this platform would be the
// customer's own business number. So it is not offered here at any price, for
// the same reason bought followers are not.
//
// THEREFORE THIS MODULE NEVER SAYS SOMEBODY IS ON WHATSAPP. It answers a
// narrower question it can actually answer: is this a dialable MOBILE line, and
// what is the compliant way to open a conversation with it. A mobile line is a
// PRECONDITION for WhatsApp, not proof of it, and the difference is stated in
// every verdict rather than quietly dropped.
//
// AND OPT-IN IS NOT OPTIONAL. WhatsApp's Business Messaging Policy requires that
// the person gave you their number AND gave permission to be contacted on
// WhatsApp before any business-initiated message. A found number is not an
// opt-in. So the only one-click action this offers for a number with no opt-in
// on file is a link the PROSPECT follows to start the conversation themselves —
// which is also the only version that works, because an unsolicited template
// message gets the sending number reported and rate-limited.

/** What a number is, as far as anything can tell. */
export type LineType = "mobile" | "landline" | "voip" | "unknown";

export type PhoneValue = {
  /** Digits only, with country code, no plus. The form WhatsApp links use. */
  e164: string;
  /** As it should be shown to a person. */
  display: string;
  lineType: LineType;
  /** Where it came from. `published` means we read it off their own page. */
  provenance: "published" | "provider";
  sourceUrl?: string;
};

/**
 * Dialling codes for the markets this platform actually operates in.
 *
 * DELIBERATELY SHORT. A number without a country code is ambiguous, and the
 * only honest ways to resolve it are to be told the country or to refuse. A
 * lookup table of every country in the world would not make "07700 900123" less
 * ambiguous — it would make a guess look like a fact. `AxionOS` is UK, `VeryX`
 * UK, `KODA` DRC; the rest are here because the platform sells into them.
 */
export const DIALLING_CODES: Record<string, string> = {
  GB: "44", UK: "44", IE: "353", FR: "33", DE: "49", ES: "34", IT: "39",
  NL: "31", BE: "32", PT: "351", PL: "48", US: "1", CA: "1", AU: "61",
  NZ: "64", ZA: "27", NG: "234", KE: "254", GH: "233", CD: "243",
  AE: "971", IN: "91", BR: "55",
};

/**
 * A phone number as E.164 digits, or null when it cannot be known.
 *
 * REFUSES RATHER THAN GUESSES, and that is the whole point. "07700 900123" is a
 * UK mobile, a Dutch landline and several other things depending on a country
 * nobody supplied. Writing a `44` on the front because most of our customers
 * are British would produce a number that dials a real stranger.
 *
 * @param country ISO-2 of the number's own country. Not the customer's country
 *        unless the number is theirs — a UK business's supplier list is full of
 *        numbers that are not UK.
 */
export function toE164(raw: string | null | undefined, country?: string | null): string | null {
  const input = (raw || "").trim();
  if (!input) return null;

  // Already international.
  if (input.startsWith("+")) {
    const digits = input.slice(1).replace(/\D+/g, "");
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  // `00` is the other international prefix, used across Europe.
  const stripped = input.replace(/\D+/g, "");
  if (stripped.startsWith("00")) {
    const digits = stripped.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  const code = country ? DIALLING_CODES[country.trim().toUpperCase()] : undefined;
  if (!code) return null;              // no country, no number — see above

  // A national number conventionally carries a trunk `0` that the country code
  // replaces. North America has no trunk prefix, so it is left alone.
  const national = code === "1" ? stripped : stripped.replace(/^0+/, "");
  if (!national) return null;
  const e164 = `${code}${national}`;
  return e164.length >= 8 && e164.length <= 15 ? e164 : null;
}

/** `+44 7700 900123` from `447700900123`. Grouping is cosmetic; the plus is not. */
export function displayPhone(e164: string): string {
  const d = (e164 || "").replace(/\D+/g, "");
  if (!d) return "";
  return `+${d}`;
}

export type ReachVerdict = {
  /**
   * Whether a WhatsApp conversation is MECHANICALLY possible — a mobile line
   * exists to open one with. NEVER whether the person is on WhatsApp.
   */
  dialable: boolean;
  /** True only for a line type that can carry WhatsApp at all. */
  mobile: boolean;
  /**
   * ALWAYS TRUE, and present so no surface can forget it. WhatsApp requires the
   * person's permission before a business message, whatever the number is.
   */
  needsOptIn: true;
  /** The link the PROSPECT follows to start the conversation themselves. */
  waLink: string | null;
  /** One sentence, in the terms of what can and cannot be known. */
  why: string;
};

/**
 * What can honestly be said about reaching this number on WhatsApp.
 *
 * READ THE `why` STRINGS AS THE SPECIFICATION. Each one draws the line between
 * what was measured (a line type, a country code) and what is unknowable (is
 * this person on WhatsApp), because that line is the entire product difference
 * between this and a scraper.
 */
export function whatsappReach(input: {
  phone: PhoneValue | null;
  /** The message to pre-fill. The prospect sends it, so it reads as theirs. */
  prefill?: string;
  /** True when this person has already given WhatsApp permission. */
  optedIn?: boolean;
}): ReachVerdict {
  const { phone } = input;
  if (!phone || !phone.e164) {
    return {
      dialable: false, mobile: false, needsOptIn: true, waLink: null,
      why: "No usable number. A number with no country code is not a number — it is a guess about which country it belongs to.",
    };
  }

  const mobile = phone.lineType === "mobile";
  const link = waLink(phone.e164, input.prefill);

  if (phone.lineType === "landline") {
    return {
      dialable: false, mobile: false, needsOptIn: true, waLink: null,
      why: "This is a landline, so there is no WhatsApp conversation to open. Call it or email instead — a WhatsApp message to a landline is delivered to nobody.",
    };
  }
  if (phone.lineType === "voip") {
    return {
      dialable: false, mobile: false, needsOptIn: true, waLink: null,
      why: "This is a VoIP number. WhatsApp can be registered against one, but it usually is not, and a message that fails against a business switchboard still counts against the sending number's reputation.",
    };
  }
  if (!mobile) {
    return {
      dialable: true, mobile: false, needsOptIn: true, waLink: link,
      why: "The number is dialable but its line type is unknown, so whether it can carry WhatsApp at all is unknown. The link below works if it can; nothing here says it will.",
    };
  }

  // A MOBILE, WHICH IS AS FAR AS ANY API CAN TAKE THIS.
  return {
    dialable: true, mobile: true, needsOptIn: true, waLink: link,
    why: input.optedIn
      ? "A mobile line, and this person has given WhatsApp permission — so a message may be sent. Whether they actually use WhatsApp is still not something any API can confirm; a send that fails tells you, and costs nothing but the attempt."
      : "A mobile line, which is what WhatsApp needs. Whether this person is ON WhatsApp cannot be checked — Meta removed the only endpoint that answered it and the Cloud API has no replacement. And they have not given permission, so the compliant move is the link below, which they follow to message you first.",
  };
}

/**
 * A `wa.me` link to one number.
 *
 * NOT the share link in `shared/social.ts` — that one is `wa.me/?text=` and opens
 * a chooser for the SENDER to pick a recipient, which is right for "share this
 * post" and wrong here. This addresses a specific number.
 *
 * The prefill is the message the person sends TO the business, so it is written
 * from their side ("Hi, I saw…"), never from ours.
 */
export function waLink(e164: string, prefill?: string): string | null {
  const digits = (e164 || "").replace(/\D+/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  const text = (prefill || "").trim();
  return text
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text.slice(0, 600))}`
    : `https://wa.me/${digits}`;
}

/**
 * What a list looks like once it has been through this.
 *
 * COUNTED, NEVER ESTIMATED — the same rule `list-health.ts` was rewritten for.
 * `unknownLineType` is reported separately from `landline` because they want
 * different actions: one is a dead end, the other is a number worth validating.
 */
export function reachSummary(verdicts: readonly ReachVerdict[]): {
  total: number; mobiles: number; unusable: number; unknownLineType: number;
  needOptIn: number; line: string;
} {
  const total = verdicts.length;
  const mobiles = verdicts.filter((v) => v.mobile).length;
  const unusable = verdicts.filter((v) => !v.dialable).length;
  const unknownLineType = verdicts.filter((v) => v.dialable && !v.mobile).length;
  return {
    total, mobiles, unusable, unknownLineType,
    // Every one of them needs opt-in; the count exists so a surface can say so
    // out loud rather than implying the mobiles are ready to message.
    needOptIn: total,
    line: total === 0
      ? "No numbers to assess."
      : `${mobiles} of ${total} are mobile lines${unknownLineType ? `, ${unknownLineType} could not be typed` : ""}${unusable ? `, ${unusable} cannot carry WhatsApp` : ""}. None of them is an opt-in: WhatsApp requires permission before a business message, so the mobiles are people you may invite to message you, not people you may message.`,
  };
}
