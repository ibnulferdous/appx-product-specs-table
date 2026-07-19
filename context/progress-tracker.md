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
storefront product page. Test suite: **684 tests green**.

**Next: the full product-assignment engine + storefront styling.** The
admin→storefront pipeline is proven end to end (editor → Postgres → metaobject →
`metaobject_reference` product metafield → Liquid table), and **value parts now
resolve live** on the storefront (slice 2 / feature 35, browser-verified — dynamic
`SHOPIFY_FIELD`/`METAFIELD` show real values, no placeholders). Remaining: the
assignment engine — now **rigid, block-on-conflict** (one scope per template: all / product / type / vendor / collection; overlaps blocked at DRAFT→ACTIVE, no `priority`), delivering broad rules via **one shop-level routing metafield** (design locked in `data-model.md` §5/§9, 2026-07-07) — and
Reshell Phases **B (Style tab — spec locked 2026-07-18: `admin-screen-plan.md` §Tab 2, `data-model.md` §5/§10, PRD + code-standards updated) → C (Settings — status control shipped in feature
36; display rules still pending) → D (device previews — **COMPLETE**, feature 49;
all 8 steps shipped, gate green, live-verified 2026-07-13) → E (assignment) → F
(top-bar status/save model + cleanup)**.

**Phase B (Style tab, feature 57) is now in progress** — 14-step build order
(B1 = 1–12, B2 = 13–14, B3 outlined). **Steps 1 (pure styling domain module),
2 (pure presentation mapping), 3 (storefront stylesheet rules, dormant +
the mobile-stacked default), 4 (`add_table_styling` migration + server
persistence), and 5 (engine styling state + Dividers control + Save
round-trip) are complete**; next is **Step 6 (live styling in the device
previews)**. Step 5 closed the circuit — a merchant can now change Row
dividers and see it survive a reload — but **nothing renders it yet**: the
knob persists and repaints nothing until the previews (Step 6), the grid
(Step 11), and the storefront (Step 7, via the metaobject) consume it.

> **Phase D delivered the preview *mechanism*, narrower than the Reshell plan's Phase D.** Three
> deliberate deltas (recorded in `56-…`, for Phase F to reconcile the plan text): (1) **no live
> `TableStyling`** — feature 49 front-ran Phase B, so the preview inlines the shared storefront
> `spec-table.css` (the current storefront styling); (2) **no mobile stacked label-over-value** — only
> iframe width changes (the stacked layout is the Style-tab mobile row-layout option, out of scope per
> PRD line 33 / `admin-screen-plan.md` line 142); (3) **mobile width 375px**, not the plan's 390px.

---

## Completed

> One line per unit. Detail → the linked `context/features/` doc + git history.

**Style tab — Step 5: engine styling state + Dividers control + Save round-trip (Reshell Phase B, `61-…`, 2026-07-19)**
- Fifth slice of feature 57 and **the first one a merchant can see**. Steps 1–4 were each provably
  dormant; this one joins them into a working circuit: loader → engine state → rail control → dirty
  snapshot → Save payload → DB → reload. **Client-only — no server, schema, CSS, Liquid, metaobject,
  or dependency change** (Step 4 had already finished the action/loader plumbing, so this step only
  sends and reads what existed).
- **Engine** (`useRowEngine.ts`): new `initialStyling: StylingValues` arg seeded from the loader
  (reseeded on remount, so **Discard reverts styling for free**); **one state cell holds the whole
  resolved value** — never a cell per knob — mutated only through a generic
  `setStylingField<K extends keyof StylingValues>(field, value)`, so Steps 8/10 add ~19 more controls
  without touching the engine again. The Save payload carries
  **`serializeStylingOverrides(styling)`** — the overrides-only wire shape, so an all-default table
  sends `{}` and a reset-to-default genuinely CLEARS the column.
- **The drift fix this step forced:** the dirty baseline (`currentMetaJson`) and the Save-click
  snapshot (`submittedMetaJsonRef`) were two hand-built object literals kept in sync by eye — a
  silent-until-it-bites edit-during-save hazard. Both now call one pure
  **`editorMetaSnapshot`** (new `editorSnapshot.ts`), which owns the fixed key order, the
  set-sorting for `scopeValues`/`excludes`, and the styling wire shape. Agreement is now structural,
  not conventional.
- **UI**: new `StyleTab.tsx` fills EditorShell's long-empty `stylePanel` slot (placeholder gone),
  sibling of `SettingsTab` in every respect. One control — **Row dividers (Lines / Stripes / None)**
  — with options **derived from `ROW_DIVIDER_STYLES`** via a new pure `stylingControls.ts`, never a
  hand-typed list, plus per-option help text. Deliberately one knob: it is the simplest shape in
  `StylingValues`, so it proves the pattern the other nineteen copy.
- **+12 unit tests** (new `editorSnapshot.test.ts`: stability, styling-flips-dirty, back-to-default
  returns to baseline (no false dirty), snapshot styling === the payload's serialization, `{}` when
  all-default, set-sorting, no caller-array mutation, the pre-styling surfaces still flip; new
  `stylingControls.test.ts`: options match the domain in order, default leads, prose labels distinct
  and never the raw constant). **Full gate green (684 tests, 33 files; typecheck, lint, build).**
