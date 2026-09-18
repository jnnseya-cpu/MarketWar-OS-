// Which API routes can cause the platform to spend money with a provider?
//
// The owner's rule is absolute: every AI action is metered and gated by the
// customer's ACU balance, and there is no free AI action. Enforcing that by
// reading code is hopeless — 147 routes, and the spend is usually three or four
// modules down. So this builds the call graph and answers the question
// mechanically.
//
// WHY IT IS SYMBOL-LEVEL AND NOT FILE-LEVEL. The first version of this followed
// imports by module and produced nonsense: /api/gateway imports gatewayStatus
// from a file that also exports gatewayComplete, and was reported as a spender
// though it only reads configuration. A file-level graph flags a dozen routes
// that spend nothing, and a check nobody believes is a check nobody keeps. This
// resolves the individual FUNCTION a route imports and follows only what that
// function actually calls.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");

/** Calls that hand money to a provider. */
export const SPEND_CALLS = [
  "gatewayComplete",   // any LLM completion
  "generateImage",     // image provider
  "synthesizeSpeech",  // voice provider
  "transcribeAudio",   // speech-to-text provider
  "dubVideo",
  "webSearch",         // paid search API
  "enrichBatch",       // search + fetch per row
];

/** The wallet gate. Any of these means the caller charged for the work. */
export const METER_CALLS = ["meterAction", "debitAcus", "meterOrRefuse", "meteredRun"];

const srcCache = new Map();
const read = (f) => {
  if (!srcCache.has(f)) srcCache.set(f, readFileSync(f, "utf8"));
  return srcCache.get(f);
};

export function apiRoutes() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = `${dir}/${e}`;
      if (statSync(p).isDirectory()) walk(p);
      else if (e === "route.ts") out.push(p);
    }
  };
  walk(`${ROOT}/src/app/api`);
  return out.sort();
}

const resolveModule = (spec, fromFile) => {
  let base;
  if (spec.startsWith("@/")) base = `${ROOT}/src/${spec.slice(2)}`;
  else if (spec.startsWith(".")) {
    const dir = fromFile.replace(/\/[^/]+$/, "");
    base = new URL(spec, `file://${dir}/`).pathname;
  } else return null;   // node_modules — not ours to audit
  for (const c of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) if (existsSync(c)) return c;
  return null;
};

/** `import { a, b as c } from "x"` → [{ local, imported, module }] */
function importsOf(file) {
  const src = read(file);
  const out = [];
  for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
    if (m[1]) continue;                       // a type import cannot call anything
    const mod = resolveModule(m[3], file);
    if (!mod) continue;
    for (const part of m[2].split(",")) {
      const [imported, local] = part.split(/\s+as\s+/).map((s) => s.trim());
      if (!imported || imported === "type") continue;
      out.push({ local: (local || imported).replace(/^type\s+/, ""), imported: imported.replace(/^type\s+/, ""), module: mod });
    }
  }
  // Dynamic imports pull a whole module in; treat every export as reachable.
  for (const m of src.matchAll(/await\s+import\("([^"]+)"\)/g)) {
    const mod = resolveModule(m[1], file);
    if (mod) out.push({ local: "*", imported: "*", module: mod });
  }
  return out;
}

/**
 * Top-level named definitions and their bodies.
 *
 * Sliced from one definition to the next rather than brace-matched. Brace
 * matching looked tidier and was wrong: `export async function f(input: { … })`
 * opens its first brace inside the PARAMETER TYPE, so the body closed before it
 * began and every function in the codebase read as calling nothing. Slicing
 * over-approximates — an unexported helper sitting between two exports is
 * attributed to the one above it — and over-approximation here means flagging a
 * route that does not spend, which is the safe direction for a check whose job
 * is to catch spending nobody charged for.
 */
function definitions(file) {
  const src = read(file);
  const starts = [];
  const re = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_$]+)/gm;
  for (const m of src.matchAll(re)) starts.push({ name: m[1], at: m.index ?? 0 });
  const defs = new Map();
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
    defs.set(starts[i].name, src.slice(starts[i].at, end));
  }
  return defs;
}

const calls = (body) => new Set([...body.matchAll(/\b([A-Za-z0-9_$]+)\s*\(/g)].map((m) => m[1]));

/**
 * Does `name` in `file` reach one of `targets`?
 *
 * `name === "*"` asks the question of the whole module, which is what a dynamic
 * import means.
 */
export function reaches(file, name, targets, seen = new Set()) {
  const key = `${file}::${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  if (!existsSync(file)) return null;

  const defs = definitions(file);
  const bodies = name === "*" ? [...defs.values()] : [defs.get(name) ?? ""];
  // A route file's handlers are its entry points; module top-level code counts
  // too, since an import runs it.
  if (name === "*" || !defs.has(name)) bodies.push(read(file));

  const imports = importsOf(file);
  for (const body of bodies) {
    if (!body) continue;
    const called = calls(body);
    for (const t of targets) if (called.has(t)) return `${file.replace(ROOT + "/", "")}:${t}`;
    // Local helpers.
    for (const [local, localBody] of defs) {
      if (local === name || !called.has(local)) continue;
      const hit = reaches(file, local, targets, seen);
      if (hit) return hit;
    }
    // Imported names it actually calls.
    for (const imp of imports) {
      if (imp.local !== "*" && !called.has(imp.local)) continue;
      const hit = reaches(imp.module, imp.imported, targets, seen);
      if (hit) return hit;
    }
  }
  return null;
}

/** Route entry points: the HTTP verbs Next.js will call. */
const VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function auditRoutes() {
  const rows = [];
  for (const file of apiRoutes()) {
    const rel = file.replace(`${ROOT}/`, "");
    let spendsVia = null;
    let metersVia = null;
    for (const verb of VERBS) {
      spendsVia = spendsVia || reaches(file, verb, SPEND_CALLS, new Set());
      metersVia = metersVia || reaches(file, verb, METER_CALLS, new Set());
    }
    if (spendsVia) rows.push({ route: rel, spendsVia, metersVia });
  }
  return rows;
}
