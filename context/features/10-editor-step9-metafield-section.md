# Editor Step 9 — Metafield section in the modal (live data)

## Goal in one sentence

Turn Step 8's read-only fetch into a **selectable metafield section** in the
"Insert field" modal: render the already-fetched product metafield definitions as
a list **below the native fields**, covered by the **same Step 7 search box**
(matching `name` + a normalised `namespace.key` token via the shared rule), let
the merchant pick **one field across both lists** (native **or** metafield, never
both), and on **Insert** drop a real **`METAFIELD` pill** carrying `namespace` +
`key` — completing the "smart pill" — with **no reducer change** (reuse
`INSERT_VALUE_PART_AT` / `SET_VALUE_PART`), **no schema change**, and **no
persistence**.

## Why this is now

Every dependency this step needs is already built and verified live:

- **The data is fetched, cached, and state-managed (Step 8).** The lazy
  `useFetcher` fires once on the first modal open,
  `fetchProductMetafieldDefinitions` pages + shop-scopes the call, and the modal
  already shows loading / error+Retry / empty / loaded(count) states. Step 9 only
  swaps the **loaded** state from a count confirmation into selectable choices.
- **The search box already exists and is shared by design (Step 7).** The
  matching rule lives in one tested place (`filterNativeFields` in
  `shopifyFields.ts`); Step 9 reuses that rule over the metafield list so search
  and live data never debut together — Step 7 built it small so this step is a
  pure data-feed.
- **The pill renders already.** A `METAFIELD` value part renders as
  `Metafield · <key>` today (the dev sample row carries `custom` /
  `battery_life`); the Step 4 caret model, token rendering, and keyboard delete
  all handle it. Step 9 is the missing half: **creating** that pill from the
  picker instead of only seeding it.
