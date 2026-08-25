import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/backend/sending-pool";
import { emailProvider, emailIsConfigured } from "@/backend/email";

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
  const askedTo = (req.nextUrl.searchParams.get("to") || "").trim();
  const probeTo = /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(askedTo) ? askedTo : (node?.user || fromAddr);

  // Only probe when there is something to probe. A failed probe with no
  // credentials would just restate what the variables already said.
  const probe = node
    ? await probeSmtp(node, { from: fromAddr || node.user, to: probeTo })
        .catch((e) => ({ ok: false, stage: "probe", detail: e instanceof Error ? e.message : "probe failed", envelopeTested: { from: fromAddr, to: probeTo } }))
    : null;

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
      dnsCheck = {
        ran: true,
        fromDomain,
        spf: spf || null,
        dmarc: dmarc || null,
        verdict: !spf
          ? `NO SPF RECORD on ${fromDomain}. Mail sent as this address authenticates at our own relay and is then very likely binned by the receiving server without a bounce — which looks exactly like "nothing sends". Publish a TXT record on ${fromDomain} authorising the relay that sends for it.`
          : !dmarc
            ? `SPF is published on ${fromDomain} but there is no DMARC policy. Delivery usually works; add a _dmarc TXT record (start at p=none) so you can SEE what receivers do with it.`
            : `SPF and DMARC are both published on ${fromDomain}. If mail still does not arrive, the cause is downstream of authentication — check the recipient's spam folder and the relay's own outbound log.`,
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
    probe,
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
            : `NOT SENDING. Credentials are present but the server refused them — ${probe?.detail ?? "no detail"}`,
    whyThisExists:
      "Setting a variable in a dashboard does not prove the running deployment received it. Vercel applies environment changes only to deployments created AFTER the change, and Preview and Production are separate scopes. If a variable reads 'Not set' here after you have set it, the running build predates the change — redeploy, and check you set it on Production.",
  });
}
