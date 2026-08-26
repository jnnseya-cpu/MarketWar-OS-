// HOW LONG IS THIS VIDEO, ACTUALLY?
//
// WHY THIS EXISTS. A 12- or 15-second render is several clips joined by an
// outside service, and that service's reply carries an id and a status — no
// duration, no track list, nothing that says what it produced. So "the join
// succeeded" was the only evidence that a fifteen-second file existed, and the
// customer had already been charged for fifteen seconds before anyone could
// look.
//
// Trusting a third party's "done" for the one fact that decides whether the
// customer got what they paid for is the same mistake as trusting our own
// `ok: true` for whether an email arrived. The file itself is the only witness
// that cannot be wrong, so we read it.
//
// WHAT IT READS. An MP4 is a tree of boxes: 4 bytes of size, 4 of type, then
// the payload. `moov` contains `mvhd`, and `mvhd` carries a timescale (ticks
// per second) and a duration (ticks). Version 0 stores both as 32-bit, version 1
// as 64-bit. Dividing one by the other is the length in seconds, and it is the
// same number every player shows.
//
// It reads the header only — a few hundred bytes in practice — and never
// decodes a frame. A file whose `moov` sits at the end (some encoders put it
// there) simply returns null rather than a wrong answer.

/** Seconds, or null when this is not an MP4 we can read a duration out of. */
export function mp4Duration(buf: Uint8Array): number | null {
  const mvhd = findBox(buf, 0, buf.length, ["moov", "mvhd"]);
  if (!mvhd) return null;

  const { start, end } = mvhd;
  // mvhd payload: version(1) flags(3) then the times.
  if (end - start < 20) return null;
  const version = buf[start];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  try {
    if (version === 1) {
      if (end - start < 32) return null;
      // creation(8) modification(8) timescale(4) duration(8)
      const timescale = dv.getUint32(start + 20);
      const durationHi = dv.getUint32(start + 24);
      const durationLo = dv.getUint32(start + 28);
      const duration = durationHi * 2 ** 32 + durationLo;
      return timescale > 0 ? duration / timescale : null;
    }
    // version 0: creation(4) modification(4) timescale(4) duration(4)
    const timescale = dv.getUint32(start + 12);
    const duration = dv.getUint32(start + 16);
    return timescale > 0 ? duration / timescale : null;
  } catch {
    return null;
  }
}

/**
 * Walk the box tree to one path, e.g. ["moov", "mvhd"].
 *
 * Returns the payload bounds of the last box in the path. Bounds-checked at
 * every step: a truncated or hostile file must return null, not read past the
 * end of the buffer — this parses bytes that came from outside.
 */
function findBox(buf: Uint8Array, from: number, to: number, path: string[]): { start: number; end: number } | null {
  if (path.length === 0) return null;
  const want = path[0];
  let at = from;
  while (at + 8 <= to) {
    const size = readU32(buf, at);
    const type = String.fromCharCode(buf[at + 4], buf[at + 5], buf[at + 6], buf[at + 7]);
    // size 0 means "to the end of the file"; size 1 means a 64-bit size follows.
    let header = 8;
    let boxSize = size;
    if (size === 1) {
      if (at + 16 > to) return null;
      const hi = readU32(buf, at + 8), lo = readU32(buf, at + 12);
      boxSize = hi * 2 ** 32 + lo;
      header = 16;
    } else if (size === 0) {
      boxSize = to - at;
    }
    if (boxSize < header || at + boxSize > to) return null;   // truncated or lying

    if (type === want) {
      const payloadStart = at + header;
      const payloadEnd = at + boxSize;
      if (path.length === 1) return { start: payloadStart, end: payloadEnd };
      return findBox(buf, payloadStart, payloadEnd, path.slice(1));
    }
    at += boxSize;
  }
  return null;
}

function readU32(buf: Uint8Array, at: number): number {
  return ((buf[at] << 24) >>> 0) + (buf[at + 1] << 16) + (buf[at + 2] << 8) + buf[at + 3];
}

/**
 * Is this file the length that was ordered?
 *
 * A joined file is re-encoded, so it lands a fraction either side of the target
 * — a whole second of tolerance covers that without covering the failure this
 * exists to catch, which is not "off by a frame" but "we got one clip back
 * instead of two".
 *
 * Returns true when the duration cannot be read at all: an unreadable header is
 * not evidence of a short video, and failing a render on our own parser's
 * limitations would be inventing a fault.
 */
export function durationMatches(seconds: number | null, orderedSeconds: number, toleranceSec = 1): boolean {
  if (seconds == null) return true;
  return seconds >= orderedSeconds - toleranceSec;
}
