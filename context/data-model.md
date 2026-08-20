# Appx - Product Specs Table

## Data Model & Architecture Reference

This document defines the current MVP data model and storefront architecture for Appx. The goal is to build a fast, practical MVP without locking the app into a database shape that will break when product-level values, billing, storefront rendering, localization, import/export, or AI features arrive later.

---

## Table of Contents

1. Architecture Overview
2. MVP Data Model Decisions
3. Incremental Schema Migration Plan
4. Product Management Notes
5. Prisma Schema
6. Rows JSON Structure
7. Row Object Reference
8. Save, Status, and Storefront Behavior
9. Storefront Assignment Strategy
10. Shopify Metaobject Strategy
11. Billing and Entitlement Strategy
12. Why Row Keys Matter
13. Read Patterns
14. Byte Budgets
15. Data Retention & Erasure

---

> The MVP schema is intentionally forward-compatible with post-MVP expansion areas (multilingual support, variant-level specs, flexible assignment rules, import/export, AI extraction, product comparison). Consult `context/feature-roadmap.md` when making schema or feature boundary decisions that could affect those areas.

### Comparison-readiness invariant

The post-MVP product comparison feature (see "Product Comparison Feature Definition" in `context/feature-roadmap.md`) is structurally **one template resolved against N products instead of 1**. The current model already supports this because:

- `valueParts` of type `SHOPIFY_FIELD` and `METAFIELD` resolve per product at render time — the same template rendered against N products yields aligned columns.
- Row `key` is the cross-product (and cross-template) row alignment mechanism. Do not weaken its uniqueness or stability rules.
- The metaobject payload is product-agnostic (structure only, values resolved at render), so the storefront delivery layer works unchanged for multi-product rendering.

Comparison will be added with **additive migrations only** (a `ComparisonSet` model for merchant-curated comparison products, plus comparison display settings). No existing model changes are planned or permitted for it. Schema decisions must not break the template-times-N-products property — e.g., never move per-product resolved values into `Template.rows`, and never make metaobject payloads depend on a single product.

## 1. Architecture Overview

Appx uses a three-layer data pipeline:

```text
Layer 1: React editor state (custom spec-table editor)
- Holds unsaved edits in the browser.
- Nothing persists until the merchant clicks Save.

Layer 2: PostgreSQL via Neon
- Source of truth for saved app data.
- Prisma is the ORM.
- Stores shops, templates, rows JSON, assignment rules, resolved product assignment indexes, styling, billing, and entitlement data.

Layer 3: Shopify storefront data
- Shopify metaobjects store the renderable template payload (one per template).
- A shop-level routing metafield maps BROAD product attributes (type / vendor /
  collection / all-products default) to the assigned template handle.
- Per-product assignments and EXCLUDE carve-outs live in sharded routing
  metaobjects, keyed product.id mod 1024 (wire v3, feature 108).
- Liquid reads the routing map + this product's shard, resolves the matched
  template metaobject by handle, and renders through the Theme App Extension.
```

Core principle: Postgres is the source of truth. Shopify metaobjects (template payload + routing shards) and the shop-level routing metafield (broad assignment map) are the storefront delivery layer.

🚫 **There is no per-product override metafield.** `[product.metafields.app.spec_table]` was deleted 2026-08-04 (§9). Reinstating the Liquid read without the TOML definition is silently dead — an undefined metafield resolves to nil.

---

## 2. MVP Data Model Decisions

1. Use a real `Shop` model as the parent record for shop-specific app data.
2. Include minimal billing and entitlement models in the MVP schema.
3. Make assignments visible to Liquid through **one shop-level routing metafield** (broad attribute → template handle) plus **sharded routing metaobjects** for per-product entries — never by writing a metafield onto every matching product.
4. Treat saved data and template status separately, similar to Shopify products.
5. Enforce **one effective spec table per product via a rigid, block-on-conflict model** (merchant-controlled, Moon-Bundles style): overlaps between `ACTIVE` templates are blocked at `DRAFT → ACTIVE`; the published rule set is therefore disjoint and needs no runtime precedence. `priority` is retained but dormant (see §5 / §9).
6. Use ordered `valueParts` instead of a single row value source.
7. Broad rules (type / vendor / collection / tag / all-products) resolve at **render time** against the shop routing map, so future matching products are covered with **zero** per-product writes.
8. `ProductAssignmentIndex` is **dormant since 2026-08-04** — nothing writes it (§9). It was the sparse cache for materialized per-product overrides; that mechanism no longer exists. Never make it O(catalog) if it is ever revived.
9. Keep advanced Shopify field mapping outside MVP beyond the simple selected/default variant behavior.

---

## 3. Incremental Schema Migration Plan

Add models one migration at a time, tied to the build step that first needs them. Do not add all models upfront. Each migration stays small, reviewable, and directly connected to a concrete feature being built.

### Dependency chain

`Shop` is the root parent. Every other model carries a `shopId` foreign key. Migrations must respect this chain:

```
Shop
├── Template
│   ├── ProductAssignment ─────┐
│   │   └── ProductAssignmentIndex (also → Shop, Template, ProductAssignment)
│   └── TableStyling
├── ShopStorefrontRouting  (projected routing map mirrored to the shop metafield)
├── AppSubscription
└── ShopEntitlement
```

`Template` depends on `Shop`. `ProductAssignment` depends on `Shop` + `Template`. `ProductAssignmentIndex` depends on `Shop` + `Template` + `ProductAssignment`. `TableStyling` depends on `Template`. `ShopStorefrontRouting` and the billing models depend only on `Shop`.

### Migration schedule

| Migration name      | Models added                                  | Enums added                                                  | Build step that triggers it                 |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| `add-shop`          | `Shop`                                        | `OnboardingStatus`                                           | App shell — upsert `Shop` on first auth     |
| `add-template`      | `Template`                                    | `TemplateStatus`                                             | Templates list + Template editor (Rows tab) |
| `add-assignment`    | `ProductAssignment`, `ProductAssignmentIndex` | `AssignmentScope`, `AssignmentMode`, `AssignmentIndexStatus` | Product assignment screen                   |
| `add-routing`       | `ShopStorefrontRouting`                       | —                                                            | Shop-level storefront routing projection    |
| `add-table-styling` | `TableStyling`                                | —                                                            | Template editor — Styling tab               |
| `add-billing`       | `AppSubscription`, `ShopEntitlement`          | `SubscriptionStatus`                                         | Billing logic + early-bird entitlement      |

### Rules

- Never edit a migration file after it has been applied. Add a new migration instead.
- Only add a model to `schema.prisma` when you are about to build the feature that uses it.
- Run `npx prisma migrate dev --name <migration-name>` for each step.
- Confirm the new table exists in Neon before writing any app code that depends on it.
- `npm run build` must pass after every migration step before moving to the next feature unit.

---

## 4. Product Management Notes

### Template status behaves like Shopify product status

Unsaved edits live only in React state; Save writes to Postgres and syncs the storefront delivery data for **all** statuses (`ACTIVE` / `DRAFT` / `ARCHIVED`). **Status controls storefront visibility, not whether data is synced** — Liquid renders only `ACTIVE` templates; `DRAFT` / `ARCHIVED` may exist as metaobjects but must not render. This is a simple Shopify-like model, not a versioned publishing workflow (draft versions / approval flows can come later). See §8 for the full save → status → storefront flow.

### Product-specific custom values use Shopify metafields

The template defines structure (rows, labels, sections, order, value parts); product-specific values live in Shopify product metafields, not Appx Postgres. The PRD's "manual input" maps to `TEXT` valueParts — fixed template text shared by every product using the template.

---

## 5. Prisma Schema

🔴 **`prisma/schema.prisma` is the single source of truth for the schema.** This section
carried a fully annotated copy until 2026-08-08; it was removed because the two copies had
already diverged. Read the real file for models, fields, enums and indexes. What stays here
is only what Prisma cannot express: what each model is _for_, and the laws governing the
styling columns.

### What each model is for

