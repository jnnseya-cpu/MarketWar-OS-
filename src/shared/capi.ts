// THE CONVERSIONS API, MINUS THE NETWORK AND THE CRYPTO.
//
// Pure, so the rules can be tested without a Meta account, an access token or a
// browser. `backend/meta-capi.ts` does the hashing and the POST; everything that
// decides WHAT is sent, and whether anything is sent at all, is here.
//
// WHAT THE CONVERSIONS API IS FOR. The browser Pixel misses conversions it can
// never see: an ad-blocker, Safari's tracking prevention, a customer who closes
// the tab before Stripe redirects them back, a payment confirmed by a webhook
// hours later when no browser is involved at all. The server does see those. So
// the server sends them too, and Meta is told which browser event each one is a
// copy of so the pair counts once.
//
// THE ONE THING THAT MAKES THIS WORTH HAVING RATHER THAN HARMFUL:
//
//   Meta deduplicates a Pixel event against a Conversions API event when
//   `event_name` AND `event_id` BOTH match, within 48 hours.
//
// Get that wrong and every payment is reported twice. Revenue in Ads Manager is
// then double what the bank says, ROAS is double what it is, and the bidding is
// trained on it — a worse outcome than having no server-side tracking at all.
// Which is why `conversionEventId` lives here, is derived from a value BOTH sides
// already hold (Stripe's event id), and has a test that fails if the two sides
// ever derive it differently.

/** Meta's standard event for each MarketWar money event. */
export const CAPI_EVENT_NAMES: Record<string, string> = {
  subscribe: "Subscribe",
  topup: "Purchase",
  purchase: "Purchase",
};

/**
 * The id that ties a browser event to its server-side twin.
 *
 * DERIVED, NEVER GENERATED. A `crypto.randomUUID()` on either side can never
 * match the other, and Meta's de-duplication is an exact string comparison.
 * Stripe's event id is the one value the browser (via `wallet.lastCredit`) and
 * the webhook (via the event it is processing) both hold, and it is already
 * unique per payment — which is also what makes a redelivered webhook safe.
 *
 * The event NAME is part of it because the same payment can legitimately produce
 * two different events, and Meta matches on the pair.
 *
 * On sending Stripe's event id to Meta: it is an internal identifier, not a
 * credential and not personal data, and it is useless without our API keys. The
 * alternative — a hash — would need the same digest on both sides, and the
 * browser has no synchronous SHA-256. Stated rather than left as an accident.
 */
export function conversionEventId(stripeEventId: string, eventName: string): string {
  const id = (stripeEventId || "").trim();
  const name = (eventName || "").trim();
  if (!id || !name) return "";
  return `${id}.${name}`;
}

/** The identifiers Meta will match a person on, before hashing. */
export type RawUserData = {
  email?: string | null;
  phone?: string | null;
  /** From the `_fbp` cookie. Not personal data, and the strongest single match. */
  fbp?: string | null;
  /** Built from `fbclid` — the click this conversion belongs to. */
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
};

/**
 * Meta's normalisation rules, applied before hashing.
 *
 * NOT COSMETIC. Meta hashes its own copy after normalising the same way, so
 * "Ann@Example.COM " and "ann@example.com" must produce the same digest or the
 * match rate silently drops to zero and nothing reports an error — a conversion
 * that arrives, is accepted, and matches nobody.
 */
export function normaliseEmail(v: string | null | undefined): string | null {
  const s = (v || "").trim().toLowerCase();
  // A bare minimum of validity: a digest of "not an email" matches nothing and
  // is still personal data we have handed over for no benefit.
  return s.includes("@") && s.length >= 6 ? s : null;
}

/**
 * E.164 digits, no plus, no punctuation.
 *
 * A LOCAL NUMBER IS NOT SENT. "07700 900123" normalises to "07700900123", which
 * is a different string from the "447700900123" Meta holds, so it matches nobody
 * — and a UK local number is indistinguishable from several other countries'
 * numbers, so guessing a country code would be inventing data. Only a number
 * that already carries its country code is usable, and the rest are dropped.
 */
