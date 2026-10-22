// A CONTENT ENCODING WE NEVER ASKED FOR IS NOT WORTH DECODING.
//
// WHY THIS EXISTS, AND IT IS A MEASUREMENT RATHER THAN A PRECAUTION.
// Node's October 2026 security releases fixed CVE-2026-111497, a HIGH-severity
// out-of-bounds write in the Brotli decoder that permits remote code execution.
// This platform fetches third-party pages constantly — the free audit crawls any
// URL a stranger types with no account at all, and the enrichment crawl follows
// domains and social pages out of an imported list. So the decoder is reachable
// by somebody who chooses what it is fed.
//
// THREE THINGS WERE MEASURED ON NODE 22 BEFORE ANY OF THIS WAS WRITTEN, because
// the first two contradicted what was about to be built:
//
//   1. Our crawl does NOT request Brotli. `fetch` sends
//      `Accept-Encoding: gzip, deflate` by default, so the obvious mitigation —
//      excluding `br` from the request — changes nothing. The two requests are
//      byte-identical in that header.
//   2. A server can send `Content-Encoding: br` ANYWAY, and fetch decompresses
//      it even though it was never asked for. So no request header protects the
//      decoder: proven by serving an unsolicited Brotli body and reading it back
//      decompressed.
//   3. Decoding happens when the BODY IS READ, not when the response arrives.
//      A corrupt Brotli payload let `fetch()` resolve, left the header readable,
//      and allowed the body to be cancelled unread.
//
// (3) is what makes a mitigation possible at all: refuse at the header, cancel
// the body, and the attacker-controlled bytes never reach the decoder. That
// holds whatever version the runtime happens to be, which matters because the
// platform runs on a managed runtime whose patch timing is not ours to choose.
//
// A FOURTH MEASUREMENT, WORTH ITS OWN LINE. Reading a CORRUPT Brotli body did
// not throw — it returned a string of length 0. So a hostile or broken response
// currently reads as a page with no content rather than a page that could not be
// read, which is this repository's second defect class exactly: a check failing
// for a reason unrelated to what it tests. Refusing at the header removes that
// silent-empty case as well.
//
// WHAT THIS COSTS, STATED. A site that serves `br` to a client which asked for
// `gzip, deflate` is behaving outside RFC 9110, which says a server should not
// use a coding the request did not accept. Those pages now report as unreadable
// instead of being audited. That is a real if small loss of coverage, and it
// buys the removal of an unauthenticated path to a decoder with a published RCE.
//
// WHAT THIS IS NOT. It is not a substitute for the patched runtime. The runtime
// is the fix; this is the part that does not wait for somebody else to deploy
// it, and it keeps holding for the next decoder advisory.

/**
 * Encodings we refuse to let a third party hand us.
 *
 * `br` is the one with the current advisory. `zstd` is here for the same reason
 * rather than a different one: it is the other heavy native decoder reachable
 * from a response header, we never request it either, and a decoder we do not
 * ask for is a decoder with no reason to run on somebody else's bytes.
 *
 * `gzip` and `deflate` are NOT refused — we request them, every real site uses
 * them, and refusing them would stop the crawler working at all.
 */
export const REFUSED_ENCODINGS = ["br", "zstd"] as const;

/** Encodings the crawl asks for, and therefore accepts. Kept beside the refusal
 *  so the two cannot drift: anything we request must never be in the list above. */
export const REQUESTED_ENCODING = "gzip, deflate";

export type EncodingRefusal = {
  encoding: string;
  /** One sentence, in the customer's terms, for a report rather than a log. */
  why: string;
};

/**
 * Should this response's body be refused on its declared encoding?
 *
 * Returns null for everything normal — no header, an empty header, `identity`,
 * gzip, deflate, or any combination of those. A header is only refused when it
 * names an encoding on the list above.
 *
 * CASE AND WHITESPACE ARE NORMALISED, and a MULTI-CODING header is split rather
 * than compared whole: a response may legitimately declare `gzip, br`, and a
 * check written as `header === "br"` would pass it straight through — which is
 * the shape of bug that makes a guard worse than none, because it reads as
 * protection in every review.
 */
