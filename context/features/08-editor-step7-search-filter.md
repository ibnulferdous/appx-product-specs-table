# Editor Step 7 — Search / filter inside the modal

## Goal in one sentence

Add a **search box at the top of the Step 6 "Insert field" modal** that
**filters the native-field list as the merchant types** (case-insensitive,
matching the human label and the snake_case token), keeps the **filtered results
keyboard-navigable** and selectable exactly as before, shows an **empty state**
when nothing matches, and **resets to the full list on every open** — a **pure
UI layer over the existing list**, with **no reducer change, no new pill
behaviour, and no API calls**.

## Why this is now

Step 6 put real content in the proven modal shell: a static `<s-choice-list>` of
the thirteen native fields (`NATIVE_SHOPIFY_FIELDS`), single-select via
`selectedField`, with one modal serving create (**Insert**) and edit (**Update**).
Thirteen items fit on screen, but Steps 8–9 add the shop's **live metafield
definitions** below the native fields — a list that can run to dozens of entries
and is unscannable without filtering. Building search **now**, over the small
static list we fully control, isolates the search interaction (input → filter →
re-render → keyboard nav → empty state) **before remote data can muddy it**: a
bug here is a pure UI bug, never a fetch bug. Step 9 then drops the live
metafields into a list that is **already filtered** by this same box, so search
and live data never debut together.

Search is also the natural home for the keyboard-navigability requirement: a
typed query must leave the surviving results reachable and selectable by keyboard,
which this step verifies end to end while the list is still simple.

## Foundation carried from Step 6

- **The modal body is an `<s-choice-list>` of native fields.** In
  [SpecTableEditor.tsx](app/routes/app.templates_.$id/SpecTableEditor.tsx) the
  `<s-modal id={INSERT_FIELD_MODAL_ID}>` body maps `NATIVE_SHOPIFY_FIELDS` to
  `<s-choice>` children, controlled by `values={selectedField ? [selectedField]
  : []}` with `onChange={handleSelectField}`. Step 7 changes **only what list is
  mapped** — from the full constant to a filtered view — plus the search input
  above it. The `<s-choice-list>` wiring, `selectedField` state, and the
  disabled-until-selected primary button are unchanged.
- **The field data is already a separate pure module.**
  [shopifyFields.ts](app/utils/shopifyFields.ts) exports
  `NATIVE_SHOPIFY_FIELDS: readonly { field; label }[]` and `findNativeField`.
  Step 7 adds **one pure filter function** here and unit-tests it — the data
  literal stays out of the component, exactly as Step 6 set up for "Step 7's
  search to filter it."
- **One modal, two modes, reset on open.** `handleOpenInsertField` (create) and
  `handleEditPart` (edit) both reset `editTarget` + `selectedField` before
  `shopify.modal.show(...)`. Step 7 adds **one more thing to reset on open** — the
  search query — alongside those, so a stale query can't leak between opens.
- **No persistence, no reducer touch.** Still local React state only; the Step 4
  dev scaffolding (`devSampleRows`, `useCapturedTokenColor`) and the caret bridge
  stay untouched. Step 7 adds **no reducer action** — it neither inserts nor edits
  parts, it only changes which choices are rendered.

## What changes (architecture)

Two pieces, both **inside the modal body**, both **above/around the existing
`<s-choice-list>`** so the Step 6 selection + commit paths are untouched:

1. **A pure, testable filter in `shopifyFields.ts`.** Add
   `filterNativeFields(query: string): NativeShopifyField[]`:
   - **Empty / whitespace query → the full list** (identity view, original
     order). This is the open-state and the cleared-search state.
   - Otherwise a **case-insensitive substring match**, preserving
     `NATIVE_SHOPIFY_FIELDS` order. Match against **both** the human `label`
     **and** the snake_case `field` token with underscores normalised to spaces,
     so typing `price` surfaces *Price* **and** *Compare-at price*, `type` surfaces
     *Product type*, and `compare` / `compare at` both surface *Compare-at price*.
     (Normalising `_`→space means the token and label match the same way; the
     merchant never has to know the underlying token spelling.)
   - Returns a (possibly empty) array; **never mutates** the source constant.
   Keeping the matcher pure and in this module lets a unit test pin the behaviour
   (matches, ordering, empty-query identity, no-match empty array, case/whitespace
   insensitivity) and keeps `SpecTableEditor.tsx` free of matching logic. Step 9's
   metafield section reuses the **same matching rule** (applied to its own list),
   so the rule lives in one tested place.

2. **A search input + query state in the modal.** Add a `searchQuery: string`
   local state (alongside `selectedField` / `editTarget`). Render a search field
   as the **first child of the modal body**, above the `<s-choice-list>`; its
   `onInput`/`onChange` sets `searchQuery`; the list now maps
   `filterNativeFields(searchQuery)` instead of `NATIVE_SHOPIFY_FIELDS`. When the
   filtered list is empty, render a short **empty state** (e.g. an `s-paragraph`
   "No fields match …") **in place of** the choice list. `searchQuery` is reset to
   `""` on every modal open (create **and** edit) so the list always opens full.

