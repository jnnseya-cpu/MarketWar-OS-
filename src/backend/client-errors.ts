// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Crashes the browser caught, kept where somebody can read them.
//
// The error boundary existed and was doing half a job: it stopped the white
// screen and then dropped the error on the floor. "Something broke — the OS
// caught it" is a kind thing to show a customer and a useless thing to leave
// behind, because the next question is always "broke how", and nothing in the
// product could answer it.
//
// Deliberately small. A ring of the most recent crashes, grouped by what
// actually distinguishes them — the message and the route — with a count and a
// last-seen, so one bad component crashing four hundred times is one row and not
// four hundred. No user id, no page contents, nothing from the customer's data:
// what is needed to fix a crash is what threw and where.

import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import { createHash } from "crypto";

export type ClientError = {
  ref: string;
  message: string;
  route: string;
  digest?: string;
  stack?: string;
  userAgent?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
};

const COLLECTION = "client_errors";
const CAP = 200;
const mem = new Map<string, ClientError>();

/** Same message on the same route is the same bug, however many times it fires. */
const refFor = (message: string, route: string): string =>
  createHash("sha256").update(`${message}|${route}`).digest("hex").slice(0, 10);

export async function recordClientError(input: {
  message: string;
  route: string;
  digest?: string;
  stack?: string;
  userAgent?: string;
  at: string;
}): Promise<string> {
  const ref = refFor(input.message, input.route);
  const base: ClientError = {
    ref,
    message: input.message,
    route: input.route,
    digest: input.digest || undefined,
    stack: input.stack || undefined,
    userAgent: input.userAgent || undefined,
    count: 1,
    firstSeen: input.at,
    lastSeen: input.at,
  };

  try {
    if (adminConfigured && adminDb) {
      const doc = adminDb.collection(COLLECTION).doc(ref);
      const snap = await doc.get();
      const prev = snap.exists ? (snap.data() as ClientError) : null;
      await doc.set(
        prev
          ? { ...prev, count: (prev.count || 0) + 1, lastSeen: input.at, stack: prev.stack || base.stack }
          : base,
        { merge: true },
      );
      return ref;
    }
  } catch { /* fall through to memory rather than losing the report */ }

  const prev = mem.get(ref);
  mem.set(ref, prev ? { ...prev, count: prev.count + 1, lastSeen: input.at } : base);
  if (mem.size > CAP) {
    const oldest = [...mem.values()].sort((a, b) => a.lastSeen.localeCompare(b.lastSeen))[0];
    if (oldest) mem.delete(oldest.ref);
  }
  return ref;
}

/** Most recent first — the list an operator reads after a customer says "it broke". */
export async function recentClientErrors(limit = 50): Promise<ClientError[]> {
  try {
    if (adminConfigured && adminDb) {
      const snap = await adminDb.collection(COLLECTION).limit(CAP).get();
      return snap.docs
        .map((d) => d.data() as ClientError)
        .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
        .slice(0, limit);
    }
  } catch { /* memory is better than nothing */ }
  return [...mem.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).slice(0, limit);
}
