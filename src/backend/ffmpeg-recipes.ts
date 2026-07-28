// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// The FFmpeg command for each render job kind — defined ONCE, here.
//
// Two very different things execute these: the self-hosted worker container
// (worker/), which spawns ffmpeg directly, and any hosted FFmpeg API, which
// takes the same argument list over HTTP. Keeping the recipes in one place means
// a fix to the crop maths or the caption style lands in both at once, and a new
// job kind is added in one file rather than three.
//
// A recipe returns one or more PASSES. Most kinds are a single pass; "clips" is
// one pass per moment, which is why the shape is a list.

export type VideoJobKind =
  | "trim" | "clips" | "captions_burn" | "brand" | "broll" | "bg_remove" | "upscale";

export type RenderPass = {
  // Output filename this pass writes. Callers join it to their own temp dir.
  output: string;
  // FFmpeg arguments, with two placeholders the executor substitutes:
  //   $IN     the downloaded source video
  //   $OUT    the output path for this pass
  //   $ASSET  the secondary input (logo / B-roll / subtitle file), when present
  args: string[];
  // A second file this pass needs fetched first, if any.
  asset?: { url?: string; inlineText?: string; filename: string };
  // Human label, used in progress reporting.
  label: string;
};

export class RecipeError extends Error {}

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// Escaping for the subtitles filter: the path is inside a filtergraph, so ":"
// and "\" must be escaped or the graph fails to parse.
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

const CAPTION_STYLE =
  "FontName=DejaVu Sans,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=3,Outline=1,MarginV=40";

// Encode settings shared by every pass that re-encodes video. veryfast keeps a
// render cheap; the upscale overrides it because quality is the whole point.
const X264 = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"];

