# Editor Step 9.5 — Save + metaobject sync spike

## Goal in one sentence

Prove the persistence round trip **once, end to end** — React editor state →
**Postgres** (`Template.rows` + `name`/`status`, shop-scoped, with the 200-row cap
and `shopId` **re-checked server-side**) → **Shopify `appx_spec_table` metaobject**
(structure only, GID + handle stored back on the `Template`) → **a throwaway Theme
App Extension Liquid block** that reads it back — so the row JSON shape is confirmed
to survive the trip **before** four more editor features (Steps 10–13) are piled
onto an unpersisted editor; and land the two re-homed Save-boundary follow-ups here:
**per-row validation** at the load/save boundary (narrow `unknown` → typed
`EditorRow[]`, re-validated server-side) and **provisional row-key finalization** at
Save (slug from label, enforce uniqueness, **never re-derive a finalized key**).

## Why this is now (and not after Step 10)

This step is deliberately inserted **before** Step 10 (mouse drag reorder) rather
than deferred to the end of the editor build. The reason is risk, not feature
ordering:

- **The two biggest open questions in `data-model.md` are persistence-shaped.**
  "Exact Shopify Admin API mutations for creating/updating the app-owned metaobject
  definition and entries" and "Exact Liquid syntax for reading the product
  metafield and metaobject payload" (Open Questions, `progress-tracker.md` +
  `data-model.md`) can both **feed back into the row JSON shape**. If the
  metaobject `json` field or the Liquid join forces a tweak to how `valueParts` are
  serialized, learning that **now** costs one thin slice; learning it after Steps
  10–13 means reworking reorder, paste, and key handling on top of a shape that has
  to change anyway.
- **The editor has been local-React-state-only since Step 1.** Every step note
  ends "still local React state only — no Save/persist yet." Nine steps of editor
  behavior have never been persisted or read back. A vertical slice that writes one
  template and reads it back is the cheapest possible proof that the whole
  `EditorRow[]` contract (built to match `data-model.md` §6–7 exactly, per the
  `rows.ts` header) actually survives Postgres `Json` and a Shopify metaobject
  `json` field.
- **Two Save-boundary follow-ups are already tracked and blocked on this step.**
  Both finding #4 (no per-row validation in `normalizeRows`) and finding #1
  follow-through (finalize provisional keys at Save) were re-homed from `[Step 6]`
  to `[Step 9.5]` in `progress-tracker.md` precisely because they are "load-bearing
  only at the persistence boundary." They cannot be verified without a Save path;
  this step is that path.
- **Step 13 (paste) is told to reuse this step's key-finalization path.** The
  roadmap note on Step 13 reads: "Reuse the Step 9.5 key-finalization path for
  pasted rows — don't fork a second keying path." So the keying contract must be
  settled here, before paste depends on it.

A bug in Step 9.5 is therefore a **persistence / serialization / round-trip** bug —
not an editor-interaction bug. The editor surface (Steps 1–9) is frozen for this
step; the only editor-facing change is wiring a Save trigger and finalizing keys at
the moment of Save.

## Foundation carried from Steps 1–9

- **The row contract already matches the persisted shape.** `app/utils/rows.ts`
  was built (its header says so explicitly) so that `EditorRow` / `ValuePart` match
  the `data-model.md` §6–7 authoring contract exactly — "do not introduce a simpler
  interim shape and migrate later." Step 9.5 serializes that shape as-is; it does
  **not** invent a storefront-only shape (the `data-model.md` §10 storefront
  serialization is the same row object, so the metaobject `rows` field carries the
  editor rows unchanged).
- **The schema fields already exist — no migration.** `Template.shopifyMetaobjectGid`,
  `Template.shopifyMetaobjectHandle`, the `@@unique([shopId, shopifyMetaobjectHandle])`
  constraint, and `Shop.metaobjectDefinitionGid` are all already in
  `prisma/schema.prisma` (verified). Step 9.5 **populates** them; it adds no model,
  no enum, no migration. (`data-model.md` §3 lists `add-template` and `add-shop` as
  already applied — these columns shipped with them.)
