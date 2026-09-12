// WHAT SHAPE A MESSAGE TAKES, DECIDED ONCE, FROM WHAT KIND OF MESSAGE IT IS.
//
// THE QUESTION THIS ANSWERS: "why does our mail land in Promotions instead of
// Primary?" — and the first duty of this file is to be honest about the answer,
// because the honest answer changes the design.
//
// Gmail's Primary/Promotions split is a classifier Google runs on its own side.
// No sender controls it, nobody can promise placement, and any product that
// promises it is lying. What a sender controls is the SHAPE of the message, and
// shape is most of the signal.
//
// THE TWO GOALS PULL AGAINST EACH OTHER, WHICH IS THE WHOLE PROBLEM.
//
// The single most reliable way to be filed under Promotions is to carry a
// `List-Unsubscribe` header. That header is also MANDATORY for bulk marketing
// mail under Google's, Yahoo's, Apple's and Microsoft's sender rules. Strip it
// to chase Primary and the message stops being compliant, and non-compliant
// bulk mail does not land in Promotions — it lands in spam, which is very much
// worse. So "put all our mail in Primary" is not a setting anyone can switch on.
//
// WHAT IS ACHIEVABLE IS SEPARATING THE MAIL INTO STREAMS AND ENFORCING EACH.
//
//   conversational — one person writing to one person. Outreach from the vault,
//     replies, receipts, account access, alerts, a report somebody asked for.
//     No unsubscribe header, no list headers, no bulk precedence. Primary is
//     genuinely reachable here, and this is the mail that wins the work.
//
//   bulk — campaigns and the newsletter. One-click unsubscribe is required and
//     is set. It will usually be filed under Promotions. That is correct, it is
//     legal, and it is where a recipient looks for it. Smuggling marketing into
//     Primary by stripping the header is how a sending domain gets burned, and
//     once it is burned the conversational mail goes down with it.
//
// So this module refuses to put bulk-mail clothing on a conversational message,
// and says plainly when a bulk message is missing what bulk mail must carry.
//
// EVERYTHING BELOW IS PURE. It is in `shared/` so the wire builder, the preview
// screen and the tests all read the same decision, rather than three modules
// agreeing by coincidence until one of them is edited.

export type MailStream = "conversational" | "bulk";

export type ShapeInput = {
  /** The existing `transactional` flag. True means one-to-one. */
  transactional?: boolean;
  /** RFC 8058 one-click unsubscribe URL, when the caller has one. */
  listUnsubscribe?: string;
  /** Scopes the List-ID and the Feedback-ID. */
  brandId?: string;
  campaign?: string;
  /** The domain in the From address — the list identifier must live under it. */
  fromDomain?: string;
  /** Set when this message answers one that arrived: its Message-ID. */
  inReplyTo?: string;
  /** RFC 3834: true when a machine generated this without a person asking. */
  autoReply?: boolean;
};

export type MessageShape = {
  stream: MailStream;
  /** Headers to emit, on top of the ones every message carries. */
  headers: Record<string, string>;
  /** Things the caller asked for that this stream does not allow. */
  dropped: string[];
  /** Things this stream requires that the caller did not supply. */
  missing: string[];
};

/** A list identifier is a domain-shaped token, so it must not carry anything else. */
const tokenise = (s: string): string =>
  String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function streamOf(input: ShapeInput): MailStream {
  return input.transactional ? "conversational" : "bulk";
}

