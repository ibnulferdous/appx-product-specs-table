# Value textarea — Step 4: prune the edit-pill wiring

**Status: ✅ Shipped 2026-08-07.** Part 4 of 6 (features 109–114). Small, mechanical
removal of the now-unreachable click-a-pill-to-edit path across the live component
wiring. No pure-module deletions yet (that's Step 113) — this step only cuts the
dead props and handlers so Step 113's module deletes are clean.

## Shipped (2026-08-07)

Removed the entire edit-a-pill-in-place path; the Insert-field modal is now
**create-only**. Changes:

- **ValueCell.tsx** — dropped the unused `onEditPart` prop from the signature/type
  and the now-unused `ValuePart` import.
- **EditorRowItem.tsx** — dropped the `onEditPart` prop (type + destructure +
  pass-through to `ValueCell`), its memo-comment mention, and the `ValuePart`
  import.
- **RowGrid.tsx** — dropped the `handleEditPart` destructure and the
  `onEditPart={handleEditPart}` pass-through.
- **useRowEngine.ts** — deleted `editTarget` state, `handleEditPart`, the
  `editTarget` branch of `handleCommit` (the `SET_VALUE_PART` dispatch +
  `partOffsetToLinear` caret set), the `setEditTarget` resets in
  `handleOpenInsertField` / `handleCommit` / `handleCancelInsertField`, and the
  `editTarget` / `handleEditPart` return-object fields. Dropped the now-unused
  `partOffsetToLinear`, `partToSelection`, and `EditTarget` imports.
- **InsertFieldModal.tsx** — dropped the `editTarget` destructure; collapsed the
  modal heading to `"Insert field"` and the primary button to `"Insert"` (were
  ternaries on edit vs create mode).
- **editorShared.ts** (beyond the plan's listed files) — removed
  `partToSelection` and the `EditTarget` interface: both existed *only* to serve
  the edit-pill path being deleted here, and no later step covers them, so they
  are swept now to avoid orphaned exports. Also dropped the `findNativeField` and
  `ValuePart` imports they alone used.

`SET_VALUE_PART` reducer action + its direct reducer tests are **kept** (removed in
Step 113); nothing dispatches it anymore (grep-confirmed).

**Static gates (all green):** `npm run typecheck`, `npm run lint`,
`npm run test:run` (1468/1468), `npm run build`.

## Why now

After Step 111 the value surface is a `<textarea>` with no pill elements, so a pill
can never be clicked. The whole "edit an existing pill in place" feature is
therefore dead code, currently kept only so Step 111 stayed a pure surface swap:

- `ValueCell`'s `onEditPart` prop never fires.
- `useRowEngine`'s `editTarget` state, `handleEditPart`, the `editTarget` branch of
  `handleCommit`, and the `SET_VALUE_PART` dispatch are unreachable.
- The `onEditPart` prop is threaded through
  `RowGrid → EditorRowItem → ValueCell` for nothing.

The merchant now edits a token by editing its text directly in the textarea, so
there is no replacement UI to build — just removal.

## Goal in one sentence

Delete the edit-pill path — `onEditPart` (and its prop threading), `editTarget`
state + handler, and the `editTarget`/`SET_VALUE_PART` branch of `handleCommit` —
leaving the Insert-field modal as **create-only**.

## What to remove (live wiring only)

- **ValueCell.tsx** — the `onEditPart` prop from the component signature and its
  type; any residual click handler referencing it (should already be gone after
  Step 111 — confirm).
- **EditorRowItem.tsx** — the `onEditPart` prop + its pass-through to `ValueCell`.
- **RowGrid.tsx** — the `onEditPart` prop + `handleEditPart` pass-through.
- **useRowEngine.ts** —
  - `editTarget` state and its setter, `handleEditPart`.
  - The `if (editTarget) { … }` branch of `handleCommit` (the `SET_VALUE_PART`
    dispatch + `partOffsetToLinear` caret set) — leaving only the create branch
    from Step 111.
  - The `editTarget` resets in `handleCancelInsertField` / end of `handleCommit`.
  - Any modal title/primary-action copy that switched on edit vs create mode →
    collapse to the create wording ("Insert field").
- Remove the `ValuePart` import from files that only needed it for the
  `onEditPart` signature (leave it where `SET_VALUE_PARTS` / parsing still use it).

## Keep

- `SET_VALUE_PART` **reducer action itself** stays until Step 113 (grep-gated
  removal alongside the other dead actions) — this step only stops *dispatching*
  it. Removing the action here would split the reducer cleanup across two steps.
- The whole create-mode Insert-field flow (selection state, native/metafield
  pickers, search, `handleCommit` create branch).

## Verify

1. `npm run typecheck` passes (all `onEditPart` references gone — the compiler is
   the primary gate for this mechanical cut).
2. In the editor: the Insert-field modal still opens from the toolbar, still
   inserts a token at the caret (create mode). There is no pill to click, and no
   console error from a missing handler.
3. `npm run lint`, `npm run test:run`, `npm run build` pass (update/remove any test
   that asserted on `onEditPart` / edit-mode modal behavior).

## Files

- **Touched:** `ValueCell.tsx`, `EditorRowItem.tsx`, `RowGrid.tsx`,
  `useRowEngine.ts` (+ any edit-mode modal copy). Tests referencing edit mode
  updated.

## Boundaries (not this step)

- Deleting `valueParts.ts` / `valueDom.ts` and the dead reducer actions
  (`SET_VALUE_TEXT`, `REMOVE_VALUE_PART`, `INSERT_VALUE_PART_AT`, `SET_VALUE_PART`,
  `spaceAfter`) — Step 113.
- Docs / sign-off — Step 114.

## Done when

1. No `onEditPart` / `editTarget` / edit-mode branch remains in the editor wiring;
   the Insert-field modal is create-only.
2. `SET_VALUE_PART` is no longer dispatched anywhere (grep clean) but still exists
   in the reducer (removed in Step 113).
3. `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build` pass.
