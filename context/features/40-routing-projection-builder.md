# Feature 40 — Routing-projection builder (+ `add-routing` migration)

## Goal in one sentence

Land the `add-routing` migration (`ShopStorefrontRouting`) and a **pure,
dependency-free** `app/utils/routingProjection.ts` that folds a shop's ACTIVE,
disjoint assignment rules (each with its template's metaobject handle) into the
delivery map — `{ defaultTemplateHandle, byType, byVendor, byCollection, byTag,
byProduct, excludedProductGids }` — with **no DB read/write and no Shopify call**.

## Why this is next

Feature 41 needs a `ShopStorefrontRouting` row to persist and a stable JSON shape
to `metafieldsSet` onto the shop metafield; feature 43's Liquid reads that exact
shape. Both depend on a builder that turns rules → map. That transform is pure
string bucketing (which rule goes in which map, keyed by its selector), so it
splits out cleanly and is fully unit-testable in isolation — exactly like
`assignmentOverlap.ts` (feature 38) sits under the activation gate, and
`gridNav.ts` under the keyboard wiring. This slice is the migration + that pure
builder; **reading the ACTIVE rules from Postgres and writing the row/metafield
is feature 41**, and orchestrating when to rebuild is feature 42.

## Scope of THIS slice

- **Migration + pure builder only.** `add-routing` creates the table; the pure
  `routingProjection.ts` maps a **given** rule list to the projection object. No
  `.server.ts`, no Prisma query, no `admin.graphql` in this slice.
- **The builder is shop-agnostic.** It receives one shop's already-scoped,
  already-filtered rules (ACTIVE only, disjoint, with resolved handles) and
  returns the map. Shop isolation + the ACTIVE/disjoint filtering are the
  **caller's** responsibility (feature 41/42); the pure transform has no `shopId`.
- **`byTag` stays `{}`.** `TAG` is post-MVP (absent from `AssignmentScope`), so no
  rule ever targets it. The field ships in the model + output shape for
  forward-compat / metafield stability, always empty for MVP.
- **Out: persistence, metafield write, DB read, activation wiring, Liquid, and
  the byProduct >2,500 overflow → per-product-metafield fallback** (that bounded
  materialization is feature 41/45, not the pure builder).

## Decisions (settled)

- **`add-routing` adds exactly:** the `ShopStorefrontRouting` model (copied
  **verbatim from data-model §5** — do not re-derive) and the back-relation
  `storefrontRouting ShopStorefrontRouting?` on `Shop` (feature 37 deliberately
  omitted it; it is added here). **No new enum.** It does not touch `TableStyling`
  or the billing models (their own scheduled migrations, data-model §3).
- **Pure builder lives in `app/utils/routingProjection.ts`** (mirrors
  `assignmentOverlap.ts`): type-only imports, deterministic, side-effect-free. Its
  output object's keys **exactly mirror the Prisma Json columns** so feature 41
  persists it and serializes the metafield with **no reshaping**.
- **The builder is generic over a flat rule list.** Input is
  `RoutingRule[]` = `{ scope, scopeValue, mode, templateHandle }[]` flattened
  across all ACTIVE templates by the caller. It buckets each rule by
  `(scope, mode)`. This is robust to the future multi-row case (a template with
  several PRODUCT / COLLECTION rows) without a rewrite, even though feature 37
  persists one INCLUDE row per template today.
- **Bucketing (INCLUDE):**
  - `ALL_PRODUCTS` → `defaultTemplateHandle`
  - `PRODUCT_TYPE` → `byType[scopeValue] = handle`
  - `VENDOR` → `byVendor[scopeValue] = handle`
  - `COLLECTION` → `byCollection[scopeValue] = handle`
  - `PRODUCT` → `byProduct[scopeValue] = handle`
- **Bucketing (EXCLUDE) is included here.** An `EXCLUDE` `PRODUCT` rule →
  `excludedProductGids` (push the GID). It is a trivial, pure, cheaply-testable
  addition, so the builder produces the **fully-realized** shape now.
  **Boundary:** feature 40 only *projects* EXCLUDE rows that exist; the app does
  **not create** any EXCLUDE rows until feature 45 (which owns EXCLUDE
  persistence, the UI, and per-product override materialization). So in production
  `excludedProductGids` is `[]` until 45 — but the projection path is built and
  unit-tested now. Non-`PRODUCT` EXCLUDE modes are not defined in MVP and are
  ignored (documented).
- **Key format — GID-faithful (lossless).** `byProduct` / `byCollection` keys and
  `excludedProductGids` entries are the **raw `scopeValue` GID**, copied verbatim
  (`gid://shopify/Product/…`, `gid://shopify/Collection/…`). `byType` / `byVendor`
  keys are the raw selector strings (they match `product.type` / `product.vendor`
  directly). Rationale: the projection stays lossless and identical to the source
  of truth, and the pure builder needs **no GID parsing / failure mode**. Feature
  43 builds the matching token in Liquid (`'gid://shopify/Product/' | append:
  product.id`, and likewise per `product.collections`) — cheap and standard.
  **This settles the byProduct/byCollection/excluded key contract with feature
  43**; the data-model §9 Liquid *sketch* (`r.byProduct[product.id]`) is
  illustrative and is finalized to the GID-constructed key in 43 (reconcile §9
  there, browser-verified).
- **Handles are trusted, empty ones skipped.** The caller passes each rule's
  `templateHandle` (the ACTIVE template's `shopifyMetaobjectHandle`). The builder
  defensively **skips** a rule whose handle is empty/blank (an unsynced template
  must not land a null pointer in the map) rather than writing an unusable entry.

## What already exists (so we don't rebuild it)

- `ShopStorefrontRouting` is fully specified in **data-model §5** (paste it) and
  its role in **§9** ("Delivery (Shopify) — rebuild the routing projection").
- `AssignmentScopeValue` (`app/utils/assignmentScope.ts`) — the scope union the
  builder switches on. `AssignmentMode` (`INCLUDE` / `EXCLUDE`) is a two-literal
  union; import the type from `@prisma/client` (type-only, erased) or inline the
  literals, matching the `assignmentScope.ts` style.
- The pure-util + colocated-test pattern of `assignmentOverlap.ts` /
  `assignmentOverlap.test.ts` — the exact shape this slice mirrors.
- Feature 37's `add-assignment` migration is the template for a small, verified
  Prisma migration (Neon table check before app code).

## Correctness invariants (must hold)

- **Pure & deterministic.** No `@prisma/client` runtime import, no DB, no Admin
  API; same input → same output; source rule list never mutated.
- **Output shape is exactly the Prisma columns.** `defaultTemplateHandle: string |
  null`; `byType` / `byVendor` / `byCollection` / `byTag` / `byProduct`:
  `Record<string, string>`; `excludedProductGids: string[]`. An empty rule list
  yields all-empty maps + `null` default + `[]` excluded (the model defaults).
- **Disjointness is assumed, not enforced.** The activation gate (feature 42)
  guarantees the ACTIVE set is disjoint, so no two rules share a map key. The
  builder does **not** police this; on an (unsupported) duplicate key it is
  deterministic — **last rule wins** — but that state should never be fed in.
  Documented, not defended.
- **Lossless keys.** `scopeValue` is copied verbatim into product/collection keys
  and the excluded array; no truncation, no GID→numeric conversion here.
- **No null pointers.** A blank/empty `templateHandle` rule contributes nothing.

---

## Steps (each independently verifiable)

### Step 1 — `add-routing` migration

- Paste the `ShopStorefrontRouting` model from **data-model §5** into
  `prisma/schema.prisma`; add `storefrontRouting ShopStorefrontRouting?` to
  `Shop`. No enum. Do **not** add styling/billing relations.
- Run `npx prisma migrate dev --name add-routing`.
- **Verify:** the `ShopStorefrontRouting` table + its `shopId @unique` and the
  `Json` defaults (`{}` / `[]`) exist in Neon (Neon MCP `get_database_tables` /
  `describe_table_schema` or a `SELECT`); `npm run build` passes. Do not write the
  builder against the table until confirmed (data-model §3 rule) — though note the
  builder is pure and never touches the table anyway; the check gates feature 41.

### Step 2 — Pure `routingProjection.ts` + types

- New `app/utils/routingProjection.ts`:
  - `RoutingRule = { scope: AssignmentScopeValue; scopeValue: string | null;
    mode: "INCLUDE" | "EXCLUDE"; templateHandle: string }`.
  - `RoutingProjection = { defaultTemplateHandle: string | null; byType:
    Record<string,string>; byVendor: …; byCollection: …; byTag: …; byProduct: …;
    excludedProductGids: string[] }`.
  - `buildRoutingProjection(rules: RoutingRule[]): RoutingProjection` — implements
    the INCLUDE/EXCLUDE bucketing above; skips blank-handle rules; leaves `byTag`
    `{}`.

### Step 3 — Tests

- `routingProjection.test.ts`: one case per INCLUDE scope → its bucket (incl.
  `ALL_PRODUCTS` → default, GID-verbatim keys for PRODUCT/COLLECTION); `EXCLUDE`
  `PRODUCT` → `excludedProductGids`; an empty list → all-empty defaults; a
  multi-rule mix across dimensions projects each into the right map; a blank
  `templateHandle` rule is dropped; `byTag` stays `{}`; last-wins determinism on a
  duplicate key (documenting the assumed-disjoint contract). Build + full suite
  green.

### Step 4 — Docs

- Update `context/progress-tracker.md`: `add-routing` migration + pure
  projection builder done (one line + this pointer); advance the assignment "Next"
  to feature 41 (routing metafield writer + TOML def).
- **Reconcile data-model §9** if the GID-faithful key decision needs the Liquid
  sketch annotated (the sketch is illustrative; the key contract is settled here,
  verified in 43) — do this **before** finishing if any wording would otherwise
  mislead feature 43.

---

## Out of scope (this file)

- Reading the ACTIVE rules from Postgres and persisting the `ShopStorefrontRouting`
  row (feature 41).
- Writing the `[shop.metafields.app.routing]` metafield + its TOML declaration
  (feature 41).
- Deciding *when* to rebuild (activate / deactivate / scope-edit) and the
  DRAFT→ACTIVE gate wiring (feature 42).
- The byProduct >2,500-entry (128 KB cap) overflow → per-product
  `metaobject_reference` metafield fallback + `ProductAssignmentIndex` population
  (feature 41/45).
- EXCLUDE rule *persistence* / UI and per-product override materialization
  (feature 45) — this slice only *projects* EXCLUDE rows that already exist.
- Storefront Liquid resolution against the map (feature 43).

## Open / optional

- **Key format vs the §9 Liquid sketch.** Settled GID-faithful here (lossless,
  no parsing); feature 43 constructs the GID token in Liquid and browser-verifies
  it. If 43's live test shows a cheaper key (e.g. numeric) is warranted, revisit
  **both** this builder and §9 together — do not let the two drift.
- **Multi-row scopes (selected products / selected collections).** The builder is
  already generic over N rules, but feature 37 persists one INCLUDE row per
  template. Whether the UI (44) writes multiple PRODUCT/COLLECTION rows or a
  multi-value shape is a feature-44/45 decision; nothing here blocks it.
- **`priority` stays dormant** — the builder never reads it; disjointness is the
  only guarantee (data-model §9).
