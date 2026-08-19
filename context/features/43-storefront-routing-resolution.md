# Feature 43 — Storefront routing resolution (Liquid)

## Goal in one sentence

Teach the theme app extension to resolve the current product to its template
**through the shop routing map** (`shop.metafields["$app"].routing`, written by
feature 41): when the product has no direct per-product override metafield, look
its attributes up in the routing map (product GID → type → vendor → collection →
default), honor `excludedProductGids`, resolve the matched **handle** to the
template metaobject, and render — so a broad rule that covers 20k products lights
up the storefront with O(1) data and zero per-product writes.

## Why this is next

Feature 41 publishes the routing map and feature 42 keeps it rebuilt on every
ACTIVE-set change — but **nothing on the storefront reads it yet**. Today the
block ([spec_table.liquid](extensions/product-specs-table/blocks/spec_table.liquid))
resolves a product's table only through the per-product `$app:spec_table`
`metaobject_reference` metafield (features 34/35), which must be set by hand per
product. Feature 43 is the storefront half of the assignment engine: it makes a
broad, merchant-set rule (once the scope picker ships in 44) actually appear for
every matching product. This is the payoff slice — the admin→routing→storefront
pipeline becomes real for shoppers.

## Scope of THIS slice

- **Add the routing-map fallback** to the block: try the per-product override
  first (unchanged, highest precedence); if none, resolve the handle from
  `shop.metafields["$app"].routing.value` and render the matched metaobject.
- **Honor `excludedProductGids`** — an excluded product renders nothing *from the
  routing map* (the per-product override still wins if present).
- **GID-faithful lookups** — construct `gid://shopify/Product/<id>` and
  `gid://shopify/Collection/<id>` tokens in Liquid (feature 40 keys are raw GIDs;
  Liquid only exposes numeric `.id`), per the locked decision in data-model §9.
- **Extract the resolution into `snippets/spec-table-resolve.liquid`** — it emits
  the resolved template **handle** (or nothing); the block resolves the metaobject
  and renders. Mirrors how feature 35 isolated value resolution into
  `spec-table-value.liquid`, keeping each Liquid file single-purpose.
- **Out:** the scope-picker UI (44); EXCLUDE persistence + per-product overflow
  materialization (45); TAG routing (post-MVP — `byTag` is always `{}`, feature
  40); selected-variant live switching (deferred, feature 35); any change to the
  projection builder (40) or writer (41).

## Decisions (settled)

- **Resolution precedence: per-product override → exclude gate → routing map.**
  1. `product.metafields["$app"].spec_table.value` (the bounded single-product
     override) — if it resolves an ACTIVE metaobject, render it and stop. An
     explicit per-product assignment always wins (it is the merchant overriding a
     broad rule for one product).
  2. Else, if the product's GID is in `routing.excludedProductGids` → render
     **nothing** (the broad rules are carved out for this product). The exclude
     gate sits **after** the override so it can never suppress an explicit
     override — it only carves the product out of the *broad* rules. Inert today
     (no EXCLUDE rows until 45; `excludedProductGids` is always `[]`), built now.
  3. Else, resolve a handle from the routing map (below) and render the matched
     metaobject.
  This is exactly data-model §9's "resolve the one match" order; the disjoint
  ACTIVE set (feature 42) guarantees the routing lookups yield **≤1** match, so
  the top-down order is efficiency only, never precedence.
- **Routing lookup order: `byProduct` → `byType` → `byVendor` → `byCollection`
  (scan) → `defaultTemplateHandle`.** First hit wins; stop scanning. Product/
  collection keys are GID tokens constructed in Liquid; type/vendor keys are the
  raw `product.type` / `product.vendor` strings.
- **Read the REAL projection keys, not §9's prose.** The live json (feature 40's
  `RoutingProjection`, written verbatim by feature 41) is:
  `{ defaultTemplateHandle, byType, byVendor, byCollection, byTag, byProduct,
  excludedProductGids }`. **The shop default key is `defaultTemplateHandle`** —
  data-model §9 loosely writes "`default`"; that is illustrative. This slice reads
  `routing.defaultTemplateHandle`. (Reconcile the §9 wording in Step 5.)
- **Skip TAG routing entirely.** `byTag` is always `{}` (TAG is post-MVP, absent
  from the `AssignmentScope` enum; feature 40 never populates it). Scanning
  `product.tags` would be dead work — and risks Liquid's 50-iteration `for` cap on
  tag-heavy products. The key stays in the json for forward-compat; the Liquid
  does not read it. Documented, not silently skipped.
