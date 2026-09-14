import tls from "node:tls";
import { tlsCreds } from "./fake-smtp.mjs";

// A REAL IMAP SERVER, SMALL ENOUGH TO REASON ABOUT.
//
// The placement reader has to be proved against a socket, not a stub, for the
// same reason the SMTP batch tests are: the bugs live in the protocol, not in
// the logic above it. Specifically it has to be proved against LITERALS — IMAP
// announces a payload as `{123}` and then sends exactly 123 bytes which may
// contain anything, including text that looks exactly like a tagged completion
// line. A stub that returns tidy strings never exercises the one piece of
// parsing that can silently truncate somebody's mail.
//
// So this speaks the real protocol for the handful of commands the reader uses,
// and can be told to put a message in any folder with any Gmail labels — which
// is the whole matrix placement has to get right.

export function fakeImap({ folders = {}, supportsLabels = true, refuseLogin = false } = {}) {
  const creds = tlsCreds();
  if (!creds) return null;

  // folders: { "INBOX": [{ uid, subject, labels: [] }], "[Gmail]/Spam": [...] }
  const state = { selected: "", seenFlagsTouched: [] };
  const log = [];

  const server = tls.createServer({ key: creds.key, cert: creds.cert }, (sock) => {
    let buf = "";
    sock.write("* OK fake-imap ready\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let nl;
      while ((nl = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const [tag, cmd, ...rest] = line.split(" ");
        const arg = rest.join(" ");
        log.push(line);
        const ok = (t) => sock.write(`${tag} OK ${t}\r\n`);
        const no = (t) => sock.write(`${tag} NO ${t}\r\n`);

        if (/^LOGIN$/i.test(cmd)) {
          if (refuseLogin) no("AUTHENTICATIONFAILED");
          else ok("LOGIN completed");
        } else if (/^SELECT$/i.test(cmd)) {
          const name = arg.replace(/^"|"$/g, "");
          // A SERVER WITHOUT THAT FOLDER SAYS NO, AND THAT IS NOT AN ERROR — it
          // is how the reader learns this receiver has no "[Gmail]/Spam".
          if (!(name in folders)) { no("Mailbox doesn't exist"); continue; }
          state.selected = name;
          sock.write(`* ${folders[name].length} EXISTS\r\n`);
          ok("[READ-WRITE] SELECT completed");
        } else if (/^UID$/i.test(cmd)) {
          const [sub, ...uidRest] = arg.split(" ");
          const uidArg = uidRest.join(" ");
          if (/^SEARCH$/i.test(sub)) {
            const m = /HEADER SUBJECT "([^"]*)"/i.exec(uidArg);
            const needle = m ? m[1] : "";
            const hits = (folders[state.selected] || [])
              .filter((msg) => String(msg.subject || "").includes(needle))
              .map((msg) => msg.uid);
            sock.write(`* SEARCH${hits.length ? " " + hits.join(" ") : ""}\r\n`);
            ok("UID SEARCH completed");
          } else if (/^FETCH$/i.test(sub)) {
            const uid = uidArg.split(" ")[0];
            const msg = (folders[state.selected] || []).find((x) => String(x.uid) === String(uid));
            if (/X-GM-LABELS/i.test(uidArg)) {
              // A receiver with no tabs does not know this extension at all.
              if (!supportsLabels) { no("Unknown FETCH item"); continue; }
              const labels = (msg?.labels ?? []).map((l) => (/\s/.test(l) ? `"${l}"` : l)).join(" ");
              sock.write(`* 1 FETCH (UID ${uid} X-GM-LABELS (${labels}))\r\n`);
              ok("UID FETCH completed");
            } else {
              // The literal path — deliberately exercised with a body that
              // contains a line looking exactly like a tagged OK.
              const raw = msg?.raw ?? `Subject: ${msg?.subject ?? ""}\r\n\r\nbody\r\n`;
              const bytes = Buffer.byteLength(raw, "utf8");
              sock.write(`* 1 FETCH (UID ${uid} BODY[] {${bytes}}\r\n`);
              sock.write(raw);
              sock.write(")\r\n");
              ok("UID FETCH completed");
            }
          } else if (/^STORE$/i.test(sub)) {
            state.seenFlagsTouched.push(uidArg);
            ok("UID STORE completed");
          } else ok("done");
        } else if (/^LOGOUT$/i.test(cmd)) {
          sock.write("* BYE\r\n");
          ok("LOGOUT completed");
          sock.end();
        } else {
          ok("done");
        }
      }
    });
    sock.on("error", () => { /* client hung up */ });
  });

  return {
    listen: () => new Promise((res) => server.listen(0, "127.0.0.1", () => res(server.address().port))),
    close: () => new Promise((res) => server.close(res)),
    /** Every command the reader sent — so "it never marked anything read" is checkable. */
    log,
    state,
  };
}
