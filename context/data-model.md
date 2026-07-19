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
- A shop-level routing metafield maps product attributes (type / vendor / collection / tag / all-products default) to the assigned template handle; a bounded per-product metafield carries direct single-product overrides.
- Liquid reads the routing map, resolves the matched template metaobject by handle, and renders the table through the Theme App Extension.
```

Core principle: Postgres is the source of truth. Shopify metaobjects (template payload) + a shop-level routing metafield (assignment map) are the storefront delivery layer.

---

## 2. MVP Data Model Decisions

1. Use a real `Shop` model as the parent record for shop-specific app data.
2. Include minimal billing and entitlement models in the MVP schema.
3. Make assignments visible to Liquid primarily through **one shop-level routing metafield** (attribute → template handle), not by writing a metafield onto every matching product. A bounded per-product metafield carries only explicit single-product overrides.
4. Treat saved data and template status separately, similar to Shopify products.
5. Enforce **one effective spec table per product via a rigid, block-on-conflict model** (merchant-controlled, Moon-Bundles style): overlaps between `ACTIVE` templates are blocked at `DRAFT → ACTIVE`; the published rule set is therefore disjoint and needs no runtime precedence. `priority` is retained but dormant (see §5 / §9).
6. Use ordered `valueParts` instead of a single row value source.
7. Broad rules (type / vendor / collection / tag / all-products) resolve at **render time** against the shop routing map, so future matching products are covered with **zero** per-product writes. Product create/update webhooks keep only bounded per-product overrides and merchant-facing match counts in sync — they do not re-materialize broad rules.
8. Keep `ProductAssignmentIndex` **sparse**: it records only materialized per-product overrides and their Shopify sync state, never one row per covered product (never O(catalog)).
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

| Migration name | Models added | Enums added | Build step that triggers it |
| --- | --- | --- | --- |
| `add-shop` | `Shop` | `OnboardingStatus` | App shell — upsert `Shop` on first auth |
| `add-template` | `Template` | `TemplateStatus` | Templates list + Template editor (Rows tab) |
| `add-assignment` | `ProductAssignment`, `ProductAssignmentIndex` | `AssignmentScope`, `AssignmentMode`, `AssignmentIndexStatus` | Product assignment screen |
| `add-routing` | `ShopStorefrontRouting` | — | Shop-level storefront routing projection |
| `add-table-styling` | `TableStyling` | — | Template editor — Styling tab |
| `add-billing` | `AppSubscription`, `ShopEntitlement` | `SubscriptionStatus` | Billing logic + early-bird entitlement |

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

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Required by Shopify app template for OAuth session storage.
model Session {
  id             String    @id
  shop           String
  state          String
  isOnline       Boolean   @default(false)
  scope          String?
  expires        DateTime?
  accessToken    String
  userId         BigInt?
  firstName      String?
  lastName       String?
  email          String?
  accountOwner   Boolean   @default(false)
  locale         String?
  collaborator   Boolean?  @default(false)
  emailVerified  Boolean?  @default(false)
  refreshToken        String?
  refreshTokenExpires DateTime?
}

model Shop {
  id                 String     @id @default(cuid())
  myshopifyDomain    String     @unique
  shopGid            String?
  name               String?
  email              String?
  currencyCode       String?
  primaryLocale      String?
  timezone           String?

  installedAt        DateTime   @default(now())
  uninstalledAt      DateTime?
  isInstalled        Boolean    @default(true)

  onboardingStatus      OnboardingStatus @default(NOT_STARTED)
  isAppBlockActive      Boolean          @default(false)
  appBlockLastCheckedAt DateTime?

  metaobjectDefinitionGid String?

  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt

  // Spec table templates created by this shop.
  templates          Template[]
  // Polymorphic assignment rules (scope + value) that bind templates to products/attributes.
  assignments        ProductAssignment[]
  // Sparse per-product override state (materialized single-product overrides only).
  assignmentIndexes  ProductAssignmentIndex[]
  // Projected shop-level routing map mirrored to the shop routing metafield.
  storefrontRouting  ShopStorefrontRouting?
  // Shopify billing subscriptions for this shop over time.
  subscriptions      AppSubscription[]
  // Feature limits and usage rights derived from plan/promotions.
  entitlements       ShopEntitlement[]

  // Helps filter installed vs uninstalled shops.
  @@index([isInstalled])
}

enum OnboardingStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
  DISMISSED
}

model Template {
  id        String         @id @default(cuid())
  shopId    String
  shop      Shop           @relation(fields: [shopId], references: [id], onDelete: Cascade)

  name        String
  description String?
  status      TemplateStatus @default(DRAFT)

  // True for reusable templates. Future one-off product tables can set this false.
  isShared    Boolean        @default(true)

  // Full editor row array. Array index is display order.
  // Each row must have stable id and key values.
  rows        Json           @default("[]")

  shopifyMetaobjectGid    String?
  shopifyMetaobjectHandle String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  archivedAt  DateTime?

  assignments ProductAssignment[]
  assignmentIndexes ProductAssignmentIndex[]
  styling     TableStyling?

  @@index([shopId])
  @@index([shopId, status])
  @@unique([shopId, shopifyMetaobjectHandle])
}

enum TemplateStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

model ProductAssignment {
  id         String   @id @default(cuid())
  shopId     String
  shop       Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)

  templateId String
  template   Template @relation(fields: [templateId], references: [id], onDelete: Cascade)

  // Polymorphic scope — one selector method per rule (Kaching-style single picker).
  scope AssignmentScope
  // INCLUDE = "this template covers the scope"; EXCLUDE = a carve-out exception
  // (e.g. ALL_PRODUCTS INCLUDE + PRODUCT EXCLUDE for a discontinued SKU).
  mode  AssignmentMode  @default(INCLUDE)

  // Selector value for the scope. NULL only for ALL_PRODUCTS (matches everything).
  //   PRODUCT      -> gid://shopify/Product/123456
  //   PRODUCT_TYPE -> exact product type string
  //   VENDOR       -> exact vendor string
  //   COLLECTION   -> gid://shopify/Collection/123456
  //   TAG          -> exact tag string (post-MVP)
  scopeValue String?

  // DORMANT in MVP. The rigid block-on-conflict model keeps the ACTIVE rule set
  // disjoint, so there is no runtime tie to break and no merchant-facing priority
  // knob. Retained un-surfaced for a possible post-MVP same-tier tiebreak on
  // multi-valued scopes (collection/tag). See §9 "Conflict handling".
  priority   Int      @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  resolvedProducts ProductAssignmentIndex[]

  // Prevent literal duplicate rows within one template. Cross-template semantic
  // overlaps are NOT a DB constraint — they are blocked at DRAFT -> ACTIVE by the
  // dry-run resolver, which lets DRAFTs coexist with unresolved conflicts.
  @@unique([shopId, templateId, scope, scopeValue, mode])
  @@index([shopId, scope])
  @@index([shopId, scope, scopeValue])
  @@index([shopId, templateId])
}

enum AssignmentScope {
  ALL_PRODUCTS
  PRODUCT
  PRODUCT_TYPE
  VENDOR
  COLLECTION
  // TAG — post-MVP; multi-valued like COLLECTION
}

enum AssignmentMode {
  INCLUDE
  EXCLUDE
}

// SPARSE per-product override cache. Populated ONLY for explicit single-product
// overrides materialized as a per-product metafield (the bounded fallback), plus
// any hard PRODUCT-vs-PRODUCT conflict. Broad rules (type/vendor/collection/tag/
// all-products) are delivered via the shop routing map and are NEVER indexed here —
// this table is never O(catalog).
model ProductAssignmentIndex {
  id     String @id @default(cuid())
  shopId String
  shop   Shop   @relation(fields: [shopId], references: [id], onDelete: Cascade)

  // Required when status is APPLIED. Optional for unresolved conflicts.
  templateId String?
  template   Template? @relation(fields: [templateId], references: [id], onDelete: Cascade)

  // The assignment rule that produced this resolved product state.
  sourceAssignmentId String?
  sourceAssignment   ProductAssignment? @relation(fields: [sourceAssignmentId], references: [id], onDelete: SetNull)

  // For the resolved product: gid://shopify/Product/123456
  shopifyProductGid String

  // Scope snapshot used during resolution (PRODUCT for materialized overrides).
  scope      AssignmentScope?
  scopeValue String?

  status         AssignmentIndexStatus @default(APPLIED)
  conflictReason String?

  // Storefront pointer written to the product's `$app:spec_table` metaobject_reference.
  appliedTemplateHandle String?
  syncedToShopifyAt     DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([shopId, shopifyProductGid])
  @@index([shopId, templateId])
  @@index([shopId, status])
  @@index([sourceAssignmentId])
}

enum AssignmentIndexStatus {
  APPLIED
  CONFLICT
  STALE
}

// Projected disjoint routing map — the mirror of the shop `$app:routing` json
// metafield that Liquid reads on the storefront. Rebuilt from the ACTIVE, disjoint
// ProductAssignment rows on every activate/deactivate. Postgres stays the source of
// truth; the metafield is the delivery copy. Each map is { scopeValue -> handle }.
model ShopStorefrontRouting {
  id     String @id @default(cuid())
  shopId String @unique
  shop   Shop   @relation(fields: [shopId], references: [id], onDelete: Cascade)

  defaultTemplateHandle String?              // ALL_PRODUCTS winner
  byType                Json    @default("{}") // productType    -> template handle
  byVendor              Json    @default("{}") // vendor         -> template handle
  byCollection          Json    @default("{}") // collectionGid  -> template handle
  byTag                 Json    @default("{}") // tag            -> template handle (post-MVP)
  byProduct             Json    @default("{}") // productGid     -> template handle (bounded overrides)
  excludedProductGids   Json    @default("[]") // EXCLUDE carve-outs -> render nothing

  // Delivery sync state for the shop-level metafield.
  shopMetafieldGid  String?
  syncedToShopifyAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model TableStyling {
  id         String   @id @default(cuid())
  templateId String   @unique
  template   Template @relation(fields: [templateId], references: [id], onDelete: Cascade)

  // Layout knobs (Style-tab spec 2026-07-18). String knobs hold app-validated
  // constants (shared TS constants + server re-validation, not Prisma enums —
  // matching the fontSize/fontWeight convention); null = the flagged default.
  rowLayout            String?  // "TWO_COLUMN" (null default) | "STACKED"
  mobileLayout         String?  // "STACKED" (null default) | "SAME_AS_DESKTOP" — only meaningful when rowLayout is TWO_COLUMN
  sectionHeaderStyle   String?  // "BANDED" (null default) | "TEXT_ONLY"
  sectionsCollapsible  Boolean  @default(false)
  sectionsInitialState String?  // "ALL_OPEN" (null default) | "FIRST_OPEN" | "ALL_CLOSED" — only meaningful when sectionsCollapsible
  rowDividerStyle      String?  // "LINES" (null default) | "STRIPES" | "NONE"
  density              String?  // "DEFAULT" (null default) | "COMPACT" | "SPACIOUS"

  headerBgColor    String?
  labelBgColor     String?
  valueBgColor     String?
  stripeBgColor    String?  // zebra-stripe surface — used when rowDividerStyle = "STRIPES"
  borderColor      String?
  labelTextColor   String?
  valueTextColor   String?
  // Typography (2026-07-18 addendum — adopts the Horizon theme-editor pattern:
  // bounded segments, preset-first with a Custom px escape hatch; null = inherit).
  fontSize         String?  // "SMALL" | "MEDIUM" | "LARGE" (theme-relative presets, em-scale) OR an all-digit px string ("18"), app-clamped to 10–40
  fontWeight       String?  // "REGULAR" | "MEDIUM" | "BOLD"
  fontStyle        String?  // "NORMAL" | "ITALIC" (kept — merchant decision 2026-07-18)
  lineHeight       String?  // "TIGHT" | "NORMAL" | "LOOSE" — density's vertical-rhythm partner
  labelCase        String?  // "DEFAULT" | "UPPERCASE" — label column only
  labelWidthPct    Int?

  // Provenance only: the preset id these values were copied from at pick time
  // (a built-in preset id or a saved-preset id). Informational (gallery UI,
  // support/debugging) — never re-read as a live link; the template owns its
  // values outright (copy semantics, see the note below).
  basedOnPreset    String?

  extraStyles      Json     @default("{}")
}

> **Color fields are merchant overrides, not the whole palette.** Each `*Color` field is nullable: `null` means "inherit the theme," a value means the merchant set it in the Style tab. On the storefront these resolve to **CSS custom properties on the `.appx-spec-table` wrapper** — the same variables that carry the inherited-theme defaults — so saved and default colors flow through one source of truth (see `code-standards.md` → Color & Theming). The app is not colorless: color is centralized in variables, not scattered as hex literals. `extraStyles` is the forward-compatible escape hatch for new themeable surfaces (dark-mode tokens, additional surfaces) added post-MVP without a migration per color. MVP-shipping knobs are **real columns** (typed, queryable — locked 2026-07-18), never `extraStyles` entries.

> **Styling is per-template with COPY semantics — locked 2026-07-18.** `TableStyling` is the **single styling home**; the style knobs are **orthogonal controls on one table primitive**, not monolithic "layouts" (every real-world archetype — striped, banded, stacked, accordion — is a knob combination). Choosing a preset (the creation-gallery popup or an in-rail preset card) **copies** the preset's values into the template's `TableStyling`; there is **no template→preset link and no shop-level default styling record** (a "store default cascade" was designed and rejected: copy keeps every style edit side-effect-free on live storefronts, makes preset deletion trivial, and collapses storefront delivery to one path). Consequences:
>
> - **Built-in presets are code constants** (stable ids: `classic`, `striped`, `banded`, `stacked`, `accordion`), never DB rows.
> - **Merchant-saved presets** are a phase-2 slice: a `StylePreset` model — shop-scoped (`shopId` + name, shop-isolated like every model), carrying the **same style columns** as `TableStyling` (guard the intentional column duplication with a field-set drift test, the same pattern as the preview-CSS byte-equality guard). Created via "Save as preset"; "editing" a preset is save-as-again (same name = overwrite after confirm) — consistent with copy semantics, no separate preset editor.
> - **Retroactive "set once and done" is a post-MVP explicit bulk action** (future app-settings route): pick a preset → confirm against a pre-checked template list → batch-write N `TableStyling` rows + **throttled** sequential metaobject resyncs (merchant-triggered write amplification is acceptable; per-edit propagation is not).
>
> Full UI spec: `admin-screen-plan.md` §Screen 3 → Tab 2 — Style.

model AppSubscription {
  id                       String   @id @default(cuid())
  shopId                   String
  shop                     Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)

  // The unique global identifier from Shopify's Billing API.
  shopifySubscriptionGid    String?  @unique
  // Internal string to easily identify the tier (e.g., "FREE", "BASIC", "PRO").
  planCode                 String
  // Tracks the current state of the charge without needing to ping Shopify every time.
  status                   SubscriptionStatus @default(PENDING)

  // Used to manage free trial periods (e.g., 7-day or 14-day trials).
  trialStartsAt            DateTime?
  trialEndsAt              DateTime?
  // Used to track the current 30-day billing cycle (helpful for usage limits).
  currentPeriodStartsAt    DateTime?
  currentPeriodEndsAt      DateTime?
  // Kept for analytics and calculating remaining access time after a merchant uninstalls.
  cancelledAt              DateTime?

  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  // Optimizes the query to find the currently active subscription for a shop.
  @@index([shopId, status])
}

enum SubscriptionStatus {
  // Merchant has been sent to the approval screen but hasn't approved yet.
  PENDING
  // Subscription is active and billing is functioning properly (or in trial).
  ACTIVE
  // Shopify couldn't process the payment (e.g., expired card). Features should be restricted.
  FROZEN
  // Merchant explicitly cancelled the plan or uninstalled the app.
  CANCELLED
  // Subscription period has ended and was not renewed.
  EXPIRED
}

model ShopEntitlement {
  id                       String   @id @default(cuid())
  shopId                   String
  shop                     Shop     @relation(fields: [shopId], references: [id], onDelete: Cascade)

  earlyBirdEligible         Boolean  @default(false)
  earlyBirdInstallNumber    Int?

  freeTrialMonths           Int      @default(0)
  reviewRewardGrantedAt     DateTime?
  reviewRewardMonths        Int      @default(0)

  // Requested business field. Can represent bonus credit, bonus discount,
  // bonus free amount, or internal promotional value.
  bonusAmount               Float    @default(0)

  couponCode                String?
  notes                     String?

  startsAt                  DateTime?
  endsAt                    DateTime?

  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt

  @@index([shopId])
  @@index([earlyBirdEligible])
}
```

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
| `id`            | string  | Yes      | Technical stable ID. Client-generated (stable across saves). Never changes. Used by relational tables. |
| `key`           | string  | Yes      | Human-readable stable key such as `screen_size`. Used for import/export, AI, translations, and JSON-LD. |
| `rowType`       | `DATA`  | Yes      | Identifies this as a data row.                                                                          |
| `label`         | string  | Yes      | Shopper-facing label. Can be translated later.                                                          |
| `valueParts`    | array   | Yes      | Ordered value parts used to build the final displayed value.                                            |
| `hideWhenEmpty` | boolean | Yes      | If true, storefront hides this row when the whole-row resolved value is empty (see §10 for semantics).  |

