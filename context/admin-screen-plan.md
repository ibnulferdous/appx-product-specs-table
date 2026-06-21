# Appx — MVP Admin Screen Plan

> **Design reference.** The Template Editor (Screen 3) is visually specified by the mockup at `design/spec-editor-mockup.html` (rendered preview: `design/specs editor design.jpg`). This plan was reconciled against that mockup on **2026-06-21** (the _Spec-Editor Mockup sync_, referenced inline below). Where the mockup's **Style** and **Settings** panel _contents_ appear, treat them as **illustrative placeholders** that convey the editor's look and feel — the real, schema-backed specs are the prose in each tab section, and several panel controls are not yet functionally defined (see open questions in `progress-tracker.md`).

## Route Map

```
/app                          → Dashboard (onboarding / status overview)
/app/templates                → Templates List
/app/templates/:id            → Template Editor — Content · Style · Settings tabs (:id = "new" to create, any template id to edit)
/app/templates/:id/assign     → Product Assignment † (under reconsideration — see note)
```

> † **Assignment is moving into the editor's Settings tab** (design direction, _Spec-Editor Mockup sync 2026-06-21_ — not yet fully locked). The goal is to let merchants manage a template and its assignment from a single place. Whether the standalone `/app/templates/:id/assign` route is fully **retired** (everything folds into the Settings tab) or **kept** as a deep view for the conflict warning + assignment summary is an open question (tracked in `progress-tracker.md`). The assignment **functionality** (Screen 4 below) still applies wherever it ultimately lives.

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

## Screen 3 — Template Editor `/app/templates/:id`

> One route serves both create and edit: `:id = "new"` scaffolds a blank template, any other `:id` loads that template (404 when not found or owned by another shop). The create URL `/app/templates/new` resolves to this same dynamic route.

**Purpose:** The core screen. Build or edit the template — rows, section headers, data sources, and styling — in a WYSIWYG editor that renders exactly like the storefront table.

**Layout:** A WYSIWYG editor card whose **control row** carries the tab group on the left — **Content · Style · Settings** — and the view toggle on the right. The editing table renders with the current `TableStyling` at all times and is itself the live preview.

- **Content** tab → the table fills the full width of the card (no side panel).
- **Style** and **Settings** tabs → a **left controls panel (~300px)** appears beside the **still-live table**, so the merchant sees changes reflected in the real table as they work. This is a _controls_ rail, not a separate read-only preview — the editing table remains the preview surface.

