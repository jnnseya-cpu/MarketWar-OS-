import { NextResponse } from "next/server";
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

// A real SMTP conversation: connect, EHLO, STARTTLS, AUTH. Whatever the server
// says is what the customer needs to know.
async function probeSmtp(node: { host: string; port: number; user: string; pass: string; secure: boolean }, timeoutMs = 8000): Promise<{ ok: boolean; stage: string; detail: string }> {
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
      resolve({ ok, stage, detail });
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
        clearTimeout(timer);
        finish(true, "Authenticated. This deployment can send mail.");
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

export async function GET() {
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

  // Only probe when there is something to probe. A failed probe with no
  // credentials would just restate what the variables already said.
  const probe = node
    ? await probeSmtp(node).catch((e) => ({ ok: false, stage: "probe", detail: e instanceof Error ? e.message : "probe failed" }))
    : null;

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
    verdict: !node
      ? missing.length
        ? `NOT SENDING. Missing or empty: ${missing.join(", ")}. All three are required — host, user AND password.`
        : "NOT SENDING. The variables are present but no sending node could be built from them."
      : probe?.ok
        ? "SENDING. Connected and authenticated against the mail server just now."
        : `NOT SENDING. Credentials are present but the server refused them — ${probe?.detail ?? "no detail"}`,
    whyThisExists:
      "Setting a variable in a dashboard does not prove the running deployment received it. Vercel applies environment changes only to deployments created AFTER the change, and Preview and Production are separate scopes. If a variable reads 'Not set' here after you have set it, the running build predates the change — redeploy, and check you set it on Production.",
  });
}