- **Collection scan mirrors the rows 50-chunk pattern.** A product can belong to
  >50 collections; Shopify caps `{% for %}` at 50. Scan `product.collections` in
  50-row chunks like the existing rows loop, `break`ing on the first
  `byCollection[cgid]` hit.
- **Unify to one `spec` metaobject, render once.** The block sets `spec` = the
  override metaobject, else = `metaobjects["$app:appx_spec_table"][handle]` from
  the routing handle, then runs the **existing** render loop unchanged (section
  headers, `hideWhenEmpty` whole-cell gate, `spec-table-value` cell resolution).
  No duplication of the render path.
- **Guard the handle lookup.** Only call `metaobjects["$app:appx_spec_table"][h]`
  when `h != blank` — an empty index is safe (returns nil) but the guard keeps
  intent explicit. A missing `$app:routing` metafield (shop never activated
  anything) → `routing == blank` → no handle → nothing from the map (the override
  path still applies). Graceful, silent.
- **Resolution lives in a snippet (`spec-table-resolve.liquid`).** Liquid render
  scope is isolated and cannot return a value, so the snippet **emits the handle
  string** (or empty); the block `{%- capture -%}`s it. Params passed explicitly:
  `product`, `routing`. Keeps the block focused on rendering, matches the
  feature-35 snippet split. (Alternative — inline in the block prologue — is
  viable but loses the single-purpose separation; prefer the snippet.)

## What already exists (so we don't rebuild it)

- The block ([spec_table.liquid](extensions/product-specs-table/blocks/spec_table.liquid))
  already reads `product.metafields["$app"].spec_table.value` → metaobject →
  renders (section headers, `hideWhenEmpty`, 50-row chunking, `block.shopify_attributes`).
  Feature 43 keeps this render body intact and only changes how `spec` is chosen.
- `snippets/spec-table-value.liquid` (feature 35) resolves each value cell — unchanged.
- The routing metafield is **live and proven** (feature 41): `$app:routing`, json,
  `public_read`, readable as `shop.metafields["$app"].routing.value`.
- **Metaobject-by-handle is proven live** (data-model §9, 2026-07-07):
  `metaobjects["$app:appx_spec_table"][handle]` resolves an app-owned metaobject
  from a raw handle string and exposes `.status.value` / `.rows.value`.
- The **GID-construction pattern** is the locked feature-40/§9 approach:
  `{% assign pgid = 'gid://shopify/Product/' | append: product.id %}`.

## Correctness invariants (must hold)

- **≤1 table per product (data-model §8/§9).** The disjoint ACTIVE set means the
  routing lookups can match at most one handle; the override short-circuits before
  them. The storefront renders exactly one table or none — never two.