| Model                                 | Purpose                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Session`                             | Shopify app-template OAuth storage. ⚠️ **Outside the FK graph** — keyed by a plain `shop` string, so no cascade reaches it and it must be deleted explicitly (§15).                                |
| `Shop`                                | Root parent. Every other model carries `shopId`. `metaobjectDefinitionGid` is **vestigial** (§10).                                                                                                 |
| `Template`                            | Name, status, `isShared`, the full editor `rows` JSON (array index = display order), and the metaobject GID + handle.                                                                              |
| `ProductAssignment`                   | The merchant's assignment **rules** — polymorphic `scope` + `mode` + `scopeValue`. `priority` is **dormant and unsurfaced** (§9).                                                                  |
| `ProductAssignmentIndex`              | 🔴 **DORMANT since 2026-08-04 — nothing writes it** (§9). Retained, not dropped: a drop is a migration with no benefit, and `shop/redact` still deletes from it (§15).                             |
| `ShopStorefrontRouting`               | The projected routing map mirrored to the shop metafield, plus `shardState` (the `{bucketKey → hash}` reconciliation ledger for the routing shards — delivery-only, never sent to the storefront). |
| `TableStyling`                        | Per-template style knobs. **Every knob is nullable**; null = the default.                                                                                                                          |
| `AppSubscription` / `ShopEntitlement` | Billing and promotional state (§11).                                                                                                                                                               |

Enums: `OnboardingStatus`, `TemplateStatus`, `AssignmentScope`, `AssignmentMode`,
`AssignmentIndexStatus`, `SubscriptionStatus`. The dependency chain and migration order are
in §3.

### Styling column laws

These constrain any change to `TableStyling` and are **not** derivable from the schema file.

1. 🔴 **The default IS the storage format.** The wire is overrides-only, so a template storing
   the default stores **nothing** — there is no "unset" state and no way to scope a default
   change to new templates only. Changing any default repaints every stored table that never
   set the field.
2. **Nullable ⇒ CSS custom property; non-null keyword ⇒ modifier class.** This is why most
   Style-tab features cost no migration, no presence flag and no Liquid edit.
3. **Every integer minimum is 1, never 0 — on knobs where NULL ALREADY MEANS OFF.** A 0 would
   be a second spelling of the same off state, which `serializeStylingOverrides` would write
   to the wire as an override of a default that renders identically. ⚠️ The law is **scoped**:
   it does not reach `headerPaddingBlockPx`, whose null means the stylesheet's own `0.75rem`
   — there 0 and null are different renders, so 0 is a _first_ spelling. The test: if a knob
   carries a presence flag keyed on non-null, its floor is 1.
4. **`headerFontSizePx` is ABSOLUTE px, never an em keyword.** The collapsible `<summary>` is
   a **sibling** of the `<table>` that carries `--appx-spec-font-size`, so an em would resolve
   against a different base per shape and resize silently when Collapsible is toggled.
5. **`gridMinColumnWidthPx` is a MINIMUM WIDTH, never a column count.** The track count falls
   out of the container width via `repeat(auto-fit, minmax(min(var, 100%), 1fr))`, so the
   layout is responsive with no media query. No presence flag keys on it — the `--layout-grid`
   class is the gate.
6. **`sectionsInitialState` is the one keyword knob whose default is not its domain array's
   first member** — the rail order is the open→closed spectrum a merchant reads, so the
   default is named in `DEFAULT_SECTIONS_INITIAL_STATE` instead.
7. **`sectionGapPx` has TWO CSS rules, one per markup shape.** A `<tr>` takes no margin only
   under `TWO_COLUMN`; under `STACKED` / `GRID` it displays as a block and margin applies. The
   rail shows the knob whenever `sectionsCollapsible` **or** `rowLayout !== TWO_COLUMN`; the
   shapes are mutually exclusive in the renderer, so the rules can never both fire.
   Two-column-with-collapsing-off is the one excluded state.
8. **`tableMaxWidthPx` is a CAP** — it shrinks below its value, so it cannot collide with the
   749px mobile breakpoint.
9. **String knobs hold app-validated constants, not Prisma enums** — shared TS constants +
   server re-validation, matching the `fontSize`/`fontWeight` convention.
10. **`outerBorderColor` and `headerTextColor` group with the colors, not their functional
    neighbours** — the Style-tab swatch list is derived from `STYLING_FIELD_NAMES` order and a
    test pins it. `outerBorderColor` null falls back to `borderColor`, then the stylesheet
    literal.
11. **`sectionHeaderStyle` is three LOOKS, and each member's CSS rule states BOTH the band and
    the rule** rather than inheriting either from the base rule — pinned by a test, because
    that is exactly what went wrong. `TEXT_ONLY`'s merchant-facing label is **"Underlined"**;
    the wire value keeps its original spelling so no stored row repaints.
12. **MVP-shipping knobs are real columns** (typed, queryable — locked 2026-07-18), never
    `extraStyles` entries.

> **Color fields are merchant overrides, not the whole palette.** Each `*Color` field is nullable: `null` means "inherit the theme," a value means the merchant set it in the Style tab. On the storefront these resolve to **CSS custom properties on the `.appx-spec-table` wrapper** — the same variables that carry the inherited-theme defaults — so saved and default colors flow through one source of truth (see `code-standards.md` → Color & Theming). The app is not colorless: color is centralized in variables, not scattered as hex literals. `extraStyles` is the forward-compatible escape hatch for new themeable surfaces (dark-mode tokens, additional surfaces) added post-MVP without a migration per color.

> **Styling is per-template with COPY semantics — locked 2026-07-18.** `TableStyling` is the **single styling home**; the style knobs are **orthogonal controls on one table primitive**, not monolithic "layouts" (every real-world archetype — striped, banded, stacked, accordion — is a knob combination). Choosing a preset (the creation-gallery popup or an in-rail preset card) **copies** the preset's values into the template's `TableStyling`; there is **no template→preset link and no shop-level default styling record** (a "store default cascade" was designed and rejected: copy keeps every style edit side-effect-free on live storefronts, makes preset deletion trivial, and collapses storefront delivery to one path). Consequences:
>
> - **Built-in presets are code constants** (stable ids: `classic`, `striped`, `banded`, `stacked`, `accordion`), never DB rows.
> - **Merchant-saved presets** are a phase-2 slice: a `StylePreset` model — shop-scoped (`shopId` + name, shop-isolated like every model), carrying the **same style columns** as `TableStyling` (guard the intentional column duplication with a field-set drift test, the same pattern as the preview-CSS byte-equality guard). Created via "Save as preset"; "editing" a preset is save-as-again (same name = overwrite after confirm) — consistent with copy semantics, no separate preset editor.
> - **Retroactive "set once and done" is a post-MVP explicit bulk action** (future app-settings route): pick a preset → confirm against a pre-checked template list → batch-write N `TableStyling` rows + **throttled** sequential metaobject resyncs (merchant-triggered write amplification is acceptable; per-edit propagation is not).
>
> Full UI spec: `admin-screen-plan.md` §Screen 3 → Tab 2 — Style.

---

## 6. Rows JSON Structure

`Template.rows` remains a flat JSON array. Every element is either a data row or section header. A flat array maps cleanly to the editor's local state and to `@dnd-kit` drag-and-drop reordering (array index = display order).

Current row structure decisions:

- Rows use `hideWhenEmpty` as the visibility flag.
- Every row gets both `id` and `key`.
- Data rows use ordered `valueParts`.

Example:

```json
[
  {
    "id": "9f3e1c14-7a2d-4b8e-9c1f-2e8a4f7c1d3b",
    "key": "display",
    "rowType": "SECTION_HEADER",
    "label": "Display",
    "hideWhenEmpty": false
  },
  {
    "id": "4a8b2d6e-3c1f-4e7a-8b9d-5c2f1a3e9b7d",
    "key": "screen_size",
    "rowType": "DATA",
    "label": "Screen Size",
    "valueParts": [
      {
        "type": "METAFIELD",
        "namespace": "custom",
        "key": "screen_size"
      }
    ],
    "hideWhenEmpty": true
  },
  {
    "id": "7c1d3b9f-5e2a-4f8c-9b1e-3a7d2c4f8e1b",
    "key": "vendor",
    "rowType": "DATA",
    "label": "Brand",
    "valueParts": [
      {
        "type": "SHOPIFY_FIELD",
        "field": "vendor"
      }
    ],
    "hideWhenEmpty": true
  },
  {
    "id": "2e8a4f7c-1d3b-4c9f-8b2d-6e3a1c4f7d9b",
    "key": "battery_life",
    "rowType": "DATA",
    "label": "Battery Life",
    "valueParts": [
      {
        "type": "TEXT",
        "text": "Up to "
      },
      {
        "type": "METAFIELD",
        "namespace": "custom",
        "key": "battery_life"
      },
      {
        "type": "TEXT",
        "text": " hours"
      }
    ],
    "hideWhenEmpty": true
  }
]
```

---

## 7. Row Object Reference

### Data row

| Field           | Type    | Required | Description                                                                                             |
| --------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `id`            | string  | Yes      | Technical stable ID. Client-generated (stable across saves). Never changes. Used by relational tables.  |
| `key`           | string  | Yes      | Human-readable stable key such as `screen_size`. Used for import/export, AI, translations, and JSON-LD. |
| `rowType`       | `DATA`  | Yes      | Identifies this as a data row.                                                                          |
| `label`         | string  | Yes      | Shopper-facing label. Can be translated later.                                                          |
| `valueParts`    | array   | Yes      | Ordered value parts used to build the final displayed value.                                            |
| `hideWhenEmpty` | boolean | Yes      | If true, storefront hides this row when the whole-row resolved value is empty (see §10 for semantics).  |

MVP validation: a template can contain at most 200 rows, including data rows and section headers. The admin UI should prevent merchants from exceeding this limit, and the server should reject saves that exceed it. The 200-row cap is an MVP value and may increase post-MVP — implement it as a single shared constant, never a hardcoded literal.

### Value part reference

| Part type       | Required fields    | Description                                                                                 |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| `TEXT`          | `text`             | Fixed manual template text, same for every product using the template.                      |
| `SHOPIFY_FIELD` | `field`            | Dynamic value read from the Shopify product object.                                         |
| `METAFIELD`     | `namespace`, `key` | Dynamic value read from a Shopify product metafield.                                        |
| `LINE_BREAK`    | _(none)_           | Hard line break inside a value. Renders as a new line; carries no text and no dynamic data. |

Admin UI may show Liquid-like tokens such as `{{ product.metafields.custom.battery_life.value }}`, but Appx should save structured `valueParts`, not merchant-authored raw Liquid.

### Editor value surface — native `<textarea>` + `{% … %}` text codec (features 109–113)

`valueParts` (the array above) is the **canonical value shape** and is unchanged by the textarea migration: it is what gets **persisted** (Postgres + the delivered metaobject), and what the **storefront** and the **inline preview** render — both switch on `part.type` exactly as before. The migration touched the **editor surface only**.

The value cell is a native `<textarea>` (feature 111), not a `contenteditable`. The textarea edits a plain string; a small bidirectional codec (`app/utils/valueText.ts`, feature 109) converts **only at the editor boundary**:

- `partsToText(parts)` → the string shown in the textarea.
- `textToParts(raw)` → parses the string back to `valueParts`, then runs `normalizeValueParts`. The reducer stores the result via a single `SET_VALUE_PARTS` action.

Parsing lives in the component, never in the reducer or the storefront — the reducer stays pure/DOM-free/grammar-free, and no Liquid-side token parsing exists.

**Token grammar (locked — the codec's source of truth):**

| In the textarea string       | `valueParts` part                             |
| ---------------------------- | --------------------------------------------- |
| `{% field <token> %}`        | `{ type: "SHOPIFY_FIELD", field: "<token>" }` |
| `{% mf <namespace>.<key> %}` | `{ type: "METAFIELD", namespace, key }`       |
| `\n` (newline)               | `{ type: "LINE_BREAK" }`                      |
| any other text               | `{ type: "TEXT", text: … }` (verbatim)        |

In-brace whitespace is flexible on parse; formatters emit the canonical single-space form. A malformed or unknown token (e.g. `{% mf %}`, `{% foo bar %}`) is **not** an error — it stays literal `TEXT`.

🔴 **`<namespace>` and `<key>` are `[A-Za-z0-9_-]+` — hyphens included.** This mirrors Shopify's own rule (alphanumeric + hyphen + underscore; key 2–64, namespace 3–255) and it is **not** a cosmetic detail: hyphens are the norm for the standard taxonomy (`shopify.battery-size`, `shopify.power-source`) and for app-reserved namespaces (`app--123--foo`). A narrower class silently demotes those tokens to literal `TEXT`, which the storefront then prints verbatim as raw `{% mf … %}` source. A `.` is deliberately excluded from both halves, which is what makes the single `.` separator unambiguous (`{% mf a.b.c %}` stays literal).

**Accepted MVP limitation:** because the surface is plain text, a literal `{% mf x.y %}` a merchant _types as prose_ is indistinguishable from an inserted token and is treated as a token. There is **no escape hatch** in the MVP; this is a deliberate, documented trade-off for the simpler surface.

**Retired with the migration (features 112–113):** the inline link-styled **pill**, the **click-a-pill-to-edit** flow (the Insert-field modal is now create-only), and the entire **linear-caret / `contenteditable`** model (`valueParts.ts` caret math, `valueDom.ts` DOM glue, and the granular `SET_VALUE_TEXT` / `REMOVE_VALUE_PART` / `SET_VALUE_PART` / `INSERT_VALUE_PART_AT` reducer actions). The caret is now the textarea's native `selectionStart` character offset. Native browser undo/redo (the original defect that motivated the migration) works because the textarea is uncontrolled and reconciled only on genuine divergence.

### Multiline values

A value may span multiple hard-break lines by placing `LINE_BREAK` parts between content parts. Soft-wrapping of long text happens automatically via CSS and needs no part — `LINE_BREAK` is only for **author-intended** breaks (e.g., a "Features" value with one item per line).

Example — a two-line value:

```json
"valueParts": [
  { "type": "TEXT", "text": "1000 nits max brightness (typical)" },
  { "type": "LINE_BREAK" },
  { "type": "TEXT", "text": "1600 nits peak brightness (HDR)" }
]
```

- `LINE_BREAK` is purely structural: it carries no `text` and no dynamic reference, and is ignored when determining whether a row is empty (see §10).
- Line breaks inside a value never count toward the 200-row cap — only rows do.
- `LINE_BREAK` is product-agnostic static structure; it does not affect row `key` alignment or the comparison-readiness invariant.
- The editor renders these breaks identically to the storefront (WYSIWYG).
- **How a merchant AUTHORS a multiline value:** `Enter` in the value textarea, or **pasting plain multi-line text into a value cell** (feature 115). The textarea's own `\n` is mapped to `LINE_BREAK` by `textToParts` (§7 codec), so paste needs no special case — it rides the native paste.
- 🔴 **Where you paste decides bulk-vs-in-cell** (feature 115, amending feature 21's content-first intent). The two paste entry points ask **different questions** of the same parsed clipboard grid:
  - **Value cell** → `hasMultipleColumns(grid)`: only a genuinely multi-**column** table (Excel/Sheets/HTML `<table>`) bulk-creates rows. A single-column paste — plain multi-line text — stays in the cell as a multiline value. This is the fix for pasted prose exploding into one label-only row per line.
  - **Container** (the grid, no value cell focused) → `cellCount(grid) > 1`: a column of lines still bulk-creates rows, so that gesture keeps a home.
  - The value cell is the sole authority for its own paste: it `preventDefault`s **only** when it consumes a table, and `handleContainerPaste` skips any `[data-value-cell]` target so a fall-through paste is never re-grabbed.

### Section header row

| Field           | Type             | Required | Description                                                                                                                                                                                                                                                             |
| --------------- | ---------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | string           | Yes      | Technical stable ID.                                                                                                                                                                                                                                                    |
| `key`           | string           | Yes      | Stable key such as `display` or `battery`.                                                                                                                                                                                                                              |
| `rowType`       | `SECTION_HEADER` | Yes      | Identifies this as a section header.                                                                                                                                                                                                                                    |
| `label`         | string           | Yes      | Section title shown to shoppers. **Blank ⇒ the row does not render** (feature 74 · R1) — a section header carries nothing but its title, so an empty one would paint a bare band. Tested trimmed, emitted untrimmed. Still stored, so the editor grid keeps showing it. |
| `hideWhenEmpty` | boolean          | Yes      | Future-compatible. Can help hide empty sections later. Note this flag is **not** what hides a blank section — R1 above is unconditional.                                                                                                                                |

### Row ID and key rules

- `id` is generated by the client (using browser-native `crypto.randomUUID()` when a new row is created) to keep the editor's React state and `@dnd-kit` reordering stable, and is accepted as-is by the server.
- `id` must never change.
- `id` must never be reused.
- `key` should be unique inside a template.
- `key` should be generated from the label initially, but editable by the app if needed.
- Changing a label should not automatically change the key after the row is created.

---

## 8. Save, Status, and Storefront Behavior

The MVP follows a Shopify-like admin model:

```text
Merchant edits template in the custom spec-table editor
    -> Unsaved changes live in React state
  -> Merchant clicks Save
    -> App validates rows
    -> App saves rows, styling, and status to Postgres
    -> App syncs Shopify delivery data for all template statuses
    -> Liquid checks template status before rendering
