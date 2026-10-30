import test from "node:test";
import assert from "node:assert/strict";

// ONE CONTINUOUS COMMERCIAL, OUT OF FIFTEEN-SECOND BEATS.
//
// THE OWNER'S BRIEF: *"a very professional and commercial video of up to 1
// minute no stop if 15 second each with a tool to make them together as 1
// video."*
//
// THE ARCHITECTURE THIS TESTS, and it is the part worth getting right: there is
// no stitching. The provider's scene array renders several beats as ONE file
// with the same character and voice throughout, so the "tool to make them
// together" is one request rather than a joiner. No ffmpeg, one job, one
// charge, and — the point of the brief — no visible joins where separate
// renders drift apart in head position, lighting and level.
//
// So what is left to get wrong is the SPLIT, and these are the ways:
//
//   • a beat that ends mid-word — a presenter cut off mid-syllable
//   • a writer's own cuts silently moved by a word count
//   • a script that overruns, truncated instead of refused
//   • "Mr. Patel" or "£4.99" read as the end of a sentence
//   • a duration quoted by one rate and billed by another

const sb = await import("../src/shared/storyboard.ts");
const gw = await import("../src/backend/avatar-gateway.ts");
const wallet = await import("../src/backend/wallet.ts");

const words = (s) => s.split(/\s+/).filter(Boolean).length;

test("THE PACE IS ONE NUMBER, and the thing that bills reads it", () => {
  // A screen saying "about 15 seconds" and a wallet charging by a different
  // rate is two estimates free to drift. The gateway re-exports the shared one
  // rather than keeping its own copy.
  assert.equal(sb.WORDS_PER_MINUTE, 150);
  assert.equal(gw.WORDS_PER_MINUTE, sb.WORDS_PER_MINUTE);
  assert.equal(sb.secondsFor(150), 60);
  assert.equal(sb.secondsFor(37), 14.8, "a 15-second beat carries about 37 words");
  assert.equal(sb.wordsPerBeat(15), 37);
  assert.equal(sb.secondsFor(0), 0);
  assert.equal(sb.secondsFor(-5), 0, "a negative word count is not a negative duration");
});

test("a prose script is divided by pace, and no beat overruns", () => {
  const script = [
    "Your gutters are blocked and you have not looked at them since the spring.",
    "One storm is all it takes for water to find its way inside.",
    "We clear them, photograph the lot and send you the pictures the same day.",
    "Book this week and the survey is free.",
  ].join(" ");
  const s = sb.storyboard(script);
  assert.ok(!sb.storyboardFailed(s), s.error);
  assert.equal(s.dividedBy, "pace");
  assert.ok(s.beats.length >= 1 && s.beats.length <= sb.MAX_BEATS);
  for (const b of s.beats) {
    assert.ok(b.words <= sb.wordsPerBeat(15), `beat ${b.index} carries ${b.words} words, over the budget`);
    assert.ok(b.seconds <= sb.BEAT_SECONDS + 0.5, `beat ${b.index} runs ${b.seconds}s`);
    assert.ok(b.text.trim().length > 0);
  }
  // Nothing is lost and nothing is invented: the beats are the script.
  assert.equal(s.beats.map((b) => b.text).join(" ").replace(/\s+/g, " "), script.replace(/\s+/g, " "));
  assert.equal(s.totalWords, words(script));
});

test("THE WRITER'S OWN CUTS ARE RESPECTED, not re-split by a word count", () => {
  // A marketer who has written four beats has already made the editorial
  // decision about where the cuts fall. Re-splitting by pace would move their
  // cuts and they would never know why.
  const authored = "Blocked gutters.\n\nOne storm.\n\nWe clear them and photograph the lot.\n\nFree survey this week.";
  const s = sb.storyboard(authored);
  assert.ok(!sb.storyboardFailed(s), s.error);
  assert.equal(s.dividedBy, "author");
  assert.equal(s.beats.length, 4);
  assert.equal(s.beats[0].text, "Blocked gutters.");
  assert.equal(s.beats[3].text, "Free survey this week.");

  // `---` is the other way people write a break.
  const dashed = sb.storyboard("Scene one is here.\n---\nScene two is here.\n---\nScene three.");
  assert.ok(!sb.storyboardFailed(dashed));
  assert.equal(dashed.beats.length, 3);
  assert.equal(dashed.dividedBy, "author");
});

