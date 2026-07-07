# Product Assignment Mechanism

> **Status:** design locked 2026-07-07. Not yet built — this is the build spec for
> the next unit (the assignment engine, Reshell Phase E).
> **Source of truth for the schema + storefront details:** `data-model.md` §5 (Prisma)
> and §9 (Storefront Assignment Strategy). This doc is the readable overview; if the
> two ever disagree, `data-model.md` wins.

---

## The core idea

Assignment is split into two halves that never talk to each other at runtime:

- **Part 1 — Assignment (PostgreSQL, source of truth):** the merchant decides, rigidly. Overlaps are *blocked*, not silently resolved.
- **Part 2 — Rendering (Liquid, theme app extension):** the storefront is dumb and fast — it finds the one matching template and renders it.

The storefront can be dumb *because* the assignment side is strict: the published rule set is guaranteed **disjoint**, so a product matches at most one rule and no precedence logic is ever needed on the storefront.

---

## Key decisions

- **Rigid, block-on-conflict (Moon-Bundles style).** A template targets **one scope** (all products / selected products / product type / vendor / selected collections). If its scope overlaps another **ACTIVE** template, activation is **blocked** — the merchant resolves it (narrow scope, add an exclusion, or leave it DRAFT). The merchant is always in control; the app never picks a silent winner.
- **Block at `DRAFT → ACTIVE`.** A template can be **saved DRAFT with a conflict**, but can **never go ACTIVE** while conflicting. The comparison set is *other ACTIVE templates only* — DRAFTs reserve nothing.
- **No merchant `priority` knob.** Because the ACTIVE set is disjoint, there's nothing to break a tie. `priority` stays in the schema but **dormant/unsurfaced**, reserved for a possible post-MVP multi-valued (collection/tag) tiebreak.
- **Broad rules are never materialized per-product.** They live as O(1) entries in one shop-level metafield — so a "20,000 smartphones" rule is a single write, and future matching products are covered automatically at render time (no webhook re-materialization).
- **Scales to 50k+ products** because every write is O(rules) or O(bounded overrides), never O(catalog).

---

## What happens in PostgreSQL (Prisma)

Three models carry the mechanism (full schema in `data-model.md` §5):

### 1. `ProductAssignment` — the merchant's rules (polymorphic)

```prisma
scope       AssignmentScope   // ALL_PRODUCTS | PRODUCT | PRODUCT_TYPE | VENDOR | COLLECTION (TAG post-MVP)
mode        AssignmentMode    // INCLUDE | EXCLUDE  (EXCLUDE = carve-out exception)
scopeValue  String?           // the product GID / type / vendor / collection GID; NULL for ALL_PRODUCTS
priority    Int   @default(0) // DORMANT
@@unique([shopId, templateId, scope, scopeValue, mode])   // stops literal dup rows; cross-template
                                                          // overlaps are blocked by the dry-run, not the DB
```

One row per rule; `mode` handles "all products **except** this SKU" style exclusions.

### 2. `ShopStorefrontRouting` — the projected delivery map (one row per shop)

Rebuilt from the ACTIVE, disjoint rules on every activate/deactivate, then pushed to the shop metafield. It's a derived cache; Postgres rules are the source of truth.

```prisma
defaultTemplateHandle  String?   // ALL_PRODUCTS winner
byType / byVendor / byCollection / byTag / byProduct   Json   // { scopeValue -> template handle }
excludedProductGids    Json      // EXCLUDE carve-outs -> render nothing
```

### 3. `ProductAssignmentIndex` — now sparse

No longer one row per covered product. Populated **only** for materialized single-product overrides (the bounded fallback) and their Shopify sync state — **never O(catalog)**.

### Conflict detection (the dry-run, at activation)