### Selection vs. filtering (the one subtlety)

`selectedField` and `searchQuery` are **independent**. Filtering hides choices; it
must not silently change the pick:

- **Keep the selection even if the query filters it out.** If the merchant selects
  *Vendor*, then types `price`, *Vendor* leaves the visible list but
  `selectedField` stays `"vendor"` and the primary button stays **enabled** —
  clearing the search brings *Vendor* back, still selected. (Rationale: a search is
  a find affordance, not a deselect gesture; silently dropping a confirmed pick on
  a keystroke is surprising and loses work.) The committed pill is whatever
  `selectedField` holds, regardless of what is currently visible.
- **Edit mode opens full + pre-selected.** `handleEditPart` already pre-selects the
  clicked pill's field; with `searchQuery` reset to `""`, the modal opens showing
  the full list with that field selected and visible — search is available but not
  applied. No special casing.

> **Why selection is not cleared on filter.** The alternative (clear
> `selectedField` whenever it's filtered out) would make the button flicker
> disabled mid-search and discard a deliberate pick — strictly worse UX for no
> correctness gain, since commit reads `selectedField` directly.

## Sub-steps (build and verify one at a time)

Chain: **pure filter helper → search box wired to the list (create mode) →
keyboard nav + empty state + reset polish**. Each builds clean
(`npm run typecheck` + `lint` + `build` + `test:run`) and is verifiable on its own.

### 7.1 — `filterNativeFields` helper + tests

Add `filterNativeFields(query)` to [shopifyFields.ts](app/utils/shopifyFields.ts)
with the behaviour above. Unit-test in
[shopifyFields.test.ts](app/utils/shopifyFields.test.ts): empty / whitespace
query returns the full list in order; `"price"` returns *Price* + *Compare-at
price* in original order; `"type"` returns *Product type*; `"PRICE"` ==
`"price"` (case-insensitive); `"compare at"` matches *Compare-at price* (token
`_`→space normalisation); a no-match query (`"zzz"`) returns `[]`; the source
constant is not mutated. No UI change yet.

**Verify:** `test:run` covers the matcher; `typecheck` / `lint` / `build` pass.

### 7.2 — Search box wired to the list (create mode)

Add `searchQuery` state and a search field as the first child of the modal body;
map `filterNativeFields(searchQuery)` into the `<s-choice-list>`; reset
`searchQuery` to `""` in `handleOpenInsertField` (and `handleEditPart`). Leave
`selectedField` untouched by typing (keep-selection rule). For now, render the
choice list even when empty is fine — the empty state is 7.3.

- **Search primitive:** prefer a Polaris search/text field
  (`<s-search-field>` or `<s-text-field>` — **verify in-browser first**, see Open
  questions; fall back to a plain labelled `<input type="search">` with scoped CSS
  if the Polaris primitive misbehaves, consistent with
  [[polaris-web-component-gotchas]]).

**Verify (browser):** Insert field → modal shows the search box above the full
list; typing `pri` narrows to *Price* + *Compare-at price*; clearing restores all
thirteen in order; selecting *Vendor* then typing `price` keeps Insert enabled and
*Vendor* committed on Insert; reopening starts with an empty query and the full
list; counter unchanged.

### 7.3 — Keyboard navigation + empty state + reset polish

- **Empty state:** when `filterNativeFields(searchQuery)` is empty, render a short
  `s-paragraph` (e.g. `No fields match "<query>"`) instead of the choice list;
  the primary button reflects whatever `selectedField` already holds (it does not
  force-disable just because the visible list is empty).
- **Keyboard navigability:** the search field is **auto-focused on open** so the
  merchant can type immediately; results stay reachable — Tab / arrow keys move
  into the `<s-choice-list>` and the radio group's arrow-key navigation selects a
  visible field; Esc still dismisses the modal (native `<s-modal>`). (Optional
  nicety, only if it falls out cleanly: **Enter in the search field selects the
  first visible result**; defer if it fights the modal's default action.)
- **Reset hygiene:** confirm `searchQuery`, `selectedField`, and `editTarget` are
  all reset on every open and on Cancel so a query / pick / target can't leak
  between create and edit opens.

**Verify (browser):** open → search field is focused; type `zzz` → empty-state
message, no choices; backspace to a matching query → results return; arrow keys
move through filtered results and select one; **Update** in edit mode opens full
with the pill's field pre-selected and visible; alternating create/edit opens
carry no stale query or selection; focus trap + Esc + outside-click still work;
`typecheck` / `lint` / `build` / `test:run` pass.

---

## Reducer actions

**None added, none changed.** Step 7 is a presentation filter over the existing
`<s-choice-list>`; it inserts and edits nothing. `INSERT_VALUE_PART_AT` (create)
and `SET_VALUE_PART` (edit) from Step 6 remain the only commit paths and are
untouched. `data-model.md` and the `ValuePart` union are unchanged.

| Interaction                                   | Reducer action                          |
| --------------------------------------------- | --------------------------------------- |
| Filter the visible field list                 | **none** — pure UI (`filterNativeFields`)|
| Insert a selected field at saved caret        | `INSERT_VALUE_PART_AT` — existing       |
| Update an existing pill's field in place       | `SET_VALUE_PART` — existing (Step 6)    |

## Locked decisions

- **Search is find-only; it never deselects.** `selectedField` is independent of
  `searchQuery`; filtering a selected field out of view keeps it selected and the
  primary button enabled (see "Selection vs. filtering").
- **Match label + normalised token, case-insensitively.** Underscores in the
  `field` token are treated as spaces so the merchant matches on the friendly
  spelling; the locked snake_case tokens are unaffected (search reads them, never
  rewrites them).
- **Reset query on every open.** The modal always opens showing the full list, in
  both create and edit modes.
- **The matcher lives in `shopifyFields.ts`,** pure and unit-tested, reused by
  Step 9's metafield section so there is one matching rule.

## What Step 7 does *not* own (boundary with Step 8+)

- **Live metafield definitions** (fetch + render + `METAFIELD` pill + metafield
  edit) → **Steps 8–9**. Step 7 filters the **native** list only; Step 9's
  fetched metafields are filtered by the **same** search box once they exist.
- **Persistence / Save / server re-validation** → the post-editor slice. Still
  local React state only.
- **Drag reorder** (Steps 10–11) and **clipboard paste** (Steps 12–13) — untouched;
  the gutter `⠿` stays inert.
- **No change to the pill model, the caret bridge, or the commit paths** — Step 7
  is strictly the modal's list-presentation layer.

## File placement (unchanged conventions)

- The pure filter (`filterNativeFields`) + its tests go in
  [shopifyFields.ts](app/utils/shopifyFields.ts) /
  [shopifyFields.test.ts](app/utils/shopifyFields.test.ts) (framework-free,
  read by the editor now and reused by Step 9).
- The search input, `searchQuery` state, filtered mapping, and empty state live in
  [SpecTableEditor.tsx](app/routes/app.templates_.$id/SpecTableEditor.tsx)
  (co-located; promote to `app/components/` only if a second route needs it).
- Any search-box styling goes in
  [SpecTableEditor.module.css](app/routes/app.templates_.$id/SpecTableEditor.module.css),
  scoped, **Polaris tokens / `currentColor` only, no hardcoded hex** — prefer the
  Polaris search/text field over custom CSS.

## Open questions

- **Search primitive in this CDN build.** Which Polaris web component renders a
  working, labelled, controllable search field — `<s-search-field>` or
  `<s-text-field>` (and which event fires per keystroke, `input` vs `change`)?
  Given the build's track record ([[polaris-web-component-gotchas]]), **verify
  in-browser** before committing; fall back to a plain `<input type="search">`
  with scoped CSS if the Polaris primitive misbehaves.
- **Auto-focus inside `<s-modal>`.** Does focusing the search field on open fight
  the modal's native focus trap / initial-focus behaviour? Confirm the search box
  can take focus on show without breaking Esc / trap.
- **`<s-choice-list>` re-render on changing children.** Confirm the controlled
  `values={[selectedField]}` still reflects correctly when the `<s-choice>`
  children are filtered (including when the selected value is not currently
  rendered) — i.e. it does not throw or drop the selection on commit.
- **Enter-to-select-first-result.** Nice-to-have (7.3); keep only if it doesn't
  collide with the modal's default primary action. Otherwise defer.

## Done when

1. Sub-steps 7.1–7.3 each pass their verify check.
2. The modal shows a **search box above the native-field list**; typing filters the
   list **as you type** (case-insensitive, matching label + normalised token),
   clearing restores the full list in order, and a **no-match** query shows an
   **empty state**.
3. **Selection is independent of the filter:** a selected field stays selected (and
   the primary button stays enabled / commits it) even when filtered out of view;
   the query **resets on every open** so the modal always opens full, in both create
   and edit modes.
4. **Results are keyboard-navigable:** the search field auto-focuses on open, Tab /
   arrow keys reach and select the filtered choices, and the modal still traps focus
   and is keyboard-dismissible.
5. A new pure `filterNativeFields` in `app/utils/shopifyFields.ts` holds the matching
   rule (unit-tested); **no reducer action added or changed**; `INSERT_VALUE_PART_AT`
   / `SET_VALUE_PART` commit paths and the `ValuePart` union are **unchanged**; **no
   API calls**.
6. **No hardcoded hex**; the Step 4 caret model, token rendering, line breaks,
   keyboard delete, the Step 5 modal mechanics, and the Step 6 create/edit commit
   paths are **unregressed**; the `Rows: N / 200` counter is unaffected.
7. `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:run` all
   pass; **browser-verified end to end** in the real embedded app (the Step 7 search
   flow above, no console errors).
8. `progress-tracker.md` updated to mark Step 7 complete and point at Step 8 (fetch
   the shop's metafield definitions).