test("an authored beat that runs long is still split, and SAYS SO", () => {
  // Honouring the writer's cuts cannot extend to rendering a 40-second scene,
  // because the provider would cut it. But moving their cut silently is the
  // thing this feature exists not to do, so it is reported.
  const long = `${Array.from({ length: 70 }, (_, i) => `word${i}`).join(" ")}\n\nAnd a short one.`;
  const s = sb.storyboard(long);
  assert.ok(!sb.storyboardFailed(s), s.error);
  assert.equal(s.dividedBy, "author");
  assert.ok(s.beats.length > 2, "the long beat must have been divided");
  assert.ok(s.warnings.some((w) => /longer than 15s/.test(w)), s.warnings.join(" | "));
});

test("NO BEAT EVER ENDS MID-WORD", () => {
  // The one failure a viewer definitely notices. Driven against a sentence far
  // too long for any beat, with no punctuation to help.
  const runOn = Array.from({ length: 120 }, (_, i) => `syllable${i}`).join(" ");
  const s = sb.storyboard(runOn, { maxSeconds: 180 });
  assert.ok(!sb.storyboardFailed(s), s.error);
  const rejoined = s.beats.map((b) => b.text).join(" ");
  assert.equal(rejoined, runOn, "every word must survive the split exactly once, in order");
  for (const b of s.beats) {
    for (const w of b.text.split(/\s+/)) {
      assert.match(w, /^syllable\d+$/, `"${w}" is half a word`);
    }
  }
});

test("a clause boundary is preferred to a bare word boundary", () => {
  // Breaking at a comma reads as an edit. Breaking mid-clause reads as a fault.
  const clauses = "We clear the gutters, photograph every one of them, send you the pictures the same day, and bill you only once you have seen them, which is the whole point of the thing.";
  const s = sb.storyboard(clauses, { beatSeconds: 6 });
  assert.ok(!sb.storyboardFailed(s), s.error);
  assert.ok(s.beats.length > 1);
  const ends = s.beats.slice(0, -1).map((b) => b.text.trim().slice(-1));
  assert.ok(ends.filter((c) => /[,;:—–.]/.test(c)).length >= 1, `beats ended on: ${ends.join(" ")}`);
});

test("AN ABBREVIATION IS NOT THE END OF A SENTENCE", () => {
  // DRIVEN AT A BEAT LENGTH WHERE IT MATTERS. The first version of this test
  // used the default 15-second beat, so all three sentences fitted in ONE beat
  // and the sentence boundaries were never used — it passed with the guard
  // removed, which is a check that passes for a reason unrelated to what it
  // tests. At four seconds a beat, every sentence break becomes a visible cut.
  const script = "Ask for Mr. Patel on the day. The survey costs £4.99 and takes ten minutes. Dr. Shah signs it off.";
  const s = sb.storyboard(script, { beatSeconds: 4 });
  assert.ok(!sb.storyboardFailed(s), s.error);
  assert.ok(s.beats.length >= 3, `expected a cut per sentence, got ${s.beats.length}`);

  for (const b of s.beats) {
    const t = b.text.trim();
    assert.ok(!/\b(?:Mr|Mrs|Ms|Dr|Prof|Ltd|Inc|St|No)\.$/.test(t), `a beat ends on a title, splitting it from its name: "${t}"`);
    // A decimal point is not a full stop: a beat must not end mid-number.
    assert.ok(!/£\d+\.$/.test(t), `a beat ends inside a price: "${t}"`);
    // And the price must survive whole wherever it landed.
    if (t.includes("£4")) assert.ok(t.includes("£4.99"), `the price was broken up: "${t}"`);
  }
  // Every word still present, exactly once, in order.
  assert.equal(s.beats.map((b) => b.text).join(" ").replace(/\s+/g, " "), script.replace(/\s+/g, " "));
});

