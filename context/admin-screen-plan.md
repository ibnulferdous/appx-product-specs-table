# Appx — MVP Admin Screen Plan

## Route Map

```
/app                          → Dashboard (onboarding / status overview)
/app/templates                → Templates List
/app/templates/new            → Template Editor (create)
/app/templates/:id            → Template Editor (edit)
/app/templates/:id/assign     → Product Assignment
```

---

## Screen 1 — Dashboard `/app`

**Purpose:** On first install, guide the merchant through setup. After onboarding, act as a status overview — a quick scan for problems and fast access to common actions.

**Primary Polaris components:** `Page`, `Card`, `Banner`, `CalloutCard`, `Layout`

**State to read:** `Shop.onboardingStatus`, `Shop.isAppBlockActive`, template counts, assignment counts, conflict counts

---

### State A — First-run (onboarding not started or in progress)

Shown when `Shop.onboardingStatus` is `NOT_STARTED` or `IN_PROGRESS`.

- Welcome banner at the top (not dismissible until onboarding is complete)
- Onboarding checklist — three steps rendered as a `VerticalStack` of `Card` rows:
  1. ✅ / ⬜ Create your first template → links to `/app/templates/new`
  2. ✅ / ⬜ Assign template to a product → links to `/app/templates/:id/assign`
  3. ✅ / ⬜ Add the app block to your theme → opens Shopify theme editor deep link
- Each completed step shows a green checkmark and is non-interactive
- Progress indicator: "2 of 3 steps complete"

---

### State B — Onboarding just completed (one-time transition state)

Shown once when all three steps are marked done and `Shop.onboardingStatus` flips to `COMPLETED`.

- One-time success `Banner` (dismissible): _"Your first spec table is live. Here's what you can do next."_
- Two `CalloutCard` suggestions below the banner:
  - "Create another template" → `/app/templates/new`
  - "Assign by product type" → `/app/templates/:id/assign`
- After the banner is dismissed, `Shop.onboardingStatus` is set to `DISMISSED` and this state never shows again

---

### State C — Returning merchant (default post-onboarding view)

Shown when `Shop.onboardingStatus` is `DISMISSED`. This is the permanent dashboard for any merchant who has been using the app.

**Summary stat cards row** — four cards across the top using Polaris `Layout.Section`:

| Card                | Value                        | Sub-text                              |
| ------------------- | ---------------------------- | ------------------------------------- |
| Templates           | Total count                  | X active · Y draft                    |
| Products assigned   | Count with a template        | Out of total products in store        |
| Unassigned products | Products with no spec table  | Actionable gap — links to assignment  |
| App block           | Active ✅ or Not detected ⚠️ | Links to theme editor if not detected |

**Action needed section** — only renders if at least one condition is true:

- One or more templates are `DRAFT` and have never been published → "X templates are unpublished"
- One or more products have `CONFLICT` status in `ProductAssignmentIndex` → "X products have assignment conflicts"
- `Shop.isAppBlockActive` is false → "App block not found in your theme"
- Each item is a `Banner` (warning tone) with a direct link to fix it

**Recent templates** — last 5 templates ordered by `updatedAt`, shown as a simple `ResourceList`:

- Template name | Status badge | Row count | Last edited date
- Each row links to `/app/templates/:id`
- "View all templates" link at the bottom → `/app/templates`

**Quick actions row** — two `Button` components:

- "Create new template" (primary) → `/app/templates/new`
- "View all templates" (plain) → `/app/templates`

---

### What this screen never shows

- The onboarding checklist once `onboardingStatus` is `DISMISSED`
- Analytics charts or engagement graphs (Phase 3)
- Audit logs or change history (Phase 4)
- Any placeholder "coming soon" widgets — keep the screen clean until those features exist

---

## Screen 2 — Templates List `/app/templates`

**Purpose:** See all templates, understand their status at a glance, and navigate to create or edit.

**Primary Polaris components:** `Page`, `IndexTable`, `Badge`, `Filters`, `Button`

**Content:**

- Page title: "Templates" + primary action: "Create template" → `/app/templates/new`
- `IndexTable` columns: Template Name | Status (`DRAFT` / `ACTIVE` / `ARCHIVED`) | Rows | Assigned Products | Last Updated
- Status shown as Polaris `Badge` (success = ACTIVE, warning = DRAFT, neutral = ARCHIVED)
- Row click → `/app/templates/:id`
- Row overflow menu (three-dot): Edit | Duplicate | Archive | Delete
- Empty state: prompt to create first template

**Filters (MVP only):** Status filter (All / Active / Draft / Archived)

**State to read:** `Template[]` for the current shop, with assignment count joined

---

## Screen 3 — Template Editor `/app/templates/new` and `/app/templates/:id`

