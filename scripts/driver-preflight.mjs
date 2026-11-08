// WHAT A DRIVER NEEDS BEFORE IT CAN PROVE ANYTHING — AND WHAT IT SAYS WHEN THE
// THING IS NOT THERE.
//
// THE PROBLEM THIS ENDS. Twenty drivers prove behaviour by running it, and four
// of them cannot run in this container. Not because of a defect — one needs
// Firebase Admin, two need a server listening on :3000, one needs DNS — but
// because the preconditions are not met. What they DID was throw:
//
//     TypeError: Cannot read properties of null (reading 'createUser')
//     Error: connect ECONNREFUSED 127.0.0.1:3000
//
// A stack trace reads like a defect. Somebody running the driver sweep sees red
// and goes looking for a bug that is not there, or — far worse — learns to
// ignore a red driver, and the next one that is genuinely broken is ignored too.
//
// It also breaks this repository's own rule: *never declare success without
// verification; if it cannot be tested here, say so plainly rather than
// implying it was.* A crash says neither "passed" nor "not run" — it says
// "broken", which is a third thing and the only one that is untrue.
//
// So a driver states its preconditions at the top. When one is unmet it prints
// an unmissable banner, reports `0 proven, 0 broken — NOT EXERCISED`, and exits
// 0 so a sweep stays honest-green rather than red-for-the-wrong-reason. The
// banner is the point: a skip has to be louder than a pass, or it reads as one.

import net from "node:net";

const say = (m) => process.stdout.write(m + "\n");

function skip(what, why, remedy) {
  say("");
  say("  ┌─────────────────────────────────────────────────────────────────┐");
  say("  │  NOT EXERCISED — nothing was proven and nothing was broken      │");
  say("  └─────────────────────────────────────────────────────────────────┘");
  say("");
  say(`  This driver needs ${what}, and ${why}.`);
  say("");
  say(`  To run it: ${remedy}`);
  say("");
  say("  Exiting 0 on purpose: a missing precondition is not a defect, and a");
  say("  red run for a reason that is not the code teaches people to ignore");
  say("  red runs. 0 proven, 0 broken.");
  say("");
  process.exit(0);
}

/** Is anything listening there? */
export function portIsOpen(port, host = "127.0.0.1", timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port });
    const done = (v) => { try { s.destroy(); } catch { /* already gone */ } resolve(v); };
    s.setTimeout(timeoutMs);
    s.on("connect", () => done(true));
    s.on("timeout", () => done(false));
    s.on("error", () => done(false));
  });
}

/**
 * A driver that drives the platform over HTTP needs the platform running.
 *
 * Checked rather than assumed, because the assumption's failure mode is an
 * ECONNREFUSED stack trace forty lines into the run, after the preamble has
 * already printed what it was about to prove.
 */
export async function requireServer(port = 3000, how = "npm run build && npm start") {
  if (await portIsOpen(port)) return;
  skip(
    `the platform running on port ${port}`,
    "nothing is listening there",
    `${how} — then run this driver in a second terminal`,
  );
}

/**
 * A driver that needs a real Firestore/Auth needs the Admin SDK configured.
 *
 * `adminAuth` and `adminDb` are null without credentials, so every use of them
 * is a null-property throw rather than a refusal.
 */
export async function requireFirebaseAdmin(resolvePath) {
  const fa = await import(resolvePath);
  if (fa.adminAuth && fa.adminDb) return fa;
  skip(
    "Firebase Admin (a real Auth user and Firestore)",
    "no service-account credentials are configured on this machine",
    "set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY (or point at the emulator) and run it again",
  );
  return fa; // unreachable; keeps the signature honest for a caller that reads it
}

/** A driver that reaches the public internet needs DNS, which this container has none of. */
export async function requireDns(host = "example.com") {
  try {
    const { lookup } = await import("node:dns/promises");
    await lookup(host);
    return;
  } catch {
    skip(
      `outbound DNS (it resolves ${host})`,
      "this container has no DNS, so every lookup fails",
      "run it from a machine with network access",
    );
  }
}

/**
 * A driver that audits the SHIPPED pages needs a production build.
 *
 * A dev server renders a different robots.txt and a different set of links, so
 * auditing one measures the wrong thing — which is why these drivers refuse.
 * Refusing with exit 1 made them look broken in a sweep; this says which.
 */
export async function requireBuild(buildIdPath) {
  const { existsSync } = await import("node:fs");
  if (existsSync(buildIdPath)) return;
  skip(
    "a production build (.next/BUILD_ID)",
    "there is not one in this working tree",
    "npm run build — then run this driver again",
  );
}

/**
 * KILL THE SERVER, NOT ITS LAUNCHER.
 *
 * `spawn("npx", ["next", "start", …])` is TWO processes: npx, and the `next`
 * server it forks. Signalling the child reaches npx and leaves the real server
 * listening — so the driver exited cleanly, the port stayed busy, and the NEXT
 * run of the same driver refused with "something is already serving on this
 * port". Correctly: it would otherwise have audited the previous build. But it
 * made the driver pass once and fail every time after, which only showed up
 * when `verify:drivers` started running them on every push.
 *
 * `detached: true` puts the pair in their own process group, and a negative pid
 * signals the whole group. Falls back to signalling the child, because a group
 * kill throws if the group is already gone.
 */
export function stopServer(child, signal = "SIGKILL") {
  try {
    if (child?.pid) process.kill(-child.pid, signal);
  } catch {
    try { child?.kill(signal); } catch { /* already gone */ }
  }
}