MVP validation: a template can contain at most 200 rows, including data rows and section headers. The admin UI should prevent merchants from exceeding this limit, and the server should reject saves that exceed it. The 200-row cap is an MVP value and may increase post-MVP — implement it as a single shared constant, never a hardcoded literal.

### Value part reference

| Part type       | Required fields    | Description                                                            |
| --------------- | ------------------ | ---------------------------------------------------------------------- |
| `TEXT`          | `text`             | Fixed manual template text, same for every product using the template. |
| `SHOPIFY_FIELD` | `field`            | Dynamic value read from the Shopify product object.                    |
| `METAFIELD`     | `namespace`, `key` | Dynamic value read from a Shopify product metafield.                   |
| `LINE_BREAK`    | _(none)_           | Hard line break inside a value. Renders as a new line; carries no text and no dynamic data. |

Admin UI may show Liquid-like tokens such as `{{ product.metafields.custom.battery_life.value }}`, but Appx should save structured `valueParts`, not merchant-authored raw Liquid.

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

### Section header row

| Field           | Type             | Required | Description                                            |
| --------------- | ---------------- | -------- | ------------------------------------------------------ |
| `id`            | string           | Yes      | Technical stable ID.                                   |
| `key`           | string           | Yes      | Stable key such as `display` or `battery`.             |
| `rowType`       | `SECTION_HEADER` | Yes      | Identifies this as a section header.                   |
| `label`         | string           | Yes      | Section title shown to shoppers.                       |
| `hideWhenEmpty` | boolean          | Yes      | Future-compatible. Can help hide empty sections later. |

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