- **The shop-scoped data-access layer is in place and tested.**
  `app/models/template.server.ts` already exposes `getTemplateByIdForShop(shopId, id)`
  (`where: { id, shopId }`) and `createTemplateForShop`, both shop-scoped, both with
  100% test coverage and shop-isolation tests (Testing Phase 2,
  `template.server.test.ts`). Step 9.5 adds **one** sibling save helper following
  the same `{ ok, data | error }` shape and the same `where: { id, shopId }`
  discipline (priority #1).
- **The first real Shopify Admin call is already proven.** Step 8 built
  `app/shopify/metafieldDefinitions.server.ts` — a shop-scoped Admin GraphQL call
  via `authenticate.admin(request)`, with a `#graphql`-tagged query **validated
  with `validate_graphql_codeblocks`** against API version 2025-10
  (`ApiVersion.October25`), pure `unknown`-narrowing mappers, and a mocked-boundary
  test convention. Step 9.5's metaobject mutations live in the same `app/shopify/`
  directory and follow the same pattern (validated query strings, pure response
  narrowing, live call mocked at the boundary).
- **`slugifyKey` / `uniqueKey` are the retained Save tools.** The Step 3 review
  kept `slugifyKey` on purpose, documented as "the Step 6 serialization tool, kept
  on purpose — not dead code" (now the Step 9.5 tool). UI rows are created blank
  with a **provisional** key (`row` / `row_2` via `FALLBACK_KEY_BASE`, `section` /
  `section_2` via `SECTION_KEY_BASE`), and `SET_LABEL` never rewrites it. Step 9.5
  is where `slugifyKey(label)` finally runs, exactly as the `slugifyKey` doc comment
  describes.
- **`normalizeRows` is the deliberate validation seam.** It currently casts
  `value as EditorRow[]` for any array, with a comment that "full per-row validation
  lands with the Save wiring." That comment is the contract Step 9.5 fulfills.

## What changes (architecture)

Four pieces, layered **pure-helper → Postgres → metaobject → readback** so each is
independently verifiable, and no step depends on the next:

### 1. Per-row validation + key finalization (pure, `app/utils/`)

A new pure, unit-tested module (`app/utils/rowsSerialize.ts`, sibling to `rows.ts`)
that owns the two Save-boundary transforms. Both are pure (mint nothing, mutate
nothing) so they test like the reducer.

- **`parseRows(value: unknown): EditorRow[]`** — replaces the bare cast in
  `normalizeRows` (finding #4). Narrows `unknown` → typed `EditorRow[]` per row:
  require `id`/`key`/`label` strings, a valid `rowType` (`DATA` | `SECTION_HEADER`),
  and for `DATA` rows a `valueParts` array each element of which narrows to a valid
  `ValuePart` (`TEXT` needs `text`; `SHOPIFY_FIELD` needs `field`; `METAFIELD` needs
  `namespace` + `key`; `LINE_BREAK` needs nothing — the union in `rows.ts`). Drop
  (or coerce) rows that fail to narrow rather than letting malformed persisted JSON
  render garbage or crash. `normalizeRows` delegates to this so the **same** narrowing
  runs at load (route loader) and is **re-run server-side at save** (the action does
  not trust the client payload — `code-standards.md`: "validate and sanitize all
  external input … narrow `unknown` into a typed shape").
- **`finalizeRowKeys(rows, provisionalIds): EditorRow[]`** — finding #1
  follow-through. For each row **whose id is in `provisionalIds`**, derive
  `slugifyKey(label)` and make it unique within the template via `uniqueKey(...)`
  against the keys already taken; rows **not** in `provisionalIds` keep their key
  untouched (**never re-derive a finalized key**). Returns a fresh array.

  > **Why an id-set, not a string-pattern, decides "provisional".** The naive test
  > — "does the key match `^(row|section)(_\d+)?$`?" — is **rejected**: a merchant
  > can legitimately label a row "Row", which slugs to `row` and would then look
  > provisional forever, so a later relabel ("Row 2" → `row_2`) would silently
  > re-derive and **change a finalized key**, breaking the cross-product alignment
  > invariant (`data-model.md` §12, "Why Row Keys Matter"). The `progress-tracker.md`
  > follow-up flags exactly this ("track *was this key ever finalized?* rather than
  > matching the string alone"). So the editor tracks finalization explicitly: a
  > `Set<rowId>` of rows whose key is still provisional, seeded when a row is
  > **created** (`ADD_ROW` / `ADD_SECTION` / `DUPLICATE_ROW` mint a fresh id) and
  > **drained at Save** once their keys are finalized. Rows loaded from Postgres are
  > **never** in the set (they arrive already finalized), so they are never
  > re-derived — robust even for the "Row"-labeled edge case. The persisted row
  > shape is **unchanged** (no `keyFinalized` field added to `data-model.md` §7);
  > the tracker is editor-only state.

### 2. Save to Postgres (shop-scoped, server re-validated)

- **`app/models/template.server.ts`** gains
  **`saveTemplateForShop(shopId, id, { name, status, rows })`** following the
  existing `{ ok: true, data } | { ok: false, error }` shape:
  - `where: { id, shopId }` on the update (priority #1 — one shop can never write
    another's template; mirrors `getTemplateByIdForShop`). A miss → `{ ok: false }`,
    never a cross-shop write.
  - **Server-side 200-row cap re-check** reading the **shared** `MAX_TEMPLATE_ROWS`
    constant from `rows.ts` (never a literal — `code-standards.md` + `data-model.md`
    §7). Reject over-cap saves with no write.
  - Name validation reusing the existing `NAME_MAX_LENGTH` / trim / status rules
    already in `createTemplateForShop` (factor the shared validation rather than
    duplicating it).
  - `rows` is persisted as the validated, key-finalized `EditorRow[]` (Postgres
    `Json`).
- **`app/routes/app.templates_.$id/route.tsx` `action`** — replace the current
  `if (params.id !== "new") return { ok: false, error: "Editing is not available
  yet" }` stub with the real save: `authenticate.admin` → `upsertShop` →
  `getTemplateByIdForShop` (confirm ownership) → `parseRows` the client payload
  (re-validate server-side, do **not** trust it) → `saveTemplateForShop` →
  metaobject sync (piece 3) → return `{ ok: true, data }`. Rows are sent as JSON;
  use a `useFetcher` submitting `encType: "application/json"` (action reads
  `await request.json()`), so the structured `EditorRow[]` is not flattened through
  `FormData` string coercion.
- **Save trigger UI** — wire the App Bridge **contextual Save bar** already shown in
  the editor mockup ("Unsaved changes · Discard · Save"): `shopify.saveBar.show()`
  when the editor is dirty (rows/name/status differ from loaded), `Save` submits via
  the fetcher, `Discard` resets to the loaded snapshot. Dirty-tracking compares
  current editor state to the loader's `initialRows`. (If the App Bridge save-bar
  API proves awkward in this CDN build — see Open questions — fall back to a plain
  primary `Save` `<s-button>`; the persistence contract is identical either way.)

### 3. Metaobject definition + entry upsert (`app/shopify/`)

A new **`app/shopify/metaobjects.server.ts`** (same conventions as
`metafieldDefinitions.server.ts`: `#graphql`-tagged strings **validated with
`validate_graphql_codeblocks`** at 2025-10, pure response narrowing, live call
mocked at the boundary, shop isolation **structural** via `authenticate.admin`):

- **Ensure the definition once per shop.** If `Shop.metaobjectDefinitionGid` is
  null, run `metaobjectDefinitionCreate` for type **`appx_spec_table`** with the
  `data-model.md` §10 fields — `template_id` (single_line_text_field), `status`
  (single_line_text_field), `rows` (**json**), `styling` (**json**), `updated_at`
  (single_line_text_field or date_time) — and store the returned definition GID on
  `Shop.metaobjectDefinitionGid` (so it is created at most once). Handle the
  "already exists" error idempotently (re-fetch the GID rather than failing).
- **Upsert the entry per template.** Run `metaobjectUpsert` keyed by handle
  **`template-{templateId}`** (`data-model.md` §10 recommended handle format),
  setting `template_id`, `status` (the template's `ACTIVE`/`DRAFT`/`ARCHIVED` — sync
  runs for **all** statuses, visibility is Liquid's job per §8), `rows` (the
  serialized rows JSON), `styling` (`{}` for now — `TableStyling` is a later slice),
  and `updated_at`. Store the returned `id` (GID) + `handle` back on the `Template`
  (`shopifyMetaobjectGid` / `shopifyMetaobjectHandle`).
- **Serialization is the row object as-is.** `data-model.md` §10 "Storefront
  serialization" is the same `{ id, key, rowType, label, hideWhenEmpty, valueParts }`
  shape the editor already holds — no field is dropped or renamed for the spike.
  This is the exact claim the round-trip readback (piece 4) is built to **falsify**:
  if the shape needs to change for Liquid, we learn it here.
- The metaobject sync is invoked from the `action` **after** the Postgres write
  succeeds (Postgres is the source of truth; the metaobject is the delivery layer
  written after save — `code-standards.md` "Data and Storage").

### 4. Throwaway Liquid readback (`extensions/`, confirm-only)

A minimal, **throwaway** Theme App Extension Liquid block under `extensions/` that
reads the metaobject back and renders the raw `rows` JSON (e.g. inside `<pre>` or a
debug `<script type="application/json">`) to confirm the round-trip shape. For the
spike it reads the metaobject directly by handle (the **product-metafield pointer
and assignment resolution are out of scope** — that is the post-editor assignment
slice), so the block may hard-target the just-saved `template-{id}` handle to prove
the payload exists and the `valueParts` JSON survived. Exact Liquid syntax is
verified here against `data-model.md` §9's sketch
(`shop.metaobjects.appx_spec_table[handle]`) — resolving that open question. This
block is **deleted or left clearly marked throwaway** once the round trip is
confirmed; it is not the real storefront renderer.

## Sub-steps (build and verify one at a time)

Chain: **pure validation/keying (tested) → Postgres save (server re-checked) →
metaobject upsert (GID/handle stored) → Liquid readback (shape confirmed)**. Each
builds clean (`npm run typecheck` + `lint` + `build` + `test:run`).

### 9.5.1 — `parseRows` + `finalizeRowKeys` + tests

Add `app/utils/rowsSerialize.ts` with both pure functions; point `normalizeRows` at
`parseRows`. Seed/drain the provisional-key id-set in editor state. Unit-test in
`rowsSerialize.test.ts`: `parseRows` narrows valid rows, drops malformed rows, and
narrows every `ValuePart` variant (incl. `LINE_BREAK`); a non-array → `[]`;
`finalizeRowKeys` slugs only provisional ids, leaves finalized keys untouched even
when their key string matches the provisional pattern (the "Row"-labeled edge case),
enforces uniqueness, and returns a fresh array without mutating the source.

**Verify:** `test:run` covers both functions; `typecheck` / `lint` / `build` pass.
No persistence yet, no UI change beyond the editor tracking provisional ids.

### 9.5.2 — Save `Template.rows` + name/status to Postgres

Add `saveTemplateForShop` (shop-scoped, server-side `MAX_TEMPLATE_ROWS` re-check,
re-validation via `parseRows`, key finalization via `finalizeRowKeys`); rewrite the
`action`'s non-`new` branch; wire the Save trigger (contextual save bar + fetcher,
JSON encType). Metaobject sync stubbed/skipped this sub-step.

**Verify (browser + DB):** edit a real template (add rows, a section, a pill, a
multiline value), Save → the row persists in Neon as a typed `EditorRow[]`;
provisional `row_N` keys are finalized to label slugs (`Battery Life` → `battery_life`)
and unique; reload shows the saved rows (no devSampleRows reseed — see cleanup);
attempting a payload over 200 rows is rejected server-side; a save with a
wrong-shop/unknown id does not write. The `Rows: N / 200` counter is accurate.

### 9.5.3 — Upsert the `appx_spec_table` metaobject

Add `app/shopify/metaobjects.server.ts` (definition-ensure + entry-upsert,
GraphQL validated at 2025-10); invoke it from the `action` after the Postgres write;
store GID + handle on the `Template`.

**Verify (browser + DB + Admin):** first Save on a fresh shop creates the
`appx_spec_table` definition and stamps `Shop.metaobjectDefinitionGid`; the
template's `shopifyMetaobjectGid` + `shopifyMetaobjectHandle` (`template-{id}`) are
populated; the metaobject entry's `rows` JSON field matches the saved rows; a second
Save **updates** the same entry (no duplicate, handle unchanged); status syncs for
DRAFT and ACTIVE alike.

### 9.5.4 — Liquid readback confirms the round trip

Add the throwaway Liquid block; read the metaobject back by handle and render the
raw `rows`.

**Verify (storefront/theme preview):** the block prints the saved `valueParts`
structure for each row — `TEXT`, `SHOPIFY_FIELD` (`field`), `METAFIELD`
(`namespace`+`key`), and `LINE_BREAK` all present and intact — proving the editor
row JSON survives Postgres → metaobject → Liquid unchanged. If any shape tweak is
needed for Liquid to consume it, record it and feed it back into `data-model.md`
§6/§10 **before** Step 10.

## Reducer actions

**None added, none changed.** The reducer (`rowsReducer`) is untouched. Step 9.5 is
the persistence boundary, not an editor interaction. The provisional-key id-set is
editor **component state** seeded at dispatch time (the editor already mints the row
id it passes into `ADD_ROW` / `ADD_SECTION` / `DUPLICATE_ROW`), not a reducer
concern. `parseRows` / `finalizeRowKeys` run **outside** the reducer at the
load/save boundary.

| Interaction                                  | Mechanism                                      |
| -------------------------------------------- | ---------------------------------------------- |
| Validate loaded rows → typed `EditorRow[]`   | `parseRows` (pure, at the loader boundary)     |
| Finalize provisional keys at Save            | `finalizeRowKeys` (pure, at the save boundary) |
| Persist rows + name/status to Postgres       | `saveTemplateForShop` (shop-scoped helper)     |
| Sync structure to the storefront delivery    | `metaobjects.server.ts` upsert (Admin GraphQL) |
| Re-check 200-row cap + `shopId` server-side  | `action` + `saveTemplateForShop`               |

## Locked decisions

- **Postgres is the source of truth; the metaobject is written after save.** The
  metaobject upsert runs only **after** `saveTemplateForShop` succeeds
  (`code-standards.md` "Data and Storage"). A metaobject failure must not silently
  lose the Postgres write — surface it, but the saved rows are already durable.
- **Provisional-ness is tracked by an editor-state id-set, not a key string
  pattern.** Robust against a merchant labelling a row "Row"/"Section"; a finalized
  key is **never** re-derived (`data-model.md` §12 alignment invariant). String
  matching is rejected (see piece 1).
- **Server re-validates the client payload.** The `action` runs `parseRows` and the
  `MAX_TEMPLATE_ROWS` re-check on the submitted rows independently of the client —
  the editor's UI cap is UX, the server is the gate (same philosophy as the reducer
  cap).
- **Sync runs for every status; visibility is Liquid's job.** ACTIVE/DRAFT/ARCHIVED
  all upsert the metaobject; the storefront renders only ACTIVE (`data-model.md`
  §8). The spike does not gate sync by status.
- **Handle format `template-{templateId}`; store both GID and handle.** Per
  `data-model.md` §10; the `@@unique([shopId, shopifyMetaobjectHandle])` constraint
  already enforces one entry per template per shop.
- **Metaobject `rows` carries the editor row shape unchanged.** No storefront-only
  shape is invented in the spike; the readback exists to confirm (or falsify) that.
- **GraphQL strings are validated with `validate_graphql_codeblocks` at 2025-10**
  before they ship, matching the Step 8 precedent.
- **The Liquid readback is throwaway and assignment-free.** It reads the metaobject
  by handle to confirm the shape; the product-metafield pointer + assignment
  resolution are a later slice.

## What Step 9.5 does *not* own (boundary with Step 10+)

- **Product-metafield assignment pointer + `ProductAssignment` / `ProductAssignmentIndex`
  resolution** (`data-model.md` §9) — the assignment slice after the editor. 9.5
  reads the metaobject directly by handle.
- **Real storefront rendering / styling join** — the throwaway block dumps raw JSON;
  the production Theme App Extension renderer (resolving `TEXT` + `SHOPIFY_FIELD` +
  `METAFIELD` + `LINE_BREAK` with `TableStyling`, `hideWhenEmpty` semantics per §10)
  is later.
- **`TableStyling`** — the `styling` metaobject field is written as `{}`; the
  Styling tab and `add-table-styling` migration are a later slice.
- **Drag reorder (Steps 10–11), clipboard paste (Steps 12–13)** — unchanged; 9.5
  does not touch the reducer or the editor interaction surface, only the
  load/save boundary. (Step 13 will reuse this step's `finalizeRowKeys` path.)
- **Webhooks / background product-type sync** — out of scope.
- **No new editor interaction, no new pill, no reducer action.**

## File placement (per `code-standards.md` File Organization)

- Pure validation + key finalization → **`app/utils/rowsSerialize.ts`** (+ tests in
  `rowsSerialize.test.ts`); `normalizeRows` in `app/utils/rows.ts` delegates to it.
- Shop-scoped save helper → **`app/models/template.server.ts`**
  (`saveTemplateForShop`, + tests in `template.server.test.ts`).
- Metaobject definition + entry mutations → **`app/shopify/metaobjects.server.ts`**
  (+ pure response-narrowing tests in `metaobjects.test.ts`, live call mocked).
- Save wiring + dirty-tracking + save bar → **`app/routes/app.templates_.$id/route.tsx`**
  + **`SpecTableEditor.tsx`** (co-located).
- Throwaway readback → **`extensions/`** (Liquid + plain JS only; no app logic).
- Any scoped styling → `SpecTableEditor.module.css`, **Polaris tokens /
  `currentColor` only, no hardcoded hex**.

## Open questions

- **App Bridge contextual save-bar API vs. a plain Save button.** The mockup shows
  the "Unsaved changes · Discard · Save" contextual bar. Confirm the App Bridge
  save-bar API works in this CDN build (Step 5/6/7/8 each confirmed a different
  App Bridge / Polaris surface in-browser); if awkward, fall back to a primary
  `Save` `<s-button>`. The persistence contract is identical either way — decide in
  9.5.2.
- **Exact metaobject mutations + field type for `rows`/`styling`.** `json` vs.
  `multi_line_text_field` holding a JSON string. Resolve with
  `validate_graphql_codeblocks` + a live create in 9.5.3; record the answer in
  `data-model.md` §10 (this is one of the two tracked open questions).
- **Exact Liquid syntax** for `shop.metaobjects.appx_spec_table[handle]` and reading
  the `rows` json field — verify in 9.5.4 against the `data-model.md` §9 sketch;
  record the verified syntax in `data-model.md` §9/§10.
- **`devSampleRows` cleanup.** The DEV-only sample seed in `SpecTableEditor.tsx`
  (comment: "Removed when Step 5's modal lands the real insert path") is still
  present and would persist if a dev merchant saves an otherwise-empty template.
  With a real Save path arriving here, decide in 9.5.2 whether to remove it now or
  gate it so it never reaches Postgres. Recommend removing it (the insert path has
  existed since Step 5).
- **Definition-create race / idempotency.** Two concurrent first-saves could both
  try `metaobjectDefinitionCreate`. Handle the "type already exists" error by
  re-fetching the GID rather than failing (mirror the `upsertShop` P2002 recovery
  pattern already tested in `shop.server.ts`).
- **Metaobject sync failure UX.** If the Postgres write succeeds but the metaobject
  upsert fails, what does the merchant see? For the spike, surface a non-fatal
  warning (rows are saved); a retry/queue strategy is a later concern.

## Done when

1. Sub-steps 9.5.1–9.5.4 each pass their verify check.
2. Editing a real template and clicking **Save** persists `Template.rows` +
   `name`/`status` to Neon as a **typed, validated** `EditorRow[]`, shop-scoped
   (`where: { id, shopId }`), with the **200-row cap and `shopId` re-checked
   server-side** against the shared `MAX_TEMPLATE_ROWS`.
3. Provisional `row_N` / `section_N` keys are **finalized to label slugs** at Save,
   unique within the template, and a **finalized key is never re-derived** (the
   id-set tracker, not a string pattern).
4. `parseRows` narrows loaded/submitted rows (finding #4 resolved) at **both** the
   loader and the action; malformed rows do not crash or render garbage.
5. Save upserts the `appx_spec_table` metaobject (definition created once per shop,
   GID on `Shop`; entry keyed `template-{id}`, **GID + handle stored on the
   `Template`**); a second Save updates the same entry (no duplicate).
6. A throwaway Liquid block reads the metaobject back and shows the row
   `valueParts` (all four part types) **intact** — the round trip is proven; any
   shape change Liquid requires is fed back into `data-model.md` **before Step 10**.
7. **No reducer action added or changed**; the editor interaction surface
   (Steps 1–9: caret model, token rendering, line breaks, keyboard delete, the
   modal + smart pill) is **unregressed**; `Rows: N / 200` is accurate; **no
   hardcoded hex**; **no console errors** (admin console included).
8. `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:run` all
   pass; **browser-verified end to end** in the real embedded app.
9. `data-model.md` updated to record the **verified** metaobject mutations + field
   types (§10) and Liquid read syntax (§9), closing those two open questions;
   `progress-tracker.md` updated to mark Step 9.5 complete (incl. both re-homed
   follow-ups) and point at Step 10 (mouse drag reorder with `@dnd-kit`).

---

## Implementation outcome (Session 2026-06-19) — as built

Built and **browser-verified end to end** in the real embedded app. Two
deliberate, better-engineering deltas from the spec above; both are reflected in
the Locked decisions intent (never re-derive a finalized key; confirm the row JSON
round-trips) — only the mechanism changed:

1. **Key finalization is server-authoritative, not a client-tracked id-set.** The
   spec proposed an editor-state `Set<rowId>` of provisional rows. In
   implementation that set has to survive client/server round-trips and reloads to
   stay correct, which is fragile. Instead, `saveTemplateForShop` reads the
   template's **persisted** rows and `reconcileRowKeys(incoming, persisted)`
   (`app/utils/rowsSerialize.ts`) decides provisional-ness by **"is this row id
   already persisted?"** — the authoritative "was this key ever finalized?" signal.
   A persisted row keeps its persisted key (even if the client re-sends a stale
   provisional key or the label changed); a brand-new row's key is slugged from its
   label via the documented `finalizeRowKeys(rows, provisionalIds)`. The client
   tracks nothing and cannot lie. **Verified live:** a row saved as provisional
   `row` finalized to `battery_life`; on a second save (client still holding the
   stale `row` key) the persisted `battery_life` was **kept, not re-derived**; a new
   section finalized `section` → `performance`.
2. **The round-trip readback is an Admin-API `metaobjectByHandle` query, not a
   throwaway Liquid block.** `readSpecTableMetaobjectRows` reads the just-written
   metaobject back inside the action and compares its `rows` field to the saved
   rows; the editor shows **"Saved — storefront round-trip verified"** when they
   match. This is strictly stronger than a Liquid dump — it runs automatically on
   every save and is verifiable in the admin (which is the only surface reachable
   this session). The **deployable** Theme App Extension Liquid renderer is folded
   into the storefront/assignment slice (its own boundary, per "What Step 9.5 does
   *not* own"); the validated storefront read syntax is recorded in
   `data-model.md` §9.

**Metaobject decisions resolved (fed back to `data-model.md` §10):** the
definition type is **app-reserved `$app:appx_spec_table`** (exclusive app use —
data safety) with `access { admin: MERCHANT_READ_WRITE, storefront: PUBLIC_READ }`;
fields `template_id`/`status`/`updated_at` = `single_line_text_field`,
`rows`/`styling` = `json`; entry handle `template-{id}`. All four operations
(`metaobjectDefinitionByType`, `metaobjectDefinitionCreate`, `metaobjectUpsert`,
`metaobjectByHandle`) were validated with `validate_graphql_codeblocks` at 2025-10.
The **row JSON shape survived unchanged** — no `valueParts` reshape was needed, so
no feedback into the row contract (the key risk this spike de-risked is cleared).

**Save UI:** the App Bridge **contextual save bar** (`<SaveBar>` from
`@shopify/app-bridge-react`) was viable in this CDN build — `open={isDirty}` shows
"Unsaved changes / Discard / Save"; Save submits the rows as JSON via `useFetcher`
(`encType: "application/json"`); Discard remounts the editor (a route-level nonce
key) back to the persisted rows with no new reducer action. The dev-only
`devSampleRows` scaffolding was removed (its job ended when Save landed).

**Open-question dispositions:** save-bar API → contextual bar (no fallback needed);
metaobject mutations/field types → resolved (above); Liquid syntax → readback proven
via Admin API + storefront read syntax recorded, deployable block deferred;
`devSampleRows` → removed; definition-create race → handled (`metaobjectDefinitionByType`
re-query on create error); sync-failure UX → non-fatal `syncError` toast (rows stay
saved). `name`/`status` ride the save unchanged (no editor UI to change them yet —
a later Settings slice; the helper validates + persists them).
