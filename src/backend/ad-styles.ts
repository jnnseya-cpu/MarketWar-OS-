// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Ad styles — the formats that actually run on short-form feeds.
//
// The video gateway could render anything and was told nothing: a prompt went
// in, a model's default look came out. That is why generated video ads look
// generated. The formats that work on TikTok and Reels are not "a nice video of
// the product" — they are a small number of RECOGNISABLE SHAPES, each with its
// own camera, pacing, framing and, above all, its own first two seconds.
//
// So a style here is not a mood word. It carries:
//   • the shot list, in order, with what happens in each,
//   • the camera and lighting, because "phone, handheld, window light" and
//     "studio, tripod, three-point" produce different worlds from one prompt,
//   • the hook SHAPE for the first two seconds, which is where the scroll is
//     won or lost,
//   • the audio posture — spoken to camera, voiceover, or sound-on ambient,
//   • what makes it fail, so the brief can avoid it.
//
// WHAT IS NOT HERE, DELIBERATELY. No predicted watch time, no "scroll-stop
// probability", no engagement score. Nobody can measure those for a video that
// does not exist yet, and this platform removes numbers nobody measured. What a
// style carries instead is a CHECKLIST — things you can look at the render and
// verify — plus the disclosure each format legally needs.

export type StyleId =
  | "ugc-testimonial" | "street-interview" | "podcast-clip" | "founder-direct"
  | "problem-solution" | "before-after" | "unboxing" | "demo-hands"
  | "day-in-the-life" | "myth-bust" | "green-screen-react" | "listicle-fast";

export type AudioPosture = "to-camera" | "voiceover" | "ambient" | "interview";

export type AdStyle = {
  id: StyleId;
  label: string;
  /** One line a customer recognises the format by. */
  looksLike: string;
  /** In order. What the render must actually show. */
  shots: string[];
  camera: string;
  lighting: string;
  /** The first two seconds, as a SHAPE rather than a script. */
  hookShape: string;
  audio: AudioPosture;
  /** Seconds. What this format needs to work — not what a model defaults to. */
  idealSeconds: number;
  platforms: string[];
  /** Why it fails, so the brief can avoid it. */
  failsWhen: string;
  /** Anything the law or the platform requires on this format. */
  disclosure?: string;
};

