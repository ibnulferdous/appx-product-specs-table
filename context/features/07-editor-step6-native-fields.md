# Editor Step 6 — Native Shopify fields in the modal (static list)

## Goal in one sentence

Render a **hardcoded list of native Shopify fields** (Vendor, Price, SKU, Category…)
inside the Step 5 modal; selecting one and clicking **Insert** drops a *complete*
`SHOPIFY_FIELD` pill at the saved caret (replacing the Step 5 `STEP5_STUB_PILL`),
**Insert is disabled until a field is selected**, and **clicking an existing pill
reopens the same modal pre-filled** so **Update** replaces that pill's field in place
(**Cancel** leaves it untouched) — **one modal serves create and edit**, with **no
API calls** anywhere.

## Why this is now

Step 5 proved the hard machinery with a fixed stub: the toolbar gate, the
focus-trapped `<s-modal>` (App Bridge `shopify.modal.show/hide`), caret save/restore,
and the `INSERT_VALUE_PART_AT` insert path. Step 6 pours the **first real content**
into that proven shell using data we fully control — a static field list — so the
click → select → Insert → complete pill wiring (and the new click-pill → Update
branch) is verified **before a network call can muddy the picture** (the live
metafield fetch is Steps 8–9). This is also the natural place to bring **edit-an-
existing-pill** online, because both create and edit are the same "pick a field,
commit it" interaction over the same list.

## Foundation carried from Step 5

- **The modal shell exists and works.** One editor-level `<s-modal
  id="insert-field-modal">` in
  [SpecTableEditor.tsx](app/routes/app.templates_.$id/SpecTableEditor.tsx),
  opened/closed via `shopify.modal.show/hide` (App Bridge, from `useAppBridge()`),
  with `primary-action` (**Insert**) / `secondary-actions` (**Cancel**) slots and
  native focus trap + Esc + outside-click dismiss. Step 6 fills its **body** and
  gives the primary button real create/edit behaviour.
- **The caret bridge exists.** `ValueCell` reports its linear caret via
  `onCaretChange(rowId, linear)`; the container keeps it in `activeCaretRef`,
  snapshots it into `savedCaretRef` on open, and on commit computes
  `(partIndex, offset) = linearToPartOffset(row.valueParts, saved.linear)`, queues
  the post-insert caret in `pendingCaretByRowRef` (keyed by row id), and dispatches
  the insert. Step 6 **reuses this verbatim** — only `part` changes from the stub to
  the selected field.
- **`INSERT_VALUE_PART_AT` is the create path** (Step 4.4); pills are always rendered
  complete (`tokenLabels` → `Field · <field>`), so a `SHOPIFY_FIELD` pill is already
  a first-class token. The `SHOPIFY_FIELD` part shape (`{ type: "SHOPIFY_FIELD";
  field: string }`) and its rendering (`createAtomicElement` / `partFromAtomicElement`
  / `tokenLabels` in [valueDom.ts](app/utils/valueDom.ts)) are unchanged.
- Still **local React state only** — no Save/persist, no loader, no Admin API. The
  Step 4 dev scaffolding (`devSampleRows`, `useCapturedTokenColor`) stays.

## What changes (architecture)

Three pieces, all **outside** the `contenteditable` so the Step 4 caret model is
untouched:

1. **A static native-fields module** — new pure, testable
   `app/utils/shopifyFields.ts` exporting the hardcoded list as
   `NATIVE_SHOPIFY_FIELDS: { field: string; label: string }[]`. `field` is the token
   persisted in the `SHOPIFY_FIELD` part (the **storefront-resolver contract** — see
   Locked decisions); `label` is the human name shown in the picker. The entry shape
   is **`{ field, label }` only** — no product-vs-variant `source` flag (decided
   2026-06-16): the editor never resolves values, so the product/variant distinction
   (and the selected-variant / first-variant fallback) is the storefront resolver's
   job and lives in that slice, not this module. Thirteen fields (mirroring `prd.md`):
   **vendor, product type, category, tags, total inventory, available for sale,
   selected options, weight, SKU, barcode, price, compare-at price, inventory
   quantity** (`title` dropped as redundant with the product-page heading; `available
   for sale`, `total inventory`, and `selected options` added 2026-06-16). Keeping it
   a separate pure module lets Step 7's search filter it and a unit test assert the
   set, and keeps `SpecTableEditor.tsx` free of a data literal.

