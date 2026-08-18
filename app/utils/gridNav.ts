// Pure vertical-navigation rules for keyboard cell navigation: given the rows and
// the caret's position, which cell a `Ctrl/Cmd + Arrow Up/Down` lands on, or
// `null` for a no-op.
//
// DOM-free on purpose — the RULES live here and are unit-tested in Node, while
// the keyboard/focus/caret WIRING is browser-verified glue in
// `useGridKeyboardNav.ts`. A bug here is a navigation-rules bug, never a
// focus/caret bug.

import type { EditorRow } from "./rows";

// Which data-cell column the merchant is navigating in. A section row has no
// column (one full-width input).
export type GridColumn = "label" | "value";

// Vertical only — horizontal stays Tab / Shift+Tab.
export type GridNavDirection = "up" | "down";

// Where a Ctrl/Cmd+Arrow press should land. ⚠️ The `cell: "section"` arm carries
// NO column, so the caller's preferredColumn ref stays unchanged while sitting on
// a section — that is what preserves column intent across it.
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