```

### Status behavior

| Status     | Saved in app? | Rendered on storefront? | MVP usage               |
| ---------- | ------------- | ----------------------- | ----------------------- |
| `ACTIVE`   | Yes           | Yes                     | Published/live table    |
| `DRAFT`    | Yes           | No                      | Saved but hidden        |
| `ARCHIVED` | Yes           | No                      | Hidden from normal list |

> **Rendering also requires an assignment.** `ACTIVE` is necessary but not sufficient: a template renders on a product only when an assignment routes that product to it (see §9). An `ACTIVE` template with no matching assignment renders nowhere. Status gates visibility; assignment gates reach.

> **Rendering also requires CONTENT** (feature 74 · R2). A third gate, applied last and evaluated per product because dynamic value parts resolve against the live product: if no row survives its own gate — every `hideWhenEmpty` row resolving empty, every section header blank (§7 · R1) — the block emits **nothing at all**: no wrapper `<div class="appx-spec-table">`, no empty `<table>`. This is what makes an untouched starter scaffold (one blank section header + five empty rows) render as silence rather than a bare grey band. The rows JSON is untouched — suppression is purely at render time, so the merchant's blank rows survive a save/reload round-trip in the editor. A section header with a REAL label whose rows are all hidden still renders (authored content; see feature 74 "R3", open).
>
> Implemented identically in the two hand-mirrored renderers: `blocks/spec_table.liquid` captures the body and emits the wrapper only if a `has_content` flag was set, and `app/routes/app.templates_.$id/specTablePreviewHtml.ts` returns `""`. The admin preview's empty state is the same condition, so preview and storefront agree by construction.

### Important product decision

This is not a versioned publish workflow. If a template is `ACTIVE`, saved row changes can appear on the storefront after sync.

That is acceptable for MVP because it matches the simple Shopify product-style save/status model. Later, if merchants need staging, approval, or scheduled publishing, add `TemplateVersion` or `TemplateSnapshot`.

---

## 9. Storefront Assignment Strategy

Liquid cannot read Appx Postgres data directly, so assignment resolution is **projected** into
Shopify data. Two things follow from that and govern everything below: Postgres holds the
rules, and Shopify holds a derived delivery copy that can fail to update independently (§13).

**The model, in four statements:**

1. **Assignment is rigid and merchant-controlled (Moon-Bundles style), not priority-resolved.**
   A template targets **one scope kind** (all products / selected products / product type /
   vendor / selected collections), optionally narrowed by `EXCLUDE` carve-outs. A dry-run
   checks it against every **other ACTIVE** template; any overlap **blocks activation**
   (`DRAFT → ACTIVE`). A template may be saved `DRAFT` with a conflict, never `ACTIVE`. The
   published rule set is therefore **disjoint** — the storefront never resolves precedence,
   so there is no merchant-facing `priority`.
2. **Broad rules deliver as O(1) entries in ONE shop-level routing metafield.**
   `[shop.metafields.app.routing]` (json, `access.storefront = "public_read"`, wire **v3**)
   holds the count-bounded tiers only: `byType`, `byVendor`, `byCollection`, `def`, plus the
   interned `handles[]`. A rule matching 20k products is still one write, and future matching
   products are covered with no re-materialization.
3. **Per-product entries deliver through sharded metaobjects** (feature 108). `byProduct` and
   `excluded` are split across **N = 1024** `$app:appx_routing_shard` metaobjects keyed
   `product.id mod 1024`, each with its own 128KB budget. A product page reads only its own
   shard. 🔴 **N can never change after launch** — a different modulus re-buckets every
   product (§14 D4).
4. **Metaobject-by-handle resolution is PROVEN live** (2026-07-07).
   `metaobjects["$app:appx_spec_table"][handle]` resolves an app-owned metaobject from a
   **handle string** and exposes `.status.value` / `.rows.value`. Both the `$app:` form and
   the resolved `app--<app-id>--appx_spec_table` form work; use `$app:`. App-owned
   metaobjects/metafields need `access.storefront = "public_read"` to be Liquid-readable —
   theme app extensions are storefront surfaces.

🚫 **There is no per-product override metafield, and no `byProduct` overflow escape hatch.**
`[product.metafields.app.spec_table]` was deleted from `shopify.app.toml` on 2026-08-04 and
the deploy took every stored value with it (declarative definitions are read-only through the
Admin API — the TOML _is_ the delete). It shipped in feature 34 as the product → template
pointer, was demoted to "bounded single-product override" on 2026-07-07, and **no app code
ever wrote it in either role** — `PRODUCT`-scope assignments have always gone into
`byProduct`. It was a live storefront **read** path with no writer. Three consequences:

- **Reinstating the Liquid read without reinstating the TOML definition is silently dead** —
  an undefined metafield resolves to nil, so the branch never fires and reads as a routing bug.
- **The old overflow plan died with it.** "Materialize per-product metafields via
  `bulkOperationRunMutation` when `byProduct` nears the json cap" is no longer available;
  re-adding a definition and re-populating ~2,500 products is a migration, not a config edit.
  Sharding (statement 3) is the replacement.
- `ProductAssignmentIndex` lost its only populated case and is now dormant (see below).

**Changelog** — the design changed three times; git holds the superseded text.
`2026-06-19` metaobject round-trip proven via Admin API · `2026-07-01` product → template
pointer implemented as a `metaobject_reference` metafield (feature 34), superseding an
earlier `single_line_text_field` handle sketch · `2026-07-07` rigid model + shop-level routing
map replaces per-product materialization and priority precedence · `2026-08-04` per-product
override metafield deleted · `2026-08-05` delivery wire compacted (Option 1) then sharded
(Option 2, wire v3).

### MVP strategy

The current product is matched to its one effective template through the **shop routing map +
its routing shard** — the only mechanism. MVP renders one spec table per product, and the
rigid block-on-conflict model guarantees exactly one match.

`ProductAssignment` stores the merchant's assignment **rules** (Postgres, source of truth).
`ShopStorefrontRouting` is the projected map pushed to Shopify. `ProductAssignmentIndex` is
dormant (see below).

### Assignment (Postgres) — rigid, block-on-conflict

The merchant gives a template **one scope** (a single selector, Kaching-style): all products, selected products, product type, vendor, or selected collections (`AssignmentScope`), optionally narrowed by `EXCLUDE` exceptions. Saving the rule writes `ProductAssignment` in Postgres — nothing is projected to Shopify while the template is `DRAFT`.

**Dry-run conflict check** runs at `DRAFT → ACTIVE` (and when an ACTIVE template's scope is edited): the candidate scope is tested for overlap against every **other ACTIVE** template's scope. Any overlap **blocks activation** and the merchant is shown which template collides; the template stays `DRAFT`. DRAFTs may hold conflicts freely. Because activation is gated this way, **the set of ACTIVE rules is always disjoint** — every product matches at most one, so the storefront needs no precedence.

**How overlap is computed cheaply (never a catalog scan):**

1. `ALL_PRODUCTS` overlaps everything; `PRODUCT_TYPE` / `VENDOR` are single-valued, so same-scope overlap is a string-equality/containment test — **O(1) Postgres set-algebra**.
2. Cross-dimension or multi-valued pairs (type × vendor, anything × collection, anything × tag) are tested with **one Shopify existence query** per existing ACTIVE rule: `products(first: 1, query: "product_type:'X' AND vendor:'Y'")` (or `collection_id:` / `tag:`) — a non-empty result means overlap. Cost is O(active rules) tiny queries, not O(catalog). (Filters + AND + `first:1` confirmed against docs.)

### Delivery (Shopify) — rebuild the routing projection

On every activate/deactivate (or ACTIVE-scope edit), the app rebuilds `ShopStorefrontRouting` from the ACTIVE, disjoint rules and pushes it to the `[shop.metafields.app.routing]` json metafield:

- Broad scopes each become **one map entry** — `PRODUCT_TYPE` → `byType`, `VENDOR` → `byVendor`, `COLLECTION` → `byCollection`, `TAG` → `byTag`, `ALL_PRODUCTS` → `default` — so a rule matching 20k products is still **O(1) writes**. **No per-product metafields; future matching products are covered automatically at render time.**
- Selected single products (`PRODUCT`) go into `byProduct`; `EXCLUDE` carve-outs go into `excludedProductGids` (the Postgres projection, unchanged). 🟢 **Option 2 — metaobject sharding — is now BUILT (feature 108, 2026-08-05).** `byProduct` and `excluded` no longer ride the shop `$app:routing` metafield: at write time they are split across N `$app:appx_routing_shard` metaobjects keyed by `product.id mod 1024` (`app/utils/routingShards.ts`), each shard with its **own** 128KB budget, so total per-product capacity is `N × 128KB` and a product page reads only its own shard. The shop metafield (wire **v3**) now carries only the count-bounded broad tiers (`byType` / `byVendor` / `byCollection` / `def`). 🔴 **N = 1024 can never change after launch** (a different modulus re-buckets every product). See §14. Failure mode is unchanged: a rejected write, not silent truncation.

### Storefront (Liquid) — resolve the one match

The theme app extension resolves the current product against the routing map top-down (order is efficiency only — disjointness guarantees ≤1 match):

1. `shard.by_product[<product id>]` — an **explicit single-product assignment**, read from this product's routing shard (feature 108), not the shop map. Checked **before** the exclude gate (feature 45 Decision B) so an excluded product still reaches its own dedicated table (the "all products EXCEPT X, and X gets its own table" story). The shard value is the handle **string** directly (D3).
2. `shard.excluded[<product id>]` present ⇒ the **broad** tiers below are carved out for it (render nothing **from the map**; the explicit `by_product` in step 1 still wins). The exclude gate only suppresses the broad tiers.
3. `byType[product.type]` → `byVendor[product.vendor]` → first hit scanning `product.collections` against `byCollection` (by collection id) → `routing.def` — the broad tiers, still from the shop `$app:routing` metafield.

> **Compact wire (Option 1 + 2, 2026-08-05):** the steps above say "product id" / "collection id" — the delivery map is keyed by **bare numeric id** (not the full GID). Broad tiers (`byType`/`byVendor`/`byCollection`/`def`) live in the shop `$app:routing` metafield with **handle-index** values (`routing.handles[index]`). The two per-product maps live in the shard (feature 108): `shard.by_product[pid]` → handle **string** (D3), and `shard.excluded[pid]` as O(1) object membership. The block resolves the shard (`product.id | modulo: 1024` → `routing-shard-<k>`) and passes it into the resolver. See the key-format note below and §14.

> **Implemented (feature 43 + 45, `context/features/43-…`, `45-…`).** The live projection json key for the shop default is **`defaultTemplateHandle`** (feature 40's `RoutingProjection`, written verbatim by 41) — not the loose `default` earlier in this section. `byTag` is intentionally **not read** in the Liquid: TAG is post-MVP (absent from the `AssignmentScope` enum), so `byTag` is always `{}` and scanning `product.tags` would be dead work (and risks Liquid's 50-iteration `for` cap on tag-heavy products). **Resolver order (feature 45 Decision B, minus the removed override tier):** `byProduct` → exclude gate → broad tiers — so an explicit `byProduct` assignment cannot be suppressed by a carve-out; only the broad tiers are gated. (Before feature 45, the exclude gate wrapped `byProduct` too, so an excluded product could never reach its own explicit assignment — a real storefront bug the reorder fixes.) Resolution lives in `snippets/spec-table-resolve.liquid` (emits the matched handle); the block resolves the metaobject and renders.

> **Routing-map key format — GID-faithful in the PROJECTION, bare-id in the WIRE.**
> Two encodings, and the distinction is load-bearing:
>
> - The **internal `RoutingProjection`** (feature 40, the `ShopStorefrontRouting`
>   Postgres row) is GID-faithful: `byProduct` / `byCollection` keys and
>   `excludedProductGids` entries are the **raw `scopeValue` GID**
>   (`gid://shopify/Product/…`), copied verbatim from `ProductAssignment.scopeValue`;
>   `byType` / `byVendor` keys are raw selector strings. Lossless, no GID parsing, and
>   effectively unbounded (jsonb). This is unchanged.
> - The **delivery wire** splits in two (since Option 2 on 2026-08-05). The `$app:routing`
>   metafield (wire **v3**) is broad tiers only: bare-id `byCollection` keys, `by*` / `def`
>   values as **indices into `handles[]`**. The two per-product maps moved to the
>   `$app:appx_routing_shard` metaobjects — `by_product` is `{ "<id>": "<handle string>" }`
>   (D3, not an index), `excluded` is a membership object `{ "<id>": 1 }`. See §14.
>
> The storefront builds no GID token: it uses a bare string key
> `{% assign pid = '' | append: product.id %}`, reads `shard.by_product.value[pid]` /
> `shard.excluded.value[pid]`, and dereferences the broad handle index once
> (`routing.handles[hidx]`). Two **private wire contracts** now: `spec-table-resolve.liquid`
> ↔ `compactRoutingForDelivery` (broad, `routingWireContract.test.ts`) and
> `spec_table.liquid`/`spec-table-resolve.liquid` ↔ `routingShards.ts` (shard,
> `routingShardWireContract.test.ts`) — change one side, change both.

