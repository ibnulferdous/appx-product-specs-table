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
- Onboarding checklist — four steps rendered as a `VerticalStack` of `Card` rows, in first-run execution order:
  1. ✅ / ⬜ **Create your first template** → opens the editor at `/app/templates/new`
  2. ✅ / ⬜ **Save the template** → persists the first `Template` row (create-on-first-save; see completion signals)
  3. ✅ / ⬜ **Assign the template to a product** → opens the assignment UI (destination intentionally **unlinked** until the route is locked — see note)
  4. ✅ / ⬜ **Add the app block to your theme** → opens the Shopify theme editor deep link
- Each completed step shows a green checkmark and is non-interactive
- Progress indicator: "X of 4 steps complete"

> **Step order rationale.** This follows the PRD core user flow (create → save → assign → add app block → live). The app block step is **last** because the storefront table renders nothing until a template is `ACTIVE` and assigned — front-loading it would show the merchant an empty block.

**Completion signals** — each checkmark must be driven by a real, server-verifiable state, never by mere intent (e.g. "clicked Create"):

| Step                       | Marked ✅ when                                                                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create your first template | `Shop.onboardingStatus` has advanced to `IN_PROGRESS` — set the first time the merchant opens the editor (`/app/templates/new`). This is the lone "intent" step and gates nothing downstream.                                |
| Save the template          | The shop has **at least one persisted `Template`** (`Template` count ≥ 1). Under **create-on-first-save** the DB row exists only after the first Save, so this — not opening the editor — is the real "a template exists" signal. |
| Assign the template to a product | At least one `ProductAssignment` exists for the shop (equivalently, one `ProductAssignmentIndex` row with `status = APPLIED`).                                                                                          |
| Add the app block to your theme | `Shop.isAppBlockActive` is `true`.                                                                                                                                                                                       |

> **Assignment step — deferred deep link.** Step 3 deliberately does **not** hard-link to `/app/templates/:id/assign`. Assignment is moving into the editor's **Settings tab**, and whether the standalone `/assign` route survives is still an open question (see the Route Map note above, Screen 4, and `progress-tracker.md`). Wire this step's destination only **after** that question is locked, to avoid pointing onboarding at a route that may be retired.

---

### State B — Onboarding just completed (one-time transition state)

Shown once when all four steps are marked done and `Shop.onboardingStatus` flips to `COMPLETED`.

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

- Page title: "Templates" + primary action: "Create template" → opens the **style preset gallery popup** first (pick a preset, or "Start with your theme's styles"), then `/app/templates/new` seeded with the choice _(Style-tab spec 2026-07-18 — see Screen 3 → Tab 2 → Preset gallery popup)_
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

**Purpose:** The core screen. Build or edit the template — rows, section headers, data sources, and styling — with the **device previews** showing exactly how the storefront table renders.

> **CORRECTED 2026-07-20 (feature 57 Step 12).** The four paragraphs below originally described the **editing grid** as the live styled surface — "renders exactly like the storefront table", "is itself the live preview", "the still-live table". **That was built, rejected, and reverted** (`context/features/67-…`). The binding rule now is: **the Edit grid is a fixed editing surface and never reflects merchant styling; the Desktop / Tablet / Mobile previews are the only place Style and Settings changes appear.** These sentences are corrected rather than annotated, because the step was withdrawn outright — see Step 11's replacement (`context/features/68-…`), which opens the Style tab on a Desktop preview for exactly this reason.

**Layout:** An editor card whose **control row** carries the tab group on the left — **Content · Style · Settings** — and the view toggle on the right. The editing table renders in a fixed editing style at all times; `TableStyling` is applied in the **device previews**, not in the grid.

- **Content** tab → the table fills the full width of the card (no side panel).
- **Style** and **Settings** tabs → a **left controls panel (~300px)** appears beside the stage, and the stage opens on a **Desktop preview** so the merchant sees their changes as they work. This is a _controls_ rail; the surface it drives is the preview, not the editing grid.

