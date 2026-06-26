# Paste refinement Step 2 — Insert pasted rows after the selected row

## Goal in one sentence

A bulk paste inserts its block **directly after the active (selected) row** — the row last
focused by clicking its drag handle, section header, label, or value cell — and **appends to
the end only when no row is selected**, replacing Step 13's always-append behavior, via a new
`afterId` on the existing `PASTE_ROWS` action (mirroring `ADD_ROW`).

## Why this is now (and why it's the second of three)

Step 13 locked **append-at-end** for a bulk paste ("predictable; the toast + scroll point the
merchant at the block") and flagged the alternative as an open question: *"Append vs.
insert-below-active … the reducer would take an `afterId` like the other row-creating
actions."* The merchant chose **insert-after-the-selected-row** (2026-06-26): a paste should
land where they are working, not always at the bottom.

This is purely an **insertion-point** change. It composes on top of file 21 (content-first
intent): file 21 decides *whether* a paste bulk-inserts; this step decides *where* the block
lands. It does not touch the new-template scaffold (file 23).

## Foundation already in place

- **`activeRowId` already tracks every selection the merchant asked for.** Each row wrapper
  has `onFocusCapture={handleActivate}` (`EditorRowItem.tsx`), so focusing **any** control in
  the row — the ⠿ drag handle `<button>`, the delete `<button>`, the section/label `<input>`,
  or the value contenteditable — bubbles to `onActivate(row.id)` → `setActiveRowId`. So
  "selected by the drag handle OR a section header OR a label OR a value input" (the merchant's
  requirement) is **already** one value: `activeRowId`. No new selection model is needed.
- **`insertRowAfter` is the established splice helper** (`rows.ts`): `ADD_ROW` / `ADD_SECTION`
  already insert below the active row via `afterId`, falling back to append when `afterId` is
  null or its row is gone. `PASTE_ROWS` is the only row-creating action that ignores it. This
  step makes `PASTE_ROWS` consistent.
- **Provisional keys + cap-truncation + same-reference no-op are frozen** — only the *position*
  of the inserted block changes; key seeding (`uniqueKey(FALLBACK_KEY_BASE, …)` against all
  existing keys), the `MAX_TEMPLATE_ROWS` truncation, and the at-cap/empty same-reference
  no-op are carried unchanged.

## What changes (architecture)

One field on `PASTE_ROWS`, a batch-aware splice in its reducer case, and one ref in the engine
so the paste closure reads the live active id. **No new dependency, no schema change, no CSS,
and no change to `gridToPastedRows`, the toast, the cap, or the Step 9.5 persistence contract.**

### 1. `PASTE_ROWS` gains `afterId` — `app/utils/rows.ts`

- Action shape: **`PASTE_ROWS { rows: Array<{ id; label; valueParts }>; afterId?: string | null }`**.
- Reducer case: build the pasted `DATA` rows exactly as today (provisional keys accumulated
  into `taken`, cap-truncated to `room = MAX_TEMPLATE_ROWS - rows.length`, normalized
  `valueParts`), then **splice the whole batch in after the index of `afterId`** instead of
  pushing to the end:
  - resolve `index = afterId ? rows.findIndex((r) => r.id === afterId) : -1`;
  - `index === -1` (no/unknown active row) → **append** at the end (today's behavior, the
    fallback);
  - else `next.splice(index + 1, 0, ...pastedRows)` — the block lands immediately below the
    active row, pushing the rows after it down.
  - Keys are still seeded from `collectKeys(rows)` over **all** existing rows (position is
    irrelevant to uniqueness), so a mid-table insert cannot collide. The same-reference no-op
    when `room <= 0` or `action.rows.length === 0` is unchanged.

*A section header as the active row is a valid `afterId`: the pasted `DATA` rows land directly
under the section, which reads naturally (they become that section's rows). A grid still cannot
express a section, so paste never creates one.*

### 2. Pass the active id without a stale closure — `useRowEngine.ts`

- Add **`activeRowIdRef`** mirroring `activeRowId` (`const activeRowIdRef = useRef(activeRowId);
  activeRowIdRef.current = activeRowId;`), the same pattern `rowsRef` uses for the announcements
  and the paste room calc.
- In `pasteGrid` (the shared core from file 21), dispatch **`{ type: "PASTE_ROWS", rows: pasted,
  afterId: activeRowIdRef.current }`**. `pasteGrid` keeps its `[shopify]` deps — it reads the
  ref, not `activeRowId` directly, so it does not re-create on every selection change and the
  memoized rows are unaffected.
- The post-insert focus affordance is unchanged: set the **last** inserted row active + scroll
  it into view. With insert-after-active, the block sits below the previously-active row and the
  new active row is the block's last row, so a **second consecutive paste continues directly
  below the first block** — the natural "keep stacking" behavior.

## Sub-steps (build and verify one at a time)

### 22.1 — `afterId` on `PASTE_ROWS` (+ unit tests)

Add the field and the batch splice to the reducer. No component change yet.

**Verify (unit, `rows.test.ts`):**
- `afterId` pointing at a mid-table row inserts the batch **immediately after** it, preserving
  order, and pushes following rows down;
- `afterId` null **or** unknown id → **appends** at the end (fallback);
- `afterId` at a `SECTION_HEADER` inserts the `DATA` rows right after the section;
- provisional keys remain unique within the batch **and** against all existing rows after a
  mid-table splice (`row`, `row_2`, …), and are **not** label slugs;
- cap-truncation still keeps only `MAX_TEMPLATE_ROWS - length` rows when `afterId` is near the
  end; an at-cap / empty paste returns the **same array reference**;
- the source array is not mutated.

### 22.2 — Engine passes `activeRowIdRef`; browser-verify placement

Add `activeRowIdRef`; have `pasteGrid` pass `afterId`.

**Verify (browser, real embedded app):**
- Click a row's **drag handle**, then paste a table → the block lands **immediately after that
  row**; repeat selecting via a **section header**, a **label** input, and a **value** cell —
  all place the block after the selected row (they all set `activeRowId`).
- With **no row selected** (fresh focus state) → the block **appends** at the end.
- **Second paste** right after the first → it lands below the first block (the last pasted row
  became active).
- The Save bar appears; the summary toast still shows the count; the cap path still truncates
  + toasts the dropped count.
- **No console errors.**

## Reducer actions

| Interaction | Mechanism |
| --- | --- |
| Paste a table → insert after the selected row | **changed** `PASTE_ROWS` — now splices after `afterId` (the active row), appends when none |
| Select the target row | unchanged — `onFocusCapture` → `activeRowId` (handle / section / label / value all set it) |
| Provisional keys / cap / same-ref no-op | unchanged — carried from Step 13 |

**No new reducer action; `PASTE_ROWS` gains one optional field (`afterId`).**

## Locked decisions

- **Insert after the active row; append when none.** `activeRowId` is the single selection
  source (already set by handle / section / label / value focus). (Merchant decision,
  2026-06-26.)
- **Reuse the `ADD_ROW` `afterId` pattern** (and `insertRowAfter` semantics) rather than a new
  action or a separate "paste target" state — one consistent below-the-active-row rule for all
  row-creating actions.
- **Read the active id via a ref in `pasteGrid`** so the paste closure stays stable
  (memoization-safe), matching `rowsRef`.
- **Last inserted row becomes active + scrolls into view** — unchanged from Step 13; it now also
  gives consecutive pastes a sensible "stack below" position.
- **Scaffold handling stays out of scope** — a new template still has its 1 section + 5 blank
  rows; replacing them is file 23. (Until file 23 lands, a paste on a new template inserts after
  the active row — or appends — among the blanks.)

## What Step 2 does *not* own (boundary)

- **The bulk-vs-in-cell decision** (file 21) — frozen; this step runs only once a paste has been
  decided to be a bulk table.
- **The grid → row mapping, cap, toast, persistence/keying** — all unchanged.
- **New-template scaffold replace** — file 23.

## File placement (per `code-standards.md`)

- `afterId` field + batch splice → **`app/utils/rows.ts`** (+ tests in **`rows.test.ts`**).
- `activeRowIdRef` + `pasteGrid` dispatch → **`useRowEngine.ts`**.
- `clipboardTable.ts`, `clipboardTableDom.ts`, `ValueCell.tsx`, `RowGrid.tsx`,
  `EditorRowItem.tsx`, `rowsSerialize.ts`, `template.server.ts`, `route.tsx`,
  `metaobjects.server.ts`, `schema.prisma`, the CSS — **no change**.

## Open questions

- **Block vs. interleave at a mid-table insert.** The batch lands as one contiguous block after
  the active row (predictable). If a merchant wants pasted rows to interleave with existing rows
  by `key`, that is a CSV-import / merge concern (post-MVP), not clipboard paste — not built here.

## Done when

1. Sub-steps 22.1–22.2 pass their checks.
2. `PASTE_ROWS` accepts `afterId` and splices the batch after that row (appending when null /
   unknown), with keys, cap-truncation, and the same-reference no-op unchanged; covered by new
   unit tests (suite grows past 219).
3. In the embedded app, a paste lands **after the row selected by the handle / section / label /
   value**, appends when nothing is selected, and a second paste stacks below the first block.
4. `npm run typecheck`, `lint`, `format:check`, `test:run`, and `build` all pass;
   **browser-verified**. No console errors.
5. **No new reducer action, dependency, schema, or CSS;** `gridToPastedRows`, the toast, the cap,
   and the Step 9.5 persistence path are untouched.
6. `progress-tracker.md` updated to record Step 2 complete and the insert-after-active decision
   (flipping Step 13's "append (locked)" open question).
