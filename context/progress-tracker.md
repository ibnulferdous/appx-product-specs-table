# Progress Tracker

Update this file after every meaningful implementation change.

> This file is a **forward-looking status doc**, kept compact to save context.
> Per-step detail (browser-verification logs, file lists, decisions) lives in
> `context/features/NN-*.md` and git history — link to those rather than
> re-narrating completed work here. Each completed item below is one line +
> its feature-doc pointer.

---

## Current Phase

Building the MVP.

## Current Goal

Custom spec-table editor built incrementally on a 13-step order (per-step docs in
`context/features/`). **Steps 1–13 + the inserted Step 9.5 are complete and
browser-verified**, the editor was **reshelled to the mockup (Phase A complete)**,
and the follow-on slices — paste refinements (21–24), templates-list polish
(25–28), editor bulk delete (29), keyboard cell navigation (30–32), and the
template lifecycle/create-on-save flows (19–20) — are all **complete and
browser-verified**, plus the **bulk-delete "Undo" toast (33)**. **Storefront slice
1 — Theme App Extension first pixel (34) is complete and browser-verified**: a
product's assigned spec table now renders as a real (unstyled) table on the live
storefront product page. Test suite: **330 tests green**.

**Next: the full product-assignment engine + storefront styling.** The
admin→storefront pipeline is proven end to end (editor → Postgres → metaobject →
`metaobject_reference` product metafield → Liquid table), and **value parts now
resolve live** on the storefront (slice 2 / feature 35, browser-verified — dynamic
`SHOPIFY_FIELD`/`METAFIELD` show real values, no placeholders). Remaining: the
assignment engine — now **rigid, block-on-conflict** (one scope per template: all / product / type / vendor / collection; overlaps blocked at DRAFT→ACTIVE, no `priority`), delivering broad rules via **one shop-level routing metafield** (design locked in `data-model.md` §5/§9, 2026-07-07) — and
Reshell Phases **B (Style tab) → C (Settings — status control shipped in feature
36; display rules still pending) → D (device previews) → E (assignment) →
F (top-bar status/save model + cleanup)**.

---

## Completed

> One line per unit. Detail → the linked `context/features/` doc + git history.

**Foundation**
- Shopify app template (React Router / TS) + PostgreSQL (Neon) + Prisma; app installed on the dev store; session + shop record stored in Neon.
- Shop-scoped `app/models/template.server.ts` (list / create / getById helpers, `shopId` in every where/data).
- `/app/templates` read-only list (empty state, status filters, table).
- Single dynamic editor route `app.templates_.$id` (`new` scaffold vs existing + 404); old standalone `new` route merged in.

**Editor build (13-step order + Step 9.5)**
- Step 1 (`02-…`): `app/utils/rows.ts` reducer + static rows + add/delete/duplicate + 200-row cap (`MAX_TEMPLATE_ROWS`).
- Step 2 (`03-…`): segmented value cell + pills + toolbar + row gutter; `afterId` insert; `ADD_SECTION`.
- Step 3 (`04-…`): review & harden Steps 1–2 (comment-only fixes; invariants confirmed; not-fixed items → "Step 3 Follow-ups").
- Step 4 (`05-…`): single contenteditable value surface — linear caret model (`valueParts.ts` pure + `valueDom.ts` glue); inline link-style pills; `LINE_BREAK` hard-break multiline; `INSERT_VALUE_PART_AT`.
- Step 5 (`06-…`): "Insert field" modal shell + caret save/restore (App Bridge `shopify.modal`); saved-selection model.
- Step 6 (`07-…`): native Shopify fields list (`shopifyFields.ts`) + one modal serving create (Insert) / edit (Update); `SET_VALUE_PART`.
- Step 7 (`08-…`): modal search/filter (`filterNativeFields`); auto-focus deferred past the modal open transition.
- Step 8 (`09-…`): fetch shop's product metafield definitions (`app/shopify/metafieldDefinitions.server.ts` + resource route); loading/empty/error states; shop isolation via session-bound Admin client.
- Step 9 (`10-…`): selectable metafield section → real `METAFIELD` pill (smart pill complete; `filterMetafieldDefinitions`).
- Step 9.5 (`11-…`): Save → Postgres → app-owned metaobject sync → read-back round-trip. `rowsSerialize.ts` (`parseRows` + **server-authoritative** `reconcileRowKeys`/`finalizeRowKeys`); `metaobjects.server.ts` (`$app:appx_spec_table`, PUBLIC_READ); contextual SaveBar + dirty baseline.
- Step 10 (`12-…`): mouse drag reorder (`@dnd-kit`; pure `MOVE_ROW`; no key/id mutation; persistence contract untouched).
- Step 11 (`13-…`): keyboard reorder + a11y (`KeyboardSensor`, focusable handle, SR announcements `reorderAnnouncements.ts`). Closes the reorder feature.
- Step 12 (`14-…`): parse pasted clipboard tables (`clipboardTable.ts` pure + `clipboardTableDom.ts` glue); log only.
- Step 13 (`15-…`): bulk-insert rows from paste (`gridToPastedRows` + `PASTE_ROWS`, cap-truncated). Closes the clipboard-paste feature.