export function messageShape(input: ShapeInput): MessageShape {
  const stream = streamOf(input);
  const headers: Record<string, string> = {};
  const dropped: string[] = [];
  const missing: string[] = [];

  if (stream === "conversational") {
    // THE ONE RULE THAT MATTERS FOR PRIMARY PLACEMENT. A one-to-one message that
    // carries an unsubscribe header is telling the receiving classifier it is
    // bulk marketing, and it will be filed accordingly. The header is not
    // required on this stream by any sender rule, so carrying it buys nothing
    // and costs the inbox.
    if (input.listUnsubscribe) dropped.push("List-Unsubscribe (not carried on one-to-one mail)");

    // RFC 3834. An automatic reply that does not say it is automatic is how two
    // machines write to each other forever. It also stops an out-of-office from
    // answering us back.
    if (input.autoReply) headers["Auto-Submitted"] = "auto-replied";

    // THREADING. A reply that carries the identifier of the message it answers
    // is shown inside the existing conversation, and a conversation stays in the
    // tab it already lives in. This is the strongest placement signal available
    // to us and it costs one header.
    if (input.inReplyTo) {
      headers["In-Reply-To"] = input.inReplyTo;
      headers["References"] = input.inReplyTo;
    }
    return { stream, headers, dropped, missing };
  }

  // ---- bulk -----------------------------------------------------------------
  if (input.listUnsubscribe) {
    headers["List-Unsubscribe"] = `<${input.listUnsubscribe}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  } else {
    // NAMED, NOT SILENTLY TOLERATED. Bulk mail without one-click unsubscribe
    // fails the sender rules at every large receiver.
    missing.push("List-Unsubscribe — required on bulk mail by Google, Yahoo, Apple and Microsoft");
  }

  const brand = tokenise(input.brandId || "");
  const domain = String(input.fromDomain || "").toLowerCase().trim();
  // RFC 2919. Identifies the list a recipient is on, which is what a receiver
  // uses to group and to honour a per-list block rather than blocking the
  // sender outright.
  if (brand && domain) headers["List-ID"] = `<${brand}.lists.${domain}>`;

  // RFC 3834 §5: bulk mail should not provoke automatic replies. Without this a
  // campaign to a few thousand addresses collects a few hundred out-of-office
  // messages, each one an inbound our own bounce reader then has to classify.
  headers["Precedence"] = "bulk";

  // Google reads this and breaks reputation down by campaign in Postmaster
  // Tools — so a single bad campaign can be identified instead of the whole
  // domain simply going quiet. Format is up to four colon-separated fields with
  // the sender identifier last.
  const campaign = tokenise(input.campaign || "") || "campaign";
  if (brand) headers["Feedback-ID"] = `${campaign}:${brand}:bulk:marketwaros`;

  return { stream, headers, dropped, missing };
}

// ---------------------------------------------------------------------------
// RFC 2047 — a header is seven-bit ASCII, whatever the customer typed.
// ---------------------------------------------------------------------------
//
// A header value is not allowed to carry a byte above 0x7E. A pound sign in a
// subject line, an accented name in a From, a Danish street in a signature: each
// one goes out as a raw high byte, and a receiving server is entitled to reject
// the message or to strip the header. British customers write "£" in subject
// lines constantly, so this was not a theoretical defect — it was the normal
// case being sent malformed.

const ASCII_ONLY = /^[\x20-\x7E]*$/;

// Base64 written out rather than reached for, because this module is in
// `shared/` and `shared/` runs in the browser too: `Buffer` is not there, and a
// module that only works on one side of the wire is the defect this repository
// keeps making. `TextEncoder` and arithmetic are available on both.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Of(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : B64[b2 & 63];
  }
  return out;
}

const utf8 = new TextEncoder();

/**
 * Encode one header value as RFC 2047 encoded-words when it needs it.
 * ASCII passes through untouched, so a normal subject looks normal on the wire.
 */
export function encodeHeaderWord(value: string): string {
  const raw = String(value ?? "").replace(/[\r\n]+/g, " ");
  if (ASCII_ONLY.test(raw)) return raw;

  // An encoded-word may not exceed 75 characters INCLUDING the `=?UTF-8?B?`
  // opening and the `?=` close, which is 12 characters of overhead. That leaves
  // 63 for base64, and base64 grows 3 bytes into 4 — so 45 source bytes fit.
  // The split must fall on a character boundary or the decoded text is mojibake,
  // so the chunking counts UTF-8 bytes per code point rather than slicing the
  // buffer at 45 and hoping.
  const MAX_BYTES = 45;
  const words: string[] = [];
  let chunk: number[] = [];
  for (const ch of raw) {
    const bytes = Array.from(utf8.encode(ch));
    if (chunk.length + bytes.length > MAX_BYTES) {
      words.push(base64Of(chunk));
      chunk = [];
    }
    chunk.push(...bytes);
  }
  if (chunk.length) words.push(base64Of(chunk));

  // Folded with CRLF + space: a continuation line is what makes several encoded
  // words one header value, and a decoder joins adjacent words with no space.
  return words.map((w) => `=?UTF-8?B?${w}?=`).join("\r\n ");
}

/**
 * Encode an address header. ONLY the display name may be encoded — the address
 * itself is protocol, and wrapping it in an encoded-word produces a header that
 * parses as a name with no mailbox behind it.
 */
export function encodeAddressHeader(value: string): string {
  const raw = String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  if (ASCII_ONLY.test(raw)) return raw;
  const m = raw.match(/^(.*?)\s*(<[^>]*>)\s*$/);
  if (!m) return raw.replace(/[^\x20-\x7E]/g, ""); // a bare address cannot be non-ASCII
  const name = m[1].replace(/^"(.*)"$/, "$1");
  return `${encodeHeaderWord(name)} ${m[2]}`;
}

// ---------------------------------------------------------------------------
// The body — every message gets a plain-text alternative.
// ---------------------------------------------------------------------------
//
// Every message this platform sent was `text/html` and nothing else. An HTML
// message with no text alternative is one of the oldest and most reliable
// spam signals there is: real mail from a person is multipart, and bulk senders
// who cannot be bothered are not. It also means a watch, a screen reader, a
// text-mode client and a filter that scores the text part all get nothing.
//
// The text was already being produced for the preview screen and thrown away at
// the boundary. Now it goes on the wire.

export type BodyPart = { filename: string; contentType?: string; contentBase64: string };

export type ComposedBody = { body: string; contentType: string; hasText: boolean };

const boundary = (tag: string): string =>
  `=_mw_${tag}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/** A boundary must not occur inside what it delimits, or the message splits early. */
const safeBoundary = (tag: string, content: string): string => {
  let b = boundary(tag);
  while (content.includes(b)) b = boundary(tag);
  return b;
};

export function composeBody(
  html: string,
  text: string,
  attachments: BodyPart[] = [],
  encodeAttachment: (a: BodyPart) => string[] = defaultAttachmentPart,
): ComposedBody {
  const hasText = Boolean(text && text.trim());

  // No text to offer: keep exactly the previous single-part shape rather than
  // emitting a multipart/alternative with one empty half, which reads worse to a
  // filter than plain HTML does.
  const altParts: string[] = [];
  let inner: { body: string; contentType: string };
  if (hasText) {
    const alt = safeBoundary("alt", `${text}${html}`);
    altParts.push(`--${alt}`);
    // TEXT FIRST. RFC 2046 §5.1.4: the parts of a multipart/alternative are
    // ordered least-faithful first, and a client shows the LAST one it can
    // render. Put the HTML first and a modern client shows the plain text.
    altParts.push("Content-Type: text/plain; charset=utf-8");
    altParts.push("Content-Transfer-Encoding: 8bit");
    altParts.push("");
    altParts.push(text);
    altParts.push(`--${alt}`);
    altParts.push("Content-Type: text/html; charset=utf-8");
    altParts.push("Content-Transfer-Encoding: 8bit");
    altParts.push("");
    altParts.push(html);
    altParts.push(`--${alt}--`);
    inner = { body: altParts.join("\r\n"), contentType: `multipart/alternative; boundary="${alt}"` };
  } else {
    inner = { body: html, contentType: "text/html; charset=utf-8" };
  }

  if (!attachments.length) return { ...inner, hasText };

  const mixed = safeBoundary("mix", inner.body);
  const parts: string[] = [];
  parts.push(`--${mixed}`);
  parts.push(`Content-Type: ${inner.contentType}`);
  if (!hasText) parts.push("Content-Transfer-Encoding: 8bit");
  parts.push("");
  parts.push(inner.body);
  for (const a of attachments) {
    parts.push(`--${mixed}`);
    parts.push(...encodeAttachment(a));
  }
  parts.push(`--${mixed}--`);
  return { body: parts.join("\r\n"), contentType: `multipart/mixed; boundary="${mixed}"`, hasText };
}

/** Overridden by the wire builder, which owns filename sanitising and the type table. */
function defaultAttachmentPart(a: BodyPart): string[] {
  const name = String(a.filename || "attachment").replace(/[\r\n"\\]/g, "");
  return [
    `Content-Type: ${a.contentType || "application/octet-stream"}; name="${name}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${name}"`,
    "",
    (a.contentBase64.replace(/\s+/g, "").match(/.{1,76}/g) || []).join("\r\n"),
  ];
}