export function refuseResponseEncoding(header: string | null | undefined): EncodingRefusal | null {
  const raw = String(header ?? "").trim();
  if (!raw) return null;
  const codings = raw.toLowerCase().split(",").map((c) => c.trim().split(";")[0].trim()).filter(Boolean);
  const hit = codings.find((c) => (REFUSED_ENCODINGS as readonly string[]).includes(c));
  if (!hit) return null;
  return {
    encoding: hit,
    why: `This page was returned ${hit === "br" ? "Brotli" : hit}-compressed, which was not requested, so it was not decoded. `
      + `The reason is specific: Node's October 2026 security release fixed an out-of-bounds write in the ${hit === "br" ? "Brotli" : hit} `
      + `decoder that permits remote code execution, and a page we did not ask to be compressed this way is not worth feeding to it. `
      + `A server sending a coding the request did not accept is behaving outside RFC 9110; the page itself may be perfectly fine.`,
  };
}

/** Thrown by a body reader that refused, so a caller's existing failure path
 *  reports the page as unreadable rather than as empty. Named so a catch can
 *  tell it apart from a timeout. */
export class RefusedEncodingError extends Error {
  readonly encoding: string;
  constructor(refusal: EncodingRefusal) {
    super(refusal.why);
    this.name = "RefusedEncodingError";
    this.encoding = refusal.encoding;
  }
}

/**
 * The Node release line's patched version, for a runtime that reports itself.
 *
 * NOT a floor in `engines`. This platform runs on a managed runtime, and §5.0 of
 * `docs/STATE.md` records what happened the last time a version somebody else
 * controls was turned into a hard requirement: `engines: 22.x` exists BECAUSE a
 * pin that the host had to agree to took production down twice. A floor of
 * 22.23.4 would fail every deployment until the host ships it, which converts
 * somebody else's patch schedule into our outage.
 *
 * So the version is reported instead of enforced, and the health endpoint says
 * whether the runtime answering right now is patched.
 */
export const NODE_SECURITY_RELEASES: { line: number; fixed: string; published: string }[] = [
  { line: 22, fixed: "22.23.4", published: "2026-10-21" },
  { line: 24, fixed: "24.22.1", published: "2026-10-21" },
  { line: 26, fixed: "26.12.1", published: "2026-10-21" },
];

const parts = (v: string): number[] => v.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);

/** Is `version` at or above `atLeast`? Numeric per segment, so 22.9.0 < 22.23.4. */
export function versionAtLeast(version: string, atLeast: string): boolean {
  const a = parts(version);
  const b = parts(atLeast);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return true;
}

export type RuntimeSecurity = {
  running: string;
  line: number;
  /** null when this line has no advisory recorded here. */
  fixedVersion: string | null;
  patched: boolean;
  /** What to do, or why there is nothing to do. Never "upgrade Node" with no address. */
  verdict: string;
};

/**
 * Whether the runtime answering this request carries October 2026's fixes.
 *
 * WHY THIS IS A REPORT AND NOT AN ALERT. "Never tell the owner to go and look"
 * runs both ways: a platform that cannot say which runtime it is on sends its
 * owner to SSH into a machine that, in this architecture, does not exist. The
 * frontend runs on a managed host, so the action is a redeploy once the host
 * ships the patch — and the only honest way to know it has shipped is to ask the
 * process that is running.
 */
export function runtimeSecurity(version = process.version): RuntimeSecurity {
  const running = version.replace(/^v/, "");
  const line = parts(running)[0] ?? 0;
  const rel = NODE_SECURITY_RELEASES.find((r) => r.line === line);
  if (!rel) {
    return {
      running, line, fixedVersion: null, patched: false,
      verdict: line < 22
        ? `Node ${line} is past end of life and receives no security fixes at all. The October 2026 releases do not cover it; move to 22 or newer.`
        : `No advisory is recorded here for the Node ${line} line. Check nodejs.org/en/blog/vulnerability before assuming it is unaffected.`,
    };
  }
  const patched = versionAtLeast(running, rel.fixed);
  return {
    running, line, fixedVersion: rel.fixed, patched,
    verdict: patched
      ? `Node ${running} is at or above ${rel.fixed}, so it carries the ${rel.published} security fixes — including CVE-2026-111497, the Brotli decoder out-of-bounds write that permits remote code execution.`
      : `Node ${running} is BELOW ${rel.fixed}, the ${rel.published} security release. Six of those ten CVEs affect this line and four are High, including CVE-2026-111497 (Brotli decoder out-of-bounds write permitting remote code execution), CVE-2026-105482 (dns.resolve truncates names containing a NUL character) and CVE-2026-106069 (TLS hostname check bypassed when a host loosely resolves to an IP). On a managed host the action is to redeploy once the host ships ${rel.fixed}; the crawl refuses undecoded Brotli in the meantime.`,
  };
}
