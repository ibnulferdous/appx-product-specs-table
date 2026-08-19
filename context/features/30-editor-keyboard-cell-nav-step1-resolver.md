# Editor keyboard cell navigation — Step 1: pure vertical-nav resolver

## Goal in one sentence

Add a **pure, unit-tested** helper `resolveGridTarget(rows, currentRowId, column, direction)` that,
given the row array and where the caret currently is, returns **which cell a `Ctrl/Cmd + Arrow
Up/Down` press should land on** (or `null` for a no-op) — encoding the **step-one-row-at-a-time**,
**first/last-row no-op**, and **sticky-column** rules — with **no DOM, no keyboard wiring, and no
component change** (those are Step 2).

## Why this is now (and why it's a separate step)

The feature is spreadsheet-style **vertical** cell navigation: `Ctrl/Cmd+ArrowDown` moves to the same
column one row down, `Ctrl/Cmd+ArrowUp` one row up. It splits cleanly into three slices:

1. **Step 1 (this doc)** — the **pure navigation rules**: which row, which column, when to no-op.
2. **Step 2** — the **DOM + keyboard wiring**: modifier/arrow detection, reading the source cell from
   `event.target`, the `preferredColumn` ref, focusing the target element, caret-at-end placement,
   `preventDefault`. Browser-verified.
3. **Step 3** — a **discoverability hint** + feature/progress docs.

This mirrors how **Step 12** landed the pure clipboard parser (`clipboardTable.ts`) and unit-tested it
**before** Step 13 wired it to a destructive insert, and it follows the established **pure-logic /
DOM-glue split** (`valueParts.ts` pure + Node-tested; `valueDom.ts` DOM-touching +
browser-verified — see [[testing-strategy]], [[editor-value-surface-architecture]]). Per
`ai-workflow-rules.md` ("split if a change cannot be verified end to end quickly"), the **rules** are
pure index/column logic that deserve unit tests on their own, while the **risky** parts
(contenteditable selection, focus, caret) are all DOM and belong in Step 2's browser-verified wiring.

A bug in Step 1 is therefore a **navigation-rules** bug — not a focus, caret, or persistence bug. The
caret model, the reducer (`rows.ts`), the value surface, the label/section inputs, and the dnd-kit
reorder are all **frozen**; Step 1 reads neither a row's contents nor the DOM.

## Foundation carried

- **Rows are an ordered array and the single source of truth.** Data rows (`rowType: "DATA"`) and
  section headers (`rowType: "SECTION_HEADER"`) interleave, each with a stable `id`. Vertical
  navigation is just a `±1` step through that order.
- **A section row has no Label/Value split** — it renders one full-width input (`.cellSection`),
  unlike a data row's two cells (Label `<input>` + the Value `[role="textbox"]` surface). The
  resolver must report a section landing distinctly so Step 2 focuses that single input.
- **No reducer action.** Navigation moves **focus**, it never mutates `rows`. Step 1 adds no action
  and no dependency; like Step 12 it is a pure utility plus its test.

## What changes (architecture)

**One new pure module + its test. No component import, no reducer change, no CSS, no new dependency.**

### `app/utils/gridNav.ts` (pure, Node-unit-tested)

Framework-free and DOM-free (string/array logic only), like `valueParts.ts`. Exports the small type
surface and the resolver:

```ts
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
  if (index === -1) return null;                       // source row not found
  const targetIndex = direction === "down" ? index + 1 : index - 1;
  if (targetIndex < 0 || targetIndex >= rows.length) return null; // first/last → no-op
  const target = rows[targetIndex];
  if (target.rowType === "SECTION_HEADER") {
    return { rowId: target.id, cell: "section" };      // focus the single input
  }
  return { rowId: target.id, cell: column };           // echo column → sticky column
}
```

**Two rules are encoded here, and they are exactly what the unit tests pin down:**

- **Sticky column = echo the input column on every *data* target.** The resolver never downgrades
  `value → label`. Combined with Step 2 keeping its `preferredColumn` ref **unchanged while the source
  is a section row**, the column intent survives a pass *through* a section row — yielding the locked
  behaviour: **Scenario 1 (started in Label) → Label; Scenario 2 (started in Value) → Value.**
- **Step one row at a time; never skip a section.** A section landing returns `cell: "section"` (Step
  2 focuses its single input) rather than jumping over it to the next data row.

The module is **not imported by any component this step** — it is exercised only by `gridNav.test.ts`
(the unused export still type-checks and builds clean). Step 2 imports `resolveGridTarget` into the
keyboard handler.

## Reducer actions

| Interaction | Mechanism |
| --- | --- |
| `Ctrl/Cmd + Arrow Up/Down` (resolve target) | **none** — pure `resolveGridTarget`, no dispatch |
| Focus move / caret placement on arrival | **Step 2** — DOM focus + `setCaretLinear`/`setSelectionRange` |

**No reducer action added or changed.** Navigation is focus-only; `rows.ts` is untouched.

## Locked decisions

