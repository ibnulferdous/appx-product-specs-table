# Progress Tracker

Update this file after every meaningful implementation change.

> **Forward-looking status doc, kept compact.** Per-step detail (verification logs,
> file lists, decisions) lives in `context/features/NN-*.md` and git history — link
> there, don't re-narrate. Each completed item is one line + its feature-doc pointer.

---

## Current Phase

Building the MVP.

## Current Goal

**Reshell Phase B2 — the built-in preset gallery (Style tab feature 57, steps 13–14).**

Everything upstream is done and live-verified on the dev store:

- **Custom spec-table editor** — 13-step build + Step 9.5 (features 02–15).
- **Reshell Phase A** — editor reshelled to the mockup (features 16–18).
- **Editor / templates-list slices** — paste refinements, list polish, bulk delete +
  Undo, keyboard cell navigation, lifecycle / create-on-save (features 19–33).
- **Storefront pipeline** — Theme App Extension renders a product's assigned spec table
  live; dynamic `SHOPIFY_FIELD` / `METAFIELD` parts resolve (features 34–35).
- **Product assignment engine (37–48)** — merchant-complete end to end: broad +
  multi-value scopes (PRODUCT / COLLECTION), EXCLUDE carve-outs, block-on-conflict
  activation gate, shop-level routing metafield, 3-tier storefront resolution, dynamic
  assigned-product count.
- **Reshell Phase D — device previews (49–56)** — read-only Desktop / Mobile storefront
  previews in the editor (tablet removed 2026-07-22).
- **Reshell Phase B1 — Style tab knobs / rail / rendering (57–69, steps 1–12), COMPLETE
  2026-07-20** — every field in `STYLING_FIELD_NAMES` has a control, rides the SaveBar,
  persists to `TableStyling`, serializes to the metaobject, and renders on the storefront;
  rail a11y pass done; Reset-to-theme-defaults ships; docs reconciled.

Test suite ~837 tests / 36 files; full gate (typecheck · lint · format · test · build) green.

**Next:** B2 = steps 13–14 (built-in preset gallery: `stylePresets.ts` constants, rail
preset cards, skippable creation-gallery popup — **copy** semantics into real `TableStyling`
columns, `basedOnPreset` as provenance only). `basedOnPreset` / `extraStyles` exist in the
schema, deliberately unwritten until Step 13. Then Phase C (Settings display rules) → E
(assignment folded into the reshell) → F (top-bar status/save model + cleanup). 14-step
plan: `~/.claude/plans/style-tab-phase-b-implementation-plan.md` (1–12 = B1, 13–14 = B2,
15+ = B3 saved presets, cuttable).

### Binding rules (do not violate)

- 🚫 **The Edit grid never reflects merchant styling.** It is a fixed editing surface; the
  Desktop / Mobile previews are the *only* place Style / Settings changes appear (they are
  storefront-faithful). Step 11 as originally planned ("live styling on the editing grid")
  was built, rejected on review, and fully reverted — see `context/features/67-…`.
  `SpecTableEditor.module.css` + `RowGrid.tsx` are tripwired byte-clean against sign-off `a7b304c`.
- **No contrast checking ships** (decided 2026-07-20): the app can't compute contrast (null
  colours inherit unknown theme values; alpha is enabled on background knobs), so any signal
  would be a guess. Don't reintroduce without a new decision.
- **Server precomputes styling; Liquid only prints** — the sync writes derived
  `styling_css {classes, vars}`; the Liquid block carries no styling logic, so a new knob
  needs no storefront work (the pipe is total over `StylingValues`).

---

## Completed

> One line per unit. Detail → the linked `context/features/` doc + git history.

**Style tab — Reshell Phase B1 (feature 57, steps 1–12; docs `57-…`–`69-…`)**
- Step 1 (`57-…`): pure styling domain `app/utils/tableStyling.ts` — allowed-value arrays,
  `StylingValues`, `DEFAULT_STYLING_VALUES`, tolerant `parseStylingValues` (never throws),
  overrides-only `serializeStylingOverrides`, `stylingEquals`.
- Step 2 (`58-…`): pure presentation mapping `app/utils/tableStylingCss.ts` —
  `stylingToCssVars` (nullable→CSS var) / `stylingToModifierClasses` (knob→BEM modifier) /
  `formatCssVarDeclarations` / frozen `SPEC_TABLE_CSS_VARS`; one translation layer, no drift.