> **Why static, not fetched.** Native product fields are a **Shopify
> platform-defined schema** — `vendor`, `category`, `price`, `sku`, … exist on every
> product in every shop and never vary per shop, so there is nothing shop-specific
> to discover; a static constant *is* the source of truth, not a cache. (Fetching
> would add a loading/error path and latency for data that cannot differ, and you'd
> still hand-curate the same useful subset out of the dozens of internal/admin
> fields.) **Metafields are the opposite** — merchant-defined `namespace`/`key` that
> genuinely vary per shop — which is exactly why they are fetched shop-scoped from
> Admin GraphQL in **Steps 8–9**. The one maintenance note: the native set can shift
> across Shopify **API versions**, handled by editing this one tested constant when
> the API version is bumped — a code change, not runtime data.

2. **Modal body = a selectable field list + selection state.** The placeholder
   `<s-paragraph>` is replaced by a keyboard-reachable list of the native fields
   (one selectable option per field). A local `selectedField: string | null` state
   tracks the current pick; **Insert/Update is disabled while it is `null`**. (Search
   over this list is Step 7 — render the full list flat for now.)

3. **Create vs. edit mode for the one modal.** An `editTargetRef` (or small state)
   holds `{ rowId, partIndex } | null`:
   - **null → create:** opened by the toolbar **Insert field** button; commits via
     `INSERT_VALUE_PART_AT` at the saved caret; primary button reads **Insert**.
   - **non-null → edit:** opened by **clicking an existing pill**; the modal opens
     pre-filled with that pill's `field`; commit **replaces the field in place**;
     primary button reads **Update**.
   `Cancel` / Esc / outside-click commit nothing in either mode.

### The new reducer action (recommended): `SET_VALUE_PART`

Editing a pill is a pure **in-place swap** of one atomic slot — same index, same
atomic kind, so array length, structure, and caret are all unchanged. Add **one
minimal action**:

```ts
| { type: "SET_VALUE_PART"; id: string; partIndex: number; part: ValuePart }
```

It replaces `valueParts[partIndex]` with `part` for a `DATA` row, no-ops on a
missing id / `SECTION_HEADER` / out-of-range index, and (because a pill→pill swap
keeps types adjacent the same) needs **no `normalizeValueParts`** — though running
it is harmless and keeps the action uniform with the others. Recommended over
reusing `REMOVE_VALUE_PART` + `INSERT_VALUE_PART_AT`, which would be two dispatches,
trigger a normalize that merges the TEXT around the removed pill and then re-splits
it, and force recomputing `(partIndex, offset)` against the mutated array — strictly
more work and more caret churn for an operation that should not move the caret at
all. This is a **genuinely new capability** (no existing action replaces a part in
place), so it earns its own action; cover it in `rows.test.ts`.

> **Scope note.** This is the first new reducer action since Step 4.4. It is
> additive and pure; it does not change any existing action or the `ValuePart`
> union. `data-model.md` needs no change (`SHOPIFY_FIELD` already requires only
> `field`).

### Commit paths

- **Create (Insert):** unchanged from Step 5 except `part` is
  `{ type: "SHOPIFY_FIELD", field: selectedField }` instead of the stub →
  `dispatch(INSERT_VALUE_PART_AT …)`; caret lands after the new pill via
  `pendingCaretByRowRef` (existing path).
- **Edit (Update):** `dispatch(SET_VALUE_PART { id: rowId, partIndex, part:
  { type: "SHOPIFY_FIELD", field: selectedField } })`; restore focus to the cell and
  place the caret **just after the updated pill** by queueing
  `partOffsetToLinear(valueParts, partIndex + 1, 0)` in `pendingCaretByRowRef` (same
  one restore path). No caret math against the saved insertion caret here — edit
  targets the pill's own slot.

---

## Sub-steps (build and verify one at a time)

Chain: **static list module → render + select in the modal → Insert a real pill →
click-pill-to-edit + Update**. Each builds clean (`npm run typecheck` + `lint` +
`build` + `test:run`) and is verifiable on its own.

### 6.1 — Native fields data module

Add `app/utils/shopifyFields.ts` with `NATIVE_SHOPIFY_FIELDS` (the thirteen fields
above, each `{ field, label }`) and a `findNativeField(field): … | undefined` lookup.
Unit-test the set (count, unique `field` tokens, stable order). No UI change yet.

**Verify:** `test:run` covers the list; `typecheck`/`lint`/`build` pass.

### 6.2 — Render the selectable list in the modal (create mode only)

Replace the modal's placeholder body with a keyboard-navigable list of the native
fields; track `selectedField` in local state; **disable Insert until a field is
selected**. Wire the existing Insert click to build the `SHOPIFY_FIELD` part from
`selectedField` (drop the `STEP5_STUB_PILL`). Reset `selectedField` to `null` each
time the modal opens (create mode).

**Verify (browser):** Insert field button → modal lists the native fields; Insert is
**disabled** until a field is selected; selecting **Vendor** + Insert drops
`Field · vendor` at the saved caret (as in Step 5) and the caret lands after it;
Cancel/Esc/outside-click insert nothing; counter unchanged.

