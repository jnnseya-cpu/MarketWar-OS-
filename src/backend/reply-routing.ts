// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// WHERE A REPLY GOES.
//
// THE DEFECT THIS EXISTS TO FIX. Campaigns went out and no reply ever came
// back — not a human one, not an out-of-office. The receiving half of the
// platform was fully built: `/api/inbound/email` takes a message, resolves the
// brand, and the dashboard Inbox displays it. What was missing was the one
// thing that makes any of it reachable: NOTHING IN DNS EVER SAID WHERE TO
// DELIVER A REPLY. Every record the platform asks a customer to publish — DKIM,
// SPF, DMARC, the bounce CNAME, the tracking CNAME — exists to prove we may
// SEND as that domain. Not one of them tells a mail server where to deliver
// anything addressed to it. A recipient hitting Reply addressed it to
// hello@theircompany.com, their mail server looked up an MX that either did not
// exist or belonged to somebody else, and the message went wherever that led.
// Never here.
//
// THE FIX THAT IS NOT ALLOWED. "Point your MX at us" is the obvious answer and
// it is the most dangerous sentence an email platform can say. A working
// business domain almost always has MX records already — Google Workspace,
// Microsoft 365, their host — and repointing them does not add replies to this
// platform, it DELETES the company's email. Nothing here will ever ask for the
// root domain's MX.
//
// SO REPLIES LAND ON A DOMAIN WE OWN. Every brand gets an address at the
// platform's own reply host, which needs no DNS from the customer at all and
// therefore works on the day they sign up. A customer who wants replies to read
// as their own domain can publish ONE MX on a SUBDOMAIN — reply.theirdomain.com
// — which cannot affect the mail their company already receives, because it is
// a different name.

import { createHmac } from "crypto";

/** The host whose MX we control. Owner-side infrastructure, set once. */
export const replyHost = (): string =>
  (process.env.MW_REPLY_HOST || "reply.marketwaros.com").trim().toLowerCase().replace(/^@/, "");

/**
 * A per-brand reply address on our own reply host.
 *
 * The local part carries the brand so an arriving message can be routed with no
 * database lookup on the hot path, and it is signed so the mailbox cannot be
 * guessed from the brand id alone — an address that is trivially enumerable is
 * an invitation to inject fake replies into somebody else's inbox.
 */
export function replyAddressFor(brandId: string, host = replyHost()): string {
  const id = slugId(brandId);
  if (!id) return "";
  return `r.${id}.${tag(id)}@${host}`;
}