- Step 3 (`59-…`): storefront `spec-table.css` rewritten to `var(--appx-spec-*, <literal>)`
  + one dormant rule set per modifier + the `--mobile-stacked` @media default; byte-exact
  drift guard (`specTableCssContract.test.ts`, `previewStyles.ts` copy).
- Step 4 (`60-…`): `add_table_styling` migration + server persistence — `TableStyling`
  (override columns, NULL=default), `stylingToDbColumns`, nested shop-scoped upsert, lazy row.
- Step 5 (`61-…`): engine styling state + Row-dividers control + Save round-trip;
  `editorSnapshot.ts` unifies the dirty baseline + submit snapshot.
- Step 6 (`62-…`): live styling in the device previews (first consumer of the Step 2 mapping).
- Step 7 (`63-…`): metaobject serialization + Liquid emission — pipe complete to the live
  storefront; new metaobject `styling_css` field; status-change re-sync hazard closed.
- Step 8 (`64-…`): the four remaining non-structural keyword knobs (row layout / on-mobile /
  section headers / density) — zero non-UI diff.
- Step 9 (`65-…`): collapsible sections — the only B1 step to change markup
  (`<details>/<summary>`, one `<table>` per section, native keyboard, per-section `aria-label`).
- Step 10 (`66-…`): Colors + Typography — the last knob-adding step; nullable "inherit"
  vocabulary; `FONT_SIZE_PX_MAX` raised 40→184; every `STYLING_FIELD_NAMES` field now has a control.
- Step 11 (`68-…`): reveal a preview when the merchant opens the Style / Settings tab
  (per-tab view memory, `tabViewMemory.ts`). *(NOT the withdrawn "style the grid" step — `67-…`.)*
- Step 12 (`69-…`): Reset-to-theme-defaults + rail a11y (help text on `details`, real group
  headings, named landmark) + docs reconciliation. **Phase B1 complete.**
- Resolved en route: the section-header BANDED band is the intended default becoming
  reachable, not a regression (accept; Step 7 signed off).

**Editor device-preview mockups (feature 72, doc `72-…`) — ✅ shipped & verified 2026-07-22**
- The Desktop/Mobile previews now render inside a device mockup: Desktop = a browser
  window (traffic-light dots + faux address pill, auto-height, fills the column); Mobile =
  a light, thin phone frame (subtle border + speaker pill) whose screen fits the available
  viewport height (`useScrollRegionHeight`), capped at a phone-shaped max (2026-07-23
  follow-up: pure `phoneScreenHeight` + `PHONE_SCREEN_MAX_PX` 812 in `deviceView.ts`, so a
  tall monitor no longer stretches the phone), and scrolls internally. Device shadows are
  sized to fade out INSIDE `.stage`'s padding (it clips: `overflow-x: auto` ⇒ both axes),
  geometry centralized as `--appx-device-shadow-offset/-blur`. Chrome wraps the iframe
  in a new `DevicePreview.module.css` (all colours as centralized custom props);
  the iframe pipeline (renderer, height shim, sandbox, live styling) and the tripwired
  `SpecTableEditor.module.css` are untouched. Live-verified on the dev store.

**Editor sidebar inner-scroll (feature 71, doc `71-…`) — ✅ shipped & verified 2026-07-22**
- Style/Settings rail now scrolls internally (bounded to the iframe viewport via the
  reused `useScrollRegionHeight` + a new `EditorShell.module.css` `.railScroller`) so the
  long Style rail no longer scrolls the preview off-screen. **Only the rail scrolls**
  (merchant choice); preview keeps natural height. Tripwired `SpecTableEditor.module.css`
  / `RowGrid.tsx` untouched. Full gate green; live-verified on the dev store (Style rail
  scrolls to "Reset to theme defaults" with preview anchored; Settings same; Content unchanged).

**Device previews — Reshell Phase D (feature 49, steps 1–8; docs `49-…`–`56-…`)**
- Read-only Desktop / Mobile storefront previews in the editor: toggle swaps the stage (1),
  pure storefront-markup renderer (2), sandboxed iframe (3), shared `spec-table.css` via a
  drift-guarded string copy (4), device-width sizing (5), content-driven auto-height via
  `allow-scripts` + `postMessage` (6), a11y / read-only / empty-state / dynamic-pill (7),
  docs + sign-off (8). **Tablet removed 2026-07-22.**

