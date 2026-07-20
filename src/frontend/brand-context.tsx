"use client";

// Active-brand context — the shared "current brand" every dashboard surface
// reads. Selecting a brand fills module forms + agent calls from that brand, so
// the whole OS re-skins per brand. Persisted to localStorage so it survives
// refresh with zero config; when Firebase is wired the same shape syncs to
// Firestore (businesses.ownerId) without changing consumers.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type Brand, SEED_BRANDS, newBrand } from "@/shared/brand";

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

  // Persist.
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(brands)); } catch { /* quota */ }
  }, [brands, ready]);
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
        return brand;
      },
      updateBrand: (id, patch) => setBrands((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b))),
      removeBrand: (id) =>
        setBrands((prev) => {
          const next = prev.filter((b) => b.id !== id);
          if (id === activeId) setActiveId(next[0]?.id ?? null);
          return next.length ? next : SEED_BRANDS;
        }),
    };
  }, [brands, activeId, ready]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useActiveBrand(): BrandContextValue {
  return useContext(BrandContext);
}