### Important product decision

This is not a versioned publish workflow. If a template is `ACTIVE`, saved row changes can appear on the storefront after sync.

That is acceptable for MVP because it matches the simple Shopify product-style save/status model. Later, if merchants need staging, approval, or scheduled publishing, add `TemplateVersion` or `TemplateSnapshot`.

---

## 9. Storefront Assignment Strategy

> **Update (2026-07-07) — rigid model + shop-level routing. Supersedes the per-product-materialization and priority-precedence design originally described in this section.**
>
> 1. **Assignment is rigid and merchant-controlled (Moon-Bundles style), not priority-resolved.** Each template targets **one scope** (all products / selected products / product type / vendor / selected collections). A dry-run checks that scope against every **other ACTIVE** template; any overlap **blocks activation** (`DRAFT → ACTIVE`). A template may be **saved `DRAFT` with a conflict**, never `ACTIVE`. The published rule set is therefore **disjoint** — the storefront never resolves precedence, so there is no merchant-facing `priority`.
> 2. **Broad rules deliver through ONE shop-level routing metafield, not per-product writes.** `[shop.metafields.app.routing]` (json, `access.storefront = "public_read"`) holds `{ default, byType, byVendor, byCollection, byTag, byProduct, excludedProductGids }` mapping attribute → template metaobject **handle**. Liquid reads `shop.metafields["$app"].routing.value`, matches the current product's fields, and resolves the handle **directly** to the template metaobject. O(1) writes per rule; future products are covered with no re-materialization. A per-product `metaobject_reference` metafield remains only for bounded single-product overrides.
>
> **Metaobject-by-handle is PROVEN (live storefront, 2026-07-07).** `metaobjects["$app:appx_spec_table"][handle]` resolves an app-owned metaobject from a **handle string** and exposes `.status.value` / `.rows.value` — overturning the 2026-06-19 caveat below (which pushed reference metafields out of caution). Both `$app:appx_spec_table` and the resolved `app--<app-id>--appx_spec_table` type forms work; use the `$app:` form. Observed live: `system.type = app--378906640385--appx_spec_table`, `status = ACTIVE`, `rows = 19`. (App-owned metafields/metaobjects require `access.storefront = "public_read"` to be Liquid-readable — theme app extensions are storefront surfaces.)
>
> The subsections below are rewritten to this model. The 2026-06-19 and 2026-07-01 notes are retained as shipped history.

