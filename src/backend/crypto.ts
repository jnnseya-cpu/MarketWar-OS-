// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// End-to-end encryption layer (backend side).
//
// In transit: TLS 1.3 terminates at the edge; the security headers in
// next.config.mjs enforce HSTS so browsers never downgrade.
// At rest: AES-256-GCM application-layer field encryption with a key
// DERIVED PER BUSINESS (HKDF-SHA256 over FIELD_ENCRYPTION_MASTER_KEY),
// implementing the inter-tenant isolation rule of docs/ai-os/08 §B.4a —
// one tenant's key never decrypts another tenant's data.
//
// THE JUSTIFICATION THAT STOPPED BEING TRUE.
//
// This said: "without FIELD_ENCRYPTION_MASTER_KEY the helpers are pass-through
// no-ops, which is safe because without Firebase keys the persistence layer
// writes nothing at all (demo mode)." That holds only while the two variables
// move together. They do not. Production REQUIRES Firebase Admin (the ISO2
// fail-closed guard in brand-access.ts), so persistence is live and writing real
// contact emails and phone numbers — and if the master key is absent they were
// written in plaintext, while the Terms of Service tell the customer
// "Field-level encryption is applied per business."
//
// A contract clause that is conditional on an environment variable, asserted as
// a fact, is a misrepresentation; storing personal data unencrypted after
// promising otherwise is also a UK GDPR Article 32 problem. So this now fails
// CLOSED, exactly as ISO2 does for the other half: if real persistence is
// configured and the key is not, writing PII throws rather than quietly
// downgrading the protection the customer was promised.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

const MASTER_KEY = process.env.FIELD_ENCRYPTION_MASTER_KEY || "";
const VERSION = "e2e1"; // ciphertext format version prefix

export const encryptionConfigured = MASTER_KEY.length >= 32;

// PII field names encrypted before any persistence write. Matches the
// application-layer contract in docs/ai-os/08 §B.4a (contact phone/email
// plus the obvious neighbours agents receive in their inputs).
const PII_FIELDS = new Set([
  "email",
  "phone",
  "whatsapp",
  "contact",
  "customerEmail",
  "customerPhone",
  "customerName",
]);

function businessKey(businessId: string): Buffer {
  // HKDF gives each business its own 256-bit key from the master secret;
  // rotating the master key re-derives every tenant key in one operation.
  return Buffer.from(hkdfSync("sha256", MASTER_KEY, "marketwar-os", `field-key:${businessId}`, 32));
}

/**
 * Would a PII write silently lose its encryption?
 *
 * True only in the dangerous combination: real persistence configured, no key.
 * Demo mode (no Admin, nothing persisted) is unaffected, so the zero-config
 * promise still holds.
 */
export function encryptionMisconfigured(persistenceLive: boolean): boolean {
  return persistenceLive && !encryptionConfigured;
}

export class EncryptionNotConfiguredError extends Error {
  constructor() {
    super(
      "Refusing to store personal data unencrypted. Firebase Admin is configured, so this write is real, but FIELD_ENCRYPTION_MASTER_KEY is not set — the contact details would be written in plaintext while the Terms of Service promise per-business field encryption. Set FIELD_ENCRYPTION_MASTER_KEY (32+ characters) before storing customer data.",
    );
    this.name = "EncryptionNotConfiguredError";
  }
}

export function encryptField(plaintext: string, businessId: string): string {
  if (!encryptionConfigured) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", businessKey(businessId), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptField(value: string, businessId: string): string {
  if (!encryptionConfigured || !value.startsWith(`${VERSION}:`)) return value;
  const [, ivB64, tagB64, dataB64] = value.split(":");
  const decipher = createDecipheriv("aes-256-gcm", businessKey(businessId), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

// Encrypts every known-PII field in a flat record before persistence.
// Non-PII fields pass through untouched so analytics stay useful.
export function encryptPii(
  record: Record<string, string>,
  businessId: string,
  /** True when this write actually persists. Callers pass adminConfigured. */
  persistenceLive = false,
): Record<string, string> {
  // Fail CLOSED. Returning the record unencrypted here is the exact moment the
  // customer's contact details would go to disk in the clear under a contract
  // that says they are encrypted.
  if (encryptionMisconfigured(persistenceLive)) throw new EncryptionNotConfiguredError();
  if (!encryptionConfigured) return record;
  return Object.fromEntries(
    Object.entries(record).map(([k, v]) => [k, PII_FIELDS.has(k) ? encryptField(v, businessId) : v])
  );
}