- **Vertical only.** `Ctrl/Cmd + ArrowUp/Down`; horizontal stays `Tab` / `Shift+Tab` (a modifier on
  Left/Right collides with word-jump on Windows / line-home-end on Mac, and duplicates Tab).
- **Step one row at a time; never skip section rows.** A section row is a valid landing (its single
  input), returned as `cell: "section"`.
- **First/last row → no-op (`null`).** `Ctrl/Cmd+Up` on the first row and `Ctrl/Cmd+Down` on the last
  row do nothing — no wrap, no new-row creation.
- **Sticky column, encoded by echoing the input column.** Data targets keep the column; section
  targets carry none. With Step 2's "don't overwrite the preferred column on a section row" rule, the
  intent survives the section: **Scenario 1 → Label, Scenario 2 → Value** (locked).
- **Pure + deterministic, no DOM.** `resolveGridTarget` reads only `id` + `rowType`, returns a plain
  object or `null`, and never mutates the input — same discipline as every other `app/utils` helper.
- **Caret offset is *not* the resolver's job.** It returns *which cell*, not *where in it*. The
  "caret at the **end** of the target cell on arrival" decision is applied in Step 2 (`setCaretLinear`
  to the cell's linear length / `input.setSelectionRange(len, len)`).

## What Step 1 does *not* own (boundary with Steps 2–3)

- **All keyboard + DOM wiring → Step 2:** the `onKeyDown` (on `.rowsScroller` in `RowGrid`, so
  `ValueCell`/label handlers stay untouched); modifier detection (`(ctrlKey || metaKey) && !shiftKey
  && !altKey`, no platform sniffing); reading the **source** `(rowId, column)` from `event.target`
  (Value = `[role="textbox"]`, Label = `input.cellInput`, Section = `input.cellSection`); the
  **`preferredColumn` ref** and its rule (*update from data label/value sources; leave unchanged on a
  section source*); focusing the resolved target and placing the caret at its **end**
  (`setCaretLinear` from `valueDom.ts` for the value surface, `setSelectionRange` for inputs);
  `preventDefault` to stop native scroll/caret-to-edge.
- **Discoverability hint + docs → Step 3** (tooltip/help line; `progress-tracker.md` narrative).
- **No change to** the reducer, the value surface / caret model, the label & section inputs, or the
  dnd-kit reorder (its arrow keys only fire when a drag handle is focused **and** picked up with
  Space/Enter — a different target, no conflict).

## File placement (per `code-standards.md`)

- Resolver + types → **`app/utils/gridNav.ts`** (pure, DOM-free, no side effects).
- Unit tests → **`app/utils/gridNav.test.ts`**.
- **No other file changes this step** — no component, no `rows.ts`, no CSS, no `package.json`.

## Testing

Pure Node unit tests (no browser needed this step), following [[testing-strategy]]:

- **Down from a middle data row → next row, column echoed** — `label` stays `label`, `value` stays
  `value`.
- **Up from a middle data row → previous row, column echoed.**
- **Down from the last row → `null`; Up from the first row → `null`** (first/last no-op).
- **Unknown / absent `currentRowId` → `null`.**
- **Single-row array → both Up and Down `null`.**
- **Target is a section row → `{ rowId, cell: "section" }`**, regardless of the input column
  (`label` *and* `value` both yield `cell: "section"`).
- **Source is a section row, Down → next data row with `cell === inputColumn`** (proves the resolver
  does not downgrade the column when leaving a section).
- **`data → section → data` echo chain (the locked scenarios):** from a data row with `column:
  "value"`, Down lands on the section (`cell: "section"`); resolving again from that section with
  `column: "value"` lands on the next data row with `cell: "value"` (**Scenario 2 → Value**); the same
  chain with `column: "label"` ends in `cell: "label"` (**Scenario 1 → Label**).
- **Never mutates the input `rows` array** (same reference, same contents after the call).

`npm run test:run` stays green and the new `gridNav.test.ts` cases lift the suite above its
pre-change baseline.

## Open questions

- **Caret placement on arrival (end vs select-all)** is a Step 2 concern; the resolver deliberately
  returns no offset. Decision is already locked to **caret at end**.
- **New-row-on-last-row-Down (Excel-style)** is explicitly *not* in scope (locked: no-op). If merchant
  feedback later wants it, it is a small additive change to the `targetIndex >= rows.length` branch —
  recorded here so the boundary is deliberate.

## Done when

1. `app/utils/gridNav.ts` exports `GridColumn`, `GridNavDirection`, `GridTarget`, and a **pure**
   `resolveGridTarget` (no DOM import, no mutation).
2. `app/utils/gridNav.test.ts` covers every case above (incl. first/last no-op, section landing,
   section-source pass-through, and the two locked `data→section→data` scenarios); `npm run test:run`
   is green and above baseline.
3. `npm run typecheck`, `lint`, `format:check`, and `build` all pass; **no** component, reducer, CSS,
   or dependency change.
4. `context/progress-tracker.md` reflects Step 1 complete and points at **Step 2** (keyboard + DOM
   wiring: modifier detection, `preferredColumn` ref, focus + caret-at-end).
