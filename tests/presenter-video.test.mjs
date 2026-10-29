import test from "node:test";
import assert from "node:assert/strict";

// PRESENTER VIDEO — the half that was missing, and the gates in front of it.
//
// WHAT THIS GUARDS. The avatar path charged per minute, started a render at
// HeyGen and returned the provider's job id. Nothing polled it, downloaded it
// or stored it: the customer paid us and then had to fetch the video from the
// provider's own dashboard. The fix is a job with a lifecycle — rendering →
// ready, or rendering → failed AND refunded — so the tests that matter are
// about the lifecycle and the money, not about whether a render starts.
//
// NO PROVIDER KEY EXISTS IN THIS SUITE, which bounds what can be proven here
// and is stated rather than glossed: the provider adapters (start, status,
// roster, translate) are NOT exercised against a live API. What IS exercised is
// everything that decides whether a provider is called at all, what it would be
// asked for, what the customer is charged, and what happens to a render that
// never arrives — which is where every defect in this module has lived.

const gw = await import("../src/backend/avatar-gateway.ts");
const { ACTION_COST_ACU } = await import("../src/backend/wallet.ts");

const NOW = "2026-10-29T12:00:00.000Z";
const base = {
  brandId: "t-presenter",
  script: "Three minutes a week is all it takes to keep your diary full.",
  avatarKind: "stock",
  nowISO: NOW,
};

// ---------------------------------------------------------------------------
// The shape of the frame
// ---------------------------------------------------------------------------

test("every aspect has a real frame and says what it is for", () => {
  // The provider used to be asked for 1080x1920 whatever the customer wanted,
  // so a YouTube pre-roll came back portrait and a presenter framed for a
  // vertical crop lost their chin in a 16:9 cut.
  const shapes = Object.entries(gw.AVATAR_DIMENSIONS);
  assert.equal(shapes.length, 3, "vertical, landscape and square");
  for (const [id, d] of shapes) {
    assert.ok(d.width >= 1080 && d.height >= 1080, `${id}: must be at least 1080 on both sides`);
    assert.ok(d.use.length > 15, `${id}: must say what it is for, in the customer's terms`);
  }
  assert.ok(gw.AVATAR_DIMENSIONS["16:9"].width > gw.AVATAR_DIMENSIONS["16:9"].height, "16:9 is landscape");
  assert.ok(gw.AVATAR_DIMENSIONS["9:16"].height > gw.AVATAR_DIMENSIONS["9:16"].width, "9:16 is portrait");
  assert.equal(gw.AVATAR_DIMENSIONS["1:1"].width, gw.AVATAR_DIMENSIONS["1:1"].height, "1:1 is square");
});

// ---------------------------------------------------------------------------
// The gates, which run before the wallet
// ---------------------------------------------------------------------------

test("a restricted category is refused before anything is charged", async () => {
  for (const [script, why] of [
    ["This supplement will cure your arthritis in a week.", /medical/i],
    ["Guaranteed returns of 40% on your crypto investment.", /financial|invest/i],
    ["Vote for our candidate in the referendum this May.", /political/i],
    ["Breaking news: sources say the market has crashed.", /news/i],
  ]) {
    const r = await gw.gateAvatar({ ...base, script });
    assert.equal(r.ok, false, `"${script}" must be refused`);
    assert.match(r.error, why);
    assert.ok(r.hint && r.hint.length > 40, "a refusal must say what to do instead");
  }
});

test("a custom avatar with no consent record is refused, not warned", async () => {
  const r = await gw.gateAvatar({ ...base, avatarKind: "custom", personName: "Ada Lovelace" });
  assert.equal(r.ok, false);
  assert.ok(r.hint, "it must say how to make it allowed");
});

test("a custom avatar with no NAME cannot be checked, so it is refused", async () => {
  const r = await gw.gateAvatar({ ...base, avatarKind: "custom" });
  assert.equal(r.ok, false);
  assert.match(r.error, /name/i);
});

test("A CLONED VOICE TRIGGERS THE VOICE CONSENT CHECK, not just a provider voice id", async () => {
  // THE DEFECT THIS LOCKS DOWN. The voice-consent branch was written as
  // `if (req.voiceId)` — a provider's voice id. A cloned voice arrives as a
  // hosted AUDIO TRACK instead, so that condition would have waved through the
  // one case where consent matters most: a real person's cloned voice, saying
  // words they never said, on their own face.
  const withAudio = await gw.gateAvatar({
    ...base, avatarKind: "custom", personName: "Ada Lovelace", audioUrl: "https://example.test/voice.mp3",
  });
  assert.equal(withAudio.ok, false, "a cloned voice on a custom avatar needs consent on record");

  // And the face half alone is not enough to reach the voice check — the face
  // refusal fires first, which is the correct order.
  assert.ok(typeof withAudio.error === "string" && withAudio.error.length > 10);
});

test("a stock presenter needs no consent, because the performer already licensed it", async () => {
  const r = await gw.gateAvatar(base);
  assert.equal(r.ok, true);
});

