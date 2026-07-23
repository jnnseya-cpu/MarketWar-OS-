// Layer guard: backend modules must never reach the client bundle.
if (typeof window !== "undefined") {
  throw new Error("MarketWar OS layer violation: a backend module was imported in the browser");
}

// Global agent OUTPUT-STYLE directive — appended to every AI agent's system
// prompt so the whole OS answers SHORT and ACTION-FIRST instead of writing long
// strategic essays. Owner directive: value per line, no walls of text, no
// lectures. The computed engines already return structured data; this makes the
// free-text agents behave the same way.
export const CONCISE_DIRECTIVE = `
OUTPUT STYLE — STRICT (overrides any verbosity in the directive above):
- Lead with the answer on line 1. No preamble, no restating the inputs, no throat-clearing.
- Be SHORT: aim for under 150 words. Use at most 6 bullet points. Never write multi-paragraph essays or lectures.
- Give the finished DELIVERABLE (the copy, the plan, the numbers), not a description of what you would do.
- End with exactly ONE line: "Next: <the single concrete action to take now>".
- If a required input is missing, do NOT lecture. Make ONE sensible assumption, state it in a 1-line note ("Assumed: …"), and produce the deliverable anyway.
- No hype, no "STOP/DEAD ON ARRIVAL" theatrics, no repeating guardrails the UI already shows.`;

// Attach the directive to an agent's own system prompt.
export function withConciseStyle(systemPrompt: string): string {
  return `${systemPrompt}\n${CONCISE_DIRECTIVE}`;
}