The view toggle has four mutually-exclusive segments — **Edit** (pencil + label), a divider, then **Desktop / Tablet / Mobile**. **Edit** is the only editable view; **Desktop / Tablet / Mobile** are read-only previews of how the table renders for shoppers at that width (mobile shows the stacked label-over-value layout). In a device view all editor chrome is hidden (toolbar, hint, gutter, add-row, edit box, field picker) and the gutter column collapses. _(View Toggle Decision, Session 2026-06-14 — supersedes the earlier "fully editable in every viewport" wording; the mockup's CSS confirms the read-only device previews.)_

**Primary components:** App Bridge **contextual Save Bar** (`ui-save-bar`), Polaris web components for the page header / tab group / segmented toggle / panel controls (`s-page`, `s-button`, `s-select`, `s-menu`, `s-banner`, …), and the custom React spec-table grid.

### Top bar _(Spec-Editor Mockup sync 2026-06-21 — adopts the mockup's save/status model)_

- **Page header:** breadcrumb (Home → **Templates** → template name) with the template **name as the page title (H1)**. Renaming is offered as an inline title edit / a **Rename** action in the ⋯ menu (exact affordance is a small open detail).
- **Status dropdown** (page header, right): a button showing the current status with a colored dot — **Draft / Active / Archived** — opening a menu to change it. Status is now **independent of saving** (no "Save as draft").
- **⋯ More-actions menu** (page header, right): overflow for actions such as Duplicate, Archive, Delete, Rename.
- **Contextual Save Bar** (App Bridge): when there are unsaved edits, the admin's contextual save bar shows **"Unsaved changes"** with **Discard** and **Save** — this _is_ the unsaved-changes indicator. In-page Save buttons and the separate **"Save as draft"** button are removed.

### Tab 1 — Content (default tab)

The rows-and-sections editor — where most of the work happens. (Labeled **Content** in the editor tab bar.)

- Custom React editor grid under a sticky header row (**gutter · Label · Value**) — each data row is **Label | Value**; the row's gutter pairs a persistent ⠿ drag-handle with an ✕ delete (both muted at rest, revealed on row hover/focus). There is no separate "Type" column — row type is conveyed visually.
- Row types: `DATA` and `SECTION_HEADER` — visually distinct. A section renders as a single full-width, uppercase header with a small leading ▸ caret that is **decorative only** — sections are not collapsible groups and do not carry child rows (see the drag note below).
- Inline editing of the label per row; the value is an inline token editor (below).
- **Value editing — manual text + dynamic-field pills on one shared surface.** The value cell is a single inline editable surface holding plain `TEXT` and atomic dynamic-field **pills** (`SHOPIFY_FIELD` / `METAFIELD`). Manual text is typed directly. Dynamic fields are added with **pick-then-insert**, not a per-row picker:
  - Place the caret in a value, then click **Insert field** in the toolbar (disabled when there is no active caret in a value cell). This opens a focus-trapped **modal** listing native Shopify fields and the shop's metafields, with a search box over both. _(The mockup groups the choices as **Product / Variant / Metafield**; the shipped build renders the native fields as one flat searchable list followed by a metafields section — the grouping is a design reference, not a hard requirement.)_
  - Pick a field, then **Insert** → a complete pill drops at the saved caret. **Cancel / Esc / outside-click** inserts nothing.
  - **Click an existing pill** to reopen the same modal pre-filled → **Update** replaces the field (Cancel leaves it untouched). One modal serves create and edit.
- **Toolbar above the table** — **Add row** (primary), **Add section**, **Duplicate** (each inserts directly below the active row, appends if none, scrolls it into view; the active row, set on click/focus, is shown with a left accent), a separator, then **Insert field** and the row-count indicator. A one-line **hint** under the toolbar summarizes the core gestures (click a value to edit · Insert field · click a pill to change it · drag ⠿ to reorder).
- A full-width "+ Add row" at the bottom always appends to the end.
- Drag-and-drop row reordering (via @dnd-kit, keyboard-accessible). Sections are ordinary rows in the same array and drag exactly like data rows — a section is **not** a group, so moving it does not carry child rows with it.
- Paste a multi-cell table copied from any website, Excel, or Google Sheets to bulk-create rows — first pasted column → label, remaining columns → manual TEXT value; 200-row cap enforced on paste.
- Dynamic-field tokens render as **link-styled smart pills** while editing — blue link-like text reading **"Metafield · {key}"** or **"Field · {name}"**, a light background on hover and when the caret sits beside the token, and a tooltip carrying the fuller source (`namespace · key` for METAFIELD, the product/variant field path for SHOPIFY_FIELD). A pill is deleted **as one unit** with **Backspace / Delete** — there is no ✕ on the pill.
- Values may contain **author-intended hard line breaks** (`LINE_BREAK` parts) on top of automatic soft-wrap, rendered identically in the editor and on the storefront.
- Row count indicator — `Rows: N / 200`; hard-block at the 200-row cap (no early-warning threshold).
- **Undo / Redo (MVP)** — available while editing.

### Tab 2 — Style

Rendered in the **left controls panel** beside the live table (see Layout). The control widgets shown in the mockup are **illustrative** — the schema-backed spec (mapped to `TableStyling`) is:

- Color controls: **section-header background**, label background, value background, border color, label text color, value text color (six independent colors). _(Mockup shows these as swatch rows; "Section header" maps to `TableStyling.headerBgColor`.)_
- Font size — Small / Medium / Large, with **theme-inherit as the unset default** (`fontSize` null = inherit). _(Mockup shows an S / M / L segmented control; it omits an explicit "Inherit" segment because inherit is the default state.)_
- Font weight / style — `TableStyling.fontWeight` / `fontStyle`. _(Mockup shows a "Label weight" Regular / Medium / Bold segmented control; whether weight applies to the label only or label + value is not yet locked.)_
- Column width — a single **label-width %** slider (value % = 100 − label %), persisted as `TableStyling.labelWidthPct`.
- "Reset to theme defaults" link — retained from the original spec (not drawn in the mockup); confirm before building.
- All styling changes apply live to the WYSIWYG editor table — no save required (saving persists `TableStyling`).

### Tab 3 — Settings _(Spec-Editor Mockup sync 2026-06-21)_

Rendered in the **left controls panel** beside the live table (see Layout). The mockup populates it with two groups; treat the specific controls as **illustrative placeholders** pending real definition:

- **Product assignment** — the planned home for assignment (see Screen 4). Design direction: let merchants assign a template (to specific products or by product type) from inside the editor, so a template and its assignment are managed in one place. _(Not fully locked — whether this fully replaces the standalone `/assign` screen or coexists with it for conflicts + summary is an open question; tracked in `progress-tracker.md`.)_
- **Display rules** — toggles shown in the mockup (e.g., _hide rows with empty values_, _show section dividers_, _show on mobile_). These are **dummy/illustrative** and **not yet specified or schema-backed**. Note: row-level empty-hiding already exists as the per-row `hideWhenEmpty` flag (`data-model.md` §7) plus the PRD's storefront auto-hide — a template-level toggle would need its own definition. Do not build these until defined (open questions in `progress-tracker.md`).

A note in the panel reminds that **template status (Draft / Active) lives in the page header**, not in Settings.

**State to read/write:** `Template` (rows JSON, status, name), `TableStyling`

---

## Screen 4 — Product Assignment `/app/templates/:id/assign`

> **Planned relocation (Spec-Editor Mockup sync 2026-06-21).** The design direction is to surface this assignment UI **inside the editor's Settings tab** (Screen 3 → Tab 3) so merchants manage a template and its assignment in one place. This is **not fully locked**: the open question is whether the standalone `/assign` route is **retired** (everything folds into the Settings tab) or **kept** as a deep view for the conflict warning + assignment summary, which are awkward to fit in the compact Settings panel. The **functionality below still applies wherever it lands.**

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
| 3    | Template Editor — Content tab only      | Core of the vertical slice                    |
| 4    | Save template to Postgres               | Makes data real                               |
| 5    | Sync to Shopify metaobject              | Unlocks storefront rendering                  |
| 6    | Theme App Extension — render table      | Completes the vertical slice                  |
| 7    | Product Assignment (editor **Settings** tab; see Screen 4 note) | Connects template to products                 |
| 8    | Template Editor — Style tab             | Polish after slice is working                 |
| 9    | Dashboard + onboarding checklist        | Only useful once everything above works       |
