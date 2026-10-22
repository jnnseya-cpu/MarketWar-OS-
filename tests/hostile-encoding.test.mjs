import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";

// A CODING WE NEVER ASKED FOR IS NOT WORTH DECODING.
//
// WHY THIS FILE EXISTS. Node's October 2026 security releases fixed
// CVE-2026-111497, a HIGH out-of-bounds write in the Brotli decoder that permits
// remote code execution. `/audit` fetches a URL of the caller's choosing with no
// account, so the decoder is reachable by somebody who picks what it is fed.
//
// THE TWO MEASUREMENTS THAT DECIDED THE DESIGN, both repeated below against a
// real socket rather than asserted from the source:
//
//   • Excluding `br` from the REQUEST changes nothing — fetch already sends
//     `gzip, deflate`. The obvious mitigation was a no-op, and it was one step
//     from being shipped with a confident commit message.
//   • A server can send `Content-Encoding: br` anyway and fetch decompresses it.
//     So no request header protects the decoder; only declining to read the body
//     does, and decoding is lazy enough to make that possible.
//
// MUTATION TESTED: 5 mutants, all killed — recorded in §167 of
// docs/REQUIREMENTS-COVERAGE.md.

const mod = () => import("../src/shared/hostile-encoding.ts");

test("the request still asks only for codings we are willing to decode", async () => {
  const { REQUESTED_ENCODING, REFUSED_ENCODINGS, refuseResponseEncoding } = await mod();

  // The two lists cannot drift into contradicting each other: anything we ask
  // for must never be on the refusal list, or the crawler refuses its own
  // requests and every page reads as unreadable.
  for (const coding of REQUESTED_ENCODING.split(",").map((c) => c.trim())) {
    assert.ok(!REFUSED_ENCODINGS.includes(coding), `we request "${coding}" and also refuse it`);
    assert.equal(refuseResponseEncoding(coding), null, `a response using "${coding}" must be read, not refused`);
  }
  assert.equal(refuseResponseEncoding("identity"), null);
  assert.equal(refuseResponseEncoding(""), null);
  assert.equal(refuseResponseEncoding(null), null);
  assert.equal(refuseResponseEncoding(undefined), null);
});

test("a refused coding is caught however the header is written", async () => {
  const { refuseResponseEncoding } = await mod();

  // CASE, SPACING AND MULTI-CODING. A check written as `header === "br"` passes
  // `gzip, br` straight through while reading as protection in every review,
  // which is the shape of guard that is worse than none.
  for (const header of ["br", "BR", " br ", "gzip, br", "br, gzip", "br;q=1.0", "identity, BR", "gzip,  br  ;q=0.9"]) {
    const r = refuseResponseEncoding(header);
    assert.ok(r, `"${header}" was not refused`);
    assert.equal(r.encoding, "br");
    // The sentence has to be usable in a customer-facing report: it names the
    // coding, says it was not requested, and does not blame their site.
    assert.match(r.why, /not requested/);
    assert.match(r.why, /Brotli/);
    assert.match(r.why, /may be perfectly fine/);
  }
  assert.equal(refuseResponseEncoding("zstd")?.encoding, "zstd");
  // And a coding that merely CONTAINS a refused name is not a refused coding.
  assert.equal(refuseResponseEncoding("brotli-ish"), null, "substring matching would refuse unrelated codings");
});

test("the crawler's own reader refuses an unsolicited Brotli body over a real socket", async () => {
  const { readCapped } = await import("../src/backend/crawler.ts");
  const { RefusedEncodingError } = await mod();

  // A server that returns Brotli although the request asked for gzip/deflate.
  const payload = zlib.brotliCompressSync(Buffer.from("<html><title>brotli body</title></html>"));
  const plain = Buffer.from("<html><title>plain body</title></html>");
  const srv = http.createServer((req, res) => {
    if (req.url === "/br") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "br" });
      return res.end(payload);
    }
    if (req.url === "/gzip") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      return res.end(zlib.gzipSync(plain));
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(plain);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;

  try {
    // THE MEASUREMENT THAT MADE THE MITIGATION NECESSARY: fetch decompresses a
    // coding it never asked for. If a future runtime stops doing that, this
    // assertion fails and tells the next reader the premise has changed.
    const raw = await fetch(`http://127.0.0.1:${port}/br`);
    assert.equal(raw.headers.get("content-encoding"), "br");
    assert.ok((await raw.text()).includes("brotli body"),
      "fetch no longer decompresses unsolicited Brotli — the reason for this guard has changed");

    // The guard: the same response through the real reader is refused, by name.
    const refused = await fetch(`http://127.0.0.1:${port}/br`);
    await assert.rejects(
      () => readCapped(refused, 1_500_000),
      (e) => {
        assert.ok(e instanceof RefusedEncodingError, `threw ${e.name} rather than refusing on the encoding`);
        assert.equal(e.encoding, "br");
        return true;
      },
      "an unsolicited Brotli body was read instead of refused",
    );

    // AND THE ORDINARY CASES STILL WORK, or the fix has broken the product it
    // was protecting. Gzip is requested, so it is read and decoded.
    const gz = await readCapped(await fetch(`http://127.0.0.1:${port}/gzip`), 1_500_000);
    assert.match(gz, /plain body/, "a gzip page is no longer readable");
    const none = await readCapped(await fetch(`http://127.0.0.1:${port}/none`), 1_500_000);
    assert.match(none, /plain body/, "an uncompressed page is no longer readable");

    // A RESPONSE WITH NO HEADERS AT ALL IS NOT A REFUSAL, and this is pinned
    // because the first version of the guard broke on it. `readCapped` is
    // deliberately tolerant of a response that cannot be streamed — the cap
    // test passes exactly this shape — and reading `res.headers.get(...)`
    // assumed a property the function does not require. A stand-in with no
    // headers has no declared encoding, which is the "nothing to refuse" case.
    const headerless = { body: null, arrayBuffer: async () => new TextEncoder().encode("y".repeat(40)).buffer };
    assert.equal((await readCapped(headerless, 10)).length, 10,
      "a response with no headers is now refused instead of read");
  } finally {
    srv.close();
  }
});