### 6.3 — Click a pill to edit → Update (edit mode)

Make existing pills clickable: a delegated click handler on the value-cell host
detects a `[data-token]` element, resolves its `(rowId, partIndex)`, and opens the
**same** modal in edit mode (`editTargetRef = { rowId, partIndex }`), pre-selecting
that pill's current `field`. The primary button reads **Update** and dispatches
`SET_VALUE_PART`; **Cancel** leaves the pill untouched. After Update, focus returns
to the cell with the caret just after the updated pill.

- Resolving the clicked pill's part index: walk the host's child nodes to the
  clicked token (a small `partIndexOfElement(host, el)` helper in `valueDom.ts`, or
  reuse the existing DOM-walk pattern) — do **not** stash a `data-part-index`
  attribute, since indices shift on every structural edit.
- Only `SHOPIFY_FIELD` pills are editable in Step 6; clicking a `METAFIELD` token
  (only present via `devSampleRows`) opens the same modal but the native list has no
  matching entry — it is acceptable for Step 6 that selecting a native field there
  converts it to a `SHOPIFY_FIELD` (metafield editing is Step 9). Note this rather
  than special-casing it.

**Verify (browser):** click the `Field · vendor` pill → modal reopens pre-filled
with Vendor selected and the button reads **Update**; pick **Price** + Update →
the pill becomes `Field · price` **in place** (length/structure unchanged, caret
after it), surrounding text intact; Cancel after reopening leaves the pill unchanged;
counter unchanged.

### 6.4 — Heading / label polish + mode reset

Make the modal heading and primary label reflect mode (e.g. heading "Insert field"
vs "Edit field"; primary "Insert" vs "Update"). Ensure `editTargetRef`,
`savedCaretRef`, and `selectedField` are all reset on every open and on
Cancel/dismiss so create and edit can't leak state into each other.

**Verify:** alternating create and edit opens never carry stale selection or stale
target; `typecheck`/`lint`/`build`/`test:run` pass.

---

## Reducer actions

| Interaction                                   | Reducer action                                  |
| --------------------------------------------- | ----------------------------------------------- |
| Insert a selected native field at saved caret | `INSERT_VALUE_PART_AT` — existing (Step 4.4)    |
| **Update an existing pill's field in place**  | **`SET_VALUE_PART` — new in Step 6**            |
| Insert a hard line break at caret             | `INSERT_VALUE_PART_AT` — existing               |
| Edit / delete TEXT and tokens                 | `SET_VALUE_TEXT` / `REMOVE_VALUE_PART` — existing|

`SET_VALUE_PART` is the only addition. The `ValuePart` union and `data-model.md` are
unchanged.

## Locked decisions

