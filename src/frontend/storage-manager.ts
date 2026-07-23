"use client";

// MarketWar autosave + storage-quota manager (client, device-local v1).
// Every autosave write goes through here so usage is tracked against the plan's
// storage allowance: warned at 60%, and at 100% either the oldest entries are
// auto-evicted (LRU) or the user is prompted to buy more. Values never leave the
// device in v1 (localStorage); a cloud-sync tier can raise the quota later.

const NS = "mw_save_v1:";
const QUOTA_KEY = "mw_quota_bytes";
export const DEFAULT_QUOTA = 5 * 1024 * 1024; // 5 MB device allowance (v1)

type Entry<T> = { _ts: number; data: T };

function has(): boolean {
  try { return typeof window !== "undefined" && !!window.localStorage; } catch { return false; }
}
function bytesOf(s: string): number { return s.length * 2; } // UTF-16 approx — stable + cheap

export function quotaBytes(): number {
  if (!has()) return DEFAULT_QUOTA;
  const v = Number(window.localStorage.getItem(QUOTA_KEY));
  return v > DEFAULT_QUOTA ? v : DEFAULT_QUOTA;
}
// "Buy more storage" raises the allowance (called from billing on purchase).
export function setQuotaBytes(n: number) { if (has()) window.localStorage.setItem(QUOTA_KEY, String(Math.max(DEFAULT_QUOTA, Math.round(n)))); }
export function addQuotaMB(mb: number) { setQuotaBytes(quotaBytes() + Math.max(0, mb) * 1024 * 1024); }

type EntryMeta = { key: string; page: string; ts: number; bytes: number };
function entries(): EntryMeta[] {
  if (!has()) return [];
  const out: EntryMeta[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k || !k.startsWith(NS)) continue;
    const raw = window.localStorage.getItem(k) || "";
    let ts = 0;
    try { ts = (JSON.parse(raw) as Entry<unknown>)._ts || 0; } catch { /* legacy/plain */ }
    out.push({ key: k, page: k.slice(NS.length), ts, bytes: bytesOf(k) + bytesOf(raw) });
  }
  return out;
}

export function usageBytes(): number { return entries().reduce((a, e) => a + e.bytes, 0); }
export function usagePct(): number { return Math.min(100, Math.round((usageBytes() / quotaBytes()) * 100)); }
export function level(): "ok" | "warn" | "full" { const p = usagePct(); return p >= 100 ? "full" : p >= 60 ? "warn" : "ok"; }
export function listSaved(): EntryMeta[] { return entries().sort((a, b) => b.ts - a.ts); }

export function evictOldest(count = 1): number {
  const es = entries().sort((a, b) => a.ts - b.ts);
  let n = 0;
  for (const e of es.slice(0, Math.max(0, count))) { try { window.localStorage.removeItem(e.key); n++; } catch { /* noop */ } }
  return n;
}
function evictUntilFits(need: number) {
  let guard = 0;
  while (usageBytes() + need > quotaBytes() && guard < 1000) { if (evictOldest(1) === 0) break; guard++; }
}

export function readSaved<T>(key: string): T | null {
  if (!has()) return null;
  const raw = window.localStorage.getItem(NS + key);
  if (!raw) return null;
  try { const e = JSON.parse(raw) as Entry<T>; return (e && "data" in e) ? e.data : null; } catch { return null; }
}

// Returns whether it saved, and whether the store is full (so the UI can prompt).
export function writeSaved<T>(key: string, data: T, opts?: { autoEvict?: boolean }): { ok: boolean; full: boolean } {
  if (!has()) return { ok: false, full: false };
  const payload = JSON.stringify({ _ts: Date.now(), data } as Entry<T>);
  const need = bytesOf(NS + key) + bytesOf(payload);
  try { window.localStorage.removeItem(NS + key); } catch { /* noop */ } // replacing frees its old bytes
  if (usageBytes() + need > quotaBytes()) {
    if (opts?.autoEvict) evictUntilFits(need);
    if (usageBytes() + need > quotaBytes()) return { ok: false, full: true };
  }
  try { window.localStorage.setItem(NS + key, payload); return { ok: true, full: false }; }
  catch {
    // Browser hard quota (QuotaExceededError) — evict a few and retry once.
    evictOldest(3);
    try { window.localStorage.setItem(NS + key, payload); return { ok: true, full: false }; }
    catch { return { ok: false, full: true }; }
  }
}

export function clearSaved(key: string) { if (has()) { try { window.localStorage.removeItem(NS + key); } catch { /* noop */ } } }
export function clearAllSaved(): number { const es = entries(); es.forEach((e) => { try { window.localStorage.removeItem(e.key); } catch { /* noop */ } }); return es.length; }

// Lightweight change notifier so the storage meter can refresh live.
type Listener = () => void;
const listeners = new Set<Listener>();
export function onStorageChange(fn: Listener): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export function notifyStorageChange() { listeners.forEach((fn) => { try { fn(); } catch { /* noop */ } }); }
