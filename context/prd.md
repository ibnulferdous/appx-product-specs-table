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
- Editor with device previews — the editing table is a fixed editing surface (it deliberately does **not** reflect merchant styling; see `context/features/67-…`), and the previews show exactly how the storefront table renders; a single view toggle switches between **Edit** (the only editable view) and read-only **Desktop / Tablet / Mobile** previews that show how the table renders for shoppers (mobile = stacked label-over-value). No separate preview panel

### Data Sources

- **Manual text** — saved as `TEXT` valueParts; fixed template text shared by every product using the template
- **Native Shopify fields** — vendor, product type, category, tags, total inventory, available for sale, selected options, weight, SKU, barcode, price, compare-at price, inventory quantity. Variant-sensitive fields (SKU, price, weight, available for sale, selected options, etc.) use the selected variant with a default/first-variant fallback. (Field set last revised 2026-06-16 against the Admin API 2026-04 schema: `title` dropped as redundant with the product-page heading; `category` is the structured Standard Product Taxonomy category; `available for sale` and `total inventory` cover stock; `selected options` is a list of name/value pairs that the storefront resolver joins into one cell value.)
- **Metafield picker** — select namespace and key from a dropdown; no code, no Liquid, no JSON required

### Product Assignment

- Assign a template to individual products manually
- Assign a template by product type (all products of that type inherit the template)
- Avoid assignment conflicts before changing the storefront metafield
- Product create/update webhooks so product-type assignments also apply to future matching products

### Storefront Display

- Rendered via Theme App Extension (app blocks) — merchant decides placement in the theme editor
- Mobile-first: two-column layout on desktop, stacked label-over-value on mobile (same approach as Amazon mobile) — the default; the Style tab's mobile knob can opt a table into same-as-desktop _(Style-tab spec 2026-07-18)_
- Semantic, accessible HTML: `<table>`, `<thead>`, `scope="row"`, ARIA labels, keyboard navigation
- Tested and compatible with the top 10 Shopify themes (free and paid)

### Styling & Customization

The app uses color deliberately and keeps it organized: every color — admin dashboard and storefront alike — flows from CSS variables as a single source of truth, so the palette can be retuned centrally and the Style tab can grow new themeable surfaces without scattering hardcoded values. The admin UI mirrors Shopify's Polaris design system so merchants feel they are inside Shopify, not a third-party app.

- Inherit theme styles by default — zero configuration needed
- Layout style knobs — one table primitive with orthogonal controls, not monolithic layouts _(Style-tab spec 2026-07-18)_: row layout (two-column / stacked label-on-top), section header style (banded / text-only), collapsible sections (native `<details>`, with initial-state control), row dividers (lines / zebra stripes / none), density (compact / default / spacious), mobile behavior (stacked by default / same as desktop)
- Style presets with **copy semantics**: a skippable preset gallery on template creation (built-ins: Classic, Striped, Banded, Stacked, Accordion) — picking one copies its values into the template, which owns its style independently afterwards; merchants can save a customized style as a reusable preset _(phase-2 slice of the Style tab — see `admin-screen-plan.md` §Tab 2)_
- Full color control: label background, value background, header row background, stripe background, border color, text colors — each individually
- Typography controls — font size (theme-relative S / M / L presets, or a bounded custom px value), label weight, font style, line height, and label case (uppercase); bounded segments in the Shopify Horizon theme-editor pattern — no free-form typography inputs _(2026-07-18 addendum; font-family picker, letter spacing, and wrap control deliberately excluded)_
- Column width ratio (label % vs value %)
- Colors resolve through CSS variables (one source of truth across admin + storefront), leaving room to extend the Style tab post-MVP with more surfaces or saved themes

### Onboarding

- Simple setup guide on first launch
- Prompt to add the app block to the theme

---

## Pricing Strategy — Shopify App Pricing (four public plans)

Billing uses **Shopify App Pricing** — the Dashboard-defined, Shopify-hosted plan page — **not**
the legacy code-defined Billing API (`billing: { lineItems }` in `shopifyApp()`). Four public
plans, gated by **assigned-product count** (the number of distinct products the shop's ACTIVE
templates resolve to):