The view toggle has four mutually-exclusive segments — **Edit** (pencil + label), a divider, then **Desktop / Tablet / Mobile**. **Edit** is the only editable view; **Desktop / Tablet / Mobile** are read-only previews of how the table renders for shoppers at that width (mobile shows the stacked label-over-value layout). In a device view all editor chrome is hidden (toolbar, hint, gutter, add-row, edit box, field picker) and the gutter column collapses. _(View Toggle Decision, Session 2026-06-14 — supersedes the earlier "fully editable in every viewport" wording; the mockup's CSS confirms the read-only device previews.)_

**Primary components:** App Bridge **contextual Save Bar** (`ui-save-bar`), Polaris web components for the page header / tab group / segmented toggle / panel controls (`s-page`, `s-button`, `s-select`, `s-menu`, `s-banner`, …), and the custom React spec-table grid.

### Top bar _(Spec-Editor Mockup sync 2026-06-21 — adopts the mockup's save/status model)_

- **Page header:** breadcrumb (Home → **Templates** → template name) with the template **name as the page title (H1)**. Renaming is offered as an inline title edit / a **Rename** action in the ⋯ menu (exact affordance is a small open detail).
- **Status dropdown** (page header, right): a button showing the current status with a colored dot — **Draft / Active / Archived** — opening a menu to change it. Status is now **independent of saving** (no "Save as draft").
- **⋯ More-actions menu** (page header, right): overflow for actions such as Duplicate, Archive, Delete, Rename.
- **Contextual Save Bar** (App Bridge): when there are unsaved edits, the admin's contextual save bar shows **"Unsaved changes"** with **Discard** and **Save** — this _is_ the unsaved-changes indicator. In-page Save buttons and the separate **"Save as draft"** button are removed.

### Tab 1 — Content (default tab)

The rows-and-sections editor — where most of the work happens. (Labeled **Content** in the editor tab bar.)

- Custom React editor grid — each data row is **gutter · Label | Value**; the row's gutter pairs a select checkbox (for bulk delete), a persistent ⠿ drag-handle, and an ✕ delete. There is no separate "Type" column — row type is conveyed visually. _(Reshell A1, 2026-06-22: the Label/Value column header row was **removed** per a merchant request to free vertical space; column alignment is carried by shared grid templates on each row, not a header. The earlier "sticky header" wording is superseded.)_
- Row types: `DATA` and `SECTION_HEADER` — visually distinct. A section renders as a single full-width, uppercase header with a small leading ▸ caret that is **decorative only** — sections are not collapsible groups and do not carry child rows (see the drag note below).
- Inline editing of the label per row; the value is an inline token editor (below).
- **Value editing — manual text + dynamic-field pills on one shared surface.** The value cell is a single inline editable surface holding plain `TEXT` and atomic dynamic-field **pills** (`SHOPIFY_FIELD` / `METAFIELD`). Manual text is typed directly. Dynamic fields are added with **pick-then-insert**, not a per-row picker:
  - Place the caret in a value, then click **Insert field** in the toolbar (disabled when there is no active caret in a value cell). This opens a focus-trapped **modal** listing native Shopify fields and the shop's metafields, with a search box over both. _(The mockup groups the choices as **Product / Variant / Metafield**; the shipped build renders the native fields as one flat searchable list followed by a metafields section — the grouping is a design reference, not a hard requirement.)_
  - Pick a field, then **Insert** → a complete pill drops at the saved caret. **Cancel / Esc / outside-click** inserts nothing.
  - **Click an existing pill** to reopen the same modal pre-filled → **Update** replaces the field (Cancel leaves it untouched). One modal serves create and edit.
- **Toolbar above the table** — **Add row** (primary), **Add section**, **Duplicate** (each inserts directly below the active row, appends if none, scrolls it into view; the active row, set on click/focus, is shown with a left accent), a separator, then **Insert field** and the row-count indicator. When one or more rows are selected, a contextual **bulk-action bar** (Select all / Delete) takes over the toolbar's left side. _(Reshell A1 removed the one-line hint that used to sit under the toolbar; discoverability tips now live in a **manual-advance tips footer below the editor card** — feature 32.)_
- A full-width "+ Add row" at the bottom always appends to the end.
- Drag-and-drop row reordering (via @dnd-kit, keyboard-accessible). Sections are ordinary rows in the same array and drag exactly like data rows — a section is **not** a group, so moving it does not carry child rows with it.
- Paste a multi-cell table copied from any website, Excel, or Google Sheets to bulk-create rows — first pasted column → label, remaining columns → manual TEXT value; 200-row cap enforced on paste.
- Dynamic-field tokens render as **link-styled smart pills** while editing — blue link-like text reading **"Metafield · {key}"** or **"Field · {name}"**, a light background on hover and when the caret sits beside the token, and a tooltip carrying the fuller source (`namespace · key` for METAFIELD, the product/variant field path for SHOPIFY_FIELD). A pill is deleted **as one unit** with **Backspace / Delete** — there is no ✕ on the pill.
- Values may contain **author-intended hard line breaks** (`LINE_BREAK` parts) on top of automatic soft-wrap, rendered identically in the editor and on the storefront.
- Row count indicator — `Rows: N / 200`; hard-block at the 200-row cap (no early-warning threshold).
- **Undo / Redo (MVP)** — available while editing.

### Tab 2 — Style _(spec locked 2026-07-18 — supersedes the mockup's illustrative widgets and the earlier colors-only control list)_

Rendered in the **left controls panel** beside the stage (see Layout). Design model: **one spec-table primitive with orthogonal style knobs** — there are no monolithic "layouts". Every real-world archetype (Best Buy striped, Amazon accordion, Dell stacked, StarTech banded) is a combination of the knobs below. All knobs are **real columns on `TableStyling`** (`data-model.md` §5); all changes apply live to the **device previews** (never to the editing grid) and ride the contextual SaveBar (Save persists, Discard reverts — which also gives preset application free undo, so no confirm dialog is needed when a preset overwrites current knobs).

**Styling is per-template with COPY semantics** (locked 2026-07-18 — rationale + consequences in `data-model.md` §5). Choosing a preset copies its values into the template's `TableStyling`; the template owns its style independently afterwards. No template→preset link, no shop-level default styling record. Retroactive restyling of many templates arrives post-MVP as an explicit **apply-to-all bulk action** on a future app-settings route (see PRD Out of Scope).

#### Preset gallery popup (on template creation)

- Triggered by **Create template** (Screen 2): a popup shows styled **mini-table previews** — the built-in presets plus (phase 2) the merchant's saved presets — rendered from real knob bundles via the existing preview renderer over sample rows.
- **Skippable is first-class**: a "Start with your theme's styles" option creates the template with **no styling overrides** (pure theme inherit — the PRD's zero-config promise). The popup must never be a styling gate on creating a template.
- Picking a preset seeds the new editor's **client styling state**; the `TableStyling` row is written on first Save (create-on-first-save extends to styling — no DB footprint for an abandoned scaffold).
- **Built-in presets are code constants** (stable ids), not DB rows. MVP set — exact knob bundles to be locked at build time (open question in `progress-tracker.md`):
  - **Classic** — two-column · line dividers · text-only section headers _(the default)_
  - **Striped** — two-column · zebra stripes
  - **Banded** — two-column · line dividers · filled section-header bands
  - **Stacked** — label-on-top · whitespace separation
  - **Accordion** — Classic + collapsible sections

#### Style rail (top → bottom, disclosure groups)

> ⚠️ **Group structure superseded 2026-07-26 by feature 86 (`context/features/86-…`).** The list below is the ORIGINAL grouping and is kept for the per-knob detail, which is all still accurate — domains, the alpha lock, the 10–184 ceiling, the `fontWeight` scope resolution. **The grouping itself is not.** The rail shipped with six groups cut on TWO axes at once: four by OBJECT (Layout / Size & frame / Sections / Rows) and two by CSS PROPERTY (Colors / Typography). That put `headerBgColor` ~20 controls from the select that makes the band visible and left the label column with its weight in Typography, its colors in Colors, and no group of its own.
>
> **The rail now carries EIGHT groups cut on the object axis alone**, each ending with its own colors ("structure knobs, then colors"):
>
> | # | Group | knobs |
> | --- | --- | --- |
> | 1 | Table layout | `rowLayout` · `gridMinColumnWidthPx` · `mobileLayout` · `labelWidthPct` |
> | 2 | Table size & frame | `tableMaxWidthPx` · `tableAlign` · `outerBorderWidthPx` · `outerBorderRadiusPx` · `outerBorderColor` |
> | 3 | Table text | `fontSize` (+ Custom px) · `fontStyle` · `lineHeight` |
> | 4 | Section headers | `sectionHeaderStyle` · `headerFontSizePx` · `headerFontWeight` · `headerCase` · `headerPaddingBlockPx` · **`sectionGapPx`** · `headerBgColor` · `headerTextColor` |
> | 5 | Collapsible sections | `sectionsCollapsible` · `sectionsInitialState` |
> | 6 | Rows | `rowDividerStyle` · `columnDividerStyle` · `density` · `stripeBgColor` · `borderColor` |
> | 7 | Labels | `fontWeight` · `labelCase` · `labelBgColor` · `labelTextColor` |
> | 8 | Values | `valueBgColor` · `valueTextColor` |
>
> ⚠️ **Amended 2026-07-28 by feature 94 (`context/features/94-…`): `sectionGapPx` moved 5 → 4**, so Section headers is 8 knobs and Collapsible sections is 2. The gap sat with the collapsible switch while it was reachable only with disclosures on; feature 94 made it work in the STACKED and GRID flat layouts too, at which point it stopped being a property of collapsing and became a property of the section headers it separates — the object axis deciding its own placement. Collapsible sections still leads with an ungated switch, so it cannot render as a heading fencing nothing.
>
> Placement is decided by **where the CSS var lands**, not by what the control sounds like — `font-size`/`font-style`/`line-height` sit on `.appx-spec-table__table` (Table text) while `font-weight`/`text-transform` sit on `.appx-spec-table__label` (Labels). Verify against `spec-table.css` before filing a new knob.
>
> Also superseded: **Colors is "seven swatches" below; there are NINE.** `headerTextColor` (feature 81) and `outerBorderColor` (the table outline) landed after this spec was written. The alpha lock still holds as stated — on for the surface colors, off for the text colors.
>
> **Style presets (item 1) still sits ABOVE all eight groups** when B2 lands; feature 86 deliberately preceded B2 so presets arrive onto an organised rail rather than adding a group to a disorganised one.

1. **Style presets** — the same preset cards in-editor: clicking one **overwrites the knobs in editor state** (copy; undoable via SaveBar Discard). Show a "Customized" hint once knobs diverge from the picked preset (`basedOnPreset` is provenance only). **Save as preset** _(phase 2)_ promotes the current values into the shop's saved-preset library (`StylePreset`); same-name save = overwrite after confirm — presets are "edited" by save-as-again, never in a separate editor.
2. **Layout** — Row layout: `Two-column | Stacked` (`rowLayout`). Label width % **number field** (bounded 20–80, `%` suffix), **visible for two-column only** (`labelWidthPct`; value % = 100 − label %). _(Amended 2026-07-19, before Step 10's code: this read "slider". **Polaris web components ship no slider/range element** — verified against `@shopify/polaris-types`; the bounded field primitives are `s-number-field` / `s-text-field` / `s-color-field`. A hand-rolled `<input type="range">` would look foreign in a Polaris rail and owe its own a11y pass, so the bounded number field is the locked shape. The intent — a bounded label-width control, two-column only — is unchanged.)_ On mobile: `Stacked (default) | Same as desktop` (`mobileLayout`, meaningful for two-column only — stacked desktop is already stacked everywhere).
3. **Sections** — Header style: `Banded | Underlined | Plain` (`sectionHeaderStyle`). _(Amended 2026-07-27, feature 87: this read `Banded | Text only`. "Text only" was a misnomer — that member drops the band but keeps a 2px rule — so a third member `PLAIN` was added for the bare bold title, and the existing member was RELABELLED "Underlined". Wire values unchanged: `TEXT_ONLY` is still `TEXT_ONLY`, so nothing repaints.)_ Collapsible: off/on (`sectionsCollapsible` — storefront renders native `<details>/<summary>`: zero JS, keyboard + SR support for free). Initially: `All open | First open | All closed` (`sectionsInitialState`, visible only when collapsible).
4. **Rows** — Dividers: `Lines | Stripes | None` (`rowDividerStyle`; Stripes paints the `stripeBgColor` surface). Density: `Compact | Default | Spacious` (`density` — a padding scale; values are an open question).
5. **Colors** — **seven** independent swatches: section-header bg (`headerBgColor`), label bg, value bg, **stripe bg** (`stripeBgColor`), border, label text, value text. Each `null` = inherit theme (swatch shows a "Theme" state); set values resolve to CSS variables on the storefront wrapper — single source of truth, see `code-standards.md` → Color & Theming. **Alpha (transparency) is enabled on the five SURFACE colors — header bg, label bg, value bg, stripe bg, border — and disabled on the two TEXT colors** _(locked 2026-07-19)_. Rationale: the stylesheet's own defaults are translucent (`rgba(0,0,0,0.06)` band, `0.04` stripes, `0.1` borders), so an opaque-only picker could not reproduce the default look — a merchant wanting a warmer band would be forced into a solid slab that reads heavier than the surrounding theme. Translucent body text, by contrast, is a contrast/readability bug rather than a feature. `parseColor` already accepts `#rrggbbaa`, so this needs no domain change. **Deliberately NOT handled:** a fully transparent override (`#00000000`) looks identical to the "Theme" (inherit) state on screen. Accepted as a non-problem — it is reachable only on purpose. Note the one place it is visible: a transparent override still writes a DB value and emits a CSS variable, so it is "theme-looking but set" when reading a metaobject.
6. **Typography** _(2026-07-18 addendum — adopts the Horizon theme-editor pattern: preset-first with a Custom escape hatch, bounded segments only, no free-form typography inputs)_ — Font size `Inherit | S | M | L | Custom` (`fontSize`): S/M/L are **theme-relative** presets (em-scale — they scale with the merchant's theme base font); picking `Custom` reveals a bounded px input **clamped to 10–184** (an **absolute** override; the floor is an accessibility guard, the ceiling a taste guard only). _(Ceiling amended 40 → 184 on 2026-07-19, before Step 10's code: **184 is the maximum the Horizon theme editor's own font-size control offers**, and a merchant should not be more constrained in this app than in the theme editor they came from. Note the difference in kind, deliberately accepted: Horizon's is a **discrete preset list** applied to a single heading, while this is a **free numeric range** applied to `.appx-spec-table__table` — so it scales labels and values together and a very large value will overflow its column on narrow viewports. That is the merchant's call, visible immediately, and one control away from undo.)_ **Label weight** Regular / Medium / Bold (`fontWeight`) and style Normal / Italic (`fontStyle`). Line height `Tight | Normal | Loose` (`lineHeight`) — density's vertical-rhythm partner, the key "clean table" knob. Label case `Default | Uppercase` (`labelCase`) — label column only. _(**RESOLVED 2026-07-19 — `fontWeight` applies to the LABEL COLUMN ONLY.** This previously read "whether weight applies to the label only or label + value is still an open detail". It was in fact settled in Step 3 when the stylesheet was written and has shipped that way since: `spec-table.css` puts `--appx-spec-font-weight` on `.appx-spec-table__label`, with the comment "the 600 was always a label-only literal, so the var lands here, not on the table — value text keeps the theme's weight". The control is therefore labelled **"Label weight"**, not "Font weight", so the UI states the scope. The section header's case treatment is likewise confirmed: `.appx-spec-table__section` sets `font-weight: 700` as a literal and takes no case var, so `labelCase` never touches it. Do not "complete" this by extending either var to the value cell or the section header — that would change every merchant's live table.)_ **Deliberately not adopted from Horizon** (option-overload guard): font-family picker, letter spacing, wrap control, per-side px padding (density covers it).
7. **Reset to theme defaults** — clears every override (knobs to defaults, colors to null). Confirm before clearing.

#### Build sequencing (Phase B slices)

1. **B1 — knobs + rail + rendering:** `TableStyling` columns (`add-table-styling` migration), the rail controls, live application **in the device previews**, metaobject `styling` serialization, storefront modifier classes + CSS variables.
2. **B2 — preset gallery:** built-in preset constants + the creation popup + in-rail preset cards.
3. **B3 — saved presets** _(cuttable to post-MVP without rework)_: `StylePreset` model + "Save as preset" + saved styles in the gallery.

### Tab 3 — Settings _(Spec-Editor Mockup sync 2026-06-21)_

Rendered in the **left controls panel** beside the stage (see Layout). The mockup populates it with two groups; treat the specific controls as **illustrative placeholders** pending real definition:

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
- The whole admin reflects Shopify's Polaris design system — color comes from Polaris tokens, not an invented palette — so merchants feel they are inside Shopify, not a third-party app (see `code-standards.md` → Color & Theming)

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
