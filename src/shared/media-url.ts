// What is actually at the end of this URL?
//
// Pasting a YouTube watch link into a "hosted media URL" box is the single most
// common thing a user does, and the worst thing to handle badly: fetching it
// returns an HTML PAGE, and handing that page to a transcription model produces
// "Unrecognized file format" — a provider error that tells the user nothing and,
// worse, arrives after they have been charged.
//
// This classifies the URL up front so both the UI and the server can say what to
// do instead. Shared, because the browser should catch it before the request is
// even made.

export type MediaUrlKind = "media" | "youtube" | "vimeo" | "page" | "invalid";

export type MediaUrlVerdict = {
  kind: MediaUrlKind;
  usable: boolean;      // can this be fetched and processed as media?
  reason?: string;      // what to do instead — written for the customer
  youtubeId?: string;
};

// Extensions we can hand to a transcriber or a renderer.
const MEDIA_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|flv|mp3|m4a|wav|flac|ogg|oga|mpga|mpeg)(\?|#|$)/i;

export function youtubeIdFrom(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url);
  return m ? m[1] : null;
}

export function classifyMediaUrl(raw: string): MediaUrlVerdict {
  const url = (raw || "").trim();
  if (!url) return { kind: "invalid", usable: false, reason: "Paste a link, or choose a file to upload." };

  // A gs:// object in the renderer's own bucket — what a direct-to-storage
  // upload produces. It is media by construction; there is no page to confuse
  // it with.
  if (/^gs:\/\/[^/]+\/.+/.test(url)) return { kind: "media", usable: true };

  let parsed: URL;
  try { parsed = new URL(url); } catch { return { kind: "invalid", usable: false, reason: "That is not a valid web address." }; }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { kind: "invalid", usable: false, reason: "Only https links work here." };
  }

  const ytId = youtubeIdFrom(url);
  if (ytId) {
    return {
      kind: "youtube",
      usable: false,
      youtubeId: ytId,
      reason:
        "That is a YouTube page, not a video file — YouTube does not allow its videos to be downloaded, so nothing here can read the audio from it. " +
        "If the video is yours: YouTube Studio → Content → the three dots → Download, then upload that file here. " +
        "If it is not yours, use the original file or a copy you host yourself.",
    };
  }

  if (/(^|\.)vimeo\.com$/i.test(parsed.hostname) && !MEDIA_EXT.test(parsed.pathname)) {
    return {
      kind: "vimeo",
      usable: false,
      reason: "That is a Vimeo page, not a video file. Download the original from your Vimeo settings and upload it here, or paste a direct link to the file.",
    };
  }

  // A direct file link ends in a media extension. Anything else is probably a
  // page — we let it through only when we cannot tell, and the server then
  // checks the content type before spending anything.
  if (MEDIA_EXT.test(parsed.pathname)) return { kind: "media", usable: true };

  // Storage links carry the name in a query param rather than the path.
  if (MEDIA_EXT.test(parsed.search) || /firebasestorage\.googleapis\.com|storage\.googleapis\.com|\/o\//.test(url)) {
    return { kind: "media", usable: true };
  }

  return {
    kind: "page",
    usable: false,
    reason:
      "That link does not point at a media file — it looks like a web page. Paste a direct link that ends in .mp4, .mov, .webm, .mp3 or .wav, or upload the file instead.",
  };
}

// Content types a transcriber or renderer can actually read. Used server-side
// after fetching, because a URL can lie about what it serves.
export function isMediaContentType(contentType: string): boolean {
  const t = (contentType || "").toLowerCase().split(";")[0].trim();
  if (!t) return true; // no header at all — let the provider decide
  return t.startsWith("audio/") || t.startsWith("video/") || t === "application/octet-stream";
}
