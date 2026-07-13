# Shared layer (`src/shared/`)

Code both sides may import: domain types, the validated chart palette, the
agent definitions (prompts + demo intelligence) and the demo dataset.

Rules:
- Must NOT import from `@/backend/*` or `@/frontend/*` — no Node APIs, no
  browser APIs, no secrets. Pure data and types only.
