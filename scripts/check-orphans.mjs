// npm run check:orphans
//
// WHICH FILES IS NOTHING IMPORTING?
//
// WHY THIS IS A GATE AND NOT A ONE-OFF SCRIPT. §144 removed eight fabricated
// fixtures that NOTHING imported — invented customers with names, phones and
// emails, sitting in the tree looking like data. They accumulated because
// nothing could answer the question "is this file reachable?", so every audit
// had to answer it by hand and none ever did it twice.
//
// An unreachable module is not neutral. It is read as a capability during the
// next audit, it is maintained by the next refactor, it shows up in a grep and
// sends somebody down a path that leads nowhere, and when it contains data it
// gets mistaken for real data. "Unreachable code is no capability" is already
// this repository's rule; this is the instrument that enforces it.
//
// HOW IT RESOLVES, and the limits are stated because a dead-code detector that
// over-reports gets deleted and one that under-reports is decoration:
//
//   • Every static `import`/`export … from` and every `import()` is read out of
//     src/, tests/ and scripts/, including the `@/` alias from tsconfig.
//   • A file reached from ANY of those is live, so a module used only by a test
//     or a driver counts as used. That is deliberate: a test is a consumer.
//   • ENTRY POINTS are never orphans, because the framework imports them rather
//     than the code doing it: app/**/{page,layout,route,error,not-found,...},
//     middleware, instrumentation, the config files, and the type shims.
//
// WHAT IT CANNOT SEE, so a finding is a question rather than a verdict: a module
// referenced only by a string (a dynamic path built at runtime), or only from a
// file type this does not parse. Every removal still needs a human to check the
// name, which is why this prints and does not delete.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, extname } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const SRC = join(ROOT, "src");

const CODE = new Set([".ts", ".tsx", ".mjs", ".js", ".jsx"]);

/** Files the FRAMEWORK imports, so nothing in the repo has to. */
const ENTRY_PATTERNS = [
  // Next's App Router file conventions.
  /^src\/app\/.*\/(page|layout|template|route|error|loading|not-found|global-error|default)\.tsx?$/,
  /^src\/app\/(page|layout|error|loading|not-found|global-error|robots|sitemap|manifest)\.tsx?$/,
  /^src\/app\/.*\/(robots|sitemap|manifest|icon|apple-icon|opengraph-image|twitter-image)\.tsx?$/,
  /^src\/middleware\.ts$/,
  /^src\/instrumentation\.ts$/,
  // Type shims and ambient declarations are compiled, never imported.
  /\.d\.ts$/,
];

const isEntry = (rel) => ENTRY_PATTERNS.some((re) => re.test(rel));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (CODE.has(extname(name))) out.push(full);
  }
  return out;
}

// Every file that could import something: the app itself, its tests and its
// drivers. A module a DRIVER uses is in use.
const scanRoots = [SRC, join(ROOT, "tests"), join(ROOT, "scripts")].filter(existsSync);
const allFiles = scanRoots.flatMap((d) => walk(d));

const IMPORT_RE = [
  /\bimport\s+[^"';]*?from\s*["']([^"']+)["']/g,   // import x from "y"
  /\bimport\s*["']([^"']+)["']/g,                   // import "y"
  /\bexport\s+[^"';]*?from\s*["']([^"']+)["']/g,    // export … from "y"
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,         // await import("y")
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,        // require("y")
];

/** Turn a specifier into a file on disk, or null when it is a package. */
function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = resolve(dirname(fromFile), spec);
  else if (spec.startsWith("/")) base = join(ROOT, spec.slice(1));
  else return null; // a bare package name
  const tries = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, `${base}.jsx`,
    join(base, "index.ts"), join(base, "index.tsx"), join(base, "index.mjs"), join(base, "index.js"),
  ];
  for (const t of tries) {
    try { if (statSync(t).isFile()) return t; } catch { /* keep trying */ }
  }
  return null;
}

const imported = new Set();
const unresolved = [];
for (const file of allFiles) {
  const text = readFileSync(file, "utf8");
  for (const re of IMPORT_RE) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const spec = m[1];
      const hit = resolveSpec(spec, file);
      if (hit) imported.add(hit);
      else if (spec.startsWith("@/") || spec.startsWith("./") || spec.startsWith("../")) {
        // A RELATIVE IMPORT THAT RESOLVES TO NOTHING IS A BROKEN IMPORT — which
        // is worth more than the orphan report: it means a file was deleted or
        // renamed and a reference was left pointing at the gap.
        unresolved.push({ from: relative(ROOT, file), spec });
      }
    }
  }
}

const orphans = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (isEntry(rel)) continue;
  if (imported.has(file)) continue;
  orphans.push({ rel, bytes: statSync(file).size });
}
orphans.sort((a, b) => b.bytes - a.bytes);

const say = (m) => process.stdout.write(m + "\n");

if (unresolved.length) {
  say(`BROKEN IMPORTS: ${unresolved.length} — a reference that resolves to no file.`);
  for (const u of unresolved.slice(0, 40)) say(`  ${u.from} → ${u.spec}`);
  if (unresolved.length > 40) say(`  … and ${unresolved.length - 40} more`);
  say("");
}

if (orphans.length) {
  const total = orphans.reduce((s, o) => s + o.bytes, 0);
  say(`ORPHANS: ${orphans.length} file(s) in src/ that nothing imports — ${(total / 1024).toFixed(0)} KB.`);
  say("Each is a QUESTION, not a verdict: check the name before removing it, because");
  say("a module reached only through a runtime-built string is invisible here.");
  say("");
  for (const o of orphans) say(`  ${String(Math.round(o.bytes / 1024)).padStart(4)} KB  ${o.rel}`);
} else {
  say(`check:orphans passed — every file in src/ is reachable from the app, a test or a driver (${allFiles.length} files scanned).`);
}

// A BROKEN IMPORT FAILS; AN ORPHAN REPORTS. The first is a defect with no
// defensible reading — the reference cannot work. The second needs a human to
// confirm, and a gate that fails the build on a judgement call is a gate that
// gets switched off.
process.exit(unresolved.length ? 1 : 0);
