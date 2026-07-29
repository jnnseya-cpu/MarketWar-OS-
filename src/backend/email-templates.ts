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
import { mergeTokens, usedTokens } from "@/shared/merge-tokens";

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

// Merge tokens and the merge itself come from shared/merge-tokens so the browser
// preview and this send path can never disagree about what a template renders.
export { MERGE_VARS } from "@/shared/merge-tokens";

// Merge a template against a contact + brand.
export function mergeTemplate(text: string, ctx: { contact?: Partial<Contact>; brand?: string }): string {
  return mergeTokens(text, contactValues(ctx));
}

/** A contact row flattened into the token value map. */
export function contactValues(ctx: { contact?: Partial<Contact>; brand?: string }): Record<string, string> {
  const c = ctx.contact || {};
  const firstName = (c.name || "").trim().split(/\s+/)[0] || "";
  return {
    firstname: firstName,
    name: (c.name || "").trim(),
    email: (c.email || "").trim(),
    company: (c.company || "").trim(),
    trade: (c.trade || "").trim(),
    town: (c.town || "").trim(),
    area: (c.area || "").trim(),
    brand: (ctx.brand || "").trim(),
  };
}

export function usedVariables(text: string): string[] {
  return usedTokens(text).map((t) => t.toLowerCase());
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