The matched value is a template **handle**; resolve it with `metaobjects["$app:appx_spec_table"][handle]` (proven — see top-of-section update), then render only if `status.value == "ACTIVE"` and rows exist.

### Product assignment index (sparse)

🔴 **DORMANT since 2026-08-04 — nothing writes this table.** It was never a per-catalog cache (broad rules live in the shop routing map, so most products had **no** index row); its one populated case was the **materialized single-product override** — a `PRODUCT`-scope entry written as a per-product `$app:spec_table` metafield, with `appliedTemplateHandle` + `syncedToShopifyAt`, plus `STALE` rows when such an override needed resync. That metafield is gone (§9), so the case cannot arise. The table and its columns are **retained, not dropped**: dropping it is a migration, and `shop/redact` still deletes from it (§15). The drop should land with OQ-103-D's dead-index migration, not on its own.

The original semantics, for whoever revives it: `status = APPLIED` meant a per-product override metafield is set (`templateId`, `sourceAssignmentId`, `scope = PRODUCT`); `status = CONFLICT` is reserved for the rare hard `PRODUCT`-vs-`PRODUCT` override collision. **Rule-vs-rule conflicts are not stored here** — they are computed by the dry-run at activation and surfaced to the merchant immediately (blocking). The `[shopId, shopifyProductGid]` unique guarantees one override row per product.

### Conflict handling

Conflicts are resolved by **blocking, not precedence** — the merchant decides, exactly like Moon Bundles. There is no `priority` tiebreak in MVP.

- **Cross-scope overlap** (e.g. `ALL_PRODUCTS` vs `PRODUCT_TYPE`, or a selected product that also matches a type rule): blocked at `DRAFT → ACTIVE`. The merchant resolves it by narrowing scope, adding an `EXCLUDE` exception (for the product-level case below), or leaving one template `DRAFT`.
- **Two `ALL_PRODUCTS` templates both trying to be `ACTIVE`** is the only statically-decidable MVP tie: blocked (a shop default already exists).
- **Same-scope single-valued ties can't occur** by construction — a product has exactly one `product_type` and one `vendor`, and `@@unique([shopId, templateId, scope, scopeValue, mode])` stops literal duplicates.

> **`ALL_PRODUCTS` duplicates need a partial index — the composite `@@unique` above does not catch them.** `ALL_PRODUCTS` rules always store `scopeValue = NULL`, and Postgres treats `NULL`s as **distinct** in a unique index, so identical `ALL_PRODUCTS` rows for the same `(shopId, templateId, scope, mode)` could be inserted repeatedly. A **partial** unique index over the NULL-`scopeValue` rows closes that gap: `CREATE UNIQUE INDEX … ON "ProductAssignment" ("shopId", "templateId", "scope", "mode") WHERE "scopeValue" IS NULL` (migration `20260819022834_add_all_products_unique`). Prisma's schema DSL cannot express a partial (`WHERE`) index, so it lives in raw SQL, not `@@unique`; a companion note in `prisma/schema.prisma` cross-references it. Keep the two in sync. This is the row-level backstop to the activation-time "two `ALL_PRODUCTS` templates ACTIVE" block above — the block is dry-run logic; this guarantees no duplicate rule ever persists.

**`EXCLUDE` carve-outs resolve a PRODUCT-level conflict (feature 45 Decision A).** The dry-run gate subtracts carve-outs before declaring a collision, but **only** for the two decidable, product-attributable cases: (1) the candidate is `PRODUCT: X` and the other ACTIVE (covering) template excludes X, or (2) the other side is `PRODUCT: X` and the candidate (covering) template excludes X. So `A = ALL_PRODUCTS EXCLUDE X` and `B = PRODUCT X` may both be `ACTIVE`. **Broad×broad overlaps are never resolved by a carve-out** — a finite GID list can't prove two broad scopes disjoint, and the existence probe returns existence, not _which_ products; the merchant narrows scope instead. The subtraction is a filter the gate applies **around** the pure INCLUDE resolver (`assignmentOverlap.ts` stays INCLUDE-only). Implementation: the gate reads the candidate's pending carve-outs + each other ACTIVE template's carve-outs (`getActiveExcludesByTemplate` / `getExcludesForTemplate`, `assignmentActivation.server.ts`).

> **`EXCLUDE` UI is `ALL_PRODUCTS`-only (feature 45).** Although the gate _supports_ a carve-out on any broad scope (a `VENDOR EXCLUDE X` would resolve too), the editor Settings tab surfaces the "Except these products" control **only under the `ALL_PRODUCTS` scope**. Rationale: `ALL_PRODUCTS` overlaps every other scope, so the only rule that can coexist with `ALL_PRODUCTS EXCLUDE X` is a `PRODUCT: X` template — exactly the case the gate resolves — which makes the control impossible to misapply to an unresolvable broad×broad conflict. Carve-outs are `mode: EXCLUDE`, `scope: PRODUCT` rows written by `setTemplateExcludes` (touches only EXCLUDE rows, so the INCLUDE scope survives). Cost: "`VENDOR:Acme` except X" is not expressible in the MVP UI.

