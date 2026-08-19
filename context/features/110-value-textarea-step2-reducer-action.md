# Value textarea — Step 2: `SET_VALUE_PARTS` reducer action

**Status: ✅ Shipped 2026-08-07.** Part 2 of 6 (features 109–114). Pure, additive
reducer change — **the editor still runs on the old actions**; nothing dispatches
the new one yet. `SET_VALUE_PARTS` added to `rows.ts` + 6 new `rows.test.ts` cases;
full gate green (typecheck, lint, 1468 tests, build). Verification at the bottom.

## Why a new action

Today the `contenteditable` cell dispatches *granular* edits — `SET_VALUE_TEXT`
(one TEXT run), `REMOVE_VALUE_PART`, `INSERT_VALUE_PART_AT`, `SET_VALUE_PART` —
because it edits parts in place at a linear caret. The textarea works differently:
every keystroke or paste produces a **whole new string**, which Step 111 reparses
to a **whole new `ValuePart[]`** via `textToParts` (feature 109). That needs one
action that replaces a DATA row's `valueParts` wholesale.

Parsing lives in the component (it imports `textToParts`); the reducer stays
grammar-free and DOM-free, receiving an already-parsed array — same discipline as
every other action in [rows.ts](app/utils/rows.ts). This also avoids a
`rows → valueText` import cycle (`valueText` imports from `rows`).

## Goal in one sentence

Add `SET_VALUE_PARTS { id, valueParts }` to `rowsReducer` — replace one DATA row's
`valueParts` with a caller-supplied array (run through `normalizeValueParts`) —
covered by `rows.test.ts`, dispatched by nobody yet.

## The action

```ts
// Replace a DATA row's whole value with a caller-parsed array (the textarea
// surface, feature 111). The component owns parsing (textToParts); the reducer
// stays pure/DOM-free/grammar-free and just normalizes + swaps. No-op on a
// SECTION_HEADER or an unknown id (same-reference return, so a stray dispatch
// never flips the editor's dirty flag).
| { type: "SET_VALUE_PARTS"; id: string; valueParts: ValuePart[] }
```

Reducer branch:

```ts
case "SET_VALUE_PARTS":
  return rows.map((row) => {
    if (row.id !== action.id || row.rowType !== "DATA") return row;
    return { ...row, valueParts: normalizeValueParts(action.valueParts) };
  });
```

- `normalizeValueParts` guarantees ≥1 TEXT and merges adjacent TEXT, so a parsed
  array is always canonical before it lands in state — matching what
  `SET_VALUE_TEXT` / `REMOVE_VALUE_PART` produce today, so downstream (dirty
  tracking, serialize, preview) sees no shape difference.
- Keep it minimal: no caret data in the action (the textarea owns its own caret;
  the container restores caret separately in Step 111).

## Tests (`rows.test.ts`)

- Replaces a DATA row's `valueParts`; other rows untouched.
- Runs `normalizeValueParts` (pass `[TEXT "a", TEXT "b"]` → one `TEXT "ab"`; pass
  `[]` → `[TEXT ""]`).
- No-op (same row object / array reference) on a SECTION_HEADER id and on an
  unknown id.

## Files

- **Touched:** [app/utils/rows.ts](app/utils/rows.ts) — one union member + one
  `case`. **New tests in** `app/utils/rows.test.ts`.
- Everything else untouched. The old actions remain (removed in Step 113).

## Boundaries (not this step)

- No component change, no dispatch of the new action — Step 111.
- No removal of `SET_VALUE_TEXT` / `REMOVE_VALUE_PART` / `INSERT_VALUE_PART_AT` /
  `SET_VALUE_PART` — Step 113, after the new path is proven.

## Done when

1. `SET_VALUE_PARTS` exists in the `RowsAction` union and `rowsReducer`, normalizes
   its input, and is a same-reference no-op on non-DATA / unknown ids.
2. `rows.test.ts` covers replace + normalize + both no-ops.
3. `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build` pass;
   the editor's runtime behavior is unchanged (no caller yet).

## Verification (2026-08-07) — ✅ all met

- `SET_VALUE_PARTS { id, valueParts }` added to the `RowsAction` union and
  `rowsReducer` in [rows.ts](app/utils/rows.ts). The branch runs
  `normalizeValueParts` and is a same-reference no-op on a SECTION_HEADER / unknown
  id. Parsing stays in the (future) component — the reducer is grammar-free, no
  `rows` → `valueText` cycle.
- `rows.test.ts`: **6 new cases** — wholesale replace (other rows untouched by
  reference), normalize adjacent TEXT, empty array → `[TEXT ""]` seed, LINE_BREAK
  preservation, and both no-ops (SECTION_HEADER + unknown id). The reducer suite is
  113 tests, all green.
- Full gate green: **typecheck** ✓, **lint** ✓, **test:run** 1468/1468 ✓,
  **build** ✓. No caller dispatches the action yet → editor runtime unchanged.
