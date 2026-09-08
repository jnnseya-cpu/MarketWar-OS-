// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// THE PLATFORM READS ITS OWN BOUNCES.
//
// THE COMPLAINT THIS ANSWERS, VERBATIM: "so if I have 1000000 users sending from
// their domain in MarketWar, I will have to look at our private email? is this
// how Brevo works?" No, and it was not defensible. A delivery failure reaching a
// human inbox is a debugging step, not a product.
//
// Nothing new is required to fix it. Every failure notice ALREADY arrives at the
// envelope sender, which is a mailbox this deployment holds credentials for, and
// every piece of interpretation — classification, VERP brand attribution, the
// suppression rule, the Inbox — was already written behind `/api/inbound/email`.
// What was missing was something to carry the messages from one to the other.
//
// This is that. It reads the mailbox on a schedule and puts every message through
// `routeInbound`, the SAME routing the webhook uses, so a bounce means one thing
// on this platform however it arrived.

import { fetchUnread, parseRawMessage, imapCredentials, imapConfigured } from "@/backend/imap";
import { routeInbound } from "@/backend/inbound-routing";

export type CollectionResult = {
  ok: boolean;
  /** Messages taken out of the mailbox this run. */
  collected: number;
  /** Of those, how many were delivery failures that suppressed an address. */
  suppressed: number;
  /** …how many were real replies filed to a brand's Inbox. */
  inbox: number;
  /** …and how many belonged to nobody we could identify. */
  ignored: number;
  /** The addresses recorded as bounced, so a caller can log what changed. */
  addresses: string[];
  note: string;
};

/**
 * Collect and route everything unread in the bounce mailbox.
 *
 * NEVER THROWS FOR A MESSAGE IT CANNOT PARSE. One malformed notice must not stop
 * the other forty-nine being processed — and a message that fails here stays
 * unread only if the whole run failed, because the mailbox is marked read as a
 * batch once every message is in hand.
 */
export async function collectBounces(
  limit = 50,
  // INJECTABLE, so the routing and the suppression rule can be tested against a
  // real delivery notice without a mail server. The wire protocol itself was
  // proved by driving `fetchUnread` against a live IMAP server in-container —
  // login, SELECT, UID SEARCH, a literal-framed FETCH and the batched STORE.
  // Feature code always uses the default.
  // `route` is injectable too, so the resilience below can be PROVED. A message
  // that fails to route is the case the try/catch exists for, and without a seam
  // that path is unreachable from a test — an untested catch is a comment.
  deps: { fetch?: typeof fetchUnread; route?: typeof routeInbound } = {},
): Promise<CollectionResult> {
  const fetcher = deps.fetch ?? fetchUnread;
  const router = deps.route ?? routeInbound;
  const empty = { collected: 0, suppressed: 0, inbox: 0, ignored: 0, addresses: [] as string[] };

  if (!imapConfigured()) {
    return {
      ok: false, ...empty,
      note: "No bounce mailbox is configured, so delivery failures are not being collected. Set MW_BOUNCE_IMAP_HOST (the IMAP server of the mailbox your mail is sent from); the username and password default to SMTP_USER/SMTP_PASS, which is the mailbox the failures already arrive at.",
    };
  }

  const cfg = imapCredentials();
  let messages;
  try {
    messages = await fetcher(cfg, limit);
  } catch (e) {
    return {
      ok: false, ...empty,
      // The reason, not "collection failed" — this is the module whose absence
      // made a failure unreadable in the first place.
      note: `The bounce mailbox could not be read: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  let suppressed = 0, inbox = 0, ignored = 0;
  const addresses: string[] = [];

  for (const m of messages) {
    try {
      const parsed = parseRawMessage(m.raw);
      const outcome = await router({
        to: parsed.to,
        from: parsed.from,
        subject: parsed.subject,
        text: parsed.text,
        receivedAt: new Date().toISOString(),
        headers: parsed.headers,
      });
      if (outcome.routed === "suppression") {
        suppressed++;
        if (outcome.suppressed) addresses.push(outcome.suppressed);
      } else if (outcome.routed === "ignored") ignored++;
      else inbox++;
    } catch {
      // One unparseable notice is not a reason to abandon the rest.
      ignored++;
    }
  }

  return {
    ok: true,
    collected: messages.length,
    suppressed, inbox, ignored, addresses,
    note: messages.length === 0
      ? "Nothing new in the bounce mailbox."
      : `${messages.length} message(s) collected: ${suppressed} delivery failure(s), ${inbox} filed to an Inbox, ${ignored} belonging to no brand we could identify.`,
  };
}
