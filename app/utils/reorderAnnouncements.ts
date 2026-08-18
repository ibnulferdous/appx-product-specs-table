// Screen-reader announcement copy for keyboard row reorder. `@dnd-kit` renders
// the live region; this owns only the WORDS, so the wording is unit-testable
// without a browser or a screen reader.
//
// ⚠️ Positions are 1-based, and callers pass the CURRENT (pre-move) rows — the
// reorder array is not mutated until the drop dispatches MOVE_ROW, so the `over`
// row's position is the slot the dragged row would land in.

import type { EditorRow } from "./rows";

// So a descriptor reads cleanly at the start of a sentence ("row 3" → "Row 3").
function capitalize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * A natural-language descriptor for a row, used in the announcements here and as
 * the drag handle's accessible name. The trimmed label plus its kind ("Battery
 * Life row"), falling back to a positional name when the label is blank so an
 * unnamed row is still distinguishable.
 */
export function describeRow(row: EditorRow, index: number): string {
  const kind = row.rowType === "SECTION_HEADER" ? "section" : "row";
  const trimmed = row.label.trim();
  return trimmed ? `${trimmed} ${kind}` : `${kind} ${index + 1}`;
}

// Resolve a row id to its descriptor + index in one pass; index -1 (and the
// generic "row" descriptor) when the id is not found (defensive — dnd-kit always
// reports a live id).
function describeById(
  rows: EditorRow[],
  id: string,
): { text: string; index: number } {
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) {
    return { text: "row", index: -1 };
  }
  return { text: describeRow(rows[index], index), index };
}

/** "Picked up …" — the drag has started; tell the user how to drive it. */
export function announceReorderStart(
  rows: EditorRow[],
  activeId: string,
): string {
  const active = describeById(rows, activeId);
  return `Picked up ${active.text}. Use the arrow keys to move it, then press space or enter to drop it, or escape to cancel.`;
}

/** "… is now over position N of M." — fired as the dragged row passes targets. */
export function announceReorderOver(
  rows: EditorRow[],
  activeId: string,
  overId: string | null,
): string {
  const active = describeById(rows, activeId);
  const overIndex = overId ? rows.findIndex((row) => row.id === overId) : -1;
  if (overIndex === -1) {
    return `${capitalize(active.text)} is no longer over a drop position.`;
  }
  return `${capitalize(active.text)} is now over position ${overIndex + 1} of ${rows.length}.`;
}

/** "… was dropped at position N of M." — the drag committed. */
export function announceReorderEnd(
  rows: EditorRow[],
  activeId: string,
  overId: string | null,
): string {
  const active = describeById(rows, activeId);
  const overIndex = overId ? rows.findIndex((row) => row.id === overId) : -1;
  if (overIndex === -1) {
    return `${capitalize(active.text)} was dropped.`;
  }
  return `${capitalize(active.text)} was dropped at position ${overIndex + 1} of ${rows.length}.`;
}

/** "Reordering cancelled. …" — Escape (or an invalid drop) reverted the move. */
export function announceReorderCancel(
  rows: EditorRow[],
  activeId: string,
): string {
  const active = describeById(rows, activeId);
  return `Reordering cancelled. ${capitalize(active.text)} returned to its original position.`;
}
