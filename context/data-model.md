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

> The MVP schema is intentionally forward-compatible with post-MVP expansion areas (multilingual support, variant-level specs, flexible assignment rules, import/export, AI extraction). Consult `context/feature-roadmap.md` when making schema or feature boundary decisions that could affect those areas.

## 1. Architecture Overview

Appx uses a three-layer data pipeline:

```text
Layer 1: React / AG Grid state
- Holds unsaved edits in the browser.
- Nothing persists until the merchant clicks Save.

Layer 2: PostgreSQL via Neon
- Source of truth for saved app data.
- Prisma is the ORM.
- Stores shops, templates, rows JSON, assignment rules, resolved product assignment indexes, styling, billing, and entitlement data.

Layer 3: Shopify storefront data
- Shopify metaobjects store the renderable template payload.
- Product metafields point Liquid to the correct template for the current product.
- Liquid and plain JavaScript render the table through the Theme App Extension.
```

Core principle: Postgres is the source of truth. Shopify metaobjects and metafields are the storefront delivery layer.

---

## 2. MVP Data Model Decisions

1. Use a real `Shop` model as the parent record for shop-specific app data.
2. Include minimal billing and entitlement models in the MVP schema.
3. Make assignments visible to Liquid by writing a product metafield that points to the assigned template.
4. Treat saved data and template status separately, similar to Shopify products.
5. Support one effective spec table per product by resolving overlapping assignments with priority.
6. Use ordered `valueParts` instead of a single row value source.
7. Include product create/update webhooks in MVP so product-type assignments apply to future matching products.
8. Store a resolved `ProductAssignmentIndex` row for each product that currently has an effective template assignment.
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
├── AppSubscription
└── ShopEntitlement
```

`Template` depends on `Shop`. `ProductAssignment` depends on `Shop` + `Template`. `ProductAssignmentIndex` depends on `Shop` + `Template` + `ProductAssignment`. `TableStyling` depends on `Template`. Billing models depend only on `Shop`.

### Migration schedule

| Migration name | Models added | Enums added | Build step that triggers it |
| --- | --- | --- | --- |
| `add-shop` | `Shop` | `OnboardingStatus` | App shell — upsert `Shop` on first auth |
| `add-template` | `Template` | `TemplateStatus` | Templates list + Template editor (Rows tab) |
| `add-assignment` | `ProductAssignment`, `ProductAssignmentIndex` | `AssignmentType`, `AssignmentIndexStatus` | Product assignment screen |
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

### Template status should behave like Shopify product status

Important MVP behavior:

- Unsaved edits live only in React state.
- Save writes the latest template data to Postgres.
- Save syncs the latest storefront delivery data to Shopify for `ACTIVE`, `DRAFT`, and `ARCHIVED` templates.
- Status controls storefront visibility, not whether saved data is synced.
- Liquid renders only templates whose status is `ACTIVE`.
- `DRAFT` and `ARCHIVED` templates may exist in Shopify metaobjects, but Liquid must not render them.

This is a simple Shopify-like model, not a full versioned publishing workflow. A future enterprise workflow can add draft versions and approval flows later.

### Product-specific custom values should use Shopify metafields

The template defines the structure: rows, labels, sections, order, and value parts. Product-specific custom values should live in Shopify product metafields, not Appx Postgres.

The PRD's "manual input" requirement maps to `TEXT` valueParts. Those values are fixed template text shared by every product using the template.

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
  // Rules that connect templates to products or product types.
  assignments        ProductAssignment[]
  // Resolved per-product assignment state used for quick lookup and conflict warnings.
  assignmentIndexes  ProductAssignmentIndex[]
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

  // Full AG Grid row array. Array index is display order.
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

  assignmentType   AssignmentType

  // App validation: PRODUCT requires shopifyProductGid.
  // App validation: PRODUCT_TYPE requires productType.

  // For PRODUCT: gid://shopify/Product/123456
  shopifyProductGid String?

  // For PRODUCT_TYPE: exact product type string from Shopify.
  productType       String?

  // Higher number wins when multiple assignments match the same product.
  priority          Int      @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  resolvedProducts ProductAssignmentIndex[]

  @@unique([shopId, shopifyProductGid])
  @@unique([shopId, productType])
  @@index([shopId, assignmentType])
  @@index([shopId, shopifyProductGid])
  @@index([shopId, productType])
}

enum AssignmentType {
  PRODUCT
  PRODUCT_TYPE
}

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

  // Snapshot of the product type used during resolution.
  productType String?

  // Required when status is APPLIED. Optional for unresolved conflicts.
  assignmentType AssignmentType?
  status         AssignmentIndexStatus @default(APPLIED)
  conflictReason String?

  // Storefront pointer written to Shopify product metafield after resolution.
  appliedTemplateHandle String?
  syncedToShopifyAt     DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([shopId, shopifyProductGid])
  @@index([shopId, templateId])
  @@index([shopId, assignmentType])
  @@index([shopId, status])
  @@index([sourceAssignmentId])
}

enum AssignmentIndexStatus {
  APPLIED
  CONFLICT
  STALE
}

model TableStyling {
  id         String   @id @default(cuid())
  templateId String   @unique
  template   Template @relation(fields: [templateId], references: [id], onDelete: Cascade)

  headerBgColor    String?
  labelBgColor     String?
  valueBgColor     String?
  borderColor      String?
  labelTextColor   String?
  valueTextColor   String?
  fontSize         String?
  fontWeight       String?
  fontStyle        String?
  labelWidthPct    Int?

  extraStyles      Json     @default("{}")
}

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

`Template.rows` remains a flat JSON array. Every element is either a data row or section header. This still works well with AG Grid drag-and-drop.

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
| `hideWhenEmpty` | boolean | Yes      | If true, storefront hides this row when the resolved value is empty.                                    |

MVP validation: a template can contain at most 200 rows, including data rows and section headers. The admin UI should prevent merchants from exceeding this limit, and the server should reject saves that exceed it.

### Value part reference

| Part type       | Required fields    | Description                                                            |
| --------------- | ------------------ | ---------------------------------------------------------------------- |
| `TEXT`          | `text`             | Fixed manual template text, same for every product using the template. |
| `SHOPIFY_FIELD` | `field`            | Dynamic value read from the Shopify product object.                    |
| `METAFIELD`     | `namespace`, `key` | Dynamic value read from a Shopify product metafield.                   |

Admin UI may show Liquid-like tokens such as `{{ product.metafields.custom.battery_life.value }}`, but Appx should save structured `valueParts`, not merchant-authored raw Liquid.

### Section header row

| Field           | Type             | Required | Description                                            |
| --------------- | ---------------- | -------- | ------------------------------------------------------ |
| `id`            | string           | Yes      | Technical stable ID.                                   |
| `key`           | string           | Yes      | Stable key such as `display` or `battery`.             |
| `rowType`       | `SECTION_HEADER` | Yes      | Identifies this as a section header.                   |
| `label`         | string           | Yes      | Section title shown to shoppers.                       |
| `hideWhenEmpty` | boolean          | Yes      | Future-compatible. Can help hide empty sections later. |

### Row ID and key rules

- `id` is generated by the client (using browser-native `crypto.randomUUID()` when a new row is created) to keep AG Grid's state stable, and is accepted as-is by the server.
- `id` must never change.
- `id` must never be reused.
- `key` should be unique inside a template.
- `key` should be generated from the label initially, but editable by the app if needed.
- Changing a label should not automatically change the key after the row is created.

---

## 8. Save, Status, and Storefront Behavior

The MVP follows a Shopify-like admin model:

```text
Merchant edits template in AG Grid
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

