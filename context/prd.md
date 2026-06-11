# Appx — Product Specs Table: Product Requirements

## Problem & Overview

Shopify's native product pages have no structured way to display specifications. Merchants either dump specs into the product description (messy) or skip them entirely (lost conversions). Appx fills that gap: merchants define reusable spec table templates, map rows to manual text, native Shopify fields, or metafields, assign those templates to products, and display them on the storefront through a Theme App Extension. The app is built for any Shopify merchant whose products are specification-heavy and demand a structured, professional way to present technical details to shoppers.

---

## Core User Flow

1. Merchant installs the app from the Shopify App Store.
2. Onboarding guide prompts them to create their first template and add the app block to their theme.
3. Merchant creates a named template (e.g., "Laptop Specs") and adds rows — each row has a label and a value source (manual TEXT, Shopify field, or metafield).
4. Merchant optionally groups rows under section headers (e.g., "Display", "Battery") and reorders via drag-and-drop.
5. Merchant assigns the template to one or more products — individually or by product type.
6. Merchant opens their theme editor, drops the app block onto the product page, and positions it wherever they want.
7. The spec table appears live on the storefront, inheriting theme styling with optional customization applied.
8. Merchant returns to the app to edit, duplicate, or manage templates as their catalog grows.

---

## MVP Features

### Template Management

- Create, rename, duplicate, archive, and hard-delete templates
- Add, edit, delete, and drag-and-drop reorder rows within a template
- Add section headers to group related rows (e.g., "Display", "Battery")
- Paste a multi-cell specs table copied from any website, Excel, or Google Sheets to bulk-create rows (first pasted column → label, remaining columns → manual TEXT value; 200-row cap enforced on paste)
- Auto-hide rows with empty values on the storefront
- Undo / redo support while editing
- Save templates as draft or published state
- WYSIWYG editor — the editing table renders exactly like the storefront table and stays editable in every viewport (Desktop / Tablet / Mobile); no separate preview panel

### Data Sources

- **Manual text** — saved as `TEXT` valueParts; fixed template text shared by every product using the template
- **Native Shopify fields** — title, vendor, product type, tags, weight, SKU, barcode, price, compare-at price, inventory quantity. Variant-sensitive fields (SKU, price, weight, etc.) use selected variant with default/first variant fallback
- **Metafield picker** — select namespace and key from a dropdown; no code, no Liquid, no JSON required

### Product Assignment

- Assign a template to individual products manually
- Assign a template by product type (all products of that type inherit the template)
- Avoid assignment conflicts before changing the storefront metafield
- Product create/update webhooks so product-type assignments also apply to future matching products

### Storefront Display

- Rendered via Theme App Extension (app blocks) — merchant decides placement in the theme editor
- Mobile-first: two-column layout on desktop, stacked label-over-value on mobile (same approach as Amazon mobile)
- Semantic, accessible HTML: `<table>`, `<thead>`, `scope="row"`, ARIA labels, keyboard navigation
- Tested and compatible with the top 10 Shopify themes (free and paid)

### Styling & Customization

- Inherit theme styles by default — zero configuration needed
- Full color control: label background, value background, header row background, border color, text colors — each individually
- Font size and font style control
- Column width ratio (label % vs value %)

### Onboarding

- Simple setup guide on first launch
- Prompt to add the app block to the theme

---

## Pricing Strategy — Early Bird (First 100 Installs)

- Free for the first 3 months after install
- Verified review reward: 1–2 additional free months (reward given after submission — fully Shopify policy compliant)
- Applies only to installs during the defined launch window

---

## Technical Stack

| Layer                | Choice                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App Framework        | Shopify App Template (Remix / React Router)                                                                                                               |
| Database             | PostgreSQL via Neon (cloud-hosted)                                                                                                                        |
| ORM                  | Prisma                                                                                                                                                    |
| Admin UI Editor      | Custom React spec-table editor (@dnd-kit for drag-and-drop)                                                                                               |
| Storefront Rendering | Theme App Extension — Shopify Liquid + plain JavaScript                                                                                                   |
| Performance Limit    | Maximum 200 rows per table, validated in UI and on save (MVP cap — may increase post-MVP; keep it as a single shared constant, never a hardcoded literal) |

---

## Success Criteria

1. A merchant can install, create a template, assign it to a product, add the app block, and see the spec table live — all within 10 minutes, no code required.
2. The storefront table renders correctly on the top 10 Shopify themes, on desktop and mobile, and passes basic accessibility checks.
3. All three data source types (manual TEXT, native Shopify fields, metafields) correctly populate row values on the storefront.
4. The app sustains normal performance with up to 200 rows per table and up to 100 products assigned to templates.
5. The first 100 merchants receive correct early bird pricing and review reward without any manual intervention.

---

## Scope

### In Scope

- Template builder with rows, section headers, and drag-and-drop reordering
- Three data source types: manual TEXT parts, native Shopify fields, metafields
- Template assignment by individual product and by product type
- Product create/update webhook handling for future product-type assignment matches
- Assignment conflict avoidance for overlapping product and product-type rules
- Storefront rendering via Theme App Extension app block
- Mobile-responsive, accessible table output
- Basic styling customization (colors, font size/style, column width)
- Simple onboarding flow
- Archive and hard-delete template actions
- Early bird pricing and review reward flow

### Out of Scope (Post-MVP)

- Bulk product assignment (by collection, by tag, 50+ products at once)
- Variant-level metafield mapping
- Multiple display styles (card grid, accordion, tab layout)
- Product comparison tables
- Localization and RTL support
- CSV import / export
- AI-assisted spec auto-fill
- Analytics and engagement tracking
- Collaboration workflows, audit logs, approval flows
- External integrations (PIM, Google Merchant Center, Shopify Flow)
- Public REST API and external webhooks
- JSON-LD structured data output
