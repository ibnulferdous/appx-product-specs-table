// DOM glue for clipboard-table parsing (Step 12) — the one piece that must touch
// the DOM, isolated exactly like valueDom.ts. Reads the clipboard's `text/html`
// into a raw 2-D grid via DOMParser; the pure shaping + source selection lives in
// clipboardTable.ts. Browser-verified (DOMParser is unavailable in the Node test
// env and jsdom is not a project dependency — see the testing strategy); its grid
// output flows through the unit-tested `normalizeGrid`.

/**
 * Extract the first HTML `<table>` from a clipboard `text/html` string into a raw
 * 2-D grid of cell strings, or `null` when there is no usable table (so the caller
 * falls back to the plain-text TSV). Each `<tr>`'s `<td>`/`<th>` cells become one
 * row; a `<br>` inside a cell becomes a `\n` so an author-intended line break
 * survives in the grid string (Step 13 maps it to a LINE_BREAK). No trimming here —
 * `normalizeGrid` owns that. Returns `null` under Node/SSR (no DOMParser); the HTML
 * path only ever runs client-side, where a paste happens.
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

/** Cell text with `<br>` rendered as a newline (other markup flattened to text). */
function cellText(cell: Element): string {
  const clone = cell.cloneNode(true) as Element;
  for (const br of Array.from(clone.querySelectorAll("br"))) {
    br.replaceWith("\n");
  }
  return clone.textContent ?? "";
}