Liquid cannot read Appx Postgres data directly. Therefore, assignment resolution must be projected into Shopify data.

### MVP strategy

The current product is matched to its one effective template through the **shop-level routing map** (`shop.metafields["$app"].routing`), with a per-product `metaobject_reference` metafield for bounded single-product overrides. MVP intentionally renders one spec table per product, and the rigid block-on-conflict model (top-of-section update) guarantees exactly one match.

`ProductAssignment` stores the merchant's assignment **rules** (Postgres, source of truth). `ShopStorefrontRouting` is the projected map pushed to Shopify. `ProductAssignmentIndex` is the sparse record of materialized single-product overrides only (see below).

> **The `single_line_text_field` example and Liquid flow immediately below are HISTORICAL** (the original 2026 sketch). They are superseded twice — first by the `metaobject_reference` metafield (2026-07-01 note), then by the shop routing map + direct handle resolution (2026-07-07 top-of-section update). Retained for provenance; do not implement from them.

Example product metafield:

```text
namespace: appx
key: spec_table_template_handle
type: single_line_text_field
value: template-clxabc123
```

Liquid flow:

```liquid
{% assign template_handle = product.metafields.appx.spec_table_template_handle.value %}
{% assign spec_table = shop.metaobjects.appx_spec_table[template_handle] %}

{% if spec_table.status.value == 'ACTIVE' %}
  Render rows JSON and styling JSON
{% endif %}
```

Exact Liquid syntax should be verified during Theme App Extension implementation, but the architecture goal is clear: product metafield points to metaobject handle.

