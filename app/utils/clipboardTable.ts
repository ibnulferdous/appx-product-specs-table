// Pure, framework-free clipboard-table parsing for the spec-table editor (Step 12).
//
// When a merchant pastes a multi-cell table (Excel / Google Sheets / a web page),
// the clipboard carries BOTH a rich `text/html` <table> and a `text/plain`
// tab-separated fallback. This module turns either into a normalized 2-D string
// grid (`string[][]`) — the shape Step 13's PASTE_ROWS will map onto rows.
//
// Split, like valueParts.ts (pure) vs valueDom.ts (DOM glue): the one piece that
// must touch the DOM — extracting a grid from the HTML <table> via DOMParser —
// lives in clipboardTableDom.ts and is browser-verified. Everything here is pure
// and deterministic, and Node-unit-tested. Step 12 parsed the clipboard into a
// grid (string -> string[][]); Step 13 adds `gridToPastedRows`, the pure
// grid -> row-content mapper the PASTE_ROWS reducer action appends.

import { normalizeValueParts, type ValuePart } from "./rows";

/**
 * Parse tab-separated text into a raw 2-D grid. Rows split on `\r\n` | `\r` | `\n`,
 * cells on `\t`. **Quote-aware:** Excel and Google Sheets wrap a cell that itself
 * contains a tab, newline, or quote in double quotes and double any internal `"`.
 * A cell that begins with `"` is read through its matching close-quote, with `""`
 * un-escaped to `"` and embedded tabs/newlines preserved verbatim. Returns the
 * grid un-normalized (no trimming, no empty-row drop) — see `normalizeGrid`.
 */
export function parseDelimitedText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'; // escaped quote inside a quoted cell
          i += 2;
          continue;
        }
        inQuotes = false; // closing quote
        i += 1;
        continue;
      }
      cell += char; // tabs / newlines are literal while quoted
      i += 1;
      continue;
    }

    if (char === '"' && cell === "") {
      inQuotes = true; // opening quote (only meaningful at the start of a cell)
      i += 1;
      continue;
    }

    if (char === "\t") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }

    if (char === "\r" || char === "\n") {
      row.push(cell);
      rows.push(row);
      cell = "";
      row = [];
      // Treat a `\r\n` pair as a single row break.
      i += char === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }

    cell += char;
    i += 1;
  }

  // Flush the final (unterminated) cell + row.
  row.push(cell);
  rows.push(row);
  return rows;
}

/**
 * Shape a raw grid into canonical form: trim each cell's leading/trailing
 * whitespace (an *embedded* `\n` — from a `<br>` in an HTML cell or a quoted
 * multiline TSV cell — is preserved, since Step 13 models it as a line break),
 * drop wholly-empty rows (every cell empty after trim — this absorbs the trailing
 * newline Excel/Sheets append and any blank separator rows), and return `[]` when
 * the grid reduces to nothing. Ragged rows are kept as-is (NOT padded) — Step 13
 * owns how a missing or extra column maps. Pure: returns a fresh grid and never
 * mutates the input.
 */
export function normalizeGrid(grid: string[][]): string[][] {
  return grid
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell !== ""));
}

/**
 * Total cells across a grid — the usability measure for the HTML source (above)
 * and the bulk-gesture gate in the paste handler (Step 13): a grid of >1 cell
 * (more than one row OR more than one column) is a bulk paste; a lone 1×1 (or
 * empty) grid is not.
 */
export function cellCount(grid: string[][]): number {
  let total = 0;
  for (const row of grid) total += row.length;
  return total;
}

/**
 * True when the grid is genuinely TABULAR — some row carries more than one column
 * (a tab in the TSV, or >1 `<td>`/`<th>` in an HTML row). This is the bulk-gesture
 * gate the VALUE CELL uses (feature 115), where `cellCount > 1` is the wrong
 * question: a single-column, N-line paste (plain multi-line prose) is N cells and
 * so read as a "table", which exploded it into N label-only rows instead of
 * landing as one multiline value. Column count is the honest signal — inside a
 * value cell, only a real table becomes rows; lines become lines.
 *
 * 🔴 NOT a replacement for `cellCount`. The CONTAINER paste handler (paste into
 * the grid with no value cell focused) deliberately keeps `cellCount > 1`, so
 * pasting a column of labels into the grid still bulk-creates rows — the gesture
 * that moves out of the value cell keeps its home there (feature 115). The
 * HTML-vs-TSV source selection in `parseClipboardTable` also stays on `cellCount`:
 * it measures whether the HTML grid is *usable*, a different question entirely.
 */
export function hasMultipleColumns(grid: string[][]): boolean {
  return grid.some((row) => row.length > 1);
}

/**
 * Select the best clipboard source and normalize. Prefer the HTML-extracted grid
 * only when it is *usable* = more than one cell total (more than one row OR more
 * than one column): a degenerate 1×1 HTML grid (a layout table, or a single-cell
 * rich copy) must not beat the structured TSV that Excel/Sheets always also put on
 * the clipboard. Otherwise parse the plain text as TSV. Pure — the HTML is already
 * extracted to a grid upstream by `clipboardTableDom.ts`, so this stays
 * Node-testable and DOM-free.
 */
export function parseClipboardTable(input: {
  htmlGrid: string[][] | null;
  text: string | null;
}): string[][] {
  const { htmlGrid, text } = input;
  const grid =
    htmlGrid && cellCount(htmlGrid) > 1
      ? htmlGrid
      : parseDelimitedText(text ?? "");
  return normalizeGrid(grid);
}

/**
 * Map a normalized clipboard grid (from `parseClipboardTable`) to pasted-row
 * content for Step 13's PASTE_ROWS action: the FIRST column of each row becomes
 * the `label`, and the REMAINING columns become the value. One uniform rule
 * builds the value — a column boundary AND an embedded `\n` (which Step 12
 * preserved from a `<br>` in an HTML cell or a quoted multiline TSV cell) both
 * become a `LINE_BREAK`: split each remaining cell on `\n`, concatenate the
 * resulting lines across all remaining columns, and place a `LINE_BREAK` between
 * consecutive lines (`data-model.md` §7 "Multiline values"). The parts run
 * through `normalizeValueParts`, so a row with no remaining columns collapses to
 * a single empty TEXT (a label-only data row — the shape `createDataRow` seeds)
 * and adjacent TEXT can never appear.
 *
 * Returns `{ label, valueParts }` only — no `id`, no `key`, no `rowType`: the
 * component mints the id (the lone non-deterministic input) and the reducer seeds
 * the provisional key, so this mapper stays pure and free of the keying policy.
 * Each grid row maps independently, so a ragged grid is handled per-row with no
 * padding. Pure: never mutates the input grid.
 */
export function gridToPastedRows(
  grid: string[][],
): Array<{ label: string; valueParts: ValuePart[] }> {
  return grid.map((row) => {
    const label = row[0] ?? "";
    const lines = row.slice(1).flatMap((cell) => cell.split("\n"));
    const valueParts: ValuePart[] = [];
    lines.forEach((line, index) => {
      if (index > 0) {
        valueParts.push({ type: "LINE_BREAK" });
      }
      valueParts.push({ type: "TEXT", text: line });
    });
    return { label, valueParts: normalizeValueParts(valueParts) };
  });
}
