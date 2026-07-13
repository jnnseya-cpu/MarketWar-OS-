# Backend layer (`src/backend/`)

Server-only code: the AI Gateway and provider routing, the deterministic
audit engine, the persistence facade, the Firebase Admin SDK, and the E2E
field-encryption layer. Every module carries a runtime layer guard that
throws if it ever reaches a browser bundle.

Rules:
- May import from `@/shared/*`. Must NEVER import from `@/frontend/*` or
  `@/components/*`.
- Only `src/app/api/**` route handlers (and server components) may import
  from here.
- All AI calls go through `gateway.ts` — never call a provider directly.
- All persistence goes through `db.ts` — which encrypts PII via `crypto.ts`
  before any write.
