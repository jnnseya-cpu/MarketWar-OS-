// A fake SMTP server that speaks enough of the protocol to exercise the real
// client against a real socket: greeting, EHLO, STARTTLS upgrade, AUTH LOGIN,
// then MAIL/RCPT/DATA/RSET in a loop.
//
// Worth the trouble. Testing the batch sender only through stubs missed a hang
// that a live server reproduced immediately — after the STARTTLS upgrade the
// timeout was still attached to the discarded plaintext socket, so a connection
// that died mid-session never settled at all.
//
// The certificate is generated per run, never committed: a private key in the
// repository is a credential regardless of what it is for.
import net from "node:net";
import tls from "node:tls";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let creds = null;
/** Returns null when openssl is unavailable, so the caller can skip rather than fail. */
export function tlsCreds() {
  if (creds !== null) return creds;
  try {
    const dir = mkdtempSync(join(tmpdir(), "mw-smtp-test-"));
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-keyout", join(dir, "key.pem"),
      "-out", join(dir, "cert.pem"), "-days", "1", "-nodes",
      "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
    ], { stdio: "ignore" });
    creds = { key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) };
    rmSync(dir, { recursive: true, force: true });
  } catch { creds = false; }
  return creds;
}

export function fakeSmtp({ rejectRecipients = new Set(), dropAfter = Infinity } = {}) {
  const creds = tlsCreds();
  if (!creds) throw new Error("openssl unavailable");
  const received = [];
  let connections = 0;

  const wire = (sock, state) => {
    let buf = "";
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
        if (state.inData) {
          if (line === ".") {
            state.inData = false;
            received.push({ to: state.currentTo, body: state.body });
            state.body = ""; state.delivered++;
            sock.write(`250 2.0.0 Ok: queued as MSG${state.delivered}\r\n`);
            if (state.delivered >= dropAfter) sock.destroy();
          } else state.body += line + "\n";
          continue;
        }
        const up = line.toUpperCase();
        if (up.startsWith("EHLO")) sock.write("250-fake\r\n250-STARTTLS\r\n250 AUTH LOGIN\r\n");
        else if (up === "STARTTLS") {
          sock.write("220 2.0.0 Ready to start TLS\r\n");
          // The plaintext parser must stop reading, or raw TLS bytes are fed to
          // it as if they were SMTP lines.
          sock.removeAllListeners("data");
          const secure = new tls.TLSSocket(sock, { isServer: true, ...creds });
          const s2 = { inData: false, body: "", currentTo: null, delivered: state.delivered, auth: "none" };
          secure.on("error", () => {});
          wire(secure, s2);
          return;
        }
        else if (up.startsWith("AUTH LOGIN")) { state.auth = "user"; sock.write("334 VXNlcm5hbWU6\r\n"); }
        else if (state.auth === "user") { state.auth = "pass"; sock.write("334 UGFzc3dvcmQ6\r\n"); }
        else if (state.auth === "pass") { state.auth = "ok"; sock.write("235 2.7.0 Authenticated\r\n"); }
        else if (up.startsWith("MAIL FROM")) sock.write("250 2.1.0 Ok\r\n");
        else if (up.startsWith("RCPT TO")) {
          state.currentTo = (line.match(/<([^>]+)>/) || [])[1] || "";
          sock.write(rejectRecipients.has(state.currentTo) ? "550 5.1.1 No such user\r\n" : "250 2.1.5 Ok\r\n");
        }
        else if (up === "DATA") { state.inData = true; sock.write("354 End data\r\n"); }
        else if (up === "RSET") sock.write("250 2.0.0 Ok\r\n");
        else if (up === "QUIT") { sock.write("221 2.0.0 Bye\r\n"); sock.end(); }
        else sock.write("250 Ok\r\n");
      }
    });
    sock.on("error", () => {});
  };

  const server = net.createServer((sock) => {
    connections++;
    sock.write("220 fake ESMTP\r\n");
    wire(sock, { inData: false, body: "", currentTo: null, delivered: 0, auth: "none" });
  });

  return {
    received,
    connections: () => connections,
    listen: () => new Promise((res) => server.listen(0, "127.0.0.1", () => res(server.address().port))),
    close: () => new Promise((res) => server.close(() => res())),
  };
}
