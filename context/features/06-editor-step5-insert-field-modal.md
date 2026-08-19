# Editor Step 5 — "Insert field" modal shell + caret save/restore

## Goal in one sentence

Add an **Insert field** toolbar button — disabled until a value cell has an active
caret — that opens a focus-trapped **modal** with **Insert** (primary) / **Cancel**
(secondary) where **Esc / outside-click = Cancel**; the editor **saves the caret**
before the modal opens and **restores it on Insert**, dropping a complete pill at
that saved caret via the Step 4.4 caret-aware insert action (`INSERT_VALUE_PART_AT`),
while **Cancel inserts nothing** — with **no field data inside the modal yet**.

## Why this is now

Step 4 made the value surface own the caret (one `contenteditable`, a linear caret
model, keyboard-deletable tokens, `INSERT_VALUE_PART_AT` for caret-aware
insert/split). The pick-then-insert decision (2026-06-15) put the field picker
**entirely outside** that surface, so the editor's only remaining duty before the
picker can drop pills is to **bridge the outside-the-surface modal to the
inside-the-surface caret**: save where the caret is, open a modal, and on Insert
put a pill back exactly there. That bridge — the toolbar button's enabled gate, the
modal mechanics (focus trap, Esc, outside-click), and caret save/restore — is the
whole job of Step 5. We build it with **no field data** so a bug here is a
modal/caret bug, never a data bug. Steps 6–9 then pour the native-fields list,
search, metafield fetch, and live data into the now-proven shell.

This **supersedes** the old Step 5 ("popover anchored to a placeholder pill"): the
placeholder pill is retired (pick-then-insert), and the container is a **modal, not
a popover** — room for the growing search + native-fields + live-metafields content
and **zero positioning math** inside the embedded-admin iframe (popover anchoring is
fiddly there — see [[polaris-web-component-gotchas]]).

## Foundation carried from Step 4

- The value cell is **one `contenteditable` host** per row
  ([SpecTableEditor.tsx](app/routes/app.templates_.$id/SpecTableEditor.tsx),
  `ValueCell`). It is uncontrolled while typing and re-renders from `valueParts`
  only on structural edits, restoring the caret from a **linear index**
  (`pendingCaretRef` → `setCaretLinear`).
- **The caret-aware insert action already exists.** `INSERT_VALUE_PART_AT { id,
  partIndex, offset, part }` in [rows.ts](app/utils/rows.ts) splits the TEXT at
  `(partIndex, offset)` and drops `part` between the halves (or splices when the
  target is atomic / past the end), then `normalizeValueParts`. **Step 5 reuses it
  verbatim** — `part` is now a `SHOPIFY_FIELD` / `METAFIELD` pill instead of a
  `LINE_BREAK`. No new reducer action is needed.
- **The DOM↔reducer coordinate bridge already exists.**
  [valueParts.ts](app/utils/valueParts.ts) gives `linearToPartOffset(parts,
  linear)` (linear caret → `(partIndex, offset)` for the insert) and
  `partOffsetToLinear`; [valueDom.ts](app/utils/valueDom.ts) gives
  `getSelectionLinearRange(host)` (DOM selection → linear) and `setCaretLinear(host,
  linear)` (linear → DOM caret). Step 5 reads the caret with these and inserts with
  the same plain-number coordinate — **no raw DOM `Range` is persisted**, so the
  saved caret cannot go stale across a re-render.
- **Pills are always rendered complete** (`tokenLabels` in `valueDom.ts`:
  `Field · <field>` / `Metafield · <key>`). There is **no `· choose field` state**.
  The Step 5 Insert therefore drops a *complete* pill, never a placeholder.
- The Step 4 dev scaffolding (`devSampleRows`, `useCapturedTokenColor`) stays as-is;
  Step 5 does not touch persistence (still local React state only).

## What changes (architecture)

Two new pieces, both **outside** the `contenteditable` so the Step 4 caret model is
untouched:

1. **A lifted "active value caret" in the editor container.** Each `ValueCell`
   reports its caret to `SpecTableEditor` via a new `onCaretChange(rowId, linear |
   null)` callback (fired on focus + `selectionchange` with a collapsed/non-collapsed
   linear position, and on blur). The container keeps it in a ref and mirrors its
   presence into state that drives the toolbar button's `disabled`. This is the
   minimum state that has to leave a single `ValueCell` — the surface still owns its
   own caret; the container only needs to know **which row + where** for the insert.

2. **One `<s-modal>` at the editor level** (not per row), opened by the toolbar
   button, that inserts into whichever row holds the saved caret.