- **Silent by design (unchanged).** Non-ACTIVE metaobject status, no match, an
  excluded product, or a missing routing metafield renders **nothing** — no
  diagnostic text, no empty box (App Store polish, priority #2).
- **Status gate still enforced.** Even a routing-matched handle renders only if
  its metaobject `status.value == "ACTIVE"` and it has rows — the routing map is
  rebuilt only from ACTIVE templates (feature 41), but the block re-checks status
  as defense in depth (a stale map entry can't force a DRAFT table to render).
- **No raw HTML injection (unchanged).** All author/Shopify text stays escaped via
  `spec-table-value.liquid`; the routing layer only moves handle **strings**.
- **No cross-shop leakage.** `shop.metafields` and `product.metafields` are the
  current storefront's own shop/product — Liquid has no cross-shop surface
  (structural isolation, priority #1).
- **Override precedence preserved.** A product with a per-product `$app:spec_table`
  metafield renders that template regardless of the routing map or excludes.

## Steps (each independently verifiable)

### Step 1 — Resolver snippet

- Add `extensions/product-specs-table/snippets/spec-table-resolve.liquid`. Params:
  `product`, `routing` (the parsed `shop.metafields["$app"].routing.value`).
- Logic (emit a handle string or nothing):
  1. `routing == blank` → emit nothing.
  2. `pgid = 'gid://shopify/Product/' | append: product.id`.
  3. `routing.excludedProductGids contains pgid` → emit nothing (excluded).
  4. Else first-hit: `routing.byProduct[pgid]` → `routing.byType[product.type]` →
     `routing.byVendor[product.vendor]` → scan `product.collections` (50-chunked,
     construct `cgid`, `routing.byCollection[cgid]`, `break` on first hit) →
     `routing.defaultTemplateHandle`.
  5. `echo` the resolved handle (empty string if none).
- **Verify:** Theme Check passes; a hand-constructed `routing` object (via the
  Step 4 seed) resolves the expected handle for a matching product.

### Step 2 — Wire the block to try override → exclude → routing

- In [spec_table.liquid](extensions/product-specs-table/blocks/spec_table.liquid)
  prologue: keep `assign spec = product.metafields["$app"].spec_table.value`. If
  `spec == blank`, read `assign routing = shop.metafields["$app"].routing.value`,
  `{%- capture handle -%}{% render "spec-table-resolve", product: product, routing: routing %}{%- endcapture -%}`,
  trim it, and if `handle != blank` set
  `assign spec = metaobjects["$app:appx_spec_table"][handle]`.
- Leave the render body (the `{%- if spec ... ACTIVE ... rows -%}` block) untouched.
- **Verify:** Theme Check passes; the existing per-product-override product (the
  DJI page from feature 35) still renders identically (override path unchanged).

### Step 3 — (folded into Step 2) exclude gate

- The exclude check lives inside the resolver snippet (Step 1.3), so an excluded
  product yields an empty handle → `spec` stays blank (when no override) → nothing
  renders. No separate block change. Inert until feature 45 writes EXCLUDE rows.

### Step 4 — Manual verification (dev store, live storefront)

- Seed **one** routing entry with the feature-41 path (a scratch route calling
  `setTemplateScope` on an ACTIVE template + `rebuildShopRouting`, then removed —
  mirroring feature 41 Step 4). Use a broad scope whose match is a product that
  has **no** per-product override (so routing, not the override, resolves it) —
  e.g. `PRODUCT_TYPE:'<a real type>'` or `VENDOR:'<a real vendor>'`.
- Browser-verify on the live storefront product page (Claude-in-Chrome; the
  storefront password cookie is `_shopify_essential`, see memory): a product of
  that type/vendor **renders its table via the routing map**; a non-matching
  product renders nothing; the DJI override product still renders via its override.
- Confirm the `$app:routing` value in the metafield (Neon `ShopStorefrontRouting`
  or Admin GraphQL) matches what the storefront resolved. Tear down the scratch
  route + seeded rule after (leave the store clean).
- **Note:** this seeds real routing data (unlike feature 42's block, which needs
  two conflicting scopes) so it **is** verifiable now, before the scope picker.

### Step 5 — Docs

- Update `context/progress-tracker.md`: routing resolution wired into the block
  (one line + this pointer); advance "Next" to feature 44 (assignment UI / scope
  picker).
- Reconcile data-model §9: the storefront-resolve list already matches; correct
  the shop-default key wording from "`default`" to **`defaultTemplateHandle`**, and
  record that TAG routing is intentionally unread in the Liquid (post-MVP).

---

## Out of scope (this file)

- The scope-picker UI (44) — seeding scopes here is manual (feature 37 +
  scratch), exactly as in features 41/42.
- EXCLUDE persistence/UI + per-product overflow materialization (45) — the exclude
  gate is built but inert (`excludedProductGids` is `[]`).
- TAG routing — post-MVP; `byTag` stays `{}` and the Liquid does not read it.
- Selected-variant live switching / variant-change JS (deferred, feature 35).
- Any change to `routingProjection.ts` (40) or `routing.server.ts` (41) — this
  slice only consumes the map they produce.

## Open / optional

- **Numeric-key fallback.** The GID-faithful key format is a feature-40 decision
  the live test in Step 4 confirms. If (unexpectedly) the constructed-GID lookup
  fails on the storefront and numeric keys would work, revisit the **projection
  builder (40) AND data-model §9 together** — do not silently switch one side.
- **Collection scan cost.** First-hit-with-`break` over 50-chunked collections is
  cheap for typical catalogs. If a merchant has products in hundreds of
  collections *and* many collection rules, revisit (e.g. cap the scan, or prefer
  a materialized per-product override). Not a concern for MVP volumes.
- **`product.type` / `product.vendor` blank.** A product with an empty type/vendor
  indexes the map with `""`, which never has a key (INCLUDE requires a non-empty
  value, feature 37) → nil → falls through. Safe; no guard needed, but worth a
  one-line comment in the snippet.
- **Override vs. exclude semantics.** This slice makes the per-product override win
  over an exclude (an explicit assignment beats a broad carve-out). If feature 45
  wants an exclude to also suppress an override, that is a deliberate future
  change to this precedence — flagged here, not assumed.
