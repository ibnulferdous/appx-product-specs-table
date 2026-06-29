// Pure vertical-navigation rules for the spec-table editor's keyboard cell
// navigation (feature 30, Step 1). Given the row array and where the caret
// currently is, decide which cell a `Ctrl/Cmd + Arrow Up/Down` press should land
// on — or `null` for a no-op (no row that way).
//
// Framework-free and DOM-free on purpose (string/array logic only), like
// `valueParts.ts`: the navigation RULES live here and are unit-tested in Node,
// while the keyboard/focus/caret WIRING (modifier detection, the preferredColumn
// ref, focusing the target, caret-at-end placement) is Step 2's browser-verified
// DOM glue. A bug here is a navigation-rules bug, never a focus/caret bug.

import type { EditorRow } from "./rows";

// Which data-cell column the merchant is navigating in. A section row has no
// column (one full-width input) — see GridTarget.
export type GridColumn = "label" | "value";

// Vertical only (Step 1). Horizontal stays Tab / Shift+Tab — out of scope.
export type GridNavDirection = "up" | "down";

// Where a Ctrl/Cmd+Arrow press should land. A data row resolves to one of its two
// cells (the echoed column); a section row resolves to its single input — the
// `cell: "section"` arm carries NO column, so Step 2's preferredColumn ref (left
// unchanged while sitting on a section) preserves the merchant's column intent
// across the section row.
export type GridTarget =
  | { rowId: string; cell: "label" | "value" }
  | { rowId: string; cell: "section" };

// Resolve the target of one vertical hop, or null for a no-op (no row that way).
// PURE: reads only ids + rowType; never touches the DOM or mutates `rows`.
export function resolveGridTarget(
  rows: readonly Pick<EditorRow, "id" | "rowType">[],
  currentRowId: string,
  column: GridColumn,
  direction: GridNavDirection,
): GridTarget | null {
  const index = rows.findIndex((row) => row.id === currentRowId);
  if (index === -1) return null; // source row not found
  const targetIndex = direction === "down" ? index + 1 : index - 1;
  if (targetIndex < 0 || targetIndex >= rows.length) return null; // first/last → no-op
  const target = rows[targetIndex];
  if (target.rowType === "SECTION_HEADER") {
    return { rowId: target.id, cell: "section" }; // focus the single input
  }
  return { rowId: target.id, cell: column }; // echo column → sticky column
}
