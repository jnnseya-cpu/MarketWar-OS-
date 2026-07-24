import { NextResponse } from "next/server";

// SMTP connectivity probe — confirms the sending node is reachable and speaks
// SMTP, WITHOUT sending anything or authenticating. Connects to SMTP_HOST:PORT,
// reads the greeting, sends EHLO, and reports whether STARTTLS + AUTH are
// advertised. Read-only and credential-free: it never sends AUTH or a message,
// and never returns SMTP_USER/PASS. Use it to verify a freshly-deployed
// dedicated sending node (infra/sending-node) is correctly wired.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST = (process.env.SMTP_HOST || "").trim();
const PORT = Number((process.env.SMTP_PORT || "587").trim());
const SECURE = (process.env.SMTP_SECURE || "").trim() === "true" || PORT === 465;

export async function GET() {
  if (!HOST) {
    return NextResponse.json({
      configured: false,
      note: "SMTP_HOST is not set — the app is not pointed at a sending node yet. Deploy infra/sending-node and set SMTP_HOST/PORT/USER/PASS.",
    });
  }

  const result = await probe();
  return NextResponse.json({
    configured: true,
    host: HOST,
    port: PORT,
    secure: SECURE,
    ...result,
    howToRead:
      "reachable=true + speaksSmtp=true means the node is up and reachable. authAdvertised=true means it will accept the app's login. If reachable=false: the node is down, the firewall blocks the port, or DNS for SMTP_HOST is wrong.",
  });
}

async function probe(): Promise<Record<string, unknown>> {
  const net = await import("node:net");
  const tls = await import("node:tls");

  return new Promise((resolve) => {
    let socket: import("node:net").Socket | import("node:tls").TLSSocket;
    let buffer = "";
    let greeted = false;
    let settled = false;
    const ext: string[] = [];

    const done = (extra: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      try { socket.end(); } catch { /* already closed */ }
      resolve(extra);
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (!greeted && /^\d{3}[ -]/.test(buffer)) {
        greeted = true;
        socket.write("EHLO healthprobe.marketwaros.com\r\n");
        buffer = "";
        return;
      }
      if (greeted && /\r\n/.test(buffer)) {
        for (const line of buffer.split("\r\n")) {
          const m = line.match(/^250[ -](.+)$/);
          if (m) ext.push(m[1].trim().toUpperCase());
        }
        if (/250[ ]/.test(buffer)) {
          const caps = ext.join(" ");
          done({
            reachable: true,
            speaksSmtp: true,
            starttlsAdvertised: caps.includes("STARTTLS"),
            authAdvertised: caps.includes("AUTH"),
            extensions: ext.slice(0, 20),
          });
        }
      }
    };

    try {
      socket = SECURE
        ? tls.connect({ host: HOST, port: PORT, servername: HOST })
        : net.connect({ host: HOST, port: PORT });
      socket.setTimeout(8000, () => done({ reachable: false, reason: "connection timed out (node down, firewall, or wrong host/port)" }));
      socket.on("data", onData);
      socket.on("error", (e) => done({ reachable: false, reason: (e as Error).message }));
      socket.on("end", () => done({ reachable: greeted, speaksSmtp: greeted, note: greeted ? "closed after greeting" : "closed before greeting" }));
    } catch (e) {
      done({ reachable: false, reason: (e as Error).message });
    }
  });
}
