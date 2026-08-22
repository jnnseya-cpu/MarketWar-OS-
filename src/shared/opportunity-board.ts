// THE OPPORTUNITY BOARD (§95).
//
// `opportunity-radar.ts` already ranks topics with a transparent, auditable
// formula. What was missing is everything after the ranking: an opportunity had
// no state, so there was no difference between one nobody had looked at, one
// somebody was working on, and one that had been quietly abandoned. A list that
// only grows is a list people stop reading.
//
// TWO RULES THIS BOARD ENFORCES THAT MOST DO NOT.
//
//   1. DROPPING SOMETHING REQUIRES A REASON. The failure mode of every board is
//      silent abandonment: items vanish into a "dropped" column and six weeks
//      later nobody can say why, so the same idea is proposed again. Same lesson
//      as the experiment history — an unexplained ending teaches nothing.
//   2. NOTHING JUMPS STRAIGHT TO WON. An opportunity that goes from "spotted" to
//      "won" without passing through work is a bookkeeping error or wishful
//      thinking, and either way the board stops describing reality.
//
// The board also reports how long each item has sat where it is, because the
// real failure of a kanban board is not the wrong column — it is the middle
// column nobody has touched since March.

export const BOARD_COLUMNS = ["spotted", "chosen", "in_progress", "won", "lost", "dropped"] as const;
export type Column = (typeof BOARD_COLUMNS)[number];

export const COLUMN_LABEL: Record<Column, string> = {
  spotted: "Spotted",
  chosen: "Chosen",
  in_progress: "In progress",
  won: "Won",
  lost: "Lost",
  dropped: "Dropped",
};

/** Terminal columns still allow a reopen — an opportunity can come back. */
export const TERMINAL: Column[] = ["won", "lost", "dropped"];

// Where each column may go. Deliberately narrow.
const ALLOWED: Record<Column, Column[]> = {
  spotted: ["chosen", "dropped"],
  chosen: ["in_progress", "dropped", "spotted"],
  in_progress: ["won", "lost", "dropped", "chosen"],
  won: ["spotted"],
  lost: ["spotted"],
  dropped: ["spotted"],
};

/** Moves that must carry a note, and why. */
const NEEDS_NOTE: Partial<Record<Column, string>> = {
  dropped: "Say why it was dropped. Without it, the same idea comes back in six weeks and nobody remembers this happened.",
  won: "Say what actually happened, so the next opportunity like it can be judged against a real outcome.",
  lost: "Say what went wrong. A loss with no reason teaches nothing and the next one repeats it.",
};

export type BoardEvent = { from: Column | null; to: Column; at: string; by: string; note?: string };

export type BoardItem = {
  id: string;
  topic: string;
  /** Straight from the radar. Never recomputed here. */
  opportunityScore?: number;
  column: Column;
  history: BoardEvent[];
};

export type MoveResult =
  | { ok: false; error: string }
  | { ok: true; item: BoardItem };

export function createItem(input: { id: string; topic: string; opportunityScore?: number; at: string; by?: string }): BoardItem {
  return {
    id: input.id,
    topic: input.topic,
    opportunityScore: input.opportunityScore,
    column: "spotted",
    history: [{ from: null, to: "spotted", at: input.at, by: input.by || "radar" }],
  };
}

export function allowedFrom(column: Column): Column[] {
  return [...ALLOWED[column]];
}

export function move(item: BoardItem, to: Column, opts: { at: string; by: string; note?: string }): MoveResult {
  if (!BOARD_COLUMNS.includes(to)) return { ok: false, error: `"${to}" is not a column on this board.` };
  if (to === item.column) return { ok: false, error: `It is already in ${COLUMN_LABEL[to]}.` };

  if (!ALLOWED[item.column].includes(to)) {
    const why = to === "won" && item.column === "spotted"
      ? "Nothing has been done to it yet — move it through Chosen and In progress, or the board stops describing what actually happened."
      : `From ${COLUMN_LABEL[item.column]} the only moves are ${ALLOWED[item.column].map((c) => COLUMN_LABEL[c]).join(", ")}.`;
    return { ok: false, error: why };
  }

  const need = NEEDS_NOTE[to];
  if (need && !String(opts.note || "").trim()) {
    return { ok: false, error: need };
  }

  return {
    ok: true,
    item: {
      ...item,
      column: to,
      history: [...item.history, { from: item.column, to, at: opts.at, by: opts.by, note: opts.note?.trim() || undefined }],
    },
  };
}

export type BoardView = {
  columns: { column: Column; label: string; items: (BoardItem & { daysInColumn: number })[] }[];
  /** Items that have not moved in a long time, worst first. The real board failure. */
  stalled: (BoardItem & { daysInColumn: number })[];
  headline: string;
};

export const STALLED_AFTER_DAYS = 14;

export function boardView(items: BoardItem[], nowISO: string): BoardView {
  const now = Date.parse(nowISO);
  const withAge = items.map((i) => {
    const last = i.history[i.history.length - 1];
    const daysInColumn = last ? Math.max(0, Math.floor((now - Date.parse(last.at)) / 86_400_000)) : 0;
    return { ...i, daysInColumn };
  });

  const columns = BOARD_COLUMNS.map((column) => ({
    column,
    label: COLUMN_LABEL[column],
    // Longest-waiting first inside a column: the thing that has been sitting
    // there is the thing worth looking at, not the newest arrival.
    items: withAge.filter((i) => i.column === column).sort((a, b) => b.daysInColumn - a.daysInColumn),
  }));

  const stalled = withAge
    .filter((i) => !TERMINAL.includes(i.column) && i.daysInColumn >= STALLED_AFTER_DAYS)
    .sort((a, b) => b.daysInColumn - a.daysInColumn);

  const active = withAge.filter((i) => !TERMINAL.includes(i.column)).length;
  const headline = items.length === 0
    ? "Nothing on the board yet."
    : stalled.length > 0
      ? `${stalled.length} of ${active} live opportunit${stalled.length === 1 ? "y has" : "ies have"} not moved in over ${STALLED_AFTER_DAYS} days. "${stalled[0].topic}" has been in ${COLUMN_LABEL[stalled[0].column]} for ${stalled[0].daysInColumn} days.`
      : `${active} live opportunit${active === 1 ? "y" : "ies"}, all moved within the last ${STALLED_AFTER_DAYS} days.`;

  return { columns, stalled, headline };
}

export const BOARD_DOCTRINE = [
  "Dropping something requires a reason. Silent abandonment is how the same idea gets proposed again six weeks later.",
  "Nothing jumps straight to Won. An opportunity that reaches Won without passing through work is a bookkeeping error, and the board stops describing reality.",
  "A win and a loss both require a note, so the next opportunity can be judged against a real outcome instead of a memory.",
  "The board reports what has not moved. The real failure of a board is not the wrong column — it is the middle column nobody has touched since March.",
  "The score comes from the radar and is never recomputed here. One source of truth per concept.",
];