| Plan | Monthly   | Annual                | Assigned-product cap | Free trial              |
| ---- | --------- | --------------------- | -------------------- | ----------------------- |
| Free | $0/mo     | —                     | 25                   | — (permanent free tier) |
| Go   | $4.99/mo  | — (monthly only)      | 250                  | 60 days                 |
| Plus | $9.99/mo  | $99.99/yr (~16.6% off)| 1,000                | 60 days                 |
| Max  | $14.99/mo | $145.99/yr (~18.8% off)| Unlimited           | 60 days                 |

- **Plans drafted in the Partner Dashboard 2026-08-20** (Distribution → Pricing → Shopify App
  Pricing setup) — all four `Free`/`Go`/`Plus`/`Max` created, but **App Pricing is not yet
  enabled** (the "Enable Shopify App Pricing" switch is deliberately unflipped pending the Render
  `SHOPIFY_APP_HANDLE` env var + a dev-store live-verify). ≤1 free public plan and 4 < the
  8-public-plan cap — both satisfied. The plan **Display names** are exactly `Free`/`Go`/`Plus`/
  `Max`; the app reads the active subscription's name and maps it to a cap
  (`app/utils/billingPlans.ts`).
- **Annual vs monthly is invisible to the app.** The cap is keyed off the subscription *name*
  (`Plus`, `Max`, …), which is identical whether the merchant pays monthly or yearly, so the
  annual option needed no code change. The annual prices above live only in the Dashboard.
- Shopify hosts the plan-selection page and automates recurring charges, proration, free
  trials, price changes, and no-charge review testing. 🔴 **Shopify does NOT enforce the
  per-plan caps — the app must.** Two slices: **slice 1 (shipped)** — the root loader redirects a
  shop with no active subscription to the hosted plan page; **slice 2 (shipped)** — the
  assignment path hard-blocks a save once it would push the shop past the plan's product cap.
- Trial days are tracked over a 180-day window; a reinstall does **not** reset the trial.

⟨Supersedes the retired **Early Bird / free-for-3-months / review-reward** concept — a
pre-build idea, dropped 2026-08-16. See the `shopify-app-pricing-vs-billing-api` decision.⟩

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
5. Billing gates correctly with no manual intervention: a shop with no active subscription is redirected to the hosted Shopify App Pricing page (slice 1, shipped), and product assignments beyond the active plan's cap are prevented (slice 2, shipped). Both are code-complete and gate-green; live-verify on a dev store is the remaining gate before release.

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
- Styling customization: layout knobs (row layout, section header style, collapsible sections, row dividers, density, mobile behavior), colors, font size/style, column width; built-in style-preset gallery on template creation; merchant-saved presets (phase-2 slice, cuttable without rework)
- Simple onboarding flow
- Archive and hard-delete template actions
- Billing via Shopify App Pricing: four-tier plan gating in the app root loader (slice 1, shipped) + assigned-product cap enforcement (slice 2, shipped); dev-store live-verify required before release

### Out of Scope (Post-MVP)

- Bulk product assignment (by collection, by tag, 50+ products at once)
- Variant-level metafield mapping
- Additional display styles beyond the MVP knob set (card grid, tab layout, modal/drawer container, multi-column "newspaper" flow) — collapsible sections and stacked layout moved INTO scope with the Style-tab spec 2026-07-18
- Apply-a-preset-to-all-templates bulk action (future app-settings route — the copy-semantics companion that restores retroactive "set once and done"; design the confirm as a pre-checked template list so scoped apply stays a UI tweak)
- Product comparison tables
- Localization and RTL support
- CSV import / export
- AI-assisted spec auto-fill
- Analytics and engagement tracking
- Collaboration workflows, audit logs, approval flows
- External integrations (PIM, Google Merchant Center, Shopify Flow)
- Public REST API and external webhooks
- JSON-LD structured data output
