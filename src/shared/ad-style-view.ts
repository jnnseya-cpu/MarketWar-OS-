// THE SHAPE /api/ad-styles ACTUALLY SENDS.
//
// This exists because `/dashboard/video` crashed in production with "Cannot read
// properties of undefined (reading 'join')", and the cause was a client type
// somebody wrote from memory. It declared three fields the server does not send
// in that form:
//
//   • `needs: string[]`  — the server had no such field AT ALL, so `.join()` was
//     called on undefined. The page auto-selects the first format on mount, so
//     this crashed on load, for everyone, every time.
//   • `failsWhen: string[]` — the server sends a STRING. The client called
//     `.map()` on it, which would have been the next crash.
//   • `shots: {seconds, what}[]` — the server sends plain strings with the
//     timing written into them. The client rendered `{s.seconds}s {s.what}`,
//     which printed "undefineds undefined" rather than throwing.
//
// TypeScript could not catch any of it: `await res.json()` is `any`, so a
// hand-written type on the client is a claim nobody checks.
//
// So the shape lives HERE, in `shared`, where both sides import the same
// declaration. The backend asserts its data conforms; the client renders against
// it. Drift is now a compile error rather than a stack trace in front of a
// customer.

export type AdStyleView = {
  id: string;
  label: string;
  /** One line a customer recognises the format by. */
  looksLike: string;
  /**
   * In order, and each one carries its own timing INSIDE the string
   * ("0–2s: face already talking"). Not objects — do not render `.seconds`.
   */
  shots: string[];
  camera: string;
  lighting: string;
  hookShape: string;
  audio: string;
  idealSeconds: number;
  platforms: string[];
  /** ONE sentence, not a list. Render it as text. */
  failsWhen: string;
  /**
   * What you must physically have to film it. The API's own note promises this
   * — "a street interview needs a street and consent, a podcast clip needs two
   * chairs and a microphone" — and the screen has a "You need" heading for it.
   * It was described, rendered, and never actually written.
   */
  needs: string[];
  disclosure?: string;
};