export function normalisePhone(v: string | null | undefined): string | null {
  const raw = (v || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  const international = raw.trim().startsWith("+") || (!raw.trim().startsWith("0") && digits.length >= 10);
  return international ? digits : null;
}

/** A single event, ready for the Graph POST once `user_data` is hashed. */
export type CapiEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website" | "system_generated";
  event_source_url?: string;
  user_data: Record<string, string | string[]>;
  custom_data?: Record<string, string | number>;
};

export type BuildInput = {
  /** A MarketWar event name — `subscribe`, `topup`, `purchase`. */
  name: string;
  /** Stripe's event id for the payment this reports. */
  stripeEventId: string;
  /** Seconds. Clamped below, because Meta refuses anything older than 7 days. */
  atMs: number;
  nowMs: number;
  value?: number;
  currency?: string;
  plan?: string | null;
  /** Already hashed — this module never sees a plaintext identifier. */
  hashed: Record<string, string>;
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  sourceUrl?: string;
};

/** Meta rejects an event older than this. Seven days. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type BuildResult = { ok: true; event: CapiEvent } | { ok: false; why: string };

/**
 * One event, or a stated reason there is none.
 *
 * THE REFUSALS ARE THE INTERESTING PART, and each one is a thing that would
 * otherwise be sent and silently achieve nothing or actively mislead.
 */
export function buildCapiEvent(input: BuildInput): BuildResult {
  const eventName = CAPI_EVENT_NAMES[input.name];
  if (!eventName) return { ok: false, why: `${input.name} has no Conversions API equivalent — only the money events are sent server-side.` };

  const event_id = conversionEventId(input.stripeEventId, input.name);
  if (!event_id) {
    // Without this the browser event and this one are two separate conversions.
    return { ok: false, why: "no Stripe event id, so this could not be de-duplicated against the browser event and would double-count" };
  }

  // A MATCH NEEDS SOMETHING TO MATCH ON. Meta accepts an event with no
  // identifiers, attributes it to nobody, and reports no error — so it arrives,
  // counts as delivered, and does nothing. The IP and user agent alone are a
  // weak but real signal; a hashed email is the strong one. None of them means
  // there is no point sending it.
  const hasIdentity = Object.keys(input.hashed).length > 0
    || Boolean(input.fbp) || Boolean(input.fbc) || Boolean(input.clientIp);
  if (!hasIdentity) return { ok: false, why: "no identifier of any kind, so Meta would accept this event and attribute it to nobody" };

  if (input.atMs > 0 && input.nowMs - input.atMs > MAX_AGE_MS) {
    return { ok: false, why: `the payment is older than 7 days, which Meta refuses — sending it would be a rejected request, not a conversion` };
  }

  const user_data: Record<string, string | string[]> = {};
  // Meta takes the hashed identifiers as arrays.
  for (const [k, v] of Object.entries(input.hashed)) user_data[k] = [v];
  if (input.clientIp) user_data.client_ip_address = input.clientIp;
  if (input.userAgent) user_data.client_user_agent = input.userAgent.slice(0, 500);
  if (input.fbp) user_data.fbp = input.fbp;
  if (input.fbc) user_data.fbc = input.fbc;

  const custom_data: Record<string, string | number> = {};
  if (typeof input.value === "number" && input.value > 0) {
    custom_data.value = input.value;
    custom_data.currency = (input.currency || "GBP").toUpperCase();
  }
  if (input.plan) custom_data.content_name = String(input.plan).slice(0, 40);

  return {
    ok: true,
    event: {
      event_name: eventName,
      event_time: Math.floor((input.atMs > 0 ? input.atMs : input.nowMs) / 1000),
      event_id,
      // `website` and not `system_generated`: this reports a purchase a person
      // made on the website, which is what Meta attributes to an advert. A
      // webhook being the thing that confirmed it is our plumbing, not theirs.
      action_source: "website",
      ...(input.sourceUrl ? { event_source_url: input.sourceUrl } : {}),
      user_data,
      ...(Object.keys(custom_data).length ? { custom_data } : {}),
    },
  };
}