- **Live-verified on the dev store (2026-07-19)** on the real Moto G45 template: Style tab shows
  **Lines** by default → **Stripes** opens the SaveBar on a styling change alone (no row edit) →
  **Discard** reverts to Lines and closes the bar → Stripes + **Save** writes exactly one
  `TableStyling` row with `rowDividerStyle='STRIPES'` and **every other override column NULL** →
  **reload** still reads Stripes with the SaveBar closed → **None** persists as `'NONE'` → back to
  **Lines** (the default) sets the column to **NULL**, proving a reset clears the override rather
  than storing the default as data. **Create-on-first-save** (never before run with a real payload):
  a `/new` template saved with Stripes got its rows **and** a styling row in one flow. **Duplicate**
  copied the styling row with a fresh row id (Step 4's copy semantics, first live proof); **delete**
  cascaded the styling row away — scratch template and copy both cleaned up, **zero orphans**,
  template count back to 5. Console clean.
- **Expected non-behavior, confirmed live:** with Dividers set to None the Desktop preview still
  rendered hairline rules — the previews do not consume styling until Step 6. Detail →
  `context/features/61-style-tab-step5-engine-state-dividers-save.md`. **Next → Step 6 (live styling
  in the device previews)** — the step that finally makes the knob visible.

**Style tab — Step 4: `add_table_styling` migration + server persistence (Reshell Phase B, `60-…`, 2026-07-18)**
- Fourth slice of feature 57 — the first Phase B schema change, dormant on arrival (no UI sends or
  reads styling; Step 5 wires the engine). **Migration `20260718122430_add_table_styling`** applied
  to the Neon dev branch: `model TableStyling` copied verbatim from `data-model.md` §5 (which
  already carried the model AND the `styling TableStyling?` back-relation — schema caught up to the
  doc), `templateId @unique` + `onDelete: Cascade`, purely additive, **no backfill** (no row = all
  defaults; row lazily created on first styling save).
- **Column semantics:** columns store OVERRIDES — knob at flagged default → NULL, nullable at
  inherit → NULL, `sectionsCollapsible` verbatim, numeric fontSize → all-digit string.
  `stylingToDbColumns` (in `template.server.ts`, exported for tests) emits **every column, explicit
  NULLs included** (full replace, never a patch — the Step 1 serializer's doc-comment law made
  code); **`parseStylingValues` doubles as the one DB decoder** (NULL → default/inherit, `"18"` →
  `18`, corrupt legacy values degrade per-field, extra row keys ignored) — round-trip law
  `parseStylingValues(stylingToDbColumns(v)) === v` tested. Three encodings, one vocabulary: wire =
  overrides-only, DB = full columns, domain = resolved `StylingValues`.
- **Isolation for a model with no shopId column:** all styling writes ride the **shop-scoped
  template update** as a nested upsert (`data.styling.upsert`, `where: { id, shopId }`) on top of
  the ownership read — double enforcement; deliberately NO free-standing styling write function.
  `saveTemplateForShop` gains optional `styling`: **`undefined` = untouched** (rows-only saves
  can't clobber), present = parse (tolerant, never blocks) → full-column upsert.
  `getTemplateByIdForShop` includes styling; **duplicate copies the styling row** (columns +
  `basedOnPreset` provenance + `extraStyles`, fresh identity); delete rides the FK cascade.
  Route: action accepts `payload.styling` on both branches (create persists it via the same save
  function post-create); loader returns resolved `styling: StylingValues` (defaults for `/new`).
  `basedOnPreset`/`extraStyles` created by the migration but never written (Step 13 / post-MVP);
  metaobject sync untouched (Step 7).
- **+11 unit tests** (mapping totality incl. px→string, round-trip law, DB-row decode with corrupt
  column, styling-undefined no-clobber, full-column upsert shape, malformed-payload degradation,
  cross-shop block, duplicate copy ×2, cascade pin); 3 existing assertions updated for the new
  `include`. **Full gate green (672 tests, 31 files).** **Live-verified on Neon + dev store:**
  migration applied (zero styling rows, no backfill), a throwaway-template integration run proved
  lazy create → override write → no-clobber → reset-clears → duplicate-copies → cascade live, and
  the editor regression (rows-only save + revert on Moto G45) left styling rows at zero. One op
  note: the running `shopify app dev` held the Prisma query-engine DLL, so `prisma generate`
  needed a dev-server stop/start (EPERM on Windows, client regenerated cleanly after). Detail →
  `context/features/60-style-tab-step4-migration-server-persistence.md`. **Next → Step 5 (engine
  styling state + Dividers control + Save round-trip).**

**Style tab — Step 3: storefront stylesheet rules (dormant) + mobile-stacked default (Reshell Phase B, `59-…`, 2026-07-18)**
- Third slice of feature 57 — the CSS half of the Step 2 contract. `extensions/product-specs-table/
  assets/spec-table.css` rewritten: **Part A** — every base-rule literal became
  `var(--appx-spec-*, <that same literal>)` (label `width`/`font-weight`/`background`/`color`/
  `text-transform`, value `background`/`color`, cell + section borders on `--appx-spec-border-color`,
  typography vars on `__table` so `em` multiplies the theme base once; `font-weight` on `__label`
  only — it is the LABEL-weight knob). **Part B** — one dormant rule set per modifier member,
  defaults included, all compound selectors at equal specificity (no `!important`): layouts
  (two-column restated explicitly; stacked = `display:block` chain with the label's divider dropped
  so pairs read as units), section banded (real band, fallback `rgba(0,0,0,0.06)`, rule dropped) /
  text-only, dividers lines / stripes (`nth-child(even)`, NOT `nth-of-type` — section headers are
  rows too; fallback `rgba(0,0,0,0.04)`) / none, densities (padding only: `0.25/0.5/1rem` block).
  **Part C** — the `--mobile-stacked` body inside `@media (max-width: 749px)` (Dawn's breakpoint;
  puts preview widths 375/768 on the intended sides), LAST in the file so it beats the desktop
  layout at equal specificity. Two locked exemptions: `--mobile-same-as-desktop` deliberately
  rule-less ("same as desktop" = no override exists), `--collapsible` comment-placeholder until
  Step 9's `<details>` markup. Source order is deliberate where knobs meet (layout AFTER
  dividers/density; stacked's longhand `padding-block-start` layers over density's shorthand).
- **`previewStyles.ts` re-copied** (mechanically, byte-exact) — the feature 49 drift guard failed on
  the CSS edit as predicted, then re-greened. **New `specTableCssContract.test.ts` (5 tests)** pins
  the CSS to the Step 2 vocabulary both ways: all 13 `SPEC_TABLE_CSS_VARS` present, all 13
  producible modifier classes present as selectors **except the two exemptions asserted
  known-absent** (the list must shrink consciously in Step 9), and no `!important`. One existing
  feature 49 assertion updated: the view-independence word check now strips the shared stylesheet
  first, since `--mobile-stacked` selectors legitimately contain device words (width-responsive CSS
  in a still view-independent document — byte-identical across calls, unchanged).
- **Dormancy browser-verified live** (dev store): product page (Moto G35, 37 rows) renders
  identically — served CSS confirmed NEW, wrapper carries zero modifier classes, computed styles
  exact (label 33%/600, cells 0.5/0.75rem + `rgba(0,0,0,0.1)` hairline, section 700 + 2px
  currentColor, typography inherited). Devtools experiment: adding `--dividers-stripes` /
  `--layout-stacked` by hand flips stripes/stacking instantly and was reverted — Part B is
  live-but-unreferenced. Editor device previews (desktop + mobile 375px) unchanged; mobile stays
  two-column, proving the media query is inert without the class. **Full gate green (661 tests, 31
  files).** Carried forward: stacked-mode `display:block` strips implicit table semantics → **Step
  12 a11y item**; `--collapsible` rules + stripe `nth-child` re-check → **Step 9**. Detail →
  `context/features/59-style-tab-step3-storefront-stylesheet-rules.md`. **Next → Step 4
  (`add-table-styling` migration + server persistence).**

**Style tab — Step 2: pure presentation mapping (Reshell Phase B, `58-…`, 2026-07-18)**
- Second slice of feature 57. New pure, framework-free `app/utils/tableStylingCss.ts` — the single
  translation layer between the Step 1 domain and every renderer (storefront Liquid Step 7, preview
  iframe Step 6, editing grid Step 11), so three renderers can never drift. Exports
  `stylingToCssVars`, `stylingToModifierClasses`, `formatCssVarDeclarations`, the frozen
  `SPEC_TABLE_CSS_VARS` property-name map (keyed by `StylingValues` field name, `--appx-spec-*`
  prefix per the existing `--appx-*` convention), and the four shared scales (`FONT_SIZE_EM_SCALE`
  `0.875em`/`1em`/`1.125em`, `FONT_WEIGHT_SCALE` `400`/`500`/`700`, `LINE_HEIGHT_SCALE`
  `1.25`/`1.5`/`1.8` **unitless**, `LABEL_CASE_TRANSFORMS`) that Step 3's stylesheet fallbacks and
  the Step 10 control previews will read.
- **The organizing rule (the step's real design decision): nullable → CSS var, non-null knob →
  modifier class.** `stylingToCssVars` emits a key **only when non-null** (never `""`/`"inherit"`;
  all-inherit → `{}`) so Step 3's `var(--x, <fallback>)` keeps the merchant's theme the true default
  (zero-config promise). `stylingToModifierClasses` emits **every knob's class, defaults included**
  (equal specificity, total function, exact-array-assertable) as BEM modifiers on the existing
  `appx-spec-table` block; `sectionsCollapsible` is the one presence-flag (only when `true`);
  **`sectionsInitialState` maps to nothing** (it's the Step 9 `<details open>` markup decision) —
  no-leak asserted in tests. Both outputs are deterministic in `STYLING_FIELD_NAMES` order (Step 6
  recomputes the preview `srcDoc` per render; unstable order would churn the iframe document).
- **Typography lock carried into CSS:** fontSize keywords are theme-relative **em** multipliers, the
  Custom escape hatch is absolute `px`; `lineHeight` is unitless (inherits as a ratio, not a frozen
  length). **Security posture:** the signature accepts `StylingValues`, never `unknown` (a caller
  must parse first); every mapping is total (`switch` + exhaustive `never` default, or
  `satisfies Record<Union, string>`), so a future allowed-value addition is a **compile error**, not
  a silently-interpolated `undefined`; an injection shape-guard test asserts every emitted value
  matches the strict whitelist (hex / `\d+px` / `\d+%` / keyword literal, no `;{}<`/`url(`/newline).
  `formatCssVarDeclarations` is the ONE shared `--k: v;` join both the Step 6 `<style>` block and
  the Step 7 inline `style` attribute will use.
- **Pure + wired to nothing** (grep-verified: imported only by its own test) — no component, CSS
  file, Liquid, schema, dependency, server, persistence or reducer change; `spec-table.css`
  untouched (Step 3 owns the `var(--appx-spec-*, <current value>)` rewrite + the expected preview
  drift-guard update). **29 new Node unit tests** (`tableStylingCss.test.ts`: all-defaults `{}` +
  exact default class array, the seven-color matrix with absent-key assertions, the fontSize union,
  all four typography scales, `labelWidthPct`, the per-knob class matrix with constant-length loop,
  collapsible presence flag, the `sectionsInitialState` no-leak, determinism/order, totality over a
  fully-overridden value, the injection shape guard, and `formatCssVarDeclarations` incl. the
  Step 1 → Step 2 round-trip chain). **Full gate green (656 tests, 30 files; typecheck, lint,
  format, build).** **No browser step — pure, renders nothing** (per the feature doc's "Done when"
  #4; the first live-verifiable slice is Step 5/6). Detail →
  `context/features/58-style-tab-step2-pure-presentation-mapping.md`. **Next → Step 3 (storefront
  stylesheet rules, dormant + the mobile-stacked default).**

**Style tab — Step 1: pure styling domain module (Reshell Phase B, `57-…`, 2026-07-18)**
- First slice of feature 57 and the **start of Reshell Phase B**. New pure, framework-free
  `app/utils/tableStyling.ts` owns the styling vocabulary end to end: the per-knob allowed-value
  `as const` arrays (`ROW_LAYOUTS`, `MOBILE_LAYOUTS`, `SECTION_HEADER_STYLES`,
  `SECTIONS_INITIAL_STATES`, `ROW_DIVIDER_STYLES`, `DENSITIES`, `STYLING_FONT_SIZES`,
  `STYLING_FONT_WEIGHTS`, `STYLING_FONT_STYLES`, `LINE_HEIGHTS`, `LABEL_CASES` + the
  `FONT_SIZE_PX_MIN/_MAX` `10`/`40` and `LABEL_WIDTH_PCT_MIN/_MAX` `20`/`80` bounds), the derived
  types, the resolved `StylingValues` shape, `STYLING_FIELD_NAMES`, frozen
  `DEFAULT_STYLING_VALUES`, `parseStylingValues`, `serializeStylingOverrides`, and `stylingEquals`.
- **One vocabulary end to end** — TS field names = `TableStyling` column names = wire keys =
  metaobject JSON keys; string values = the `data-model.md` §5 comment constants. No renaming at any
  boundary. Layout knobs are **non-null** (defaults resolved at parse time, so a control always has a
  concrete value); colors, typography and `labelWidthPct` are **nullable with null = inherit/theme**
  (semantic — the "Theme" swatch / `Inherit` segment). The DB's "null column = default" convention
  stays at the persistence edge (Step 4).
- **The trust-boundary behavior is the product decision.** `parseStylingValues(unknown)` is tolerant
  and **never throws**: non-object/array → all defaults, unknown keys ignored, each invalid field
  degrading to its **own** default, so a malformed blob (old row, hand-edited metaobject, bad deploy)
  can never blank a merchant's editor or storefront table. Colors are **strict hex only**
  (`#rgb`/`#rrggbb`/`#rrggbbaa`) — these are later emitted into inline `style` attributes on a live
  storefront, so the whitelist is CSS-injection defense in depth (`"#fff;background:url(x)"` →
  `null`). `labelWidthPct` takes integers only, clamped `[20,80]`. `fontSize` is a **union** —
  keyword (theme-relative preset) | px integer | null — accepting **both** boundary shapes (JSON
  number and the DB all-digit string `"18"`), normalized to a number clamped `[10,40]`; `16.5` /
  `"16px"` / `true` → `null`. One parse works unchanged on all three boundaries: Save payload, Prisma
  row (extra `id`/`templateId` ignored), metaobject JSON.
- `serializeStylingOverrides` is the **ONE wire shape** — overrides-only (`{}` = all defaults), the
  exact content of `payload.styling` (Step 5), the metaobject `styling` field (Step 7), and the Step
  13 preset bundles. **Round-trip law** `parse(serialize(v)) === v` is unit-proven for defaults, a
  single override, a px `fontSize`, and a fully-overridden value.
- **Pure + wired to nothing** (verified: the module is imported only by its own test) — no component,
  CSS, schema, migration, dependency, server, persistence or reducer change; zero behavior change
  anywhere. **46 new Node unit tests** (`tableStyling.test.ts`: defaults, shape tolerance, the
  per-knob matrix, `sectionsCollapsible` literal-`true`-only, color accept/reject incl. injection
  strings, `labelWidthPct` clamp/reject, the `fontSize` union, serialize, the round-trip law,
  `stylingEquals` field-flip loop, and the Prisma-row shape). **Full gate green (627 tests, 29 files;
  typecheck, lint, format, build).** **No browser step — the module is pure and renders nothing**
  (per the feature doc's "Done when" #4). Detail →
  `context/features/57-style-tab-step1-pure-styling-domain.md`. **Next → Step 2 (pure presentation
  mapping — `stylingToCssVars` / `stylingToModifierClasses`).**

**Editor page width → "large" (UI polish, 2026-07-13)**
- The editor route's `<s-page>` had no `inlineSize`, so it rendered at the narrow default while the
  templates list uses `inlineSize="large"`. Added `inlineSize="large"` to `app.templates_.$id/route.tsx`
  so the editor matches the list's wider layout. **Safe by construction** — the editor is fully fluid:
  the `EditorShell` card has no max-width, the rows grid columns are proportional, the control row is
  `flex-wrap`, and the bounded inner-scroll (`useScrollRegionHeight`) measures **height only**. The
  device-preview `.previewFrame` already clamps with `max-width:100%` + `margin-inline:auto`, so widening
  only gives the value column + Desktop preview more room and **un-caps the 768px Tablet preview** a
  narrow column used to shrink (the Step 5 "disclosed fidelity compromise"). One-line change, no schema/
  server/persistence/test impact. **Full gate green (581 tests, typecheck, lint, format, build).**
  **Live-verified on the dev store (2026-07-13):** a `/new` template renders the editor grid at the wider
  width and the **Desktop preview fills the wider card**, no overflow/breakage (scratch `/new`, never
  saved — zero DB footprint).

**Device previews — Step 8: docs + full gate + live sign-off — FEATURE 49 / RESHELL PHASE D COMPLETE (`56-…`, 2026-07-13)**
- Eighth and final slice of feature 49 — the feature close. **Ships no runtime code**: a release-gate
  re-run + a consolidated whole-feature live sign-off + the docs that mark Phase D done. Full gate
  **green (581 tests, 28 files; typecheck, lint, format, build)** — matches Step 7, as expected for a
  docs-only step.
- **Live sign-off (2026-07-13) — substantially complete; two cells DB-blocked.** The dev store's
  **existing-template editor route would not load** (a transient Neon/tunnel flap — the same instability
  logged under Step 7): loader-bearing routes hung (CDP screenshot timeouts, spontaneous zoom drift)
  while client-only interactions worked (the `?status=ACTIVE` list filter navigated fine), so the 44-row
  **DJI Mavic** and dynamic-pill **Moto G35** couldn't be opened. Verified the whole preview surface on a
  fresh **`/app/templates/new`** scaffold instead (same `SpecTablePreview`, no stored-template read),
  typing a real row (`Display | 6.7-inch AMOLED, 120Hz`): **Desktop** full-width storefront-styled table
  (bold ~33% label, section rule, hairlines, padding) with editor chrome hidden and the frame **hugging**
  content (auto-height, no inner scrollbar); **Mobile** ~375px centered; **Tablet** ~768px centered;
  widths scale proportionally; **toggle live** (no reload between views); **read-only** (viewing never
  touched the SaveBar; **Edit** restored the interactive grid); **empty state** (select-all → Delete
  [confirm modal showed the correct feature-33 "undo afterward" copy] → 0 rows → centered "No spec rows
  to preview yet…" message, floored at the Step 6 min-height); **console clean** (previews rendering =
  CSP + `allow-scripts` sandbox + height shim all working). **Cleanup:** the scratch `/new` was
  **discarded, never saved** — templates list re-confirmed clean (same 5 templates, no stray "Untitled";
  zero DB footprint).
- **Two matrix cells not re-run today (DB-blocked), already verified live in prior steps on this store:**
  the **dynamic-pill neutral chip** (Step 7, Moto G35) and the **genuinely-long 44-row** no-inner-scrollbar
  + **mobile re-height-on-wrap** (Step 6, DJI Mavic — the scaffold value fit one line at 375px, so
  wrap-driven re-height wasn't re-observed; the auto-height *mechanism* was re-confirmed). **No defect
  found; no source change.**
- **Phase D closes the preview *mechanism*, narrower than the Reshell plan's Phase D** — three
  deliberate deltas recorded for Phase F to reconcile: no live `TableStyling` yet (front-ran Phase B →
  preview inlines the shared storefront CSS), no mobile stacked layout (deferred to the Style-tab mobile
  row-layout option, per PRD line 33 / `admin-screen-plan.md` line 142), and mobile 375px vs the plan's
  390px. **Verified 2026-07-13** that `data-model.md` / `prd.md` / `code-standards.md` need no change and
  that no in-project file except this tracker carries Phase-D status (`admin-screen-plan.md`'s update is
  a Phase-F cleanup task; `feature-roadmap.md` has no phase entry; the Reshell plan was moved out of the
  project). Detail →
  `context/features/56-editor-device-previews-step8-docs-gate-signoff.md`. **Feature 49 complete. Next →
  Reshell Phase E (product assignment).**

**Device previews — Step 7: a11y + read-only hardening + empty state + dynamic-pill affordance (Reshell Phase D, `55-…`, 2026-07-13)**
- Seventh slice of feature 49 — the shopper-facing polish/compliance pass that collects the affordances
  deferred through Steps 3–6. Three preview-facing changes, all strictly **preview-only** (never
  storefront): (1) the inert **dynamic-field pills** now render as a **neutral grey chip**
  (`.appx-spec-table__dynamic-pill`), so a merchant sees which values resolve per-product; (2) a
  friendly **empty state** replaces a blank frame when there are no rows to preview; (3) the iframe's
  **accessible name** now states "preview + device + read-only".
- **The preview-only / storefront-fidelity boundary held throughout** — on a real product page a dynamic
  value resolves to plain text and an empty template renders nothing, so none of this may leak into the
  fidelity layer. Pill + empty-state CSS live in a new **preview-only** section of `previewStyles.ts`
  (never in the drift-guarded `SPEC_TABLE_CSS`, whose byte-equality guard still passes); the empty-state
  HTML lives in `renderSpecTablePreviewDocument` (never in `renderSpecTableHtml`, which is unchanged:
  still `""` for empty). The empty state triggers on **"no `<tr>` rendered"**, covering both zero rows
  and all-hidden. Pill is **neutral, self-contained** (the isolated iframe can't see the admin's
  captured Polaris `--appx-token-color`; neutral ≠ the editor's blue editable-token — correct, it means
  "resolves later"), WCAG **AA** (text #4a5568 on #eef1f5 ≈ 6.65:1; empty-state #6b7280 on white ≈
  4.83:1). No motion (Step 6 height is instant), no interactive elements, sandbox unchanged.
- **4 new/updated unit tests** (empty state for zero-rows **and** all-hidden, non-empty unaffected,
  `renderSpecTableHtml` contract intact, pill CSS present in preview styles but **absent** from
  `SPEC_TABLE_CSS`, view-independence). No renderer row-logic / Step 5 width / Step 6 height mechanism /
  config / extension change; document stays byte-identical across views. **Full gate green (581 tests,
  typecheck, lint, format, build).**
- **Live-verified on the dev store (2026-07-13):** on the Motorola Moto G35 5G preview the Brand/Model
  `vendor` fields render as **neutral grey chips**, clearly distinct from the plain-text resolved values
  (Network, Dimensions, …); on a **zero-row** template (a scratch new template — deleted-all-rows, then
  **discarded, not saved**; templates list re-confirmed clean, no stray template) the preview shows the
  centered empty-state message. Console clean (no CSP/SecurityError); Step 4 styling + Step 5 desktop
  fill + Step 6 auto-height all still hold. (The session's Neon Postgres was intermittently unreachable
  — transient DB flapping, unrelated to the code — which caused CDP/interaction flakiness; the pill +
  empty state rendered correctly whenever the DB was up.) Detail →
  `context/features/55-editor-device-previews-step7-a11y-readonly-empty-state.md`. **Next → Step 8 (docs
  + full gate + live sign-off).**

**Device previews — Step 6: content-driven iframe auto-height (Reshell Phase D, `54-…`, 2026-07-12)**
- Sixth slice of feature 49. The preview iframe now **grows to exactly its content height** — a short
  table hugs (no dead space) and a long one shows every row with **no inner scrollbar** (the admin page
  scrolls). Replaces the provisional fixed `32rem`. The framed document measures itself and
  `postMessage`s the height OUT to the parent, which sizes the iframe.
- **The hard part — a sandbox capability decision.** An iframe needs an explicit height, and Step 3's
  `sandbox=""` (opaque origin, no scripts) severed **both** ways a parent learns content height: reading
  `contentDocument` throws (opaque origin), and no script could run to report it. Auto-height forced
  relaxing exactly one restriction. **Chose `sandbox="allow-scripts"`** (the route Step 3's own comment
  reserved: "avoid same-origin DOM access") over `allow-same-origin` + parent-measure — it honors that
  lock and reacts to **reflow** (a `ResizeObserver` inside the frame), which the toggle needs because
  Step 5 made the `srcDoc` byte-identical across views (a width change doesn't reload the frame, so a
  `load`-only signal would never re-fire). Frame stays a **unique opaque origin**; `allow-same-origin`
  is **never** added (the pair would let a frame clear its own sandbox).
- **Security bound:** a strict CSP meta (`default-src 'none'; style-src 'unsafe-inline'; script-src
  'unsafe-inline'`) leads the document `<head>`, so the only code that runs is our own inline style
  (Step 4) + shim and the frame can make **no network requests** — bounding the newly-granted scripts
  even if the Step 2 escaping ever failed. Parent trusts by **`event.source` identity, not
  `event.origin`** (opaque frame → `origin === "null"`), and runs the height through a pure
  `clampPreviewHeight` (finite/positive/`Math.ceil`/min floor; **no max** — full height, page scrolls).
  No resize loop: content height is width-driven and independent of the element's outer height (+ a
  dedupe guard). Still **read-only** — the parent only reads a number.
- New `previewBridge.ts` holds the single-source `PREVIEW_HEIGHT_MESSAGE_TYPE`, the inline shim, and the
  pure clamp (imported by both the shim-injecting document builder and the parent listener, so they
  can't drift). `.previewFrame` drops the fixed height for a `min-height: 6rem` floor. No renderer
  row-logic / Step 5 width / Step 4 styling / extension / **config** change; the document stays
  byte-identical across views.
- **8 new unit tests** (new `previewBridge.test.ts`: exhaustive `clampPreviewHeight` + shim shape/no
  nested `</script>`; extended `specTablePreviewHtml.test.ts`: shim + CSP + shared constant present,
  view-independence, empty-rows still valid). **Full gate green (577 tests, typecheck, lint, format,
  build).**
- **Live-verified on the dev store (2026-07-12):** on the long **DJI Mavic 4 Pro** (44 rows, ACTIVE)
  the **Desktop** frame shows every row with **no inner scrollbar** (>700px, well past the old 32rem);
  switching to **Mobile** the frame **re-heights taller** as labels/values wrap, still with no inner
  scrollbar (the ResizeObserver reflow path — a load-only signal would have left an inner scrollbar);
  on the short **Portable Handheld Fan** (7 rows) the frame **hugs** the content (no dead space).
  Console clean (no CSP/SecurityError), no oscillation; **Edit** restores the interactive grid; Step 4
  styling (padding, hairlines, bold labels, section rules) + Step 5 widths/centering intact. Detail →
  `context/features/54-editor-device-previews-step6-iframe-auto-height.md`. **Next → Step 7 (a11y +
  read-only hardening + empty state + dynamic-pill affordance styling).**

**Device previews — Step 5: size the iframe to each device width (Reshell Phase D, `53-…`, 2026-07-12)**
- Fifth slice of feature 49. The **Desktop / Tablet / Mobile** toggle now changes the preview's
  **width** (until now all three rendered an identical full-width frame): a new pure
  `previewDeviceWidth(view)` in `deviceView.ts` maps `desktop → "100%"` (fill), `tablet → "768px"`,
  `mobile → "375px"` (a `switch` with an exhaustive `never` default). `SpecTablePreview` spreads it
  into the iframe's inline `style={{ width }}` (dynamic per render); `.previewFrame` drops the static
  `width:100%` and adds `max-width:100%` (clamp) + `margin-inline:auto` (center a narrow fixed frame).
- **Design calls (documented):** fixed widths are **CSS px, not rem** — a phone is 375 CSS px
  regardless of the admin's root font size, so rem would let admin typography distort the emulated
  device (a deliberate exception to the module's rem convention). Desktop **fills** rather than
  pinning a fake desktop px the narrow admin column could never show. `max-width:100%` means a fixed
  frame wider than the column **shrinks instead of overflowing** — a disclosed fidelity compromise
  (a "768px" tablet in a narrow column is capped, never a horizontal scrollbar on the editor).
- **Self-contained:** the storefront `spec-table.css` has **no `@media` rules** (verified), so
  narrowing the frame only changes text **wrapping** — no responsive layout swap (the mobile
  row-layout option is out of feature 49). Renderer / `srcDoc` / `spec-table.css` / reducer / schema
  / server / persistence / **config** all untouched; the document string is identical across views.
- **3 new pure unit tests** for `previewDeviceWidth` (exact `100%`/`768px`/`375px`, totality across
  the three device views, desktop-only-fill vs. tablet/mobile `\d+px`). **Full gate green (569 tests,
  typecheck, lint, format, build).**
- **Live-verified on the dev store (2026-07-12)** on the real Motorola Moto G35 5G template: **Desktop**
  fills the stage; **Tablet** renders a fixed ~768px frame **centered** with visible gutters; **Mobile**
  a fixed ~375px frame, still centered, wrapping more tightly (e.g. "Dual SIM (Nano-SIM, dual stand-by)"
  breaks to two lines) — the three widths scale proportionally (mobile:tablet ≈ 0.47 vs. 375:768 ≈
  0.49). No editor horizontal overflow at any width; toggle swaps live with no reload; **Edit** restores
  the fully interactive grid; Step 4 storefront styling (padding, hairlines, ~33% bold label column)
  renders inside every device width; dynamic fields still show **plain pill text** (Step 7). Detail →
  `context/features/53-editor-device-previews-step5-device-width-sizing.md`. **Next → Step 6 (iframe
  content-driven auto-height).**

**Device previews — Step 4: load the shared storefront stylesheet into the iframe (Reshell Phase D, `52-…`, 2026-07-12)**
- Fourth slice of feature 49. The preview now **looks like the storefront table**: the theme app
  extension's `assets/spec-table.css` is inlined into the iframe document as a `<style>` (padding,
  row hairlines, ~33% bold label column, section rule). New `previewStyles.ts` holds the storefront
  CSS as `SPEC_TABLE_CSS` + a **minimal neutral preview-page ambient** (`body` system sans-serif
  reset so the preview isn't the browser-default serif — explicitly NOT storefront table CSS and NOT
  merchant-theme replication) and exports `PREVIEW_DOCUMENT_STYLES`. `renderSpecTablePreviewDocument`
  injects it into the `<head>`; stays pure. **Inlined, not `<link>`ed** — the sandboxed
  opaque-origin `srcDoc` frame has no reliable URL to the CDN-served asset.
- **Single-source-of-truth via a drift GUARD, not a build import.** First tried a Vite `?raw` import
  of the extension file, but importing across the app→extensions boundary is fragile in
  `shopify app dev`: `extensions/` sits outside `server.fs.allow`, the dev server blocks the read,
  and the editor client bundle **fails to hydrate** (dead toggle, blank value cells) — even after
  adding `"extensions"` to `fs.allow` and restarting (the vite.config route proved unreliable). So
  the CSS is a **plain-string copy in `previewStyles.ts`** (zero dev-server coupling) and a unit test
  **reads the real `spec-table.css` and asserts byte-equality** (line-endings normalized). Silent
  drift is impossible — change the storefront CSS and the test fails until the copy matches — the
  same guarantee the `?raw` import promised, robustly. `vite.config.ts` / `vitest.config.ts` /
  `globals.d.ts` all reverted to baseline; **no npm dependency, no config change ships.**
- Pill affordance styling stays **Step 7** (reconciled the Step 3 doc's "4/7"); device sizing →
  Step 5, auto-height → Step 6. No `spec-table.css` edit (read only), no reducer / schema / server /
  persistence change.
- **Unit tests updated** (the Step 3 "no stylesheet yet" invariant flips): `<style>` in `<head>`,
  no `<link>`, exact `PREVIEW_DOCUMENT_STYLES` payload present, real storefront selectors inlined,
  ambient present, empty-rows still valid, **+ the byte-for-byte drift guard vs. the extension file.**
  **Full gate green (566 tests, typecheck, lint, format, build).**
- **Live-verified on the dev store (2026-07-12)** on the real Motorola Moto G35 5G template: Desktop
  / Tablet / Mobile each render the **storefront-styled** table in the iframe — sans-serif (ambient),
  left-aligned cells with padding, row hairline borders, ~33% bold label column (matching
  `spec-table.css`), all three full-width (sizing is Step 5); dynamic fields still render as **plain
  pill text** ("Field · vendor", not the editor's blue styled pill — Step 7); **Edit** restores the
  fully interactive editable grid. (Settings-tab-with-preview invariant unchanged from Step 3, whose
  plumbing Step 4 doesn't touch.) Detail →
  `context/features/52-editor-device-previews-step4-shared-stylesheet.md`. **Next → Step 5 (device
  width sizing — `previewDeviceWidth(view)`).**

**Device previews — Step 3: render the markup in a sandboxed iframe (Reshell Phase D, `51-…`, 2026-07-12)**
- Third slice of feature 49 — the **first painting step**. New `SpecTablePreview.tsx` feeds the
  live `engine.rows` through a new pure `renderSpecTablePreviewDocument(rows)` (wraps
  `renderSpecTableHtml` in a minimal, **style-free** `<!doctype html>` shell) into a **sandboxed
  `<iframe srcDoc>`**, so the Desktop / Tablet / Mobile toggle now shows the **real (still
  unstyled) storefront markup** of the working table. `SpecTableEditor` swaps the Step 1
  `DevicePreviewPlaceholder` (+ its `DEVICE_LABELS`) for `<SpecTablePreview rows={engine.rows}
  view={view} />`; `EditorShell` unchanged. Read-only by construction (reads rows, never
  dispatches; `srcDoc` recomputed from current rows each render).
- **Security:** `sandbox=""` (empty token list) = most restrictive — no scripts, no forms, no
  popups, **unique opaque origin** (no `allow-same-origin`) — a defense-in-depth layer beneath
  Step 2's HTML escaping (matters for merchant-authored content in a production app). Noted for
  Step 6: auto-height must avoid same-origin DOM access into the frame.
- **Provisional & deferred:** frame chrome (`.previewFrame` — `display:block`, `width:100%`, a
  fixed `height:32rem`, hairline border, white surface) is the iframe **element's** chrome, not
  storefront content styling; **width → Step 5** (`previewDeviceWidth`), **height → Step 6**
  (auto-height). No shared `spec-table.css`/pill visuals yet (Step 4), no a11y/empty-state
  hardening yet (Step 7). `view` is consumed only for the iframe `title`. No reducer / schema /
  dependency / server / persistence change.
- **4 new pure unit tests** for the document wrapper (well-formed doc, body carries the exact
  `renderSpecTableHtml` fragment, empty-rows stays valid/blank-body, **no-stylesheet-yet**
  invariant). **Full gate green (563 tests, typecheck, lint, format, build).**
- **Live-verified on the dev store (2026-07-12)** on the real Motorola Moto G35 5G template
  (19 rows): Desktop / Tablet / Mobile each swap the stage to an **iframe** rendering the rows as
  a real unstyled HTML table — dynamic fields as **plain pill text** ("Field · vendor", not the
  editor's blue styled pill), `hideWhenEmpty` empty rows **absent**; all three views identical
  full-width (sizing is Step 5); **Edit** restores the fully interactive grid; and on the
  **Settings tab** a device view keeps the Settings sidebar in place beside the iframe. No SaveBar
  (view state is client-only — previews never mutate the model). Detail →
  `context/features/51-editor-device-previews-step3-render-in-iframe.md`. **Next → Step 4 (load the
  shared `spec-table.css` into the iframe).**

**Device previews — Step 2: pure storefront-markup renderer (Reshell Phase D, `50-…`, 2026-07-12)**
- Second slice of feature 49. New pure `app/routes/app.templates_.$id/specTablePreviewHtml.ts`
  exporting `renderSpecTableHtml(rows: EditorRow[]): string` — the **fidelity contract**: it
  hand-mirrors the storefront markup (`blocks/spec_table.liquid` + `snippets/spec-table-value.liquid`)
  so Step 3 can drop the string into a sandboxed iframe and Step 4's shared `spec-table.css`
  styles it with **zero drift**. Same class names/structure as the storefront (`appx-spec-table`
  div → table → tbody; section `<th colspan=2 scope=colgroup>`; data `<th …__label scope=row>` +
  `<td …__value>`); TEXT escaped (author whitespace preserved), `LINE_BREAK → <br>`; whole-cell
  **hideWhenEmpty** gate mirrored (skip iff flag AND the cell's visible text — TEXT + pill labels,
  `<br>` ignored — is all-whitespace).
- **One intentional divergence:** dynamic parts (`SHOPIFY_FIELD`/`METAFIELD`) have no product
  context in the admin, so they render as **inert labeled pills** (`<span class="appx-spec-table__dynamic-pill"
  title=…>`) via the editor's own pure `tokenLabels` (single source of truth for the pill text) —
  so any cell containing a pill always survives the hideWhenEmpty gate. Also **no `ACTIVE` status
  gate** and no `block.shopify_attributes` (storefront-only). Own small `escapeHtml` (`& < > " '`),
  since the repo has none.
- **Pure + wired to nothing** (Step 3 consumes it): no component / iframe / CSS / width sizing,
  and no reducer / schema / dependency / persistence / server change. `EditorShell` /
  `SpecTableEditor` from Step 1 unchanged. **16 new Node unit tests** (`specTablePreviewHtml.test.ts`
  — empty, wrapper, section, data, LINE_BREAK, both pills, mixed-order/whitespace, escaping/no-injection,
  the five hideWhenEmpty cases, array-order mix). **Full gate green (559 tests, typecheck, lint,
  format, build).** No browser step (pure). Detail →
  `context/features/50-editor-device-previews-step2-storefront-markup-renderer.md`. **Next → Step 3
  (render the markup in an iframe → `SpecTablePreview.tsx`).**

**Device previews — Step 1: toggle swaps the stage (Reshell Phase D, `49-…`, 2026-07-12)**
- First slice of feature 49 (make the editor's **Desktop / Tablet / Mobile** toggle
  functional — read-only storefront previews). This step wires **only the plumbing**: the
  device toggle now **swaps the stage** for a temporary placeholder; **Edit** returns to the
  editable grid. New pure `deviceView.ts` (`ViewId`/`DeviceView` types + an `isPreviewView`
  type guard carrying the "render the preview slot only off-Edit" decision); `EditorShell`
  gains a `preview?: (view) => ReactNode` render-prop rendered in place of `stage` when
  `isPreviewView(activeView)` (falls back to `stage`, so the prop is backwards-safe), in
  **both** stage branches; `SpecTableEditor` passes a throwaway `DevicePreviewPlaceholder`.
  Previews replace the **stage only** — the sidebar's show/hide stays governed by `activeTab`.
- **No renderer / iframe / stylesheet / width sizing / CSS**, and no reducer / schema /
  dependency / persistence / server change — all deferred to steps 2–8 (locked design:
  sandboxed iframe rendering the storefront markup + shared `spec-table.css`; dynamic fields
  as labeled pills; `TableStyling` + the mobile cards-vs-scroll option deferred to the Style
  tab). 3 new pure unit tests (`deviceView.test.ts`). **Full gate green (544 tests,
  typecheck, lint, format, build).**
- **Live-verified on the dev store (2026-07-12)** in the real editor (Motorola Moto G35 5G):
  Edit shows the editable grid; **Desktop / Tablet / Mobile** each swap the stage to the
  correctly-named "{Device} preview" placeholder (grid + toolbar hidden, `view` arg threaded);
  Edit restores the fully interactive grid; and on the **Settings tab** a device view keeps
  the Settings sidebar in place while the stage shows the preview. Nothing saved (view state
  is client-only). Detail → `context/features/49-editor-device-previews-step1-toggle-plumbing.md`.

**Templates list — dynamic assigned-product count (`48-…`, 2026-07-12)**
- The list's "Assigned Products" column was a hardcoded `0` (`listTemplatesForShop`
  returned `assignedProductCount: 0`). Now it shows the **real product count** per
  scope: `PRODUCT` → # distinct INCLUDE rows (Postgres, exact); `ALL_PRODUCTS` →
  shop `productsCount` − EXCLUDE carve-outs (clamped ≥ 0); `COLLECTION` → Σ
  `collection.productsCount`; `PRODUCT_TYPE`/`VENDOR` → `productsCount(query:)`;
  NONE → 0. Merchant chose **true counts** over a scope label.
- New `app/shopify/assignedProductCounts.server.ts` (pure grouping / lookup-collect /
  aliased-query builder / response narrower / per-template arithmetic + a live
  orchestrator, mirroring `assignmentConflict.server.ts`). Every broad-scope lookup is
  collapsed into **ONE** batched, aliased `productsCount`/`collection` query
  (**O(1)** Admin requests regardless of template count; **skipped entirely** when only
  PRODUCT/NONE exist), each value passed as a GraphQL **variable** (injection-safe).
  **Fail-soft** (cosmetic admin count, not the storefront): an Admin failure → live
  counts `null` (rendered `—`) while PRODUCT/NONE still resolve. Shop-isolated (Prisma
  `where { shopId }` + session-bound `admin`).
- `listTemplatesForShop` stays pure Postgres (drops the fake count); the list loader
  merges `resolveAssignedProductCounts` (a missing template → 0). `TemplateListItem`
  gains `assignedProductCount: number | null`; new `formatAssignedCount` renders the
  integer (thousands-separated) or `—`. GraphQL validated @ 2025-10 (`read_products`).
  **25 new tests; full gate green (541 tests, typecheck, lint, format, build).**
  **Live-render on the dev store still pending.** Detail →
  `context/features/48-templates-list-assigned-product-count.md`.

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

**Product assignment engine — multi-value scopes, UI (`47-…`)**
- Exposes feature 46's multi-value server to the merchant: the editor's
  `PRODUCT`/`COLLECTION` scope control is now a **multi-select picker → chip list**
  (one labelled chip per selected product/collection, per-chip Remove + "Add more
  products/collections", `resourcePicker({ multiple: true, selectionIds })`) —
  mirroring feature 45's EXCLUDE control. `PRODUCT_TYPE`/`VENDOR` keep the single
  text field; `ALL_PRODUCTS`/`NONE` unchanged. **Pure presentational + client-state
  slice — no server / gate / writer / projection / Decision-C change** (all shipped
  in 46). **No migration.** Full gate green (**504 tests**, typecheck, lint, format,
  build).
- **Loader reshape — closes feature 46's Step-5 hazard.** The editor loader now reads
  the **full** INCLUDE set via `getTemplateIncludeSelectors` (replacing the single-row
  `getAssignmentForTemplate`, which returned one arbitrary row of an N>1 set and would
  have collapsed it on Save) and batch-resolves chip labels in **one** `nodes(ids:)`
  query (new `resolveScopeValueLabels`, fail-soft to the GID) instead of N round-trips.
  So an **N>1 template now round-trips through the editor without loss** — a multi-value
  template is finally safe to open + Save in the editor. `route.tsx` returns
  `assignment: { scope, values: { value, label }[] }` (or null for an empty set).
- **Engine + helpers**: `useRowEngine` carries a value **set**
  (`scopeValues: { value, label }[]`, seeded from `initialScopeValues`) with
  `setScopeKind` (a kind change **resets** the set — the homogeneous-kind invariant)
  + `setScopeValues`; the dirty snapshot + Save payload carry the raw values
  (order-independent, sorted), sent as `payload.scopeValues[]` which
  `parsePendingScope` already reads. New client-safe `isScopeSetComplete` (retires the
  scalar `isScopeComplete`) drives the Save-disable: **a valued kind with zero values
  is incomplete, not a clear** (only `NONE` clears — the UX feature 46 deferred here).
- **~13 new/changed tests**: `isScopeSetComplete` boundaries (multi-value PRODUCT 0/1/N,
  single-valued TYPE/VENDOR reject N>1) + `resolveScopeValueLabels` (N→N labels,
  `!ok`/throw/malformed → fail-soft identity map, non-resource kind → value-is-label,
  no query for empty set). GraphQL validated @ 2025-10 (`read_products`).
- **Live-verified on the dev store (2026-07-11):** through the real editor, set a
  PRODUCT scope → the **multi-select "Add products" picker** ("2 products selected") →
  **two labelled chips** (DJI Air 3S + DJI Flip Drone) with Remove + "Add more
  products"; the incomplete inline error ("Choose at least one product…") showed at 0
  chips and cleared at ≥1; the SaveBar opened on the kind change and Save enabled once
  complete. Create-on-first-save wrote **two `INCLUDE PRODUCT` rows** (Neon), and a
  **fresh reload from the DB reloaded both chips** with batch-resolved titles — the
  46 loader-collapse hazard is closed. Test template deleted after (Neon: 0 rows).
  The ACTIVE→routing→storefront + gate-block paths were **not** re-run live — that
  server is byte-unchanged from feature 46 (live-verified 2026-07-11) and the dev
  store was being modified in parallel. (One transient `Failed to fetch` on the
  create-Save *response* — a dev-tunnel/HMR blip; the server side-effect completed,
  two rows written.) Detail → `context/features/47-multi-value-scopes-ui.md`.
- **Chip visual polish — Kaching-style cards (follow-up, 2026-07-11).** The scope
  chips (and the `ALL_PRODUCTS` EXCLUDE "Except these products" chips) are now
  **[thumbnail] [title] [red trash button]** cards on one row (a shared
  `ResourceChipCard`, a 3-column `auto 1fr auto` grid + `background="base"`/border so
  the row never wraps and reads as a distinct tile against the subdued sidebar) —
  replacing the plain title + text "Remove" link, matching the Kaching Bundle
  reference the merchant shared. Thumbnails come from the resource picker at pick time
  (`images[]`/`image`) and, on reload, from the loader: `resolveScopeValueLabels` was
  reshaped into **`resolveScopeResourceDetails`** returning a `GID → { label, image }`
  map — `Product.featuredImage.url`/`Collection.image.url` fetched in the **same**
  batched `nodes(ids:)` query as the titles (no extra round-trip; fail-soft to a null
  image → `s-thumbnail` placeholder). Excludes moved onto that same batched resolver
  (one query, was N single `node` calls; the scalar `resolveScopeValueLabel` is
  retired). Display-only — no persistence/gate/routing change. Full gate green
  (**506 tests**, typecheck, lint, format, build); markup + GraphQL validated with the
  Shopify MCP validators. **Live-verified:** the picker rendered two Kaching-style
  cards with real drone thumbnails + red trash buttons on a `/new` template (discarded,
  zero DB footprint).
- **Long-list collapse + picker preselect (follow-up, 2026-07-11).** So a 100-product
  assignment doesn't stack 100 cards in the sidebar, a shared `CollapsibleChipList`
  (`MAX_INLINE_CHIPS = 4`) renders both chip lists (scope + `ALL_PRODUCTS` excludes)
  inline up to 4, then collapses behind a **"View all selected (N)"** toggle that
  expands into a height-capped (~20rem) scroll `<div>` ("Show less" re-collapses); the
  "Add more / Select" button stays visible throughout. Matches the Kaching Bundles
  collapse the merchant shared. Also aligned the EXCLUDE picker (`addExcludes`) with the
  scope picker: it now passes `selectionIds` (current exceptions) + REPLACES from the
  returned set, so reopening either picker shows the current selection **checked**
  (uncheck-to-remove). Pure client-side, display-only. Gate green (**506 tests**,
  typecheck, lint, format, build). **Live-verified on the dev store (2026-07-11):** a
  `/new` PRODUCT scope with 6 products collapsed to a **"View all selected (6)"**
  button (no stacked cards); clicking it expanded the full list inside a height-capped
  scroll container (thumbnails + trash) with **"Show less"**, which re-collapsed it.
  Discarded — zero DB footprint.

**Scope picker — MVP option trim (UI-only, 2026-07-11)**
- The assignment scope `<s-select>` now offers only **No products / All products /
  A specific product**. `PRODUCT_TYPE` / `VENDOR` / `COLLECTION` are hidden from the
  picker pending merchant demand. Implemented as a UI-only projection: `SCOPE_OPTIONS`
  stays the full source of truth (server validation, gate, routing, engine, and the
  multi-value PRODUCT/COLLECTION machinery all unchanged); a new
  `HIDDEN_SCOPE_KINDS` set + derived `VISIBLE_SCOPE_OPTIONS`
  (`assignmentScope.ts`) drives the picker, so re-enabling any hidden kind is a
  one-line removal. `SettingsTab.tsx` renders `VISIBLE_SCOPE_OPTIONS`. 3 new tests;
  full gate green (typecheck, lint, build). No migration, no persistence change.
  **Live-verified on the dev store (2026-07-11):** the editor's "Show this table on"
  dropdown (Portable Handheld Fan template) now lists exactly **No products (not
  assigned) / All products / A specific product** — type/vendor/collection absent.
  Read-only check; nothing changed or saved.

**Status picker — Archived option trim (UI-only, 2026-07-11)**
- Both status `<s-select>`s (the editor Settings status control + the templates-list
  "Change status" modal) now offer only **Draft / Active**. `ARCHIVED` is hidden from
  the pickers pending merchant demand. Same UI-only-projection pattern as the scope
  trim: `TEMPLATE_STATUS_OPTIONS` stays the full source of truth (the Prisma enum,
  `validateTemplateStatus`, and `BADGE_TONES` all still carry ARCHIVED); a new
  `HIDDEN_STATUS_VALUES` set + derived `VISIBLE_TEMPLATE_STATUS_OPTIONS`
  (`templateStatus.ts`) drive the two pickers, so re-enabling is a one-line removal.
  `SettingsTab.tsx` + `app.templates.tsx` render `VISIBLE_TEMPLATE_STATUS_OPTIONS`;
  the two subdued help lines dropped their now-unreachable "and Archived" mention.
  The ARCHIVED badge tone is intentionally kept so any pre-existing ARCHIVED template
  still renders its neutral badge. 4 new tests. No migration, no persistence change.
- **Follow-up (2026-07-12): the list's "Archived" filter tab is now also removed.**
  `STATUS_FILTER_OPTIONS` (a new single source of truth in `templateFilter.ts`, offering
  only All / Active / Draft) drives both the rendered tabs (`app.templates.tsx` no longer
  owns a local `STATUS_FILTERS`) and the ?status= URL allow-list; `normalizeStatusFilter`
  now derives its selectable set from it, so a stale `?status=ARCHIVED` bookmark **falls
  back to "All"** instead of showing an orphan filter with no active tab. `StatusFilter`
  still admits ARCHIVED and `filterTemplatesByStatus` still supports it (harmless; re-adding
  the tab is a one-line restore). 3 new tests. Full gate green (**516 tests**, typecheck,
  lint, format, build).
- **Live-verified on the dev store (2026-07-12):** the Templates list filter row now reads
  exactly **Status · All · Active · Draft** (no Archived tab), and navigating directly to
  `…/app/templates?status=ARCHIVED` correctly fell back to the **All** view (All chip active,
  all templates shown). **Both status dropdowns were also re-driven live the same pass:** the
  editor Settings **Status** control (DJI Mavic 4 Pro Fly More Combo) and the list **Change
  status** modal each expand to exactly **Draft / Active** (no Archived), and both show the
  updated "Draft is hidden." helper copy. Read-only checks — the dropdown/modal were closed
  without saving, so the template's ACTIVE status was left unchanged; nothing was saved.

**Product assignment engine — multi-value scopes, server (`46-…`)**
- Relaxes "exactly one INCLUDE rule per template" to **1..N INCLUDE rows for
  `PRODUCT` and `COLLECTION`** (selected products / collections); `ALL_PRODUCTS` /
  `PRODUCT_TYPE` / `VENDOR` stay single-valued. **Server + route-action only — the
  multi-select UI is feature 47** (the single-select picker keeps working via a
  legacy `scopeValue` → 1-element-set normalization). **No migration.** Full gate
  green (**496 tests**, typecheck, lint, format, build). **Spec was adversarially
  stress-tested before build** (`context/features/46-multi-value-scopes-server.md`),
  which surfaced one real latent-feature-45 bug (Decision C, below) + a naming trap
  + test-plan gaps, all folded in.
- **New invariant — one scope KIND per template, homogeneous INCLUDE set.**
  `setTemplateScope(shopId, templateId, ScopeSelector[])` (was a single selector):
  validates arity via a new `MULTI_VALUE_SCOPES = {PRODUCT, COLLECTION}` predicate
  (deliberately **distinct** from `assignmentOverlap`'s per-product `SINGLE_VALUED`
  — the naming trap the stress-test caught), enforces kind homogeneity, dedupes,
  `$transaction` delete-INCLUDE-then-`createMany`. New `getTemplateIncludeSelectors`
  read (all INCLUDE rows as selectors) feeds the gate + the action diff; the loader
  keeps single-row `getAssignmentForTemplate` for the single-select UI.
- **Gate over selector sets** (`assignmentActivation.server.ts`): candidate is now a
  `ScopeSelector[]`; two templates collide iff **any** `(candidateSelector,
  otherSelector)` pair overlaps. The gate loops `partitionOverlaps` per candidate
  selector (feature 38 + 39 **unchanged**), collects colliding pairs, subtracts
  EXCLUDE carve-outs **per pair** (new pure exported `resolvedByExclude`), then
  dedupes to distinct templates **last** — subtract-before-dedupe, so a multi-value
  *other* partially covered by the candidate's excludes still blocks via its
  un-excluded members. Fails closed unchanged (any per-selector probe throw blocks).
- **Decision C — a product is never both INCLUDE'd and EXCLUDE'd on one template**
  (closes a latent feature-45 disjoint-set bug: `ALL_PRODUCTS + EXCLUDE X` re-scoped
  to `PRODUCT:X` left a stale `EXCLUDE X` that made the gate wrongly resolve a real
  `PRODUCT:X` vs `PRODUCT:X` collision, since `byProduct` beats the exclude gate on
  the storefront). Enforced three ways: `setTemplateScope` deletes contradictory
  `EXCLUDE PRODUCT` rows in-transaction; the editor action reconciles PENDING
  excludes against the pending INCLUDE set before gating + writing
  (`reconcileExcludes`); the gate strips the candidate's self-included products
  (defense in depth).
- **Save action** (`route.tsx`): pure parse/diff helpers extracted to
  `pendingAssignment.ts` (unit-testable) — `parsePendingScope` (accepts a
  `scopeValues` array *and* the legacy single `scopeValue`), `selectorSetKey`
  (order-independent set diff), `reconcileExcludes`, `parsePendingExcludes`,
  `sameGidSet`. Both create + edit branches thread the **full** selector array
  through the gate + `setTemplateScope`; the routing rebuild fires on a set change.
  The list-page status action (`app.templates.tsx`) needed **no change** (it gates
  with no candidate → reads the persisted set via `getTemplateIncludeSelectors`).
- **~50 new/migrated tests**: write-path arity/homogeneity/dedupe/Decision-C +
  `getTemplateIncludeSelectors`; gate multi-value (un-excluded-member block,
  subtract-before-dedupe trap, probe-confirmed exclude resolution, dedupe-by-template,
  probe-free block, Decision C, default-read migrated to `getTemplateIncludeSelectors`)
  + a pure `resolvedByExclude` block; `pendingAssignment` parse/diff/reconcile;
  N-row routing projection + flatten.
- **Live-verified end to end on the dev store (2026-07-11; store restored to its
  exact pre-test baseline after).** Via a throwaway test template seeded through a
  temporary scratch route (`setTemplateScope` with **two** PRODUCT selectors), then
  removed: (1) Neon showed **two INCLUDE PRODUCT rows** written by `createMany`;
  (2) `rebuildShopRouting` projected **both** products into `byProduct` → the one
  template handle and re-stamped the `$app:routing` metafield; (3) storefront — the
  clean product (Motorola Edge 60, no override) **rendered the multi-value-assigned
  table via tier-2 `byProduct`**, while the other (Moto G35, a leftover tier-1
  override) correctly rendered **its override table instead** (3-tier precedence
  intact); (4) the real `evaluateActivationConflicts` **BLOCKED** a candidate
  overlapping the multi-value ACTIVE template (naming it) and **PASSED** a free
  product — the disjoint gate reads a multi-value ACTIVE template's full selector
  set. The single-select path was already evidenced live (the ACTIVE "Motorola Moto
  G35 5G" template carries a single PRODUCT scope + a `byProduct` entry under the new
  code). Cleanup deleted the test template(s), rebuilt routing to baseline (Edge 60
  then rendered nothing), and the original 4 templates + their rules were confirmed
  untouched. Detail → `context/features/46-multi-value-scopes-server.md`.

**Product assignment engine — EXCLUDE carve-outs (`45-…`)**
- Turns the inert `mode: EXCLUDE` schema (features 37/40) into a live feature: a
  merchant can carve specific products out of an `ALL_PRODUCTS` template ("all
  products EXCEPT X"), so X falls through to its own dedicated table or renders
  nothing. **No migration** — application code only. All 8 code steps landed; full
  gate green (**446 tests**, typecheck, lint, format, build) + Theme Check (4 files,
  0 offenses). **Live-verified end to end on the dev store (Step 7), 2026-07-09.**
- **Live verification (2026-07-09, store restored to exact pre-test state after):**
  set template A = `ACTIVE, ALL_PRODUCTS, EXCLUDE product X` (X = DJI Air 3S) via the
  new UI → the **"Except these products" control appeared only under ALL_PRODUCTS**,
  the multi-select picker added a **chip with the resolved product title** + Remove,
  and Save persisted it (Neon: coexisting `INCLUDE ALL_PRODUCTS` + `EXCLUDE PRODUCT`
  rows; routing metafield: `defaultTemplateHandle=template-A` **and**
  `excludedProductGids=[X]` — **Step 6 confirmed, writer unchanged**). Storefront
  (App-Bridge product Preview, reads live metafields): a **clean non-excluded sibling
  (Edge 60, no override) rendered A's catch-all table**, while **X rendered nothing**
  (carved out of the broad tier). Then B = `ACTIVE, PRODUCT X` → **gate ALLOWED it
  (no conflict banner)** because A excludes X (Decision A), routing added
  `byProduct[X]=template-B`, and **X's page then rendered B** — proving **Decision B
  (byProduct beats the exclude gate)**; X carries **no per-product override**
  (checked in admin), so this was pure tier-2 routing, not tier-1. Finally, removing
  A's carve-out while B stayed ACTIVE → **Save BLOCKED with the critical banner naming
  "Motorola Moto G35 5G"**, nothing written (the `excludesChanged` gate re-check).
  Decision A thus proven **both directions** live. (Aside: a leftover tier-1 override
  on the Moto G35 product — unrelated to feature 45 — initially masked the catch-all
  test until diagnosed.)
- **Write path** (`assignment.server.ts`): `setTemplateExcludes` (validates each GID
  via `validateScope("PRODUCT", …)`, ownership-gated, `$transaction`
  delete-EXCLUDE-then-`createMany`, touches ONLY `mode: EXCLUDE` so the INCLUDE
  scope survives — the mirror of `setTemplateScope`), `getExcludesForTemplate` (the
  loader read), `getActiveExcludesByTemplate` (the gate read, grouped by templateId,
  shop-scoped, candidate excluded). 15 new unit tests (shop isolation, invalid-GID
  reject, atomic replace, dedupe, empty-clear).
- **Gate subtraction (Decision A)** (`assignmentActivation.server.ts`):
  `evaluateActivationConflicts` gained a `candidateExcludes?` param and subtracts a
  PRODUCT-attributable collision when the product is excluded on the covering side —
  the two decidable cases (candidate `PRODUCT:X` & other excludes X; other
  `PRODUCT:X` & candidate excludes X). **Broad×broad still blocks** (a finite GID
  list can't prove disjointness; the probe returns existence, not which product).
  The subtraction is a filter **around** the pure INCLUDE resolver (feature 38's
  matrix untouched). Fails closed unchanged. 5 new gate tests (both cases resolve;
  wrong-product still blocks; broad×broad never resolves; persisted-excludes path).
- **Storefront reorder (Decision B)** (`snippets/spec-table-resolve.liquid`): moved
  `byProduct` **ahead of** the `excludedProductGids` gate so an excluded product
  still reaches its own explicit assignment; the exclude gate now only carves out
  the broad tiers (`byType`/`byVendor`/`byCollection`/default). New order: override →
  `byProduct` → exclude gate → broad tiers. **A real storefront bug** (only a live
  storefront surfaces it) — Step 7 live-verifies. Routing writer unchanged
  (`rebuildShopRouting` already selects all modes → EXCLUDE PRODUCT rows flow through
  feature 40 into `excludedProductGids`; confirmed, no change).
- **Engine + Save** (`useRowEngine.ts`, `route.tsx`): engine gained
  `excludes`/`excludeLabels`/`setExcludes`, into the meta-JSON dirty snapshot
  (sorted → order-independent) + Save payload; loader resolves each GID→title
  (fail-soft to GID, concurrent) and seeds the engine. Action parses pending
  excludes, feeds them to the gate, persists via `setTemplateExcludes` (before
  status, with the scope write), and rebuilds routing when an ACTIVE template's
  excludes changed — the gate trigger + rebuild trigger both extended with
  `excludesChanged` (removing a carve-out can re-create a conflict).
- **UI** (`SettingsTab.tsx`): an "Except these products" section shown **only under
  `ALL_PRODUCTS`** (settled decision — the one scope where a carve-out is always
  honorable, since ALL_PRODUCTS overlaps everything so only a PRODUCT:X template can
  coexist). Multi-select product `resourcePicker` (merge/dedupe) → chip list with
  per-chip Remove + an "Add more products" button; rides the SaveBar. PRODUCT-only
  (no Collections option). Hidden for every other scope.

**Product assignment engine — scope picker UI + rich conflict warnings (`44-…`)**
- The assignment engine is now **merchant-driven end to end**. The editor **Settings
  tab** (`SettingsTab.tsx`) gained an assignment scope picker below the status
  control: a scope-kind `<s-select>` (None / All products / A product / Product
  type / Vendor / A collection) + a conditional value control — an App Bridge
  `resourcePicker` (single-select) for PRODUCT/COLLECTION rendering a title chip, a
  free-text `<s-text-field>` for PRODUCT_TYPE/VENDOR, nothing for None/All. Scope
  **rides the SaveBar** exactly like status: `useRowEngine` gained
  `scope`/`scopeValue`/`scopeValueLabel` state + `setScope`, added to the meta-JSON
  dirty snapshot (`{ rows, name, status, scope, scopeValue }`) and the Save payload,
  seeded from new loader-returned `assignment`. One Save persists rows, name,
  status, and scope together; Discard reverts all of them. An **incomplete scope**
  (a valued kind with no value) disables Save (client mirror `isScopeComplete` +
  `SCOPE_OPTIONS`/`SCOPE_NONE` in `assignmentScope.ts`).
- **The gate now evaluates the PENDING scope** (feature 42 left "ACTIVE-scope-edit"
  here): `evaluateActivationConflicts(admin, shopId, templateId, candidateScope?)`
  takes an optional pending scope (default: the persisted rule, preserving 42's
  callers), so an ACTIVE template's scope edit re-verifies disjointness **before any
  write** — no persist-then-rollback. The editor Save runs the gate when
  `willBeActive && (!wasActive || scopeChanged)`; on a block it writes **nothing**
  (atomic block — rows, name, status, scope, metaobject, routing all untouched) and
  returns the structured `conflicts`. Scope is written **before** status so an
  ACTIVE template's persisted scope is always the gate-checked one. Routing rebuilds
  on membership OR content change (new pure `shouldRebuildRoutingForScopeSave`). The
  **create path** now gates create-as-ACTIVE-with-scope too (excluded from its own
  set; blocks before creating).
- **Rich conflict banner** (`SettingsTab.tsx`): a blocked activation renders a
  persistent `s-banner` (critical) from the engine's `conflicts` — names each
  colliding template with a link (`/app/templates/{id}`) + the three resolutions
  (narrow / clear / other-to-Draft). Cleared when the merchant edits the pending
  scope/status or a save succeeds. `activationBlockedMessage` stays the toast
  fallback. A scope-less **ACTIVE** template shows a warning (renders nowhere).
- New `app/shopify/scopeResourceLabel.server.ts` resolves a PRODUCT/COLLECTION GID
  to its resource title for the picker chip (loader-side, batched, **fails soft** to
  the GID — display only, never blocks the load; GraphQL validated @ 2025-10,
  `read_products`). **Shop isolation** holds throughout (scope write, gate reads,
  label query all session-bound / `where { shopId }`). 12 new unit tests
  (`isScopeComplete` + `SCOPE_OPTIONS`; the candidate-scope gate override + the
  generalized rebuild trigger). Full gate green (**430 tests**, typecheck, lint,
  format, build).
- **Live-verified end to end on the dev store (Step 6 — closes features 42 & 43's
  deferred passes), 2026-07-08:** set a PRODUCT scope on the ACTIVE "Creator Combo"
  template via the picker (App Bridge resource picker → title chip) → Save → the
  rule persisted, `rebuildShopRouting` added `byProduct:{E88→handle}` + re-stamped
  the `$app:routing` metafield, and the **E88 storefront page (previously blank)
  rendered the routed table** via tier 2 (closes **43**'s merchant-driven routing
  pass). Assigned the **same** product to the ACTIVE "Motorola" template → Save →
  **blocked** with the rich critical banner naming "Creator Combo" (linked) + the 3
  resolutions, SaveBar retained, and **nothing written** (Motorola scope stayed
  null — atomic block confirmed via Neon; closes **42**'s block pass). Changing the
  pending product **cleared the banner**; Save then **succeeded**, routing rebuilt,
  and the Moto G35 page rendered the Motorola table (ACTIVE-scope-edit path).
  Confirmed live: the `canSave` Save-disable on an incomplete scope, the inert
  freeze during save, and the clear-scope→rebuild path (reverting both test scopes
  restored the routing map + store to its exact pre-test state). Detail →
  `context/features/44-assignment-scope-picker-ui.md`.

**Product assignment engine — storefront routing resolution (`43-…`)**
- The theme app extension now resolves a product's table in **three tiers** (data-model §9): (1) the per-product `$app:spec_table` override metafield (features 34/35, highest precedence, unchanged); (2) the **shop routing map** — new `snippets/spec-table-resolve.liquid` reads `shop.metafields["$app"].routing.value` and emits the matched template **handle** (`byProduct` GID → `byType` → `byVendor` → `byCollection` GID scan → `defaultTemplateHandle`), which the block resolves via `metaobjects["$app:appx_spec_table"][handle]`; (3) no match → nothing renders. So a broad rule lights up every matching product with O(1) storefront data.
- **GID-faithful lookups** constructed in Liquid (`gid://shopify/Product/<id>` / `…/Collection/<id>`; feature 40 keys are raw GIDs, Liquid exposes only numeric `.id`). **`excludedProductGids` honored** — an excluded product renders nothing *from the map* (the override still wins); the exclude gate sits **after** the override so it can't suppress an explicit assignment. Inert today (`excludedProductGids` is `[]` until feature 45). **TAG routing intentionally not read** (`byTag` always `{}`, post-MVP). Collection scan is 50-chunked (Shopify's `for` cap) with break-on-first-hit, mirroring the rows loop. The render body is unchanged — the change only picks `spec`. Silent-by-design and the ACTIVE-status gate preserved; a missing `$app:routing` metafield resolves gracefully to nothing.
- **Correctness catch:** the live projection default key is **`defaultTemplateHandle`**, not §9's loose "`default`" — reading `routing.default` would have silently broken the fallback tier; data-model §9 reconciled.
- **Live-verified end to end** (scratch route on the dev store, then removed): seeded a `PRODUCT`-scope rule on an ACTIVE template routing the E88 Pro product (id `7897939443777`, no override, previously blank) → `rebuildShopRouting` wrote `byProduct:{gid→handle}` + stamped sync → the E88 storefront page then **rendered the routed template's 19-row table via tier 2** (`spec_present=true`, `status=ACTIVE`); clearing the rule + rebuild reverted E88 to blank. Confirmed the whole chain live: `shop.metafields["$app"].routing.value` **is** Liquid-readable (the feature-41 write is now proven readable too), the GID-key `byProduct` lookup resolves, and `metaobjects["$app:appx_spec_table"][handle]` renders.
- **Live bug found + fixed (only a real storefront surfaces it):** Shopify wraps every app-extension `render` output in `<!-- BEGIN/END app snippet -->` comments, so the captured handle was polluted and `metaobjects[...][handle]` returned nil. `| strip` only trims whitespace; fixed with **`| strip_html | strip`** (a metaobject handle is a plain slug, so `strip_html` is lossless). Without the live run this would have shipped as a silently-broken routing tier. **Theme Check green** (4 files, 0 offenses); typecheck + build green (418 tests still green from feature 42). Detail → `context/features/43-storefront-routing-resolution.md`.

**Product assignment engine — activation pipeline + DRAFT→ACTIVE dry-run gate (`42-…`)**
- Wired the isolated pieces (37–41) into the two existing status-change surfaces (feature 36): the templates-list `intent:"status"` action (`app/routes/app.templates.tsx`) and the editor Save action (`app/routes/app.templates_.$id/route.tsx`). A DRAFT→ACTIVE transition now runs the **dry-run conflict gate** first — on a scope overlap with another ACTIVE template it **blocks atomically** (returns `{ ok:false, blocked, conflicts, error }`, writes nothing: no status, rows, metaobject, or routing); otherwise it writes status → re-syncs the metaobject → **rebuilds + publishes the shop routing** (`rebuildShopRouting`, 41). A transition **away from** ACTIVE just rebuilds; a rows-only save (status unchanged) skips the rebuild (fast path).
- New decision core `app/shopify/assignmentActivation.server.ts`: pure `shouldRebuildRouting(current,target)` (rebuild iff the ACTIVE set changes) + `evaluateActivationConflicts(admin, shopId, templateId)` (composes `getAssignmentForTemplate` 37 → `getActiveIncludeScopesExcept` → `partitionOverlaps` 38 → `checkCrossDimensionConflicts` 39) + `activationBlockedMessage` (folds conflicts → one toast string). **Fails closed** — a thrown Shopify probe (39) is caught and returns a **block**, never a silent pass (priority #2). **Scope-less candidate ⇒ trivially passes** (the common case today: the scope picker is feature 44, so most templates have no rule — the gate becomes load-bearing once 44 ships). New shop-scoped read `getActiveIncludeScopesExcept(shopId, excludeTemplateId)` in `assignment.server.ts` (OTHER ACTIVE templates with an INCLUDE scope; candidate excluded so an ACTIVE template can't conflict with itself). Both delivery writes (`syncError`, `routingError`) are best-effort + surfaced via the existing toasts; only the pre-write conflict blocks.
- **Conflict surfacing is minimal** (a concise error toast naming the other template(s)) — the rich conflict UI (which dimension, resolution picker) is **feature 44**; this slice returns the structured `conflicts` payload but surfaces only the toast. **Create-as-ACTIVE** and **ACTIVE-scope-edit** wiring are left for 44 (both are genuine no-ops today — new/edited templates carry no scope yet; the core is already scope-edit-ready). 16 new unit tests (2 `getActiveIncludeScopesExcept` shop-isolation, 14 activation-core incl. the full gate matrix + fail-closed + `activationBlockedMessage`). Full gate green (418 tests, typecheck, lint, build). **Live seeded verification (Step 5) pending** — requires a scratch `setTemplateScope` seeder (no scope UI until 44), mirroring feature 41's approach. Detail → `context/features/42-activation-pipeline-dry-run-gate.md`.

**Product assignment engine — shop routing metafield writer + TOML def (`41-…`)**
- `[shop.metafields.app.routing]` (json, `storefront = public_read`) added to `shopify.app.toml` and **deployed live** (version `appx-product-specs-table-5`) → resolves to reserved `$app`/`routing`, Liquid-readable as `shop.metafields["$app"].routing.value`.
- `app/shopify/routing.server.ts` — `rebuildShopRouting(admin, shopId)`: reads ACTIVE templates + assignments (shop-scoped) → `flattenActiveRulesToRoutingRules` → `buildRoutingProjection` (feature 40) → **upserts `ShopStorefrontRouting` (Postgres first)** → `metafieldsSet` the `$app:routing` shop metafield → stamps `shopMetafieldGid` + `syncedToShopifyAt`. Pure unit-tested glue (`flattenActiveRulesToRoutingRules`, `buildRoutingMetafieldInput`, `readMetafieldsSetResult`); **honest failure** (`userErrors`/non-ok → `{ ok:false }`, sync NOT stamped, row already persisted); **empty ACTIVE set writes an empty map** (clears the storefront); shop isolation structural + `where {shopId}`. GraphQL (`metafieldsSet` + `{ shop { id } }`) validated @ 2025-10. **Not yet wired into activation** — feature 42 calls it.
- **Live-verified end to end** (scratch route on the dev store, then removed): seeded a PRODUCT_TYPE rule → `rebuildShopRouting` wrote `byType:{DevRoutingCheck→handle}` to Postgres **and** stamped a real `shopMetafieldGid` (`gid://shopify/Metafield/36190945214529`) = the live `metafieldsSet` succeeded; cleanup rebuild reset `byType` to `{}` + re-stamped sync (proving the empty-map/clear path). **Resolves the plan's open questions:** the `$app`/`routing`/`json`/shop-owner write shape is correct and **no added access scope was needed**. 12 unit tests. Full gate green (402 tests, typecheck, lint, format, build). Detail → `context/features/41-shop-routing-metafield-writer.md`.

**Product assignment engine — routing-projection builder + `add-routing` migration (`40-…`)**
- `add-routing` migration (`20260708052957_add_routing`): `ShopStorefrontRouting` table (one row per shop; `shopId @unique`; `defaultTemplateHandle` + `byType`/`byVendor`/`byCollection`/`byTag`/`byProduct` JSONB `@default("{}")` + `excludedProductGids` JSONB `@default("[]")` + `shopMetafieldGid`/`syncedToShopifyAt` delivery state) + `Shop.storefrontRouting` back-relation. Model copied verbatim from data-model §5; confirmed live in Neon (`proud-hat-02103652`) with columns + `shopId` unique index. **No writer yet** — the row/metafield write is feature 41.
- Pure `app/utils/routingProjection.ts` (no DB, no Admin API): `buildRoutingProjection(rules)` folds a flat `RoutingRule[]` (`{scope, scopeValue, mode, templateHandle}`, flattened across ACTIVE templates by the caller) into the delivery map — INCLUDE bucketed by scope (`ALL_PRODUCTS`→default, TYPE/VENDOR→raw-string key, COLLECTION/PRODUCT→raw-GID key), EXCLUDE PRODUCT→`excludedProductGids`. **Key format GID-faithful/lossless** (feature 43 constructs the GID token in Liquid; data-model §9 annotated); skips blank-handle rules (no null pointers); `byTag` stays `{}` (post-MVP); shop-agnostic + disjointness assumed (last-wins on a dup key). EXCLUDE projection built now though no EXCLUDE rows exist until feature 45. 13 unit tests. Full gate green (390 tests, typecheck, lint, format, build). Detail → `context/features/40-routing-projection-builder.md`.

**Product assignment engine — cross-dimension conflict check (`39-…`)**
- `app/shopify/assignmentConflict.server.ts` — the Shopify half of the DRAFT→ACTIVE dry-run (data-model §9): consumes feature 38's `needsCheck` bucket and resolves each undecidable pair with **one `products(first:1, query: A AND B)` existence probe**. Pure, unit-tested parts: `buildScopeFragment` (scope→search fragment: `product_type:'X'` / `vendor:'Y'` / `collection_id:<id>` / `id:<id>`, GID→numeric, ALL_PRODUCTS-throws guard), `buildExistenceQuery` (ANDs two fragments), `hasMatchingProduct` (edge-existence narrower). Live `checkCrossDimensionConflicts(admin, needsCheck)` runs the probes and returns only **confirmed** `{ other, reason }` collisions (the shape feature 42 merges into `blocking`). **Injection-safe** (single-quote/backslash escaping of merchant `product_type`/`vendor` strings) and **fails closed** — a non-ok HTTP response or GraphQL `errors` array **throws** (never a false all-clear that would let a conflicting template go ACTIVE, priority #2). Shop isolation is structural (session-bound `admin`). GraphQL validated via `validate_graphql_codeblocks` @ 2025-10 (`read_products`). 18 unit tests (boundary-mocked `admin.graphql`). Full gate green (377 tests, typecheck, lint, build). Detail → `context/features/39-cross-dimension-conflict-check.md`.

**Product assignment engine — scope-overlap resolver (`38-…`)**
- Pure `app/utils/assignmentOverlap.ts` (no DB, no Admin API): `classifyScopePair(a, b)` → `OVERLAP` / `DISJOINT` / `NEEDS_CHECK` per the data-model §9 set-algebra (ALL_PRODUCTS universal; PRODUCT/TYPE/VENDOR single-valued → same-scope-diff-value provably DISJOINT; COLLECTION multi-valued → diff → NEEDS_CHECK; cross-dimension → NEEDS_CHECK). `NEEDS_CHECK` carries the two selectors feature 39 ANDs into a `products(first:1,query)` probe (never contains ALL_PRODUCTS). Safety-biased: never DISJOINT when a shared product is possible. `partitionOverlaps` buckets a candidate against a list into `blocking` / `needsCheck` (the shape feature 42 consumes). 10 unit tests (full matrix + symmetry sweep + selector-guarantee + bucketing). Full gate green (359 tests, typecheck, lint, build). Detail → `context/features/38-scope-overlap-resolver.md`.

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

- **Product assignment engine — building on the 8-file plan (features 37–44).** Done: 37 data foundation, 38 scope-overlap resolver (pure), 39 cross-dimension existence check (`assignmentConflict.server.ts`, Shopify probe + fail-closed), 40 routing-projection builder + `add-routing` migration (`ShopStorefrontRouting`; pure `routingProjection.ts`), 41 shop routing metafield writer + `[shop.metafields.app.routing]` TOML def (`routing.server.ts`, deployed + live-verified), **42 activation pipeline + DRAFT→ACTIVE dry-run gate** (`assignmentActivation.server.ts`; wired into both status surfaces — atomic block on conflict, fail-closed, routing rebuild on ACTIVE-set change), **43 storefront routing resolution** (`snippets/spec-table-resolve.liquid` + block wired to 3-tier override→exclude→routing resolution; Theme Check green), **44 assignment scope picker UI + rich conflict warnings** (`SettingsTab.tsx` scope picker riding the SaveBar; gate generalized to the PENDING scope; rich conflict banner; `scopeResourceLabel.server.ts`). The engine is now **merchant-driven end to end** — 37–44 all implemented, gate-green, and **live-verified on the dev store (feature 44 Step 6, 2026-07-08)**: scope-set→routing→storefront, the atomic block with the rich banner, banner-clears-on-change, resolve→activate, and the clear-scope→rebuild path all confirmed through the real UI (closing features 42 & 43's previously-deferred live passes). The store was restored to its exact pre-test state afterward. **Now on the feature-45 series** — feature 45 was found too big for one unit (three unrelated system boundaries) and **split** (2026-07-09): **45 EXCLUDE carve-outs** (**complete + gate-green + Theme-Check-green + live-verified end to end on the dev store, 2026-07-09** — `context/features/45-exclude-carve-outs.md`) → **46 multi-value scopes (server relaxation)** (**complete + gate-green, 496 tests + live-verified end to end on the dev store, 2026-07-10/11** — `context/features/46-multi-value-scopes-server.md`; also closed a latent feature-45 disjoint-set bug via Decision C) → **47 multi-value scopes (UI)** (**complete + gate-green, 504 tests + live-verified on the dev store, 2026-07-11** — `context/features/47-multi-value-scopes-ui.md`; multi-select picker + chip list + full-set loader, closing 46's editor round-trip hazard) → per-product overflow materialization + list "Assigned Products" count **deferred post-45** (a scaling valve behind a threshold; only if large selected-product sets become real). **The whole 37–47 assignment engine is now merchant-complete end to end** (broad + multi-value scopes, EXCLUDE carve-outs, block-on-conflict gate, routing, storefront). Locked scope decisions (2026-07-09): multi-value applies to **PRODUCT + COLLECTION only** (TYPE/VENDOR stay single-valued); materialization deferred. **No migrations** needed for the whole series — `mode: EXCLUDE`, multi-row INCLUDE (`@@unique` already permits it), and `ProductAssignmentIndex` are all in the schema. Two invariant-sensitive design decisions locked in the 45 spec: (A) the conflict gate must **subtract EXCLUDE carve-outs** (an EXCLUDE resolves a PRODUCT-level overlap; broad×broad still blocks); (B) a **storefront-resolver order bug** — `spec-table-resolve.liquid` currently wraps `byProduct` inside the `excludedProductGids` gate, so an excluded product never reaches its own explicit assignment; fix = check override → `byProduct` **before** the exclude gate. Per-step build specs land in `context/features/NN-*.md` as each is started.

---

## Next Up

1. **Product assignment engine** (design locked 2026-07-07 — `data-model.md` §5/§9): **rigid, block-on-conflict, merchant-controlled** (Moon-Bundles style). Being built on an **8-file plan** (features 37–44, small verifiable steps): **37 data foundation ✅** → **38 scope-overlap resolver ✅** → **39 cross-dimension existence check (Shopify) ✅** → **40 routing-projection builder + `add-routing` migration ✅** → **41 shop routing metafield writer + TOML def ✅** → **42 activation dry-run gate (wired into both status surfaces) ✅** → **43 storefront routing resolution (Liquid) ✅** → **44 assignment UI (scope picker) + rich conflict warnings ✅** (live-verified on the dev store 2026-07-08). Then the **45-series** (split 2026-07-09): **45 EXCLUDE carve-outs ✅** (complete + gate-green + live-verified on the dev store 2026-07-09) → **46 multi-value scopes — server ✅** (complete + gate-green + live-verified on the dev store 2026-07-11; closed a latent feature-45 disjoint-set bug — Decision C) → **47 multi-value scopes — UI ✅** (complete + gate-green + live-verified on the dev store 2026-07-11 — multi-select picker + chip list, full-set loader closing 46's editor round-trip hazard) → materialization **deferred** → docs wrap. **The 37–47 assignment engine is merchant-complete.** With the engine done, the remaining roadmap is the Reshell phases + templates-list Phase 2 (below). Design recap: one scope per template; dry-run **blocks activation** on overlap with another ACTIVE template (O(rules) set-algebra + `products(query,first:1)`); DRAFT may hold a conflict, ACTIVE may not; **no `priority` knob**; broad rules deliver via **one shop-level `[shop.metafields.app.routing]` json map** resolved in Liquid by handle; per-product `metaobject_reference` metafield only for bounded overrides. Rides Reshell Phase E.
2. **Reshell Phases B–F**: B (Style tab — **spec locked 2026-07-18**: orthogonal knobs + copy-semantics presets; slices B1 knobs/rail/rendering → B2 built-in preset gallery → B3 saved presets [cuttable]; see `admin-screen-plan.md` §Tab 2; **14-step implementation plan: `~/.claude/plans/style-tab-phase-b-implementation-plan.md`** — steps 1–12 = B1, 13–14 = B2, 15+ outline = B3; per-step docs start at `context/features/57-…`) → C (Settings) → D (device previews — read-only Desktop/Tablet/Mobile) → E (assignment) → F (top-bar status+save model + cleanup).
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
- ~~Exact UX for preventing/warning about assignment conflicts in MVP.~~ **RESOLVED (feature 44, 2026-07-08):** rigid **block-on-conflict** (Moon-Bundles style) — a template can't go ACTIVE while its scope overlaps another ACTIVE template; DRAFT may hold a conflict; no priority tiebreak. **Conflict copy + resolution shipped**: on a blocked Save the Settings tab shows a persistent critical `s-banner` naming each colliding template (with a link) and the **three resolutions** — narrow this template's scope, set it to "No products", or set the other template back to Draft. (An EXCLUDE-exception resolution arrives with feature 45's carve-out UI.)
- ~~**Assignment location:** direction is to move Product Assignment into the editor's **Settings tab** (not locked).~~ **RESOLVED (feature 44, 2026-07-08):** the editor **Settings tab** is the assignment home — **no standalone `/assign` route**. The scope picker + rich conflict banner live in `SettingsTab.tsx` and ride the same SaveBar as status; assignment is a template-level setting alongside status. A deep "assignment summary" screen can come later if ever needed; MVP does not split it out.
- **Settings-tab "Display rules"** (mockup's `hide rows with empty values` / `show section dividers` / `show on mobile`) are dummy/illustrative — each needs a real definition + reconciliation with the per-row `hideWhenEmpty` flag before building.
- **Top-bar name-edit affordance:** inline title edit vs a Rename item in the ⋯ menu — settle when the top bar (Phase F) is built.
- **Style tab (spec 2026-07-18) — build-time details still to lock:** exact knob-value bundles for the five built-in presets (Classic / Striped / Banded / Stacked / Accordion); the `density` padding-scale values; save-as-preset naming/overwrite UX detail (same-name overwrite confirm copy); whether the creation gallery popup gets a "don't show again" escape; whether `fontWeight` applies to the label only or label + value (carried over from the pre-2026-07-18 spec).
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
- **Style tab design (2026-07-18 — spec: `admin-screen-plan.md` §Tab 2, `data-model.md` §5 `TableStyling` + §10 styling serialization, PRD Styling section, code-standards Color & Theming).** One spec-table primitive with **orthogonal style knobs**, not monolithic layouts: row layout (two-column / stacked), mobile behavior (stacked default / same-as-desktop), section headers (banded / text-only), collapsible sections (native `<details>/<summary>`, zero JS, initial-state knob), row dividers (lines / zebra / none — zebra adds the `stripeBgColor` surface), density. Modal/drawer containers + multi-column "newspaper" flow **rejected**. **Presets = COPY semantics**: skippable gallery popup on Create (built-ins as code constants; phase-2 merchant-saved `StylePreset` model with a field-set drift test) copies values into per-template `TableStyling` — **real columns, not `extraStyles`**; `basedOnPreset` is provenance only. **No shop-level default styling record** (store-default cascade considered + rejected — copy keeps style edits side-effect-free on live storefronts); retroactive "set once and done" = post-MVP bulk apply-to-all on a future settings route (explicit throttled batch + metaobject resync). Storefront delivery: **one path** — the template metaobject's existing `styling` json field (already in the deployed TOML; no definition change needed); layout knobs → wrapper modifier classes, colors/typography → CSS variables. Build order: B1 knobs/rail/rendering → B2 preset gallery → B3 saved presets (cuttable). **Typography addendum (2026-07-18, Horizon theme-editor pattern):** `fontSize` = S/M/L theme-relative presets **or** bounded Custom px (10–40, clamped; JSON number on the wire, digit-string in the DB column); new `lineHeight` (TIGHT/NORMAL/LOOSE) + `labelCase` (DEFAULT/UPPERCASE, labels only) knobs; `fontStyle` **kept**; font-family picker, letter spacing, wrap, per-side px padding **rejected** (option-overload guard).