### Important product decision

This is not a versioned publish workflow. If a template is `ACTIVE`, saved row changes can appear on the storefront after sync.

That is acceptable for MVP because it matches the simple Shopify product-style save/status model. Later, if merchants need staging, approval, or scheduled publishing, add `TemplateVersion` or `TemplateSnapshot`.

---

## 9. Storefront Assignment Strategy

Liquid cannot read Appx Postgres data directly. Therefore, assignment resolution must be projected into Shopify data.

### MVP strategy

Use a product metafield to point the current product to the one effective spec table template. MVP intentionally renders only one spec table per product.

`ProductAssignment` stores merchant-created assignment rules. `ProductAssignmentIndex` stores the resolved product-level result of those rules, so the app can quickly show merchants which products already have an effective template assignment and avoid changing storefront metafields when a conflict exists.

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

### Assignment resolution

For each product, the app resolves assignment candidates before writing the Shopify product metafield or updating `ProductAssignmentIndex`:

1. Find the direct `PRODUCT` assignment for that Shopify product GID, if one exists.
2. Find the `PRODUCT_TYPE` assignment for that product's Shopify product type, if one exists.
3. Pick the candidate with the highest `priority`.
4. If two matching candidates have the same highest `priority`, mark the product as an assignment conflict and do not silently choose a winner.
5. If there is a clear winner, write that template's Shopify metaobject handle to `appx.spec_table_template_handle` and upsert one `ProductAssignmentIndex` row for that product.

Higher numeric `priority` means higher precedence. Direct product assignments do not automatically beat product type assignments; priority decides the winner.

### Individual product assignment

When the merchant assigns a template to one product:

1. Save `ProductAssignment` in Postgres.
2. Resolve the winning assignment for that product.
3. If there is no priority tie, write product metafield `appx.spec_table_template_handle` to that product.
4. Upsert `ProductAssignmentIndex` with the product GID, winning template, source assignment, applied template handle, and Shopify sync timestamp.

### Product type assignment

When the merchant assigns a template by product type:

1. Save `ProductAssignment` with `assignmentType = PRODUCT_TYPE`.
2. Query Shopify products matching that product type.
3. Resolve the winning assignment for each matching product.
4. If there is no priority tie, write the product metafield to each matching product.
5. Upsert one `ProductAssignmentIndex` row for each resolved product.
6. Use product create/update webhooks in MVP to keep future products in sync.

### Product assignment index

