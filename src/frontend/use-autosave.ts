"use client";

// Reusable autosave + version history for any form or generated output.
// - useAutosave(key, initial): persists state to localStorage and restores it on
//   mount, so navigating back / refreshing never loses work.
// - pushVersion/listVersions/restoreVersion: keep the last N snapshots of a
//   generated output (offer, plan, copy…) so a "regenerate" never destroys the
//   previous version — the user can always find and restore an earlier one.
//
// Everything is keyed and stored client-side (per browser). Callers namespace
// keys by brand + surface (e.g. `veryx:growth-plan`) so brands don't collide.

import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "mw.autosave.";
const VPREFIX = "mw.versions.";
const MAX_VERSIONS = 12;

function read<T>(k: string): T | null {
  try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function write(k: string, v: unknown): void {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota / private mode */ }
}

// --- Autosave a piece of form state -----------------------------------------
export function useAutosave<T>(key: string, initial: T): {
  value: T; setValue: (v: T | ((p: T) => T)) => void; restored: boolean; clear: () => void;
} {
  const storeKey = PREFIX + key;
  const [value, setValueRaw] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  const hydrated = useRef(false);

  // Hydrate once on mount (client only).
  useEffect(() => {
    const saved = read<T>(storeKey);
    if (saved !== null && saved !== undefined) {
      setValueRaw(saved);
      // Only flag "restored" when the saved draft has meaningful content.
      const meaningful = typeof saved === "object" ? Object.values(saved as Record<string, unknown>).some(Boolean) : Boolean(saved);
      if (meaningful) setRestored(true);
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);

  // Persist on every change (after hydration, so we don't clobber the draft).
  useEffect(() => {
    if (hydrated.current) write(storeKey, value);
  }, [storeKey, value]);

  const setValue = useCallback((v: T | ((p: T) => T)) => setValueRaw(v), []);
  const clear = useCallback(() => { try { localStorage.removeItem(storeKey); } catch { /* noop */ } setRestored(false); }, [storeKey]);

  return { value, setValue, restored, clear };
}

// --- Version history for generated outputs ----------------------------------
export type Version<T> = { id: string; label: string; at: string; data: T };

export function pushVersion<T>(key: string, label: string, data: T, atISO: string): void {
  const k = VPREFIX + key;
  const list = read<Version<T>[]>(k) ?? [];
  const id = `${atISO}-${list.length}`;
  const next = [{ id, label, at: atISO, data }, ...list].slice(0, MAX_VERSIONS);
  write(k, next);
}

export function listVersions<T>(key: string): Version<T>[] {
  return read<Version<T>[]>(VPREFIX + key) ?? [];
}

export function clearVersions(key: string): void {
  try { localStorage.removeItem(VPREFIX + key); } catch { /* noop */ }
}