- **`field` token set = the storefront-resolver contract.** Because the `field`
  string is persisted in `valueParts` and later drives the Theme App Extension's
  Liquid resolution, the token strings are fixed now (changing them later would
  orphan saved pills). Use Shopify product-object-aligned snake_case:
  `vendor`, `product_type`, `category`, `tags`, `total_inventory`,
  `available_for_sale`, `selected_options`, `weight`, `sku`, `barcode`, `price`,
  `compare_at_price`, `inventory_quantity` (13). The exact field→Liquid mapping is
  finalized in the storefront/persistence slice, but the token identifiers are locked
  here. **Object split (resolver's concern, not this module):** the schema review
  (Admin API 2026-04) confirmed `vendor`/`product_type`/`category`/`tags`/
  `total_inventory` are **`Product`-level**; `weight`/`sku`/`barcode`/`price`/
  `compare_at_price`/`inventory_quantity`/`available_for_sale`/`selected_options` are
  **`ProductVariant`-level** (weight via `inventoryItem.measurement.weight`) and are
  the variant-sensitive ones. **`selected_options` is a list** of name/value pairs
  (e.g. `Color: Red`, `Size: M`), not a scalar — the storefront resolver joins it
  into one cell value; it still stores as a single `SHOPIFY_FIELD` token. Field set
  last revised 2026-06-16: `title` dropped (redundant with the page heading);
  `category`, `available_for_sale`, `total_inventory`, `selected_options` added.
- **Pill label stays `Field · <field>`** (`tokenLabels`, unchanged) — the roadmap's
  agreed format. (Whether the *visible* token should show the friendly label instead
  of the raw token is an open question below, not a change in Step 6.)
- **One modal, two modes** (create/Insert + edit/Update), distinguished by
  `editTargetRef`. Confirmed in the 2026-06-15 pick-then-insert decision.
- **Variant-sensitivity is a storefront concern, not Step 6 — and not in the
  module.** PRD notes SKU/price/weight resolve against the selected variant with a
  first-variant fallback; that resolution lives in the render slice. Decided
  2026-06-16: `shopifyFields.ts` carries **no `source`/`variantSensitive` flag** —
  the editor neither resolves values nor branches on the product/variant split, so
  the resolver owns that mapping (the object split is recorded above for reference
  only). Entry shape stays `{ field, label }`.

## What Step 6 does *not* own (boundary with Step 7+)

- **Search / filter** over the list, with keyboard-navigable results → **Step 7**.
  Step 6 renders the full list flat.
- **Live metafield definitions** (fetch + render + `METAFIELD` pill + metafield
  edit) → **Steps 8–9**. Step 6 is native fields only, no API calls.
- **Persistence / Save / server re-validation** → the post-editor slice. Still local
  React state only.
- **Drag reorder** (Steps 10–11) and **clipboard paste** (Steps 12–13) — untouched;
  the gutter `⠿` stays inert.

## File placement (unchanged conventions)

- New pure data module: `app/utils/shopifyFields.ts` + `app/utils/shopifyFields.test.ts`
  (framework-free, like `rows.ts`/`valueParts.ts`; read by the editor now and the
  storefront resolver later).
- The modal body, selection state, edit-mode wiring, and the pill click handler live
  in [SpecTableEditor.tsx](app/routes/app.templates_.$id/SpecTableEditor.tsx)
  (co-located; promote to `app/components/` only if a second route needs it).
- The new `SET_VALUE_PART` action stays in [rows.ts](app/utils/rows.ts), covered by
  [rows.test.ts](app/utils/rows.test.ts).
- Any new modal-list styling goes in
  [SpecTableEditor.module.css](app/routes/app.templates_.$id/SpecTableEditor.module.css),
  scoped, **Polaris tokens / `currentColor` only, no hardcoded hex** — prefer
  Polaris list/choice components over custom CSS.

## Open questions

- **Selectable-list primitive in this CDN build.** Which Polaris web component
  renders a keyboard-navigable single-select list that actually works here —
  `s-choice-list` / `s-option-list` / a set of `s-clickable` rows? Given the build's
  track record ([[polaris-web-component-gotchas]]), **verify in-browser** before
  committing; fall back to plain semantic `<button role="option">` rows with scoped
  CSS if the Polaris primitive misbehaves.
- **Visible token text for multi-word fields.** `Field · product_type` /
  `Field · compare_at_price` read raw. Keep the raw token (current `tokenLabels`), or
  show the friendly label (`Field · Product type`)? Friendly would mean `tokenLabels`
  looks the field up in `NATIVE_SHOPIFY_FIELDS`. Deferred unless it reads poorly in
  the browser; if changed, it is a `valueDom.ts` display tweak only (the stored
  `field` token is unaffected).
- **Editing a `METAFIELD` pill in Step 6.** With only native fields in the list,
  selecting one while editing a `METAFIELD` token converts it to `SHOPIFY_FIELD`
  (see 6.3). Confirm that is acceptable for Step 6 (metafield edit arrives in Step 9)
  rather than disabling the click for `METAFIELD` tokens until then.

## Done when

1. Sub-steps 6.1–6.4 each pass their verify check.
2. The modal shows a **hardcoded native-field list** (the thirteen fields above);
   **Insert is disabled until a field is selected**; selecting one + **Insert** drops a
   complete `SHOPIFY_FIELD` pill at the saved caret (the Step 5 `STEP5_STUB_PILL` is
   gone), caret after the pill, focus back in the cell.
3. **Clicking an existing pill reopens the same modal pre-filled**; **Update**
   replaces that pill's field **in place** (structure + caret unchanged);
   **Cancel / Esc / outside-click** leave it untouched. One modal serves both modes.
4. A new pure `app/utils/shopifyFields.ts` holds the list (unit-tested); the
   `field` token set is the locked snake_case contract above.
5. **One new reducer action** (`SET_VALUE_PART`), additive and pure, unit-tested;
   `INSERT_VALUE_PART_AT` reused for create; no existing action or the `ValuePart`
   union changed; **no API calls**.
6. **No hardcoded hex**; the Step 4 caret model, token rendering, line breaks,
   keyboard delete, and the Step 5 modal mechanics are **unregressed**; the
   `Rows: N / 200` counter is unaffected by insert/update.
7. Accessibility holds: the field list is keyboard-navigable and labelled, the modal
   still traps focus and is keyboard-dismissible, and focus returns to the value cell
   (caret after the committed pill) on Insert/Update.
8. `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:run` all
   pass; **browser-verified end to end** in the real embedded app (the Step 6 create
   and edit flows above, no console errors).
9. `progress-tracker.md` updated to mark Step 6 complete and point at Step 7
   (search / filter inside the modal).
