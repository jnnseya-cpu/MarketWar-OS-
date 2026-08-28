import { NextResponse, type NextRequest } from "next/server";
import { requireAuth, cronAuthorised, rateLimit, clientKey } from "@/backend/guard";
import { publicSendFailure, operatorFix } from "@/shared/send-failure";
// THE DIAGNOSTIC MUST OUTLIVE THE THING IT DIAGNOSES.
//
// These three were static imports, and that made this endpoint useless in the
// one case it exists for. If `@/backend/email` throws while LOADING, a static
// import here means the failure happens before any handler code runs — so the
// route that answers "why is no email sending?" dies of the same cause, with
// Next's 500 page and not one word about it. The owner is then holding two
// broken things instead of one working explanation.
//
// Loaded on use and guarded, so a load failure becomes the FINDING rather than
// the end of the request. `@/backend/guard` above stays static on purpose: if
// that cannot load nobody can sign in at all, which is a different and much
// louder failure than this one.
type EmailModule = typeof import("@/backend/email");
type LedgerModule = typeof import("@/backend/send-ledger");
type PoolModule = typeof import("@/backend/sending-pool");
import { resolveSender, alignmentRemedy } from "@/shared/sender-identity";

// Does email actually send? — the definitive answer for THIS deployment.
//
// Built for the same reason as /api/health/auth: a variable can be set ten times
// in a dashboard and still not reach the running process. Listing which env vars
// exist does not answer the question — it only moves the guess. So this reports
// what the SENDING PATH actually resolved to, and then opens a real connection
// to the mail server and authenticates.
//
// It never returns a credential. Lengths and first characters only, which is
// enough to spot the three things that actually go wrong: a value that is empty,
// a value that arrived wrapped in quotes, and a value with stray whitespace.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// This route opens an SMTP conversation, resolves several DNS records and can
// send a real message. The default budget is not enough for that, and a route
// that dies mid-request reports nothing at all — which is the opposite of what
// a diagnostic is for.
export const maxDuration = 30;

type VarReport = { present: boolean; length: number; quoted: boolean; padded: boolean; note?: string };

