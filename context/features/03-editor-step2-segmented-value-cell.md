# Editor Step 2 — Segmented value cell + pills + toolbar

## Goal in one sentence

Make a row's value a **sequence of parts** — typed text and blue pill chips side
by side ("Up to `[pill]` hours") — that can be edited, removed, and inserted, and
put the toolbar (Add row / Add section / Duplicate) above the table, with a
persistent drag-handle + delete pair in each row's gutter.

## Why this is second

This is the heart of the product and the hardest UI piece, but it is still pure
array work on the Step 1 reducer: a value is `valueParts`, and editing it is
splice/update on that array. At this stage the pills are deliberately **"dumb"**
— you can insert and remove them, but you cannot yet pick _which_ metafield. That
is Step 3 (field picker). Keeping the picker out keeps this step verifiable.

## Foundation carried from Step 1

- The row already stores its value as `valueParts` (Step 1 seeds exactly one
  `{ "type": "TEXT", "text": "" }` part). Step 2 **extends that array in place** —
  no row reshaping (`data-model.md` §6–7).
- `id` / `key` rules are unchanged: `id` stable and never reused, `key` derived at
  creation and never rewritten by a label edit.
- The `MAX_TEMPLATE_ROWS` constant and cap enforcement from Step 1 still apply to
  every row-creating action (Add row, Duplicate, Add section).

---

## Sub-steps (build and verify one at a time)

Each sub-step builds clean (`npm run build` + ESLint), is visually verifiable on
its own, and adds at most one reducer action. The chain is
**render → edit → remove → insert → toolbar**, so a regression points at exactly
one sub-step.

### 2.1 — Render `valueParts` as segments (display only)

Replace Step 1's single Value text input with a segment renderer that walks
`valueParts` in order:

- `TEXT` part → an editable text input sized to its content.
- `METAFIELD` part → a static blue pill labelled `Metafield · <key>`.
- `SHOPIFY_FIELD` part → a static blue pill labelled `Field · <field>`.

Pills are inert in this sub-step (no ✕, not yet insertable). To verify, seed one
row with a multi-part value (in code, or by temporarily duplicating a
hand-built row).

**Verify:** a multi-part value renders inline as text + pill + text — e.g.
"Up to `[Metafield · battery_life]` hours". No reducer changes yet.

### 2.2 — Edit each TEXT segment independently

`SET_VALUE_TEXT` now takes a **part index**, so each TEXT input edits only its own
part of `valueParts` (Step 1 only ever had index 0).

```
SET_VALUE_TEXT  { id, partIndex, text }  → update valueParts[partIndex].text
```

**Verify:** with a value like "Up to `[pill]` hours", typing in the leading
segment changes only `valueParts[0]` and typing in the trailing segment changes
only `valueParts[2]`; the pill and the other text segment are untouched.

### 2.3 — Remove a pill (✕)

Each pill gets an ✕ control → new action:

```
REMOVE_VALUE_PART  { id, partIndex }  → remove that part, then normalize
```

After removal, **merge adjacent TEXT parts** so the array does not accumulate
empty/fragmented text segments (e.g. removing the pill from
`[TEXT "Up to ", PILL, TEXT " hours"]` yields a single `[TEXT "Up to  hours"]`).
Guarantee at least one TEXT part remains so the cell stays editable.

**Verify:** clicking ✕ drops that pill and the surrounding text re-joins into one
continuous, still-editable segment.

### 2.4 — Insert a pill (placeholder)

New action that appends a pill to the **active row's** value, followed by a
trailing empty TEXT part so the merchant can keep typing after it:

```
INSERT_VALUE_PART  { id, part }  → append part, then ensure a trailing TEXT part
```

The real field picker is **Step 3** — here `part` is a fixed **placeholder** pill
(e.g. a dummy `METAFIELD`) whose only job is to prove the splice mechanics.
Mid-text caret-splitting is **deliberately deferred**: left-to-right authoring
(type → insert → type) covers the primary flow, and "insert at caret inside an
existing text part" can be a later refinement.

**Verify:** type "Up to " → insert → type " hours" reproduces the mockup value
end to end, and ✕ (2.3) still removes the inserted pill cleanly.

### 2.5 — Toolbar + row gutter

Add the toolbar above the table with three row-creating controls. If this feels
large, split into **2.5a** (toolbar shell + wire existing actions) and **2.5b**
(Add section).

| Toolbar button | Wires to                                                                       |
| -------------- | ------------------------------------------------------------------------------ |
| Add row        | Step 1 `ADD_ROW` — inserts directly below the active row (appends if none)      |
| Add section    | new `ADD_SECTION` → inserts a `SECTION_HEADER` row below the active row, full-width |
| Duplicate      | Step 1 `DUPLICATE_ROW` — inserts the copy directly below its source (active) row |