> **Verified (Editor Step 9.5, 2026-06-19).** The metaobject round trip
> (React → Postgres → metaobject → read back) was proven via the **Admin GraphQL
> API** (`metaobjectByHandle`), not Liquid, because the storefront/assignment slice
> that deploys the Theme App Extension is not built yet. The storefront read syntax
> is the global `metaobjects` object: `{{ metaobjects[type][handle] }}` (or
> `metaobjects.type.handle`), with the `rows` json field iterable as
> `metaobject.rows.value`. **Caveat for the storefront slice:** because the
> definition is **app-reserved** (`$app:appx_spec_table`, see §10), the bare
> `shop.metaobjects.appx_spec_table[handle]` sketch above will need the resolved
> app type. **[SUPERSEDED 2026-07-07]** — proven false on the live storefront:
> `metaobjects["$app:appx_spec_table"][handle]` resolves a raw handle string
> directly (see the top-of-§9 update). The `metaobject_reference` product metafield
> shipped in feature 34 is retained, but only as the bounded single-product override
> path — broad rules use the shop routing map + direct handle lookup.

> **Update (2026-07-01, storefront slice 1 — `context/features/34-storefront-theme-app-extension-first-pixel.md`).**
> Confirmed against Shopify docs and **implemented**: the product → template pointer
> is a **`metaobject_reference` product metafield**, **not** the
> `single_line_text_field` handle sketched in the example below (docs: never store
> handles/IDs in plain-text fields for relationships — it breaks Liquid/Storefront
> resolution). Locked details:
>
> - **Declared in `shopify.app.toml`** (app-owned):
>   `[product.metafields.app.spec_table]`, `type = "metaobject_reference<$app:appx_spec_table>"`,
>   `access.storefront = "public_read"` (required for an app-owned metafield to be
>   Liquid-readable — app metafields are **not** always readable in Liquid, unlike
>   merchant/standard ones), `access.admin = "merchant_read_write"` (so Step 3 can set
>   the value by hand in Admin).
> - **Namespace/key:** namespace `$app`, key `spec_table`.
> - **Liquid access (theme app extension, bracket form for the reserved prefix):**
>   `product.metafields["$app"].spec_table.value` → the referenced metaobject;
>   then `...spec_table.value.status.value` and iterate `...spec_table.value.rows.value`.
>   Dot form (`product.metafields.app.spec_table`) does **not** resolve the reserved
>   namespace.
>
> The example block below is retained for history but is **superseded** by the
> reference-metafield approach.

### Assignment (Postgres) — rigid, block-on-conflict

The merchant gives a template **one scope** (a single selector, Kaching-style): all products, selected products, product type, vendor, or selected collections (`AssignmentScope`), optionally narrowed by `EXCLUDE` exceptions. Saving the rule writes `ProductAssignment` in Postgres — nothing is projected to Shopify while the template is `DRAFT`.

