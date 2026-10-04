import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// BULK MAIL WITHOUT ONE-CLICK UNSUBSCRIBE IS NOT SENT.
//
// WHAT WAS WRONG, found by putting messages on a real wire and reading the bytes:
// bulk messages carried `List-ID` and `Feedback-ID` and **no `List-Unsubscribe`**.
//
// `shared/message-shape.ts` had always NAMED the absence — it pushes
// "List-Unsubscribe — required on bulk mail by Google, Yahoo, Apple and
// Microsoft" onto `missing` — and then the message went out anyway, because
// nobody reads `missing` and the header was set only when a CALLER remembered to
// pass a URL. `/api/email` and `/api/newsletter` remembered. `/api/review-requests`
// did not, and nor did `placement-probe.ts`, which therefore measured a message
// shaped differently from the campaigns it exists to predict.
//
// Since February 2024 that fails Gmail's and Yahoo's bulk-sender requirements
// outright, and an opt-out is separately required by PECR and CAN-SPAM. The cost
// is SHARED: the sending pool's reputation belongs to every tenant on it.
//
// So the mailer — the one place that knows a message is bulk — derives the link,
// and refuses to send when it cannot.

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the mailer derives the unsubscribe link rather than trusting the caller", () => {
  const code = codeOf(readFileSync("src/backend/email.ts", "utf8"));
  assert.match(code, /async function deriveListUnsubscribe\(/,
    "the one place that knows a message is bulk must be the place that guarantees the header");
  assert.match(code, /const \{ unsubscribeUrl \} = await import\("@\/backend\/email-events"\)/,
    "one source of truth for the sealed token; lazy because email-events imports this module");
  // A caller that DID pass one keeps it — the fix must not override a real URL.
  assert.match(code, /v\.item\.listUnsubscribe\s*\n?\s*\? Promise\.resolve\(v\.item\.listUnsubscribe\)/,
    "a supplied link must win over a derived one");
  // AND THE FALSE BRANCH MUST ACTUALLY DERIVE. The first version of this test
  // asserted only the true branch, so a mutation replacing the else with
  // `Promise.resolve(undefined)` — which is exactly the old broken behaviour —
  // left it passing. Half a ternary is half a check.
  assert.match(code, /: deriveListUnsubscribe\(common\.brandId \|\| "", v\.verdict\.email, common\.campaign \|\| ""\)/,
    "a caller that passed nothing must get a derived link, not undefined");
  assert.match(code, /listUnsubscribe: unsubFor\[i\]/, "and the derived link must reach the message");
});

test("bulk with no derivable opt-out is REFUSED, and the reason is about the message", () => {
  const code = codeOf(readFileSync("src/backend/email.ts", "utf8"));
  assert.match(code, /const noOptOut = sendableItems/);
  assert.match(code, /if \(noOptOut\.length\) \{/, "it must refuse, not merely notice");
  assert.match(code, /failure: "shape" as const/);

  // `shape` is the message; `hygiene` is the recipients. Collapsing them would
  // send somebody to clean a list that has nothing wrong with it.
  assert.match(code, /"not_configured" \| "halted" \| "hygiene" \| "provider" \| "crashed" \| "shape"/);

  // The refusal must name its own remedy and say why it is a refusal.
  assert.match(code, /Pass \\`brandId\\` so the link can be built, or supply \\`listUnsubscribe\\` per message/);
  assert.match(code, /shared with every other customer/,
    "the pool's reputation is shared, which is why this refuses instead of sending");
});

test("every bulk caller can produce an opt-out", () => {
  // THE WHOLE POINT: a caller that cannot is a campaign that will be refused at
  // send time, which is a worse place to find out.
  for (const f of [
    "src/app/api/review-requests/route.ts",
    "src/app/api/email/route.ts",
    "src/backend/placement-probe.ts",
  ]) {
    const code = codeOf(readFileSync(f, "utf8"));
    const call = code.slice(code.indexOf("sendEmailBatch("), code.indexOf("sendEmailBatch(") + 400);
    assert.ok(/brandId/.test(call) || /listUnsubscribe/.test(call),
      `${f} sends bulk with neither a brandId to derive a link from nor a link of its own`);
  }
});

test("the placement probe is shaped like the campaigns it predicts", () => {
  const code = codeOf(readFileSync("src/backend/placement-probe.ts", "utf8"));
  // It had no brandId, so no unsubscribe header could be derived — and a probe
  // without the header a real campaign carries measures the wrong message. The
  // §140 defect in this same file was the same shape: a reachability check that
  // measured an address Stripe never touched.
  assert.match(code, /brandId: "placement-probe"/,
    "the probe must carry a brandId or it cannot be shaped like a real campaign");
});

test("a one-to-one message still must NOT carry list headers", async () => {
  // The other half of the rule, and the reason this cannot be fixed by always
  // adding the header: a personal reply carrying an unsubscribe link tells the
  // classifier it is bulk marketing, and it is filed accordingly.
  const { messageShape } = await import("../src/shared/message-shape.ts");
  const one = messageShape({ transactional: true, listUnsubscribe: "https://x/u", brandId: "acme", fromDomain: "marketwaros.com" });
  assert.equal(one.stream, "conversational");
  assert.equal(one.headers["List-Unsubscribe"], undefined);
  assert.ok(one.dropped.some((d) => /List-Unsubscribe/.test(d)), "and it must say it dropped it");

  const bulk = messageShape({ transactional: false, listUnsubscribe: "https://x/u", brandId: "acme", fromDomain: "marketwaros.com" });
  assert.equal(bulk.stream, "bulk");
  assert.equal(bulk.headers["List-Unsubscribe"], "<https://x/u>");
  assert.equal(bulk.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.deepEqual(bulk.missing, [], "with a link supplied, nothing is missing");

  const bare = messageShape({ transactional: false, brandId: "acme", fromDomain: "marketwaros.com" });
  assert.ok(bare.missing.some((m) => /List-Unsubscribe/.test(m)),
    "and without one it must still be NAMED — the mailer refuses on this");
});

test("attachments ride the bulk path and the dangerous ones are refused", async () => {
  const email = await import("../src/backend/email.ts");
  // One set for the whole batch, which is the right model: the same PDF to
  // everybody. The per-item type deliberately has no attachments field.
  const code = codeOf(readFileSync("src/backend/email.ts", "utf8"));
  assert.match(code, /attachments\?: EmailAttachment\[\];/);
  assert.match(code, /attachments: common\.attachments,/, "the batch set must reach the message builder");

  assert.equal(email.MAX_ATTACHMENTS, 10);
  assert.equal(email.MAX_ATTACHMENT_BYTES, 20 * 1024 * 1024);
  // An executable destroys sender reputation faster than anything else a
  // customer can attach, and the cost is shared across the pool.
  assert.equal(email.validateAttachments([{ filename: "setup.exe", contentBase64: "AAAA" }]).ok, false);
  assert.equal(email.validateAttachments([{ filename: "a.pdf", contentBase64: "" }]).ok, false, "no content is not an attachment");
  assert.equal(email.validateAttachments([{ filename: "quote.pdf", contentBase64: "JVBERi0=" }]).ok, true);
  assert.equal(email.validateAttachments(undefined).ok, true, "no attachments is the normal case");
});
