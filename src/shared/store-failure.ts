// WHY THE DATABASE SAID NO — and why "no data" must never be one of the answers.
//
// THE DEFECT THIS EXISTS TO REMOVE, found by reading `countContacts`:
//
//   try  { return (await …count().get()).data().count; }
//   catch { /* Aggregation unavailable → fall back to a full paged count. */
//           return (await listContacts(brandId)).length; }
//
// The comment names ONE cause and the catch swallows every cause. The one that
// matters is `RESOURCE_EXHAUSTED` — the project is out of Firestore quota — and
// the response to it was to run the single most expensive operation available: a
// full paged scan of every contact the brand has, at exactly the moment the
// project has no reads left. It then fails again, from `listContacts`, which has
// no catch at all, so the customer gets a crash instead of a sentence.
//
// AND THE QUIETER HALF IS WORSE. Everywhere else a swallowed store error becomes
// an empty array, so a database that is refusing us is indistinguishable from a
// vault with nobody in it. This platform already has that defect class written
// down — "'It found nothing' has seven identical-looking causes" — and a store
// failure is the one cause nobody thinks of, because the screen says the thing
// that is normally true.
//
// So: classify from the error the driver actually threw, say which of the seven
// it is, and never offer a remedy the failure does not support.
//
// gRPC STATUS CODES ARE THE EVIDENCE. Firestore's driver puts a numeric `code`
// on the error, and those numbers are a stable contract — far more reliable than
// matching on message text, which is localised, versioned and reworded. Text is
// read only as a fallback for the cases where a code never arrives.
//
// PURE, and in `shared/`, for the same reason as `provider-failure.ts`: the
// store needs it, the surfaces that explain need it, and a test must be able to
// assert on it without a database.

export type StoreFailureKind =
  | "quota"          // out of Firestore quota or rate — reads/writes refused
  | "permission"     // rules or IAM said no
  | "unauthenticated" // the credential is missing, expired or wrong
  | "unavailable"    // the backend is down or unreachable, transient
  | "deadline"       // it took too long — usually an unindexed or huge query
  | "index"          // a composite index this query needs is not deployed
  | "not_found"      // the database or collection path does not exist
  | "conflict"       // a transaction lost its race, retry is correct
  | "unknown";       // unrecognised — the driver's own words are passed through

export type StoreFailure = {
  kind: StoreFailureKind;
  /** One sentence: what happened, in the reader's terms. */
  why: string;
  /** The single action that fixes it, or "" when the failure does not support one. */
  fix: string;
  /** TRUE when trying the same thing again could reasonably work. */
  retryable: boolean;
  /**
   * TRUE when a caller must NOT fall back to a more expensive read.
   *
   * This is the field the original defect needed. Out of quota, the correct
   * response to a cheap aggregate failing is to stop — not to attempt the
   * expensive scan it was an optimisation for.
   */
  costly: boolean;
};

/** gRPC canonical codes. Numbers, because the text is not a contract. */
const CODE: Record<number, StoreFailureKind> = {
  4: "deadline",
  5: "not_found",
  7: "permission",
  8: "quota",
  10: "conflict",
  14: "unavailable",
  16: "unauthenticated",
};

const asRecord = (e: unknown): Record<string, unknown> =>
  (e && typeof e === "object" ? e as Record<string, unknown> : {});

const messageOf = (e: unknown): string => {
  const r = asRecord(e);
  if (typeof r.message === "string") return r.message;
  if (typeof r.details === "string") return r.details;
  return typeof e === "string" ? e : "";
};

