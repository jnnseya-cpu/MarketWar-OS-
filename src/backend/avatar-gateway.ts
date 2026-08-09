// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Presenter video — a synthetic face and voice reading a script.
//
// One door to every avatar provider, exactly like the text and image gateways:
// feature code never calls a vendor, so a provider can be swapped, priced or
// dropped without touching a screen.
//
// THE PART THAT IS NOT LIKE THE OTHER GATEWAYS. An image gateway that renders
// the wrong thing wastes an ACU. An avatar gateway that renders the wrong thing
// puts a PERSON'S FACE on a claim they never made. So this one refuses before
// it renders:
//
//   • A STOCK avatar is a licensed performer. The licence is the provider's,
//     and it does not cover every use — several forbid political, medical and
//     financial-advice content outright, and none of them let you imply the
//     performer personally endorses the product.
//   • A CUSTOM avatar is a real person the customer knows, and needs a consent
//     record — `likeness-consent.ts` — scoped to territory, platform, paid use
//     and an end date. No record, no render. Not a warning: a refusal.
//   • Either way the output is SYNTHETIC MEDIA and must say so. The EU AI Act
//     requires the disclosure, the ASA treats an undisclosed synthetic
//     endorsement as misleading, and a viewer who discovers it afterwards
//     treats it as a lie about everything else in the ad.
//
// Providers are reached over REST behind env keys, and with none set the module
// returns a real, useful BRIEF rather than a fake video — the same honesty rule
// the image gateway keeps.

import { consentFor, SYNTHETIC_DISCLOSURE } from "@/backend/likeness-consent";

export type AvatarProviderId = "heygen" | "did" | "synthesia" | "none";

export type AvatarProvider = {
  id: AvatarProviderId;
  label: string;
  envKey: string;
  /** Uses the provider itself forbids, from their published policies. */
  forbids: string[];
  customAvatars: boolean;
};

export const AVATAR_PROVIDERS: AvatarProvider[] = [
  {
    id: "heygen", label: "HeyGen", envKey: "HEYGEN_API_KEY", customAvatars: true,
    forbids: ["impersonating a real person without consent", "political campaigning", "content implying a medical or financial recommendation"],
  },
  {
    id: "did", label: "D-ID", envKey: "DID_API_KEY", customAvatars: true,
    forbids: ["animating a photo of someone who has not consented", "deceptive or defamatory depiction"],
  },
  {
    id: "synthesia", label: "Synthesia", envKey: "SYNTHESIA_API_KEY", customAvatars: true,
    forbids: ["news-style content", "political content", "claims requiring regulatory approval"],
  },
];

export function configuredProvider(): AvatarProvider | null {
  return AVATAR_PROVIDERS.find((p) => Boolean(process.env[p.envKey])) || null;
}

export function avatarGatewayConfigured(): boolean { return configuredProvider() !== null; }

// ---------------------------------------------------------------------------
// Categories a synthetic presenter must not be pointed at
//
// Not squeamishness — these are the categories where a synthetic endorsement is
// both a provider policy breach AND a regulated-advertising problem, so a render
// here would be refused twice over and the second refusal costs the customer
// their account rather than an ACU.
// ---------------------------------------------------------------------------
const RESTRICTED = [
  { re: /\b(cure|treat|diagnos|prescri|clinically proven|medical|prescription)\b/i, why: "medical claims" },
  { re: /\b(invest|returns?|profit guaranteed|crypto|trading signals?|financial advice)\b/i, why: "financial advice or investment returns" },
  { re: /\b(vote|election|candidate|referendum|political party)\b/i, why: "political content" },
  { re: /\b(breaking news|reports? confirm|sources say)\b/i, why: "news-style presentation" },
];

