// Proof of work — ONE definition of the puzzle, used by both sides.
//
// The browser solves it and the server verifies it. If those two ever disagreed
// about what counts as a solution, every real customer would be locked out while
// every bot sailed through, so they share this file rather than each carrying
// their own copy of the rule. Same reason the merge-token grammar is shared
// between the editor and the send path.
//
// WebCrypto is used deliberately: `globalThis.crypto.subtle` is the same
// primitive in Node 18+ and in every browser we support, so there is no chance
// of the two implementations drifting.

/** Bumped if the puzzle ever changes shape, so an old solution cannot be replayed against a new rule. */
export const POW_VERSION = "mwpow1";

/**
 * The work a signup must show: 2^18 hashes on average, ~1.4 million in the
 * unluckiest 1%.
 *
 * The comment that used to sit here said "well under a second on a phone". It
 * was never measured and it was wrong by more than an order of magnitude,
 * because the solver awaited one `crypto.subtle.digest` per attempt and the
 * per-call promise overhead — not the hashing — set the pace. Measured on a
 * server-class machine that was 16k hashes/sec: a mean of 7.3 seconds, with
 * runs over 14. A phone was several times worse again, which is what turned a
 * check into a wall.
 *
 * The difficulty is unchanged. `sha256HexSync` below is what made it honest.
 */
export const DEFAULT_BITS = 18;

/** How long a challenge stays solvable. Long enough to fill in a form, short enough to be worth nothing later. */
export const CHALLENGE_TTL_MS = 10 * 60_000;

function subtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) throw new Error("WebCrypto unavailable — proof of work cannot be computed here.");
  return c.subtle;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await subtle().digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// The same digest, computed without a promise per attempt.
//
// WebCrypto stays the DEFINITION of the puzzle: `sha256Hex` above is what the
// server verifies with, and a test asserts this function agrees with it on
// thousands of random inputs plus the exact `powInput` shape, so the two cannot
// drift. What this removes is not hashing work — it is 262,144 awaits.
//
// Nothing about the difficulty, the rule, or what counts as a solution changes.
// A faster pencil, not an easier exam.
// ---------------------------------------------------------------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const encoder = new TextEncoder();
const W = new Uint32Array(64);

/** SHA-256 of a string, as lower-case hex. Byte-identical to `sha256Hex`. */
export function sha256HexSync(input: string): string {
  const bytes = encoder.encode(input);
  const len = bytes.length;
  const total = (Math.floor((len + 8) / 64) + 1) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;

  // The message length in BITS, big-endian across the last eight bytes. Split
  // into two 32-bit halves because a bit count can exceed what a bitwise
  // operation can hold.
  const bitLen = len * 8;
  const hi = Math.floor(bitLen / 0x1_0000_0000);
  const lo = bitLen >>> 0;
  buf[total - 8] = (hi >>> 24) & 0xff; buf[total - 7] = (hi >>> 16) & 0xff;
  buf[total - 6] = (hi >>> 8) & 0xff;  buf[total - 5] = hi & 0xff;
  buf[total - 4] = (lo >>> 24) & 0xff; buf[total - 3] = (lo >>> 16) & 0xff;
  buf[total - 2] = (lo >>> 8) & 0xff;  buf[total - 1] = lo & 0xff;

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  for (let p = 0; p < total; p += 64) {
    for (let i = 0; i < 16; i++) {
      const j = p + i * 4;
      W[i] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = W[i - 15], y = W[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  let out = "";
  for (const x of [h0, h1, h2, h3, h4, h5, h6, h7]) out += x.toString(16).padStart(8, "0");
  return out;
}

/** How many leading zero BITS a hex digest opens with. Bits, not characters, so difficulty can be tuned finely. */
export function leadingZeroBits(hex: string): number {
  let bits = 0;
  for (const ch of hex) {
    const v = parseInt(ch, 16);
    if (Number.isNaN(v)) break;
    if (v === 0) { bits += 4; continue; }
    // 8→0 leading zeros, 4→1, 2→2, 1→3.
    bits += Math.clz32(v) - 28;
    break;
  }
  return bits;
}

/** The exact string that gets hashed. Both sides call this — never inline it. */
export function powInput(nonce: string, solution: string | number): string {
  return `${POW_VERSION}:${nonce}:${solution}`;
}

export async function meetsDifficulty(nonce: string, solution: string | number, bits: number): Promise<boolean> {
  if (!nonce || solution === "" || solution === null || solution === undefined) return false;
  return leadingZeroBits(await sha256Hex(powInput(nonce, solution))) >= bits;
}

/**
 * Find a solution. Runs in the browser on the signup form.
 *
 * Capped rather than open-ended: an unbounded loop on a slow phone is a frozen
 * tab, and a customer who cannot sign up is a worse outcome than a bot that can.
 * A caller that gets `null` back should say so and let the person try again.
 */
export async function solve(
  nonce: string,
  bits: number,
  opts: { maxHashes?: number; onProgress?: (hashes: number) => void } = {},
): Promise<{ solution: string; hashes: number } | null> {
  const maxHashes = opts.maxHashes ?? 4_000_000;
  if (!nonce) return null;
  for (let n = 0; n < maxHashes; n++) {
    if (leadingZeroBits(sha256HexSync(powInput(nonce, n))) >= bits) return { solution: String(n), hashes: n + 1 };
    // Hand the thread back periodically. The loop is synchronous now, so
    // without this the tab would freeze — which is the failure this function's
    // own comment was written to avoid, just arriving by a different route.
    if (n > 0 && n % 20_000 === 0) {
      opts.onProgress?.(n);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return null;
}