The insert path on **Insert**:
`savedCaret = { rowId, linear }` → look up that row's current `valueParts` →
`{ partIndex, offset } = linearToPartOffset(valueParts, linear)` →
`dispatch(INSERT_VALUE_PART_AT { id: rowId, partIndex, offset, part: <stub pill> })`
→ that `ValueCell` re-renders, places the caret at `linear + 1` (after the new pill)
and **refocuses its host**. **Cancel / Esc / outside-click** run no insert at all.

---

## Sub-steps (build and verify one at a time)

Chain: **toolbar button + enabled gate → modal shell mechanics → caret
save/restore + Insert wiring → dead-code cleanup**. Each builds clean
(`npm run typecheck` + `lint` + `build` + `test:run`) and is verifiable on its own.

### 5.1 — "Insert field" toolbar button + active-caret gate

Add an **Insert field** `<s-button>` to the existing toolbar `<s-stack
direction="inline">` (alongside Add row / Add section / Duplicate), gated on whether
a value cell has an active caret.

- `ValueCell` gains an `onCaretChange(rowId, linear | null)` prop. It calls it:
  - on `focus` with the current linear caret (via `getSelectionLinearRange`);
  - inside the existing `selectionchange` listener (it already runs
    `updateCaretOnState` while focused — extend that handler to also report the
    linear `from`);
  - on `blur` with `null`.
- `SpecTableEditor` stores the latest report in a ref (`activeCaretRef`) **and** a
  boolean state (`hasActiveCaret`) used only for the button's `disabled` attribute.
- The button is `disabled` when `hasActiveCaret` is false (no value cell focused —
  e.g. the merchant is in a Label/Section field, or nothing is focused).

**Verify:** the button is disabled on load; clicking into a value cell enables it;
clicking into a Label field or blurring disables it again. No modal yet.

### 5.2 — Modal shell (focus trap, Insert/Cancel, Esc, outside-click)