// Twelve, because a style list nobody can hold in their head is a dropdown
// people scroll past. Each one earns its place by being a different SHAPE, not
// a different adjective.
export const AD_STYLES: AdStyle[] = [
  {
    id: "ugc-testimonial",
    label: "UGC testimonial",
    looksLike: "A real customer, filming themselves, saying what changed.",
    shots: [
      "0–2s: face already talking, mid-sentence, no intro",
      "2–8s: the before — the specific annoyance, named",
      "8–14s: the product in their actual hands, in their actual room",
      "14–18s: the after, said plainly, with one number if they have one",
      "18–20s: what they'd tell a friend",
    ],
    camera: "Phone, handheld, arm's length, slight movement. Never a tripod.",
    lighting: "Window light, one side, unflattering is fine and reads as honest.",
    hookShape: "Start mid-sentence on a specific complaint. No 'hi guys', no logo.",
    audio: "to-camera",
    idealSeconds: 20,
    platforms: ["TikTok", "Instagram Reels", "Facebook", "YouTube Shorts"],
    failsWhen: "It looks lit, scripted or shot in a studio — the whole format's credibility is that it does not.",
    disclosure: "If the person was paid, gifted or is an employee, that must be disclosed on the video itself (ASA/CAP in the UK, FTC in the US). A testimonial must be a real customer's real experience.",
  },
  {
    id: "street-interview",
    label: "Street interview",
    looksLike: "Someone stopped on a pavement, asked one question, answering honestly.",
    shots: [
      "0–2s: the question already being asked, mic in frame",
      "2–6s: the answer nobody expects",
      "6–12s: two or three more people, cut fast, same question",
      "12–18s: the one who says the thing the ad is about",
      "18–22s: the ask, plainly",
    ],
    camera: "Handheld, follows the subject, mic visible — the mic is what makes it read as real.",
    lighting: "Daylight, outdoors, whatever the weather is doing.",
    hookShape: "Open on the question, not on the interviewer. The viewer should be answering it in their head by second two.",
    audio: "interview",
    idealSeconds: 22,
    platforms: ["TikTok", "Instagram Reels", "YouTube Shorts"],
    failsWhen: "The answers sound written. One genuinely unhelpful answer left in makes the rest believable.",
    disclosure: "Everyone recognisable on camera needs a release, and a paid or briefed respondent is not a member of the public — say so.",
  },
  {
    id: "podcast-clip",
    label: "Podcast clip",
    looksLike: "Two people mid-conversation, captions burned in, one strong claim.",
    shots: [
      "0–2s: mid-claim, the sentence already running",
      "2–15s: the argument, cutting between speakers",
      "15–25s: the line worth quoting",
      "25–30s: where to hear the rest",
    ],
    camera: "Two fixed angles, cut on speaker change. Mics in frame.",
    lighting: "Warm, low-key, studio. This is the one format allowed to look produced.",
    hookShape: "Open on the most disagreeable true sentence in the whole recording.",
    audio: "interview",
    idealSeconds: 30,
    platforms: ["Instagram Reels", "TikTok", "LinkedIn", "YouTube Shorts"],
    failsWhen: "It starts at the beginning of the conversation. The beginning is never the hook — the Clip Finder exists to find where the hook actually is.",
  },
  {
    id: "founder-direct",
    label: "Founder to camera",
    looksLike: "The person who built it, explaining why, without a script.",
    shots: [
      "0–3s: who they are and what they built, in one sentence",
      "3–12s: the problem they had that made them build it",
      "12–20s: what it does, shown not described",
      "20–25s: the ask",
    ],
    camera: "Phone or single camera, chest-up, static or gently handheld.",
    lighting: "Wherever they actually work. A real background beats a clean one.",
    hookShape: "Lead with the problem they personally had, not the company name.",
    audio: "to-camera",
    idealSeconds: 25,
    platforms: ["LinkedIn", "Instagram Reels", "TikTok", "Facebook"],
    failsWhen: "It becomes an About Us. Nobody watches an About Us.",
  },
  {
    id: "problem-solution",
    label: "Problem → solution",
    looksLike: "The frustration acted out, then removed.",
    shots: [
      "0–2s: the frustration, happening, no setup",
      "2–6s: it getting worse",
      "6–12s: the product entering",
      "12–18s: the same moment, now fine",
      "18–20s: the ask",
    ],
    camera: "Whatever the scene needs, but the two halves must match framing so the change is legible.",
    lighting: "Match both halves. If the 'after' is better lit, the ad is about lighting.",
    hookShape: "Show the problem happening to someone, not a caption describing it.",
    audio: "voiceover",
    idealSeconds: 20,
    platforms: ["TikTok", "Instagram Reels", "Facebook", "YouTube Shorts"],
    failsWhen: "The problem is exaggerated into slapstick — the viewer stops believing the solution too.",
  },
  {
    id: "before-after",
    label: "Before and after",
    looksLike: "One frame, two states, no argument needed.",
    shots: ["0–2s: the before, held", "2–4s: the transition, single cut or wipe", "4–10s: the after, held longer", "10–15s: how, briefly", "15–18s: the ask"],
    camera: "IDENTICAL framing both halves — locked off, same lens, same distance.",
    lighting: "Identical. Any difference makes the result look faked, whether or not it is.",
    hookShape: "Open on the before at its worst, with no caption. Let it be recognised.",
    audio: "ambient",
    idealSeconds: 18,
    platforms: ["TikTok", "Instagram Reels", "Facebook"],
    failsWhen: "Anything changes between the two shots except the thing being sold.",
    disclosure: "A before/after that implies a result must be a real, typical result — an atypical one needs saying so. This is enforced in health, beauty and finance.",
  },
  {
    id: "unboxing",
    label: "Unboxing",
    looksLike: "Hands, a box, and the first look at what's inside.",
    shots: ["0–2s: hands already opening", "2–8s: what's in there, one item at a time", "8–14s: the first use", "14–18s: the reaction", "18–20s: the ask"],
    camera: "Overhead or over-shoulder, close. Hands in frame throughout.",
    lighting: "Bright, even, top-down. This is the one place a clean look helps.",
    hookShape: "Start with the box already opening. Nobody watches a box sit still.",
    audio: "ambient",
    idealSeconds: 20,
    platforms: ["TikTok", "Instagram Reels", "YouTube Shorts"],
    failsWhen: "The packaging gets more screen time than the product.",
  },
  {
    id: "demo-hands",
    label: "Hands-on demo",
    looksLike: "The thing being used, properly, by someone who knows how.",
    shots: ["0–2s: the hardest bit, done easily", "2–10s: the steps, in order", "10–16s: the result", "16–20s: the ask"],
    camera: "Close, over-shoulder or top-down. The hands are the subject.",
    lighting: "Even and bright enough to see detail. Shadow on the working area kills it.",
    hookShape: "Open on the moment that looks difficult — then do it.",
    audio: "voiceover",
    idealSeconds: 20,
    platforms: ["YouTube Shorts", "TikTok", "Instagram Reels", "LinkedIn"],
    failsWhen: "It shows the easy part. The viewer wants to see the bit they are worried about.",
  },
  {
    id: "day-in-the-life",
    label: "Day in the life",
    looksLike: "A real routine, with the product where it actually sits.",
    shots: ["0–2s: an unglamorous real moment", "2–15s: the day, fast cuts, timestamps", "15–22s: the product in its natural place", "22–25s: the ask"],
    camera: "Handheld, moving, imperfect. Timestamps or location cards help.",
    lighting: "Whatever the day looks like. Do not relight.",
    hookShape: "Open on the least impressive moment of the day. Aspirational openings are scrolled.",
    audio: "voiceover",
    idealSeconds: 25,
    platforms: ["TikTok", "Instagram Reels"],
    failsWhen: "It becomes an advert wearing a routine. If the product appears in the first three seconds, it is an advert.",
  },
  {
    id: "myth-bust",
    label: "Myth versus reality",
    looksLike: "A thing everyone believes, taken apart with evidence.",
    shots: ["0–2s: the myth, stated as most people say it", "2–5s: 'that's wrong, and here's why'", "5–15s: the evidence, shown", "15–20s: what to do instead", "20–22s: the ask"],
    camera: "To camera or over a demonstration. Cut to the evidence, do not describe it.",
    lighting: "Clear and neutral. This format trades on credibility.",
    hookShape: "Say the myth in the viewer's own words so they nod before they disagree.",
    audio: "to-camera",
    idealSeconds: 22,
    platforms: ["TikTok", "Instagram Reels", "LinkedIn", "YouTube Shorts"],
    failsWhen: "The 'myth' is a straw man nobody believes. And a claim made here is a claim you must be able to substantiate.",
    disclosure: "Factual claims in this format are advertising claims. They must be substantiated before publication — the Truth Layer blocks the ones that are not.",
  },
  {
    id: "green-screen-react",
    label: "Green screen reaction",
    looksLike: "Someone standing in front of a screenshot, reacting to it.",
    shots: ["0–2s: the screenshot already up, reaction already happening", "2–12s: reading it out, reacting", "12–18s: what it means for the viewer", "18–20s: the ask"],
    camera: "Static, waist-up, subject to one side so the screenshot is readable.",
    lighting: "Flat and even, so the key is clean.",
    hookShape: "Lead with the screenshot's most surprising line, read aloud.",
    audio: "to-camera",
    idealSeconds: 20,
    platforms: ["TikTok", "Instagram Reels"],
    failsWhen: "The screenshot is unreadable at phone size, or it is somebody else's content used without permission.",
    disclosure: "Reacting to third-party content is not automatically fair dealing. Use your own screenshots, or content you have the right to show.",
  },
  {
    id: "listicle-fast",
    label: "Fast listicle",
    looksLike: "Five things, cut hard, no filler between them.",
    shots: ["0–2s: 'five things' + the payoff of the list", "2–20s: one per beat, hard cuts", "20–24s: the one that matters most, repeated", "24–26s: the ask"],
    camera: "Whatever each item needs. The cut is the format.",
    lighting: "Consistent across items or it reads as stitched from three shoots.",
    hookShape: "Promise the payoff, not the count. 'Five things' is not a hook; 'five things costing you customers' is.",
    audio: "voiceover",
    idealSeconds: 26,
    platforms: ["TikTok", "Instagram Reels", "YouTube Shorts", "LinkedIn"],
    failsWhen: "Items are the same weight. Put the strongest first, not last — this is not a countdown show.",
  },
];