> **Multi-value scopes — one scope KIND per template, 1..N values (feature 46, server).** `PRODUCT` and `COLLECTION` may carry **several** values ("selected products / collections"); `ALL_PRODUCTS` / `PRODUCT_TYPE` / `VENDOR` stay single-valued. A template's INCLUDE rows are **homogeneous in scope kind** — `setTemplateScope` takes a `ScopeSelector[]` and replaces the whole INCLUDE set in one `$transaction` (validated arity via a `MULTI_VALUE_SCOPES` predicate — _distinct_ from `assignmentOverlap`'s per-product `SINGLE_VALUED`). The conflict gate generalizes accordingly: two templates collide iff **any** `(candidateSelector, otherSelector)` pair overlaps; the gate reasons **per pair**, subtracts EXCLUDE carve-outs **per pair**, then dedupes survivors to distinct templates **last** (subtract-before-dedupe — a multi-value _other_ template partially covered by the candidate's carve-outs must still block via its un-excluded members). The pure resolver (`assignmentOverlap.ts`) and the Shopify probe (feature 39) are unchanged; the routing projection already folds N rows/template into `byProduct`/`byCollection`. **Decision C — INCLUDE ∩ EXCLUDE disjoint per template:** a product a template INCLUDEs can never also be EXCLUDE'd (on the storefront `byProduct` beats the exclude gate, so the EXCLUDE would be inert _and_ would fool the gate's subtraction). Enforced two ways: `setTemplateScope` deletes any contradictory `EXCLUDE PRODUCT` row when it writes an `INCLUDE PRODUCT` set, and the editor action reconciles the PENDING excludes against the pending INCLUDE set before gating (the gate also strips the candidate's self-included products, defense in depth). The multi-select **UI** is feature 47; feature 46 is server-only (the single-select picker keeps working via a legacy `scopeValue` → 1-element-set normalization).

> **Multi-value scopes — the picker + loader (feature 47, UI).** The `PRODUCT`/`COLLECTION` scope control is a **multi-select picker → chip list**; `PRODUCT_TYPE`/`VENDOR` keep the single text field; `ALL_PRODUCTS`/`NONE` carry no value. The engine holds a value **set** (`scopeValues: { value, label, image }[]`), sent as `payload.scopeValues[]`. A valued kind with **zero** values is _incomplete_ (Save disabled via `isScopeSetComplete`), **not** a clear — only `NONE` clears. 🔴 **The loader reads the full INCLUDE set** (`getTemplateIncludeSelectors`, replacing the single-row `getAssignmentForTemplate`) and batch-resolves chip labels + images in one `nodes(ids:)` query (`resolveScopeResourceDetails`, per-chunk fail-soft to the GID) — so an **N>1 template round-trips through the editor without collapsing to one value** (the feature-46 Step-5 hazard). Server/gate/writer/projection/Decision-C are **unchanged from feature 46** — 47 only reshapes what the browser sends and shows. Chip presentation (`ResourceChipCard`, shared by the scope and EXCLUDE lists) and list collapsing (`CollapsibleChipList`, `MAX_INLINE_CHIPS = 4`) are display-only client state: see `context/features/47-…`.

`priority` stays in the schema but **dormant and unsurfaced**. It is a forward-compatible landing spot for a post-MVP same-tier tiebreak on **multi-valued** scopes (a product in two different collection rules, or two tag rules), where an overlap can appear at render time on a _future_ product that didn't exist at activation. Even then, prefer an implicit rule (most-recently-updated wins) or a contextual prompt over a global numeric knob — do not surface a priority field in the MVP UI.

While a conflict is unresolved the template cannot go `ACTIVE`, so nothing is projected to the routing map for it and the storefront is unaffected.

---

## 10. Shopify Metaobject Strategy

### Metaobject definition

One metaobject definition, **declared declaratively in `shopify.app.toml`**
(`[metaobjects.app.appx_spec_table]`) and distributed automatically to every
shop on install/deploy. **Implemented and round-trip-tested live (Editor Step
9.5, 2026-06-19); decisions locked:**

> **Declarative since 2026-07-01.** The definition was moved off a **runtime**
> `metaobjectDefinitionCreate` (once per shop) to **declarative TOML** — Shopify's
> recommended path for app-owned data. `ensureSpecTableDefinition` and
> `setShopMetaobjectDefinitionGid` were removed, leaving `Shop.metaobjectDefinitionGid`
> **vestigial** (no longer written or read); dropping the column is a deferred cleanup
> that wants to land with OQ-103-D's index migration, not on its own.

- **Type is app-reserved: `$app:appx_spec_table`** (resolves to `app--<app-id>--appx_spec_table`) — the `$app:` prefix reserves it for this app's exclusive use so neither the merchant nor another app can alter its structure (data safety, priority #1). `access: { admin: merchant_read_write, storefront: public_read }`.
- **Fields:**

  | Key           | Type                     | Purpose                                                                                                                                                                                                                                                                                       |
  | ------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `template_id` | `single_line_text_field` | Internal Appx template ID.                                                                                                                                                                                                                                                                    |
  | `status`      | `single_line_text_field` | `ACTIVE` / `DRAFT` / `ARCHIVED`.                                                                                                                                                                                                                                                              |
  | `rows`        | `json`                   | Storefront-ready rows — a JSON **string** (`JSON.stringify(rows)`); the **same** `EditorRow[]` shape, no reshape needed.                                                                                                                                                                      |
  | `styling`     | `json`                   | Storefront-ready styling **data** — the template's `TableStyling` as a JSON string, **overrides only** (non-default knobs + non-null colors; `{}`/absent = full theme inherit). Spec: §5 `TableStyling` + the serialization note below.                                                       |
  | `styling_css` | `json`                   | Storefront-ready styling **presentation**, precomputed by the server: `{ "classes": "<space-joined modifier classes>", "vars": "<--k: v; declarations>" }`. Liquid prints both verbatim; it derives nothing. Added feature 57 Step 7 (2026-07-19) — see the styling-serialization note below. |
  | `updated_at`  | `single_line_text_field` | Debugging/sync visibility.                                                                                                                                                                                                                                                                    |

- **Definition:** declared in `shopify.app.toml`, not created at runtime (see the update note above). The definition is read-only through the Admin API.
- **Entry mutations** (validated with `validate_graphql_codeblocks` @ 2025-10, in `app/shopify/metaobjects.server.ts`): `metaobjectUpsert` per template by handle `template-{templateId}` (store the returned GID + handle on the `Template`); `metaobjectByHandle` to read back; `metaobjectDelete` on template delete. Sync runs for every status; the storefront gates visibility on `status == ACTIVE`.

### Routing shard metaobject (feature 108)

A **second** app-owned definition, `[metaobjects.app.appx_routing_shard]` in `shopify.app.toml` (type `$app:appx_routing_shard`, `access: { admin: merchant_read_write, storefront: public_read }`). It carries the two unbounded per-product routing maps, sharded by `product.id mod 1024` so each shard has its own 128KB budget (§9, §14). One metaobject per **occupied** bucket, handle `routing-shard-<k>`.

| Key            | Type                     | Purpose                                                                                                          |
| -------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `by_product`   | `json`                   | `{ "<bare product id>": "<template handle string>" }` (D3 — the handle string directly, not an interned index).  |
| `excluded`     | `json`                   | `{ "<bare product id>": 1 }` — EXCLUDE carve-out membership.                                                     |
| `wire_version` | `single_line_text_field` | Debug-only wire tag (`"3"`); a metaobject field key must be ≥2 chars, so not `v`. The storefront never reads it. |

- **Writer** (`app/shopify/routing.server.ts`): reconciles by content hash — `metaobjectUpsert` only buckets whose hash changed, upsert-to-**empty** (never delete) buckets that emptied. The `{bucketKey → hash}` ledger lives in `ShopStorefrontRouting.shardState` (delivery-only, never sent to the storefront). D5.
- **Reader:** the block resolves `metaobjects["$app:appx_routing_shard"]["routing-shard-<product.id mod 1024>"]` and passes it into `spec-table-resolve.liquid`. 🔴 The modulus (1024) and type string are a cross-language contract with `routingShards.ts`, guarded by `routingShardWireContract.test.ts`.

### Store both GID and handle

`Template` stores `shopifyMetaobjectGid` (for Admin API updates) and `shopifyMetaobjectHandle` (for Liquid lookup). Handle format: `template-{templateId}` (e.g. `template-clx2def456`).

### Storefront serialization

The metaobject stores template structure — the same `EditorRow[]` rows JSON (see the §6 example). **One** pointer reaches it: a template **handle**, resolved directly via `metaobjects["$app:appx_spec_table"][handle]` (§9, proven 2026-07-07). The handle comes from the shop routing map (`shop.metafields["$app"].routing`) for broad rules, or from this product's routing shard for per-product entries. Liquid resolves each value by joining its parts in order via `snippets/spec-table-value.liquid`: `TEXT` from row JSON, `SHOPIFY_FIELD` from the Shopify product object, `METAFIELD` from `product.metafields`, `LINE_BREAK` as a hard break (`<br>`, no content). Variant `SHOPIFY_FIELD`s (price, sku, weight, …) resolve against `product.first_available_variant` — the **default** variant, not a shopper selection (feature 35 decision; live variant-switch re-rendering is deferred until requested).

**Styling serialization (Style-tab spec 2026-07-18).** The metaobject's `styling` field carries the template's `TableStyling` as a JSON string, written on every sync exactly like `rows`: the layout knobs (`rowLayout`, `mobileLayout`, `sectionHeaderStyle`, `sectionsCollapsible`, `sectionsInitialState`, `rowDividerStyle`, `density`) plus the non-null color/typography overrides — **overrides only**, so an absent/empty object means the table inherits the theme entirely (the zero-config path). Colors/typography become **CSS custom properties on the `.appx-spec-table` wrapper** and layout knobs become **modifier classes** on the same wrapper (e.g. stacked / striped / banded); collapsible sections render as native `<details>/<summary>` groups, with data rows grouped under the preceding `SECTION_HEADER` **at render time** — sections remain flat rows in the data (§7); grouping is strictly a render concern. Because styling is per-template with copy semantics (§5), there is **no shop-level styling metafield** — one delivery path, and no template resync is ever triggered by another template's (or a preset's) style change.

> **Update (2026-07-19, feature 57 Step 7) — the server precomputes; Liquid only prints.** The
> classes/vars translation above is **not** performed in Liquid. Liquid cannot import the TypeScript
> mapping (`app/utils/tableStylingCss.ts`), so deriving there would mean a fourth hand-maintained
> copy of a 20-knob mapping in a language with no exhaustiveness checking — a knob added later would
> silently fail on the storefront only. Instead the sync writes a **second field**, `styling_css`,
> holding the already-joined `{classes, vars}` pair, and `spec_table.liquid` interpolates them into
> the wrapper's `class` and `style` attributes with **zero styling logic**. The split is deliberate:
> `styling` is the **data** (debuggable, migration-proof, independent of CSS naming, and the source
> for Step 13 preset provenance); `styling_css` is a **derived cache** of the presentation, so a
> future CSS-variable rename is a resync, not a data migration. `styling_css` is typed `json` rather
> than `single_line_text_field` because a fully-overridden value produces ~450 characters of
> declarations. Both fields are written together on every sync, from the same resolved
> `StylingValues`, so they cannot disagree.
>
> **Backfill is lazy by design.** An entry synced before this deploy simply lacks `styling_css`; both
> interpolations render blank, which is byte-identical to the pre-Step-7 markup. Entries gain the
> field on their next save or status change — no bulk resync, no migration script.
>
> This is the one **definition change** Phase B needs (the `styling` field itself shipped with slice
> 1). It is strictly **additive** — never delete/recreate a definition, which poisons existing handles
> with `UNDEFINED_OBJECT_TYPE` — and requires `shopify app deploy` to distribute.

`hideWhenEmpty` is a **whole-cell character test**, evaluated for the entire row (never per line). The row is hidden when `hideWhenEmpty = true` **and** the fully resolved value cell — all parts joined, all dynamic parts resolved, with `LINE_BREAK` `<br>`s stripped (`strip_html`) so they never count — contains zero non-whitespace characters:

- A `TEXT`-only cell always has characters, so it always renders.
- A cell whose only content is empty dynamic parts (`SHOPIFY_FIELD` / `METAFIELD` that resolve to nothing) is empty → hidden.
- A **mixed** cell like `"Up to " + [empty metafield] + " hours"` still has literal text, so it **renders** (the orphaned-text edge is accepted for MVP). This **supersedes** the earlier "leftover `TEXT` is hidden with the row" rule.

Separately, the block renders the table only for an **`ACTIVE`** metaobject status with ≥1 row; a non-ACTIVE status, no assigned template, or no rows renders nothing (silent by design). Feature 35 shipped + browser-verified 2026-07-02.

---

## 11. Billing and Entitlement Strategy

> **Superseded 2026-08-20.** The early-bird / review-reward model below is retired (see
> `prd.md` §Pricing and the `shopify-app-pricing-vs-billing-api` decision). Billing is now
> **Shopify App Pricing** with four tiers gated by **assigned-product count**. The
> `AppSubscription` / `ShopEntitlement` models (§5) are **not written or read** by the current
> billing path and are dormant, not load-bearing — left in the schema to avoid a destructive
> migration; do not build on them without a fresh decision.

### 11.1 Entitlement source — no stored entitlement

The active plan is **not** persisted; it is read live from Shopify each loader run
(`app/shopify/billing.server.ts` → `currentAppInstallation.activeSubscriptions`, mapped to a
tier by Display name in `app/utils/billingPlans.ts`). There is no entitlement row to drift out
of sync with Shopify's billing state.

> **Plans are live in the Dashboard as of 2026-08-20** (drafted, App Pricing not yet enabled):
> `Free` $0 · `Go` $4.99/mo · `Plus` $9.99/mo (or $99.99/yr) · `Max` $14.99/mo (or $145.99/yr),
> all paid tiers 60-day trial. **The billing interval (monthly vs annual) is invisible to this
> code** — the subscription `name` is identical for both, and the cap is keyed off the name — so
> the annual option required no code change. Handles (`free`/`go`/`plus`/`max`) match the tier ids
> and back the Partner-API fallback if `activeSubscriptions[].name` ever proves unreliable.

### 11.2 The cap, and what counts (decided 2026-08-20)

Each tier caps the shop's **total assigned products**: Free 25 · Go 250 · Plus 1,000 · Max
unlimited (`null` cap). Shopify does **not** enforce this — the app does.

- **Counting model = SUM OF PER-TEMPLATE COUNTS.** The shop total is the sum, across all the
  shop's templates, of each template's assigned-product count as already computed by
  `resolveAssignedProductCounts` (§13 R3c / feature 48). A product assigned to two templates
  counts twice — an accepted approximation that reuses the exact number the templates list
  already shows the merchant, and needs no product-GID enumeration. `ALL_PRODUCTS` resolves to
  the shop's live product total minus EXCLUDE carve-outs, so assigning it on a small tier blocks
  once the catalog exceeds the cap.
