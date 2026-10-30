// npm run drive:presenter
//
// A PRESENTER VIDEO, FROM THE SCRIPT TO A PLAYABLE FILE — every boundary driven.
//
// WHAT THIS EXISTS TO CATCH. The avatar path charged per minute, started a
// render at HeyGen and returned the provider's job id. Nothing polled it,
// downloaded it or stored it; the panel printed `Provider job: 4f21…` and the
// customer went to HeyGen's own dashboard to fetch the video they had paid us
// for. A unit test of `renderAvatar` passed throughout, because the defect was
// never in the function — it was in the CHAIN: gate → wallet → provider → job →
// poll → download → host → library → player.
//
// So this walks the chain, in order, through the REAL route handler.
//
// WHAT IS STOOD IN FOR, STATED PLAINLY. This container has no provider key and
// no DNS, so a local HTTP server plays HeyGen and `fetch` is intercepted ONLY
// to rewrite the host — what arrives at the stand-in is byte-for-byte what
// api.heygen.com would receive, which is the point: the REQUEST BODY is one of
// the things under test. NOT exercised: HeyGen's real responses, its real
// timings, its real refusals. What IS real: the gates, the ordering of the
// charge, the job record, the poll loop, the status mapping, the download, the
// size guard, the refund on failure, the roster parsing, the translation
// lifecycle, and what the provider is actually asked for.

import http from "node:http";
import fs from "node:fs";

const say = (m) => fs.writeSync(1, m + "\n");
let proven = 0, broken = 0;
const check = (label, ok, detail) => {
  (ok ? proven++ : broken++);
  say(`  ${ok ? "PROVEN " : "BROKEN "}  ${label}${detail ? ` — ${detail}` : ""}`);
};

process.env.NODE_ENV = "test";
process.env.HEYGEN_API_KEY = "drv-test-key";

// ---------------------------------------------------------------------------
// The stand-in HeyGen
// ---------------------------------------------------------------------------
const seen = { generate: [], statusCalls: 0, translateBody: null, authHeaders: [] };
let renderOutcome = "ok";          // "ok" | "failed" | "tiny"
const VIDEO_BYTES = Buffer.alloc(4096, 7);   // a plausible MP4: comfortably over the 2KB guard
const TINY_BYTES = Buffer.alloc(100, 1);     // what a placeholder/error blob looks like

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  seen.authHeaders.push(req.headers["x-api-key"] || "");
  const json = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method === "POST" && url.pathname === "/v2/video/generate") {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      try { seen.generate.push(JSON.parse(raw)); } catch { seen.generate.push({ unparseable: raw }); }
      json(200, { data: { video_id: "vid_drv_1" } });
    });
    return;
  }

  if (url.pathname === "/v1/video_status.get") {
    seen.statusCalls++;
    // FIRST CALL IS STILL PROCESSING. A poller that only works when the answer
    // is immediate is not a poller, and the real thing takes minutes.
    if (seen.statusCalls === 1) return json(200, { data: { status: "processing" } });
    if (renderOutcome === "failed") return json(200, { data: { status: "failed", error: "the avatar is not available on this plan" } });
    return json(200, { data: { status: "completed", video_url: `http://127.0.0.1:${PORT}/file.mp4` } });
  }

  if (url.pathname === "/file.mp4") {
    const bytes = renderOutcome === "tiny" ? TINY_BYTES : VIDEO_BYTES;
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": String(bytes.length) });
    return res.end(bytes);
  }

  if (url.pathname === "/v2/avatars") {
    return json(200, {
      data: {
        avatars: [
          { avatar_id: "ava_1", avatar_name: "Nadia · studio", gender: "female", preview_image_url: "http://x/1.jpg", preview_video_url: "http://x/1.mp4" },
          { avatar_id: "ava_2", avatar_name: "Tom · office", gender: "male", preview_image_url: "http://x/2.jpg" },
          { avatar_name: "no id — must be skipped" },
        ],
        talking_photos: [{ talking_photo_id: "tp_1", talking_photo_name: "Founder headshot", preview_image_url: "http://x/3.jpg" }],
      },
    });
  }

  if (url.pathname === "/v2/voices") {
    return json(200, { data: { voices: [
      { voice_id: "v_1", name: "Grace", language: "English", gender: "female", preview_audio: "http://x/v1.mp3" },
      { voice_id: "v_2", name: "Marco", language: "Italian", gender: "male" },
      { name: "no id — must be skipped" },
    ] } });
  }

  if (url.pathname === "/v2/video_translate/target_languages") {
    return json(200, { data: { languages: ["Spanish", "French", "Japanese"] } });
  }

  if (req.method === "POST" && url.pathname === "/v2/video_translate") {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      try { seen.translateBody = JSON.parse(raw); } catch { seen.translateBody = { unparseable: raw }; }
      json(200, { data: { video_translate_id: "tr_drv_1" } });
    });
    return;
  }

  if (url.pathname.startsWith("/v2/video_translate/")) {
    return json(200, { data: { status: "success", url: `http://127.0.0.1:${PORT}/file.mp4` } });
  }

  json(404, { error: `stand-in has no route for ${url.pathname}` });
});