- `ALL_PRODUCTS` overlaps everything; `PRODUCT_TYPE` / `VENDOR` are single-valued → same-scope overlap is **O(1) Postgres set-algebra**.
- Cross-dimension / multi-valued pairs (type×vendor, anything×collection, anything×tag) → **one Shopify existence query per existing ACTIVE rule**: `products(first: 1, query: "product_type:'X' AND vendor:'Y'")`. Non-empty ⇒ overlap ⇒ block. Cost is O(active rules), not a catalog scan.

---

## What happens on the delivery layer (Shopify)

On activate/deactivate, the app rebuilds the routing projection and writes **one** shop-level metafield:

```toml
[shop.metafields.app.routing]   # type = json,  access.storefront = public_read
```

- Broad scopes → one map entry each (`byType`, `byVendor`, `byCollection`, `byTag`, `default`). **O(1) writes.**
- Selected single products → `byProduct` (bounded); exclusions → `excludedProductGids`.
- **Fallback:** if one template's hand-picked product set exceeds ~2,500 (the 128KB json cap), those products get a per-product `$app:spec_table` `metaobject_reference` metafield instead, written via rate-limit-exempt `bulkOperationRunMutation`.

Template **structure** stays where it already is — one metaobject per template (`$app:appx_spec_table`), gated by its own `status` field.

---

## What happens in Liquid (theme app extension)

On a product page, the block resolves the current product against the routing map, top-down (order is efficiency only — disjointness guarantees ≤1 match):

```liquid
{%- assign r = shop.metafields["$app"].routing.value -%}   {# json auto-parsed #}
{%- assign handle = product.metafields["$app"].spec_table.value.system.handle   {# bounded override, if any #}
      | default: r.byProduct[product.id]
      | default: r.byType[product.type]
      | default: r.byVendor[product.vendor]
      {# then first hit scanning product.collections -> r.byCollection, product.tags -> r.byTag #}
      | default: r.default -%}

{# excludedProductGids containing product.id  =>  render nothing #}

{%- assign tpl = metaobjects["$app:appx_spec_table"][handle] -%}   {# resolve handle -> metaobject #}
{%- if tpl.status.value == "ACTIVE" and tpl.rows.value.size > 0 -%}
   {# render rows / styling #}
{%- endif -%}
```

Two facts make this work, both **proven live (2026-07-07)**:

- **Handle → metaobject resolves directly:** `metaobjects["$app:appx_spec_table"][handle]` returns the app-owned metaobject from a plain handle string (no `metaobject_reference` needed for broad rules). Observed live: `system.type = app--378906640385--appx_spec_table`, `status = ACTIVE`, `rows = 19`.
- **App-owned data needs `access.storefront = "public_read"`** to be Liquid-readable (theme app extensions are storefront surfaces) — already set on all our definitions.

The **status field gates rendering** ourselves (we don't use the `publishable` capability), so an ACTIVE metaobject with rows renders; anything else renders nothing, silently.

---

## One-line mental model

> **Postgres holds disjoint rules (block-on-conflict guarantees it) → the app projects them into one shop-level routing metafield → Liquid matches the product's attributes to a template handle → resolves the metaobject by handle → renders if ACTIVE.** O(rules) everywhere, never O(catalog).

---

## Build order (when this unit starts)

1. `add-assignment` migration (`ProductAssignment`, `ProductAssignmentIndex`, `AssignmentScope`, `AssignmentMode`, `AssignmentIndexStatus`).
2. `add-routing` migration (`ShopStorefrontRouting`).
3. `[shop.metafields.app.routing]` (json, `public_read`) added to `shopify.app.toml`.
4. Dry-run conflict resolver (set-algebra + `products(query, first:1)`), gating `DRAFT → ACTIVE`.
5. Routing-projection builder + shop-metafield writer (on activate/deactivate).
6. Theme app extension: extend `blocks/spec_table.liquid` to read the routing map and resolve by handle (keeping the per-product override path as tier 1).
7. Assignment UI (one-scope selector, Kaching-style; conflict warnings).

Open UX questions (see `progress-tracker.md`): exact conflict-message copy + resolution picker; whether assignment lives only in the editor Settings tab or also a standalone `/assign` view.