**Dry-run conflict check** runs at `DRAFT → ACTIVE` (and when an ACTIVE template's scope is edited): the candidate scope is tested for overlap against every **other ACTIVE** template's scope. Any overlap **blocks activation** and the merchant is shown which template collides; the template stays `DRAFT`. DRAFTs may hold conflicts freely. Because activation is gated this way, **the set of ACTIVE rules is always disjoint** — every product matches at most one, so the storefront needs no precedence.

**How overlap is computed cheaply (never a catalog scan):**

1. `ALL_PRODUCTS` overlaps everything; `PRODUCT_TYPE` / `VENDOR` are single-valued, so same-scope overlap is a string-equality/containment test — **O(1) Postgres set-algebra**.
2. Cross-dimension or multi-valued pairs (type × vendor, anything × collection, anything × tag) are tested with **one Shopify existence query** per existing ACTIVE rule: `products(first: 1, query: "product_type:'X' AND vendor:'Y'")` (or `collection_id:` / `tag:`) — a non-empty result means overlap. Cost is O(active rules) tiny queries, not O(catalog). (Filters + AND + `first:1` confirmed against docs.)

### Delivery (Shopify) — rebuild the routing projection

On every activate/deactivate (or ACTIVE-scope edit), the app rebuilds `ShopStorefrontRouting` from the ACTIVE, disjoint rules and pushes it to the `[shop.metafields.app.routing]` json metafield:

- Broad scopes each become **one map entry** — `PRODUCT_TYPE` → `byType`, `VENDOR` → `byVendor`, `COLLECTION` → `byCollection`, `TAG` → `byTag`, `ALL_PRODUCTS` → `default` — so a rule matching 20k products is still **O(1) writes**. **No per-product metafields; future matching products are covered automatically at render time.**
- Selected single products (`PRODUCT`) go into `byProduct`; `EXCLUDE` carve-outs go into `excludedProductGids`. If one template's `byProduct` set ever approaches the 128KB json cap (~2,500 full-GID entries), materialize those products as per-product `$app:spec_table` `metaobject_reference` metafields instead — via `bulkOperationRunMutation` (rate-limit-exempt) — and record them in `ProductAssignmentIndex`.

### Storefront (Liquid) — resolve the one match

The theme app extension resolves the current product against the routing map top-down (order is efficiency only — disjointness guarantees ≤1 match):

1. `product.metafields["$app"].spec_table.value` — bounded per-product override, if materialized (tier 1, highest precedence).
2. `routing.byProduct[<product GID>]` — an **explicit single-product assignment**. Checked **before** the exclude gate (feature 45 Decision B) so an excluded product still reaches its own dedicated table (the "all products EXCEPT X, and X gets its own table" story).
3. `excludedProductGids` containing the product's GID ⇒ the **broad** tiers below are carved out for it (render nothing **from the map**; the per-product override in step 1 and the explicit `byProduct` in step 2 both still win). The exclude gate only suppresses the broad tiers.
4. `byType[product.type]` → `byVendor[product.vendor]` → first hit scanning `product.collections` against `byCollection` (by collection GID) → `routing.defaultTemplateHandle`.

> **Implemented (feature 43 + 45, `context/features/43-…`, `45-…`).** The live projection json key for the shop default is **`defaultTemplateHandle`** (feature 40's `RoutingProjection`, written verbatim by 41) — not the loose `default` earlier in this section. `byTag` is intentionally **not read** in the Liquid: TAG is post-MVP (absent from the `AssignmentScope` enum), so `byTag` is always `{}` and scanning `product.tags` would be dead work (and risks Liquid's 50-iteration `for` cap on tag-heavy products). **Resolver order (feature 45 Decision B):** override → `byProduct` → exclude gate → broad tiers — so neither the per-product override nor an explicit `byProduct` assignment can be suppressed by a carve-out; only the broad tiers are gated. (Before feature 45, the exclude gate wrapped `byProduct` too, so an excluded product could never reach its own explicit assignment — a real storefront bug the reorder fixes.) Resolution lives in `snippets/spec-table-resolve.liquid` (emits the matched handle); the block resolves the metaobject and renders.

> **Routing-map key format — GID-faithful (locked feature 40, `context/features/40-…`).** `byProduct` / `byCollection` keys and `excludedProductGids` entries are the **raw `scopeValue` GID** (`gid://shopify/Product/…` / `…/Collection/…`), copied verbatim from `ProductAssignment.scopeValue`; `byType` / `byVendor` keys are the raw selector strings. Liquid only exposes numeric `product.id` / `collection.id`, so the theme app extension **constructs the GID token** before the lookup — `{% assign pgid = 'gid://shopify/Product/' | append: product.id %}` then `routing.byProduct[pgid]`, and likewise per `product.collections`. The `product.id` forms shown above are the *illustrative* originals; feature 43 uses the GID-constructed key and browser-verifies it. (Trade documented in feature 40: keeps the projection builder lossless with no GID parsing; if 43's live test favors numeric keys, revisit the builder **and** this section together.)

The matched value is a template **handle**; resolve it with `metaobjects["$app:appx_spec_table"][handle]` (proven — see top-of-section update), then render only if `status.value == "ACTIVE"` and rows exist.

### Product assignment index (sparse)

`ProductAssignmentIndex` is **not** a per-catalog cache anymore. Broad rules live in the shop routing map, so most products have **no** index row. It is populated only for:

- **materialized single-product overrides** — the bounded `PRODUCT`-scope entries written as per-product `$app:spec_table` metafields (the fallback path), with `appliedTemplateHandle` + `syncedToShopifyAt`; and
- **`STALE`** rows when a materialized override's product data changed and needs resync.

`status = APPLIED` means a per-product override metafield is set (`templateId`, `sourceAssignmentId`, `scope = PRODUCT`). `status = CONFLICT` is reserved for the rare hard `PRODUCT`-vs-`PRODUCT` override collision. **Rule-vs-rule conflicts are not stored here** — they are computed by the dry-run at activation and surfaced to the merchant immediately (blocking). The `[shopId, shopifyProductGid]` unique still guarantees one override row per product.

### Conflict handling

Conflicts are resolved by **blocking, not precedence** — the merchant decides, exactly like Moon Bundles. There is no `priority` tiebreak in MVP.

- **Cross-scope overlap** (e.g. `ALL_PRODUCTS` vs `PRODUCT_TYPE`, or a selected product that also matches a type rule): blocked at `DRAFT → ACTIVE`. The merchant resolves it by narrowing scope, adding an `EXCLUDE` exception (for the product-level case below), or leaving one template `DRAFT`.
- **Two `ALL_PRODUCTS` templates both trying to be `ACTIVE`** is the only statically-decidable MVP tie: blocked (a shop default already exists).
- **Same-scope single-valued ties can't occur** by construction — a product has exactly one `product_type` and one `vendor`, and `@@unique([shopId, templateId, scope, scopeValue, mode])` stops literal duplicates.

**`EXCLUDE` carve-outs resolve a PRODUCT-level conflict (feature 45 Decision A).** The dry-run gate subtracts carve-outs before declaring a collision, but **only** for the two decidable, product-attributable cases: (1) the candidate is `PRODUCT: X` and the other ACTIVE (covering) template excludes X, or (2) the other side is `PRODUCT: X` and the candidate (covering) template excludes X. So `A = ALL_PRODUCTS EXCLUDE X` and `B = PRODUCT X` may both be `ACTIVE`. **Broad×broad overlaps are never resolved by a carve-out** — a finite GID list can't prove two broad scopes disjoint, and the existence probe returns existence, not *which* products; the merchant narrows scope instead. The subtraction is a filter the gate applies **around** the pure INCLUDE resolver (`assignmentOverlap.ts` stays INCLUDE-only). Implementation: the gate reads the candidate's pending carve-outs + each other ACTIVE template's carve-outs (`getActiveExcludesByTemplate` / `getExcludesForTemplate`, `assignmentActivation.server.ts`).

> **`EXCLUDE` UI is `ALL_PRODUCTS`-only (feature 45).** Although the gate *supports* a carve-out on any broad scope (a `VENDOR EXCLUDE X` would resolve too), the editor Settings tab surfaces the "Except these products" control **only under the `ALL_PRODUCTS` scope**. Rationale: `ALL_PRODUCTS` overlaps every other scope, so the only rule that can coexist with `ALL_PRODUCTS EXCLUDE X` is a `PRODUCT: X` template — exactly the case the gate resolves — which makes the control impossible to misapply to an unresolvable broad×broad conflict. Carve-outs are `mode: EXCLUDE`, `scope: PRODUCT` rows written by `setTemplateExcludes` (touches only EXCLUDE rows, so the INCLUDE scope survives). Cost: "`VENDOR:Acme` except X" is not expressible in the MVP UI.

> **Multi-value scopes — one scope KIND per template, 1..N values (feature 46, server).** `PRODUCT` and `COLLECTION` may carry **several** values ("selected products / collections"); `ALL_PRODUCTS` / `PRODUCT_TYPE` / `VENDOR` stay single-valued. A template's INCLUDE rows are **homogeneous in scope kind** — `setTemplateScope` takes a `ScopeSelector[]` and replaces the whole INCLUDE set in one `$transaction` (validated arity via a `MULTI_VALUE_SCOPES` predicate — *distinct* from `assignmentOverlap`'s per-product `SINGLE_VALUED`). The conflict gate generalizes accordingly: two templates collide iff **any** `(candidateSelector, otherSelector)` pair overlaps; the gate reasons **per pair**, subtracts EXCLUDE carve-outs **per pair**, then dedupes survivors to distinct templates **last** (subtract-before-dedupe — a multi-value *other* template partially covered by the candidate's carve-outs must still block via its un-excluded members). The pure resolver (`assignmentOverlap.ts`) and the Shopify probe (feature 39) are unchanged; the routing projection already folds N rows/template into `byProduct`/`byCollection`. **Decision C — INCLUDE ∩ EXCLUDE disjoint per template:** a product a template INCLUDEs can never also be EXCLUDE'd (on the storefront `byProduct` beats the exclude gate, so the EXCLUDE would be inert *and* would fool the gate's subtraction). Enforced two ways: `setTemplateScope` deletes any contradictory `EXCLUDE PRODUCT` row when it writes an `INCLUDE PRODUCT` set, and the editor action reconciles the PENDING excludes against the pending INCLUDE set before gating (the gate also strips the candidate's self-included products, defense in depth). The multi-select **UI** is feature 47; feature 46 is server-only (the single-select picker keeps working via a legacy `scopeValue` → 1-element-set normalization).

> **Multi-value scopes — the picker + loader (feature 47, UI).** The editor's `PRODUCT`/`COLLECTION` scope control is a **multi-select picker → chip list** (one chip per selected product/collection, per-chip Remove + "Add more", mirroring feature 45's EXCLUDE control); `PRODUCT_TYPE`/`VENDOR` keep the single text field; `ALL_PRODUCTS`/`NONE` carry no value. The engine holds a value **set** (`scopeValues: { value, label, image }[]`); the dirty snapshot + Save payload carry the raw values (order-independent, sorted), sent as `payload.scopeValues[]` which `parsePendingScope` already reads. A valued kind with **zero** values is *incomplete* (Save disabled via `isScopeSetComplete`), **not** a clear — only `NONE` clears. **The loader now reads the full INCLUDE set** (`getTemplateIncludeSelectors`, replacing the single-row `getAssignmentForTemplate`) and batch-resolves the chip details in one `nodes(ids:)` query (`resolveScopeResourceDetails`, fail-soft to the GID) — so an **N>1 template round-trips through the editor without collapsing to one value** (the feature-46 Step-5 hazard is closed; a multi-value template is now safe to open + Save in the editor). Server/gate/writer/projection/Decision-C are **unchanged from feature 46** — 47 only reshapes what the browser sends and shows.
>
> **Chip visual polish (feature 47, Kaching-style cards).** Each chip is a `<s-box>` card holding an `<s-thumbnail>` (product/collection image, built-in placeholder when none) + the resolved title + a critical-tone `icon="delete"` trash `<s-button>` — replacing the earlier plain title + text "Remove" link. The **same `ResourceChipCard`** renders both the INCLUDE scope list and the `ALL_PRODUCTS` EXCLUDE "Except these products" list. Thumbnails come from two sources: the App Bridge resource picker returns `images[]`/`image` at pick time (in-session), and on reload the loader's `resolveScopeResourceDetails` returns a `GID → { label, image }` map — `Product.featuredImage.url` / `Collection.image.url` fetched in the **same** batched `nodes(ids:)` query as the titles (no extra round-trip; fail-soft to a null image → placeholder). Excludes now use that same batched resolver (one query, was N single `node` calls). All display-only — the durable value/GID is unchanged, so nothing about persistence, the gate, or routing moved.
>
> **Long lists collapse (`CollapsibleChipList`, `MAX_INLINE_CHIPS = 4`).** So a 100-product assignment doesn't stack 100 cards down the sidebar, both chip lists (scope + `ALL_PRODUCTS` excludes) render inline only up to 4; beyond that they collapse behind a **"View all selected (N)"** toggle, and expanding reveals the full list inside a height-capped (~20rem) scroll `<div>` (`s-box`'s `overflow` supports only hidden/visible, so a plain div) with a "Show less" to re-collapse. The trailing "Add more / Select" button stays visible in every state. Pure client state, display-only. Also — the EXCLUDE picker (`addExcludes`) now passes `selectionIds` (the current exceptions) and REPLACES from the picker's returned set, matching the scope picker (`pickResources`), so reopening either shows the current selection **checked** and unchecking there removes. **Live-verified on the dev store (2026-07-11):** on a `/new` template, setting the scope to "A specific product" and picking two products rendered two Kaching-style cards — product thumbnail + title + a red trash button on one row (a 3-column `auto 1fr auto` grid so the row doesn't wrap in the ~300px sidebar; `background="base"` + border to stand out from the subdued sidebar) — and the incomplete-state error cleared. The loader-reload thumbnail path (`resolveScopeResourceDetails` fetching `featuredImage.url`/`image.url` on reload) is unit-tested + renders through the **same** `ResourceChipCard`; not re-saved live to avoid a stray template on a store in active parallel use. Component markup + the `nodes(ids:)` query were validated with the Shopify MCP validators.

