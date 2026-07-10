# Feature 41 — Shop routing metafield writer (+ `[shop.metafields.app.routing]` def)

## Goal in one sentence

Make the routing projection **real on Shopify**: declare the app-owned
`[shop.metafields.app.routing]` json metafield in `shopify.app.toml` (deploy it),
and build `app/shopify/routing.server.ts` that reads a shop's ACTIVE assignment
rules, folds them through feature 40's `buildRoutingProjection`, **persists the
`ShopStorefrontRouting` cache row** (Postgres = source of truth), then
**`metafieldsSet`s the shop-level routing metafield** (the delivery copy Liquid
reads) — with the pure glue unit-tested and the live calls mocked at the boundary.

## Why this is next

Feature 40 landed the `ShopStorefrontRouting` table and the pure builder, but
nothing writes the row or pushes it to Shopify yet. Feature 42 (the activation
gate) needs a single "rebuild + publish this shop's routing" entry point to call
on every activate / deactivate / scope-edit; feature 43's Liquid needs the
`shop.metafields["$app"].routing` metafield to actually exist and carry the map.
This slice builds that writer end-to-end and proves it by hand (scratch trigger →
JSON visible in Admin GraphQL), **without** wiring it into the status-change path
yet (that is feature 42).

## Scope of THIS slice

- **Metafield definition + deploy.** Add `[shop.metafields.app.routing]` (json,
  `storefront = public_read`) to `shopify.app.toml` and deploy so the definition
  exists on the shop.
- **The writer, invoked manually.** `routing.server.ts` exposes a
  `rebuildShopRouting(admin, shopId)` orchestrator: read ACTIVE rules → build
  projection → upsert the `ShopStorefrontRouting` row → `metafieldsSet` the shop
  metafield → stamp sync state. Verified from a **scratch trigger** (a temporary
  loader/action or a one-off), not from the DRAFT→ACTIVE flow.
- **Out:** wiring into activation / deactivation / scope-edit (feature 42); the
  DRAFT→ACTIVE conflict gate (feature 42); Liquid consumption of the map (feature
  43); the `byProduct` >2,500-entry (128 KB json cap) overflow → per-product
  `metaobject_reference` fallback + `ProductAssignmentIndex` (feature 45); EXCLUDE
  rule persistence / UI (feature 45 — the writer *projects* EXCLUDE rows via
  feature 40, but none exist until 45).

## Decisions (settled)

- **Definition is declarative TOML, app-owned, storefront-readable** — mirrors the
  feature-34 pattern for `[product.metafields.app.spec_table]`:

  ```toml
  # Shop-level routing map (attribute -> template handle). One json metafield per
  # shop, rebuilt from the ACTIVE disjoint ProductAssignment rows (data-model §9).
  # `storefront = public_read` makes it Liquid-readable in the Theme App Extension
  # as `shop.metafields["$app"].routing.value` (json auto-parsed).
  [shop.metafields.app.routing]
  type = "json"
  name = "Appx Storefront Routing"
  description = "Maps product attributes to the assigned Appx spec-table handle."

    [shop.metafields.app.routing.access]
    admin = "merchant_read_write"
    storefront = "public_read"
  ```

  Namespace/key resolve to the reserved **`$app` / `routing`**; Liquid access is
  the reserved-prefix **bracket** form `shop.metafields["$app"].routing.value`
  (dot form does not resolve the reserved namespace — same rule as `spec_table`).
- **Writer lives in `app/shopify/routing.server.ts`.** It makes the live
  `admin.graphql` call, so `app/shopify/` is its home (code-standards → File
  Organization), exactly like `templateSync.server.ts` (which also does a Shopify
  write plus a Postgres write-back). It imports `buildRoutingProjection` (feature
  40) and Prisma directly.
- **Ordering: Postgres first, then Shopify** (code-standards "Data and Storage";
  data-model §8). `rebuildShopRouting` upserts the `ShopStorefrontRouting` row
  **before** the `metafieldsSet`, then stamps `shopMetafieldGid` +
  `syncedToShopifyAt` on the row after a successful write. Postgres is the source
  of truth; the metafield is the delivery copy, so a failed metafield write leaves
  a correct row with stale/blank sync state (surfaced, not silent).
- **Empty projection is still written.** Zero ACTIVE rules → an all-empty map
  (`{}` maps, `null` default, `[]` excluded) is persisted and pushed, so
  deactivating the last template **clears** the storefront routing rather than
  leaving a stale map.
