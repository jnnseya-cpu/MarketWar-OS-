// WHO SENT THIS PERSON TO MARKETWAR, AND FOR HOW LONG THAT STAYS TRUE.
//
// NOT THE SAME QUESTION AS referral-attribution.ts, and the two are deliberately
// separate modules rather than one with two windows in it:
//
//   referral-attribution.ts — may a SALE ON A BRAND'S OWN SITE claim a code?
//     30-day last-click sanity check on a postback we did not observe. That file
//     is honest that the brand's cookie is the attribution, not ours, because
//     the purchase happens on their domain and no cookie crosses that boundary.
//
//   THIS FILE — did this person arrive at OUR signup on a creator's link?
//     Both events happen on marketwaros.com, so we can answer it properly, and
//     the window is ours to set: 90 days, last touch.
//
// THE HOLE THIS CLOSES. A creator's link is /r/{CODE}. It recorded the click and
// forwarded the visitor to the brand's site with ?ref= attached, and that half
// worked. Everything aimed at MarketWar itself dropped the code on the floor:
//
//   • /signup and /login read no referral parameter, and nothing anywhere set a
//     cookie. A visitor who landed on MarketWar, pressed "Get started" and made
//     an account reached account creation with no trace of who sent them. The
//     sub-10k ACU referral programme — 250 ACUs per referral — therefore could
//     not pay out from a link at all. The only thing in the whole codebase that
//     ever produced a `referredRef` was a brand posting a sale back by hand.
//   • A programme with no destinationUrl redirected to "/" and discarded the
//     code entirely. Real traffic, recorded click, attribution impossible.
//   • It could not be repaired afterwards: recordClick stores a salted visitor
//     hash that rotates per code PER DAY, deliberately, so no trail exists to
//     reconstruct — payout-trust.ts says so in as many words.
//
// THE RULE, chosen so a creator who was not paid can be told why in one
// sentence: LAST TOUCH WINS, INSIDE 90 DAYS. If two creators send the same
// person, the most recently clicked link is credited. If nobody's link has been
// clicked for 90 days, nobody is credited. Every alternative needs a paragraph.
//
// TWO TIERS, BECAUSE OF CONSENT — and this is the part that has to be honest.
//
// The persistent cookie is affiliate attribution. It is not authentication and
// it is not analytics, and under PECR it is not "strictly necessary for a
// service the user requested" — the visitor asked for the website, not for us to
// remember who sent them. The ICO says as much about affiliate tracking
// specifically. Claiming otherwise would hang a regulatory liability on the
// flagship growth programme.
//
// So attribution works at two strengths, and both are stated to the creator
// rather than averaged into one number they cannot verify:
//
//   TIER 1 — THE VISIT. The code rides in the URL and is carried onto the signup
//     link. A query parameter is not storage on the visitor's device, so no
//     consent question arises. This covers click → land → sign up, which is how
//     most referred signups actually happen.
//   TIER 2 — 90 DAYS. Only once the visitor has accepted cookies. Then the code
//     is stored first-party and survives them leaving and coming back.
//
// A visitor who refuses is not tracked, and the creator is still paid for the
// visit they genuinely produced. Nobody is lied to in either direction.

/** First-party, one code and one timestamp. Never an identifier for a person. */
export const REF_COOKIE = "mw_ref";

/** The window, measured from the LAST touch. */
export const SIGNUP_WINDOW_DAYS = 90;
export const SIGNUP_WINDOW_MS = SIGNUP_WINDOW_DAYS * 24 * 60 * 60_000;

/** Accepted in a URL in either spelling — the brand redirect writes both. */
export const REF_PARAMS = ["ref", "mw_ref"] as const;

export type Attribution = { code: string; at: number };

/**
 * A referral code, or null.
 *
 * Codes are minted by `subscribe()` and are short and alphanumeric. Anything
 * else is somebody's idea of an experiment arriving in a query string, and it
 * gets no further than this function.
 */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{3,31}$/.test(code) ? code : null;
}

/** The referral code carried by a URL, whichever spelling it used. */
export function refFromParams(params: { get(name: string): string | null }): string | null {
  for (const p of REF_PARAMS) {
    const code = normaliseCode(params.get(p));
    if (code) return code;
  }
  return null;
}

/** `CODE.epochMillis` — small enough that the cookie stays a cookie. */
export function encodeAttribution(a: Attribution): string {
  return `${a.code}.${Math.max(0, Math.floor(a.at))}`;
}

export function decodeAttribution(raw: unknown): Attribution | null {
  if (typeof raw !== "string" || !raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const code = normaliseCode(raw.slice(0, dot));
  const at = Number(raw.slice(dot + 1));
  if (!code || !Number.isFinite(at) || at <= 0) return null;
  return { code, at };
}

/** Has this attribution aged out of its window? */
export function isExpired(a: Attribution, now: number): boolean {
  // A timestamp in the future is a clock that cannot be trusted to expire
  // anything, so it reads as expired rather than as a 90-year window.
  return a.at > now + 60_000 || now - a.at > SIGNUP_WINDOW_MS;
}

/**
 * The last-touch decision, in one place so the browser and the server cannot
 * reach different conclusions about who gets paid.
 *
 * Returns what should now be stored, or null if nothing should be.
 */
export function lastTouch(existing: Attribution | null, incoming: string | null, now: number): Attribution | null {
  // A fresh click always wins, including a re-click of the same code — that is
  // what "last touch" means, and it is also what restarts the 90 days.
  const code = normaliseCode(incoming);
  if (code) return { code, at: now };
  if (!existing || isExpired(existing, now)) return null;
  return existing;
}

/**
 * What the creator is told, and what the visitor can read in the policy. Written
 * here rather than typed into three screens, because a rule described
 * differently in three places is three rules.
 */
export function attributionNote(consented: boolean): string {
  return consented
    ? `Your link is credited for ${SIGNUP_WINDOW_DAYS} days from the last click, even if the person leaves and comes back. If they later click a different creator's link, the most recent click is the one credited.`
    : `This visitor has not accepted cookies, so nothing is stored on their device. Your link is credited for the visit it produced — click through to sign-up — but not if they leave and return days later.`;
}

export const SIGNUP_ATTRIBUTION_DOCTRINE = [
  `Last touch inside ${SIGNUP_WINDOW_DAYS} days. A creator who was not paid can be told why in one sentence, which is the only test a commission rule has to pass.`,
  "The persistent cookie is affiliate attribution, so it waits for consent. The visit-length attribution needs no storage and therefore no consent, which is why refusing cookies costs the creator far less than it first looks.",
  "One signup is attributed once, ever. The record is keyed on the account, so a refresh, a retried request or a second tab cannot mint a second referral.",
  "A creator cannot refer themselves. It is the first thing anyone tries and the cheapest thing to refuse.",
  "This window is not the 30-day sale window in referral-attribution.ts. That one asks whether a sale on a BRAND'S site may claim a code we never observed; this one asks whether a signup on OUR site came from a link we did observe. Same word, two questions, deliberately two modules.",
];