**Reshell to the mockup — Phase A (per `plan-reshell-spec-table-editor.md`)**
- A2 (`16-…`): presentational `EditorShell` chrome (segmented tabs + device toggle + sidebar slots), built over a throwaway sandbox.
- A3 (`17-…`): bounded inner-scroll — only the rows list scrolls (`useScrollRegionHeight` + sticky header); iframe confirmed fixed-viewport.
- A1 (`18-…`): extracted `useRowEngine` + presentational `ContentTab`/`RowGrid`/`RowActionsToolbar`/`InsertFieldModal` (+ byte-identical `ValueCell`/`EditorRowItem`/`RowGutter`, shared `editorShared.ts`); `SpecTableEditor` is now a thin wrapper; sandbox deleted. Behavior-preserving (adversarial 5-dim review: 0 regressions). Label/Value header dropped per merchant request. **Closes Phase A.**

**Template lifecycle + templates-list**
- Create-on-first-save (`19-…`): "Create template" opens the real editor seeded with a starter scaffold (1 section + 5 blank rows); Postgres row created on first Save. Editor keyed on `${template.id}:${editorNonce}`.
- Lifecycle actions (`20-…`): header More-actions `<s-menu>` Rename/Duplicate/Delete + status badge; `duplicateTemplateForShop` (DRAFT copy, fresh row ids), `deleteTemplateForShop`, `deleteSpecTableMetaobject` (metaobject deleted before Postgres); `templateName.ts` / `templateStatus.ts`.
- Paste refinement 1 (`21-…`): content-first paste intent — bulk-vs-in-cell decided by clipboard content (`cellCount`), not focus; `readClipboardGrid`; narrow `s-search-field` skip-guard.
- Paste refinement 2 (`22-…`): insert pasted rows after the active row (`PASTE_ROWS afterId`; append when none).
- Paste refinement 3 (`23-…`): replace the pristine scaffold on a brand-new template's first bulk paste (`isPristineScaffold`, `PASTE_ROWS replace`).
- Paste refinement 4 (`24-…`): confirm before a paste crosses the 200-row cap (`PasteCapModal`) + plain-language toast copy.
- List long-name clamp (`25-…`): CSS 2-line clamp on the name link (full name kept for a11y/hover).
- List row-actions menu (`26-…`): per-row overflow `<s-menu>` Duplicate/Delete via a new list-route `action` reusing the feature-20 server fns; revalidates in place.
- List Rename (`27-…`): immediate-persist Rename menu action (`renameTemplateForShop` — rows-untouching, can't reuse `saveTemplateForShop`).
- List instant status filter (`28-…`): client-side filter (`templateFilter.ts`); loader returns all rows once; `shouldRevalidate` skips status-only GET navs but lets row-action fetchers revalidate; dead `countTemplatesForShop` + list-status option removed.
- Name cap raised 100 → 255 (`templateName.ts`; name is internal-only, not synced to storefront).
- List Duplicate in-flight feedback: Duplicate has no modal to host a spinner (unlike Delete/Rename) and the ⋯ menu closes on click, so it fired with no visible progress. Now toggles App Bridge's global loading indicator (`shopify.loading(duplicating)`) while the clone is in flight. Success toast unchanged. Browser-verified (loading bar shows during flight; "(copy)" row + toast on settle).
- Shared-fetcher race fix: the three row mutations share ONE fetcher, so a second submit while one ran would interrupt the first (e.g. Delete cancelling an in-progress Duplicate). Added a single `busy = fetcher.state !== "idle"` gate that (a) guards all three submit handlers and (b) is threaded through `TemplateTable`→`TemplateTableRow` to `disabled` the per-row ⋯ trigger, so no second row action can even be opened mid-mutation. Browser-verified: all ⋯ triggers grey out during an in-flight duplicate.
- Bug fix: SaveBar lingered on the list after Delete-with-unsaved-edits → `shopify.saveBar.hide` before the delete redirect (`TemplateHeaderActions.tsx`). _Pending live re-verify._

**Editor bulk delete (`29-…`)**
- Per-row select checkbox (gutter) + contextual bulk-action bar + count-gated confirm modal; pure `DELETE_ROWS`; gutter widened to fit checkbox·handle·✕. Deferred: range-select, Delete/Backspace shortcut.
- UX follow-up: **tristate "select all" header checkbox** in the Label/Value header (`RowGrid.tsx`, wired to `selectAll`/`clearSelection`/`allSelected`; indeterminate when partial; selects section rows too). Replaces the in-bar "Select all (N)/Deselect all" toggle — one-click select-all matching Polaris `IndexTable`; bar stays contextual (count + Delete only).
- UX polish: **selected-row highlight** (`.rowSelected` blue fill in `SpecTableEditor.module.css`, wired in `EditorRowItem.tsx`; declared before `.rowActive` so the active insertion target still wins the bg when both) so a bulk selection is legible while scrolling, not just via the gutter checkbox. **Clear-selection ✕** added to `BulkActionsBar.tsx` (icon-only, `clearSelection`) so the merchant can drop a selection without scrolling up to the header checkbox.

**Bulk-delete "Undo" toast (`33-…`)**
- Stopgap safety valve making bulk delete reversible without the full reducer undo/redo (deferred post-storefront). New pure `RESTORE_ROWS` action (`rows.ts`) replaces the array with a pre-delete snapshot verbatim (exact id/key/valueParts/order; no cap check); `handleDeleteSelected` (`useRowEngine.ts`) captures `rowsRef.current` pre-delete and shows the "Deleted N rows" toast with a 10s `action: "Undo"` that dispatches `RESTORE_ROWS` + re-toasts "Restored N rows". No server/schema/dependency change.
- **Review fix:** the `onAction` `saving` guard reads a new `savingRef.current` (not the by-value `saving` closure, which would be stale at toast-show time) so an Undo can't mutate rows during a save started after the toast appears.
- Browser-verified (all 3 paths): 1–2-row immediate delete, 3+ confirm-modal delete, and select-all → delete-all ("No rows yet") — each Undo restores the exact rows + re-toasts, and the SaveBar dirty state correctly returns to clean (restored array == saved baseline). Expired toast leaves the delete in place. 3 new `rows.test.ts` cases (verbatim restore, delete→restore round-trip, empty snapshot).
- **Resolved:** the confirm modal's "Deleting N rows can't be undone." copy (which the Undo toast made false) is gone — `BulkDeleteModal.tsx` now reads "…will be removed…. You can undo right afterward; the removal is saved when you save." Heading is count-aware ("Delete N rows?"); stale header comment updated.

**Storefront slice 1 — Theme App Extension: first pixel (`34-…`)**
- Scaffolded `extensions/product-specs-table/` (theme app extension, no build step): `blocks/spec_table.liquid` app block (`target: section`, `enabled_on` product templates) + `assets/spec-table.css` + locales. Browser-verified through all 5 steps on the dev store.
- **Definitions moved to declarative TOML** (`shopify.app.toml`): the `$app:appx_spec_table` metaobject **and** a new `[product.metafields.app.spec_table]` `metaobject_reference<$app:appx_spec_table>` pointer, both `access.storefront = public_read`. Removed the runtime `ensureSpecTableDefinition` + `setShopMetaobjectDefinitionGid` create path (`Shop.metaobjectDefinitionGid` now vestigial). Existing 11 metaobject entries were adopted cleanly (no conflict/data loss).
- Block reads `product.metafields["$app"].spec_table.value` → metaobject → renders a semantic `<table>`: section headers, label/value rows, `LINE_BREAK` → `<br>`, escaped author text, silent when non-ACTIVE/empty. `SHOPIFY_FIELD`/`METAFIELD` parts render as deferred placeholders (`[field:vendor]` etc.) — resolution is a later slice.
- **Storefront access confirmed live**: app-owned metafield + metaobject are Liquid-readable via `public_read` (the admin "Storefront API access" toggle is non-representative for app-owned defs). Both Liquid files pass Shopify Theme Check.

**Storefront slice 2 — value-part resolution (`35-…`)**
- New `snippets/spec-table-value.liquid` resolves the value cell: `SHOPIFY_FIELD` (12 tokens against the product / `product.first_available_variant`; `total_inventory` → empty), `METAFIELD` (`metafield_text | escape | newline_to_br`), `TEXT`, `LINE_BREAK`. `blocks/spec_table.liquid` captures the cell per row and applies the **whole-cell `hideWhenEmpty`** gate (`strip_html | strip` blank test); 50-row-chunked loops (Shopify's 50-iteration `for` cap). Locale Yes/No keys for `available_for_sale`; dead `.appx-spec-table__pending` CSS removed. `data-model.md` §10 rewritten to the whole-cell rule.
- Browser-verified on the DJI Air 3S product page: dynamic fields resolve (price `$155,000.00`, vendor/type in "In The Box", vendor in "Warranty"), `hideWhenEmpty` hides empty rows (SKU / metafield / "No value row") while the section renders, multi-line `<br>` renders, section headers render, and **no `[field:…]`/`[metafield:…]` placeholders leak**. Requires `ACTIVE` metaobject status (block gate).

**Product assignment engine — data foundation (`37-…`)**
- `add-assignment` migration (`20260707154040_add_assignment`): `ProductAssignment` + `ProductAssignmentIndex` tables + enums `AssignmentScope` (no `TAG` — post-MVP), `AssignmentMode`, `AssignmentIndexStatus`; assignment back-relations added to `Shop`/`Template`. Both tables confirmed live in Neon (`proud-hat-02103652`). Models copied verbatim from data-model §5; `ProductAssignmentIndex` exists but is **unpopulated** until feature 45 (sparse per-product overrides).
- Client-safe `app/utils/assignmentScope.ts` (`ASSIGNMENT_SCOPES` + `validateScope`, mirrors `templateStatus.ts`): enforces the §5 `scopeValue` invariant (NULL iff `ALL_PRODUCTS`; non-empty otherwise; light `gid://shopify/` shape check for `PRODUCT`/`COLLECTION`).
- Shop-scoped `app/models/assignment.server.ts` — `getAssignmentForTemplate` / `setTemplateScope` (ownership gate via `getTemplateByIdForShop` + transactional replace → **exactly one INCLUDE rule** per template; EXCLUDE rows untouched) / `clearTemplateScope`. **No Shopify side effects** — rules are Postgres-only until activation projects them (feature 42). 19 new unit tests (`validateScope` + shop-isolation, mocked Prisma). Full gate green (349 tests, typecheck, lint, build). Detail → `context/features/37-assignment-model-and-rule-persistence.md`.

**Template status change (`36-…`)**
- Merchants can change a template's status (DRAFT / ACTIVE / ARCHIVED) from **two** surfaces: the templates-list ⋯ menu ("Change status" → modal `<s-select>` picker, immediate-persist) and the editor's **Settings tab** (`SettingsTab.tsx` `<s-select>` in the sidebar, rides the existing dirty/SaveBar flow — `setStatus` added to `useRowEngine`, status already rode the dirty snapshot + Save payload). Shared client-safe `validateTemplateStatus` + `TEMPLATE_STATUS_OPTIONS` (`utils/templateStatus.ts`); rows-untouching, shop-scoped `setTemplateStatusForShop` (twin of `renameTemplateForShop`).
- **Both surfaces re-sync the storefront metaobject** after the status write so a to/from-`ACTIVE` change flips storefront visibility (priority #2). `syncTemplateToMetaobject` was extracted from the editor route into shared **`app/shopify/templateSync.server.ts`** (behavior-preserving); the list action calls it and surfaces `syncError` honestly, the editor rides its existing save-path sync. List Save is disabled when the status is unchanged (skips a needless write + re-sync); the shared-fetcher `busy` gate covers it like the other row mutations.
- Browser-verified on the dev store (both surfaces + full storefront round-trip): list Change-status flips the badge in place; editor Settings change opens the SaveBar → Save re-tones the header badge + "Saved"; and the DJI product's spec table **hides on ACTIVE→DRAFT and re-renders on DRAFT→ACTIVE**. 11 new unit tests (`validateTemplateStatus` + `setTemplateStatusForShop` shop-isolation). Detail → `context/features/36-template-status-change.md`.

**Keyboard cell navigation (`30-…` / `31-…` / `32-…`)**
- Step 1: pure vertical-nav resolver `gridNav.ts` (sticky column through section rows; no wrap).
- Step 2: keyboard + DOM wiring `useGridKeyboardNav.ts` (`Ctrl/Cmd + Arrow Up/Down`, caret at target end).
- Step 3: manual-advance editor tips footer (`editorTips.ts` pure + `platform.ts` + `EditorTips.tsx`); WCAG-safe (no auto-rotate); SSR-hydration-safe. **Closes the feature.**

**Testing & tooling**
- Phase 1 unit tests (Vitest, standalone `vitest.config.ts`; `rows.ts` 100% stmts).
- Phase 2 shop-isolation tests (mocked Prisma; `template.server.test.ts` / `shop.server.test.ts`).
- CI gate (`.github/workflows/ci.yml`: typecheck → lint → format:check → test → build), Dependabot, Prettier enforcement, `context/app-store-review-checklist.md`.
- Dependency security pass (`npm audit` → 0; eslint/lodash/codegen bumps; CI action v4→v5).
- CodeRabbit review passes: shop-scoped write (`update where {id,shopId}`), value-cell `:focus-visible` ring, `updateMany`→`update` on by-id writes, removed unsafe non-null assertion in `InsertFieldModal`.

---

## In Progress

- **Product assignment engine — building on the 8-file plan (features 37–44).** Data foundation (37) is **complete** (`add-assignment` migration + `assignmentScope.ts` + `assignment.server.ts`, all tests/build green). **Next: feature 38** — pure scope-overlap resolver (`assignmentOverlap.ts`, set-algebra). Per-step build specs land in `context/features/NN-*.md` as each is started; UI location (Settings-tab vs standalone `/assign`) stays open until feature 44.

---

## Next Up

1. **Product assignment engine** (design locked 2026-07-07 — `data-model.md` §5/§9): **rigid, block-on-conflict, merchant-controlled** (Moon-Bundles style). Being built on an **8-file plan** (features 37–44, small verifiable steps): **37 data foundation ✅** → 38 scope-overlap resolver (pure) → 39 cross-dimension existence check (Shopify) → 40 routing-projection builder + `add-routing` migration → 41 shop routing metafield writer + TOML def → 42 activation dry-run gate (wires into both status surfaces) → 43 storefront routing resolution (Liquid) → 44 assignment UI (scope picker). Then 45 (EXCLUDE + per-product overrides) + 46 (docs wrap). Design recap: one scope per template; dry-run **blocks activation** on overlap with another ACTIVE template (O(rules) set-algebra + `products(query,first:1)`); DRAFT may hold a conflict, ACTIVE may not; **no `priority` knob**; broad rules deliver via **one shop-level `[shop.metafields.app.routing]` json map** resolved in Liquid by handle; per-product `metaobject_reference` metafield only for bounded overrides. Rides Reshell Phase E.
2. **Reshell Phases B–F**: B (Style tab) → C (Settings) → D (device previews — read-only Desktop/Tablet/Mobile) → E (assignment) → F (top-bar status+save model + cleanup).
3. **Templates-list Phase 2**: search / sort / pagination — server-side filtering returns *with* pagination when the list can grow large. Multi-select bulk actions later.

**Deferred / no longer numbered editor steps:** WYSIWYG storefront styling and the Desktop/Tablet/Mobile viewport toggle move to the later styling/persistence slice. Editor bulk-delete deferrals: range-select (Shift+click), Delete/Backspace shortcut.

---

## Step 3 Follow-ups (tracked)

- **[Step 4 — RESOLVED]** caret/focus loss on pill remove/insert, duplicate `aria-label`s, fiddly empty TEXT segment — all fixed by the Step 4 single-surface rewrite.
- **[Step 9.5 — RESOLVED]** per-row validation (`parseRows` replaced `normalizeRows`) and provisional-key finalization at Save (`reconcileRowKeys`/`finalizeRowKeys`, server-authoritative) — see `rowsSerialize.ts`.
- **[Later, low priority] `insertActive` optimism at the cap.** `insertActive` sets `scrollTargetRef`/`activeRowId` before the reducer runs; at the cap the reducer no-ops, so they can point at a never-added row. Unreachable today (buttons disabled at cap), but guard on `!atCap` if a future keyboard/programmatic add bypasses the disabled button.

---

## Open Questions

- ~~Admin API mutations for the app-owned metaobject definition/entries~~ **RESOLVED (Step 9.5):** `metaobjectDefinitionCreate` / `…ByType` / `metaobjectUpsert` / `metaobjectByHandle` (handle `template-{id}`), validated @ 2025-10 — see `metaobjects.server.ts` + `data-model.md` §10.
- **Storefront Liquid read path** — **RESOLVED + verified live (slice 1, `context/features/34-…`):** the product → template pointer is a **`metaobject_reference` product metafield** declared in `shopify.app.toml` (`[product.metafields.app.spec_table]`, `metaobject_reference<$app:appx_spec_table>`). Liquid access is the reserved-prefix **bracket** form `product.metafields["$app"].spec_table.value` → the metaobject (dot form does NOT resolve the reserved namespace); `rows.value` (json field) is an iterable array. An app-owned `metaobject_reference` **does** resolve its app-owned metaobject on the storefront. **Correction:** app-owned metafields/metaobjects are **not** always Liquid-readable — they require `access.storefront = public_read` (set in TOML); the admin "Storefront API access" toggle is non-representative for app-owned defs. **Supersedes** the `appx.spec_table_template_handle` single-line-text sketch in `data-model.md` §9.
- Best storefront event strategy for selected-variant changes across themes.
- ~~Exact UX for preventing/warning about assignment conflicts in MVP.~~ **DIRECTION SET (2026-07-07, `data-model.md` §9):** rigid **block-on-conflict** (Moon-Bundles style) — a template can't go ACTIVE while its scope overlaps another ACTIVE template; DRAFT may hold a conflict; no priority tiebreak. Remaining detail: exact conflict-message copy + how the merchant picks the resolution (narrow scope / add EXCLUDE exception / leave draft).
- **Assignment location:** direction is to move Product Assignment into the editor's **Settings tab** (not locked). Open: does the Settings tab **fully replace** the standalone `/app/templates/:id/assign` screen, or does `/assign` survive as a deep view for conflict warnings + assignment summary? Decide before building the assignment slice.
- **Settings-tab "Display rules"** (mockup's `hide rows with empty values` / `show section dividers` / `show on mobile`) are dummy/illustrative — each needs a real definition + reconciliation with the per-row `hideWhenEmpty` flag before building.
- **Top-bar name-edit affordance:** inline title edit vs a Rename item in the ⋯ menu — settle when the top bar (Phase F) is built.
- ~~**Templates-list Archive — deferred entirely (2026-06-27).**~~ **RESOLVED (feature 36, 2026-07-03):** status change (incl. Archive) now ships on BOTH the list ⋯ menu ("Change status" modal) and the editor Settings tab. Built exactly as this note anticipated — a rows-untouching `setTemplateStatusForShop` **plus** the extracted shared `syncTemplateToMetaobject` (`app/shopify/templateSync.server.ts`) re-syncs the storefront metaobject so an archived (ex-ACTIVE) template stops rendering. Browser-verified via the DJI ACTIVE→DRAFT→ACTIVE storefront round-trip.

---

## Key Decisions (still load-bearing)

> Decisions that still constrain future work. Historical/superseded decision logs
> were removed in the 2026-06-29 compaction — see git history for the originals.

- **Custom React editor — no AG Grid** (2-column, ≤200 rows, `valueParts` token editor). DnD via `@dnd-kit`. Pill model is **pick-then-insert** (modal outside the contenteditable; never an empty placeholder pill). Row cap is the single shared `MAX_TEMPLATE_ROWS` constant (UI + server).
- **Value model:** `LINE_BREAK` value part for author-intended hard breaks (no inline rich formatting/links/widgets in MVP). `hideWhenEmpty` is whole-row, never per-line (storefront concern).
- **View toggle:** Edit is the only editable segment; Desktop/Tablet/Mobile are **read-only storefront previews** (Phase D). No separate preview panel (WYSIWYG).
- **Color policy:** the app *uses* color, organized through CSS variables as one source of truth (admin mirrors Polaris; storefront inherits theme but is merchant-overridable). The "no hardcoded hex literal" rule is CSS hygiene, not "colorless" — use Polaris tokens / `currentColor` / custom properties (e.g. runtime-captured `--appx-token-color` for the pill blue).
- **Save/status model (from the mockup):** App Bridge contextual SaveBar (Save/Discard) + header status dropdown + ⋯ more-actions menu; no separate "Save as draft" (status independent of saving). Save freezes the editor (`inert`) in-flight; baseline reset uses the **submitted** snapshot (merchant-data-safety race fix).
- **Persistence/keys:** key finalization is **server-authoritative** ("is this row id already persisted?"), never re-derives a finalized key. Metaobject is **app-reserved** (`$app:appx_spec_table`) for data safety; metaobject deleted *before* Postgres on delete so a storefront-readable entry can't outlive its template.
- **App-owned definitions are declarative TOML** (slice 1): the `$app:appx_spec_table` metaobject and the `$app:spec_table` product `metaobject_reference` are declared in `shopify.app.toml`, distributed on deploy/install — the Shopify-recommended path, and required so the reference can target the metaobject at deploy time. Runtime `metaobjectDefinitionCreate` was removed; `Shop.metaobjectDefinitionGid` is vestigial (drop in a later DB-migration cleanup). Metaobject *entries* are still written at runtime via `metaobjectUpsert`.
- **Assignment model — rigid block-on-conflict + shop-level routing (2026-07-07, `data-model.md` §5/§9).** Replaces the earlier per-product-materialization + `priority`-precedence plan. One scope per template (polymorphic `scope`+`scopeValue`+`mode`: all / product / type / vendor / collection); overlaps between **ACTIVE** templates are **blocked at DRAFT→ACTIVE** (merchant decides — no silent precedence, no merchant priority knob; `priority` column kept dormant). Overlap check is O(rules) Postgres set-algebra + `products(query,first:1)` cross-dimension existence tests, never a catalog scan. Broad rules deliver as **O(1) entries in one shop-level `[shop.metafields.app.routing]` json metafield** (future products auto-covered at render time), resolved in Liquid via `metaobjects["$app:appx_spec_table"][handle]` — **proven live 2026-07-07** (raw handle string → metaobject; overturns the feature-34 reference-only caution). Per-product `metaobject_reference` metafield survives only for bounded single-product overrides; `ProductAssignmentIndex` is now **sparse** (never O(catalog)).
- **Testing strategy:** Vitest; Phases 1–2 done (unit + shop-isolation, mocked Prisma); reach Phase 4 (route loaders/actions + GDPR webhooks) before App Store submission, E2E (Playwright) as fast-follow. Polaris web components don't render in jsdom → editor UI is browser-verified, pure logic is unit-tested. Full doc: `~/.claude/plans/there-is-no-automated-encapsulated-yeti.md`.
- **Pre-submission gaps to close:** mandatory privacy webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) and Billing (defined in `prd.md`, not yet implemented). See `context/app-store-review-checklist.md`.
- **Embedded-app verification:** the editor is a cross-origin iframe (top frame can't read its DOM/AOM/console); verify via Claude-in-Chrome on the `shopify app dev` preview + direct Postgres/Neon checks. Polaris CDN-build gotchas live in the `polaris-web-component-gotchas` memory.