- **The commit + edit paths are generic.** `INSERT_VALUE_PART_AT` (create) and
  `SET_VALUE_PART` (edit) both accept **any** `ValuePart` — a `METAFIELD` part
  flows through them unchanged. The Step 6 leftover ("editing a METAFIELD pill
  opens unselected because the native list has no metafield entry") is resolved
  *here*, the moment metafields become selectable.

A bug in Step 9 is therefore a pure **rendering / selection / pill-shape** bug,
not a fetch bug (Step 8) and not a caret bug (Steps 4–5).

## Foundation carried from Steps 5–8

- **One modal, two modes, reset on open.** `handleOpenInsertField` (create) and
  `handleEditPart` (edit) reset `editTarget` / `selectedField` / `searchQuery`
  before `shopify.modal.show(...)`. Step 9 generalises `selectedField` from a
  native-only token into a **two-kind selection** (native **or** metafield) but
  keeps the same reset-on-open discipline.
- **The modal body is search box → native `<s-choice-list>` → status region.**
  The Step 8 status region (`<s-divider>` + "Metafields" heading + loading /
  error / empty / loaded states) is **exactly the slot Step 9 fills**: its
  *loaded* branch becomes a second `<s-choice-list>` of the fetched definitions.
  No re-layout — Step 8 placed it below the native list precisely so this step
  drops in without moving anything (verified in-browser in Step 8).
- **The matching rule is one tested function.** `filterNativeFields` already
  normalises `_`→space and matches case-insensitively against label + token.
  Step 9 extracts the shared core so a new `filterMetafieldDefinitions` applies
  the **same** rule to `name` + `namespace.key`.
- **Shop isolation is already structural.** The definitions came from
  `authenticate.admin(request)`-bound GraphQL (Step 8), so they are this shop's
  only — Step 9 adds no new data access and no Prisma `where`.
- **No persistence, no reducer touch.** Still local React state; the Step 4 dev
  scaffolding (`devSampleRows`, `useCapturedTokenColor`) and the caret bridge are
  untouched. `data-model.md` needs **no change** — `METAFIELD` already requires
  `namespace` + `key`, now strictly honored (no transient empty-key state, since
  `placeholderMetafieldPart` was removed in Step 5 and a pill is only ever created
  from a real, fully-formed definition).

## What changes (architecture)

Three pieces, layered pure-helper → selection-model → render+commit so each is
independently verifiable:

1. **A shared, pure metafield filter in `shopifyFields.ts`.** Extract the Step 7
   matching core into a small reusable predicate and add:

   ```ts
   filterMetafieldDefinitions(
     definitions: readonly MetafieldDefinitionSummary[],
     query: string,
   ): MetafieldDefinitionSummary[]
   ```

   - **Empty / whitespace query → the full list** (identity view, original
     order), mirroring `filterNativeFields`.
   - Otherwise a case-insensitive substring match against **both** the human
     `name` **and** the `namespace.key` token with non-alphanumerics normalised to
     spaces (so `custom.battery_life` matches "battery", "battery life", and
     "custom"). Same rule, different fields — the locked `namespace`/`key` are read
     only, never rewritten.
   - Takes the array as an **argument** (it is fetched data, not a constant), stays
     pure, returns a fresh array, never mutates the source.
   - Unit-tested in `shopifyFields.test.ts` alongside `filterNativeFields`.

   To keep one rule, factor the existing inline match in `filterNativeFields` into
   a private `matchesQuery(needle, ...haystacks)` (or equivalent) that both
   filters call — `filterNativeFields`'s observable behaviour and its existing
   tests must stay green (refactor, not rewrite).

   > **Why the metafield filter still lives in `shopifyFields.ts`** even though it
   > operates on Shopify-fetched data: the module owns the **matching rule**, not
   > the data source. `MetafieldDefinitionSummary` is a type-only import; the
   > function holds no list of its own. This keeps "one tested matcher" true and
   > the component free of matching logic, exactly as Step 7 set up.

2. **A two-kind selection model in `SpecTableEditor.tsx`.** Generalise
   `selectedField: string | null` into a discriminated selection so a native field
   and a metafield are mutually exclusive across the two choice lists:

   ```ts
   type FieldSelection =
     | { kind: "native"; field: string }
     | { kind: "metafield"; namespace: string; key: string };
   // const [selection, setSelection] = useState<FieldSelection | null>(null);
   ```

   - **Native `<s-choice-list>`:** `values={selection?.kind === "native" ?
     [selection.field] : []}`; `onChange` sets `{ kind: "native", field }`.
   - **Metafield `<s-choice-list>`:** each `<s-choice value={...}>` keyed by the
     definition's `id` (gid — stable for React keys) with a stable choice value
     (`namespace.key`); `values` reflects the selection only when
     `selection?.kind === "metafield"` and matches; `onChange` decodes the picked
     value back to a definition by **looking it up in the loaded list** (not by
     string-splitting the value — robust against any separator), then sets
     `{ kind: "metafield", namespace, key }`.
   - **Mutual exclusivity falls out for free:** picking in one list sets a `kind`
     that makes the *other* list's `values` empty, so only one radio is ever
     checked. (Two separate `<s-choice-list>`s, one selection state — not one
     merged list, which can't carry the divider + section heading.)
   - The primary button is enabled when `selection !== null` (was: `selectedField
     !== null`). The Step 7 **keep-selection-through-filter** rule is preserved for
     both kinds: typing never touches `selection`.

3. **Render the metafields + commit either kind.** In the modal body's status
   region, the **loaded** branch becomes a `filterMetafieldDefinitions(defs,
   searchQuery)` → `<s-choice-list>` (loading / error+Retry / empty-store states
   are unchanged from Step 8). `handleCommit` builds the part from the selection:

   ```ts
   const part: ValuePart =
     selection.kind === "native"
       ? { type: "SHOPIFY_FIELD", field: selection.field }
       : { type: "METAFIELD", namespace: selection.namespace, key: selection.key };
   ```

   Everything downstream is unchanged: create → `INSERT_VALUE_PART_AT` at the
   saved caret; edit → `SET_VALUE_PART` in place; the post-commit caret still lands
   just after the committed pill via `pendingCaretByRowRef`. A committed
   `METAFIELD` part renders as `Metafield · <key>` through the existing token
   layer.

   **Edit pre-fill for a clicked `METAFIELD` pill (resolves the Step 6
   leftover).** `handleEditPart` currently takes a native `prefillField: string |
   null`. Generalise the prefill the clicked cell passes so a `METAFIELD` pill
   pre-selects `{ kind: "metafield", namespace, key }` and a `SHOPIFY_FIELD` pill
   pre-selects `{ kind: "native", field }` (still gated by `findNativeField` so an
   unknown native token opens unselected). The pre-selected metafield radio shows
   checked **once the definitions are loaded**; the selection is held regardless of
   render (Step 7's keep-selection rule), so Update commits the original pill even
   if the list is mid-load — see Open questions.

### Combined empty state (the one layout subtlety)

With search now covering **both** lists, reconcile the empty states so the
merchant isn't shown two "no match" messages:

- **Native section:** render the filtered native choices; when empty, render
  **nothing** there (drop the standalone "No fields match" that Step 7 put in the
  native slot).
- **Metafield section:** keep the divider + "Metafields" heading always (so the
  section is discoverable); inside it show loading / error+Retry / empty-store
  (Step 8) **or**, when loaded, the filtered metafield choices — and when the
  query filters the metafields to empty, a short "No metafields match" note.
- **One combined "No fields match" message** when a non-empty query filters
  **both** the native list and the (loaded) metafield list to empty — shown once,
  below both sections, instead of per-section. Lock the exact placement in 9.3 and
  verify it doesn't fight the modal scroll (as Step 8 did for the status region).

## Sub-steps (build and verify one at a time)

Chain: **shared filter helper (tested) → render metafields as a selectable list +
two-kind selection (create) → METAFIELD commit + edit pre-fill + combined empty
state**. Each builds clean (`npm run typecheck` + `lint` + `build` + `test:run`).

### 9.1 — `filterMetafieldDefinitions` helper + shared matcher + tests

Extract the Step 7 match core into a private predicate; add
`filterMetafieldDefinitions(definitions, query)` using it (match `name` +
normalised `namespace.key`). Unit-test in `shopifyFields.test.ts`: empty /
whitespace query returns the full list in order; a `name` match; a token match
via `namespace`/`key` (e.g. "battery" → `custom.battery_life`); normalisation
(`_`→space) and case-insensitivity; a no-match query → `[]`; the source array is
not mutated; a fresh array is returned. Confirm **all existing `filterNativeFields`
tests stay green** (the refactor is behaviour-preserving).

**Verify:** `test:run` covers both filters over the shared core; `typecheck` /
`lint` / `build` pass. No UI change yet.

### 9.2 — Render metafields as a selectable list + two-kind selection (create)

Replace the loaded-count text with a `<s-choice-list>` of
`filterMetafieldDefinitions(definitions, searchQuery)` (choices labelled by
`name`, keyed by `id`, valued by `namespace.key`). Introduce the `FieldSelection`
state, wire both choice lists to it (mutual exclusivity), and enable the primary
button on `selection !== null`. Leave loading / error+Retry / empty-store
branches as Step 8 built them; leave the combined empty state for 9.3.

**Verify (browser):** open Insert field on a value caret → after the fetch, the
metafields render as a radio list below the native fields; selecting a native
field unchecks any metafield and vice versa (only one checked across both);
selecting a metafield enables Insert; the Step 7 search filters **both** lists as
you type; the keep-selection rule holds for a metafield filtered out of view.

### 9.3 — METAFIELD commit + edit pre-fill + combined empty state

- **Commit:** `handleCommit` builds a `SHOPIFY_FIELD` **or** `METAFIELD` part from
  the selection; create inserts it at the saved caret, edit swaps it in place; the
  caret lands after the pill. A committed metafield renders `Metafield · <key>`.
- **Edit pre-fill:** generalise `handleEditPart`'s prefill so a clicked
  `METAFIELD` pill pre-selects its namespace/key and a `SHOPIFY_FIELD` pill
  pre-selects its field; Update commits the (possibly re-picked) field.
- **Combined empty state:** drop the native-only "No fields match"; show one
  combined message only when a query empties both loaded lists; keep the
  metafield section heading visible.
- **Reset hygiene:** confirm `selection`, `editTarget`, and `searchQuery` reset on
  every open (create **and** edit) and on Cancel so nothing leaks between modes or
  between native/metafield picks.

**Verify (browser):** create → pick a metafield + Insert → a `Metafield · <key>`
pill lands at the saved caret, caret after it, focus back in the cell; the dev
sample's `custom.battery_life` pill, clicked, reopens the modal with that
metafield **pre-selected** and the button reads **Update**; re-pick a native field
+ Update converts it in place to `Field · <field>`; a no-match query shows the
single combined empty state; Cancel / Esc / outside-click commit nothing; the
`Rows: N / 200` counter never changes; **no console errors** (admin console
included, per the Step 7 view-transition gotcha); `typecheck` / `lint` / `build` /
`test:run` pass.

---

## Reducer actions

**None added, none changed.** Step 9 only changes *which* `ValuePart` the existing
commit paths receive. `INSERT_VALUE_PART_AT` (create) and `SET_VALUE_PART` (edit)
are untouched and already accept a `METAFIELD` part. `data-model.md` and the
`ValuePart` union are unchanged.

| Interaction                                        | Reducer action                    |
| -------------------------------------------------- | --------------------------------- |
| Filter the visible native + metafield lists        | **none** — pure UI (filters)      |
| Insert a selected **metafield** at the saved caret | `INSERT_VALUE_PART_AT` — existing |
| Insert a selected **native field** at saved caret  | `INSERT_VALUE_PART_AT` — existing |
| Update a clicked pill (native **or** metafield)    | `SET_VALUE_PART` — existing        |

## Locked decisions

- **Two separate `<s-choice-list>`s, one `FieldSelection` state.** Native list +
  divider + "Metafields" heading + metafield list. A single merged list can't
  carry the section divider/heading; mutual exclusivity is enforced by the shared
  selection `kind`, not by merging.
- **The committed pill carries `namespace` + `key`,** the locked `METAFIELD`
  contract (`data-model.md` §7). No empty-key transient state — a metafield pill
  is only ever created from a fully-formed loaded definition.
- **Decode the picked metafield by lookup, not string-split.** `onChange` maps the
  choice value back to a `MetafieldDefinitionSummary` from the loaded list, so a
  `.` in the value can never corrupt the namespace/key split.
- **Same matching rule for both lists,** factored into one private predicate in
  `shopifyFields.ts`; `filterMetafieldDefinitions` matches `name` +
  `namespace.key`, `filterNativeFields` keeps matching label + `field` token.
- **Keep-selection-through-filter applies to both kinds** (Step 7 rule extended):
  typing never deselects; a selection filtered out of view stays committable.
- **Choice label = `name`; `type` is available but not required for MVP** (Step 8
  open question resolved): the native list shows no icons, so the metafield list
  matches it — show `name` (optionally a subdued `namespace.key` hint to
  disambiguate same-named definitions); no per-type icon in MVP. `type` stays on
  the summary for a future formatting hint.
- **Editing a `METAFIELD` pill pre-selects it** (Step 6 leftover resolved): the
  metafield is selectable now, so a clicked metafield pill opens pre-checked once
  definitions are loaded.

## What Step 9 does *not* own (boundary with Step 10+)

- **Persistence / Save / server re-validation / metaobject sync** → the
  post-editor slice. Still no Save; the committed `METAFIELD`/`SHOPIFY_FIELD` pills
  live only in local React state.
- **Drag reorder** (Steps 10–11) — the gutter `⠿` stays inert.
- **Clipboard paste** (Steps 12–13) — value cells still accept plain-text paste at
  a collapsed caret only.
- **Refetch / live refresh of definitions** — once-per-editor-mount stays (Step 8
  locked); a metafield created in another tab mid-session is not picked up without
  a reload (deferred polish, not MVP).
- **Variant-owner metafields** — `ownerType: PRODUCT` only (Step 8 locked).
- **No change to the fetch layer, the caret bridge, line breaks, or keyboard
  delete** — Step 9 is strictly the render + selection + commit-shape layer over
  Step 8's data.

## File placement (per `code-standards.md` File Organization)

- The shared matcher + `filterMetafieldDefinitions` (and the refactor of
  `filterNativeFields`) → [shopifyFields.ts](app/utils/shopifyFields.ts); tests →
  [shopifyFields.test.ts](app/utils/shopifyFields.test.ts) (framework-free, one
  tested matching rule).
- The two-kind selection, the metafield `<s-choice-list>`, the commit-shape
  branch, and the combined empty state →
  [SpecTableEditor.tsx](app/routes/app.templates_.$id/SpecTableEditor.tsx)
  (co-located).
- The fetch layer ([metafieldDefinitions.server.ts](app/shopify/metafieldDefinitions.server.ts))
  and its resource-route loader ([app.metafield-definitions.tsx](app/routes/app.metafield-definitions.tsx))
  are **unchanged** — Step 9 only consumes them.
- Any scoped styling → `SpecTableEditor.module.css`, **Polaris tokens /
  `currentColor` only, no hardcoded hex**.

## Open questions

- **Metafield choice secondary text.** Show only `name`, or `name` + a subdued
  `namespace.key` to disambiguate identically-named definitions across namespaces?
  Decide in 9.2; recommend the subdued hint only if same-named definitions are
  realistic — otherwise keep it as lean as the native list.
- **Pre-selecting a metafield while definitions are still loading.** If a merchant
  clicks a `METAFIELD` pill before the fetch resolves (unlikely — it resolved on a
  prior open and is cached, but possible on a first-ever edit-open), the radio
  can't render checked until the list arrives. The selection is held regardless;
  confirm in-browser the checked state appears when the list loads and Update is
  enabled throughout. Likely a non-issue given the load-once cache.
- **Combined-empty-state placement & scroll.** Exactly where the single "No fields
  match" sits relative to the two sections, and that it doesn't fight the modal's
  scroll (Step 8 verified the status region for this). Lock in 9.3.
- **`<s-choice-list>` with a changing/empty child set under live data.** Step 7
  confirmed the controlled `values` round-trips when native choices are filtered;
  re-confirm it holds for the metafield list whose children also appear/disappear
  as the fetch resolves and the query changes (selection must survive a child set
  going empty and refilling).
- **`type`-driven icon/hint — keep deferred?** Confirm MVP ships without it (lean,
  matches native list); the field stays on the summary for later.

## Done when

1. Sub-steps 9.1–9.3 each pass their verify check.
2. Opening Insert field shows, below the native fields, a **selectable list of the
   shop's product metafield definitions** (the Step 8 loaded-count is replaced);
   loading / error+Retry / empty-store states are unregressed.
3. The **Step 7 search filters both lists** with one shared, unit-tested rule
   (`filterMetafieldDefinitions` matches `name` + normalised `namespace.key`);
   selection is **mutually exclusive** across native and metafield and **survives
   being filtered out of view**.
4. Selecting a metafield + **Insert** drops a `METAFIELD` pill carrying
   `namespace` + `key` at the saved caret (rendered `Metafield · <key>`); clicking
   an existing metafield pill reopens the modal **pre-selected** and **Update**
   swaps it in place — completing the smart pill.
5. **No reducer action added or changed**; `INSERT_VALUE_PART_AT` / `SET_VALUE_PART`
   and the `ValuePart` union are unchanged; `data-model.md` is unchanged (METAFIELD
   already requires `namespace` + `key`, now strictly honored); **no persistence**.
6. **No hardcoded hex**; the Step 4 caret model, token rendering, line breaks,
   keyboard delete, the Step 5 modal mechanics, the Step 6 create/edit commit
   paths, the Step 7 search, and the Step 8 fetch + states are **unregressed**; the
   `Rows: N / 200` counter is unaffected.
7. `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:run` all
   pass; **browser-verified end to end** in the real embedded app (the metafield
   pick → pill flow above, no console errors — admin console included).
8. `progress-tracker.md` updated to mark Step 9 complete and point at Step 10
   (mouse drag reorder with `@dnd-kit`).
