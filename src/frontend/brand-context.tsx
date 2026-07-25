"use client";

// Active-brand context — the shared "current brand" every dashboard surface
// reads. Selecting a brand fills module forms + agent calls from that brand, so
// the whole OS re-skins per brand. Persisted to localStorage so it survives
// refresh with zero config; when Firebase is wired the same shape syncs to
// Firestore (businesses.ownerId) without changing consumers.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type Brand, SEED_BRANDS, newBrand } from "@/shared/brand";
import { authedFetch } from "@/frontend/api-client";
import { firebaseAuth } from "@/frontend/firebase-client";

// Best-effort write-through to the durable server store (signed-in users only).
// Never blocks the UI; localStorage remains the instant cache + offline fallback.
function pushBrandRemote(brand: Brand) {
  try {
    if (!firebaseAuth?.currentUser) return;
    void authedFetch("/api/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand }) }).catch(() => {});
  } catch { /* ignore */ }
}
function deleteBrandRemote(id: string) {
  try {
    if (!firebaseAuth?.currentUser) return;
    void authedFetch(`/api/brands?brandId=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  } catch { /* ignore */ }
}

type BrandContextValue = {
  brands: Brand[];
  activeBrand: Brand | null;
  activeId: string | null;
  setActive: (id: string) => void;
  addBrand: (input: Partial<Brand> & { name: string }) => Brand;
  updateBrand: (id: string, patch: Partial<Brand>) => void;
  removeBrand: (id: string) => void;
  ready: boolean;
};

// v2: clean-slate release — ignores any previously stored demo brands so a real
// company starts empty.
const STORAGE_KEY = "mw.brands.v2";
const ACTIVE_KEY = "mw.activeBrand.v2";

// Safe fallback so useActiveBrand() never throws outside a provider.
const fallback: BrandContextValue = {
  brands: SEED_BRANDS,
  activeBrand: SEED_BRANDS[0] ?? null,
  activeId: SEED_BRANDS[0]?.id ?? null,
  setActive: () => {},
  addBrand: (i) => newBrand(i),
  updateBrand: () => {},
  removeBrand: () => {},
  ready: false,
};

const BrandContext = createContext<BrandContextValue>(fallback);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>(SEED_BRANDS);
  const [activeId, setActiveId] = useState<string | null>(SEED_BRANDS[0]?.id ?? null);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const rawBrands = localStorage.getItem(STORAGE_KEY);
      const rawActive = localStorage.getItem(ACTIVE_KEY);
      if (rawBrands) {
        const parsed = JSON.parse(rawBrands) as Brand[];
        if (Array.isArray(parsed) && parsed.length) setBrands(parsed);
      }
      if (rawActive) setActiveId(rawActive);
    } catch {
      /* corrupt storage → keep seeds */
    }
    setReady(true);
  }, []);

  // Persist to localStorage (instant cache).
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(brands)); } catch { /* quota */ }
  }, [brands, ready]);

  // DURABLE SYNC: when the user is signed in, reconcile with the server store so
  // brands survive across sessions/devices (fixes the "wiped every morning" bug).
  // Server is source of truth; any local-only brands are migrated UP (so the
  // brand you already set up in this browser is saved to your account, once).
  useEffect(() => {
    if (!ready || !firebaseAuth) return;
    const unsub = firebaseAuth.onAuthStateChanged(async (user) => {
      if (!user) return;
      let server: Brand[] = [];
      try {
        const res = await authedFetch("/api/brands");
        const d = await res.json().catch(() => ({}));
        server = Array.isArray(d.brands) ? (d.brands as Brand[]) : [];
      } catch { return; /* offline → keep local */ }
      let local: Brand[] = [];
      try { const raw = localStorage.getItem(STORAGE_KEY); local = raw ? (JSON.parse(raw) as Brand[]) : []; } catch { local = []; }
      const serverIds = new Set(server.map((b) => b.id));
      const localOnly = local.filter((b) => b && b.id && !serverIds.has(b.id));
      localOnly.forEach(pushBrandRemote); // migrate this browser's brands into the account
      const merged = server.length || localOnly.length ? [...server, ...localOnly] : local;
      if (merged.length) {
        setBrands(merged);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { /* quota */ }
      }
    });
    return () => { try { unsub(); } catch { /* ignore */ } };
  }, [ready]);
  useEffect(() => {
    if (!ready || !activeId) return;
    try { localStorage.setItem(ACTIVE_KEY, activeId); } catch { /* quota */ }
  }, [activeId, ready]);

  const value = useMemo<BrandContextValue>(() => {
    const activeBrand = brands.find((b) => b.id === activeId) ?? brands[0] ?? null;
    return {
      brands,
      activeBrand,
      activeId: activeBrand?.id ?? null,
      ready,
      setActive: (id) => setActiveId(id),
      addBrand: (input) => {
        let brand = newBrand(input);
        setBrands((prev) => {
          // Resolve id collisions deterministically.
          let id = brand.id, n = 2;
          while (prev.some((b) => b.id === id)) id = `${brand.id}-${n++}`;
          brand = { ...brand, id };
          return [...prev, brand];
        });
        setActiveId(brand.id);
        pushBrandRemote(brand); // persist to the account immediately
        return brand;
      },
      updateBrand: (id, patch) => setBrands((prev) => {
        const next = prev.map((b) => (b.id === id ? { ...b, ...patch } : b));
        const updated = next.find((b) => b.id === id);
        if (updated) pushBrandRemote(updated); // persist edits (logo, colours, etc.)
        return next;
      }),
      removeBrand: (id) => {
        deleteBrandRemote(id);
        setBrands((prev) => {
          const next = prev.filter((b) => b.id !== id);
          if (id === activeId) setActiveId(next[0]?.id ?? null);
          return next.length ? next : SEED_BRANDS;
        });
      },
    };
  }, [brands, activeId, ready]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useActiveBrand(): BrandContextValue {
  return useContext(BrandContext);
}
