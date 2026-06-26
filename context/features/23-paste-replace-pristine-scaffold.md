# Paste refinement Step 3 — Replace the pristine scaffold on a new template

## Goal in one sentence

On a **brand-new, never-saved** template still showing the **untouched starter scaffold** (the
seeded 1 `SECTION_HEADER` + 5 blank `DATA` rows, nothing typed), the **first bulk paste replaces
the entire scaffold** — the empty section header included — leaving **only** the pasted rows; any
other state (an edited new template, or any saved template) keeps the normal insert-after-active
behavior from file 22.

## Why this is now (and why it's the third of three)

Create-on-first-save (feature 19) opens a new template on a synthetic scaffold — 1 section + 5
blank rows — so the merchant has somewhere to type. But the dominant "build a template by pasting
a spec table" flow then leaves those 5 blank rows **above** the pasted block (and a stray empty
"SECTION TITLE"), which the merchant must hand-delete (seen in the reported screenshot: blank
Label/Value rows sitting above the pasted Processor/Chipset/… rows).

The merchant chose (2026-06-26): on a new template's untouched scaffold, the first paste should
**replace blanks + drop the section** — the result is just the pasted rows. This is the third and
last paste refinement; it builds on file 21 (a paste is only "bulk" when the clipboard is a real
table) and file 22 (otherwise insert after the active row).

## Foundation already in place

- **The scaffold has one construction path.** `createInitialRows()` (`rows.ts`) folds the reducer
  from `[]` — one `ADD_SECTION` then `INITIAL_DATA_ROW_COUNT` (5) `ADD_ROW` — so the pristine shape
  is exactly: `rows[0]` a `SECTION_HEADER` (empty label), followed by 5 `DATA` rows (empty label,
  `valueParts` = a single empty `TEXT`, `hideWhenEmpty: true`), with provisional keys `section`,
  `row`, `row_2` … `row_5`. There is one shape to recognize.
- **"New" is already a first-class, detectable state.** The loader returns `{ id: "new", … }` for
  `/app/templates/new` (`route.tsx`); after the first Save the URL flips to the real cuid and the
  engine **remounts** (keyed on `${id}:${nonce}`), reseeding from persisted rows. So `isNew` is a
  stable per-mount fact, and a saved template can never be mistaken for new.
- **`PASTE_ROWS` already owns the build + keys + cap.** This step adds a *replace* mode to it
  (base the new array on `[]` instead of the existing rows) rather than forking a second action —
  the provisional-key seeding and cap-truncation stay in exactly one place.

## What changes (architecture)

One pure scaffold-detector, a `replace` mode on `PASTE_ROWS`, an `isNew` flag threaded into the
engine, and the gate in `pasteGrid`. **No new dependency, no schema change, no CSS, and no change
to `gridToPastedRows`, the toast, or the Step 9.5 persistence contract.**

### 1. Pure scaffold detector — `app/utils/rows.ts`

- **`isPristineScaffold(rows: EditorRow[]): boolean`** — true **iff** `rows` deep-matches the
  freshly-seeded scaffold:
  - `rows.length === INITIAL_DATA_ROW_COUNT + 1`;
  - `rows[0].rowType === "SECTION_HEADER"` with `label === ""`;
  - every other row is `rowType === "DATA"` with `label === ""` and `valueParts` exactly
    `[{ type: "TEXT", text: "" }]` (a single empty TEXT).
  - It does **not** inspect keys (provisional keys are an implementation detail) — only the
    merchant-visible blank shape. Pure, framework-free, Node-unit-tested. Used by the engine,
    gated by `isNew` (below), so a coincidentally-all-blank **saved** template is never wiped.

*Rationale: a structural blank check (not a dirty flag) is the precise signal. The dirty baseline
also covers name/status, so a rename-then-paste on a new template would read "dirty" yet the rows
are still the blank scaffold the merchant clearly wants replaced; the structural check captures
exactly the rows state.*

### 2. `replace` mode on `PASTE_ROWS` — `app/utils/rows.ts`