test("A SCRIPT THAT OVERRUNS IS REFUSED, NOT TRUNCATED", () => {
  // Cutting it to fit renders a commercial that stops mid-sentence, and the
  // customer has paid for it.
  const tooLong = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
  const s = sb.storyboard(tooLong);
  assert.ok(sb.storyboardFailed(s), "a 80-second script must not quietly become a 60-second one");
  assert.match(s.error, /over the 60s/);
  // And the refusal is ACTIONABLE: how many words to cut, not just "too long".
  assert.match(s.hint, /\d+ words/);
});

test("an empty script is refused before anything else", () => {
  for (const bad of ["", "   ", "\n\n", null, undefined]) {
    const s = sb.storyboard(bad);
    assert.ok(sb.storyboardFailed(s), `${JSON.stringify(bad)} must be refused`);
    assert.match(s.error, /no script/i);
  }
});

test("too many scenes is a slideshow, and is refused", () => {
  const many = Array.from({ length: 12 }, (_, i) => `Scene ${i} is here.`).join("\n\n");
  const s = sb.storyboard(many, { maxSeconds: 180 });
  assert.ok(sb.storyboardFailed(s));
  assert.match(s.error, /at most/);
});

test("the beat length can be changed, and the budget follows it", () => {
  const script = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
  const short = sb.storyboard(script, { beatSeconds: 5 });
  const long = sb.storyboard(script, { beatSeconds: 20 });
  assert.ok(!sb.storyboardFailed(short) && !sb.storyboardFailed(long));
  assert.ok(short.beats.length > long.beats.length, "shorter beats means more of them");
  for (const b of short.beats) assert.ok(b.seconds <= 5.5, `${b.seconds}s in a 5s beat`);
  // And an absurd beat length is clamped rather than obeyed.
  const silly = sb.storyboard(script, { beatSeconds: 0 });
  assert.ok(!sb.storyboardFailed(silly));
  for (const b of silly.beats) assert.ok(b.words >= 1);
});

// ---------------------------------------------------------------------------
// The render: one request, one video, charged once
// ---------------------------------------------------------------------------

test("THE PLAN THE SCREEN SHOWS IS THE PLAN THAT GETS CHARGED", () => {
  // Two code paths computing the duration — one to quote and one to bill — is
  // the defect this codebase keeps producing. `planCommercial` answers both.
  const script = "Blocked gutters.\n\nOne storm.\n\nWe clear them and send you the photographs.\n\nFree survey this week.";
  const plan = gw.planCommercial({ script });
  assert.equal(plan.ok, true);
  assert.equal(plan.beats.length, 4);
  assert.equal(plan.minutes, 1, "a commercial under a minute is one billable minute");
  assert.ok(plan.totalSeconds > 0 && plan.totalSeconds <= 60);

  // Charged as presenter minutes, not as a new price line.
  assert.ok(wallet.ACTION_COST_ACU.avatar * plan.minutes > 0);
});

test("a refusal from the plan is a refusal from the renderer, with the same words", async () => {
  const tooLong = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
  const plan = gw.planCommercial({ script: tooLong });
  assert.equal(plan.ok, false);
  const made = await gw.renderCommercial({
    brandId: "b1", script: tooLong, avatarKind: "stock", nowISO: new Date().toISOString(),
  });
  assert.equal(made.ok, false);
  assert.equal(made.error, plan.error, "the preview and the render must refuse for the same stated reason");
});

