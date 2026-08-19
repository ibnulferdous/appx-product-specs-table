# Editor Step 8 — Fetch the shop's metafield definitions

## Goal in one sentence

Make the **first real Shopify call** of the editor: fetch the shop's **product
metafield definitions** from Admin GraphQL, **shop-scoped**, behind a small
server module + a resource-route loader, triggered **lazily on the first modal
open** via a fetcher, with explicit **loading / empty / error** states surfaced
in the modal — **fetch only**, the definitions are **not rendered as selectable
choices yet** (that is Step 9), with **no reducer change, no new pill, and no
persistence**.

## Why this is now

Steps 5–7 built the whole picker shell over data we fully control: the modal,
the caret bridge, one-modal-two-modes (Insert / Update), a static
`NATIVE_SHOPIFY_FIELDS` list, and a pure search box (`filterNativeFields`). The
one thing the picker still can't offer is the **metafield** — and metafields,
unlike native fields, are **merchant-defined and vary per shop**, so they must be
**fetched**, not hard-coded (`shopifyFields.ts` already records exactly this
split). This is the editor's first call out to Shopify, so isolating it as its
own step — **fetch + states only, no rendering** — keeps three hard things from
debuting together:

- The **network layer** (Admin GraphQL call, pagination, shop-scoping via the
  Shopify session token, error handling) lands and is verified on its own.
- The **async UI states** (loading / empty / error / loaded) are wired and seen
  before any selectable list depends on them.
- Step 9 then drops the fetched definitions into a list that is **already loaded
  and already filtered** by the Step 7 search box — so live data and rendering
  never debut together, exactly as Step 7 was built so live data and search
  wouldn't.

A bug in Step 8 is a **fetch/state bug** (visible as a spinner that never
resolves, a wrong count, an unhandled error). A bug in Step 9 will be a pure
**rendering/selection bug**. Keeping them apart keeps each diagnosable.

## Foundation carried from Steps 5–7