**Purpose:** The core screen. Build or edit the template — rows, section headers, data sources, and styling — in a WYSIWYG editor that renders exactly like the storefront table.

**Layout:** Single full-width WYSIWYG editor. The editing table _is_ the live preview — it renders with the current `TableStyling` at all times. A viewport toggle (Desktop / Tablet / Mobile) switches the table's rendered width/layout (mobile shows the stacked label-over-value layout), and the table stays fully editable in every viewport. No separate preview panel.

**Primary Polaris components:** `Page`, `Layout`, `Card`, `Tabs`, `TextField`, `Select`, `Button`, `Banner`

### Top bar

- Editable template name (inline `TextField`)
- Status badge (clickable to change between DRAFT ↔ ACTIVE)
- Actions: Save (primary) | Save as draft | Discard
- Unsaved changes indicator

### Tab 1 — Rows (default tab)

This is where most of the work happens.

- Custom React editor grid with columns: ⠿ (drag handle) | Type | Label | Value Source | Actions
- Row types: `DATA` and `SECTION_HEADER` — visually distinct
- Inline editing of label and value source per row
- Value source picker per row (three types):
  - **Manual Text** — plain text input
  - **Shopify Field** — dropdown of mapped fields (title, vendor, SKU, weight, price, etc.)
  - **Metafield** — two-step dropdown: namespace → key
- "+ Add row" button at the bottom
- "+ Add section header" button at the bottom
- Drag-and-drop row reordering (via @dnd-kit, keyboard-accessible)
- Paste a multi-cell table copied from any website, Excel, or Google Sheets to bulk-create rows — first pasted column → label, remaining columns → manual TEXT value; 200-row cap enforced on paste
- Dynamic value parts (SHOPIFY_FIELD / METAFIELD) render as pill chips while editing, with a resolved placeholder preview (e.g., "Storefront preview: Up to **29 hours**")

- Row count indicator — warn at 180 rows, hard-block at 200
- Undo / Redo buttons in the toolbar above the grid

### Tab 2 — Styling

- Color pickers (Polaris `ColorPicker` or hex `TextField`): header background, label background, value background, border color, label text color, value text color
- Font size selector (dropdown: Small / Medium / Large / Inherit)
- Font style toggle: Normal / Bold
- Column width ratio slider or two numeric inputs (label % + value % = 100%)
- "Reset to theme defaults" link
- All styling changes apply live to the WYSIWYG editor table — no save required

**State to read/write:** `Template` (rows JSON, status, name), `TableStyling`

---

## Screen 4 — Product Assignment `/app/templates/:id/assign`

**Purpose:** Assign the template to products or product types, and see what is currently assigned.

**Primary Polaris components:** `Page`, `Card`, `ResourceList`, `ResourceItem`, `ChoiceList`, `Banner`

### Section A — Assign by Product Type

- Text input: enter a product type string (e.g., "Laptop")
- "Add product type" button
- List of currently assigned product types with remove action
- Info callout: "All current and future products of this type will use this template"

### Section B — Assign to Individual Products

- Product picker: Polaris `ResourcePicker` (opens Shopify's native product search modal)
- List of individually assigned products (product title, thumbnail, remove action)

### Section C — Conflict Warning

- If a product is covered by both a product-type rule and an individual-product rule, show a `Banner` (warning) listing the affected products and which rule takes priority
- Do not write the storefront metafield until the conflict is resolved

### Section D — Assignment Summary

- Read-only table: Product | Assignment Rule | Template | Status (Applied / Conflict / Stale)
- Sourced from `ProductAssignmentIndex`

**State to read/write:** `ProductAssignment[]`, `ProductAssignmentIndex[]` for this template

---

## Navigation & Shell

- Polaris `AppProvider` + `Frame` wrapping all screens
- Left `Navigation` with two items: Dashboard | Templates
- No custom navigation design — use Polaris defaults entirely

---

## Build Order

| Step | Screen / Feature                        | Why first                                     |
| ---- | --------------------------------------- | --------------------------------------------- |
| 1    | App shell + routing                     | Required for everything                       |
| 2    | Templates List (read-only, empty state) | Gets routing + Polaris layout working cheaply |
| 3    | Template Editor — Rows tab only         | Core of the vertical slice                    |
| 4    | Save template to Postgres               | Makes data real                               |
| 5    | Sync to Shopify metaobject              | Unlocks storefront rendering                  |
| 6    | Theme App Extension — render table      | Completes the vertical slice                  |
| 7    | Product Assignment screen               | Connects template to products                 |
| 8    | Template Editor — Styling tab           | Polish after slice is working                 |
| 9    | Dashboard + onboarding checklist        | Only useful once everything above works       |
