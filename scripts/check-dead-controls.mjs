// npm run check:controls
//
// DOES THE BUTTON DO ANYTHING?
//
// WHY THIS EXISTS. The launch brief's own words: do not assume that because a
// button, page, API or component exists, it actually works — and hunt
// specifically for buttons with no handler, forms that post nowhere, and success
// messages with no backend write. That hunt had to be done by hand, across 88
// components and 97 pages, which means it was done once and never again.
//
// THE FOUR PATTERNS IT LOOKS FOR, and each is a different kind of lie:
//
//   1. A <button> with no onClick, no type="submit" and no form association.
//      It looks pressable and is not.
//   2. An explicitly empty handler — onClick={() => {}} — which is worse,
//      because somebody wrote the wiring and left it hollow.
//   3. A <form> with neither onSubmit nor action: the fields take input and the
//      submit goes nowhere.
//   4. href="#" on something presented as a link.
//
// PRECISION OVER RECALL, DELIBERATELY. A control that takes its handler from a
// prop, or sits inside a <label>, or is a styled wrapper, is NOT a defect, and a
// detector that reports those gets deleted within a week — `ads:verify` crying
// wolf nearly cost a real guard. So a <button> is only reported when the whole
// element, including its props, carries no handler, no submit type, no prop
// spread and no `form=`; everything else is left alone. The cost of that choice
// is stated: this will miss a dead control whose handler is passed in from a
// parent that never passes one. It is a floor, not an audit.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, extname } from "node:path";

// COMMENTS ARE NOT CODE, AND THIS DETECTOR LEARNED THAT THE HARD WAY.
//
// It reported two dead controls in files that had none. Both "findings" were
// the words `<button>` inside a comment — in one case the comment explaining
// that the dead button had just been FIXED. A detector that reports the note
// describing a repair as the defect is the second failure mode this repository
// keeps hitting: a check that fails for a reason unrelated to what it tests,
// and the recorded consequence is that somebody deletes the check.
//
// So comments are blanked before anything is matched. Blanked rather than
// removed: every byte is replaced by a space and newlines are kept, so every
// line number in a finding still points at the right line.
//
// Strings are tracked while scanning because a `//` inside "https://…" is not a
// comment, and a stripper that stopped there would silently discard the rest of
// a line — which could hide a real dead control instead of a fake one.
function blankComments(src) {
  let out = "";
  let i = 0;
  const N = src.length;
  let quote = null;        // "'", '"' or "`" while inside a string
  while (i < N) {
    const c = src[i], next = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") { out += next ?? ""; i += 2; continue; }
      if (c === quote) quote = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && next === "/") {
      while (i < N && src[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && next === "*") {
      while (i < N && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i += 2;                 // the closing */
      continue;
    }
    out += c; i++;
  }
  return out;
}

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const SRC = join(ROOT, "src");

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next") continue;
    const f = join(dir, n);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (extname(n) === ".tsx") out.push(f);
  }
  return out;
}

const findings = [];
const add = (file, line, kind, snippet) =>
  findings.push({ file: relative(ROOT, file), line, kind, snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 110) });

for (const file of walk(SRC)) {
  const text = blankComments(readFileSync(file, "utf8"));
  const lines = text.split("\n");

  // 1 + 2. Buttons, read as whole ELEMENTS rather than by regex.
  //
  // MY FIRST VERSION WAS WRONG AND IT REPORTED A WORKING BUTTON. The tag was
  // matched with `/<button[\s\S]*?>/`, which ends at the first `>` — and an
  // arrow handler contains one: `onClick={() => {`. So any button whose handler
  // was written as an arrow function had its tag truncated BEFORE the handler,
  // and the detector declared it dead. A dead-control detector that reports live
  // controls is the `ads:verify` failure again, and it would have sent somebody
  // to "fix" a button that worked.
  //
  // So the tag is scanned with brace depth tracked, and ends at the first `>`
  // that is outside any `{...}` expression.
  for (const m of text.matchAll(/<button\b/g)) {
    const start = m.index;
    let depth = 0, end = -1;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) { end = i; break; }
    }
    if (end < 0) continue;
    const tag = text.slice(start, end + 1);
    const lineNo = text.slice(0, start).split("\n").length;
    const hasHandler = /\bon[A-Z]\w*\s*=/.test(tag);
    const isSubmit = /type\s*=\s*["{]?\s*(submit|reset)/.test(tag);
    const hasForm = /\bform\s*=/.test(tag);
    const spread = /\{\.\.\./.test(tag);
    const asChild = /asChild/.test(tag);
    if (!hasHandler && !isSubmit && !hasForm && !spread && !asChild) {
      add(file, lineNo, "button with no handler and no submit type", tag);
    }
    const empty = tag.match(/on[A-Z]\w*\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/);
    if (empty) add(file, lineNo, "explicitly empty handler", empty[0]);
  }

  // 3. Forms that post nowhere.
  for (const m of text.matchAll(/<form\b/g)) {
    const start = m.index;
    let depth = 0, end = -1;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) { end = i; break; }
    }
    if (end < 0) continue;
    const tag = text.slice(start, end + 1);
    const lineNo = text.slice(0, start).split("\n").length;
    if (!/\bonSubmit\s*=/.test(tag) && !/\baction\s*=/.test(tag) && !/\{\.\.\./.test(tag)) {
      add(file, lineNo, "form with no onSubmit and no action", tag);
    }
  }

  // 4. Dead links.
  lines.forEach((l, i) => {
    if (/href\s*=\s*["']#["']/.test(l) && !/aria-hidden|skip-link|sr-only/.test(l)) {
      add(file, i + 1, 'href="#" presented as a link', l);
    }
  });
}

const say = (m) => process.stdout.write(m + "\n");
const byKind = findings.reduce((a, f) => ((a[f.kind] = (a[f.kind] || 0) + 1), a), {});

if (!findings.length) {
  say("check:controls passed — no button without a handler, no empty handler, no form posting nowhere, no href=\"#\".");
  process.exit(0);
}

say(`check:controls found ${findings.length} control(s) that may do nothing:\n`);
for (const [kind, n] of Object.entries(byKind)) say(`  ${String(n).padStart(3)}  ${kind}`);
say("");
for (const f of findings) say(`  ${f.file}:${f.line}\n      [${f.kind}] ${f.snippet}`);
say("");
say("Each is a QUESTION. A control taking its handler from a prop is not a defect;");
say("a control with no handler anywhere is a button the user presses and nothing happens.");
// Reports rather than fails: this is a judgement-call detector, and a gate that
// fails the build on a judgement call is a gate somebody disables.
process.exit(0);
