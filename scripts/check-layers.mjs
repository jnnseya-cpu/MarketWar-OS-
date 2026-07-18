// Static layer-rule checker — enforces the backend/frontend/shared
// separation at build time (complements the runtime guards in
// src/backend/*). Rules (see the layer READMEs):
//   1. Frontend (src/components, src/frontend) and shared (src/shared)
//      must never import @/backend/*.
//   2. Shared must never import @/frontend/* or @/components/*.
//   3. Only src/app/api/** and server files may import @/backend/*
//      (client pages reach the backend through /api/* routes only).
// Runs as part of `npm run verify`. Exits non-zero on any violation.

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const violations = [];

function walk(dir, fn) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, fn);
    else if (/\.(ts|tsx)$/.test(name)) fn(p, readFileSync(p, "utf8"));
  }
}

// Rule 1 + 2: frontend and shared never reach backward.
for (const dir of ["src/components", "src/frontend"]) {
  walk(dir, (file, src) => {
    if (/from\s+["']@\/backend\//.test(src)) violations.push(`${file}: frontend layer imports @/backend/*`);
  });
}
walk("src/shared", (file, src) => {
  if (/from\s+["']@\/(backend|frontend|components)\//.test(src)) {
    violations.push(`${file}: shared layer imports a sided module`);
  }
});

// Rule 3: client components ("use client") never import @/backend directly.
walk("src/app", (file, src) => {
  if (/^\s*["']use client["']/m.test(src) && /from\s+["']@\/backend\//.test(src)) {
    violations.push(`${file}: client component imports @/backend/* (use /api/* instead)`);
  }
});

if (violations.length) {
  console.error(`Layer check FAILED — ${violations.length} violation(s):`);
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log("Layer check passed — backend/frontend/shared separation holds.");
