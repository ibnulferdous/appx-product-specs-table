// DOM glue for clipboard-table parsing — the one piece that must touch the DOM.
// Reads the clipboard's `text/html` into a raw 2-D grid via DOMParser; the pure
// shaping and source selection live in `clipboardTable.ts`. Browser-verified,
// since DOMParser is unavailable in the Node test env.

import { parseClipboardTable } from "./clipboardTable";

/**
 * Extract the first HTML `<table>` into a raw 2-D grid, or `null` when there is
 * no usable table (so the caller falls back to the plain-text TSV). A `<br>`
 * inside a cell becomes `\n` so an author-intended line break survives. No
 * trimming here — `normalizeGrid` owns that. `null` under Node/SSR.
 */
export function extractHtmlTableGrid(html: string): string[][] | null {
  if (typeof DOMParser === "undefined" || !html) return null;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;

  const grid: string[][] = [];
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    const cells = Array.from(tr.querySelectorAll("td, th"));
    if (cells.length === 0) continue; // a structural <tr> carrying no cells
    grid.push(cells.map(cellText));
  }
  return grid.length > 0 ? grid : null;
}

/**
 * Turn a paste payload into a normalized grid — the single place both paste entry
 * points call, so they can never disagree on what counts as a table.
 *
 * ⚠️ The callers ask DIFFERENT questions of the result: the container handler uses
 * `cellCount > 1` (a column of lines pasted into the grid still makes rows),
 * while the value cell uses `hasMultipleColumns` (inside a cell, only a real
 * table makes rows — plain multi-line text stays one multiline value).
 */
export function readClipboardGrid(data: DataTransfer | null): string[][] {
  if (!data) return [];
  return parseClipboardTable({
    htmlGrid: extractHtmlTableGrid(data.getData("text/html")),
    text: data.getData("text/plain"),
  });
}

/** Cell text with `<br>` rendered as a newline (other markup flattened to text). */
function cellText(cell: Element): string {
  const clone = cell.cloneNode(true) as Element;
  for (const br of Array.from(clone.querySelectorAll("br"))) {
    br.replaceWith("\n");
  }
  return clone.textContent ?? "";
}