**Product assignment engine — features 37–48 (merchant-complete)**
- 37 (`37-…`): data foundation — `add-assignment` migration, `ProductAssignment(Index)`,
  `assignmentScope.ts`, shop-scoped `assignment.server.ts`.
- 38 (`38-…`): pure scope-overlap resolver (`assignmentOverlap.ts`, set-algebra).
- 39 (`39-…`): cross-dimension existence probe (`assignmentConflict.server.ts`,
  `products(query,first:1)`, fails closed, injection-safe).
- 40 (`40-…`): routing-projection builder + `add-routing` migration (`ShopStorefrontRouting`).
- 41 (`41-…`): shop routing metafield writer + `[shop.metafields.app.routing]` TOML (deployed).
- 42 (`42-…`): activation pipeline + DRAFT→ACTIVE dry-run gate wired into both status surfaces
  (atomic block on conflict, routing rebuild on ACTIVE-set change).
- 43 (`43-…`): storefront 3-tier resolution (`spec-table-resolve.liquid`: override →
  byProduct → exclude gate → broad tiers → default handle).
- 44 (`44-…`): scope-picker UI + rich conflict banner (`SettingsTab.tsx`; gate over PENDING scope).
- 45 (`45-…`): EXCLUDE carve-outs (all-products-except-X; gate subtraction; storefront reorder).
- 46 (`46-…`): multi-value scopes — server (1..N INCLUDE for PRODUCT/COLLECTION; Decision C).
- 47 (`47-…`): multi-value scopes — UI (multi-select picker → chip cards, full-set loader).
- 48 (`48-…`): templates-list dynamic assigned-product count (per-scope, batched Admin query, fail-soft). _Live-render on the dev store still pending._

Design lock (2026-07-07, `data-model.md` §5/§9): **rigid block-on-conflict**, one scope per
template (all / product / type / vendor / collection), no `priority`; broad rules via one
shop-level routing metafield resolved in Liquid by handle; per-product `metaobject_reference`
only for bounded overrides. Materialization (`ProductAssignmentIndex`) deferred post-MVP.
Multi-value applies to PRODUCT + COLLECTION only. No migrations needed for the 45–48 series.

**Storefront (features 34–35)**
- 34 (`34-…`): Theme App Extension first pixel — `extensions/product-specs-table/`, declarative
  TOML metaobject + `metaobject_reference` product metafield (both `public_read`), semantic `<table>`.
- 35 (`35-…`): value-part resolution — `spec-table-value.liquid` resolves
  `SHOPIFY_FIELD` / `METAFIELD` / `TEXT` / `LINE_BREAK`; whole-cell `hideWhenEmpty`; 50-row chunking.

**Editor build — 13-step order + Step 9.5 (features 02–15)**
- Step 1 (`02-…`): `app/utils/rows.ts` reducer + static rows + add/delete/duplicate + 200-row cap (`MAX_TEMPLATE_ROWS`).
- Step 2 (`03-…`): segmented value cell + pills + toolbar + row gutter; `afterId` insert; `ADD_SECTION`.
- Step 3 (`04-…`): review & harden Steps 1–2 (comment-only fixes; not-fixed items → "Step 3 Follow-ups").
- Step 4 (`05-…`): single contenteditable value surface — linear caret model (`valueParts.ts` + `valueDom.ts`); inline pills; `LINE_BREAK`; `INSERT_VALUE_PART_AT`.
- Step 5 (`06-…`): "Insert field" modal shell + caret save/restore (App Bridge `shopify.modal`).
- Step 6 (`07-…`): native Shopify fields list (`shopifyFields.ts`) + create/edit modal; `SET_VALUE_PART`.
- Step 7 (`08-…`): modal search/filter (`filterNativeFields`); deferred auto-focus.
- Step 8 (`09-…`): fetch product metafield definitions (`metafieldDefinitions.server.ts` + resource route); shop isolation.
- Step 9 (`10-…`): selectable metafield section → real `METAFIELD` pill (`filterMetafieldDefinitions`).
- Step 9.5 (`11-…`): Save → Postgres → app-owned metaobject sync → read-back. `rowsSerialize.ts` (server-authoritative key finalization); `metaobjects.server.ts` (`$app:appx_spec_table`, PUBLIC_READ); contextual SaveBar + dirty baseline.
- Step 10 (`12-…`): mouse drag reorder (`@dnd-kit`; pure `MOVE_ROW`).
- Step 11 (`13-…`): keyboard reorder + a11y (`KeyboardSensor`, SR announcements). Closes reorder.
- Step 12 (`14-…`): parse pasted clipboard tables (`clipboardTable.ts` + `clipboardTableDom.ts`); log only.
- Step 13 (`15-…`): bulk-insert rows from paste (`gridToPastedRows` + `PASTE_ROWS`, cap-truncated). Closes clipboard paste.