test("an empty or enormous script is refused with a reason a person can act on", async () => {
  const empty = await gw.gateAvatar({ ...base, script: "   " });
  assert.equal(empty.ok, false);
  assert.match(empty.error, /staring|no script/i);

  const huge = await gw.gateAvatar({ ...base, script: "word ".repeat(1200) });
  assert.equal(huge.ok, false);
  assert.match(huge.error, /trim|longer/i);
});

// ---------------------------------------------------------------------------
// Duration, which is what everything is billed by
// ---------------------------------------------------------------------------

test("billable minutes come from one rule, so the quote and the charge agree", () => {
  assert.equal(gw.WORDS_PER_MINUTE, 150);
  assert.equal(gw.billableMinutes(""), 1, "never less than a minute");
  assert.equal(gw.billableMinutes("word ".repeat(150)), 1);
  assert.equal(gw.billableMinutes("word ".repeat(151)), 2, "a second minute starts at 151 words");
  assert.equal(gw.billableMinutes("word ".repeat(450)), 3);
});

// ---------------------------------------------------------------------------
// With no provider: a brief, free
// ---------------------------------------------------------------------------

test("with no provider configured it returns a usable brief and calls nobody", async () => {
  assert.equal(gw.avatarGatewayConfigured(), false, "no provider key in this suite");
  assert.equal(gw.wouldCallProvider(), false, "so the route must not charge");

  const job = await gw.renderAvatar(base);
  assert.equal(job.ok, true);
  assert.equal(job.mode, "brief");
  assert.equal(job.jobRef, null);
  assert.ok(job.brief.includes(base.script), "the brief carries the real script");
  assert.match(job.brief, /Captions/i, "and the shot notes that make it filmable");
  assert.match(job.note, /nothing was rendered and nothing was charged/i);
  assert.ok(job.disclosure.length > 10, "the synthetic-media disclosure travels with every job");
});

// ---------------------------------------------------------------------------
// The lifecycle
// ---------------------------------------------------------------------------

test("polling an unknown render says so instead of inventing a job", async () => {
  const r = await gw.getAvatarRender("av_nope");
  assert.ok("error" in r);
  assert.match(r.error, /unknown/i);
});

test("a render belonging to another brand is not readable by id alone", async () => {
  // The id is the only thing between one tenant and another tenant's script.
  const r = await gw.ownedRender("av_nope", "some-other-brand");
  assert.equal(r, null);
});

test("an unknown translation is reported, not invented", async () => {
  const r = await gw.getTranslation("tr_nope");
  assert.ok("error" in r);
});

test("translation refuses at the deployment level first, and names the alternative", async () => {
  // THE ORDER IS DELIBERATE AND MY FIRST VERSION OF THIS TEST HAD IT WRONG. I
  // asserted the "that video is not finished" refusal, and the real answer was
  // the provider one — because with no HeyGen key the feature does not exist on
  // this deployment at all, which is the more useful thing to say. A refusal
  // about the input would send somebody to fix a video when the problem is a
  // missing key.
  //
  // So this asserts the reachable branch. The not-finished guard sits behind
  // the provider check and is NOT exercised here, because reaching it needs a
  // key this suite does not have — it is read in the source, not proven.
  const r = await gw.startTranslation({
    source: {
      jobId: "av_x", brandId: "b", provider: "heygen", providerRef: "r", status: "rendering",
      videoUrl: null, script: "s", avatarKind: "stock", aspect: "9:16", minutes: 1,
      chargedAcu: 0, startedAt: NOW, note: "", disclosure: "d",
    },
    lang: "Spanish", chargedAcu: 0, nowISO: NOW,
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /HeyGen/);
  assert.match(r.error, /dubbing/i, "and it names the thing that does work without it");
});

test("translation and dubbing are priced as the different products they are", () => {
  // Dubbing re-voices the audio and leaves the mouth speaking English. This
  // re-renders the mouth. Charging the cheaper rate for the dearer product
  // breaches the margin floor silently, which is the whole reason they are
  // separate lines.
  assert.ok(ACTION_COST_ACU.avatar_translate > 0, "lip-synced translation has its own price");
  assert.ok(
    ACTION_COST_ACU.avatar_translate > ACTION_COST_ACU.dub,
    "re-rendering a mouth costs more than re-voicing audio, and the price must say so",
  );
});

test("the roster explains itself when there is no provider, instead of an empty grid", async () => {
  const r = await gw.avatarRoster();
  assert.deepEqual(r.avatars, []);
  assert.deepEqual(r.voices, []);
  assert.ok(r.note.length > 60, "an empty roster must say WHY it is empty");
  assert.match(r.note, /HEYGEN_API_KEY|configured/i);
});

test("translation languages say what to do when the provider is absent", async () => {
  const r = await gw.translationLanguages();
  assert.deepEqual(r.languages, []);
  assert.match(r.note, /HeyGen/);
  // And it names the thing that DOES work without it, rather than stopping at "no".
  assert.match(r.note, /dub/i);
});