`ProductAssignmentIndex` is the resolved per-product assignment cache. It exists to make product lookup, merchant warnings, and webhook sync simple.

Use it to answer:

- whether a product already has an effective template assignment
- which template is currently applied to a product
- whether the effective assignment came from a direct product rule or a product type rule
- whether assignment resolution produced a conflict or stale result

The unique constraint on `[shopId, shopifyProductGid]` keeps one effective index row per product. `status = APPLIED` means the product metafield has a clear assignment, so `templateId`, `sourceAssignmentId`, and `assignmentType` should be set. `status = CONFLICT` means there is no clear winner; the app should warn the merchant and avoid changing the product metafield until the conflict is resolved. `status = STALE` means Shopify product data changed and the product needs reassignment/resync.

### Conflict handling

MVP supports one effective spec table per product. Duplicate direct product assignments and duplicate product type assignments are prevented by unique constraints:

- One shop can assign only one template directly to a specific product.
- One shop can assign only one template to a specific product type.

Direct product and product type assignments may still overlap for the same product. In that case, the assignment with the highest `priority` wins.

If matching assignments have the same highest `priority`, the app should prevent or warn before applying the conflicting assignment and avoid changing the existing storefront metafield until the merchant fixes priority.

When a conflict is detected, the app may upsert `ProductAssignmentIndex` with `status = CONFLICT` and a short `conflictReason`. The existing Shopify product metafield should remain unchanged.

---

## 10. Shopify Metaobject Strategy

### Metaobject definition

Create one metaobject definition per shop during app install or first app launch.

Recommended type:

```text
appx_spec_table
```

Recommended fields:

| Key           | Type              | Purpose                             |
| ------------- | ----------------- | ----------------------------------- |
| `template_id` | single line text  | Internal Appx template ID.          |
| `status`      | single line text  | `ACTIVE`, `DRAFT`, or `ARCHIVED`.   |
| `rows`        | json              | Storefront-ready rows.              |
| `styling`     | json              | Storefront-ready styling.           |
| `updated_at`  | date time or text | Optional debugging/sync visibility. |

### Store both GID and handle

`Template` stores:

```text
shopifyMetaobjectGid
shopifyMetaobjectHandle
```

Reason:

- GID is useful for Admin API updates.
- Handle is useful for Liquid lookup.

Recommended handle format:

```text
template-{templateId}
```

Example:

```text
template-clx2def456
```

### Storefront serialization

Rows sent to Shopify should be simplified for Liquid:

```json
{
  "id": "2e8a4f7c-1d3b-4c9f-8b2d-6e3a1c4f7d9b",
  "key": "battery_life",
  "rowType": "DATA",
  "label": "Battery Life",
  "hideWhenEmpty": true,
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
  ]
}
```

MVP recommendation:

- Metaobject stores template structure.
- Product metafield stores assigned template handle.

Then Liquid combines:

- `TEXT` parts from row JSON
- `SHOPIFY_FIELD` parts from the Shopify product object
- `METAFIELD` parts from Shopify product metafields

Liquid or plain JavaScript should join resolved parts in order to produce the final displayed value. If all dynamic parts are empty and `hideWhenEmpty = true`, the storefront should hide the row instead of rendering leftover text.

---

## 11. Billing and Entitlement Strategy

The PRD includes early bird pricing and review reward logic. This cannot be managed safely without database records.

### Minimal MVP requirements

Track:

- whether the shop is early-bird eligible
- install number if needed
- trial period start/end
- review reward granted date
- review reward duration
- Shopify subscription GID
- subscription status
- bonus amount

### `bonusAmount Float`

`bonusAmount` is intentionally stored on `ShopEntitlement` because it is promotional/business state, not the Shopify subscription itself.

Example use cases:

- bonus credit
- bonus discount value
- reward amount
- manual goodwill credit
- future coupon/gift tracking

---

## 12. Why Row Keys Matter

A row already has an `id`, so why add `key`?

Because `id` and `key` serve different jobs.

### `id`: technical database identity

Example:

```text
4a8b2d6e-3c1f-4e7a-8b9d-5c2f1a3e9b7d
```

Use it for:

- relational references
- future row-level references
- translations
- analytics
- audit logs

The merchant should not care about it.

### `key`: stable meaning of the row

Example:

```text
screen_size
```

Use it for:

- CSV import/export column matching
- AI auto-fill matching
- localization
- JSON-LD/SEO mapping
- readable debugging
- product metafield JSON values

### Example

A merchant creates a row with `key: "screen_size"` and `label: "Screen Size"`. Later they translate the label to French or Arabic — the `key` stays `screen_size`. CSV imports, AI mappings, and product value lookups all target the key, not the label, so they never break when the label changes.


Use Shopify metaobjects for template structure and product metafields for assignment visibility. Store both Shopify GID and handle. Resolve one effective spec table per product with `ProductAssignment.priority`, write the resolved result to `ProductAssignmentIndex`, and prevent unresolved assignment conflicts from changing storefront metafields. Include product create/update webhooks for product-type assignment sync. Keep variant-sensitive Shopify field mapping limited to selected/default variant behavior until the product rules are clearer.