**Reshell to the mockup — Phase A (features 16–18)**
- A2 (`16-…`): presentational `EditorShell` chrome (segmented tabs + device toggle + sidebar slots).
- A3 (`17-…`): bounded inner-scroll — only the rows list scrolls (`useScrollRegionHeight` + sticky header).
- A1 (`18-…`): extracted `useRowEngine` + presentational `ContentTab`/`RowGrid`/`RowActionsToolbar`/`InsertFieldModal`; `SpecTableEditor` now a thin wrapper. Behavior-preserving. **Closes Phase A.**

**Template lifecycle + templates-list (features 19–28 + trims)**
- Create-on-first-save (`19-…`): "Create template" opens the editor seeded with a starter scaffold; Postgres row created on first Save.
- Lifecycle actions (`20-…`): header ⋯ Rename/Duplicate/Delete + status badge; `duplicate`/`delete` server fns; metaobject deleted before Postgres.
- Paste refinements 1–4 (`21-…`–`24-…`): content-first intent, insert-after-active, replace-pristine-scaffold, confirm-before-cap.
- List polish (`25-…`–`28-…`): 2-line name clamp, per-row ⋯ menu, immediate Rename, client-side status filter (`templateFilter.ts` + `shouldRevalidate`).
- Name cap raised 100 → 255 (internal-only, not synced to storefront).
- Duplicate in-flight feedback (App Bridge global loading), shared-fetcher `busy` race gate, SaveBar-hide before Delete redirect.

**Editor bulk delete (`29-…`, `33-…`)**
- Per-row select checkbox + contextual bulk bar + count-gated confirm modal; pure `DELETE_ROWS`; tristate "select all" header checkbox; selected-row highlight.
- Undo toast (`33-…`): pure `RESTORE_ROWS` restores the exact pre-delete snapshot; 10s "Undo"; `savingRef` guard so Undo can't mutate during a save.

**Keyboard cell navigation (`30-…`–`32-…`)**
- Pure vertical-nav resolver `gridNav.ts` → keyboard/DOM wiring `useGridKeyboardNav.ts` (`Ctrl/Cmd + Arrow`) → manual-advance editor tips footer (WCAG-safe, no auto-rotate).

**Template status change (`36-…`)**
- Status (DRAFT/ACTIVE/ARCHIVED) changeable from two surfaces (list ⋯ modal + editor Settings tab); both re-sync the storefront metaobject. Shared `validateTemplateStatus`, `setTemplateStatusForShop`, extracted `templateSync.server.ts`.

**MVP UI trims (2026-07-11/12, UI-only projections)**
- Scope picker offers only No products / All products / A specific product (`HIDDEN_SCOPE_KINDS` + `VISIBLE_SCOPE_OPTIONS`; full source of truth unchanged).
- Status picker + list filter offer only Draft / Active (`HIDDEN_STATUS_VALUES`, `STATUS_FILTER_OPTIONS`); `ARCHIVED` re-enable is a one-line removal; badge tone kept.
- Editor page width → `inlineSize="large"` to match the templates list.

**Foundation**
- Shopify app template (React Router / TS) + PostgreSQL (Neon) + Prisma; app installed on the dev store; session + shop record in Neon.
- Shop-scoped `app/models/template.server.ts` (`shopId` in every where/data); `/app/templates` read-only list; single dynamic editor route `app.templates_.$id`.