`priority` stays in the schema but **dormant and unsurfaced**. It is a forward-compatible landing spot for a post-MVP same-tier tiebreak on **multi-valued** scopes (a product in two different collection rules, or two tag rules), where an overlap can appear at render time on a *future* product that didn't exist at activation. Even then, prefer an implicit rule (most-recently-updated wins) or a contextual prompt over a global numeric knob — do not surface a priority field in the MVP UI.

While a conflict is unresolved the template cannot go `ACTIVE`, so nothing is projected to the routing map for it and the storefront is unaffected.

---

## 10. Shopify Metaobject Strategy

### Metaobject definition

One metaobject definition, **declared declaratively in `shopify.app.toml`**
(`[metaobjects.app.appx_spec_table]`) and distributed automatically to every
shop on install/deploy. **Implemented and round-trip-tested live (Editor Step
9.5, 2026-06-19); decisions locked:**

> **Update (2026-07-01, storefront slice 1).** The definition moved from a
> **runtime** `metaobjectDefinitionCreate` (once per shop, GID stamped on
> `Shop.metaobjectDefinitionGid`) to a **declarative TOML** definition — Shopify's
> recommended path for app-owned data, and required so the `spec_table`
> `metaobject_reference` metafield (§9) can target it at deploy time via the
> `metaobject_reference<$app:appx_spec_table>` shorthand. `ensureSpecTableDefinition`
> and `setShopMetaobjectDefinitionGid` were removed; `Shop.metaobjectDefinitionGid`
> is now **vestigial** (no longer written/read) — dropping the column is a later
> cleanup, deferred here to keep this slice off a DB migration.

