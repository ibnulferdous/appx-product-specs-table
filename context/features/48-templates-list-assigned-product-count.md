# Feature 48 — Templates list: dynamic assigned-product count

## Goal in one sentence

Replace the hardcoded `assignedProductCount: 0` on the templates list with the
**real number of products** each template's assignment scope resolves to — reading
the broad scopes' totals live from the Shopify Admin API — so the "Assigned
Products" column stops lying.

## Why

The column was wired end to end in the UI but fed a literal `0`
(`listTemplatesForShop` in `template.server.ts`), so every template read "0"
regardless of its assignment. The assignment rules already live in Postgres
(`ProductAssignment`), so the count is derivable; only the broad scopes need a live
Shopify lookup for a true product total. The merchant asked for **true counts** (not
a scope label), accepting the extra Admin API call.

## What "assigned products" means per scope

| Scope | Count source | Notes |
|---|---|---|
| NONE (no INCLUDE rule) | 0 | matches nothing |
| `PRODUCT` | # distinct INCLUDE PRODUCT rows | Postgres-only, exact, no API |
| `ALL_PRODUCTS` | shop `productsCount` − EXCLUDE carve-outs | clamped ≥ 0 |
| `COLLECTION` | Σ `collection.productsCount` over its collections | overlapping collections may over-count (accepted MVP approximation) |
| `PRODUCT_TYPE` | `productsCount(query: "product_type:'…'")` | hidden scope, legacy data |
| `VENDOR` | `productsCount(query: "vendor:'…'")` | hidden scope, legacy data |

## Design

- **New module `app/shopify/assignedProductCounts.server.ts`.** Pure, unit-tested
  helpers + one live orchestrator, mirroring `assignmentConflict.server.ts`:
  - `groupAssignments` — folds a shop's flat `ProductAssignment` rows into one
    `TemplateAssignment` per template (scope kind + distinct INCLUDE values +
    EXCLUDE count).
  - `collectLookups` — the distinct set of live lookups needed (shop total,
    collection GIDs, product types, vendors); empty when only PRODUCT/NONE exist.
  - `buildAssignedCountQuery` — collapses every lookup into **ONE** aliased
    `productsCount` / `collection` query (`col0`/`ptype0`/`vendor0` aliases, each
    value passed as a GraphQL **variable**, never inlined — injection-safe via
    `escapeProductSearchValue`). Returns `null` when no live lookup is needed.
  - `parseAssignedCountResponse` — narrows the aliased response; a deleted
    collection (`null` node) → 0, a malformed/missing field → "unknown" (absent
    from the map).
  - `computeTemplateAssignedCount` — the per-template arithmetic; `null` when a
    needed live count is unknown. PRODUCT/NONE never consult the live data.
  - `resolveAssignedProductCounts(admin, shopId)` — one shop-scoped Prisma read +
    one batched Admin query → `Map<templateId, number | null>`.
- **O(1) Admin API cost** regardless of template count (one batched request), and
  **skipped entirely** when no template uses a broad scope (rate-limit-friendly,
  priority #3).
- **Fail-soft** (opposite bias from the activation gate, deliberately — this is a
  cosmetic admin count, not the storefront): an Admin failure logs and leaves
  live-derived counts `null` (rendered `—`), while PRODUCT/NONE still resolve from
  Postgres. Never breaks the list.
- **Shop isolation (priority #1):** the Prisma read is `where { shopId }` and the
  `admin` client is session-bound, so a probe can only ever see this shop's catalog.

## Wiring

- `listTemplatesForShop` (`template.server.ts`) drops the fake
  `assignedProductCount: 0` and stays **pure Postgres** (only `rowCount`); the count
  is the loader's job now.
- The list loader (`app.templates.tsx`) pulls the `admin` client, calls
  `resolveAssignedProductCounts`, and merges: a template absent from the map (no
  assignment rows) → 0. `TemplateListItem` gains `assignedProductCount: number |
  null`; a new `formatAssignedCount` renders the integer (thousands-separated) or
  `—`.

## Validation

- GraphQL validated with `validate_graphql_codeblocks` @ API version **2025-10**
  (the runtime client version; required scope `read_products`, already granted).
- **25 new unit tests** (`assignedProductCounts.server.test.ts`): grouping
  (dedupe / ALL_PRODUCTS valued-less / EXCLUDE-only orphan), lookup collection,
  query builder (null / param-less / aliased + escaped variables), response
  narrower (well-formed / deleted-collection→0 / malformed→unknown / non-object),
  per-template arithmetic (clamp, unknown→null, collection sum), and the
  orchestrator (shop-scoped read, API-skip, batched resolve, fail-soft).
- `template.server.test.ts` updated (the list no longer returns
  `assignedProductCount`).
- Full gate green: **541 tests**, typecheck, lint, format, build.

## Live verification

Pending — needs the running dev store to confirm the rendered numbers against the
5 seeded templates (DB state at build time: 1×PRODUCT→1, 2×ALL_PRODUCTS−3 excl,
1×COLLECTION, 1×NONE→0).

## No migration, no data-model change

Application code only. No schema change, no storefront/routing change — this is a
read-only projection for the admin list.
