# Paste refinement Step 4 — Confirm before a paste crosses the 200-row cap

## Goal in one sentence

When a bulk table paste would push the template past the **200-row cap**, the editor **asks the
merchant to confirm first** — a modal that says how many rows fit vs. won't, with **Add the rows
that fit** / **Cancel** — instead of silently truncating; and the after-the-fact toast wording is
**simplified** so merchants understand what happened.

## Why this is now

Reported by the merchant (2026-06-27): pasting a 73-row block onto a template already holding 146
rows silently added 54 and dropped 19, surfacing only a terse toast — *"Added 54 rows — 19 over the
200-row limit weren't added."* Two problems:

1. **No agency.** The overflow is dropped before the merchant can react. They asked for a warning
   with a **continue/cancel** choice up front.
2. **Opaque copy.** *"19 over the 200-row limit weren't added"* is dense and tested poorly — many
   merchants don't parse it.

## What changes (architecture)

A confirmation modal in front of the over-cap branch of the existing paste handler, plus a copy
pass on the toast. **No reducer change, no new dependency, no schema change, no CSS, and no change
to `gridToPastedRows` or the Step 9.5 persistence contract.** The cap math (`room`, truncation,
`replace` vs. insert-after-active) is unchanged — only *when* it applies moves behind a confirm.

### 1. Split the paste handler — `useRowEngine.ts`

`pasteGrid` previously: compute `room` → build → truncate → dispatch → toast. It now splits into:

