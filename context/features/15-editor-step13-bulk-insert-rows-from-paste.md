# Editor Step 13 — Bulk-insert rows from paste

## Goal in one sentence

Turn the **already-parsed clipboard grid** from Step 12 into real editor rows — a new
pure **`PASTE_ROWS`** reducer action that maps **first pasted column → Label, remaining
columns → a `TEXT`/`LINE_BREAK` Value**, appended to the table, **with the 200-row cap
enforced on paste (truncate at the limit and tell the merchant what was dropped)** via
the shared `MAX_TEMPLATE_ROWS` — replacing Step 12's `console.info` with a dispatch +
a merchant-facing summary toast, and **reusing the Step 9.5 key-finalization path**
(`reconcileRowKeys` / `finalizeRowKeys`) so pasted rows are keyed exactly like
manually-added rows — **with no new dependency, no schema change, no change to the
in-cell value paste (Step 4), and no change to the Step 9.5 persistence contract** (a
pasted-then-saved row rides the existing Save → Postgres → metaobject path unchanged).

## Why this is now (and why it's a separate step)

- **Bulk paste is a committed MVP feature and Step 12 deliberately landed only its
  first half.** `admin-screen-plan.md` (§ Tab 1 — Content): *"Paste a multi-cell table
  copied from any website, Excel, or Google Sheets to bulk-create rows — first pasted
  column → label, remaining columns → manual TEXT value; 200-row cap enforced on
  paste."* `prd.md` (In scope) and the 2026-06-11 "Clipboard paste is an MVP feature"
  decision say the same. Per `ai-workflow-rules.md` ("split if a change cannot be
  verified end to end quickly") this was split into **Step 12 = parse** (clipboard →
  `string[][]`, log only, proven in isolation) and **Step 13 = insert** (grid → rows +
  cap). Step 12 is **explicitly an internal verification increment that must not ship to
  a merchant on its own** ("a bulk paste is silent to a merchant until Step 13 … it
  ships together with Step 13's insertion + summary UI"). **Step 13 is the half that
  makes the gesture visible — they ship together.**
- **The risky half is already de-risked.** Step 12's quote-aware TSV parser +
  `DOMParser` glue + `normalizeGrid` are unit-tested (22 cases) and browser-verified
  against real Excel / Google Sheets / web-`<table>` / plain-TSV / quoted-multiline
  clipboards, producing the correct 2-D grid every time. So Step 13's only new risk is
  the **insertion + cap + column→value mapping** logic — pure, testable, and built on a
  proven grid, exactly as the Step 10→11 split layered new behavior on a proven base.
- **The persistence + keying contract Step 13 needs is already settled.** Step 9.5
  proved Save → Postgres → metaobject → read-back and made key finalization
  **server-authoritative**: `saveTemplateForShop` runs `reconcileRowKeys(incoming,
  persisted)` — a row whose id is **not** already persisted is provisional and gets its
  key slugged from its label by `finalizeRowKeys`. Pasted rows are brand-new ids, so
  **they finalize through that exact path with zero new keying code** — satisfying the
  roadmap's standing instruction: *"Reuse the Step 9.5 key-finalization path for pasted
  rows — don't fork a second keying path."*

A bug in Step 13 is therefore a **grid→row mapping / cap-truncation** bug — not a
clipboard-parsing bug (Step 12, frozen), not a keying or persistence bug (Step 9.5,
frozen), and not an editor-interaction bug (the value surface, smart-pill modal, and
reorder are all frozen). The reducer gains **one** action; everything else is reuse.

## Foundation carried from Steps 1–12

- **The grid is already correct and normalized.** `parseClipboardTable({ htmlGrid,
  text })` returns a trimmed `string[][]` with wholly-empty rows dropped, ragged rows
  **un-padded**, and **embedded `\n` preserved inside a cell** (from a `<br>` in an HTML
  cell or a quoted multiline TSV cell) — Step 12 preserved that newline *specifically*
  so Step 13 can model it as a `LINE_BREAK`. Step 13 consumes this grid as-is; it does
  **not** re-parse the clipboard.
- **The capture hook already exists and is verified.** `handleContainerPaste` (the
  `onPaste` on the editor's wrapper `<div>`) already null-guards `clipboardData`, skips
  an in-cell value paste via `event.defaultPrevented` (Step 4 calls `preventDefault()`
  unconditionally), skips an in-tree editable target (Label / Section `<s-text-field>`,
  the modal `<s-search-field>`), and calls the parser. **Step 13 replaces only the
  terminal `console.info(...)` with build → cap → dispatch → toast** — the guards and
  the capture point are unchanged (confirmed live in Step 12 against a real web table).
- **The reducer is a pure array of actions; the rows array is the single source of
  truth; ids are minted by the caller.** `PASTE_ROWS` follows the same discipline as
  every prior action: the editor mints a fresh `id` per pasted row (via `newRowId()`,
  the lone non-deterministic input, kept out of the reducer just like `insertActive`
  does for `ADD_ROW`), and the reducer stays pure/deterministic. New rows seed a
  **provisional** key (`uniqueKey(FALLBACK_KEY_BASE, …)` → `row`, `row_2`, …) **exactly
  like `ADD_ROW`** — never a label-derived slug (that is the Save boundary's job, below).
- **`MAX_TEMPLATE_ROWS` is the single shared cap, enforced at three layers.** The UI
  disables the add buttons (UX), the reducer refuses to grow past it (the gate), and
  `saveTemplateForShop` re-checks it server-side. Step 13 adds the paste-time variant:
  **truncate to the room remaining and tell the merchant** — never a literal, always the
  shared constant. `app-store-review-checklist.md` already lists this as a gate:
  *"200-row cap — enforced in the reducer and server-side (`MAX_TEMPLATE_ROWS`); paste
  truncates and tells the merchant what was dropped."*
- **Key finalization is server-authoritative — pasted rows ride it untouched.**
  `reconcileRowKeys(incoming, persisted)` finalizes any row whose id is not yet
  persisted; a pasted row "RAM" carrying a provisional `row_3` key is slugged to `ram`
  at the first Save and never re-derived thereafter (`data-model.md` §12). Step 13 writes
  **no** keying logic of its own.
- **Pure / DOM-glue split is the convention; the grid→row mapping is pure.** Like
  `valueParts.ts` / `clipboardTable.ts`, the new grid→`{label, valueParts}` mapper is
  pure (`string[][]` → row shapes) and Node-unit-tested. No DOM is touched in Step 13 —
  the only DOM read (`DOMParser`) already happened upstream in Step 12.
- **Polaris-only, tokens not hex, a11y non-negotiable.** Step 13 adds **no new visible
  chrome** — no button, no banner, no CSS. The only merchant-facing surface is an
  **App Bridge toast** summarizing the paste (the same `shopify.toast.show(...)` already
  used for the Step 9.5 "Saved" confirmation). The pasted rows then render through the
  existing row UI and the existing contextual Save bar (they make the editor dirty).

## What changes (architecture)

One new reducer action, one new pure mapper (+ tests), and one swap inside the existing
paste handler. **No reducer action removed or changed, no new dependency, no schema
change, no CSS, no change to the value surface / modal / reorder / persistence.**

### 1. Pure grid→row mapper — `app/utils/clipboardTable.ts` (Node-unit-tested)

Add one pure function to the existing Step 12 parser module (its header already
forward-references this: *"the shape Step 13's `PASTE_ROWS` will map onto rows"*),
keeping all "what a pasted clipboard becomes" logic in one cohesive, Node-tested place:

- **`gridToPastedRows(grid: string[][]): Array<{ label: string; valueParts: ValuePart[] }>`**
  — map each grid row independently to the editor's row-value contract:
  - **First column → `label`** (the cell string as-is; already trimmed by `normalizeGrid`).
  - **Remaining columns → the value**, built as a flat `ValuePart[]`: each remaining cell
    contributes its text, and **a column boundary *and* an embedded `\n` both become a
    `LINE_BREAK`** — one uniform rule (split every remaining cell on `\n`, concatenate the
    resulting lines, and place a `LINE_BREAK` between consecutive lines). This reuses the
    existing `LINE_BREAK` part (`data-model.md` §7 "Multiline values") and renders
    identically in the editor and storefront. Run the result through `normalizeValueParts`
    so the parts are canonical and a **value with no remaining columns collapses to one
    empty `TEXT`** (a label-only row stays an editable data row — the same shape
    `createDataRow` seeds).
  - It returns `{ label, valueParts }` **only** — **no `id`, no `key`, no `rowType`**: the
    id is minted by the component and the provisional key is seeded by the reducer, so the
    mapper stays free of non-determinism and of the keying policy. It type-imports
    `ValuePart` and uses `normalizeValueParts` from `rows.ts` (one direction, no cycle —
    `rowsSerialize.ts` already imports the same).

*Rejected: building full `EditorRow`s (with id/key) in the mapper. That would push
`newRowId()` (non-deterministic) and the provisional-key policy into a "pure" helper,
breaking the established reducer-purity / caller-mints-id contract and forking a second
keying path. The mapper produces content; the reducer owns identity + keys.*

### 2. New reducer action — `app/utils/rows.ts`

- **`PASTE_ROWS { rows: Array<{ id: string; label: string; valueParts: ValuePart[] }> }`**
  — append `n` pasted data rows in order, **cap-truncating defensively** and **seeding a
  provisional key per row** exactly like `ADD_ROW`:
  - **Cap is the gate (truncate, don't refuse).** Compute `room = MAX_TEMPLATE_ROWS -
    rows.length`; take only `action.rows.slice(0, room)`. If `room <= 0` or there is
    nothing to add, **return the same array reference** (so an at-cap paste never flips
    the dirty flag) — mirroring `MOVE_ROW`'s same-reference no-op. (The component computes
    the dropped-count for the toast; the reducer's truncation is the belt-and-suspenders
    gate, consistent with "the disabled buttons are UX; the reducer is the gate.")
  - **Provisional keys, accumulated.** Seed each new row's key with
    `uniqueKey(FALLBACK_KEY_BASE, taken)`, adding each minted key to `taken` as it goes,
    so the batch's keys are mutually unique and unique against existing rows (`row`,
    `row_2`, …). **No `slugifyKey` here** — finalization from the label happens at Save.
  - **All pasted rows are `DATA` rows** (`rowType: "DATA"`, `hideWhenEmpty: true`), built
    from the action's `id` + `label` + `normalizeValueParts(valueParts)`. A grid cannot
    express a `SECTION_HEADER`, so paste never creates one.
  - Pure: fresh array, source untouched; new rows appended at the end.

### 3. Wire capture → dispatch + cap + summary — `SpecTableEditor.tsx`

Replace the terminal `console.info(...)` in the existing `handleContainerPaste` with the
real insertion (the guards above it — `clipboardData` null-guard, `defaultPrevented`,
in-tree editable target — are **unchanged**):

- **Ignore a non-table paste.** After parsing, require an actual multi-cell table:
  ignore an **empty or degenerate 1×1 grid** (`cellCount(grid) <= 1`, i.e. not (>1 row
  **or** >1 column)) — a lone single value is not a bulk gesture. (Export the existing
  private `cellCount` from `clipboardTable.ts` for reuse, or inline the equivalent
  check.) This mirrors Step 12's own "usable grid = >1 cell" notion and still admits a
  single-**column**, many-**row** paste (a column of labels → label-only rows).
- **Handle the paste.** Call `event.preventDefault()` (we are now consuming this paste),
  then: `room = MAX_TEMPLATE_ROWS - rows.length`; if `room <= 0`, toast that the row
  limit is reached and add nothing; else `built = gridToPastedRows(grid)`, `toInsert =
  built.slice(0, room)`, `dropped = built.length - toInsert.length`, mint an id per row
  (`newRowId()`), `dispatch({ type: "PASTE_ROWS", rows: … })`.
- **Summary toast.** `shopify.toast.show` — `Added N rows` when all fit, or
  `Added N rows — M over the 200-row limit weren't added` when truncated (singular/plural
  handled; the `200` reads `MAX_TEMPLATE_ROWS`, never a literal). The insert makes the
  editor dirty, so the existing contextual Save bar appears automatically.
- **(Optional) focus affordance.** Set the last inserted row active and scroll it into
  view (reuse `scrollTargetRef`/`setActiveRowId`, as `insertActive` does) so the merchant
  sees where the block landed. Nice-to-have, not load-bearing.

**No new Save wiring.** The merchant reviews the pasted rows, then clicks the existing
**Save**: `reconcileRowKeys` finalizes each pasted row's provisional key from its label,
`saveTemplateForShop` re-checks the 200-cap server-side, and the metaobject sync +
read-back run unchanged. Step 13 touches none of `route.tsx`, `template.server.ts`,
`rowsSerialize.ts`, or `metaobjects.server.ts`.

## Sub-steps (build and verify one at a time)

Chain: **pure mapper + `PASTE_ROWS` (Node-tested + builds) → wire capture + cap + toast
(browser-verified against real clipboards)**. Each builds clean (`npm run typecheck` +
`lint` + `format:check` + `test:run` + `build`).

### 13.1 — Pure mapper + `PASTE_ROWS` reducer action (+ tests)

Add `gridToPastedRows` to `clipboardTable.ts` and the `PASTE_ROWS` case to `rows.ts`. No
component change yet.

**Verify (unit tests, Node):**
- `gridToPastedRows` (in `clipboardTable.test.ts`) — a 2-column row → `{label: col0,
  valueParts: [TEXT col1]}`; a 1-column row → label + a single empty `TEXT` (no value);
  a 3+-column row → remaining columns joined with `LINE_BREAK` between them; an **embedded
  `\n`** in a cell → a `LINE_BREAK` (same as a column boundary); a ragged grid maps
  per-row without padding; the returned `valueParts` are normalized (≥1 TEXT, no adjacent
  TEXT); pure (no mutation, fresh arrays).
- `PASTE_ROWS` (in `rows.test.ts`) — appends `n` rows in order, all `rowType: "DATA"`
  with `hideWhenEmpty: true`; provisional keys are unique within the batch and against
  existing rows (`row`, `row_2`, …) and are **not** label slugs; the action's `id`s are
  preserved; **cap truncation** keeps only `MAX_TEMPLATE_ROWS - length` rows; an at-cap
  (`room <= 0`) or empty paste returns the **same array reference** (no dirty); the source
  array is not mutated.

All gates pass; the new cases lift the suite above its 200-test Step 12 baseline.

### 13.2 — Wire the capture → dispatch + cap summary (browser)

Swap the `console.info` for the build → cap → `dispatch(PASTE_ROWS)` → toast path; add
the `cellCount(grid) <= 1` ignore-guard and `event.preventDefault()`.

**Verify (browser, real embedded app):** copy a multi-cell range from **Excel**, from
**Google Sheets**, and from a **web page `<table>`**, click into the editor (not into a
value/label field), and paste — each appends the **correct rows** (first column → Label,
remaining → Value; a multiline/`<br>` cell becomes a `LINE_BREAK` line), the **`Rows: N /
200` counter updates**, the **contextual Save bar appears**, and a **summary toast**
shows the count. Then **Save** → the rows persist (confirm in Neon): each pasted row's
provisional `row_N` key is **finalized to its label slug** (e.g. `RAM` → `ram`) and
unique, the `valueParts` (incl. any `LINE_BREAK`) are intact, and a second Save keeps
those keys (not re-derived). **Cap:** paste a table that would exceed 200 rows → exactly
`200 - current` rows are added and the toast names how many were dropped; the counter
stops at 200; the server save is **not** rejected (the payload is already ≤ 200). Confirm
**no regressions:** the in-cell value paste (Step 4) still inserts plain text at the
caret with newlines→spaces (the container handler skips it via `defaultPrevented`); a
paste into a Label / Section field or the modal search field behaves natively (skipped);
a **single-cell** paste into the container adds **nothing** (the 1×1 ignore-guard); a
paste with empty clipboard data does not throw. **No console errors** (admin top frame —
watch for the App Bridge view-transition / `InvalidStateError` family seen in Step 7).

## Reducer actions

| Interaction                                          | Mechanism                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Paste a multi-cell table → bulk-create rows          | **new `PASTE_ROWS`** — col 1 → Label, remaining cols → `TEXT`/`LINE_BREAK` Value, appended |
| Enforce the 200-row cap on paste                     | `PASTE_ROWS` truncates to `MAX_TEMPLATE_ROWS`; the handler toasts the dropped count |
| Seed provisional keys for pasted rows                | `PASTE_ROWS` (`uniqueKey(FALLBACK_KEY_BASE, …)`, like `ADD_ROW`)          |
| Finalize pasted row keys at Save                     | unchanged — `reconcileRowKeys` / `finalizeRowKeys` (Step 9.5, server-side) |
| In-cell single-value paste (Step 4)                  | unchanged — `SET_VALUE_TEXT` at the caret (frozen, skipped via `defaultPrevented`) |
| Persist / sync pasted rows                           | unchanged — the Step 9.5 Save → Postgres → metaobject path                |

**One new reducer action (`PASTE_ROWS`); no existing action changed.**

## Locked decisions

- **No new dependency, no schema change, no CSS.** The mapper is pure utils; the action
  is a reducer case; the only UI is an existing App Bridge toast. `package.json`,
  `schema.prisma`, and `data-model.md`'s row contract are unchanged (Step 13 only
  produces existing part types — `TEXT` and `LINE_BREAK`).
- **Column → value mapping: first column is the Label; every remaining column is a line
  of the Value, with a `LINE_BREAK` at each column boundary *and* each embedded `\n`.**
  One uniform rule, faithful and reversible-by-eye (the merchant can merge lines
  post-paste, WYSIWYG). A 1-column row → label + empty value; an embedded `\n` (preserved
  by Step 12) → `LINE_BREAK`, per `data-model.md` §7 "Multiline values." *(The dominant
  real case is a 2-column spec table → label + a single `TEXT` value; the multi-column
  join is the edge — see Open questions.)*
- **Rejected: joining remaining columns with a space/tab into one `TEXT`.** That silently
  concatenates distinct columns into a run-on value (lossy) and is inconsistent with the
  `\n`→`LINE_BREAK` rule. Stacking columns as lines preserves structure and reuses the
  existing multiline model.
- **Cap = truncate-at-200 + tell the merchant** (not reject-the-whole-paste). Mandated by
  `app-store-review-checklist.md` ("paste truncates and tells the merchant what was
  dropped") and the Step 13 roadmap note. The reducer truncates defensively; the handler
  computes and toasts the dropped count; `saveTemplateForShop` is the server backstop.
- **All pasted rows are `DATA` rows.** A grid cannot express a section header.
- **Provisional keys now, finalized at Save — no second keying path.** `PASTE_ROWS` seeds
  `row`/`row_2` like `ADD_ROW`; `reconcileRowKeys` slugs them from the label at the first
  Save and never re-derives them (`data-model.md` §12). The roadmap's "don't fork a second
  keying path" is honored by reuse, not reimplementation.
- **Ignore a degenerate single-cell (1×1) paste in the bulk handler.** Only a grid with
  >1 cell (more than one row **or** column) is a bulk gesture; a lone value is not. A
  single-column, multi-row paste **is** admitted (a column of labels).
- **Capture stays the container `onPaste`** (no document-level listener). The Step 12
  capture point is verified and sufficient; Step 13 only changes what runs at the end of
  it. The handler **`preventDefault`s** once it decides to insert (it is consuming the
  paste), after the skip-guards.
- **Append at the end of the table.** A bulk paste lands as one contiguous block at the
  bottom (predictable; the summary toast + optional scroll-into-view point the merchant at
  it), rather than splicing below the active row.
- **Insert + summary is merchant-visible — Steps 12 + 13 ship together.** Step 12 alone is
  silent (parse + log); Step 13 makes the gesture real. This step closes the committed
  bulk-paste MVP feature.

## What Step 13 does *not* own (boundary with later slices)

- **The clipboard parse** (Step 12) — `parseClipboardTable` / `extractHtmlTableGrid` /
  `normalizeGrid` are frozen; Step 13 consumes their grid and does not re-parse.
- **The in-cell value paste, caret model, smart-pill modal, and reorder** — all frozen.
  The container handler still skips an in-cell paste (`defaultPrevented`) and in-tree
  field edits.
- **The Save / Postgres / metaobject boundary and key finalization** (Step 9.5) — frozen.
  Step 13 produces rows that flow through it unchanged; it adds no Save wiring and no
  keying code.
- **CSV import/export** — post-MVP (`feature-roadmap.md`), a separate feature with its own
  `key`-matched column mapping; not clipboard paste.
- **Undo/redo** — deferred from the numbered editor steps (a later styling/persistence
  slice); a paste is a normal reducer transition, so it composes with undo/redo when that
  lands, but Step 13 does not build it.

## File placement (per `code-standards.md` File Organization)

- Pure grid→row mapper → **`app/utils/clipboardTable.ts`** (+ tests in
  **`app/utils/clipboardTable.test.ts`**). *(Alternative considered: `rows.ts`, which
  owns value-part construction. Chosen `clipboardTable.ts` to keep all paste-specific pure
  logic cohesive in the module its header already forward-references; the `ValuePart` +
  `normalizeValueParts` import is a thin one-directional dependency, mirroring
  `rowsSerialize.ts`.)*
- New `PASTE_ROWS` reducer action → **`app/utils/rows.ts`** (+ tests in
  **`app/utils/rows.test.ts`**).
- Capture → dispatch + cap + toast → **`app/routes/app.templates_.$id/SpecTableEditor.tsx`**
  (swap inside the existing `handleContainerPaste`).
- `app/utils/rowsSerialize.ts`, `app/models/template.server.ts`,
  `app/routes/app.templates_.$id/route.tsx`, `app/shopify/metaobjects.server.ts` — **no
  change** (the Step 9.5 persistence + keying path is reused, not modified).
- `package.json`, `prisma/schema.prisma`, `SpecTableEditor.module.css` — **no change**.

## Open questions

- **Multi-column (3+) join — confirm against a real paste.** The locked rule stacks each
  remaining column as a `LINE_BREAK`-separated line. The dominant real case is 2 columns
  (label + one value), so this is rarely exercised; confirm in 13.2 with a genuine
  3-column source that the line-per-column result reads acceptably, and decide whether a
  wholly-**empty** middle column should yield a blank line (faithful, current behavior) or
  be collapsed. Low-risk either way — the merchant edits post-paste.
- **Append vs. insert-below-active.** Locked to **append** for predictability of a bulk
  gesture. Re-evaluate only if merchant feedback wants the block to land at the cursor;
  the reducer would take an `afterId` like the other row-creating actions, but appending
  avoids splicing a large block into the middle of an existing table.
- **Toast vs. a richer summary.** Locked to a single App Bridge toast (matches existing
  usage). If a paste commonly truncates, a dismissible banner naming the exact dropped
  count might read better — defer unless verification shows the toast is missed.
- **Document-level capture.** Still deferred (Step 12's open question): a document
  listener would catch a bulk paste even when no editor element is focused. The container
  `onPaste` is sufficient for the verified flow; revisit only if a real need surfaces.

## Done when

1. Sub-steps 13.1–13.2 each pass their verify check.
2. A new pure **`gridToPastedRows`** in `app/utils/clipboardTable.ts` maps a Step-12 grid
   to `{ label, valueParts }[]` (col 1 → Label; remaining cols + embedded `\n` →
   `TEXT`/`LINE_BREAK` Value; 1-column → label + empty value; ragged per-row), and a new
   **`PASTE_ROWS`** reducer action appends those as `DATA` rows with provisional keys,
   **truncating at `MAX_TEMPLATE_ROWS`** and returning the same reference when nothing
   fits. Both are **unit-tested** (new cases lift the suite above the 200-test baseline).
3. Pasting a multi-cell table from **Excel, Google Sheets, and a web `<table>`** into the
   editor **appends the correct rows** (right Label/Value mapping; multiline cells →
   `LINE_BREAK`), updates `Rows: N / 200`, raises the contextual Save bar, and shows a
   **summary toast**; a paste over the cap **truncates to 200 and names the dropped
   count**; a single-cell paste adds nothing.
4. **Save persists the pasted rows** through the unchanged Step 9.5 path — each provisional
   key is **finalized to its label slug** (verified in Neon), unique, and not re-derived on
   a second Save; the server re-checks the 200-cap; the metaobject round-trip still verifies.
5. The **in-cell value paste (Step 4) is unregressed**, and pasting into a Label / Section
   field or the modal search field behaves natively — the bulk handler **skips** all of
   these (`defaultPrevented` + in-tree-target guard).
6. **One reducer action added (`PASTE_ROWS`); no existing action changed.**
   `rowsSerialize.ts`, `template.server.ts`, `route.tsx`, `metaobjects.server.ts`,
   `schema.prisma`, and `package.json` are untouched. **No hardcoded hex / no new CSS;**
   **no console errors** (admin console included — the Step 12 `console.info` is removed).
7. `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and
   `npm run test:run` all pass; **browser-verified** in the real embedded app against real
   Excel / Sheets / web-table pastes (incl. the cap-truncation path).
8. `progress-tracker.md` updated to mark **Step 13 complete** (closing the clipboard-paste
   feature, Steps 12–13) and to record the locked column→value / cap-UX decisions; point
   at the next slice — **product assignment + the Theme App Extension storefront renderer**
   (incl. the deployable Liquid readback deferred from Step 9.5.4).