- Action shape (extends file 22): **`PASTE_ROWS { rows; afterId?; replace?: boolean }`**.
- When `replace` is true: base the result on **`[]`** (ignore existing rows and `afterId`), seed
  provisional keys from the empty set (`row`, `row_2`, …), cap-truncate to
  `room = MAX_TEMPLATE_ROWS` (a full table fits from empty), and return the pasted rows **as the
  whole array**. When `action.rows.length === 0`, return the **same reference** (never wipe the
  scaffold to nothing — replace only when there is something to replace it with). The non-replace
  path (file 22: append / splice-after-`afterId`) is unchanged.
- This reuses the existing row-building loop verbatim — only the **base array** (`[]` vs `rows`)
  and the **room** differ — so there is no second keying or cap path.

*Rejected: a separate `REPLACE_ROWS` action. It would duplicate the provisional-key seeding + cap
loop; a `replace` flag on `PASTE_ROWS` keeps "build pasted rows" in one case.*

### 3. Thread `isNew` + gate the replace — `route.tsx` + `useRowEngine.ts`

- `TemplateOverview` (`route.tsx`) computes `isNew = template.id === "new"` and passes it into
  `useRowEngine({ …, isNew })`. The engine stores it (a stable per-mount prop, like `initialRows`).
- In `pasteGrid`, before dispatching: **`const replace = isNew && isPristineScaffold(rowsRef.current)`**.
  - `replace` → dispatch `{ type: "PASTE_ROWS", rows: pasted, replace: true }` and compute the
    handler's `room`/dropped-count against `MAX_TEMPLATE_ROWS` (matching the reducer's base-`[]`);
  - else → the file-22 dispatch (`afterId: activeRowIdRef.current`, `room = MAX - rows.length`).
  - The last pasted row still becomes active + scrolls into view; the summary toast is unchanged.
- After a replace, the editor is dirty → the Save bar appears → the first Save runs
  create-on-first-save → redirect to the cuid → remount with `isNew = false`. So **replace can only
  ever fire on the very first paste of an untouched new template**; a second paste (now non-pristine
  and/or saved) inserts normally.

## Sub-steps (build and verify one at a time)

### 23.1 — `isPristineScaffold` + `replace` mode (+ unit tests)

Add the detector and the `replace` branch to the reducer. No component change yet.

**Verify (unit):**
- `isPristineScaffold` (in `rows.test.ts`) — **true** for `createInitialRows()`; **false** after
  any single mutation: a typed label (data or section), a non-empty value, an added/deleted row, a
  reorder, or a wrong leading row type / wrong length.
- `PASTE_ROWS` `replace: true` — replaces the whole array with the pasted rows; provisional keys
  seeded from empty (`row`, `row_2`, …) and unique; cap-truncates to `MAX_TEMPLATE_ROWS`; an empty
  `rows` returns the **same reference** (no wipe); source not mutated. The non-replace cases
  (file 22) still pass unchanged.

### 23.2 — `isNew` thread + `pasteGrid` gate (browser)

Pass `isNew` from the route; gate the replace in `pasteGrid`.

**Verify (browser, real embedded app):**
- Open `/app/templates/new` (1 section + 5 blank rows, `Rows: 6 / 200`, **no** Save bar). Paste a
  multi-cell table → the scaffold (section + 5 blanks) is **gone**; only the pasted rows remain;
  the counter equals the pasted count; the Save bar appears; the toast shows the count. **Save** →
  create-on-first-save persists exactly the pasted rows (keys finalized from labels), redirects to
  the cuid, Save bar closes.
- Open `/app/templates/new`, **edit one scaffold row first** (type a label), then paste → the
  scaffold is **kept** and the block inserts per file 22 (after the active row / appended); no
  replace.
- On a **saved** template (real cuid), paste a table → **never** replaces; inserts per file 22.
- Open `/app/templates/new` and paste a **single value** (not a table) → file 21 says it is not a
  bulk paste; the scaffold is untouched (no replace, no rows added).
- **No console errors.**

## Reducer actions