/** The brand a reply address belongs to, or "" if it is not one of ours. */
export function brandFromReplyAddress(to: string, host = replyHost()): string {
  const value = String(to ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return "";
  if (value.slice(at + 1) !== host) return "";
  const local = value.slice(0, at);
  // r.<id>.<tag> — the id may itself contain dots, so take the LAST segment as
  // the tag and everything between the prefix and it as the id.
  if (!local.startsWith("r.")) return "";
  const rest = local.slice(2);
  const dot = rest.lastIndexOf(".");
  if (dot < 1) return "";
  const id = rest.slice(0, dot);
  const given = rest.slice(dot + 1);
  return given && given === tag(id) ? id : "";
}

/**
 * A brand's reply subdomain — the OPTIONAL one, on a name of their own.
 *
 * Deliberately `reply.<domain>` and never `<domain>`: publishing an MX on a
 * subdomain that does not exist yet cannot change where any existing mail goes.
 */
export const replySubdomain = (domain: string): string =>
  `reply.${String(domain ?? "").trim().toLowerCase().replace(/^www\./, "")}`;

export const replyAddressOnOwnDomain = (domain: string): string => `replies@${replySubdomain(domain)}`;

/** Does anything at all accept mail for this domain? */
export async function hasMx(domain: string): Promise<{ ok: boolean; hosts: string[]; note: string }> {
  const d = String(domain ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!d || !d.includes(".")) return { ok: false, hosts: [], note: "That is not a domain we can look up." };
  try {
    const { resolveMx } = await import("dns/promises");
    const mx = await resolveMx(d);
    const hosts = mx.sort((a, b) => a.priority - b.priority).map((m) => m.exchange.replace(/\.$/, ""));
    return hosts.length
      ? { ok: true, hosts, note: `Mail for ${d} is delivered to ${hosts[0]}.` }
      : { ok: false, hosts: [], note: `${d} publishes no MX record, so nothing anywhere accepts mail addressed to it.` };
  } catch {
    return { ok: false, hosts: [], note: `${d} publishes no MX record, so nothing anywhere accepts mail addressed to it. A reply sent there is returned to the sender or silently dropped.` };
  }
}

export type ReplyVerdict = {
  /** Will a reply to this address reach somebody? */
  reachable: "yes" | "no" | "unknown";
  /** True when the replies also land in this platform's Inbox. */
  intoInbox: boolean;
  address: string;
  note: string;
};

/**
 * Where will a reply to this campaign actually go?
 *
 * Answered with a real DNS lookup rather than a guess, because the whole point
 * of the original defect is that everybody — us included — assumed a reply had
 * somewhere to land.
 */
export async function replyVerdict(input: {
  replyTo?: string;
  fromEmail?: string;
  brandId?: string;
}): Promise<ReplyVerdict> {
  const host = replyHost();
  const address = String(input.replyTo || input.fromEmail || "").trim().toLowerCase();

  if (!address) {
    const ours = input.brandId ? replyAddressFor(input.brandId, host) : "";
    return ours
      ? { reachable: "yes", intoInbox: true, address: ours,
          note: `No reply address was set, so replies go to your MarketWar reply address (${ours}) and appear in your Inbox here. Set a Reply-to to have them land in a mailbox you already read as well.` }
      : { reachable: "unknown", intoInbox: false, address: "",
          note: "No reply address is set and no brand reply address could be built, so there is nowhere for a reply to go." };
  }

  if (brandFromReplyAddress(address, host)) {
    return { reachable: "yes", intoInbox: true, address,
      note: "Replies come to your MarketWar reply address and appear in your Inbox here." };
  }

  const domain = address.split("@")[1] || "";
  const mx = await hasMx(domain);
  if (!mx.ok) {
    return { reachable: "no", intoInbox: false, address,
      note: `${mx.note} Anyone who replies to this campaign will get a failure notice, and you will never see the reply. Use a mailbox you actually read, or leave Reply-to blank and replies come to your MarketWar reply address instead.` };
  }
  return { reachable: "yes", intoInbox: false, address,
    note: `Replies go to ${address} — ${mx.note} They land in that mailbox, not in the Inbox here. To read them here as well, publish the reply MX record on ${replySubdomain(domain)} in Sending Domains, or leave Reply-to blank.` };
}

// ---------------------------------------------------------------------------

const slugId = (s: string): string =>
  String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const SECRET = () => process.env.EMAIL_TRACKING_SECRET || process.env.CRON_SECRET || "mw-dev-reply-secret";

/** Six characters of an HMAC — enough that the mailbox is not guessable. */
const tag = (id: string): string =>
  createHmac("sha256", SECRET()).update(`reply|${id}`).digest("base64url").slice(0, 6).toLowerCase();

// ---------------------------------------------------------------------------
// Bounces: attributable by construction
// ---------------------------------------------------------------------------

/**
 * A per-message envelope sender (VERP).
 *
 * WHY THIS REPLACES SCRAPING. Every message used to carry the same envelope
 * sender, `bounce@marketwaros.com`, so a delivery failure arrived with no
 * indication of which brand had sent it or to whom. The intake made up the
 * difference by taking the FIRST email address it could find in the body of the
 * failure notice — which is a guess about text written by somebody else's mail
 * server, and a wrong guess permanently suppresses a real customer.
 *
 * Encoding the brand and the recipient in the envelope sender means the failure
 * arrives already saying whose it was and which address died. No parsing of
 * anybody's prose, and no address suppressed that was not the one that failed.
 */
export const bounceHost = (): string =>
  (process.env.MW_BOUNCE_HOST || "bounces.marketwaros.com").trim().toLowerCase();

/**
 * Whether the bounce host was STATED, rather than defaulted into by this file.
 *
 * The default above is a subdomain nobody has created. Reading a bounce sent to
 * it needs an MX record and something at the other end, so until MW_BOUNCE_HOST
 * is set, putting a VERP address on the envelope buys nothing and costs the one
 * thing that matters: an envelope sender the receiving side can deliver a
 * failure notice to. `bounceHost()` keeps its default because the PARSER must
 * still recognise addresses issued before this existed — only the ISSUING side
 * is gated. Set MW_BOUNCE_HOST, point its MX at the intake, and per-recipient
 * bounce attribution switches on with no code change.
 */
export const bounceHostConfigured = (): boolean =>
  Boolean((process.env.MW_BOUNCE_HOST || "").trim());

export function bounceAddressFor(brandId: string, recipient: string, host = bounceHost()): string {
  const id = slugId(brandId);
  const to = String(recipient ?? "").trim().toLowerCase();
  if (!id || !to) return "";
  return `b.${id}.${tag(id)}.${recipientKey(id, to)}@${host}`;
}

/**
 * A short, lower-case key for one recipient of one brand.
 *
 * NOT the address encoded. The first version base64url'd the recipient into the
 * local part and it did not survive contact with reality: addresses are
 * lower-cased all the way along the path — by our own intake before anything
 * else looks at them — and lower-casing base64 destroys it. A keyed digest is
 * already lower-case, so nothing can damage it, and it is short enough that the
 * local part stays inside the 64-octet limit for any length of address.
 */
export const recipientKey = (brandId: string, recipient: string): string =>
  createHmac("sha256", SECRET())
    .update(`bounce|${slugId(brandId)}|${String(recipient ?? "").trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 12);

/** The brand a bounce belongs to, and the key that identifies its recipient. */
export function parseBounceAddress(to: string, host = bounceHost()): { brandId: string; key: string } | null {
  const value = String(to ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1 || value.slice(at + 1) !== host) return null;
  const local = value.slice(0, at);
  if (!local.startsWith("b.")) return null;
  const parts = local.slice(2).split(".");
  if (parts.length < 3) return null;
  // The id may contain dots, so the LAST two segments are the tag and the key.
  const key = parts.pop() as string;
  const given = parts.pop() as string;
  const brandId = parts.join(".");
  if (!brandId || given !== tag(brandId) || !/^[a-f0-9]{12}$/.test(key)) return null;
  return { brandId, key };
}

/**
 * Which address did this bounce belong to?
 *
 * Matched against the addresses this brand actually sent to, so the answer is
 * one of our own records rather than a guess about the prose in somebody else's
 * failure notice. A wrong guess suppresses a live customer forever, which is
 * why the body scrape is the fallback and never the first answer.
 */
export function recipientFromKey(brandId: string, key: string, sentTo: string[]): string {
  for (const address of sentTo) {
    if (recipientKey(brandId, address) === key) return address.trim().toLowerCase();
  }
  return "";
}