- **One modal, two modes, reset on open.** `handleOpenInsertField` (create) and
  `handleEditPart` (edit) reset `editTarget` / `selectedField` / `searchQuery`
  before `shopify.modal.show(...)`. Step 8 hangs the **first-open fetch trigger**
  off this same open path; it adds **nothing to reset** (the fetched list is
  shop-level data, not per-open state — it is fetched once and cached for the
  editor's lifetime, see Locked decisions).
- **The modal body already has a search box above a list.** The Step 7
  `<s-search-field>` + `filterNativeFields(searchQuery)` `<s-choice-list>` are
  unchanged. Step 8 adds a **status region** in the modal body (below the native
  list area) that reflects the fetch; Step 9 turns that region into the actual
  filtered metafield section.
- **The data-vs-component split is already set.** `shopifyFields.ts` is pure and
  framework-free; native fields live there because they never vary. Metafields
  vary per shop, so their fetch lives in the Shopify layer
  (`app/shopify/`, per `code-standards.md` File Organization), **not** in
  `shopifyFields.ts` and **not** inline in the component.
- **Shop isolation is structural here, not a Prisma `where`.** Every other
  read/write in the app scopes by `shopId`; this call scopes by the **Shopify
  Admin token** that `authenticate.admin(request)` binds to the current shop, so
  the query can only ever return *this* shop's definitions. No Postgres, no
  cross-shop surface (priority #1 still honored — just enforced by the session,
  not the ORM).
- **No persistence, no reducer touch.** Still local React state for edits; this
  step adds a read-only network fetch and its UI states. **No reducer action**
  (it inserts and edits nothing), no Save, no metaobject.

## What changes (architecture)

Three pieces, layered server → route → UI so each is independently verifiable:

1. **A Shopify data module + a pure mapper.** New
   `app/shopify/metafieldDefinitions.server.ts`:
   - `fetchProductMetafieldDefinitions(admin): Promise<MetafieldDefinitionSummary[]>`
     runs the **validated** query below against `admin.graphql(...)`, **pages
     through all results** via `pageInfo.hasNextPage` / `endCursor` (with a
     safety cap — see Open questions), and maps each `edges[].node` to a flat
     summary.
   - A separate **pure** `mapDefinitionsResponse(json)` does the edge→summary
     flattening and narrows `unknown` → typed (per `code-standards.md`
     "validate/sanitize all external input at the entry point"). It is the
     **unit-tested** part; the live `admin.graphql` call is not unit-tested
     (consistent with the testing strategy — test the pure transform, mock at the
     boundary).
   - The summary shape carries exactly what the pill and Step 9's picker need:

     ```ts
     export interface MetafieldDefinitionSummary {
       id: string;        // gid — stable, handy for keys/debugging
       namespace: string; // persisted in the METAFIELD pill
       key: string;       // persisted in the METAFIELD pill
       name: string;      // human label shown in the picker (Step 9)
       type: string;      // e.g. "single_line_text_field" — for an icon / future hints
     }
     ```

     `namespace` + `key` are the locked `METAFIELD` value-part contract
     (`data-model.md` §7); `name` is the picker label (never persisted), mirroring
     how `NativeShopifyField` separates `field` (persisted) from `label`
     (display). This makes the summaries **directly filterable by the Step 7
     matching rule** in Step 9 (match `name` + a normalised `namespace.key`
     token).

   The validated Admin GraphQL query (Admin API `2026-04`, confirmed with
   `validate_graphql_codeblocks`):

   ```graphql
   query ProductMetafieldDefinitions($first: Int!, $after: String) {
     metafieldDefinitions(ownerType: PRODUCT, first: $first, after: $after) {
       edges {
         node {
           id
           namespace
           key
           name
           type {
             name
           }
         }
       }
       pageInfo {
         hasNextPage
         endCursor
       }
     }
   }
   ```

2. **A resource-route loader.** New `app/routes/app.metafield-definitions.tsx`
   — a route with a **loader only, no default export** (a React Router resource
   route at `/app/metafield-definitions`, inside `/app` so `authenticate.admin`
   resolves the embedded session). It calls `authenticate.admin(request)`, then
   `fetchProductMetafieldDefinitions(admin)`, and returns the project's standard
   shape: `{ ok: true, definitions }` on success, `{ ok: false, error }` on a
   thrown GraphQL/network error. This keeps the fetch in a **loader** (not a
   component) — satisfying the React rule "data comes from loaders" — while still
   letting the UI observe it as async (loaded on demand, not with the page).

3. **A fetcher + async states in the modal (fetch only).** In
   `SpecTableEditor.tsx`, a `useFetcher<typeof loader>()` calls
   `fetcher.load("/app/metafield-definitions")` **once, on the first modal open**
   (guarded by a ref / `fetcher.data == null && state === "idle"` so reopening
   never refetches). The modal body renders a **status region** below the native
   list that reflects the fetch:
   - **loading** — `fetcher.state !== "idle"` → an `<s-spinner>` / "Loading
     metafields…".
   - **error** — `fetcher.data.ok === false` → an `<s-banner tone="critical">`
     with a **Retry** affordance (re-issues `fetcher.load`).
   - **empty** — `ok` with `definitions.length === 0` → a short note ("This store
     has no product metafield definitions").
   - **loaded** — `ok` with definitions → for **Step 8 only**, a confirmation
     (e.g. a count "N metafields available" and/or `log`), **not** the selectable
     choices. Rendering them as filterable `<s-choice>`s under the search box is
     **Step 9**.

   The native-field search + list and the Insert / Update commit paths are
   **untouched**; the status region sits alongside them and never gates the
   primary button.

### Eager-in-loader vs. lazy-fetcher (the one design choice)

**Locked: lazy fetcher on first modal open**, not an eager fetch in the editor's
own route loader. Rationale:

- The definitions are **only ever needed inside the modal**, which a merchant may
  never open in a given editing session — eager fetching would make **every**
  editor page-load wait on a Shopify GraphQL round-trip for data that is often
  unused (slower LCP, the opposite of the App Store speed bar).
- The roadmap explicitly asks for **"explicit loading / empty / error states"** —
  those only exist if the fetch is **observably async in the UI**. An eager page
  loader would suspend the whole route and surface no in-modal loading state; a
  loader error would blow up the **editor**, not degrade the **picker**.
- A resource route + `useFetcher` keeps the fetch in a **loader** (not a
  component `fetch`), so the React/Remix conventions hold, while giving genuine
  per-open async states and load-once caching.

## Sub-steps (build and verify one at a time)

Chain: **server module + pure mapper (tested) → resource-route loader → fetcher
+ states in the modal**. Each builds clean (`npm run typecheck` + `lint` +
`build` + `test:run`).

### 8.1 — `app/shopify/metafieldDefinitions.server.ts` + mapper tests

Add `fetchProductMetafieldDefinitions(admin)` (runs the validated query, pages
through all results with a safety cap) and the pure `mapDefinitionsResponse(json)`
(edge→`MetafieldDefinitionSummary` flatten + `unknown`-narrowing). Unit-test
`mapDefinitionsResponse` in `app/shopify/metafieldDefinitions.test.ts`: a normal
multi-edge response maps in order; missing/empty `edges` → `[]`; a malformed node
(missing `namespace`/`key`) is dropped or defaulted defensively (decide and test
the rule); the source JSON is not mutated. The live call is not unit-tested.

**Verify:** `test:run` covers the mapper; `typecheck` / `lint` / `build` pass. No
UI change yet.

### 8.2 — The resource-route loader

Add `app/routes/app.metafield-definitions.tsx` with a loader only:
`authenticate.admin(request)` → `fetchProductMetafieldDefinitions(admin)` →
`{ ok: true, definitions }`, or `{ ok: false, error }` on a thrown error. No
default export (resource route).

**Verify:** navigating to `/app/metafield-definitions` in the embedded app (or
hitting it via the fetcher in 8.3) returns the shop's product definitions as
JSON; a forced error returns `{ ok: false }` without crashing the editor;
`typecheck` / `lint` / `build` pass.

### 8.3 — Fetcher + loading / empty / error states in the modal (fetch only)

Wire `useFetcher`; trigger `fetcher.load("/app/metafield-definitions")` once on
the first modal open (guarded so reopening never refetches). Render the status
region (loading / error+retry / empty / loaded-count) in the modal body below the
native list. **Do not** render the definitions as selectable choices — that is
Step 9.

**Verify (browser):** open Insert field → the fetcher fires once → a loading
state shows, then resolves to the loaded count (or the empty/error state); the
native search + list and Insert/Update still work; reopening the modal does **not**
refetch; an induced error shows the banner + Retry recovers; the `Rows: N / 200`
counter is unchanged; **no console errors** (watch the admin console too, per the
Step 7 view-transition gotcha); `typecheck` / `lint` / `build` / `test:run` pass.

---

## Reducer actions

**None added, none changed.** Step 8 is a read-only fetch + its UI states; it
inserts and edits nothing. `INSERT_VALUE_PART_AT` (create) and `SET_VALUE_PART`
(edit) remain the only commit paths and are untouched. `data-model.md` and the
`ValuePart` union are unchanged.

| Interaction                                  | Reducer action                       |
| -------------------------------------------- | ------------------------------------ |
| Fetch the shop's metafield definitions       | **none** — loader + fetcher          |
| Insert a selected field at the saved caret    | `INSERT_VALUE_PART_AT` — existing    |
| Update an existing pill's field in place       | `SET_VALUE_PART` — existing          |

## Locked decisions

- **Lazy fetch on first modal open, cached for the editor's lifetime.** Not eager
  in the editor route loader (see "Eager vs. lazy"). Loaded once; reopening reuses
  the result; an error path offers Retry.
- **Shop isolation via the Shopify Admin token,** not a Prisma `where`.
  `authenticate.admin(request)` binds the GraphQL client to the current shop, so
  the query can only return this shop's definitions.
- **`ownerType: PRODUCT` only.** MVP spec tables resolve against the product (and
  its selected/first variant on the storefront), so only product-owner
  definitions are offered. Variant-owner metafields are out of MVP scope
  (`feature-roadmap.md`).
- **Summary shape = `{ id, namespace, key, name, type }`.** `namespace` + `key`
  are the locked `METAFIELD` pill contract; `name` is the picker label; `type`
  feeds an icon / future formatting hints. Lean by design (≈5 fields), mirroring
  `NativeShopifyField`'s persisted-vs-display split so Step 9's search can filter
  it with the same rule.
- **The Shopify call lives in `app/shopify/`,** with a separate pure mapper that
  is unit-tested; the component never calls `admin.graphql` directly.
- **Fetch only — no rendering.** Step 8 proves the data + states; selectable
  metafield choices are Step 9.

## What Step 8 does *not* own (boundary with Step 9+)

- **Rendering the definitions as selectable choices, the `METAFIELD` pill commit,
  and metafield edit** → **Step 9**. Step 9 renders the fetched list below the
  native fields, covered by the **same Step 7 search box** (matching `name` + a
  normalised `namespace.key` token via the shared rule), and makes selecting one +
  Insert drop a `METAFIELD` pill carrying `namespace` + `key`.
- **Persistence / Save / server re-validation / metaobject sync** → the
  post-editor slice. Still no Save.
- **Drag reorder** (Steps 10–11) and **clipboard paste** (Steps 12–13) — the
  gutter `⠿` stays inert.
- **No change to the pill model, the caret bridge, the search box, or the commit
  paths** — Step 8 is strictly the data-fetch + async-state layer feeding Step 9.

## File placement (per `code-standards.md` File Organization)

- The Admin GraphQL call + pure mapper →
  `app/shopify/metafieldDefinitions.server.ts` (new `app/shopify/` directory —
  "All Shopify API calls"), tests in
  `app/shopify/metafieldDefinitions.test.ts` (mapper only).
- The resource-route loader → `app/routes/app.metafield-definitions.tsx`
  (loader only, no default export).
- The fetcher wiring + status region → `SpecTableEditor.tsx` (co-located); any
  scoped styling → `SpecTableEditor.module.css`, **Polaris tokens /
  `currentColor` only, no hardcoded hex**.

## Open questions

- **Pagination cap.** Page through all definitions, or cap at a sane upper bound?
  Recommend looping `pageInfo.hasNextPage` with `first: 250` and a hard safety cap
  (e.g. a few pages); if the cap is hit, `log` what was dropped rather than
  silently truncating (per the "no silent caps" principle). Confirm a realistic
  ceiling for product metafield definitions per shop.
- **Malformed/partial node handling in the mapper.** Drop nodes missing
  `namespace`/`key`, or keep with a defaulted label? Lock the rule and test it
  (these are the value-part contract fields).
- **Status-region placement in the modal.** Exactly where the loading/empty/error
  block sits relative to the search box and native list so Step 9 can convert it
  into the metafield section without re-layout. Verify in-browser it doesn't push
  the native list or fight the modal's scroll.
- **Refetch policy.** Once-per-editor-mount is locked; confirm there is no case
  (e.g. the merchant creating a metafield in another tab mid-session) where a
  manual refresh is worth offering in MVP — likely **no** (defer to a later
  polish), but note it.
- **`type` field usage.** `type { name }` is fetched; confirm Step 9 actually
  needs it (icon / hint) or whether it can be dropped to stay leaner.

## Done when

1. Sub-steps 8.1–8.3 each pass their verify check.
2. Opening the Insert field modal triggers a **single** shop-scoped Admin GraphQL
   fetch of the shop's **product metafield definitions**, with visible
   **loading → loaded/empty/error** states; reopening does **not** refetch; the
   error state offers a working **Retry**.
3. The fetch is **shop-isolated** (via the Shopify session token), `ownerType:
   PRODUCT`, paginated with a safety cap, and returns `MetafieldDefinitionSummary`
   objects (`namespace`/`key`/`name`/`type`).
4. The definitions are **fetched only, not rendered** as selectable choices (that
   is Step 9); the native search + list and the Insert / Update commit paths are
   **unregressed**.
5. A new `app/shopify/metafieldDefinitions.server.ts` holds the call + a pure,
   unit-tested `mapDefinitionsResponse`; **no reducer action added or changed**;
   `INSERT_VALUE_PART_AT` / `SET_VALUE_PART` and the `ValuePart` union are
   **unchanged**; **no persistence**.
6. **No hardcoded hex**; the Step 4 caret model, token rendering, line breaks,
   keyboard delete, the Step 5 modal mechanics, the Step 6 create/edit commit
   paths, and the Step 7 search are **unregressed**; the `Rows: N / 200` counter
   is unaffected.
7. `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:run`
   all pass; **browser-verified end to end** in the real embedded app (the fetch
   + states flow above, no console errors — admin console included).
8. `progress-tracker.md` updated to mark Step 8 complete and point at Step 9
   (render the metafield section in the modal, covered by the Step 7 search).