export const adStyle = (id: string): AdStyle | null => AD_STYLES.find((s) => s.id === id) || null;

// ---------------------------------------------------------------------------
// Style → a brief the video gateway can actually render
//
// The gateway takes a prompt. Handing it "make a UGC ad for X" gets the model's
// idea of UGC, which is a lit studio with a smiling actor. Handing it the shot
// list, the camera, the lighting and what NOT to do gets the format.
// ---------------------------------------------------------------------------
export type StyleBrief = {
  style: AdStyle;
  prompt: string;
  seconds: number;
  checklist: string[];
  disclosure: string;
  warnings: string[];
};

export function briefFor(input: {
  styleId: string;
  product: string;
  audience?: string;
  problem?: string;
  outcome?: string;
  brandColours?: string[];
  seconds?: number;
  /** What the site actually says — from the stored crawl, when there is one. */
  facts?: string[];
}): { ok: false; error: string } | { ok: true; brief: StyleBrief } {
  const s = adStyle(input.styleId);
  if (!s) return { ok: false, error: `Unknown style "${input.styleId}" — use ${AD_STYLES.map((x) => x.id).join(", ")}` };

  const product = (input.product || "").trim();
  if (!product) return { ok: false, error: "Say what is being advertised. A style without a product renders a stock video." };

  const seconds = Math.max(4, Math.round(input.seconds || s.idealSeconds));
  const warnings: string[] = [];
  if (seconds < s.idealSeconds) {
    warnings.push(`${s.label} needs about ${s.idealSeconds}s to land its shots; at ${seconds}s the shot list will be cut short. A model will still render something — it will not be this format.`);
  }

  const lines = [
    `FORMAT: ${s.label}. ${s.looksLike}`,
    ``,
    `SUBJECT: ${product}${input.audience ? `, for ${input.audience}` : ""}.`,
    input.problem ? `THE PROBLEM IT REMOVES: ${input.problem}` : "",
    input.outcome ? `THE OUTCOME TO SHOW: ${input.outcome}` : "",
    ``,
    `SHOT LIST — render these, in this order:`,
    ...s.shots.map((sh) => `  ${sh}`),
    ``,
    `CAMERA: ${s.camera}`,
    `LIGHTING: ${s.lighting}`,
    `FIRST TWO SECONDS: ${s.hookShape}`,
    `AUDIO: ${s.audio === "to-camera" ? "spoken straight to camera, unscripted register" : s.audio === "voiceover" ? "voiceover over action, no talking head" : s.audio === "interview" ? "two voices, cut on speaker change" : "ambient sound only, no narration"}`,
    ``,
    `DO NOT: ${s.failsWhen}`,
    input.brandColours?.length ? `BRAND COLOURS present but not dominant: ${input.brandColours.slice(0, 3).join(", ")}` : "",
    input.facts?.length ? `\nTRUE OF THIS BUSINESS — use these, invent nothing else:\n${input.facts.slice(0, 8).map((f) => `  - ${f}`).join("\n")}` : "",
  ].filter(Boolean);

  return {
    ok: true,
    brief: {
      style: s,
      seconds,
      prompt: lines.join("\n"),
      // Things you can look at the render and check. Not predictions — this
      // platform does not forecast a video's performance before it exists.
      checklist: [
        `Does the first frame already show ${s.hookShape.toLowerCase().replace(/\.$/, "")}?`,
        `Are the shots in the order above, or has the model reordered them?`,
        `Camera: ${s.camera.split(".")[0].toLowerCase()} — is it?`,
        `Watch it on a phone, on mute, and see whether it still reads.`,
        `Check it against DO NOT: ${s.failsWhen}`,
      ],
      disclosure: s.disclosure || "No format-specific disclosure. Ordinary advertising rules still apply: every claim must be substantiable.",
      warnings,
    },
  };
}

// Which styles suit a business, without pretending to rank them by performance.
export function stylesForPlatform(platform: string): AdStyle[] {
  const p = (platform || "").toLowerCase();
  if (!p) return AD_STYLES;
  return AD_STYLES.filter((s) => s.platforms.some((x) => x.toLowerCase().includes(p)));
}
