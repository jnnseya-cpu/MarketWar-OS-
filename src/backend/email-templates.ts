// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Reusable email templates (the Brevo-style template editor behind the ESP).
//
// A template is per-brand: { name, subject, html } with {{ variable }} merge
// tokens. At send time each recipient's row is merged in so every contact gets a
// personalised subject + body (first name, company, town…). Persisted to
// Firestore (collection "email_templates") with an in-memory fallback for zero-
// config. Ownership is enforced by the API route, not here.

import { createHash } from "crypto";
import { adminDb, adminConfigured } from "@/backend/firebase-admin";
import type { Contact } from "@/backend/contacts";

export type EmailTemplate = {
  id: string;
  brandId: string;
  name: string;
  subject: string;
  html: string;
  updatedAt: string;
};

const mem = new Map<string, EmailTemplate>(); // key: id

const hid = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 20);
export function templateId(brandId: string, name: string): string {
  return `${brandId}::${hid(name.trim().toLowerCase())}`;
}
const docId = (id: string) => id.replace(/\//g, "_");

// The merge tokens a template can use, and where each is sourced from a Contact
// (+ the brand name). Kept small and obvious so the editor can list them.
export const MERGE_VARS: { token: string; label: string }[] = [
  { token: "firstName", label: "First name" },
  { token: "name", label: "Full name" },
  { token: "email", label: "Email" },
  { token: "company", label: "Company" },
  { token: "trade", label: "Trade / sector" },
  { token: "town", label: "Town / city" },
  { token: "area", label: "Area / region" },
  { token: "brand", label: "Your brand name" },
];

// Merge {{ token }} (optional `{{ token | fallback }}`) against a contact + brand.
// Unknown tokens resolve to their fallback or empty string — never left raw.
export function mergeTemplate(text: string, ctx: { contact?: Partial<Contact>; brand?: string }): string {
  const c = ctx.contact || {};
  const firstName = (c.name || "").trim().split(/\s+/)[0] || "";
  const values: Record<string, string> = {
    firstname: firstName,
    name: (c.name || "").trim(),
    email: (c.email || "").trim(),
    company: (c.company || "").trim(),
    trade: (c.trade || "").trim(),
    town: (c.town || "").trim(),
    area: (c.area || "").trim(),
    brand: (ctx.brand || "").trim(),
  };
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_m, rawKey: string, fallback?: string) => {
    const v = values[rawKey.toLowerCase()];
    return (v && v.length ? v : (fallback ?? "")).toString();
  });
}

// Which known tokens actually appear in a template (for the editor's chip list).
export function usedVariables(text: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|[^}]*)?\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) found.add(m[1].toLowerCase());
  return [...found];
}

export async function saveTemplate(brandId: string, name: string, subject: string, html: string, nowISO: string): Promise<EmailTemplate> {
  const clean = name.trim();
  if (!clean) throw new Error("Template name is required");
  const id = templateId(brandId, clean);
  const tpl: EmailTemplate = { id, brandId, name: clean, subject: subject ?? "", html: html ?? "", updatedAt: nowISO };
  if (adminConfigured && adminDb) await adminDb.collection("email_templates").doc(docId(id)).set(tpl, { merge: true });
  else mem.set(id, tpl);
  return tpl;
}

export async function getTemplate(brandId: string, id: string): Promise<EmailTemplate | null> {
  let tpl: EmailTemplate | null = null;
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("email_templates").doc(docId(id)).get();
    tpl = snap.exists ? (snap.data() as EmailTemplate) : null;
  } else {
    tpl = mem.get(id) ?? null;
  }
  // Ownership guard: never return another brand's template.
  return tpl && tpl.brandId === brandId ? tpl : null;
}

export async function listTemplates(brandId: string): Promise<EmailTemplate[]> {
  if (adminConfigured && adminDb) {
    const snap = await adminDb.collection("email_templates").where("brandId", "==", brandId).limit(200).get();
    return snap.docs.map((d) => d.data() as EmailTemplate).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return [...mem.values()].filter((t) => t.brandId === brandId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteTemplate(brandId: string, id: string): Promise<void> {
  const existing = await getTemplate(brandId, id);
  if (!existing) return; // not owned / not found → no-op
  if (adminConfigured && adminDb) await adminDb.collection("email_templates").doc(docId(id)).delete();
  else mem.delete(id);
}