const PORT = 3077;
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

// INTERCEPTED ONLY TO REWRITE THE HOST. The body, the headers and the method
// are untouched, so what the stand-in receives is what HeyGen would.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input?.url || String(input);
  if (url.startsWith("https://api.heygen.com")) {
    return realFetch(url.replace("https://api.heygen.com", `http://127.0.0.1:${PORT}`), init);
  }
  return realFetch(input, init);
};

const { NextRequest } = await import("next/server");
const route = await import("../src/app/api/avatars/route.ts");
const gw = await import("../src/backend/avatar-gateway.ts");

const ORIGIN = "https://mw.test";
const BRAND = `drv-presenter-${Date.now().toString(36)}`;
const SCRIPT = "Three minutes a week is all it takes to keep your diary full.";

const call = async (handler, path, init) => {
  const res = await handler(new NextRequest(ORIGIN + path, init));
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body, text };
};
const post = (payload) => call(route.POST, "/api/avatars", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
});
const get = (qs) => call(route.GET, `/api/avatars${qs}`);

say("");
say(`Driving the presenter chain through the real route, against a stand-in HeyGen on ${PORT}.`);
say("");

try {
  // --- 1. The roster ------------------------------------------------------
  const roster = await get("?roster=1");
  const avatars = roster.body?.avatars || [];
  const voices = roster.body?.voices || [];
  check("the roster lists presenters the customer can pick", roster.status === 200 && avatars.length === 3, `${avatars.length} presenters (2 avatars + 1 talking photo)`);
  check("a roster row with no id is skipped, not rendered as a blank card", !avatars.some((a) => !a.id), "every entry has an id");
  check("a talking photo is marked as one, not passed off as a filmed performer", avatars.some((a) => a.kind === "photo") && avatars.some((a) => a.kind === "avatar"), "both kinds present and labelled");
  check("voices come back with their language, so a picker can be read", voices.length === 2 && voices.every((v) => v.id) && voices.some((v) => v.language === "Italian"), `${voices.length} voices`);
  check("the three frame shapes are offered", (roster.body?.aspects || []).length === 3, (roster.body?.aspects || []).map((a) => a.id).join(" "));
  check("translation languages and the per-language price are quoted BEFORE the click", (roster.body?.translation?.languages || []).length === 3 && roster.body?.translation?.acuPerMinutePerLanguage > 0, `${roster.body?.translation?.acuPerMinutePerLanguage} ACUs per minute per language`);

  // --- 2. A refused category never reaches the provider -------------------
  const before = seen.generate.length;
  const refused = await post({ brandId: BRAND, action: "render", script: "This cream will cure eczema in a week.", avatarKind: "stock", avatarId: "ava_1" });
  check("a medical script is refused", refused.status === 400 && /medical/i.test(refused.body?.error || ""), refused.body?.error?.slice(0, 60));
  check("and the provider was never called for it", seen.generate.length === before, "no generate request was sent");
  check("and nothing was charged", refused.body?.charged === false, "charged=false");

  // --- 3. The render ------------------------------------------------------
  const started = await post({
    brandId: BRAND, action: "render", script: SCRIPT, avatarKind: "stock",
    avatarId: "ava_1", voiceId: "v_1", aspect: "16:9",
  });
  check("the render starts and returns OUR job id, not just the provider's", started.status === 200 && Boolean(started.body?.jobId), `jobId=${started.body?.jobId}`);
  check("the job starts in the rendering state", started.body?.status === "rendering", String(started.body?.status));
  check("the disclosure travels with the job", String(started.body?.disclosure || "").length > 10, "synthetic-media disclosure present");

  const sent = seen.generate[seen.generate.length - 1];
  const vi = sent?.video_inputs?.[0] || {};
  check("the chosen presenter reached the provider", vi?.character?.avatar_id === "ava_1", `avatar_id=${vi?.character?.avatar_id}`);
  check("the chosen voice reached the provider", vi?.voice?.voice_id === "v_1", `voice_id=${vi?.voice?.voice_id}`);
  check("THE CHOSEN SHAPE REACHED THE PROVIDER — not the hardcoded portrait", sent?.dimension?.width === 1920 && sent?.dimension?.height === 1080, `${sent?.dimension?.width}x${sent?.dimension?.height}`);
  check("the API key is sent as a header and never in the URL", seen.authHeaders.includes("drv-test-key"), "x-api-key header");

  // --- 4. The poll, which is the half that did not exist ------------------
  const jobId = started.body.jobId;
  const firstPoll = await get(`?brandId=${encodeURIComponent(BRAND)}&jobId=${encodeURIComponent(jobId)}`);
  check("the first poll reports it still rendering rather than failing", firstPoll.status === 200 && firstPoll.body?.status === "rendering", String(firstPoll.body?.status));

  const secondPoll = await get(`?brandId=${encodeURIComponent(BRAND)}&jobId=${encodeURIComponent(jobId)}`);
  check("the second poll collects the finished video", secondPoll.status === 200 && secondPoll.body?.status === "ready", String(secondPoll.body?.status));
  check("and it comes back with a URL the panel can play", typeof secondPoll.body?.videoUrl === "string" && secondPoll.body.videoUrl.length > 10, String(secondPoll.body?.videoUrl).slice(0, 48));
  check("a ready job is terminal — polling again does not re-download it", (await get(`?brandId=${encodeURIComponent(BRAND)}&jobId=${encodeURIComponent(jobId)}`)).body?.status === "ready", "idempotent");

  // --- 5. Tenant isolation on the job id ----------------------------------
  const otherTenant = await get(`?brandId=someone-else&jobId=${encodeURIComponent(jobId)}`);
  check("another brand cannot poll this render by id", otherTenant.status === 404, `status ${otherTenant.status}`);
  check("and the refusal carries none of the script", !otherTenant.text.includes("diary full"), "no script in the response");

  // --- 6. Translation -----------------------------------------------------
  const tr = await post({ brandId: BRAND, action: "translate", jobId, languages: ["Spanish", "French"] });
  check("translation starts one job per language", tr.status === 200 && (tr.body?.started || []).length === 2, `${(tr.body?.started || []).length} started`);
  check("the price per language is stated in the response", tr.body?.acuPerLanguage > 0, `${tr.body?.acuPerLanguage} ACUs each`);
  check("the source video is what gets translated", seen.translateBody?.video_url === secondPoll.body.videoUrl, "the finished file, not the script");
  const trId = tr.body?.started?.[0]?.jobId;
  const trPoll = await get(`?brandId=${encodeURIComponent(BRAND)}&translationId=${encodeURIComponent(trId)}`);
  check("a translation can be polled to a playable file", trPoll.status === 200 && trPoll.body?.status === "ready" && Boolean(trPoll.body?.videoUrl), String(trPoll.body?.status));
  const trOther = await get(`?brandId=someone-else&translationId=${encodeURIComponent(trId)}`);
  check("another brand cannot poll this translation", trOther.status === 404, `status ${trOther.status}`);

  const tooMany = await post({ brandId: BRAND, action: "translate", jobId, languages: Array.from({ length: 11 }, (_, i) => `L${i}`) });
  check("a slip of the finger cannot order eleven languages at once", tooMany.status === 400 && /Ten languages/.test(tooMany.body?.error || ""), tooMany.body?.error?.slice(0, 50));

  // --- 7. A provider failure is refunded, not left hanging ----------------
  renderOutcome = "failed";
  seen.statusCalls = 0;
  const willFail = await post({ brandId: BRAND, action: "render", script: SCRIPT, avatarKind: "stock", avatarId: "ava_2" });
  const failId = willFail.body?.jobId;
  await get(`?brandId=${encodeURIComponent(BRAND)}&jobId=${encodeURIComponent(failId)}`);   // processing
  const failed = await get(`?brandId=${encodeURIComponent(BRAND)}&jobId=${encodeURIComponent(failId)}`);
  check("a render the provider could not finish is reported as FAILED", failed.body?.status === "failed", String(failed.body?.status));
  check("the failure says what the provider actually said", /not available on this plan/i.test(failed.body?.note || ""), String(failed.body?.note).slice(0, 70));
  check("and the note confirms the money went back", /back in your wallet/i.test(failed.body?.note || ""), "refund stated");

  // --- 8. A file too small to be a video is not handed over as one --------
  renderOutcome = "tiny";
  seen.statusCalls = 0;
  const willBeTiny = await post({ brandId: BRAND, action: "render", script: SCRIPT, avatarKind: "stock", avatarId: "ava_1" });
  const tinyId = willBeTiny.body?.jobId;
  await get(`?brandId=${encodeURIComponent(BRAND)}&jobId=${encodeURIComponent(tinyId)}`);
  const tiny = await get(`?brandId=${encodeURIComponent(BRAND)}&jobId=${encodeURIComponent(tinyId)}`);
  check("a file too small to be a video is refused, not shown as a black player", tiny.body?.status === "failed" && /too small/i.test(tiny.body?.note || ""), String(tiny.body?.note).slice(0, 70));
  renderOutcome = "ok";

  // --- 9. The cloned voice ------------------------------------------------
  const cloned = await post({
    brandId: BRAND, action: "render", script: SCRIPT, avatarKind: "stock",
    avatarId: "ava_1", voiceSource: "cloned",
  });
  check(
    "a cloned voice with no ElevenLabs key is refused with the remedy, not rendered silently in a stock voice",
    cloned.status === 400 && /ELEVENLABS_API_KEY/.test(cloned.body?.error || ""),
    cloned.body?.error?.slice(0, 70),
  );

  // --- 10. Consent, on the path that needs it -----------------------------
  const noConsent = await post({
    brandId: BRAND, action: "render", script: SCRIPT, avatarKind: "custom",
    personName: "Ada Lovelace", avatarId: "ava_1",
  });
  check("a custom avatar with no consent on record is refused", noConsent.status === 400, `status ${noConsent.status}`);
  check("and the provider was not called for it", seen.generate.every((g) => g?.video_inputs?.[0]?.character?.avatar_id !== "never"), "no render started");

  // --- 11. A CONTINUOUS COMMERCIAL --------------------------------------
  //
  // THE OWNER'S BRIEF: *"a very professional and commercial video of up to 1
  // minute no stop if 15 second each with a tool to make them together as 1
  // video."*
  //
  // The thing to prove here is the architecture, not the arithmetic: FOUR
  // SCENES LEAVE IN ONE REQUEST and come back as one video. If this driver
  // sees four requests, the feature is four clips somebody still has to join.
  const COMMERCIAL = [
    "Your gutters are blocked and you have not looked since spring.",
    "One storm is all it takes for the water to find its way inside.",
    "We clear them, photograph the lot, and send you the pictures the same day.",
    "Book this week and the survey is free.",
  ].join("\n\n");

  // The free preview first, because that is the order a person uses it in.
  const planned = await post({ brandId: BRAND, action: "storyboard", script: COMMERCIAL });
  check(
    "planning the scenes is FREE and charges nothing",
    planned.status === 200 && planned.body?.charged === false && Array.isArray(planned.body?.beats),
    `${planned.body?.beats?.length} scenes, ${planned.body?.totalSeconds}s, ${planned.body?.acus} ACUs quoted`,
  );
  check(
    "the preview says it will be ONE continuous video, and names who renders it",
    planned.body?.continuous === true && typeof planned.body?.provider === "string",
    `${planned.body?.provider} renders it`,
  );
  const quotedSeconds = planned.body?.totalSeconds;
  const quotedAcus = planned.body?.acus;

  const requestsBefore = seen.generate.length;
  seen.statusCalls = 0;
  const made = await post({
    brandId: BRAND, action: "commercial", script: COMMERCIAL,
    avatarKind: "stock", avatarId: "ava_1", voiceId: "v_1", aspect: "16:9",
  });
  const asSent = seen.generate[seen.generate.length - 1];

  check(
    "ONE REQUEST CARRIED EVERY SCENE — not four renders and a joiner",
    seen.generate.length === requestsBefore + 1 && Array.isArray(asSent?.video_inputs) && asSent.video_inputs.length === 4,
    `${seen.generate.length - requestsBefore} request(s), ${asSent?.video_inputs?.length} scenes in it`,
  );
  check(
    "every scene carries its own words, in order",
    asSent?.video_inputs?.map((v) => v?.voice?.input_text).join(" ") === COMMERCIAL.replace(/\n\n/g, " "),
    "nothing lost, nothing reordered",
  );
  check(
    "and the same presenter and voice in all of them, or the joins would show",
    new Set(asSent?.video_inputs?.map((v) => v?.character?.avatar_id)).size === 1
      && new Set(asSent?.video_inputs?.map((v) => v?.voice?.voice_id)).size === 1,
    `avatar ${asSent?.video_inputs?.[0]?.character?.avatar_id}, voice ${asSent?.video_inputs?.[0]?.voice?.voice_id}`,
  );
  check(
    "the frame the customer chose reached the provider",
    asSent?.dimension?.width === 1920 && asSent?.dimension?.height === 1080,
    `${asSent?.dimension?.width}x${asSent?.dimension?.height}`,
  );
  check(
    "the render quotes the same duration the free preview did",
    made.body?.totalSeconds === quotedSeconds && made.body?.beats?.length === 4,
    `${made.body?.totalSeconds}s both times`,
  );

  // And the collection half is the single-take path, untouched: one job, polled
  // once, hosted, filed. A commercial is a different SPLIT, not a different
  // pipeline — which is the whole reason it was built this way.
  const cJobId = made.body?.jobId;
  await get(`?brandId=${encodeURIComponent(BRAND)}&jobId=${encodeURIComponent(cJobId)}`);
  const cReady = await get(`?brandId=${encodeURIComponent(BRAND)}&jobId=${encodeURIComponent(cJobId)}`);
  check(
    "it is polled and collected by the SAME chain as a single take",
    cReady.body?.status === "ready" && typeof cReady.body?.videoUrl === "string",
    `one job, ${seen.statusCalls} status calls, ${cReady.body?.status}`,
  );
  check(
    "charged once, as presenter minutes, for the whole thing",
    quotedAcus > 0 && made.body?.minutes === 1,
    `${quotedAcus} ACUs for ${quotedSeconds}s — one billable minute, not four`,
  );

  // A script that overruns is refused BEFORE the wallet, with the words to cut.
  const tooLong = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
  const over = await post({ brandId: BRAND, action: "commercial", script: tooLong, avatarKind: "stock", avatarId: "ava_1" });
  check(
    "a script that overruns a minute is refused and costs nothing",
    over.status === 400 && over.body?.charged === false && /over the 60s/.test(over.body?.error || ""),
    over.body?.hint?.slice(0, 60),
  );
} finally {
  server.close();
  globalThis.fetch = realFetch;
}

say("");
say(`drive:presenter — ${proven} proven, ${broken} broken.`);
say("");
say("NOT PROVEN BY THIS RUN: HeyGen's real responses, timings and refusals — the");
say("provider here is a stand-in, and the adapters were written from published");
say("documentation without an account to check them against. Also unproven: the");
say("STORAGE branch, because no bucket is configured in this container, so every");
say("render above took the honest fallback path that hands over the provider's own");
say("link and says it will expire. With FIREBASE_STORAGE_BUCKET set, the file is");
say("copied to your own storage and filed in the work library instead.");
process.exit(broken ? 1 : 0);