test("a corrupt Brotli body does not read back as a blank page", async () => {
  const { readCapped } = await import("../src/backend/crawler.ts");

  // THE SILENT FAILURE THIS ALSO REMOVES, and it is the repository's second
  // defect class: reading a CORRUPT Brotli body returns a zero-length string
  // WITHOUT throwing. So before the guard, a hostile or broken response was
  // indistinguishable from a page with no content — and this crawler holds
  // elsewhere that an empty body must never read as a pass.
  const corrupt = Buffer.from([0x1b, 0xff, 0xff, 0xff, 0x00, 0x11, 0x22, 0x33, 0x44]);
  const srv = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html", "content-encoding": "br" });
    res.end(corrupt);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  try {
    // The premise, measured: a corrupt body is swallowed rather than raised.
    const probe = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal((await probe.text()).length, 0, "a corrupt Brotli body now throws; the silent-empty premise has changed");

    // The guard turns that silence into a refusal the caller can report.
    await assert.rejects(async () => readCapped(await fetch(`http://127.0.0.1:${port}/`), 1_000),
      /not decoded|RefusedEncoding/,
      "a corrupt Brotli body still reads back as an empty page");
  } finally {
    srv.close();
  }
});

test("the runtime reports whether it carries the October 2026 fixes", async () => {
  const { runtimeSecurity, versionAtLeast, NODE_SECURITY_RELEASES } = await mod();

  // NUMERIC PER SEGMENT. A string comparison puts 22.9.0 above 22.23.4, which
  // would report a vulnerable runtime as patched — the exact direction of error
  // that matters here.
  assert.equal(versionAtLeast("22.23.4", "22.23.4"), true);
  assert.equal(versionAtLeast("22.23.5", "22.23.4"), true);
  assert.equal(versionAtLeast("22.24.0", "22.23.4"), true);
  assert.equal(versionAtLeast("22.23.3", "22.23.4"), false);
  assert.equal(versionAtLeast("22.9.0", "22.23.4"), false, "22.9.0 reads as newer than 22.23.4 under string comparison");
  assert.equal(versionAtLeast("v22.23.4", "22.23.4"), true, "a leading v must not change the answer");

  // The advisory's own numbers, so a typo here cannot pass unnoticed.
  assert.deepEqual(NODE_SECURITY_RELEASES.map((r) => r.fixed), ["22.23.4", "24.22.1", "26.12.1"]);

  const vulnerable = runtimeSecurity("v22.22.0");
  assert.equal(vulnerable.patched, false);
  assert.equal(vulnerable.fixedVersion, "22.23.4");
  assert.match(vulnerable.verdict, /BELOW 22\.23\.4/);
  assert.match(vulnerable.verdict, /CVE-2026-111497/, "the verdict must name the RCE rather than say 'update Node'");
  assert.match(vulnerable.verdict, /redeploy/, "on a managed host the action is a redeploy, and the verdict must say so");

  const fixed = runtimeSecurity("v22.23.4");
  assert.equal(fixed.patched, true);
  assert.match(fixed.verdict, /carries the 2026-10-21 security fixes/);

  // END OF LIFE IS ITS OWN ANSWER, not "no advisory recorded". Node 20 gets no
  // fix at all, and reporting that as unknown would read as reassurance.
  const eol = runtimeSecurity("v20.19.0");
  assert.equal(eol.patched, false);
  assert.match(eol.verdict, /end of life/i);

  // The real runtime this suite is running on, reported rather than asserted:
  // a test that fails when the container updates Node would be a test about the
  // container. The assertion is only that it answers.
  const live = runtimeSecurity();
  assert.equal(live.running, process.version.replace(/^v/, ""));
  assert.ok(live.verdict.length > 40);
});