export function readStoreFailure(e: unknown): StoreFailure {
  const msg = messageOf(e);
  const r = asRecord(e);
  const code = typeof r.code === "number" ? r.code : undefined;

  // THE INDEX CASE IS READ FROM THE TEXT ON PURPOSE. Firestore reports a missing
  // composite index as FAILED_PRECONDITION (9) with a message containing the
  // console URL that creates it — and that URL is the entire remedy, so it is
  // worth far more than the code alone.
  const indexUrl = /https:\/\/console\.firebase\.google\.com\/[^\s"']+/.exec(msg)?.[0] || "";
  if (/requires an index|needs an index|no matching index/i.test(msg)) {
    return {
      kind: "index", retryable: false, costly: false,
      why: "This query needs a composite index that is not deployed, so Firestore refused it outright.",
      fix: indexUrl
        ? `Create it: ${indexUrl} — then add the same index to firestore.indexes.json so it survives the next deploy. \`npm run check:indexes\` exists to catch this before it reaches production.`
        : "Add the index to firestore.indexes.json and deploy it. `npm run check:indexes` catches this class before it ships.",
    };
  }

  const kind: StoreFailureKind = (code !== undefined && CODE[code]) || textKind(msg) || "unknown";

  switch (kind) {
    case "quota":
      return {
        kind, retryable: false, costly: true,
        why: "The database refused the operation because the project is out of quota — reads, writes or the spending cap.",
        fix: "Check the Firebase console's usage tab. On the Spark plan this resets at midnight Pacific; on Blaze it means a budget cap was hit. "
          + "Nothing in the code will change this and a retry will not either.",
      };
    case "permission":
      return {
        kind, retryable: false, costly: false,
        why: "The database understood the request and refused it — the security rules or the service account's IAM role denied it.",
        fix: "If this is a server path it should be using the Admin SDK, which bypasses rules: check the credential is really loading. "
          + "If it is a client path, the rules are correct to refuse and the code is asking for something it should not have.",
      };
    case "unauthenticated":
      return {
        kind, retryable: false, costly: false,
        why: "The database did not accept the credential at all — missing, expired, or belonging to another project.",
        fix: "Re-check the Firebase Admin credentials for this deployment. Paste the WHOLE service-account JSON into FIREBASE_PRIVATE_KEY.",
      };
    case "unavailable":
      return {
        kind, retryable: true, costly: false,
        why: "The database was unreachable or is having an incident. Nothing is wrong with this deployment.",
        fix: "Retry. If it persists, check status.firebase.google.com before changing anything here.",
      };
    case "deadline":
      return {
        kind, retryable: true, costly: true,
        why: "The operation ran out of time. That is almost always a query scanning far more than it should.",
        fix: "Narrow the query or add the index it needs. Retrying the same query will usually time out again.",
      };
    case "conflict":
      return {
        kind, retryable: true, costly: false,
        why: "A transaction lost its race with another writer.",
        fix: "Retry — this is the transaction doing its job, not a fault.",
      };
    case "not_found":
      return {
        kind, retryable: false, costly: false,
        why: "The database or the path does not exist on this project.",
        fix: "Check FIREBASE_PROJECT_ID names the project you think it does, and that Firestore has been created in it.",
      };
    default:
      return {
        kind: "unknown", retryable: false, costly: false,
        // THE DRIVER'S OWN WORDS, NOT A GUESS. An unrecognised failure with a
        // confident remedy attached sends somebody to fix the wrong thing, and
        // the next honest message from the same screen is then discounted.
        why: msg ? `The database refused the operation: ${msg}` : "The database refused the operation and said nothing useful about why.",
        fix: "",
      };
  }
}

/** Last resort when no numeric code arrived — a REST path, or a wrapped error. */
function textKind(msg: string): StoreFailureKind | null {
  if (!msg) return null;
  if (/RESOURCE_EXHAUSTED|quota|rate limit|too many requests/i.test(msg)) return "quota";
  if (/PERMISSION_DENIED|permission denied|insufficient permission/i.test(msg)) return "permission";
  if (/UNAUTHENTICATED|invalid credential|could not refresh access token/i.test(msg)) return "unauthenticated";
  if (/UNAVAILABLE|ECONNREFUSED|ENOTFOUND|socket hang up/i.test(msg)) return "unavailable";
  if (/DEADLINE_EXCEEDED|deadline|timed? ?out/i.test(msg)) return "deadline";
  if (/ABORTED|too much contention/i.test(msg)) return "conflict";
  if (/NOT_FOUND|does not exist/i.test(msg)) return "not_found";
  return null;
}

/**
 * Is this a failure a caller must NOT answer with a bigger, more expensive read?
 *
 * Named separately because it is the whole point of the original defect: the
 * cheap aggregate failed, and the fallback was the expensive scan the aggregate
 * existed to avoid.
 */
export const mustNotEscalate = (e: unknown): boolean => readStoreFailure(e).costly;

/**
 * What a SURFACE should say when a read failed — never "no results".
 *
 * An empty list and a refused database look identical on a screen, and this
 * platform has already paid for that confusion more than once.
 */
export function storeFailureNote(e: unknown): string {
  const f = readStoreFailure(e);
  return f.fix ? `${f.why} ${f.fix}` : f.why;
}

// ---------------------------------------------------------------------------
// A DEADLINE, BECAUSE THE DRIVER'S OWN RETRY IS NOT ONE.
// ---------------------------------------------------------------------------
//
// MEASURED, NOT ASSUMED. With Firebase Admin configured and Firestore
// unreachable, a single-document transaction in `webhook-receipt.ts` blocked for
// **over 75 seconds** and a single-document read for **41 seconds**. The function
// wrapping it had a `try/catch` with an honest comment promising that a failed
// bookkeeping write could never affect the response — and that promise could not
// be kept, because the catch cannot run until the gRPC client has finished
// retrying UNAVAILABLE, and that is far longer than any serverless invocation
// lives. The route is killed first, so Stripe gets no answer at all.
//
// So a `try/catch` around a store call is NOT a bound on how long it takes. This
// is the bound. It is in `shared/` with the classifier because it is pure timing
// and a test must be able to drive it without a database.
//
// WHAT IT DOES NOT DO: cancel the underlying call. Firestore's client offers no
// cancellation, so the original promise is left to finish or fail on its own with
// its rejection swallowed — the alternative is an unhandled rejection crashing the
// process minutes after the caller gave up. On serverless the invocation ends
// first and the attempt dies with it, which is exactly what should happen to a
// bookkeeping write nobody is waiting for.

/** The outcome of a bounded store call. A timeout is a `deadline` failure. */
export type Deadlined<T> =
  | { ok: true; value: T }
  | { ok: false; failure: StoreFailure; timedOut: boolean };

/**
 * Run a store call with a hard ceiling on how long the CALLER waits.
 *
 * @param what  the operation, for the explanation — e.g. "the webhook receipt"
 * @param ms    the ceiling. Pick it from measured healthy latency, with headroom
 *              for a cold connection: a deadline under the real cold-start cost
 *              silently drops work on a store that is working perfectly.
 */
export async function withStoreDeadline<T>(
  what: string,
  ms: number,
  run: () => Promise<T>,
): Promise<Deadlined<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const TIMED_OUT = Symbol("store-deadline");
  try {
    // Started before the race so a rejection arriving AFTER the deadline is
    // already handled and cannot surface as an unhandled rejection.
    const attempt = run();
    const settled = attempt.then((v) => ({ v }), (e) => ({ e }));
    const raced = await Promise.race([
      settled,
      new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), Math.max(1, ms)); }),
    ]);
    if (raced === TIMED_OUT) {
      return {
        ok: false,
        timedOut: true,
        failure: {
          kind: "deadline",
          retryable: true,
          costly: true,
          why: `${what} did not complete within ${ms}ms. The datastore is not answering; this is a bound the caller imposed, not an error the datastore reported.`,
          fix: "Check the Firestore status and the service account's network path. Nothing was lost that the caller could not do without — a bounded wait is what stops one slow write taking the whole request down with it.",
        },
      };
    }
    if ("e" in raced) return { ok: false, timedOut: false, failure: readStoreFailure(raced.e) };
    return { ok: true, value: raced.v };
  } finally {
    // Or the pending timer keeps the event loop alive for the full `ms` after a
    // call that already returned in 18.
    if (timer) clearTimeout(timer);
  }
}