- **`pasteGrid(grid)`** — prepares the paste (compute `replace`/`room`, build, truncate, id-stamp)
  into a `PendingPaste` `{ pasted, dropped, replace, afterId }`. Then:
  - `room <= 0` (already full) → a plain toast (*"This template is full (200 rows). Delete a row
    before pasting."*) and return — there is nothing to "continue", so **no modal**.
  - `dropped > 0` (would cross the cap) → **stash `pendingPaste` + `shopify.modal.show`** the confirm
    modal; apply nothing yet.
  - otherwise (fits) → **`applyPaste(prepared)`** immediately, exactly as before.
- **`applyPaste(prepared)`** — the unchanged dispatch + last-row-active/scroll affordance + summary
  toast, factored out so the fits path and the post-confirm path share one body.
- **`handleConfirmPaste`** — `applyPaste(pendingPaste)` then clear/hide. Guards on `saving` (the
  modal portals outside the editor's inert freeze, like the Insert-field modal / SaveBar, so a save
  starting while it is open must not let Continue mutate rows mid-save).
- **`handleCancelPaste`** — hide + clear `pendingPaste`; inserts nothing.

The `PendingPaste` holds the **already-truncated, id-stamped** rows, so confirming applies *exactly*
what the modal previewed — the merchant can't be shown one count and get another.

### 2. The confirm modal — `PasteCapModal.tsx` (new)

A presentational editor-body `<s-modal id={PASTE_CAP_MODAL_ID}>`, rendered in `ContentTab` beside
`InsertFieldModal`, driven imperatively via the App Bridge Modal API (focus trap, Esc, and
outside-click dismiss all cancel and insert nothing). Body: a `tone="warning"` banner with the cap
plus a paragraph stating *"You're pasting {total} rows, but only {added} will fit. The remaining
{dropped} won't be added."* Primary **Add {added} rows** → `handleConfirmPaste`; secondary
**Cancel** → `handleCancelPaste`. All counts come from `engine.pendingPaste` (zeros while hidden,
but the modal is only ever shown with a paste staged).

### 3. Hide-on-save — `useRowEngine.ts`

The existing "hide the Insert-field modal when a save begins" effect also hides the paste modal and
clears `pendingPaste` (same reason: it portals outside the freeze). Defense in depth alongside the
`saving` guard in `handleConfirmPaste`.

### 4. Simplified toast copy — `useRowEngine.ts`

- Over-cap (now only reached after the merchant confirms): **`Added {n} rows — {m} rows didn't fit
  (200-row limit)`** (was *"{m} over the 200-row limit weren't added"*).
- Already-full: **`This template is full (200 rows). Delete a row before pasting.`** (was *"Row
  limit reached — no rows added (max 200)"*).
- Fits exactly: **`Added {n} rows`** — unchanged.

`200` stays the shared `MAX_TEMPLATE_ROWS` constant in every string.

## Reducer actions

| Interaction | Mechanism |
| --- | --- |
| Paste that fits within the cap | unchanged — `PASTE_ROWS` (file 22/23), applied immediately |
| Paste that would cross the cap | **new gate** — confirm modal first; on Continue, the same `PASTE_ROWS` with the truncated rows |
| Paste onto an already-full template | unchanged — no rows added; clearer toast |

**No new reducer action; no change to `PASTE_ROWS`.** The new state lives entirely in the engine
(`pendingPaste`) + a presentational modal.

## Locked decisions

- **Confirm before crossing, not after.** The merchant sees the fit/overflow split and chooses
  Continue or Cancel; cancel adds nothing. (Merchant decision, 2026-06-27.)
- **Confirm only when something is dropped.** A paste that fits inserts with no extra click; an
  already-full template can't add anything, so it gets a plain toast, not a modal.
- **The preview is the contract.** The rows are truncated + id-stamped *before* the modal opens and
  applied verbatim on Continue — what the merchant is shown is what they get.
- **Plain-language copy.** "didn't fit" / "is full" over "over the limit weren't added".
- **Mid-save safety.** The modal hides on save start and Continue is `saving`-guarded, so it can
  never mutate rows during an in-flight save (consistent with the other editor modals).

## What Step 4 does *not* own (boundary)

- **Bulk-vs-in-cell intent** (file 21), **insert-after-active** (file 22), **replace-pristine-
  scaffold** (file 23) — all frozen. This step only decides *whether to pause for confirmation*
  once a bulk paste is already chosen, and the cap is about to be crossed.
- **The cap value / enforcement** — `MAX_TEMPLATE_ROWS` and the reducer's defensive truncation are
  unchanged; this is purely the merchant-facing gate + copy in front of them.
- **Persistence / keying** (Step 9.5) — untouched.

## File placement (per `code-standards.md`)

- Handler split + `pendingPaste` + confirm/cancel + toast copy → **`useRowEngine.ts`**.
- New modal component → **`PasteCapModal.tsx`**, mounted in **`ContentTab.tsx`**.
- New modal id → **`editorShared.ts`** (`PASTE_CAP_MODAL_ID`).
- `rows.ts`, `gridToPastedRows`, `clipboardTable*.ts`, `ValueCell.tsx`, `RowGrid.tsx`,
  `EditorRowItem.tsx`, `template.server.ts`, `schema.prisma`, the CSS — **no change**.

## Testing

No new unit tests: the over-cap decision reuses the already-tested cap math, and the new code is
App-Bridge-imperative UI (modal show/hide, toast) with no extractable pure logic — covered by
browser verification per the testing strategy (suite stays at **281**). `PASTE_ROWS` and
`gridToPastedRows` keep their existing coverage.

## Open questions

- **Per-merchant "stop asking".** No "don't show this again" preference in MVP — the confirm fires
  on every over-cap paste. Revisit only if heavy-paste merchants ask for it.

## Done when

1. A bulk paste that would cross 200 opens the confirm modal showing the correct fit/overflow split;
   **Continue** adds exactly the previewed rows (after the active row / replacing the scaffold, per
   files 22–23) and **Cancel** / Esc / outside-click add nothing.
2. A paste that fits inserts with no modal; an already-full template shows the plain "full" toast.
3. The simplified toast wording shows after a confirmed over-cap paste.
4. `npm run typecheck`, `lint`, `format:check`, `test:run` (281), and `build` all pass.
5. No new reducer action, dependency, schema, or CSS; `gridToPastedRows` and the Step 9.5 path are
   untouched.
6. `progress-tracker.md` updated; **browser-verified** in the embedded app (2026-06-27): over-cap
   paste → "Some rows won't fit" modal with the correct 210 / 176 / 34 split, Cancel adds nothing,
   Add 176 rows inserts after the active row with the simplified "…34 rows didn't fit (200-row
   limit)" toast, an already-full template shows the plain "full" toast, and Discard restores the
   persisted rows.
