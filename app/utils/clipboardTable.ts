// Pure clipboard-table parsing for the spec-table editor.
//
// When a merchant pastes a multi-cell table (Excel / Google Sheets / a web page),
// the clipboard carries BOTH a rich `text/html` <table> and a `text/plain`
// tab-separated fallback. This turns either into a normalized 2-D string grid —
// the shape `PASTE_ROWS` maps onto rows.
//
// The one piece that must touch the DOM (extracting a grid from the HTML table
// via DOMParser) lives in `clipboardTableDom.ts`; everything here is pure and
// Node-unit-tested.

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
 * Total cells across a grid — the usability measure for the HTML source and the
 * bulk-gesture gate in the container paste handler: a grid of >1 cell is a bulk
 * paste; a lone 1×1 or empty grid is not.
 */
export function cellCount(grid: string[][]): number {
  let total = 0;
  for (const row of grid) total += row.length;
  return total;
}

/**
 * True when the grid is genuinely TABULAR — some row carries more than one
 * column. The bulk-gesture gate the VALUE CELL uses, where `cellCount > 1` is the
 * wrong question: a single-column, N-line paste is N cells, so it read as a
 * "table" and exploded into N label-only rows instead of one multiline value.
 *
 * 🔴 NOT a replacement for `cellCount`. The CONTAINER paste handler deliberately
 * keeps `cellCount > 1`, so pasting a column of labels into the grid still
 * bulk-creates rows. `parseClipboardTable`'s HTML-vs-TSV selection also stays on
 * `cellCount` — it measures whether the HTML grid is *usable*, a different
 * question.
 */
export function hasMultipleColumns(grid: string[][]): boolean {
  return grid.some((row) => row.length > 1);
}

/**
 * Select the best clipboard source and normalize. Prefer the HTML-extracted grid
 * only when it is *usable* (more than one cell): a degenerate 1×1 HTML grid — a
 * layout table, or a single-cell rich copy — must not beat the structured TSV
 * that Excel/Sheets always also put on the clipboard.
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
 * Map a normalized grid to pasted-row content: the FIRST column becomes the
 * `label`, the REMAINING columns become the value. One uniform rule — a column
 * boundary AND an embedded `\n` both become a `LINE_BREAK` (`data-model.md` §7).
 *
 * Returns `{ label, valueParts }` only: the component mints the id and the
 * reducer seeds the provisional key, so this stays free of the keying policy.
 * Each grid row maps independently, so a ragged grid needs no padding.
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