**Testing & tooling**
- Phase 1 unit tests (Vitest, standalone `vitest.config.ts`); Phase 2 shop-isolation tests (mocked Prisma).
- CI gate (`.github/workflows/ci.yml`: typecheck → lint → format:check → test → build), Dependabot, `context/app-store-review-checklist.md`.
- Dependency security pass (`npm audit` → 0); CodeRabbit review fixes (shop-scoped writes, `:focus-visible` ring, `updateMany`→`update`).

---

## Next Up

1. **Reshell Phase B2** — built-in preset gallery (Style tab steps 13–14; new feature-doc number, 73+, since 70 = stacked-semantics, 71 = sidebar inner-scroll, 72 = device-preview mockups). Then C (Settings display rules) → E (assignment into the reshell) → F (top-bar status/save + cleanup).
2. **Storefront table semantics in stacked layouts (feature 70)** — code shipped; screen-reader pass still owed (see Open Questions).
3. **Templates-list Phase 2** — search / sort / pagination (server-side, with pagination) when the list can grow large; multi-select bulk actions later.
4. **Pre-submission** — mandatory privacy webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) + Billing (`prd.md`, `context/app-store-review-checklist.md`).

**Deferred:** editor bulk-delete range-select (Shift+click) + Delete/Backspace shortcut; per-product overflow materialization + a bulk apply-to-all styling route.

---

## Step 3 Follow-ups (tracked)

- **[Later, low priority] `insertActive` optimism at the cap.** `insertActive` sets `scrollTargetRef`/`activeRowId` before the reducer runs; at the cap the reducer no-ops, so they can point at a never-added row. Unreachable today (buttons disabled at cap); guard on `!atCap` if a future keyboard/programmatic add bypasses the disabled button.

---

## Open Questions

- 🔴 **Stacked-mode `<table>` semantics — screen-reader pass NOT run (feature 70).**
  `rowLayout=STACKED` and the mobile stacked layout apply `display: block`, dropping implicit
  table semantics. Code shipped 2026-07-20 (`f6ac4aa`): a static unconditional ARIA role chain
  (`role="table"/"row"/"cell"`) in both hand-mirrored markup sites, plus `specTableAriaContract.test.ts`
  which parses `spec-table.css` for `display: block` rules and fails if any such class lacks a role.
  Attributes are present and inert live (zero visual change by construction). **Done-when #4 of
  `70-…` is unmet:** no assistive tech has confirmed the pairs are announced, and the spec's
  **falsifier** is unchecked — explicit ARIA can *suppress* native table affordances, so the
  two-column control case must be compared before/after. Needs NVDA or VoiceOver at desktop **and**
  ≤749px. **If it regresses, revert (`<dl>` back on the table) — do not patch.**