export function buildRecipe(kind: VideoJobKind, params: Record<string, unknown>): RenderPass[] {
  switch (kind) {
    case "trim": {
      const start = Math.max(0, num(params.startSec, 0));
      const end = num(params.endSec, start + 15);
      const dur = Math.max(0.1, end - start);
      return [{
        label: "Trimming",
        output: "trim.mp4",
        // -ss before -i seeks by keyframe (fast); -t after sets the duration.
        args: ["-ss", String(start), "-i", "$IN", "-t", String(dur), ...X264, "-c:a", "aac", "$OUT"],
      }];
    }

    case "clips": {
      const moments = Array.isArray(params.moments) ? params.moments.slice(0, 30) : [];
      if (!moments.length) throw new RecipeError("Cutting clips needs at least one moment — rank them in the Clip Lab first.");
      const vertical = params.aspect === "9:16";
      // crop to a 9:16 column from the centre, then scale to 1080x1920 — the
      // frame every vertical platform expects.
      const reframe = vertical ? ["-vf", "crop=ih*9/16:ih,scale=1080:1920"] : [];
      return moments.map((raw, i) => {
        const m = (raw || {}) as Record<string, unknown>;
        const start = Math.max(0, num(m.startSec, 0));
        const dur = Math.max(1, num(m.endSec, start + 20) - start);
        return {
          label: `Clip ${i + 1} of ${moments.length}`,
          output: `clip_${String(i + 1).padStart(2, "0")}.mp4`,
          args: ["-ss", String(start), "-i", "$IN", "-t", String(dur), ...reframe, ...X264, "-c:a", "aac", "$OUT"],
        };
      });
    }

    case "captions_burn": {
      const srt = typeof params.srt === "string" ? params.srt.trim() : "";
      if (!srt) throw new RecipeError("Burning captions needs the SRT — run the Caption Engine on this video first.");
      return [{
        label: "Burning captions",
        output: "captioned.mp4",
        asset: { inlineText: srt, filename: "subs.srt" },
        args: ["-i", "$IN", "-vf", `subtitles=$ASSET_ESCAPED:force_style='${CAPTION_STYLE}'`, ...X264, "-c:a", "copy", "$OUT"],
      }];
    }

    case "brand": {
      const logoUrl = typeof params.logoUrl === "string" ? params.logoUrl.trim() : "";
      if (!logoUrl) {
        // No logo is not an error — it is a no-op remux, so the customer still
        // gets a file back rather than a failure they paid for.
        return [{ label: "Copying (no logo set)", output: "branded.mp4", args: ["-i", "$IN", "-c", "copy", "$OUT"] }];
      }
      return [{
        label: "Watermarking",
        output: "branded.mp4",
        asset: { url: logoUrl, filename: "logo.png" },
        // Scale the logo to 14% of frame width, inset 30px from bottom-right.
        args: ["-i", "$IN", "-i", "$ASSET", "-filter_complex", "[1]scale=iw*0.14:-1[wm];[0][wm]overlay=W-w-30:H-h-30", ...X264, "-c:a", "copy", "$OUT"],
      }];
    }

    case "broll": {
      const brollUrl = typeof params.brollUrl === "string" ? params.brollUrl.trim() : "";
      if (!brollUrl) throw new RecipeError("Adding B-roll needs a second video — give its hosted URL.");
      const until = Math.max(1, num(params.untilSec, 8));
      return [{
        label: "Compositing B-roll",
        output: "broll_out.mp4",
        asset: { url: brollUrl, filename: "broll.mp4" },
        args: ["-i", "$IN", "-i", "$ASSET", "-filter_complex",
          `[1]scale=iw*0.35:-1[pip];[0][pip]overlay=W-w-40:40:enable='between(t,0,${until})'`,
          ...X264, "-c:a", "copy", "$OUT"],
      }];
    }

    case "bg_remove": {
      // Chroma-key, not ML matting. This only works on a real green screen and
      // the UI says so — claiming AI background removal here would be a lie.
      const colour = typeof params.colour === "string" && /^0x[0-9a-f]{6}$/i.test(params.colour) ? params.colour : "0x00FF00";
      return [{
        label: "Keying the background",
        output: "keyed.webm",
        // VP9 + alpha: MP4 cannot carry transparency, WebM can.
        args: ["-i", "$IN", "-vf", `chromakey=${colour}:0.18:0.06,format=yuva420p`,
          "-c:v", "libvpx-vp9", "-b:v", "2M", "-c:a", "libopus", "$OUT"],
      }];
    }

    case "upscale": {
      const h = Math.min(2160, Math.max(720, Math.round(num(params.height, 1080))));
      return [{
        label: `Upscaling to ${h}p`,
        output: `up_${h}.mp4`,
        // -2 keeps the width even (h264 requires it) while preserving aspect.
        // slow/crf 18 because a fast upscale defeats the purpose.
        args: ["-i", "$IN", "-vf", `scale=-2:${h}:flags=lanczos`,
          "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "$OUT"],
      }];
    }

    default:
      throw new RecipeError(`Unknown render kind: ${String(kind)}`);
  }
}

// ---------------------------------------------------------------------------
// Hosted-API translation.
//
// A hosted FFmpeg API takes an ORDERED list of {option, argument} pairs rather
// than an argv array, supplies the input via its own `inputs` field and writes
// the output to its own bucket. So the translation drops `-i`/input and the
// output path, and pairs the rest.
//
// One capability gap is real and must not be papered over: ffmpeg-micro does not
// support -filter_complex. That rules out the two kinds that composite a SECOND
// video source over the first — watermarking and B-roll — because an overlay of
// two inputs has no single-input `-vf` equivalent. Those kinds stay on the
// self-hosted worker, and the code says so rather than submitting a job that
// will fail after the customer has paid.
// ---------------------------------------------------------------------------
export type OptionPair = { option: string; argument: string };

export function passSupportedOnHostedApi(pass: RenderPass): boolean {
  return !pass.args.includes("-filter_complex");
}

export function hostedApiUnsupportedReason(kind: VideoJobKind): string | null {
  const passes = (() => {
    try { return buildRecipe(kind, kind === "clips" ? { moments: [{ startSec: 0, endSec: 1 }] } : kind === "captions_burn" ? { srt: "1" } : kind === "broll" ? { brollUrl: "https://x/x.mp4" } : kind === "brand" ? { logoUrl: "https://x/l.png" } : {}); }
    catch { return []; }
  })();
  if (passes.every(passSupportedOnHostedApi)) return null;
  return "Compositing a second video or image over the frame needs FFmpeg's filter_complex, which the hosted render service does not support. Use the self-hosted render worker for this one.";
}

// Output container the hosted API should produce, taken from the recipe's own
// filename so the two never disagree.
export function outputFormatFor(pass: RenderPass): string {
  const ext = pass.output.toLowerCase().split(".").pop() || "mp4";
  return ext === "webm" ? "webm" : "mp4";
}

export function toOptionPairs(pass: RenderPass, subs: { asset?: string } = {}): OptionPair[] {
  if (!passSupportedOnHostedApi(pass)) {
    throw new RecipeError("This render needs filter_complex, which the hosted service does not support.");
  }
  // Resolve placeholders first; the input and output are the API's job, so they
  // are substituted with sentinels that are then dropped.
  const resolved = resolveArgs(pass.args, { input: " IN", output: " OUT", asset: subs.asset });

  const pairs: OptionPair[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const token = resolved[i];
    // The API supplies the input itself.
    if (token === "-i") { i++; continue; }
    // The API writes to its own bucket; the output path is not ours to give.
    if (token === " OUT" || token === " IN") continue;
    if (!token.startsWith("-")) continue; // a stray value with no flag
    const next = resolved[i + 1];
    const takesArg = next !== undefined && !next.startsWith("-") && next !== " OUT" && next !== " IN";
    pairs.push({ option: token, argument: takesArg ? next : "" });
    if (takesArg) i++;
  }
  return pairs;
}

// Substitute the placeholders for a concrete executor. Kept here so the worker
// and any hosted API agree on exactly what "$IN" means.
export function resolveArgs(args: string[], paths: { input: string; output: string; asset?: string }): string[] {
  return args.map((a) =>
    a
      .replace(/\$ASSET_ESCAPED/g, paths.asset ? escapeFilterPath(paths.asset) : "")
      .replace(/\$ASSET/g, paths.asset ?? "")
      .replace(/\$IN/g, paths.input)
      .replace(/\$OUT/g, paths.output),
  );
}