test("WITH NO SCENE-CAPABLE PROVIDER IT HANDS BACK A STORYBOARD, not a fake video", async () => {
  const env = { ...process.env };
  try {
    delete process.env.HEYGEN_API_KEY; delete process.env.SYNTHESIA_API_KEY; delete process.env.DID_API_KEY;
    const made = await gw.renderCommercial({
      brandId: "b1", avatarKind: "stock", nowISO: new Date().toISOString(),
      script: "Blocked gutters.\n\nOne storm.\n\nWe clear them.\n\nFree survey.",
    });
    assert.equal(made.ok, true);
    assert.equal(made.mode, "brief");
    assert.equal(made.provider, "none");
    assert.equal(made.beats.length, 4);
    assert.match(made.brief, /SCENE 1/);
    assert.match(made.brief, /SCENE 4/);
    assert.match(made.brief, /Continuity/);
    assert.match(made.note, /nothing was charged/i);

    // D-ID CONFIGURED IS STILL NOT A COMMERCIAL, and the reason is named rather
    // than hidden: it renders one scene per request, so four scenes would be
    // four files and three visible joins — the "stop" the brief rules out.
    process.env.DID_API_KEY = "k";
    const onDid = await gw.renderCommercial({
      brandId: "b1", avatarKind: "stock", nowISO: new Date().toISOString(),
      script: "Blocked gutters.\n\nOne storm.\n\nWe clear them.\n\nFree survey.",
    });
    assert.equal(onDid.mode, "brief", "D-ID cannot render this continuously");
    assert.match(onDid.note, /one scene per request/);
  } finally { process.env = env; }
});

test("the pool routes a commercial only to a provider that can render scenes", () => {
  const env = { ...process.env };
  try {
    delete process.env.HEYGEN_API_KEY; delete process.env.SYNTHESIA_API_KEY; delete process.env.DID_API_KEY;
    // D-ID is the CHEAPEST of the three. It must still not get this job.
    process.env.DID_API_KEY = "k";
    assert.equal(gw.configuredProvider().id, "did", "it is the cheapest, so it renders a single take");
    assert.equal(gw.configuredProvider("scenes"), null, "but it cannot render a commercial at all");

    process.env.HEYGEN_API_KEY = "k";
    assert.equal(gw.configuredProvider("scenes").id, "heygen");
    assert.equal(gw.configuredProvider().id, "did", "routing on cost is unchanged for work D-ID can do");

    // Synthesia can do scenes too, and is DEARER than HeyGen, so HeyGen keeps it.
    process.env.SYNTHESIA_API_KEY = "k";
    assert.equal(gw.configuredProvider("scenes").id, "heygen");
    delete process.env.HEYGEN_API_KEY;
    assert.equal(gw.configuredProvider("scenes").id, "synthesia", "with HeyGen gone, the other scene-capable one takes it");
  } finally { process.env = env; }
});

test("every pool member declares whether it can render scenes", () => {
  for (const p of gw.AVATAR_PROVIDERS) {
    assert.equal(typeof p.scenes, "boolean", `${p.id} must say whether one request can carry several scenes`);
  }
  // At least one, or the feature does not exist on any deployment.
  assert.ok(gw.AVATAR_PROVIDERS.some((p) => p.scenes));
  // And at least one that cannot, or the capability filter is never exercised.
  assert.ok(gw.AVATAR_PROVIDERS.some((p) => !p.scenes));
});

test("A PARTIAL SET OF VOICE TRACKS IS REFUSED, not half-used", async () => {
  const env = { ...process.env };
  try {
    process.env.HEYGEN_API_KEY = "k";
    const made = await gw.renderCommercial({
      brandId: "b1", avatarKind: "stock", nowISO: new Date().toISOString(),
      script: "One.\n\nTwo.\n\nThree.\n\nFour.",
      beatAudioUrls: ["https://x/1.mp3", "https://x/2.mp3"],
    });
    assert.equal(made.ok, false);
    assert.match(made.error, /2 voice tracks for 4 scenes/);
    assert.match(made.hint, /audibly two videos/);
  } finally { process.env = env; }
});
