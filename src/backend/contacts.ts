// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Per-brand contact store — the real Customer Vault data behind CSV/CRM import.
// Contacts persist to Firestore (collection "contacts", doc id = brandId::email
// so re-importing the same email MERGES instead of duplicating) with an in-memory
// fallback for zero-config. Maps into the segmentation engine's CustomerRecord so
// imported contacts get scored (LTV / churn / intent / segment) exactly like the
// demo set — but real. Consent is preserved so only consented contacts are
// marketing-eligible downstream.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import type { CustomerRecord } from "@/backend/segments";

export type Contact = {
  id: string;              // stable id (email-derived when present)
  brandId: string;
  email?: string;
  name?: string;
  phone?: string;
  company?: string;
  totalSpendGbp?: number;
  orderCount?: number;
  lastOrderDaysAgo?: number;
  consent?: boolean;       // marketing consent — governs send-eligibility
  source?: string;         // "csv-import", "crm", …
  importedAt?: string;
  // Prospect-list fields (B2B lists: Company / Trade / Town / Area / Score /
  // Status). A row with only a company is a valid prospect.
  trade?: string;
  town?: string;
  area?: string;
  status?: string;         // e.g. "new" | "contacted" | "contactable"
  score?: number;
};

const mem = new Map<string, Map<string, Contact>>(); // brandId → (contactId → Contact)

const lc = (s: string) => s.trim().toLowerCase();
// SHA-256 (128-bit) — 32-bit FNV collided at ~65k entities, silently MERGING two
// different customers onto one doc (data loss). A vault can hold far more, so use
// the same wide hash the money engine uses.
const hid = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 32);

// Deterministic id: same email/phone/name (per brand) → same id → merge on
// re-import. Identifier-less rows are dropped upstream, so name is a stable key.
export function contactId(brandId: string, c: { email?: string; name?: string; phone?: string; company?: string }): string {
  const key = c.email ? lc(c.email)
    : c.phone ? c.phone.replace(/\D/g, "")
    : c.name ? "name:" + lc(c.name.trim())
    : "company:" + lc((c.company || "").trim());
  return `${brandId}::${hid(key)}`;
}

const docId = (id: string) => id.replace(/\//g, "_");

// Normalise + dedupe a batch, then persist. Returns how many landed.
export async function saveContacts(brandId: string, rows: Partial<Contact>[], nowISO: string): Promise<{ imported: number; total: number }> {
  const byId = new Map<string, Contact>();
  for (const r of rows) {
    const email = r.email ? lc(String(r.email)) : undefined;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue; // drop malformed emails
    // Need at least one identifier — email, phone, name OR company (prospect lists).
    if (!email && !r.phone && !r.name && !r.company) continue;
    const id = contactId(brandId, { email, name: r.name, phone: r.phone, company: r.company });
    const scoreNum = typeof r.score === "number" ? r.score : Number(r.score) || undefined;
    const c: Contact = {
      id, brandId, email, name: r.name?.trim() || undefined, phone: r.phone?.trim() || undefined,
      company: r.company?.trim() || undefined,
      totalSpendGbp: num(r.totalSpendGbp), orderCount: num(r.orderCount), lastOrderDaysAgo: num(r.lastOrderDaysAgo),
      consent: typeof r.consent === "boolean" ? r.consent : undefined,
      trade: r.trade?.toString().trim() || undefined,
      town: r.town?.toString().trim() || undefined,
      area: r.area?.toString().trim() || undefined,
      status: r.status?.toString().trim().toLowerCase() || undefined,
      score: scoreNum,
      source: r.source || "csv-import", importedAt: nowISO,
    };
    byId.set(id, { ...byId.get(id), ...c });
  }
  const list = [...byId.values()];

  if (adminConfigured && adminDb) {
    const col = adminDb.collection("contacts");
    // Batched writes (Firestore cap 500/batch).
    for (let i = 0; i < list.length; i += 450) {
      const batch = adminDb.batch();
      for (const c of list.slice(i, i + 450)) batch.set(col.doc(docId(c.id)), c, { merge: true });
      await batch.commit();
    }
  } else {
    const m = mem.get(brandId) ?? new Map<string, Contact>();
    for (const c of list) m.set(c.id, { ...m.get(c.id), ...c });
    mem.set(brandId, m);
  }
  return { imported: list.length, total: await countContacts(brandId) };
}

export async function listContacts(brandId: string, limit = 5000): Promise<Contact[]> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("contacts").where("brandId", "==", brandId).limit(limit).get();
    return snap.docs.map((d) => d.data() as Contact);
  }
  return [...(mem.get(brandId)?.values() ?? [])].slice(0, limit);
}

export async function countContacts(brandId: string): Promise<number> {
  return (await listContacts(brandId)).length;
}

// Real vault counts for Autopilot: total, marketing-consented, and dormant/
// re-engageable (cold leads with no order history, or lapsed customers ≥ 45 days).
export async function vaultCountsFor(brandId: string): Promise<{ total: number; consented: number; dormant: number }> {
  const contacts = await listContacts(brandId);
  const consented = contacts.filter((c) => c.consent !== false);
  const dormant = consented.filter((c) => c.lastOrderDaysAgo == null || (c.lastOrderDaysAgo ?? 0) >= 45);
  return { total: contacts.length, consented: consented.length, dormant: dormant.length };
}

export async function clearContacts(brandId: string): Promise<void> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("contacts").where("brandId", "==", brandId).limit(5000).get();
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = adminDb.batch();
      for (const d of snap.docs.slice(i, i + 450)) batch.delete(d.ref);
      await batch.commit();
    }
  } else {
    mem.delete(brandId);
  }
}

// Map stored contacts into the segmentation engine's CustomerRecord for scoring.
export function toCustomerRecords(contacts: Contact[]): CustomerRecord[] {
  return contacts.map((c) => ({
    id: c.id,
    name: c.name || c.email || "Contact",
    totalSpendGbp: c.totalSpendGbp,
    orderCount: c.orderCount,
    lastOrderDaysAgo: c.lastOrderDaysAgo,
    avgOrderValueGbp: c.totalSpendGbp && c.orderCount ? c.totalSpendGbp / Math.max(1, c.orderCount) : undefined,
    emailEngaged: c.consent, // consented as a light engagement proxy until opens land
    consent: c.consent,
  }));
}

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