function inspect(name: string): VarReport {
  const raw = process.env[name];
  if (raw === undefined) return { present: false, length: 0, quoted: false, padded: false, note: "Not set in this deployment at all." };
  const quoted = /^["'].*["']$/.test(raw);
  const padded = raw !== raw.trim();
  return {
    present: raw.trim().length > 0,
    length: raw.length,
    quoted,
    padded,
    note: raw.trim().length === 0
      ? "Set but EMPTY. This is the usual cause: the variable exists, so a settings page looks correct, but there is no value in it."
      : quoted
        ? "Wrapped in quotes. Paste the value without surrounding quotes — the quotes become part of the credential."
        : padded
          ? "Has leading or trailing whitespace, which most mail servers reject."
          : undefined,
  };
}

// A real SMTP conversation: connect, EHLO, STARTTLS, AUTH — AND THEN AN
// ENVELOPE, which is the part that was missing.
//
// The probe used to stop at AUTH and report "SENDING. Connected and
// authenticated against the mail server just now." The owner read that verdict
// while no email had ever arrived, and it was not wrong so much as overclaiming:
// authenticating proves the password is right. It proves nothing about whether
// the server will ACCEPT a message from this sender to that recipient. A relay
// that authenticates you and then refuses `RCPT TO` for anything outside its own
// domain is the single most common way a correctly configured client sends
// nothing at all, and this probe could not see it.
//
// So it now continues: MAIL FROM, RCPT TO, then RSET. RSET abandons the
// transaction, so the conversation proves the envelope would be accepted without
// any message being delivered to anybody.
async function probeSmtp(
  node: { host: string; port: number; user: string; pass: string; secure: boolean },
  envelope: { from: string; to: string },
  timeoutMs = 8000,
): Promise<{ ok: boolean; stage: string; detail: string; envelopeTested: { from: string; to: string } }> {
  const net = await import("node:net");
  const tls = await import("node:tls");

  return new Promise((resolve) => {
    let socket: import("node:net").Socket | import("node:tls").TLSSocket;
    let stage = "connect";
    let buffer = "";
    let done = false;
    let upgraded = node.secure;

    const finish = (ok: boolean, detail: string) => {
      if (done) return;
      done = true;
      try { socket?.destroy(); } catch { /* already gone */ }
      resolve({ ok, stage, detail, envelopeTested: envelope });
    };

    const timer = setTimeout(
      () => finish(false, `Timed out after ${timeoutMs}ms at "${stage}". The host or port is usually wrong, or outbound SMTP is blocked.`),
      timeoutMs,
    );

    const send = (line: string) => socket.write(`${line}\r\n`);

    const onLine = (line: string) => {
      const code = Number(line.slice(0, 3));
      if (stage === "connect" && code === 220) {
        stage = "ehlo";
        send(`EHLO marketwaros.com`);
      } else if (stage === "ehlo" && code === 250 && line[3] === " ") {
        if (!upgraded) {
          stage = "starttls";
          send("STARTTLS");
        } else {
          stage = "auth";
          send("AUTH LOGIN");
        }
      } else if (stage === "starttls" && code === 220) {
        const plain = socket as import("node:net").Socket;
        plain.removeAllListeners("data");
        const secure = tls.connect({ socket: plain, servername: node.host }, () => {
          upgraded = true;
          stage = "ehlo";
          socket = secure;
          attach(secure);
          send(`EHLO marketwaros.com`);
        });
        secure.on("error", (e) => finish(false, `TLS failed: ${e.message}`));
      } else if (stage === "auth" && code === 334) {
        stage = "auth-user";
        send(Buffer.from(node.user).toString("base64"));
      } else if (stage === "auth-user" && code === 334) {
        stage = "auth-pass";
        send(Buffer.from(node.pass).toString("base64"));
      } else if (stage === "auth-pass" && code === 235) {
        // Authenticated. Now the question that actually matters.
        stage = "mail-from";
        send(`MAIL FROM:<${envelope.from}>`);
      } else if (stage === "mail-from" && code === 250) {
        stage = "rcpt-to";
        send(`RCPT TO:<${envelope.to}>`);
      } else if (stage === "rcpt-to" && (code === 250 || code === 251)) {
        // Accepted. Abandon it — nothing is delivered to anybody by a probe.
        stage = "rset";
        send("RSET");
      } else if (stage === "rset" && code === 250) {
        clearTimeout(timer);
        try { send("QUIT"); } catch { /* closing anyway */ }
        finish(true, `Authenticated, and the server accepted an envelope from <${envelope.from}> to <${envelope.to}>. The transaction was then abandoned with RSET, so nothing was delivered.`);
      } else if (code >= 400) {
        clearTimeout(timer);
        finish(false, `Server rejected at "${stage}": ${line.trim()}`);
      }
    };

    const attach = (s: import("node:net").Socket | import("node:tls").TLSSocket) => {
      s.setEncoding("utf8");
      s.on("data", (chunk: string) => {
        buffer += chunk;
        let i;
        while ((i = buffer.indexOf("\r\n")) !== -1) {
          const line = buffer.slice(0, i);
          buffer = buffer.slice(i + 2);
          if (line) onLine(line);
        }
      });
      s.on("error", (e: Error) => { clearTimeout(timer); finish(false, `${stage}: ${e.message}`); });
      s.on("close", () => { clearTimeout(timer); finish(false, `Connection closed during "${stage}" without completing.`); });
    };

    try {
      socket = node.secure
        ? tls.connect({ host: node.host, port: node.port, servername: node.host })
        : net.connect({ host: node.host, port: node.port });
      attach(socket);
    } catch (e) {
      clearTimeout(timer);
      finish(false, e instanceof Error ? e.message : "Could not open a connection.");
    }
  });
}

export async function GET(req: NextRequest) {
  // THE LOAD IS ITSELF A CHECK. If the sending modules cannot even be brought
  // into memory then no configuration question below is worth asking, and the
  // thrown message is the entire answer — so it is reported as the verdict
  // rather than allowed to become a 500 page.
  let email: EmailModule;
  let ledger: LedgerModule;
  let poolModule: PoolModule;
  try {
    [email, ledger, poolModule] = await Promise.all([
      import("@/backend/email"),
      import("@/backend/send-ledger"),
      import("@/backend/sending-pool"),
    ]);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    console.error(`[health/email] the sending modules failed to load: ${why}`);
    return NextResponse.json({
      service: "Email sending — does it actually work?",
      verdict: "BROKEN BEFORE CONFIGURATION",
      loaded: false,
      why,
      note:
        "The email code could not be loaded on this deployment, so nothing was sent and no mail setting is the cause. " +
        "Checking SMTP_HOST, RESEND_API_KEY or the sending pool will not change this — the failure is above all of them. " +
        "The message in `why` is the whole diagnosis.",
    }, { status: 200 });
  }
  const { emailProvider, emailIsConfigured } = email;
  const { recentSends } = ledger;
  const { getPool } = poolModule;

  // -------------------------------------------------------------------------
  // ?send=<address> — THE REAL SEND, not another probe.
  //
  // Three rounds of this endpoint reported healthy while no mail arrived, and
  // each round I built a better PROBE: connect, then authenticate, then an
  // envelope, then the real envelope sender. Every one of them reimplemented a
  // piece of SMTP, and every one could therefore differ from the code that
  // actually sends — which is exactly the fault the last round found.
  //
  // The probe was the wrong instrument. This calls `sendEmail` itself, so the
  // answer covers the whole real path: the sending pool, the hygiene and
  // suppression checks, the emergency stop, the SMTP client, the return-path
  // fallback. Whatever it reports is what a customer's message would do.
  //
  // AUTHORISED, because /api/health is deliberately open and an unauthenticated
  // "send mail to any address" button is an open relay with extra steps.
  const sendTo = (req.nextUrl.searchParams.get("send") || "").trim();
  if (sendTo) {
    // THE RECIPIENT IS WHAT IS CONSTRAINED, NOT THE CALLER.
    //
    // The first version of this gate demanded an admin session or the scheduler
    // bearer. Both are HEADERS, and the only way anybody actually reaches this
    // endpoint is by typing it into a browser — which cannot send either. So the
    // check was unsatisfiable by the one person it was meant to admit, and a
    // secret in the query string is not an option: no secret goes in a URL.
    //
    // What makes an open relay dangerous is a caller choosing the recipient. So
    // the recipient is chosen by SERVER CONFIG instead: the sending account's
    // own mailbox, or an address the owner listed in PLATFORM_ADMIN_EMAILS.
    // Nobody can mail a stranger through this, whatever they type, and no
    // credential is needed to test your own deployment against your own inbox.
    // An admin session or the scheduler bearer still widens it to any address,
    // for anyone who does have one.
    // Read the pool here rather than reusing the one built further down: this
    // branch returns before that runs.
    const sendNode = getPool()[0];
    const ownMailbox = (sendNode?.user || "").trim().toLowerCase();
    const admins = new Set((process.env.PLATFORM_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
    const wanted = sendTo.toLowerCase();
    const allowedWithoutCredential = wanted === "self" || wanted === ownMailbox || admins.has(wanted);

    if (!allowedWithoutCredential) {
      const cron = cronAuthorised(req);
      if (!cron.ok) {
        const auth = await requireAuth(req, { scope: "platform_admin" });
        if (!auth.ok) {
          return NextResponse.json({
            error: `This will send to the sending account itself, or to an address listed in PLATFORM_ADMIN_EMAILS — not to "${sendTo}".`,
            allowedRightNow: [ownMailbox, ...admins].filter(Boolean),
            try: ownMailbox ? "?send=self" : undefined,
            why: "A public endpoint that emails any address on request is an open relay, so the RECIPIENT is fixed by server config rather than by whoever calls it. Nothing here needs a credential to test your own deployment against your own inbox.",
            toUseAnotherAddress: "Add it to PLATFORM_ADMIN_EMAILS in Vercel and redeploy — or call this with an admin session or the scheduler bearer, neither of which a browser address bar can send.",
          }, { status: 403 });
        }
      }
    }

    // VARY ONE THING AT A TIME.
    //
    // A message can be queued by the relay and then dropped post-queue when the
    // FROM HEADER is not an address the authenticated account may send as —
    // Hostinger does exactly this. The bounce then goes to the Return-Path,
    // which is usually not a real mailbox either, so the message vanishes in
    // total silence while every check passes.
    //
    // Guessing is not the way to settle that. `&from=` sends the same message
    // with a different From so the two can be compared: if <appuser@…> arrives
    // and <info@…> does not, the From header is the answer and no further
    // theorising is needed. Restricted to the sending account or an address on
    // its own domain, so this cannot be used to forge a sender.
    const askedFrom = (req.nextUrl.searchParams.get("from") || "").trim().toLowerCase();
    const ownDomain = ownMailbox.split("@")[1] || "";
    const fromAllowed = askedFrom === "account" || askedFrom === ownMailbox || (Boolean(ownDomain) && askedFrom.endsWith(`@${ownDomain}`));
    const overrideFrom = askedFrom && fromAllowed ? (askedFrom === "account" ? ownMailbox : askedFrom) : "";
    if (askedFrom && !fromAllowed) {
      return NextResponse.json({
        error: `This can only send as the account itself or an address on ${ownDomain || "its own domain"} — not "${askedFrom}".`,
        try: "?send=self&from=account",
      }, { status: 403 });
    }

    const recipient = wanted === "self" ? ownMailbox : sendTo;
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(recipient)) {
      return NextResponse.json({ error: `"${sendTo}" is not an address this could send to.` }, { status: 400 });
    }
    // A few an hour. A real send costs the sending allowance and a reputation.
    const rl = rateLimit(clientKey(req, "email-send-test"), 6, 60 * 60_000, Date.now());
    if (!rl.ok) return NextResponse.json({ error: "Too many test sends — wait a little.", retryAfterSec: rl.retryAfterSec }, { status: 429 });

    const { sendEmail } = await import("@/backend/email");
    const at = new Date().toISOString();
    const result = await sendEmail({
      to: recipient,
      subject: `MarketWar OS send test — ${at}`,
      html: `<p>This is a real message from the live deployment, sent through the same code path a customer's email uses.</p><p>Sent at ${at}.</p><p>From header: ${overrideFrom || "the configured EMAIL_FROM"}.</p>`,
      ...(overrideFrom ? { from: `MarketWar OS <${overrideFrom}>` } : {}),
      // A test the operator asked for by name. It must not be silenced by a
      // marketing pause, for the same reason the free audit's report is not.
      transactional: true,
    }).catch((e) => ({ ok: false, failure: "threw", detail: e instanceof Error ? e.message : String(e), id: null }));
    return NextResponse.json({
      service: "Email sending — a REAL message through the real code path",
      sentTo: recipient,
      sentAs: overrideFrom ? `MarketWar OS <${overrideFrom}>` : "the configured EMAIL_FROM",
      at,
      result,
      verdict: result.ok
        ? `ACCEPTED by the provider. If it does not appear, the message left this deployment and the cause is delivery: check spam, then the relay's own outbound log for ${at}.`
        : `NOT SENT — ${publicSendFailure((result as { failure?: unknown }).failure)}. ${operatorFix((result as { failure?: unknown }).failure)} The provider's own words: ${(result as { detail?: string }).detail ?? "none"}.`,
    });
  }
  const vars = {
    SMTP_HOST: inspect("SMTP_HOST"),
    SMTP_USER: inspect("SMTP_USER"),
    SMTP_PASS: inspect("SMTP_PASS"),
    SMTP_PORT: inspect("SMTP_PORT"),
    SMTP_SECURE: inspect("SMTP_SECURE"),
    EMAIL_FROM: inspect("EMAIL_FROM"),
    MW_SENDING_POOL: inspect("MW_SENDING_POOL"),
    RESEND_API_KEY: inspect("RESEND_API_KEY"),
    SENDGRID_API_KEY: inspect("SENDGRID_API_KEY"),
  };

  const pool = getPool();
  const node = pool[0];

  // THE ENVELOPE THE PROBE WILL TEST.
  //
  // FROM is the address messages are actually sent as — parsed out of
  // EMAIL_FROM, because a relay that accepts your password can still refuse an
  // envelope from a domain you have not proved you own.
  //
  // TO defaults to the sending account itself: it is our own mailbox, so the
  // probe never touches a stranger's server, and RSET abandons the transaction
  // anyway. Pass ?to= to test whether the relay will accept an EXTERNAL
  // recipient, which is the failure this could not previously see.
  const fromAddr = (String(process.env.EMAIL_FROM || "").match(/<([^>]+)>/)?.[1] || String(process.env.EMAIL_FROM || "") || node?.user || "").trim();

  // THE ENVELOPE SENDER A REAL SEND ACTUALLY USES, which is NOT the From.
  //
  // This probe tested EMAIL_FROM and passed while no mail had ever arrived,
  // because `sendViaSmtp` puts the BOUNCE RETURN-PATH in MAIL FROM so that
  // bounce notifications come to us rather than into the sender's inbox. Many
  // relays only accept a MAIL FROM that is the authenticated mailbox or a real
  // alias, and `bounce@…` is usually neither — so every real send could be
  // failing at a step this check was not performing. A diagnostic that tests a
  // different path from the real one is worse than no diagnostic: it rules out
  // the actual cause.
  // Resolved by the SAME function the sender uses, so this cannot drift from it
  // again. With no MW_BOUNCE_ADDRESS the envelope is now the authenticated
  // account rather than an invented `bounce@`, which is the fix for the fault
  // this paragraph describes.
  const { bounceReturnPath } = await import("@/backend/email");
  const identity = resolveSender({ from: process.env.EMAIL_FROM || fromAddr, authUser: node?.user || "", bounce: bounceReturnPath() });
  const realEnvelopeFrom = (identity.envelopeFrom || fromAddr).trim();
  const askedTo = (req.nextUrl.searchParams.get("to") || "").trim();
  const probeTo = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(askedTo) ? askedTo : (node?.user || fromAddr);

  // Only probe when there is something to probe. A failed probe with no
  // credentials would just restate what the variables already said.
  // Test the REAL envelope sender first. If the relay refuses it, test the From
  // as well — the difference between the two answers IS the diagnosis.
  let probe = node
    ? await probeSmtp(node, { from: realEnvelopeFrom || node.user, to: probeTo })
        .catch((e) => ({ ok: false, stage: "probe", detail: e instanceof Error ? e.message : "probe failed", envelopeTested: { from: realEnvelopeFrom, to: probeTo } }))
    : null;
  let returnPathNote = "";
  if (node && probe && !probe.ok && probe.stage === "mail-from" && realEnvelopeFrom !== fromAddr && fromAddr) {
    const asFrom = await probeSmtp(node, { from: fromAddr, to: probeTo }).catch(() => null);
    returnPathNote = asFrom?.ok
      ? `THIS IS THE CAUSE. The relay refuses MAIL FROM:<${realEnvelopeFrom}> — the bounce return-path every real send uses — but accepts <${fromAddr}>. Create ${realEnvelopeFrom} as a real mailbox or alias, or set MW_BOUNCE_ADDRESS to an address this relay will send as. Until then every send retries as the From address and loses bounce attribution.`
      : `The relay refused BOTH the return-path <${realEnvelopeFrom}> and the From <${fromAddr}>, so the problem is the sender addresses themselves rather than the bounce path.`;
    if (asFrom?.ok) probe = { ...asFrom, stage: "mail-from-fallback", detail: `${probe.detail} — but <${fromAddr}> was accepted.` };
  }

  // WHY AN AUTHENTICATED SERVER STILL DELIVERS NOTHING.
  //
  // Almost always: the From domain has no SPF record covering the relay, or no
  // DMARC policy, so the message is accepted by our own server and then binned
  // silently by the receiving one. Nothing bounces and nothing arrives, which is
  // exactly the report. This resolves it from the server rather than asking
  // somebody to go and check DNS by hand.
  const fromDomain = fromAddr.split("@")[1] || "";
  let dnsCheck: Record<string, unknown> = { ran: false, note: "No From domain to check." };
  if (fromDomain) {
    try {
      const dns = await import("node:dns/promises");
      const txt = await dns.resolveTxt(fromDomain).catch(() => [] as string[][]);
      const flat = txt.map((r) => r.join(""));
      const spf = flat.find((r) => r.toLowerCase().startsWith("v=spf1")) || "";
      const dmarcTxt = await dns.resolveTxt(`_dmarc.${fromDomain}`).catch(() => [] as string[][]);
      const dmarc = dmarcTxt.map((r) => r.join("")).find((r) => r.toLowerCase().startsWith("v=dmarc1")) || "";

      // DKIM. With SPF published and DKIM absent, mail is DELIVERED and then
      // filed as spam by most large providers — which reads as "never sends" to
      // everyone except the one person who checks their junk folder. There is no
      // way to enumerate selectors, so the common ones are asked for by name;
      // finding none is suggestive, not proof, and the note says so.
      const selectors = ["hostingermail1", "hostingermail2", "hostingermail3", "default", "mail", "dkim", "s1", "s2", "k1", "selector1", "selector2", "google"];
      const found: string[] = [];
      await Promise.all(selectors.map(async (sel) => {
        const rec = await dns.resolveTxt(`${sel}._domainkey.${fromDomain}`).catch(() => [] as string[][]);
        if (rec.map((r) => r.join("")).some((r) => r.toLowerCase().includes("v=dkim1") || r.toLowerCase().includes("p="))) found.push(sel);
      }));
      dnsCheck = {
        ran: true,
        fromDomain,
        spf: spf || null,
        dmarc: dmarc || null,
        dkimSelectorsFound: found,
        dkimNote: found.length
          ? `DKIM found on: ${found.join(", ")}. Signing is published for this domain.`
          : `No DKIM record on any of the ${selectors.length} selectors checked (${selectors.join(", ")}). If your provider uses a selector not on that list this proves nothing — but if there genuinely is none, mail is DELIVERED and then filed as spam by most large providers, which looks exactly like "never sends" to anyone who does not check their junk folder.`,
        verdict: !spf
          ? `NO SPF RECORD on ${fromDomain}. Mail sent as this address authenticates at our own relay and is then very likely binned by the receiving server without a bounce — which looks exactly like "nothing sends". Publish a TXT record on ${fromDomain} authorising the relay that sends for it.`
          : !dmarc
            ? `SPF is published on ${fromDomain} but there is no DMARC policy. Delivery usually works; add a _dmarc TXT record (start at p=none) so you can SEE what receivers do with it.`
            : found.length
              ? `SPF, DMARC and DKIM are all published on ${fromDomain}. If mail still does not arrive, the cause is downstream of authentication — check the recipient's spam folder, then the relay's own outbound log. Use ?send= to put a real message through the real code path.`
              : `SPF and DMARC are published on ${fromDomain} but NO DKIM RECORD was found on the common selectors. That combination usually delivers straight to spam at Gmail and Outlook — the message arrives and nobody sees it. Turn on DKIM signing at the mail provider and publish the record it gives you.`,
        note: "This reads DNS. It cannot confirm the relay's sending IP is inside the SPF record — compare the include/ip4 entries above with the IP your provider sends from.",
      };
    } catch (e) {
      dnsCheck = { ran: false, fromDomain, error: e instanceof Error ? e.message : "DNS lookup failed", note: "DNS could not be resolved from the server; check SPF and DMARC by hand." };
    }
  }

  const missing = (["SMTP_HOST", "SMTP_USER", "SMTP_PASS"] as const).filter((k) => !vars[k].present);

  return NextResponse.json({
    service: "Email sending — does it actually work?",
    provider: emailProvider,
    configured: emailIsConfigured(),
    poolNodes: pool.length,
    // Host and user are operational config, not secrets. The password is never
    // echoed in any form beyond its length.
    activeNode: node ? { label: node.label, host: node.host, port: node.port, secure: node.secure, user: node.user } : null,
    vars,
    // WHAT WAS ACTUALLY SENT. The only record of a send used to be an in-memory
    // per-instance counter, so "did Tuesday's audit email go out?" had no answer
    // anywhere in the system. These ids are what a provider's support desk can
    // act on.
    recentSends: await recentSends(20).catch(() => []),
    probe,
    // ALL THREE ADDRESSES, IN ONE PLACE, resolved by the function the sender
    // itself uses. They used to be reported separately and computed separately,
    // which is how a deployment could show green here while every message left
    // with a login, an envelope and a From that were three different mailboxes.
    envelopeSender: {
      visibleFrom: fromAddr,
      returnPath: realEnvelopeFrom,
      authenticatedAccount: node?.user || null,
      senderHeader: identity.senderHeader || null,
      envelopeChosenBecause: identity.envelopeSource,
      aligned: identity.aligned,
      differ: realEnvelopeFrom !== fromAddr,
      note: identity.why,
      // What the OWNER does about it, if anything. Absent when aligned, rather
      // than a reassuring sentence nobody needs to read.
      ...(alignmentRemedy(identity) ? { remedy: alignmentRemedy(identity) } : {}),
      // The invented `bounce@` default is gone: with no MW_BOUNCE_ADDRESS the
      // envelope is the authenticated account, so a failure notice now returns
      // to a mailbox that exists instead of vanishing with the evidence.
      bounceAddressConfigured: Boolean(bounceReturnPath()),
      ...(returnPathNote ? { verdict: returnPathNote } : {}),
    },
    dnsCheck,
    verdict: !node
      ? missing.length
        ? `NOT SENDING. Missing or empty: ${missing.join(", ")}. All three are required — host, user AND password.`
        : "NOT SENDING. The variables are present but no sending node could be built from them."
      : probe?.ok
        // "Authenticated" is NOT "sending", and saying so was the overclaim that
        // let this sit unexplained. The verdict now names what was proved.
        ? `SENDING. Authenticated AND the server accepted an envelope just now (${probe.envelopeTested?.from} → ${probe.envelopeTested?.to}, then abandoned). If mail still does not arrive, the cause is delivery rather than configuration — see dnsCheck.`
        : probe?.stage === "rcpt-to"
          ? `NOT SENDING. The password is accepted but the server REFUSED THE RECIPIENT — ${probe.detail}. A relay that authenticates you and then rejects RCPT TO is usually restricted to its own domain, or the From address is not one it will send as.`
          : probe?.stage === "mail-from"
            ? `NOT SENDING. The password is accepted but the server refused the SENDER address — ${probe.detail}. EMAIL_FROM must be an address this relay is allowed to send as.`
            // A REFUSED PASSWORD, WITH THE ONE CAUSE THAT IS ABOUT TO BE
            // COMMON. Moving SMTP_USER onto the address the business sends as
            // is the right fix for the three-mailbox problem, and it breaks
            // sending outright if SMTP_PASS is left on the old account —
            // mailbox passwords are per mailbox, not per domain. That failure
            // is WORSE than the one being fixed, because it stops everything
            // rather than losing it quietly, so it is named here instead of
            // being left as a bare server refusal.
            : `NOT SENDING. The server refused the password for <${node.user}> — ${probe?.detail ?? "no detail"}. If SMTP_USER was changed recently, SMTP_PASS has to be THAT mailbox's own password: they are per mailbox, not per domain.`,
    whyThisExists:
      "Setting a variable in a dashboard does not prove the running deployment received it. Vercel applies environment changes only to deployments created AFTER the change, and Preview and Production are separate scopes. If a variable reads 'Not set' here after you have set it, the running build predates the change — redeploy, and check you set it on Production.",
  });
}
