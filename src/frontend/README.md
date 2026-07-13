# Frontend layer (`src/frontend/` + `src/components/`)

Browser-side infrastructure (`firebase-client.ts` — env-guarded client SDK)
and the UI component kit in `src/components/`. Pages in `src/app/**` compose
these.

Rules:
- May import from `@/shared/*`. Must NEVER import from `@/backend/*` —
  the backend is reached exclusively through `/api/*` routes.
- Never handle provider keys or secrets here; `NEXT_PUBLIC_*` config only.