- **`metafieldsSet` owner is the shop GID.** The mutation needs `ownerId =
  gid://shopify/Shop/…`. Resolve it from `Shop.shopGid` if stored, else a one-line
  `{ shop { id } }` query on the same session-bound `admin` (structural shop
  isolation — the session can only ever address its own shop, so the owner is
  inherently this shop). Value = `JSON.stringify(projection)` (keys already mirror
  the columns; no reshape).
- **Pure glue is unit-tested; live calls mocked at the boundary** (the testing
  strategy). The pure, exported helpers:
  - `flattenActiveRulesToRoutingRules(templates)` — Prisma ACTIVE-template rows
    (each with its `assignments` + `shopifyMetaobjectHandle`) → `RoutingRule[]`
    (feature 40's input); a template's handle rides each of its rules; blank
    handles pass through (feature 40 skips them).
  - `buildRoutingMetafieldInput(shopGid, projection)` — the `metafieldsSet`
    variables (`ownerId`, namespace `$app`, key `routing`, type `json`, value).
  - `readMetafieldsSetResult(json)` — narrows `data.metafieldsSet.metafields[0].id`
    / `userErrors`, returning `{ ok, metafieldGid }` or `{ ok: false, error }`.
- **GraphQL is validated.** The `metafieldsSet` mutation is checked with
  `validate_graphql_codeblocks` (same API version as the other server modules,
  2025-10) before it is trusted — as features 39 / Step 9.5 did.

## What already exists (so we don't rebuild it)

- `buildRoutingProjection` + `RoutingRule` / `RoutingProjection`
  (`app/utils/routingProjection.ts`, feature 40) — the pure fold this writer feeds
  and whose output it serializes verbatim.
- `ShopStorefrontRouting` table + `Shop.storefrontRouting` relation (feature 40
  migration) — the upsert target.
- `app/shopify/templateSync.server.ts` (feature 36) — the precedent for an
  `app/shopify/*.server.ts` that does a Shopify write **and** a Postgres
  write-back, surfacing a `syncError` honestly; the shape this module mirrors.
- `app/shopify/metaobjects.server.ts` / `metafieldDefinitions.server.ts` — the
  `#graphql` + pure-narrower + boundary-mock conventions, and the
  `[product.metafields.app.spec_table]` TOML declaration to copy the shop-metafield
  block from.
- `getActive... ` reads: `Template` already has `status` + `shopifyMetaobjectHandle`
  and a `@@index([shopId, status])`; assignments hang off `Template.assignments`
  (feature 37). No new index needed.

## Correctness invariants (must hold)

- **Shop isolation (priority #1).** The Prisma read (ACTIVE templates +
  assignments) and the `ShopStorefrontRouting` upsert are `where { shopId }`; the
  `admin.graphql` call is session-bound (structural). The `metafieldsSet` owner is
  this shop's GID — never another shop's.
- **Postgres before Shopify.** The cache row is upserted before the metafield
  write; sync state is stamped only after a confirmed write. A metafield failure
  never corrupts the source-of-truth row.
- **Delivery copy is derived, never authored.** The row + metafield are always a
  full rebuild from the current ACTIVE rules — no incremental hand-patching, no
  merge with prior contents.
- **Honest failure.** A `metafieldsSet` `userErrors` entry or a thrown/non-ok
  response returns `{ ok: false, error }` (like feature 36's `syncError`) — never
  a silent success. Feature 42 will surface it to the merchant.
- **Empty is a valid state.** No ACTIVE rules → an empty map is written (clears
  the storefront), not skipped.
- **Value shape is exactly the projection.** `JSON.stringify(projection)` with no
  reshaping; keys mirror the Prisma columns and the Liquid contract (feature 43).

---

## Steps (each independently verifiable)

### Step 1 — `[shop.metafields.app.routing]` definition + deploy

- Add the TOML block above to `shopify.app.toml`.
- `shopify app deploy` to distribute the definition.
- **Verify:** the definition exists on the shop — Admin GraphQL
  `metafieldDefinitions(ownerType: SHOP, namespace: "$app")` (or the Partners
  dashboard) shows `routing` (json, storefront `public_read`). Confirm **before**
  the writer is exercised against it.
- **Watch:** whether writing an app-owned shop metafield needs an added
  `access_scopes` entry (current scopes: `write_products`, `write_metaobjects`,
  `write_metaobject_definitions`). App-reserved (`$app`) metafields are typically
  writable without a `write_metafields` grant; if `deploy` / the first write says
  otherwise, add the scope and note it. Do not add a scope speculatively.

### Step 2 — Pure glue + tests

- New pure exports in `app/shopify/routing.server.ts` (or a colocated pure module
  it re-exports):
  - `flattenActiveRulesToRoutingRules(templates)`,
    `buildRoutingMetafieldInput(shopGid, projection)`,
    `readMetafieldsSetResult(json)` (per Decisions).
- **Test:** `routing.test.ts` (pure, no live calls) — flatten maps a mix of
  ACTIVE templates+assignments (INCLUDE across scopes + one EXCLUDE PRODUCT) to
  the right `RoutingRule[]` with handles attached; a handle-less template's rules
  still flatten (feature 40 drops them); `buildRoutingMetafieldInput` produces the
  exact `ownerId` / `$app` / `routing` / `json` / stringified value;
  `readMetafieldsSetResult` returns the gid on success and `{ ok: false }` on a
  `userErrors` payload / malformed json.

### Step 3 — Live `rebuildShopRouting` orchestrator + boundary test

- `rebuildShopRouting(admin, shopId): Promise<{ ok: true; metafieldGid } | { ok:
  false; error }>`:
  1. Read ACTIVE templates + their assignments + handles (shop-scoped Prisma).
  2. `flattenActiveRulesToRoutingRules` → `buildRoutingProjection`.
  3. Upsert `ShopStorefrontRouting` by `shopId` with the projection columns.
  4. Resolve the shop GID (stored or `{ shop { id } }`), `metafieldsSet` the
     metafield, narrow with `readMetafieldsSetResult`.
  5. On success, stamp `shopMetafieldGid` + `syncedToShopifyAt` on the row; return
     the gid. On failure, return `{ ok: false, error }` (row already persisted).
- **Test:** boundary-mocked (mock Prisma + `admin.graphql`, per
  `template.server.test.ts` / feature 39 style): a happy path upserts then sets
  and stamps; a `userErrors` response returns `{ ok: false }` and does **not**
  stamp sync state; every Prisma `where`/`data` carries `shopId`.

### Step 4 — Scratch-trigger manual verification

- Invoke `rebuildShopRouting` from a temporary trigger (a throwaway loader/action
  or dev-only route) after seeding one or two ACTIVE rules via feature 37's
  `setTemplateScope`.
- **Confirm** in Admin GraphQL that `shop.metafields` shows `$app.routing` with
  the expected json (default / byType / … keys). Remove the scratch trigger after.

### Step 5 — Docs

- Update `context/progress-tracker.md`: TOML def + writer done (one line + this
  pointer); advance the assignment "Next" to feature 42 (activation dry-run gate).
- No `data-model.md` change expected (§9 already describes this write); reconcile
  §9 first if any detail deviates.

---

## Out of scope (this file)

- Wiring `rebuildShopRouting` into the status-change surfaces (list action +
  editor Settings) and the DRAFT→ACTIVE conflict gate (feature 42).
- Storefront Liquid resolution against `shop.metafields["$app"].routing` (feature
  43).
- The `byProduct` 128 KB json-cap overflow → per-product `metaobject_reference`
  metafield fallback + `ProductAssignmentIndex` population (feature 45).
- EXCLUDE rule persistence / UI + per-product override materialization (feature
  45) — the writer projects EXCLUDE rows via feature 40, but none exist yet.

## Open / optional

- **Exact `metafieldsSet` shape + reserved namespace.** Validate with
  `validate_graphql_codeblocks` and the docs during Step 2/3 that an app-owned
  **shop** metafield is written with namespace `$app` / key `routing`, `ownerId =
  gid://shopify/Shop/…`, `type: "json"`. Confirm the owner-GID source (stored
  `Shop.shopGid` vs `{ shop { id } }`) and prefer the query if `shopGid` may be
  stale/absent.
- **Access scope.** Confirm at deploy whether the app-reserved shop metafield
  write needs an added scope (see Step 1 note); add only if the platform requires
  it.
- **128 KB cap guard deferred.** MVP `byProduct` is bounded (one PRODUCT rule per
  template today), so the map fits comfortably. The cap guard + per-product
  materialization fallback is feature 45; if the writer ever nears the cap before
  then, `log()` what would be dropped rather than truncating silently.
- **Concurrency.** Two near-simultaneous rebuilds for one shop both do full
  rebuilds (idempotent — last write wins, both derive from the same ACTIVE set).
  A row-level guard is unnecessary for MVP; note it if activation ever fans out.
