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

/** The work a signup must show. ~2^18 hashes ≈ well under a second on a phone. */
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
  for (let n = 0; n < maxHashes; n++) {
    if (await meetsDifficulty(nonce, n, bits)) return { solution: String(n), hashes: n + 1 };
    if (opts.onProgress && n > 0 && n % 20_000 === 0) opts.onProgress(n);
  }
  return null;
}