- Track an **`activeRowId`** — the insert target — set on row/cell click or focus
  and shown with a left accent. This is UI state, not part of the persisted `rows`
  array. The three toolbar actions insert directly below it (append if none) and
  scroll the new row into view.
- Each row's **gutter** carries a persistent, muted pair: a `⠿` drag-handle
  (reorder, wired in Step 4) and an `✕` delete (Step 1 `DELETE_ROW`). Both stay
  visible at rest — no hover-only controls and no floating row menu.
- A separate full-width **"Add row"** at the bottom of the table always appends to
  the end (also `ADD_ROW`).
- Insert field is **not** a toolbar button — it lives in the value cell (sub-step
  2.4), acting on the row being edited.
- `ADD_SECTION` creates a `SECTION_HEADER` row per `data-model.md` §7 (`id`, `key`,
  `rowType: "SECTION_HEADER"`, `label`, `hideWhenEmpty`) — no `valueParts`. Render
  it as a distinct full-width header row, not a two-cell data row.
- The 200-row cap still gates Add row, Duplicate, and Add section (disabled at the
  limit **and** refused in the reducer).

**Verify:** each toolbar action inserts below the active row (the bottom "Add row"
appends); the gutter delete removes its own row; section rows render distinctly
from data rows; the cap still blocks all three row-creating actions.

---

## Reducer actions added in Step 2

| Action              | Payload                   | Effect                                                          |
| ------------------- | ------------------------- | --------------------------------------------------------------- |
| `SET_VALUE_TEXT`\*  | `{ id, partIndex, text }` | Update one TEXT part (\*extends Step 1's index-0-only version). |
| `REMOVE_VALUE_PART` | `{ id, partIndex }`       | Remove a part, then merge adjacent TEXT parts; keep ≥1 TEXT.    |
| `INSERT_VALUE_PART` | `{ id, part }`            | Append a part, then ensure a trailing empty TEXT part.          |
| `ADD_SECTION`       | —                         | Insert a `SECTION_HEADER` row below the active row (no-op at cap). |

Guardrails unchanged from Step 1: reducer stays pure; `id`/`key` minted in a
helper, not in the reducer; cap enforced inside every row-creating action.

---

## Explicitly out of scope (later steps)

- **Choosing which field a pill represents** (searchable picker, native Shopify
  fields, fetched metafield definitions) → **Step 3**. Step 2 pills are placeholders.
- Drag-and-drop reorder + keyboard nav → **Step 4**.
- Clipboard multi-cell paste → **Step 5**.
- Undo/redo, WYSIWYG storefront styling, viewport toggle, and wiring **Save**
  (server-side 200-row + `shopId` re-check) → **Step 6**. Step 2 is still local
  React state only — nothing persists.
- Mid-text caret-splitting on insert — deferred refinement (see 2.4).

## File placement (unchanged from Step 1)

- Pure helpers + `MAX_TEMPLATE_ROWS` stay in `app/utils/` (e.g. `template-rows.ts`);
  add `createSectionRow()` and the value-part normalize/merge helper here.
- Segment renderer, pill component, and toolbar are co-located with the editor
  component rendered by `app/routes/app.templates_.$id.tsx`; promote to
  `app/components/` only when a second route needs them (`code-standards.md`).
- Polaris web components (`<s-...>`) + design tokens; no hardcoded hex; pill and
  toolbar CSS scoped tightly to their component files.

## Done when

1. Sub-steps 2.1–2.5 each pass their verify check.
2. A value can be authored, edited, have pills removed, and have a placeholder
   pill inserted — all in local state, all reflected immediately.
3. The toolbar's three buttons insert below the active row (the bottom "Add row"
   appends), each row's gutter pairs a drag-handle with a delete, section rows
   render distinctly; the 200 cap holds across Add row / Duplicate / Add section.
4. `200` is still only the single shared constant — no stray literal.
5. `npm run build` passes and ESLint is clean.
6. `progress-tracker.md` updated to mark Step 2 complete and point at Step 3.

## Open questions to resolve during build

- Pill label format for each part type — confirm `Metafield · <key>` and
  `Field · <field>`, and how a placeholder pill (no chosen field yet) is labelled
  before Step 3 fills it in.
- Empty-value rule: `hideWhenEmpty` interaction when a value has only an empty
  TEXT part — confirm this is purely a storefront concern (Step 6) and not
  enforced in the editor.