- **Enforcement point = assignment SAVE, HARD BLOCK.** The assignment action
  (`app/routes/app.templates_.$id/route.tsx`) runs a dry-run cap gate BEFORE any write, mirroring
  the activation-conflict gate: it projects the post-save shop total (current total − the edited
  template's stored count + its proposed count) and, when the change would **increase** the total
  **past the active plan's cap**, blocks atomically (writes nothing) with a message pointing to
  upgrade. A change that keeps the total the same or **reduces** it is never blocked — so a
  merchant who downgrades while over-cap keeps their existing assignments and can still prune
  them, but cannot add more until back under the cap.
- **FAIL BIAS = CLOSED on a determinable overage, OPEN on the unknowable.** The projected total
  depends on live Admin counts (`ALL_PRODUCTS` needs the shop product total). If a required count
  is UNKNOWN (Admin API failure), the gate does **not** block — a transient outage must not wedge
  a merchant out of saving (mirrors §13's cosmetic-count fail-soft, and the loader gate's
  fail-open). The block fires only on a **determined** overage. Unlimited (Max, `null` cap) skips
  the projection entirely — no Admin calls.

### 11.3 Manage-plan access (App Store req 1.2.3)

A visible in-app **Manage plan** link points to the same hosted plan-selection page as the
loader gate (`planSelectionUrl`, `admin.shopify.com/store/<store>/charges/<app_handle>/pricing_plans`,
opened `target:"_top"` to escape the embedded iframe), so a merchant can upgrade/downgrade
without contacting support or reinstalling.

---

## 12. Why Row Keys Matter

`id` and `key` serve different jobs, so every row carries both:

- **`id`** — technical database identity (relational refs, analytics, audit logs). Client-generated, never changes, never reused; the merchant never sees it.
- **`key`** — the row's stable _meaning_ (e.g. `screen_size`), used for CSV import/export matching, AI auto-fill, localization, JSON-LD/SEO, and product metafield JSON values. Generated from the label at creation, then stable: translating the label to French/Arabic leaves `key` as `screen_size`, so anything keyed on it never breaks when the label changes.

See §7 for the full id/key rules.

---

## 13. Read Patterns

> **Added 2026-08-01 (step 103, `context/features/103-read-pattern-catalog.md`).**
> §1–§12 document the **write** side thoroughly. This section answers the other
> question: _what reads this, how often, and how large can it get?_
>
> **This section records what IS, not what should be.** Where a read is unbounded
> it says so and stops — it proposes no pagination, cache, or schema change.
> Findings are routed at the end of the section; none of them are fixed here.

### The three stores, and why the distinction is load-bearing

Every row's **Served from** column names exactly one primary store. They are never
interchangeable — they fail in completely different ways:

| Store                           | Failure mode                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Postgres (Neon)**             | Source of truth. Fails **loudly**, per request, recoverable.                                                                                   |
| **Shop metafield / metaobject** | The **delivery copy**. Hard size ceilings; fails at **write** time, and the failure surfaces much later as a **stale read** on the storefront. |
| **Admin API**                   | Live, rate-limited; a **latency dependency** of the admin UI.                                                                                  |

A read served from the delivery copy is **not** "a database read that happens to be
cached". R7 below is the concrete case: a routing write that fails leaves Postgres
correct and the storefront serving the previous blob, indefinitely, with nothing
merchant-visible saying so.

**Volume is relative, never absolute.** No traffic figures are invented here; the
column exists to rank the reads against each other, which is all any decision
downstream needs.

### R1 · Storefront (no app server involved at all)

The highest-volume reads in the system, and the only ones a shopper triggers.
The product-page read is **not one row** — `blocks/spec_table.liquid` and
`snippets/spec-table-resolve.liquid` carry separately-bounded costs, so each gets
its own row.

| Read                                    | Trigger                                                                                                                                       | Volume                                                                      | Served from                                                      | Bounded by                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1a** · Routing blob transfer + parse | Every product page view                                                                                                                       | **Highest** — every product page, every shopper                             | **Shop metafield** (`shop.metafields["$app"].routing`, wire v3)  | Total entries across the **broad** tiers only — `byType` + `byVendor` + `byCollection` + `def` (one per ACTIVE INCLUDE assignment row). Per-product maps moved to the shards (R1e). **Hard ceiling: 128KB** (json metafield write, API 2026-04+). ⚠️ **Not enforced today** — the runtime Admin client is `ApiVersion.October25` (`app/shopify.server.ts:13`), i.e. pre-2026-04, so writes currently sit at the legacy 2MB limit. See F1 / §14. |
| **R1b** · The exclude gate              | Every product page view that reaches the broad tiers — `snippets/spec-table-resolve.liquid`                                                   | **Highest** (same page views as R1a, minus `by_product` hits)               | **Routing shard metaobject** (R1e)                               | **NOTHING caps the count app-side.** The gate is `shard.excluded[pid]` — an **O(1) object-membership** lookup (was a linear array scan pre-Option-1), so per-page cost no longer grows with the carve-out count. No cap in `setTemplateExcludes` (`app/models/assignment.server.ts`), the projection, or the picker. 🟢 Since sharding the bound is **per shard**, not shared with the shop wire. See F2.                                       |
| **R1c** · The collection scan           | Product page views reaching the collection tier — `snippets/spec-table-resolve.liquid:58–72`                                                  | High (page views with no `byProduct`/`byType`/`byVendor` hit, not excluded) | **Shop metafield** + the storefront `product.collections` object | The **product's own** collection membership — not the shop's collection count. Walked in 50-item chunks (Liquid's `for` cap) with one `byCollection` lookup per collection, breaking on first hit. No app-side cap; the effective ceiling is Shopify's own per-product collection limit.                                                                                                                                                        |
| **R1d** · The rows render               | Every product page view that resolves a template — `blocks/spec_table.liquid:200–268`                                                         | High (page views that render a table)                                       | **Metaobject** (`spec.rows.value`)                               | `MAX_TEMPLATE_ROWS = 200` (`app/utils/rows.ts:14`), re-enforced server-side at `app/models/template.server.ts:39`. Walked in 50-row chunks; each DATA row renders `snippets/spec-table-value.liquid`.                                                                                                                                                                                                                                           |
| **R1e** · Routing shard fetch           | Every product page view, unconditionally — the block resolves `metaobjects["$app:appx_routing_shard"]["routing-shard-<product.id mod 1024>"]` | **Highest** — same as R1a                                                   | **Routing shard metaobject** (feature 108)                       | One shard's `by_product` + `excluded` json. Holds `catalog/1024` entries — ~977 at a 1M-product catalog, ~50KB, well under its **own** 128KB ceiling. Sharding is what removed the shared per-product budget; see §14.                                                                                                                                                                                                                          |
| **R1f** · Metaobject fetch by handle    | Product page views where routing matched                                                                                                      | High (same as R1d)                                                          | **Metaobject** (`metaobjects["$app:appx_spec_table"][handle]`)   | One metaobject entry: `rows` (bounded by R1d's 200-row cap), `styling` (overrides-only; ≤ the `TableStyling` column set of §5), `styling_css` (~450 chars fully overridden, §10). All three are `json` fields, each with its own 128KB write ceiling.                                                                                                                                                                                           |

📌 **R1a and R1e are both unconditional in source** — the block assigns the routing
blob and resolves this product's shard before any tier test, so neither read is gated
on an earlier tier missing. Whether Shopify's Liquid defers the json parse until first
use is **not determinable by reading**; either way the bounds above are unchanged.

### R2–R5 · Admin, React Router loaders

| Read                                               | Trigger                                                                                                                                                 | Volume                                                                     | Served from                                                 | Bounded by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R2a** · Templates list — the templates           | Templates-list page view — `app/routes/app.templates.tsx` loader → `listTemplateSummariesForDomain` (`app/models/template.server.ts`)                   | **Highest in the admin** (most-visited page)                               | **Postgres**                                                | The shop's template count. ✅ **F3 fixed 2026-08-03:** a `$queryRaw` selecting only `id/name/status/updatedAt` + `jsonb_array_length(rows)` — the `rows` blob (≤200 rows) is **no longer read or shipped**; the count is computed in the DB. Keyed off `myshopifyDomain` via a `Shop` JOIN (bound param), so the read no longer waits on the shop-row upsert. ⚠️ **Still unpaginated** — returns ALL of a shop's templates (the remaining half of F3, → Next-Up item 9).                                                                                                                                                                                        |
| **R2b** · Templates list — assigned-product counts | Same loader, now **deferred/streamed** — `app/routes/app.templates.tsx` → `app/shopify/assignedProductCounts.server.ts:385`                             | Same as R2a                                                                | **Postgres** (primary, line 389) **+ Admin API** (line 407) | Postgres: the shop's total `ProductAssignment` row count (`where: { shopId }`, no pagination). Admin API: **exactly one** batched aliased request whose _document_ grows with the number of **distinct** broad values (collections + product types + vendors) across all templates (`buildAssignedCountQuery:202`) — O(1) requests, **not** O(templates). Skipped entirely when every template is PRODUCT/NONE. ✅ **2026-08-03:** the loader returns this UNAWAITED — it streams to the client and each cell resolves under `<Suspense>`/`<Await>`, off the critical path for first paint. Fail-soft (line 422): a failure renders "—", never breaks the list. |
| **R3a** · Editor — template + styling              | Editor open — `app/routes/app.templates_.$id/route.tsx:165` → `app/models/template.server.ts:242`                                                       | One per editor open                                                        | **Postgres**                                                | One `Template` row by primary key + its one `TableStyling` row (`include`). `rows` ≤ `MAX_TEMPLATE_ROWS` (200).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **R3b** · Editor — INCLUDE scope set               | Editor open — `route.tsx:177` → `app/models/assignment.server.ts:66`                                                                                    | One per editor open                                                        | **Postgres**                                                | The template's INCLUDE row count: 0 (NONE), 1 (ALL_PRODUCTS / PRODUCT_TYPE / VENDOR), or **1..N uncapped** for PRODUCT / COLLECTION (feature 46 multi-value).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **R3c** · Editor — INCLUDE chip labels             | Editor open, PRODUCT/COLLECTION scopes only — `route.tsx:90` → `app/shopify/scopeResourceLabel.server.ts:190`                                           | One per editor open                                                        | **Admin API**                                               | `ceil(\|R3b\| / 250)` sequential `nodes(ids:)` requests — `NODES_MAX_IDS = 250` (`scopeResourceLabel.server.ts:51`), chunked at `:201`. One request at or under the cap. R3b itself is uncapped, so the **request count** is unbounded; each request is not. Per-chunk fail-soft (`:130`): a failing chunk degrades only its own ids to raw GIDs. ✅ Was "one unchunked request, whole batch fails" — fixed 2026-08-01, see F4.                                                                                                                                                                                                                                 |
| **R3d** · Editor — EXCLUDE carve-outs              | Editor open — `route.tsx:186` → `app/models/assignment.server.ts:337`                                                                                   | One per editor open                                                        | **Postgres**                                                | **NOTHING** — the same uncapped set as R1b, read here per template rather than per shop. Loaded even when the scope is not ALL_PRODUCTS (`route.tsx:184`). See F2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **R3e** · Editor — EXCLUDE chip labels             | Editor open — `route.tsx:187` → `scopeResourceLabel.server.ts:190`                                                                                      | One per editor open                                                        | **Admin API**                                               | `ceil(\|R3d\| / 250)` sequential requests, same chunking and same per-chunk fail-soft as R3c. Because R3d is bounded by **nothing**, this is the read that reaches multiple chunks first. ✅ Fixed alongside R3c, see F4.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **R4** · Product metafield definitions             | **First** Insert-field modal open per editor session — `app/routes/app.metafield-definitions.tsx:33` → `app/shopify/metafieldDefinitions.server.ts:148` | Low — lazy `useFetcher`, never eager (a merchant may never open the modal) | **Admin API**                                               | `PAGE_SIZE = 250` × `MAX_PAGES = 10` = **2,500 definitions**, then a logged warning rather than a silent truncation (line 172). Shopify caps product metafield definitions at 256 per app and 256 for the merchant, so the backstop sits far above any realistic shop.                                                                                                                                                                                                                                                                                                                                                                                          |
| **R5a** · App shell — shop upsert                  | **Every** admin page view (`/app` is the parent route of every admin page) — `app/routes/app.tsx:13` → `app/models/shop.server.ts:5`                    | High — every admin navigation                                              | **Postgres**                                                | O(1). One `findUnique` on `Shop.myshopifyDomain` (`@unique`). The upsert branch runs only on first install / reinstall — steady state returns at `shop.server.ts:11` after the single indexed point read.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **R5b** · App index (Home)                         | Home page view — `app/routes/app._index.tsx:12`                                                                                                         | One per Home view                                                          | **Nothing**                                                 | O(1), no data read: the loader is `authenticate.admin(request)` then `return null`. 📌 The `admin.graphql` calls in the same file are in the **boilerplate `action`** (line 19), not the loader — they run only on the demo button, never on load.                                                                                                                                                                                                                                                                                                                                                                                                              |

### R6–R7 · Admin write paths whose _reads_ are the cost

| Read                                                                 | Trigger                                                                                                                      | Volume                                  | Served from              | Bounded by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R6** · Activation dry-run (the conflict gate)                      | DRAFT→ACTIVE, and any editor Save that changes an ACTIVE template's scope — `app/shopify/assignmentActivation.server.ts:164` | Low — one per activation / scope change | **Postgres + Admin API** | **Postgres: ≤4 queries**, each O(the shop's assignment rows) — `getTemplateIncludeSelectors` (line 175), `getActiveIncludeScopesExcept` (183), `getActiveExcludesByTemplate` (225), `getExcludesForTemplate` (240). **Admin API: \|candidateSelectors\| × \|NEEDS_CHECK others\| requests, run SEQUENTIALLY** — the candidate loop is `assignmentActivation.server.ts:191`, the probe loop with an `await` inside it is `assignmentConflict.server.ts:178`. Every probe is `products(first: 1, query:)` (`assignmentConflict.server.ts:153`) — **never a catalog scan**, as claimed. See F5. |
| **R7** · Routing map projection (the write that produces R1a's blob) | activate / deactivate / ACTIVE-scope change — `app/shopify/routing.server.ts:195`                                            | Low — same as R6                        | **Postgres + Admin API** | Postgres: one `template.findMany({ shopId, status: "ACTIVE" })` with nested assignments (line 200) — O(ACTIVE templates + their assignment rows) — then one `shopStorefrontRouting.upsert` (222). Admin API: exactly **2** requests (`ShopId` query at line 170, `metafieldsSet` at 231). ⚠️ **R7's output bound IS R1a's ceiling** — the `metafieldsSet` payload is the blob R1a reads.                                                                                                                                                                                                     |

🔴 **R7 is where a 128KB overflow would surface, and §D3's failure mode is exact.**
The write is ordered Postgres-**first** (`routing.server.ts:212`), so an over-ceiling
`metafieldsSet` returns a `userErrors` entry — narrowed at `routing.server.ts:114`,
surfaced as "Saved routing, but couldn't publish it to your storefront." — while the
`ShopStorefrontRouting` row is already correct and `syncedToShopifyAt` is left
unstamped. The storefront then keeps serving the **previous** blob. The write fails
loudly to the merchant _at that moment_; the read stays silently stale afterwards.

### R8 · Webhooks

| Read                          | Trigger                                                                                      | Volume               | Served from  | Bounded by                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------- | -------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R8a** · `app/uninstalled`   | App uninstall; **retried by Shopify** on failure — `app/routes/webhooks.app.uninstalled.tsx` | Very low, **bursty** | **Postgres** | Two writes, no reads: `markShopUninstalled` → one `updateMany` on `Shop.myshopifyDomain` (`@unique`, `app/models/shop.server.ts:38`), and one `session.deleteMany({ where: { shop } })` — O(that shop's session rows). Idempotent by construction, so a retry burst is safe. Connection-pool behaviour under burst: see OQ-103-A. |
| **R8b** · `app/scopes_update` | Scope change; retried — `app/routes/webhooks.app.scopes_update.tsx`                          | Very low, bursty     | **Postgres** | O(1) — one `session.update` by primary key. Connection-pool behaviour under burst: see OQ-103-A.                                                                                                                                                                                                                                  |

⚠️ **What a burst does to the Neon connection pool is NOT determinable by reading.**
No `connection_limit` or pool size is set in `prisma/schema.prisma`, `app/db.server.ts`,
or any tracked file — the parameters live in `DATABASE_URL` in an untracked `.env`.
Recorded as **OQ-103-A** in `progress-tracker.md` §Open Questions rather than guessed.

### Index → read mapping

Every index in `prisma/schema.prisma`, and the catalogued read it serves.
**An index that serves no catalogued read is a finding, recorded rather than dropped.**

| Index (`prisma/schema.prisma`)                                                     | Serves                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Shop @@index([isInstalled])` (:71)                                                | 🔴 **No catalogued read.** The only `isInstalled` predicate is `markShopUninstalled` (`shop.server.ts:39`), which resolves through the `myshopifyDomain` `@unique`; `isInstalled` is a filter there, not a lookup key. No query selects shops _by_ install state. |
| `Template @@unique([shopId, shopifyMetaobjectHandle])` (:104)                      | Constraint (handle uniqueness per shop). Its `[shopId]` prefix also covers R2a — which makes the next row redundant.                                                                                                                                              |
| `Template @@index([shopId])` (:105)                                                | R2a. ⚠️ Redundant with the `@@unique` above, whose leading column is the same.                                                                                                                                                                                    |
| `Template @@index([shopId, status])` (:106)                                        | R7 (`findMany({ shopId, status: "ACTIVE" })`).                                                                                                                                                                                                                    |
| `ProductAssignment @@unique([shopId, templateId, scope, scopeValue, mode])` (:220) | Constraint (stops literal duplicate rules, §9).                                                                                                                                                                                                                   |
| `ProductAssignment @@index([shopId, scope])` (:221)                                | Its `[shopId]` prefix serves R2b. ⚠️ **The `scope` component serves no catalogued read** — no query filters on `scope` without also filtering `templateId`.                                                                                                       |
| `ProductAssignment @@index([shopId, scope, scopeValue])` (:222)                    | 🔴 **No catalogued read.** The only `scopeValue` predicate in the codebase is `setTemplateScope`'s contradiction-delete (`assignment.server.ts:176`), which is a **write** and is already narrowed by `templateId`.                                               |
| `ProductAssignment @@index([shopId, templateId])` (:223)                           | R3b, R3d, R6, and every assignment write path.                                                                                                                                                                                                                    |
| `ProductAssignmentIndex @@unique([shopId, shopifyProductGid])` (:275)              | 🔴 **No read — the entire MODEL is unreferenced.**                                                                                                                                                                                                                |
| `ProductAssignmentIndex @@index([shopId, templateId])` (:276)                      | 🔴 ditto                                                                                                                                                                                                                                                          |
| `ProductAssignmentIndex @@index([shopId, status])` (:277)                          | 🔴 ditto                                                                                                                                                                                                                                                          |
| `ProductAssignmentIndex @@index([sourceAssignmentId])` (:278)                      | 🔴 ditto                                                                                                                                                                                                                                                          |

🔴 **`ProductAssignmentIndex` has zero references in application code** — no
`prisma.productAssignmentIndex` call, no import, no type reference anywhere under
`app/`. §9 describes it as "the sparse record of materialized single-product
overrides only", and the shop-routing redesign of 2026-07-07 removed the need to
materialize anything. Four indexes and one table serve nothing today. Recorded, not
dropped — dropping it is a migration and a different unit.

### Findings (routed, not fixed)

| #      | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Routed to                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **F1** | R1a's 128KB ceiling is real, is **not** currently enforced, and this app is **not grandfathered**. Shopify limits `json` metafield **writes** to 128KB from API 2026-04; apps using json fields _before 2026-04-01_ keep the 2MB limit. This repo's first commit is **2026-06-09** and its first `type = "json"` declaration landed **2026-07-02** (`6d1cd3a`), both after the cutoff — so no grandfathering. It is masked only because the runtime Admin client is pinned to `ApiVersion.October25` (`app/shopify.server.ts:13`). **Moving the runtime client to 2026-04 or later activates the ceiling.** ✅ Quantified 2026-08-01 — see **§14**. | **104** (byte budgets) — ✅ **done**           |
| **F2** | `excludedProductGids` (R1b / R3d) is bounded by **nothing** app-side — no cap at the picker, the writer, or the projection. ✅ **Structurally resolved 2026-08-05:** Option 1 compacted the wire (exclude entry 38 → 18 bytes; gate became an O(1) object lookup, not a linear scan) and **Option 2 sharded it** — `excluded` and `byProduct` left the shop metafield for the `$app:appx_routing_shard` metaobjects, each with its own 128KB budget (§14). The **count** is still uncapped app-side; what changed is that it no longer shares one budget.                                                                                           | **104 → Option 1 + 2, ✅ done**                |
| **F3** | ✅ **FIXED 2026-08-03** (its own unit, not in 103's diff). R2a read and shipped **every template's full `rows` JSON** to the browser to render a row _count_. Now `listTemplateSummariesForDomain` (`template.server.ts`) is a `$queryRaw` that selects only `id/name/status/updatedAt` and computes the count in Postgres via `jsonb_array_length` — no `rows` blob leaves the DB. Keyed off `myshopifyDomain` via a `Shop` JOIN so it no longer waits on `upsertShop`, and R2b is now deferred/streamed. ⚠️ **Still unpaginated** — the remaining `rows`-blob half is closed; the pagination half stays open.                                     | **Next-Up item 9** (templates-list pagination) |
| **F4** | ✅ **FIXED 2026-08-01** (the only 103 finding acted on, as its own unit — not in 103's diff). R3c / R3e sent an **unchunked** `nodes(ids:)` whose id count is bounded by nothing (R3d) or nothing app-side (R3b). Past the Admin API's 250-id cap the **whole batch** failed and fail-softed to raw GIDs — every chip silently degrading to `gid://shopify/Product/…`, no message anywhere. Now chunked at `NODES_MAX_IDS = 250` with **per-chunk** fail-soft, so a failure costs one chunk instead of the list. `scopeResourceLabel.server.ts:51/62/130/201`; 14 tests, 3 mutations.                                                               | **Closed** — was OQ-103-B                      |
| **F5** | **Discrepancy against §Key Decisions.** The claim is "O(rules) Postgres set-algebra + `products(query,first:1)` existence tests, never a catalog scan." The Postgres half and the never-a-catalog-scan half **hold**. The probe count does **not**: probes are per **(candidate selector × other ACTIVE INCLUDE row)** _pair_ and run **sequentially**, so a 200-product candidate against one VENDOR template issues 200 sequential Admin round-trips. O(pairs), not O(rules).                                                                                                                                                                     | **New Open Question — OQ-103-C**               |
| **F6** | Four indexes plus the whole `ProductAssignmentIndex` model, and the `scopeValue` component of `ProductAssignment @@index([shopId, scope, scopeValue])`, serve no catalogued read (see the mapping table). `Template @@index([shopId])` is redundant with the `@@unique` above it.                                                                                                                                                                                                                                                                                                                                                                   | **New Open Question — OQ-103-D**               |

---

## 14. Byte Budgets

> **Added 2026-08-01 (step 104, `context/features/104-metafield-byte-budgets.md`).**
> §13 records _what bounds_ each read. This section answers the follow-on question
> §13 deliberately left open: **how much actually fits.**
>
> Appended rather than inserted, for the same reason §13 was — nothing renumbers.

### The ceiling

Shopify limits a **`json` metafield write** to **131,072 bytes (128 × 1024)** from
API version **2026-04** onward. Apps that used json fields before **2026-04-01** are
grandfathered at the old 2MB limit.

🔴 **This app is not grandfathered.** Its first commit is 2026-06-09 and its first
`type = "json"` declaration landed 2026-07-02 (`6d1cd3a`) — both after the cutoff.

⚠️ **The ceiling is dormant but armed.** The runtime Admin client is pinned to
`ApiVersion.January26` (2026-01, `app/shopify.server.ts:13`), i.e. pre-2026-04, so
writes currently sit at 2MB. **`ApiVersion.April26` is the newest stable version the
installed `@shopify/shopify-api` offers** — so the _next_ version bump is precisely
the one that arms a 16× reduction, under a live storefront delivery path, with no
other code change. (The TOML `webhooks.api_version` now matches the runtime at
2026-01 — the old 2026-07/2025-10 split was reconciled 2026-08-15.)

`app/shopify.server.test.ts` is the **tripwire**: it reads the app's own exported
`apiVersion` and fails the suite the moment it reaches 2026-04, with a message
naming the budgets below and step 105 as the prerequisite. Bumping the version is
not forbidden — it just cannot happen quietly.

It is `128 * 1024`, **not** `128_000`: Shopify's metafield-limits page pins the
sibling limit as "64KB (65,536 bytes)", so KB means 1024 here. The 72-byte
difference is one whole `byProduct` entry.

### Which fields this applies to

| Field                     | Owner                    | Section                                            |
| ------------------------- | ------------------------ | -------------------------------------------------- |
| `$app:routing`            | shop metafield           | R1a — **instrumented**                             |
| `by_product` / `excluded` | routing shard metaobject | R1b / R1e — one 128KB budget **per shard** (×1024) |
| `rows`                    | metaobject               | R1d / R1f — documented below, not instrumented     |
| `styling`                 | metaobject               | R1f — overrides-only, far under budget             |
| `styling_css`             | metaobject               | R1f — ~450 chars fully overridden (§10)            |

### The routing map (R1a) — measured

> 🟢 **Updated 2026-08-05 (Option 1 — delivery-wire compaction).** The `$app:routing`
> metafield no longer stores the raw projection. `compactRoutingForDelivery`
> (`app/utils/routingProjection.ts`) reshapes it into a compact wire before the write,
> and `snippets/spec-table-resolve.liquid` decodes that wire. The table below is the
> **compact** encoding — the only one the 128KB ceiling gates, because it is the one
> actually written. The pre-compaction numbers are kept below it for the record.

> 🟢 **Updated 2026-08-05 (Option 2 — metaobject sharding, feature 108).** `byProduct`
> and `excluded` **left this metafield** for the shard metaobjects (§9, §10). The shop
> `$app:routing` metafield (wire **v3**, `ROUTING_WIRE_VERSION = 3`) now carries only the
> broad, count-bounded tiers; the table below is the broad-only shop wire.

Two lossless transforms apply to the broad wire (`byCollection` is the only per-id map
left in it):

1. **Bare-id keys.** `byCollection` keys are the numeric id (`123`), not the full GID —
   22 bytes saved per key. Liquid only exposes `collection.id`.
2. **Interned handle indices.** Handles collect into `handles[]`; every `by*` / `def`
   value is an integer index. A 34-byte `template-{cuid}` shared across many collections
   is written **once**.

`byTag` is dropped (always empty). A `v` version int rides along. Numbers are
**re-derived from the live serializer** in `app/utils/routingBudget.test.ts`.

| Component (broad-only shop wire) | Bytes each | Entries that fit       |
| -------------------------------- | ---------- | ---------------------- |
| Empty envelope                   | 75 (fixed) | —                      |
| `byCollection` entry             | **14**     | **9,354**              |
| `byType` / `byVendor` entry      | key + 3    | **count-bounded only** |

`byType` / `byVendor` get no per-entry number: the key is a merchant-authored type or
vendor name with no length limit — _count_-bounded by the shop's distinct values, not
_size_-bounded.

🟢 **Option 2 removes the shared per-product ceiling.** `byProduct` / `excluded` are now
split across **N = 1024** `$app:appx_routing_shard` metaobjects keyed by
`product.id mod 1024`, each with its **own** 128KB budget — total per-product capacity is
`N × 128KB` (and a product page reads only its own shard, cutting per-page weight). A
shard holds `catalog/N` entries — at 1M products that is ~977 entries/shard, ~50KB, well
under 128KB. Inside a shard, `by_product` stores the handle **string** directly (D3, no
`handles[]` — a shard is small) and `excluded` is a membership object `{ "<id>": 1 }`.
🔴 **D4 — N can never change after launch** (a different modulus re-buckets every product
and orphans every stored shard). 🔴 **D5 — reconcile by content hash, never delete:** the
writer upserts only changed buckets and upserts-to-empty the cleared ones (an empty shard
reads as a miss), so a status toggle that leaves per-product assignments untouched writes
**zero** shards. **D6** — Postgres stays GID-faithful and un-sharded; sharding is a
delivery-only reshape at write time.

📌 **Capacity is not `floor((limit − envelope) / perEntry)`.** That division is off
by one — the first entry of a map carries no leading comma. (Under the pre-Option-1
array encoding this is how 104's spec predicted 3,445 excludes when the true answer
was 3,446.) The tests search the real serializer instead.

### What the writer does about it

`app/shopify/routing.server.ts` measures **the exact string it is about to send**
(not a re-serialization, which could diverge from it) and logs a warning at ≥80% of
budget, naming the entry count of every map so the line is actionable.

🚫 **It does not block.** A payload of any size still reaches `metafieldsSet`,
proven by a test. Refusing, truncating, or surfacing a merchant-facing error at the
ceiling is **step 105's** decision; 104 exists to produce the number that decision
needs. The warn threshold (80% = 104,857 bytes) leaves **1,456** further carve-outs
of runway under the compact wire (was 689 pre-Option-1) — the justification is lead
time measured in merchant actions, not roundness.

⚠️ **Measurement is app-side by necessity, and that is better anyway.**
`Metafield.sizeInBytes` is **unstable-only** — validated absent from 2025-10,
2026-04, and 2026-07. (shopify.dev's `product` query page shows it in a
"Get the size of a metafield value in bytes" example under _latest_, which does not
run on any stable version.) It would in any case have been a _post-write_ read of a
write that already succeeded or failed; the app-side measurement is free, needs no
round-trip, and sees the exact bytes before they are sent.

### The metaobject `rows` field (R1d / R1f)

Bounded by `MAX_TEMPLATE_ROWS = 200` — but **not obviously under 128KB**, because
there is no per-label or per-value length cap anywhere: `parseRowsWithinCap`
(`app/models/template.server.ts:36`) enforces the row count and nothing else.

| 200 rows, value text per row  | Payload               |
| ----------------------------- | --------------------- |
| 10 chars (typical spec value) | ~31KB — 24% of budget |
| 40 chars                      | ~37KB — 28%           |
| 200 chars                     | ~68KB — 52%           |
| **~508 chars**                | **the ceiling**       |

So a realistic table sits at about a quarter of budget, and only a merchant pasting
paragraph-length values into all 200 rows would breach it. Recorded, **not
instrumented** — the row cap mostly holds this, and wiring a second call site would
double the diff to restate a bound that already exists. If 105 decides the row
payload needs a policy, `app/utils/routingBudget.ts` takes one call.

### The failure mode, if the ceiling is ever crossed

Unchanged from §13's R7 note, and worth restating because it is quiet: the write is
Postgres-**first**, so an over-ceiling `metafieldsSet` returns a `userErrors` entry
surfaced as _"Saved routing, but couldn't publish it to your storefront."_ while
`ShopStorefrontRouting` is already correct and `syncedToShopifyAt` is left unstamped.
**The storefront then serves the previous map indefinitely.** The write fails loudly
at that moment; the read stays silently stale afterwards.

---

## 15. Data Retention & Erasure

Added 2026-08-02 with step 105 (`context/features/105-privacy-webhook-domain-and-erase.md`),
the domain half of the mandatory privacy webhooks; wired to real endpoints the
same day by step 106 (`…/106-privacy-webhook-routes-and-subscriptions.md`).

**Entry points.** Three routes, subscribed in `shopify.app.toml` under
`compliance_topics` (never `topics`):

| Topic                    | Route file                                       | URL                                | Does                    |
| ------------------------ | ------------------------------------------------ | ---------------------------------- | ----------------------- |
| `customers/data_request` | `app/routes/webhooks.customers.data_request.tsx` | `/webhooks/customers/data_request` | logs, no DB             |
| `customers/redact`       | `app/routes/webhooks.customers.redact.tsx`       | `/webhooks/customers/redact`       | logs, no DB             |
| `shop/redact`            | `app/routes/webhooks.shop.redact.tsx`            | `/webhooks/shop/redact`            | `eraseShopData` (below) |

🔴 **The erase takes the AUTHENTICATED shop, never `payload.shop_domain`.** The
former comes from the HMAC-verified request; the latter is body content, and it
selects which shop gets deleted. `parseComplianceSummary().shopDomain` is parsed
only to be cross-checked and logged on mismatch.

### What this app holds for one shop

🔴 **No customer personal data, anywhere in the schema.** No customer, order or
buyer record is stored, and no field derived from one. `Shop.email` and
`Shop.name` exist as columns that **nothing ever writes** (`upsertShop` creates
with `myshopifyDomain` alone). `Session` carries `firstName` / `lastName` /
`email`, but the app requests offline tokens only, so they stay null — and they
would be merchant-staff data, not customer data, if they were populated.

**This is what makes `customers/data_request` and `customers/redact` honest
no-ops** — there is nothing to disclose and nothing to delete — and it is why
`shop/redact` is the only compliance topic that does real work.

A shop's full footprint:

| Table                    | Reached by                 |
| ------------------------ | -------------------------- |
| `Shop`                   | the row itself             |
| `Template`               | FK cascade from `Shop`     |
| `TableStyling`           | FK cascade from `Template` |
| `ProductAssignment`      | FK cascade from `Shop`     |
| `ProductAssignmentIndex` | FK cascade from `Shop`     |
| `ShopStorefrontRouting`  | FK cascade from `Shop`     |
| `Session`                | ⚠️ **nothing — see below** |

Every cascade above is `ON DELETE CASCADE` **in the emitted migration SQL**, not
only in `schema.prisma`, so one `Shop` delete takes the whole tree in Postgres.

⚠️ **`Session` is outside the graph and it is the trap.** It has no foreign key
at all — it is keyed by a plain `shop` **string** — so no cascade reaches it. It
must be deleted explicitly or an access token outlives the shop record it
belonged to.

### The two-stage lifecycle

**Uninstall (`app/uninstalled`) RETAINS.** `markShopUninstalled` flips
`isInstalled` / `uninstalledAt` and deletes sessions; templates, styling and
assignments stay. That retention is a feature — it is what lets a merchant
reinstall and find their work intact, and `upsertShop`'s reinstall branch depends
on the row still existing.

**`shop/redact` ERASES**, 48 hours later, via `eraseShopData`.

🔴 **The erase is guarded on `isInstalled: false`, inside the `WHERE` clause.**
Shopify sends `shop/redact` 48 hours after uninstall and never cancels it on
reinstall, so an unguarded erase would delete every template of a merchant who
uninstalled on Friday and reinstalled on Monday — silently, on schedule. An
installed shop is an active relationship with its own basis for retention, and
since the app holds zero customer personal data the guard concedes no compliance
ground (merchant decision D1, 2026-08-02).

The guard lives in the `WHERE` rather than in a preceding read because a
read-then-delete leaves a window for the reinstall to land between the two
statements — reintroducing the exact failure it exists to prevent. The same shape
makes the operation idempotent: `deleteMany` returns `{ count: 0 }` where
`delete` would throw `P2025`, and Shopify retries every non-200.

⚠️ **A mocked Prisma cannot verify this guard** — it returns whatever it is told
regardless of the query. The unit tests pin that the condition is _written_; only
Postgres applies it. Live verification is step 106's, and is **owed** — the code
and the subscriptions landed 2026-08-02, the against-Postgres run has not.

⚠️ **A 200 from `/webhooks/shop/redact` does not mean data was deleted.** The
handler acknowledges all three outcomes — erased, declined-because-installed, and
not-found — because a non-200 earns a retry, and two of those three are correct
handling rather than failure. The log line is the only place the distinction
appears.

### Shopify-side data is out of reach, by design

The template metaobjects, the shop routing metafield and the routing shard
metaobjects all live in the merchant's store. By the time `shop/redact` fires there is no
access token, so the Admin API cannot be called — and it does not need to be:
Shopify removes app-owned metaobjects and reserved-namespace metafields when the
app is uninstalled — this covers the `$app:appx_routing_shard` shard metaobjects too
(feature 108), so no new erase code. 🚫 Do not write code that tries.

---

**Architecture summary.** Postgres is the source of truth. The storefront delivery layer is three Shopify objects: **template metaobjects** (structure), a **shop-level routing metafield** (broad attribute → handle, wire v3), and **1024 routing shard metaobjects** (per-product assignments + EXCLUDE carve-outs, keyed `product.id mod 1024`). There is **no per-product override metafield** — it was deleted 2026-08-04. Store both metaobject GID and handle. Assignment is **rigid and block-on-conflict**: a template targets one scope kind, overlaps between `ACTIVE` templates are blocked at `DRAFT → ACTIVE` (dry-run: O(rules) Postgres set-algebra + `products(query, first:1)` existence checks — ⚠️ the probe count is O(pairs) and sequential, see F5), so the `ACTIVE` rule set is disjoint and the storefront resolves one match with no precedence. Broad rules deliver as O(1) shop-map entries, so future matching products are auto-covered with no re-materialization. Liquid resolves the matched handle via `metaobjects["$app:appx_spec_table"][handle]` (proven live) and renders only `status == "ACTIVE"`. `priority` and `ProductAssignmentIndex` are retained but dormant. Keep variant-sensitive field mapping to selected/default-variant behavior for MVP.