Render one `<s-modal id="insert-field-modal" heading="Insert field">` in the
container with a **placeholder body** (no field list — e.g. an `s-paragraph` "Field
picker coming in the next step") and footer actions via the documented slots:

```tsx
<s-button slot="primary-action" variant="primary"
  commandFor="insert-field-modal" command="--hide" onClick={handleInsert}>
  Insert
</s-button>
<s-button slot="secondary-actions"
  commandFor="insert-field-modal" command="--hide">
  Cancel
</s-button>
```

- **Open** the modal from the toolbar button (5.1) with `commandFor="insert-field-modal"
  command="--show"`. `<s-modal>` provides the **focus trap, Esc-to-dismiss, and
  outside-click-to-dismiss natively** — we do **not** hand-build a focus trap or any
  positioning math (the big reason this is a modal, not a popover).
- **Cancel / Esc / outside-click** all resolve to the platform `--hide` and run
  **no** insert — Insert only happens via the primary button's `onClick`.

> **Build-risk flag (verify in-browser first).** This CDN build has a track record
> of Polaris web components not matching the docs (`<s-button-group>` has no slot,
> `<s-chip removable>` paints no ✕, color tokens absent from light DOM — see
> [[polaris-web-component-gotchas]]). Before building on `<s-modal>`, **confirm in
> the real embedded app** that: it opens/closes via `commandFor`/`command`, the
> `primary-action` / `secondary-actions` slots render the buttons, and the focus
> trap + Esc + outside-click work. If any fails, fall back in this order: (a) the
> App Bridge **Modal API** (`shopify.modal`, available per the polaris-app-home API
> list) for imperative show/hide; (b) a hand-built focus-trapped dialog as a last
> resort. Pick the fallback **before** wiring 5.3 onto it.

**Verify:** the toolbar button opens the modal; focus is trapped inside it; Esc,
the Cancel button, the close affordance, and an outside click all close it; nothing
is inserted by any of these.

### 5.3 — Caret save/restore + Insert wiring

Wire the primary **Insert** button to drop a pill at the saved caret.

- **Save:** snapshot `savedCaretRef.current = activeCaretRef.current` when the modal
  opens (the latest reported `{ rowId, linear }`). Because it is a plain
  `(rowId, linear)` pair — not a DOM `Range` — it survives focus moving into the
  modal and any re-render.
- **The focus-vs-disabled race (the one real subtlety).** Activating the toolbar
  button moves focus out of the cell, which fires `blur → onCaretChange(null)`. Two
  rules keep this safe: (1) **do not let `blur` clear `savedCaretRef`** — `blur`
  only nulls the *live* caret used for the next gate; the snapshot is taken at open;
  (2) **prevent the toolbar button from stealing focus** with `preventDefault()` on
  its `pointerdown`, the canonical rich-text-toolbar technique, so the cell stays
  focused and the `disabled` state cannot flip and swallow the click. Verify this
  works on `<s-button>`; if the web component eats the handler, the snapshot-on-open
  rule alone (1) is still correct — restore covers the rest.
- **Restore + insert (on Insert `onClick`):**
  1. `const { partIndex, offset } = linearToPartOffset(row.valueParts,
     savedCaret.linear)` for the saved row (look the row up by `rowId` in current
     state).
  2. `dispatch({ type: "INSERT_VALUE_PART_AT", id: rowId, partIndex, offset, part })`.
  3. After the re-render, the target `ValueCell` must place the caret at
     `savedCaret.linear + 1` and **refocus its host**. Reuse the existing
     `pendingCaretRef` mechanism: the container hands the target row a pending linear
     caret (e.g. a `pendingCaretByRow` ref keyed by `rowId`, read once by the
     `ValueCell` reconcile effect, which then calls `host.focus()` +
     `setCaretLinear`). Keep the contract identical to Step 4's internal inserts so
     there is one caret-restore path, not two.
- **What `part` is in Step 5 (verification scaffolding).** There is no picker yet,
  so Insert drops a **fixed, complete stub pill** — e.g.
  `{ type: "SHOPIFY_FIELD", field: "vendor" }` (renders `Field · vendor`). It must be
  a *complete* pill (never the retired placeholder) so the always-complete invariant
  holds. **Step 6 replaces the stub** with the field the merchant actually selected.
  Mark it clearly as Step-5 scaffolding (a named const + comment), like
  `devSampleRows`.
- **Insert enabled in Step 5.** With nothing to select, Insert is **enabled** so the
  wiring is testable. Note for Steps 6+: Insert becomes **disabled-until-a-field-is-
  selected** once the list exists.

**Verify:** caret in "Up to `[Metafield · battery_life]` hours" between "Up to " and
the token → Insert field → modal → Insert → a `Field · vendor` pill lands **exactly
at the caret**, the text splits correctly, the caret sits **after** the new pill,
and focus is back in the cell; pressing Insert mid-word splits the TEXT run; **Cancel
/ Esc / outside-click insert nothing**; the `Rows: N / 200` counter never changes
(pills are not rows).

### 5.4 — Remove the now-dead Step 2 insert path

Pick-then-insert is now real, so the append-only insert and the placeholder helper
are dead. Step 4 deferred their removal to "Step 5's modal" — do it here.

- Remove `INSERT_VALUE_PART` (the action variant in the `RowsAction` union **and**
  its `case` in `rowsReducer`) from [rows.ts](app/utils/rows.ts) — nothing dispatches
  it anymore (only `INSERT_VALUE_PART_AT` is used).
- Remove `placeholderMetafieldPart()` from [rows.ts](app/utils/rows.ts) — the
  `· choose field` state it fed is retired.
- Remove their unit tests from [rows.test.ts](app/utils/rows.test.ts); keep full
  coverage of `INSERT_VALUE_PART_AT` and the rest.
- Confirm no other reference survives (`progress-tracker.md` / feature docs are prose
  references and stay).

**Verify:** `npm run typecheck` + `lint` + `build` + `test:run` pass with the two
symbols gone; the editor still inserts pills (via the modal) and line breaks (via
Enter).

---

## Reducer actions

**None added, none changed.** Step 5 reuses `INSERT_VALUE_PART_AT` (Step 4.4) for
the pill insert and `SET_VALUE_TEXT` / `REMOVE_VALUE_PART` are untouched. 5.4
**removes** the dead `INSERT_VALUE_PART`.

| Interaction                          | Reducer action                              |
| ------------------------------------ | ------------------------------------------- |
| Insert a picked pill at saved caret  | `INSERT_VALUE_PART_AT` — existing (Step 4.4)|
| Insert a hard line break at caret    | `INSERT_VALUE_PART_AT` — existing (Step 4.4)|
| Edit / delete TEXT and tokens        | `SET_VALUE_TEXT` / `REMOVE_VALUE_PART` — existing |
| ~~Append a placeholder pill~~        | `INSERT_VALUE_PART` — **removed in 5.4**    |

## What Step 5 does *not* own (boundary with Step 6+)

Step 5 nails the **shell and the caret bridge** only:

- **Field data** — the native-fields list, search/filter, metafield fetch, and live
  metafield section → **Steps 6–9**. The Step 5 modal body is a placeholder; the
  Insert pill is a fixed stub.
- **Insert-disabled-until-selection** and selection state inside the modal → **Step
  6** (Step 5 keeps Insert enabled to test the wiring).
- **Click-a-pill-to-reopen-the-modal-pre-filled → Update** (edit an existing pill) →
  **Step 6**. Step 5 is **create/Insert only**; one modal will serve both later, but
  the Update branch is not built here.
- **Persistence / Save / server re-validation** → the post-editor slice. Step 5 is
  still local React state only.

## Explicitly out of scope (later steps)

- Native Shopify fields / search / metafield fetch / live data / edit-pill Update →
  **Steps 6–9**.
- Drag reorder + keyboard reorder → **Steps 10–11** (the gutter `⠿` stays inert).
- Clipboard paste → **Steps 12–13**.
- Any inline rich formatting, links, or widgets — unchanged from Step 4's exclusions.

## File placement (unchanged conventions)

- The toolbar button, the `onCaretChange` lifting, the `<s-modal>`, and the
  Insert/Cancel wiring live in
  [SpecTableEditor.tsx](app/routes/app.templates_.$id/SpecTableEditor.tsx)
  (co-located with the route; promote to `app/components/` only if a second route
  needs it — `code-standards.md`).
- Any modal-specific styling goes in
  [SpecTableEditor.module.css](app/routes/app.templates_.$id/SpecTableEditor.module.css),
  scoped, **Polaris tokens / `currentColor` only, no hardcoded hex** — but prefer
  `<s-modal>`'s built-in chrome and add CSS only where Polaris cannot express it.
- No new `app/utils/` helper is needed — the caret math (`linearToPartOffset`,
  `getSelectionLinearRange`, `setCaretLinear`) already exists and is unit-tested.
  Reducer changes (the 5.4 removal) stay in [rows.ts](app/utils/rows.ts), covered by
  [rows.test.ts](app/utils/rows.test.ts).

## Open questions

- **`<s-modal>` viability in this CDN build** (5.2 build-risk flag): does
  `commandFor`/`command`, the action slots, and the native focus trap + Esc +
  outside-click all work here? If not, which fallback — App Bridge `shopify.modal`,
  or a hand-built focus-trapped dialog? Resolve **before** 5.3.
- **Focus-vs-disabled race** (5.3): does `preventDefault()` on the toolbar button's
  `pointerdown` keep the `<s-button>` from stealing focus from the contenteditable
  in this build? If the web component swallows it, confirm the snapshot-on-open +
  refocus-on-insert path is sufficient on its own (it should be).
- **Where exactly to snapshot the caret** — at modal `--show` time vs. continuously
  in `activeCaretRef` with a snapshot copy on open. Recommended: continuous ref +
  snapshot on open, so no open-time interception is required.

## Done when

1. Sub-steps 5.1–5.4 each pass their verify check.
2. An **Insert field** toolbar button exists and is **disabled unless a value cell
   has an active caret**; it opens a **focus-trapped modal** with **Insert**
   (primary) / **Cancel** (secondary); **Esc / outside-click / Cancel** dismiss it
   and insert nothing.
3. The editor **saves the caret before the modal opens and restores it on Insert**;
   Insert drops a **complete** pill at the saved caret via `INSERT_VALUE_PART_AT`,
   the caret lands **after** the new pill, and focus returns to the cell. The saved
   caret is a plain `(rowId, linear)` pair, never a stale DOM `Range`.
4. The modal has **no field data** yet (placeholder body + fixed stub pill); the
   stub is clearly marked Step-5 scaffolding for Step 6 to replace.
5. **No new reducer action**; `INSERT_VALUE_PART_AT` is reused, and the dead
   `INSERT_VALUE_PART` action + `placeholderMetafieldPart()` helper (and their tests)
   are **removed**.
6. **No hardcoded hex**; the Step 4 caret model, token rendering, line breaks, and
   keyboard delete are **unregressed**; the `Rows: N / 200` counter is unaffected by
   inserts.
7. Accessibility holds: the toolbar button is keyboard-reachable and labelled, the
   modal traps focus and is dismissible by keyboard, and focus returns to a sensible
   place (the value cell at the caret) on Insert.
8. `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:run` all
   pass; **browser-verified end to end** in the real embedded app (the Step 5 flow
   above, no console errors).
9. `progress-tracker.md` updated to mark Step 5 complete and point at Step 6 (native
   Shopify fields in the modal).