export function restrictedUse(script: string): { restricted: boolean; why: string[] } {
  const why = RESTRICTED.filter((r) => r.re.test(script || "")).map((r) => r.why);
  return { restricted: why.length > 0, why };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
export type AvatarRequest = {
  brandId: string;
  script: string;
  /** A provider's licensed performer, or a real person the customer knows. */
  avatarKind: "stock" | "custom";
  avatarId?: string;        // provider's stock avatar id
  personName?: string;      // required for custom — whose face this is
  voiceId?: string;
  territory?: string;
  platform?: string;
  paidAd?: boolean;
  nowISO: string;
};

export type AvatarJob =
  | {
      ok: true;
      mode: "live" | "brief";
      provider: AvatarProviderId;
      jobRef: string | null;
      disclosure: string;
      note: string;
      /** What to render, when no provider is configured — a real deliverable. */
      brief?: string;
    }
  | { ok: false; error: string; hint?: string };

/**
 * Every refusal, and NOT the render.
 *
 * Split out deliberately. A caller has to charge for a render, and charging
 * before the gates means a refused request debits an ACU, while charging after
 * the provider has started means the PLATFORM pays for a render the customer
 * could not afford. Neither is acceptable, so the order has to be: gates here,
 * then the wallet, then `renderAvatar`. This is exported so a route can do that
 * without duplicating a single rule.
 */
export async function gateAvatar(req: AvatarRequest): Promise<{ ok: true } | { ok: false; error: string; hint?: string }> {
  const script = (req.script || "").trim();
  if (!script) return { ok: false, error: "There is no script. A presenter with nothing to say renders a person staring." };
  if (script.length > 4000) return { ok: false, error: "That script is longer than any short-form ad should be — trim it to the one point the video is making." };

  // 1. The category gate, before anything else. This one costs an account, not
  //    an ACU, so it is checked before consent and before the provider.
  const restricted = restrictedUse(script);
  if (restricted.restricted) {
    return {
      ok: false,
      error: `A synthetic presenter cannot be used for ${restricted.why.join(", ")}.`,
      hint: "Every avatar provider forbids these outright, and the advertising regulators treat a synthetic endorsement in these categories as misleading. Film a real person, or make the claim without a presenter.",
    };
  }

  // 2. A custom avatar is somebody's face. No consent record, no render.
  if (req.avatarKind === "custom") {
    const person = (req.personName || "").trim();
    if (!person) return { ok: false, error: "Name whose likeness this is. A custom avatar without a named person cannot be checked against a consent." };
    const face = await consentFor({ brandId: req.brandId, personName: person, kind: "face", territory: req.territory, platform: req.platform, paidAd: req.paidAd, nowISO: req.nowISO });
    if (!face.allowed) return { ok: false, error: face.reason, hint: "Record the consent — with evidence, territories, platforms and an end date — and this will run." };
    // A voice is a separate permission. Consent to a face is not consent to be
    // heard saying something.
    if (req.voiceId) {
      const voice = await consentFor({ brandId: req.brandId, personName: person, kind: "voice", territory: req.territory, platform: req.platform, paidAd: req.paidAd, nowISO: req.nowISO });
      if (!voice.allowed) return { ok: false, error: voice.reason, hint: "A face consent does not cover a voice. Record the voice consent separately, or use a stock voice." };
    }
  }
  return { ok: true };
}

/** Will this cost anything? A brief calls nobody, so it is free — and the caller needs to know BEFORE it meters. */
export function wouldCallProvider(): boolean { return configuredProvider() !== null; }

export async function renderAvatar(req: AvatarRequest): Promise<AvatarJob> {
  // The gates run here too. A second entry point that skipped them would be the
  // whole point of the module lost to a convenience.
  const gate = await gateAvatar(req);
  if (!gate.ok) return gate;
  const script = (req.script || "").trim();

  const provider = configuredProvider();

  // 3. No provider configured — return the BRIEF rather than a fake video.
  if (!provider) {
    return {
      ok: true,
      mode: "brief",
      provider: "none",
      jobRef: null,
      disclosure: SYNTHETIC_DISCLOSURE,
      brief: [
        `PRESENTER SCRIPT (${Math.ceil(script.split(/\s+/).length / 2.5)}s at a natural pace):`,
        "",
        script,
        "",
        "Framing: chest-up, eyeline to lens, neutral background in a brand colour.",
        "Captions: burned in — most of this will be watched on mute.",
        `Disclosure: ${SYNTHETIC_DISCLOSURE}`,
      ].join("\n"),
      note: "No avatar provider is configured, so nothing was rendered and nothing was charged. The script and shot brief above are real and usable — film them, or set HEYGEN_API_KEY / DID_API_KEY / SYNTHESIA_API_KEY to render.",
    };
  }

  // 4. Live. The adapter is deliberately thin — one door, and the provider's own
  //    id scheme stays the provider's business.
  const started = await startWith(provider, req, script);
  if (!started.ok) return { ok: false, error: started.error };

  return {
    ok: true,
    mode: "live",
    provider: provider.id,
    jobRef: started.ref,
    disclosure: SYNTHETIC_DISCLOSURE,
    note: `Rendering with ${provider.label}. ${req.avatarKind === "custom" ? "Consent on record and in date." : "Stock performer — you may not imply they personally endorse the product."} ${SYNTHETIC_DISCLOSURE}`,
  };
}

async function startWith(p: AvatarProvider, req: AvatarRequest, script: string): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  const key = process.env[p.envKey] as string;
  try {
    if (p.id === "heygen") {
      const res = await fetch("https://api.heygen.com/v2/video/generate", {
        method: "POST",
        headers: { "X-Api-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          video_inputs: [{
            character: { type: "avatar", avatar_id: req.avatarId || "" },
            voice: { type: "text", input_text: script, voice_id: req.voiceId || undefined },
          }],
          dimension: { width: 1080, height: 1920 },
        }),
      });
      if (!res.ok) return { ok: false, error: `HeyGen ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
      const d = (await res.json().catch(() => null)) as { data?: { video_id?: string } } | null;
      const ref = d?.data?.video_id;
      return ref ? { ok: true, ref } : { ok: false, error: "HeyGen returned no video id." };
    }
    if (p.id === "did") {
      const res = await fetch("https://api.d-id.com/talks", {
        method: "POST",
        headers: { Authorization: `Basic ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ script: { type: "text", input: script }, presenter_id: req.avatarId || undefined }),
      });
      if (!res.ok) return { ok: false, error: `D-ID ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
      const d = (await res.json().catch(() => null)) as { id?: string } | null;
      return d?.id ? { ok: true, ref: d.id } : { ok: false, error: "D-ID returned no id." };
    }
    const res = await fetch("https://api.synthesia.io/v2/videos", {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({ test: false, input: [{ scriptText: script, avatar: req.avatarId || undefined }] }),
    });
    if (!res.ok) return { ok: false, error: `Synthesia ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
    const d = (await res.json().catch(() => null)) as { id?: string } | null;
    return d?.id ? { ok: true, ref: d.id } : { ok: false, error: "Synthesia returned no id." };
  } catch (e) {
    return { ok: false, error: `${p.label} request failed: ${e instanceof Error ? e.message : "network error"}` };
  }
}