| Interaction | Mechanism |
| --- | --- |
| First paste on an untouched **new** template | **changed** `PASTE_ROWS { replace: true }` — replaces the scaffold (section + blanks) with the pasted rows |
| Paste on an edited new template / any saved template | unchanged — `PASTE_ROWS { afterId }` (file 22) |
| Detect the untouched scaffold | **new** pure `isPristineScaffold(rows)`, gated by `isNew` |

**No new reducer action; `PASTE_ROWS` gains one optional field (`replace`).**

## Locked decisions

- **Replace blanks AND drop the empty section** on the first paste of an untouched new template —
  the result is just the pasted rows. (Merchant decision, 2026-06-26.)
- **Gate on `isNew` AND a structural `isPristineScaffold` check** — both must hold, so an
  all-blank *saved* template is never wiped, and an *edited* new template is preserved. The
  structural check (not the dirty flag) is the precise rows signal.
- **`replace` is a mode on `PASTE_ROWS`, not a new action** — one place owns row-building, keys,
  and the cap.
- **Replace fires at most once per new template** — the first Save flips `isNew` to false on
  remount, and the first paste makes the scaffold non-pristine, so subsequent pastes insert
  normally (file 22).
- **Empty paste never wipes the scaffold** — `replace` with no rows is a same-reference no-op.

## What Step 3 does *not* own (boundary)

- **Bulk-vs-in-cell intent** (file 21) and **insert-after-active** (file 22) — frozen; this step
  only chooses *replace vs. insert* once a bulk table paste has been decided.
- **The scaffold itself** (feature 19, `createInitialRows`) — unchanged; this step only detects and
  replaces it on paste.
- **Persistence / keying** (Step 9.5) — unchanged; replaced rows are brand-new ids and finalize
  through `reconcileRowKeys` at the create-on-first-save exactly like any pasted/added row.

## File placement (per `code-standards.md`)

- `isPristineScaffold` + `replace` mode → **`app/utils/rows.ts`** (+ tests in **`rows.test.ts`**).
- `isNew` thread → **`app/routes/app.templates_.$id/route.tsx`** (`TemplateOverview`) +
  **`useRowEngine.ts`** (new arg + `pasteGrid` gate).
- `clipboardTable.ts`, `clipboardTableDom.ts`, `ValueCell.tsx`, `RowGrid.tsx`,
  `EditorRowItem.tsx`, `rowsSerialize.ts`, `template.server.ts`, `metaobjects.server.ts`,
  `schema.prisma`, the CSS — **no change**.

## Open questions

- **Other "effectively empty" new states.** Only the exact seeded scaffold is treated as pristine.
  If a merchant deletes some scaffold rows and then pastes, it is no longer pristine (insert, don't
  replace) — accepted as the safe default; revisit only if feedback wants a looser "all rows blank"
  rule.
- **Undo after a replace.** A replace is a single reducer transition, so it composes with undo/redo
  when that lands (deferred); until then, Discard (remount to persisted state — i.e. back to the
  scaffold, since nothing was saved) is the escape hatch. Confirm Discard restores the scaffold in
  23.2.

## Done when

1. Sub-steps 23.1–23.2 pass their checks.
2. `isPristineScaffold` precisely recognizes the untouched scaffold; `PASTE_ROWS { replace }`
   replaces the whole array with the pasted rows (cap-truncated, provisional keys, same-ref no-op
   on empty); both unit-tested (suite grows again).
3. In the embedded app: the first paste on an untouched **new** template replaces the section + 5
   blanks with only the pasted rows and Saves cleanly; an edited new template / a saved template is
   never replaced (insert per file 22); a single-value paste never replaces.
4. `npm run typecheck`, `lint`, `format:check`, `test:run`, and `build` all pass;
   **browser-verified**. No console errors.
5. **No new reducer action, dependency, schema, or CSS;** `gridToPastedRows`, the toast, and the
   Step 9.5 persistence path are untouched.
6. `progress-tracker.md` updated to mark the paste refinement (files 21–23) complete, recording the
   content-first / insert-after-active / replace-pristine-scaffold decisions; the clipboard-paste
   feature is re-confirmed closed with these refinements folded in.