- **Type is app-reserved: `$app:appx_spec_table`** (resolves to `app--<app-id>--appx_spec_table`) — the `$app:` prefix reserves it for this app's exclusive use so neither the merchant nor another app can alter its structure (data safety, priority #1). `access: { admin: merchant_read_write, storefront: public_read }`.
- **Fields:**

  | Key | Type | Purpose |
  | --- | --- | --- |
  | `template_id` | `single_line_text_field` | Internal Appx template ID. |
  | `status` | `single_line_text_field` | `ACTIVE` / `DRAFT` / `ARCHIVED`. |
  | `rows` | `json` | Storefront-ready rows — a JSON **string** (`JSON.stringify(rows)`); the **same** `EditorRow[]` shape, no reshape needed. |
  | `styling` | `json` | Storefront-ready styling **data** — the template's `TableStyling` as a JSON string, **overrides only** (non-default knobs + non-null colors; `{}`/absent = full theme inherit). Spec: §5 `TableStyling` + the serialization note below. |
  | `styling_css` | `json` | Storefront-ready styling **presentation**, precomputed by the server: `{ "classes": "<space-joined modifier classes>", "vars": "<--k: v; declarations>" }`. Liquid prints both verbatim; it derives nothing. Added feature 57 Step 7 (2026-07-19) — see the styling-serialization note below. |
  | `updated_at` | `single_line_text_field` | Debugging/sync visibility. |

- **Definition:** declared in `shopify.app.toml`, not created at runtime (see the update note above). The definition is read-only through the Admin API.
- **Entry mutations** (validated with `validate_graphql_codeblocks` @ 2025-10, in `app/shopify/metaobjects.server.ts`): `metaobjectUpsert` per template by handle `template-{templateId}` (store the returned GID + handle on the `Template`); `metaobjectByHandle` to read back; `metaobjectDelete` on template delete. Sync runs for every status; the storefront gates visibility on `status == ACTIVE`.

### Store both GID and handle

`Template` stores `shopifyMetaobjectGid` (for Admin API updates) and `shopifyMetaobjectHandle` (for Liquid lookup). Handle format: `template-{templateId}` (e.g. `template-clx2def456`).

### Storefront serialization

The metaobject stores template structure — the same `EditorRow[]` rows JSON (see the §6 example); two pointers reach it: for broad rules the **shop routing map** (`shop.metafields["$app"].routing`) yields a template **handle** resolved directly via `metaobjects["$app:appx_spec_table"][handle]` (§9, proven 2026-07-07), and for bounded single-product overrides a per-product `metaobject_reference` metafield (`product.metafields["$app"].spec_table`, **not** a handle string) points at the same metaobject. Liquid resolves each value by joining its parts in order via `snippets/spec-table-value.liquid`: `TEXT` from row JSON, `SHOPIFY_FIELD` from the Shopify product object, `METAFIELD` from `product.metafields`, `LINE_BREAK` as a hard break (`<br>`, no content). Variant `SHOPIFY_FIELD`s (price, sku, weight, …) resolve against `product.first_available_variant` — the **default** variant, not a shopper selection (feature 35 decision; live variant-switch re-rendering is deferred until requested).

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

Early-bird pricing + review-reward logic (per `prd.md`) need DB records. `AppSubscription` / `ShopEntitlement` (§5) track: early-bird eligibility + install number, trial start/end, review-reward grant date + duration, Shopify subscription GID, subscription status, and `bonusAmount`. `bonusAmount` lives on `ShopEntitlement` (not the Shopify subscription) because it's promotional/business state — bonus credit, discount value, reward amount, goodwill credit, or future coupon/gift tracking.

---

## 12. Why Row Keys Matter

`id` and `key` serve different jobs, so every row carries both:

- **`id`** — technical database identity (relational refs, analytics, audit logs). Client-generated, never changes, never reused; the merchant never sees it.
- **`key`** — the row's stable *meaning* (e.g. `screen_size`), used for CSV import/export matching, AI auto-fill, localization, JSON-LD/SEO, and product metafield JSON values. Generated from the label at creation, then stable: translating the label to French/Arabic leaves `key` as `screen_size`, so anything keyed on it never breaks when the label changes.

See §7 for the full id/key rules.

---

**Architecture summary.** Postgres is the source of truth; Shopify metaobjects (template structure) + a shop-level routing metafield (attribute → handle) + a bounded per-product metafield (single-product overrides) are the storefront delivery layer. Store both metaobject GID and handle. Assignment is **rigid and block-on-conflict**: a template targets one scope, overlaps between `ACTIVE` templates are blocked at `DRAFT → ACTIVE` (dry-run: O(rules) set-algebra + `products(query, first:1)` existence checks), so the `ACTIVE` rule set is disjoint and the storefront resolves one match with no precedence. Broad rules deliver as O(1) shop-map entries (future products auto-covered, no re-materialization); `ProductAssignmentIndex` is sparse (materialized overrides only). Liquid resolves the matched handle directly via `metaobjects["$app:appx_spec_table"][handle]` (proven live) and renders only `status == "ACTIVE"`. `priority` is retained dormant. Keep variant-sensitive field mapping to selected/default-variant behavior for MVP.
