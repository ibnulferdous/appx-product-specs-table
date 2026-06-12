# Editor Step 1 — Reducer + static row render + add/delete/duplicate + 200-row cap

## Goal in one sentence

Stand up the editor's "brain" — a single `rows` array driven by a `useReducer`
— and render it as a plain static two-column table that can add, delete, and
duplicate rows, with a live `Rows: N / 200` counter that blocks at the cap.

## Why this is first

Every later feature is _more actions on this same array_:

- Step 2 (segmented value cell + pills) edits `valueParts` inside a row.
- Step 4 (`@dnd-kit` reorder) is "move item in the array."
- Step 5 (clipboard paste) is "bulk `ADD_ROW`."
- Step 6 (undo/redo) is snapshotting this reducer's state.

If the rows array is the one source of truth from day one, the rest snaps on
without re-plumbing state. This matches the locked editor standard: _"Keep the
rows array in a single source of truth (a reducer over `rows`); array index is
display order. Reordering, insert, delete, and duplicate are array operations
on that one source."_.

---

## In scope

1. A `rows` reducer holding the full editor array (the single source of truth).
2. Reducer actions for this step only: `ADD_ROW`, `DELETE_ROW`, `DUPLICATE_ROW`,
   plus a label/value text edit action so the static cells are editable.
3. Static render of `rows` as a simple two-column table: **Label** | **Value**.
   Plain text only — one text input per cell. No pills, no drag handles, no
   field picker (those are steps 2–4).
4. A shared `MAX_TEMPLATE_ROWS` constant (= 200) and a `Rows: N / 200` counter
   that disables "Add row" / "Duplicate" at the cap.
5. New rows get a stable `id` and a derived `key` per the row contract.

## Explicitly out of scope (do not build yet)

- Segmented `valueParts` editing, pills → **Step 2**.
- Field picker / native Shopify fields / metafield definitions → **Step 3**.
- Drag-and-drop reorder + keyboard nav (`@dnd-kit`) → **Step 4**.
- Clipboard multi-cell paste → **Step 5**.
- Undo/redo, WYSIWYG storefront styling, viewport toggle → **Step 6**.
- **Saving / persistence.** Step 1 is local React state only — nothing hits the
  loader, action, Postgres, or the metaobject. The server-side 200-row re-check
  and `shopId` re-check land with the Save wiring in Step 6 (the action in
  `app/routes/app.templates_.$id.tsx` still returns `{ ok: false }` for non-`new`
  POSTs until then — see `progress-tracker.md` deferred conditions).

---

## Data shape (must match `data-model.md`)

Rows in state use the **exact** authoring row shape from `data-model.md` §6–7 —
do not invent a simpler shape and migrate later. Even though Step 1 only edits
plain text, the value is stored as `valueParts` so Step 2 extends it in place
instead of reshaping it.

A new **data** row created in Step 1:

```jsonc
{
  "id": "<crypto.randomUUID()>", // client-generated, stable, never reused
  "key": "screen_size", // derived from label, unique within template
  "rowType": "DATA",
  "label": "", // edited in the Label cell
  "valueParts": [
    // Step 1 keeps exactly one TEXT part
    { "type": "TEXT", "text": "" }, // edited in the Value cell
  ],
  "hideWhenEmpty": true,
}
```

Row-contract rules to honor now (so later steps don't break):

- `id` comes from `crypto.randomUUID()` at creation, never changes, never reused.
- `key` is slugified from the label **at creation only**. Editing the label
  afterward must **not** rewrite the key (`data-model.md` → Row ID and key rules).
- `key` should be unique within the template — on duplicate, suffix it
  (`screen_size` → `screen_size_2`) rather than colliding.
- `DUPLICATE_ROW` copies the row's content but mints a **fresh `id`** and a fresh
  unique `key`. Never reuse the source row's `id`.

Section-header rows (`rowType: "SECTION_HEADER"`) exist in the data model, but
adding them is in **Step 2**. Step 1's render must not
crash on a section row if one is present, but it does not need to create them.

---

## Reducer design

One reducer, `rows` as the only state it owns. Suggested actions for this step:

| Action           | Payload         | Effect                                                         |
| ---------------- | --------------- | -------------------------------------------------------------- |
| `ADD_ROW`        | —               | Append a blank data row (no-op if at cap).                     |
| `DUPLICATE_ROW`  | `{ id }`        | Insert a copy below source; fresh `id` + `key` (no-op at cap). |
| `DELETE_ROW`     | `{ id }`        | Remove the row with that `id`.                                 |
| `SET_LABEL`      | `{ id, label }` | Update label only (key untouched after creation).              |
| `SET_VALUE_TEXT` | `{ id, text }`  | Update `valueParts[0].text` of the single TEXT part.           |

Guardrails:

- The cap is enforced **inside** the reducer for `ADD_ROW` / `DUPLICATE_ROW`
  (return state unchanged at the limit) so no action path can exceed it — the
  disabled buttons are UX, the reducer is the real gate. Server re-validation is
  Step 6.
- Keep reducer logic pure; generate `id`/`key` in the action creator or a helper
  so the reducer stays deterministic and testable.

---

## UI for this step

- A two-column table: **Label** | **Value**, one editable text input per cell,
  plus a per-row delete and duplicate control. Nothing fancier.
- A `Rows: N / 200` counter near the table.
- "Add row" button; disable Add and Duplicate when `rows.length >= MAX_TEMPLATE_ROWS`,
  and surface a brief at-the-limit message so the merchant understands why.
- Keep edits in local state only — no save bar behavior wired yet.

---

## Done when

1. Add, delete, and duplicate all work and immediately reflect in the table.
2. Duplicated rows have a new `id` and a new unique `key`; editing a label never
   changes that row's `key`.
3. The counter is accurate and the editor cannot exceed `MAX_TEMPLATE_ROWS` from
   any path (buttons disabled **and** reducer refuses).
4. `200` appears only as the single shared constant — grep finds no stray literal.
5. `shopify app build` passes and ESLint is clean.
6. `progress-tracker.md` updated to mark Step 1 complete and point at Step 2.

## Open questions to resolve during build

- Empty-label rows still need a non-colliding `key` at creation — decide the
  placeholder scheme (e.g. `row_<n>` or a short random suffix) and keep it stable.