- **Settings-tab "Display rules"** (mockup's `hide rows with empty values` / `show section dividers` / `show on mobile`) are dummy — each needs a real definition + reconciliation with the per-row `hideWhenEmpty` flag before building (Phase C).
- **Style tab B2/B3 build-time details to lock:** the knob-value bundles for the five built-in presets (Classic / Striped / Banded / Stacked / Accordion); the `density` padding-scale values; save-as-preset overwrite UX + copy; whether the creation gallery gets a "don't show again" escape.
- **Top-bar name-edit affordance:** inline title edit vs a Rename ⋯ item — settle when the top bar (Phase F) is built.
- Best storefront event strategy for selected-variant changes across themes.

---

## Key Decisions (still load-bearing)

> Decisions that still constrain future work. Historical/superseded logs were removed in
> compaction — see git history for the originals.

- **Custom React editor — no AG Grid** (2-column, ≤200 rows, `valueParts` token editor). DnD via `@dnd-kit`. Pill model is **pick-then-insert** (modal outside the contenteditable; never an empty placeholder pill). Row cap is the single shared `MAX_TEMPLATE_ROWS` (UI + server).
- **Value model:** `LINE_BREAK` value part for hard breaks (no inline rich formatting/links in MVP). `hideWhenEmpty` is whole-row, never per-line.
- **View toggle:** Edit is the only editable segment; Desktop/Mobile are **read-only storefront previews** (Phase D), no separate WYSIWYG panel. **Tablet removed 2026-07-22.** **Shared preview device (2026-07-22):** the chosen device (Desktop/Mobile) is one value shared across all three tabs; edit-vs-preview is per-tab (`tabViewMemory.ts` `ViewMemory = { device, modes }`) — Content opens on the grid, Style/Settings auto-open a preview, picking a device on any tab moves every *previewing* tab to it; dropping a tab to Edit affects only that tab and retains the shared device.
- **Color policy:** the app *uses* color via CSS variables as one source of truth (admin mirrors Polaris; storefront inherits theme but is merchant-overridable). The "no hardcoded hex literal" rule is CSS hygiene — use Polaris tokens / `currentColor` / custom properties (e.g. runtime-captured `--appx-token-color` for the pill blue). This rule does **not** encode the Edit-grid-never-styled binding rule (see Binding rules above).
- **Save/status model (mockup):** App Bridge contextual SaveBar (Save/Discard) + header status dropdown + ⋯ menu; no separate "Save as draft". Save freezes the editor (`inert`) in-flight; baseline reset uses the **submitted** snapshot (data-safety race fix).
- **Persistence/keys:** key finalization is **server-authoritative** ("is this row id already persisted?"), never re-derived. Metaobject is **app-reserved** (`$app:appx_spec_table`); deleted *before* Postgres on delete so a storefront-readable entry can't outlive its template.
- **App-owned definitions are declarative TOML** (slice 1): the `$app:appx_spec_table` metaobject and the `$app:spec_table` product `metaobject_reference` are declared in `shopify.app.toml`, distributed on deploy/install. Runtime `metaobjectDefinitionCreate` removed; `Shop.metaobjectDefinitionGid` vestigial. Metaobject *entries* are still written at runtime via `metaobjectUpsert`.
- **Assignment model — rigid block-on-conflict + shop-level routing (2026-07-07, `data-model.md` §5/§9).** One scope per template (`scope`+`scopeValue`+`mode`); overlaps between ACTIVE templates are **blocked at DRAFT→ACTIVE** (merchant decides — no silent precedence, no priority knob; `priority` column dormant). Overlap check is O(rules) Postgres set-algebra + `products(query,first:1)` existence tests, never a catalog scan. Broad rules deliver as O(1) entries in one `[shop.metafields.app.routing]` json metafield, resolved in Liquid via `metaobjects["$app:appx_spec_table"][handle]`. Per-product `metaobject_reference` survives only for bounded overrides; `ProductAssignmentIndex` is sparse.
- **Style tab design (2026-07-18 — `admin-screen-plan.md` §Tab 2, `data-model.md` §5/§10, PRD, code-standards).** One spec-table primitive with **orthogonal style knobs** (row layout, mobile behavior, section headers, collapsible sections via native `<details>` zero-JS, row dividers incl. zebra `stripeBgColor`, density). Modal/drawer containers + multi-column flow rejected. **Presets = COPY semantics** (built-ins as code constants; phase-2 merchant-saved `StylePreset`) copy values into per-template `TableStyling` **real columns**, not `extraStyles`; `basedOnPreset` is provenance only. **No shop-level default styling record** (copy keeps edits side-effect-free on live storefronts). Storefront delivery via the metaobject `styling` json field (no TOML change): layout knobs → wrapper modifier classes, colors/typography → CSS variables. **Typography:** `fontSize` = S/M/L theme-relative presets or bounded Custom px (10–184, clamped; JSON number on the wire, digit-string in the DB); `lineHeight` (TIGHT/NORMAL/LOOSE) + `labelCase` (DEFAULT/UPPERCASE, labels only) + `fontStyle` kept; font-family/letter-spacing/wrap/per-side padding rejected.
- **Testing strategy:** Vitest; Phases 1–2 done (unit + shop-isolation, mocked Prisma); reach Phase 4 (route loaders/actions + GDPR webhooks) before App Store submission, E2E (Playwright) fast-follow. Polaris web components don't render in jsdom → editor UI is browser-verified, pure logic unit-tested. Full doc: `~/.claude/plans/there-is-no-automated-encapsulated-yeti.md`.
- **Embedded-app verification:** the editor is a cross-origin iframe (top frame can't read its DOM/AOM/console); verify via Claude-in-Chrome on the `shopify app dev` preview + direct Postgres/Neon checks. Polaris CDN-build gotchas → `polaris-web-component-gotchas` memory. Admin GraphQL runtime is 2025-10 — validate against that, not the TOML's 2026-07.
