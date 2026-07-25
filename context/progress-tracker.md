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

Test suite ~870 tests / 37 files; full gate (typecheck · lint · format · test · build) green.

Since B1: the Style tab's width surface — the collapsible rail (feature 76). Feature 75's
full-size preview modal shipped the same day and was **removed 2026-07-25**; see Completed.

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

**Column divider (feature 79, doc `79-…`) — ✅ shipped & fully live-verified 2026-07-26**
- Merchant sent two competitor spec tables (techlandbd, AppleGadgets) rendering a full
  **grid** and asked for a column border. Only ONE edge was actually missing: rows already
  had `LINES` (57 Step 5) and the frame shipped in 78, so the vertical rule between label
  and value — **the only interior column edge a 2-column table has** — is one knob, and it
  completes the grid. One column `columnDividerStyle String?` (`NONE` default / `LINE`),
  migration `20260725161912_add_column_divider_styling`. **No Liquid change** — second
  feature running that the "server precomputes, Liquid only prints" pipe paid for itself.
- **Three merchant decisions (2026-07-26), all narrowing the knob deliberately:**
  a **style keyword, NOT a px width** (row-divider width is not configurable, so a width box
  would let a 4px column rule sit on 1px row rules — the knob that cannot express the ugly
  case is the right knob); **no dedicated color swatch** (reads `--appx-spec-border-color`,
  so it matches the row rules by construction — `columnDividerColor` stays addable later);
  and **not hidden on stacked layouts**, deliberately declining a 6th hide predicate. That
  last one has a cost: `Line` on a stacked table does nothing, so the caveat lives in the
  option's help text and is a **shipped requirement pinned by a test**, not prose.
- Non-null keyword ⇒ **modifier class**, per the locked Step 2 rule; `NONE` emits a real
  `border-inline-end: none` rule rather than being the absence of one. The rule hangs off
  the **label's `border-inline-end`**, which is the whole design: a section header is a
  `th[colspan=2]` so the rule stops at every band (the look both references have); each
  collapsible section owns its own `<table>` so it is per-section for free; and it is
  INTERIOR, so `border-collapse` has nothing to resolve and it can never double against the
  outer frame — no analogue of feature 78's three last-row selector cases. Logical property,
  so RTL is correct for free.
- ⚠️ **The one hazard is SOURCE ORDER, not specificity.** Both stacked shapes must drop the
  rule (a block label has no seam; a survivor paints as a stray vertical stub), and all three
  selectors are two classes — a **tie**, so order alone decides. The ON rule sits with the
  dividers block *before* the layout block, making the file's existing documented ordering
  rule load-bearing for one more knob. Breaking it is invisible: previews and storefront
  regain the stub together and it reads as a design choice. Three tests pin it (the 1px
  literal, both `none` rules, and the ordering). No `!important` anywhere. Tests 879 → 887.
- **Round-trip live-verified end to end** on the ACTIVE DJI template: rail → Save → Postgres
  `columnDividerStyle="LINE"` → metaobject (`styling` overrides-only; `styling_css.classes`
  carries `--column-divider-line` in field order, **`vars` empty** — the knob rightly emits no
  custom property) → rendered Horizon storefront, rule stopping at every section band. The
  "matches the row rules by construction" claim is **measured, not argued**: the label's
  computed `border-inline-end` and `border-block-end` are both `0.727273px solid
  rgba(0,0,0,0.1)`. The source-order hazard was verified **observably** — swapping the layout
  class on the live page dropped the border `0.727273px → 0px` with the divider class still
  present, and restored it. Mobile ≤749px checked in the editor's Mobile preview (a real
  ~375px iframe): stacked, no rule, **no stray right-edge stub**. Migration confirmed
  non-repainting (every pre-existing row read `null`).
  ⚠️ **`resize_window` is not a usable responsive check here** — it reports success but the
  viewport never reflows (`innerWidth` stayed 1397); the Mobile device preview is what gives a
  genuine narrow render. The DJI template is **left saved with `Line`**.
- Numbering: this takes **79**, so B2 starts at **80**. `columnDividerStyle` must land in the
  B2 preset bundles alongside feature 78's five — it is what makes a "Bordered / Grid"
  built-in preset possible.

**Table width + outer border (features 77–78, docs `77-…` / `78-…`) — ✅ shipped 2026-07-25**
- **77 — the block now fills its container (CSS-only bug fix, live-verified).** Merchant
  report: the storefront table's width followed its CONTENT, so opening a collapsible
  section resized the whole table. Measured on the dev store: **206px closed ↔ 1264px open**
  inside 1438px of space. Cause is one level ABOVE our markup — a theme section that centres
  its children (`align-items: center` on a column flex container) makes **Shopify's**
  `.shopify-app-block` wrapper a shrink-to-fit flex item. 🚫 **`width: 100%` on
  `.appx-spec-table` is a no-op** — measured — because a percentage resolves against the
  already-shrunk parent and does not feed back into its intrinsic sizing. Fix is
  `.shopify-app-block:has(> .appx-spec-table) { align-self: stretch; justify-self: stretch }`.
  **`align-self`, NOT `width: 100%`:** both fill a column-flex parent, but align-self targets
  the CROSS axis, so in a row-flex theme it touches the height and leaves the width alone
  (verified — no overflow). Base rule, not a knob: a table that resizes when a shopper opens
  a section is wrong in every theme. Live-verified on the storefront — **jitter 0px**.
  *Note the previews never showed this and never could:* the preview document has no
  `.shopify-app-block` ancestor, so "storefront-faithful" has a hole exactly where the
  surrounding theme wraps the block.
- **78 — five Style-tab knobs**, new **Size & frame** rail group: `tableMaxWidthPx`
  (240–1600, null = full width), `tableAlign` (LEFT/CENTER/RIGHT), `outerBorderWidthPx`
  (1–12), `outerBorderRadiusPx` (1–48), `outerBorderColor` (swatch, in **Colors**).
  Migration `20260725143916_add_table_container_styling`. **No Liquid change** — the
  "server precomputes, Liquid only prints" pipe paid off exactly as designed.
  Three locks: **null = the default, not inherit** (no theme value exists for an outline),
  so **every integer minimum is 1, never 0** — a 0 would be a second spelling of "off" that
  serializes as a bogus override; **max-width, not width**, so the cap shrinks on a phone
  and cannot collide with the 749px breakpoint; the outline colour falls back **through**
  `--appx-spec-border-color`, so one swatch dresses rules + frame until a merchant splits
  them. Two presence flags (`--outer-border`, `--outer-radius`) exist because CSS cannot
  branch on whether a var is set: one drops the last row's rule where it would double against
  the frame (**three** selector cases — flat, last section open, last section CLOSED, where
  the summary is the last thing painted), the other turns on `overflow: hidden` so a radius
  actually clips the band and stripes. `showsTableAlignControl` is the **5th** hide rule and
  inherited the preserve-on-hide law by adding one row to `VISIBILITY_PREDICATES`.
  **Round-trip live-verified end to end** on the ACTIVE DJI template: rail → Save → all five
  Postgres columns → metaobject `styling_css` (classes `--align-center --outer-border
  --outer-radius`, vars with px units + hex) → rendered storefront (900px, centred 203/203,
  `2px solid rgb(192,38,211)`, 12px radius, last-row rule dropped, jitter still 0). The cap
  shrinks rather than overflows — measured 900/700/360 in 1438/700/360px containers.
  ⚠️ **A migration mid-`shopify app dev` needs the dev server restarted:** the first save
  failed silently because Vite HMR reloads app code but NOT `@prisma/client` (require cache),
  so the server called a client without the new columns — the same reason `prisma generate`
  reported `EPERM ... query_engine-windows.dll.node`. Tell it apart from a real bug by running
  the upsert from a fresh `node -e`: if that writes, the server is just stale.
  B2 note: these five must land in the built-in preset bundles.
- **Follow-up 2026-07-26 — Outline width and Corner radius show `0` for off; neither box is
  ever blank.** Merchant report: reaching "no outline" meant *removing the text*, which is a
  poor gesture on a knob whose whole vocabulary is a px number. So for these two knobs
  **display and storage disagree, in one direction only**: the box always shows a number,
  `null` renders as `0` (`toZeroMeansOffControlValue`), and anything rounding to ≤ 0 reads back
  as `null` (`fromZeroMeansOffControlValue` — so `0`, `0.4`, `-5` *and* an emptied box all mean
  off, while `0.6` still clamps up to the minimum). Both fields take the shared
  `ZERO_MEANS_OFF_CONTROL_MIN = 0` so the **stepper can walk down to off**; the domain
  minimums stay 1 as the smallest *stored* values. Off-state help text now reads "No outline.
  Set 1 or more to frame the table." / "Square corners. Set 1 or more to round them."
  ⚠️ **The minimum-of-1 lock above is NOT relaxed — it is what makes this safe.** 0 is never
  stored, so `serializeStylingOverrides` still has nothing to write, and the reason is
  load-bearing rather than tidiness: **both** knobs carry a presence flag keyed on non-null, so
  a stored 0 would trip it while painting nothing — `--outer-border` drops the last row's own
  bottom rule (no frame **and** a lost divider), `--outer-radius` turns on `overflow: hidden`
  (no rounding **and** an over-wide table starts clipping, the exact trade that flag exists to
  avoid taking unasked). Keeping 0 out of the model makes both unreachable by construction
  instead of by a second guard downstream — a test pins that no input reaches the model as `0`.
  Server `parseStylingValues` untouched. Tests 887 → 892.
  **Maximum width deliberately keeps its blank box** — 0 is not a spelling of "full width", so
  the same trick would be a lie there. Confirmed against the Polaris docs en route: `min`/`max`
  on `s-number-field` are display affordances only — "Users can still type values lower than
  the minimum using the keyboard. Implement validation to enforce this constraint." — which is
  why every bound in this file is enforced in the converter, not the markup.

**Collapsible Style / Settings rail (feature 76, doc `76-…`) — ✅ shipped & verified 2026-07-25**
**— and, since the modal below was removed, the ONLY answer to the Style tab's width problem.**
- The **other** option the same merchant offered for the same report that produced feature
  75, built at their request. One toggle in the control row
  collapses the 18.75rem Style/Settings rail to **zero width**, handing the stage the full
  editor card. Feature 75's doc had rejected this idea on width grounds; that half is
  **wrong and is retracted** — it modelled the preview off the raw admin viewport instead of
  the `<s-page inlineSize="large">` card, and the measured chain (`iframe − 64 − 48 − 2`,
  −300 more with the rail open) clears the 749px breakpoint by ~300px on the reporter's own
  window. Live-verified at the exact reporting size (`innerWidth` 1397 → iframe 1141):
  Style + Desktop rendered stacked, one click rendered it two-column.
- **Collapse to zero, not to an icon stub** — which is what forces the button into the
  control row beside the tabs rather than into the rail: the tight measured case clears the
  breakpoint by only 18px, so a ~48px surviving strip would put the preview back under it.
  One stable icon in a fixed position, `aria-expanded` carrying the state. Hidden, not
  unmounted, so the rail's scroll position and StyleTab's UI memory survive.
- **Both Step 0 platform checks came back negative** and both fallbacks were taken.
  (a) `className` on an `<s-box>` is a **`tsc` error** — Polaris's JSX types accept only a
  component's own props plus `key`/`ref`/`slot`/`children` — so the hide rule hangs off a
  hyphenated `data-` attribute (hyphenated JSX attribute names skip excess-property
  checking, which is also why the ARIA typechecks) rather than the planned wrapper `<div>`,
  which would have demoted the rail from grid item to nested child and re-entered the
  unpainted-sliver bug. (b) `<s-button>` **drops `aria-expanded`/`aria-controls`** — measured
  against the live CDN build: only `accessibilityLabel` reaches the shadow `<button>`, and
  the host carries no role at all — so the toggle is a plain
  `<button className={styles.segBtn}>`, the same imported chrome the tab segments use.
  Shipping a sighted-users-only toggle state into the one rail that spent feature 57 Step 12
  closing that gap was not acceptable.
- **One defect the plan did not predict:** collapse/expand drifted the rail's scroll offset
  ~36px *per cycle*. Not the zero-rect `getBoundingClientRect()` hazard the plan named (that
  is real, is now guarded in `useScrollRegionHeight`, and did **not** move the drift) — it is
  Chrome **scroll anchoring** re-compensating a re-laid-out hidden subtree. `overflow-anchor:
  none` on `.railScroller` fixes it; pixel-identical across six cycles.
- **The honest limit stands, and is now the whole story:** under ~1420px the
  Style tab still cannot show a truthful desktop table *and* the knobs at once. Collapse
  trades the knobs for width; it is look-then-adjust, not adjust-and-watch. If the friction
  is reported again the answer is a
  fixed-1100px `transform: scale()` preview, **not** a second panel and **not** a re-added
  modal — recorded in `76-…` so it is not re-derived. Tripwired files untouched; no
  rows/styling/assignment changed (the SaveBar never appeared). Details + three corrections
  in `76-…`.

**Full-size preview modal (feature 75, doc `75-…`) — 🗑️ REMOVED 2026-07-25 (shipped &
verified earlier the same day)**
- **Removed at the merchant's request** after they used both surfaces: the collapsible rail
  (feature 76) answered the width problem on its own, so the modal was carrying a second
  way to do one thing — a second surface to explain, keep truthful, and re-verify on every
  preview change. Deleted: `PreviewModal.tsx`, the control-row trigger + `PREVIEW_MODAL_ID`,
  `deviceView.ts`'s `modalPreviewHeight` / `MODAL_CHROME_PX` / `MODAL_PREVIEW_*`,
  `tabViewMemory.ts`'s `setPreviewDevice`, `SpecTablePreview`'s `availableHeight` override
  and the `preview` render prop's `options` argument, and their 13 unit tests (883 → 870).
  **Kept:** `SegmentedControl.tsx`, the verbatim extraction feature 75 made — `EditorShell`
  uses it for both its tab group and its device toggle, so it survives as a plain shared
  component. Full gate re-run green; `SpecTableEditor.module.css` / `RowGrid.tsx` still
  byte-clean. The doc `75-…` is kept as the record (its root-cause analysis is what feature
  76 is built on) with a REMOVED banner; everything below its "The design" heading
  describes code that no longer exists.
- **What the removal does NOT change — the root cause, which is why feature 76 exists:**
  `previewDeviceWidth("desktop")` is `"100%"`, so "Desktop" is only as wide as the leftover
  editor column (viewport − admin chrome − the 18.75rem Style rail − `.stage` padding ≈ 640px
  at 1277 CSS px), genuinely under `spec-table.css`'s 749px mobile breakpoint. The preview was
  telling the truth about a 640px desktop. **🚫 Never fix this by lowering 749** — Dawn's
  breakpoint, drift-guarded, and it would change what real shoppers see on phones. The two
  height-budget rules the modal used (`useScrollRegionHeight` is meaningless in a centred
  dialog; a ResizeObserver on the modal body is circular, since an `<s-modal>` sizes to its
  content) are recorded in `75-…` should a dialog-hosted preview ever be revisited.

**Content-free tables render nothing (feature 74, doc `74-…`) — ✅ shipped & verified 2026-07-23**
- Merchant report: a brand-new template's Style/Settings preview showed a bare grey box.
  Root cause was **not** the preview — the starter scaffold's blank SECTION_HEADER had no
  emptiness gate at all, so it rendered as a content-free `__section` band (BANDED default =
  `rgba(0,0,0,.06)`), and a merchant who saved + activated + assigned it would ship that band
  to a live product page. Two render-time gates, hand-mirrored in `spec_table.liquid` and
  `specTablePreviewHtml.ts`: **R1** a section header whose label is blank after trimming is
  skipped (tested trimmed, emitted untrimmed); **R2** if no row survives its gate, emit
  nothing — no wrapper, no empty `<table>`. The Liquid **captures the body first** and emits
  the wrapper only if a `has_content` flag was set, because the `<div>` used to open before
  the loop and a data cell's emptiness is undecidable without rendering it against the live
  product; one pass, no double-render. Rows JSON is untouched — suppression is render-time
  only, so blank rows still round-trip into the editor grid.
- Also closed a **latent preview/storefront divergence**: the empty-state gate was
  `fragment.includes("<tr")`, which wrongly replaced a legitimate named-but-empty collapsible
  section (a `<details>` with no `<tr>`) with the empty state. Emptiness now decides once,
  upstream in `renderSpecTableHtml`, where both renderers agree.
- **Out of scope (R3):** a section with a REAL label whose rows are all hidden still renders —
  authored content, and suppressing it would contradict the locked Step 9a empty-collapsible
  decision. Logged under Open Questions; a test pins it so it can't leak in.
- Live-verified end to end on the dev store, storefront included (a temporary probe proved
  `assign`-inside-`capture` survives on the real Liquid runtime, and that all 9 authored
  sections of the 44-row DJI template are kept). Details + two plan corrections in `74-…`.

**Desktop preview inner scroll (feature 73, doc `73-…`) — ✅ shipped & verified 2026-07-23**
- The Desktop browser mockup no longer grows without bound: the shim-measured content
  height is **clamped** to the available viewport (pure `browserScreenHeight` in
  `deviceView.ts`), so a long table scrolls INSIDE the window like a real browser while a
  short one still hugs its content exactly as in feature 72 (clamp, not fit — merchant's
  call; always-filling would put dead space under a short table). Both mockups now share
  one `useScrollRegionHeight` ref; Desktop measures `.browserScreen` (below the chrome
  bar) so no `BROWSER_CHROME_PX` constant can drift against the CSS. Preview documents get
  `html { scrollbar-width: thin }` (preview-only ambient, outside the drift-guarded
  `SPEC_TABLE_CSS`). Iframe pipeline, `DevicePreview.module.css`, and the tripwired files
  untouched.

**Editor device-preview mockups (feature 72, doc `72-…`) — ✅ shipped & verified 2026-07-22**
- The Desktop/Mobile previews now render inside a device mockup: Desktop = a browser
  window (traffic-light dots + faux address pill, fills the column; auto-height until
  feature 73 clamped it to the viewport); Mobile =
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
- **Follow-up 2026-07-23 — rail scrollbar rides the panel edge.** A scrollbar paints on its
  scrolling element's *border* edge, so while the wrapping `s-box` owned `padding="base"` on
  all four sides the rail's scrollbar floated ~1rem inside the grey panel with a dead strip to
  its right. The box now sets `paddingInlineEnd="none"` and `.railScroller` owns that one
  gutter itself (`padding-inline-end: var(--s-space-base, 1rem)`), so the scrollbar hugs the
  panel edge while the controls stay inset exactly as before. The rail also takes
  `scrollbar-width: thin` — a full-width platform scrollbar reads as a window edge against a
  18.75rem rail; same standard property, same no-`::-webkit-scrollbar`-fork call as the device
  previews' `PREVIEW_AMBIENT` (feature 73). Landmark, `useScrollRegionHeight`,
  and the tripwired files unchanged. Full gate green; live-verified on the dev store.
  *(The editor's OTHER visible gutter — the empty ~16px right of the app's own document
  scrollbar — is Shopify's, not ours: admin's `.Polaris-Scroll` sets `scrollbar-gutter: stable`
  and lays the app iframe inside `_ScrollbarSafeArea_`, 16px narrower. Not removable from
  inside the iframe; it only stops being visible if the app document itself stops scrolling —
  today it overflows by roughly the `.tipsFooter` height, which `useScrollRegionHeight`'s flat
  `BOTTOM_PAD_REM = 3` does not budget for. Unfixed; see Next Up.)*

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

1. **Reshell Phase B2** — built-in preset gallery (Style tab steps 13–14; **starts at feature
   doc 80**, since 70 = stacked-semantics, 71 = sidebar inner-scroll, 72 = device-preview
   mockups, 73 = desktop preview inner scroll, 74 = content-free tables, 75 = full-size preview
   modal (removed), 76 = collapsible Style rail, 77 = container stretch, 78 = width + outer
   border, 79 = column divider — a retired number is still spent). **The five feature-78 fields
   plus `columnDividerStyle` must be in the preset bundles** — those six are what make a
   "Bordered / Grid" built-in preset possible. Then C (Settings display rules) → E (assignment
   into the reshell) → F (top-bar status/save + cleanup).
2. **Storefront table semantics in stacked layouts (feature 70)** — code shipped; screen-reader pass still owed (see Open Questions).
3. **Editor page should not scroll at the document level** — the app document overflows the
   iframe by roughly the `.tipsFooter` height (it renders BELOW the card, outside
   `useScrollRegionHeight`'s flat `BOTTOM_PAD_REM = 3` budget), producing a stray outer
   scrollbar stranded beside admin's reserved 16px scrollbar gutter. Fix = measure the actual
   footer/card bottom instead of the hardcoded 3rem. Touches the measurer both scrollers share,
   so it is its own unit.
4. **Templates-list Phase 2** — search / sort / pagination (server-side, with pagination) when the list can grow large; multi-select bulk actions later.
5. **Pre-submission** — mandatory privacy webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) + Billing (`prd.md`, `context/app-store-review-checklist.md`).

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
- **R3 — orphan titled sections (feature 74, deferred).** A section header with a REAL label
  whose rows are all hidden still renders as a lone titled band. Authored content, so it was
  deliberately left alone: suppressing it would contradict the locked Step 9a decision
  (`spec_table.liquid`: "a section whose rows are all hidden renders as an empty
  collapsible — no new emptiness logic"). Belongs with the Phase C display rules below.
  A test in `specTablePreviewHtml.test.ts` currently pins the render-it behavior.
- **Should activation warn on a content-free template?** Since feature 74 a merchant can set
  an empty template ACTIVE and assign it, and it renders nothing, silently. A DRAFT→ACTIVE
  advisory would be friendlier, but today's activation gate is a hard *block* mechanism for
  conflicts; adding a soft warning lane is its own unit.
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
- **View toggle:** Edit is the only editable segment; Desktop/Mobile are **read-only storefront previews** (Phase D), no separate WYSIWYG panel. **Tablet removed 2026-07-22.** **Shared preview device (2026-07-22):** the chosen device (Desktop/Mobile) is one value shared across all three tabs; edit-vs-preview is per-tab (`tabViewMemory.ts` `ViewMemory = { device, modes }`) — Content opens on the grid, Style/Settings auto-open a preview, picking a device on any tab moves every *previewing* tab to it; dropping a tab to Edit affects only that tab and retains the shared device. **Collapsible rail (2026-07-25, feature 76) is the ONE answer to the width problem:** because the inline Desktop preview is narrower than the storefront's 749px breakpoint on a laptop, a toggle beside the tab group collapses the Style/Settings rail to zero width, handing the stage the full card (never an icon stub: the tight case clears 749 by only 18px). ONE boolean shared by Style and Settings, in-memory, resets on reload; hidden not unmounted so the rail's scroll position survives; absent on Content. A **full-size preview modal** (feature 75) shipped as a second answer the same day and was **REMOVED 2026-07-25** — the merchant kept only the rail, so `PreviewModal`, `PREVIEW_MODAL_ID`, `modalPreviewHeight`, and `setPreviewDevice` are gone and the `preview` render prop is back to one argument. Under ~1420px the Style tab still cannot show a truthful desktop table and the knobs simultaneously; the only fix for that is a fixed-1100px `transform: scale()` preview, which is deliberately NOT built and is NOT a re-added modal (see `76-…`).
- **Color policy:** the app *uses* color via CSS variables as one source of truth (admin mirrors Polaris; storefront inherits theme but is merchant-overridable). The "no hardcoded hex literal" rule is CSS hygiene — use Polaris tokens / `currentColor` / custom properties (e.g. runtime-captured `--appx-token-color` for the pill blue). This rule does **not** encode the Edit-grid-never-styled binding rule (see Binding rules above).
- **Save/status model (mockup):** App Bridge contextual SaveBar (Save/Discard) + header status dropdown + ⋯ menu; no separate "Save as draft". Save freezes the editor (`inert`) in-flight; baseline reset uses the **submitted** snapshot (data-safety race fix).
- **Persistence/keys:** key finalization is **server-authoritative** ("is this row id already persisted?"), never re-derived. Metaobject is **app-reserved** (`$app:appx_spec_table`); deleted *before* Postgres on delete so a storefront-readable entry can't outlive its template.
- **App-owned definitions are declarative TOML** (slice 1): the `$app:appx_spec_table` metaobject and the `$app:spec_table` product `metaobject_reference` are declared in `shopify.app.toml`, distributed on deploy/install. Runtime `metaobjectDefinitionCreate` removed; `Shop.metaobjectDefinitionGid` vestigial. Metaobject *entries* are still written at runtime via `metaobjectUpsert`.
- **Assignment model — rigid block-on-conflict + shop-level routing (2026-07-07, `data-model.md` §5/§9).** One scope per template (`scope`+`scopeValue`+`mode`); overlaps between ACTIVE templates are **blocked at DRAFT→ACTIVE** (merchant decides — no silent precedence, no priority knob; `priority` column dormant). Overlap check is O(rules) Postgres set-algebra + `products(query,first:1)` existence tests, never a catalog scan. Broad rules deliver as O(1) entries in one `[shop.metafields.app.routing]` json metafield, resolved in Liquid via `metaobjects["$app:appx_spec_table"][handle]`. Per-product `metaobject_reference` survives only for bounded overrides; `ProductAssignmentIndex` is sparse.
- **Style tab design (2026-07-18 — `admin-screen-plan.md` §Tab 2, `data-model.md` §5/§10, PRD, code-standards).** One spec-table primitive with **orthogonal style knobs** (row layout, mobile behavior, section headers, collapsible sections via native `<details>` zero-JS, row dividers incl. zebra `stripeBgColor`, density). Modal/drawer containers + multi-column flow rejected. **Presets = COPY semantics** (built-ins as code constants; phase-2 merchant-saved `StylePreset`) copy values into per-template `TableStyling` **real columns**, not `extraStyles`; `basedOnPreset` is provenance only. **No shop-level default styling record** (copy keeps edits side-effect-free on live storefronts). Storefront delivery via the metaobject `styling` json field (no TOML change): layout knobs → wrapper modifier classes, colors/typography → CSS variables. **Typography:** `fontSize` = S/M/L theme-relative presets or bounded Custom px (10–184, clamped; JSON number on the wire, digit-string in the DB); `lineHeight` (TIGHT/NORMAL/LOOSE) + `labelCase` (DEFAULT/UPPERCASE, labels only) + `fontStyle` kept; font-family/letter-spacing/wrap/per-side padding rejected.
- **Testing strategy:** Vitest; Phases 1–2 done (unit + shop-isolation, mocked Prisma); reach Phase 4 (route loaders/actions + GDPR webhooks) before App Store submission, E2E (Playwright) fast-follow. Polaris web components don't render in jsdom → editor UI is browser-verified, pure logic unit-tested. Full doc: `~/.claude/plans/there-is-no-automated-encapsulated-yeti.md`.
- **Embedded-app verification:** the editor is a cross-origin iframe (top frame can't read its DOM/AOM/console); verify via Claude-in-Chrome on the `shopify app dev` preview + direct Postgres/Neon checks. Polaris CDN-build gotchas → `polaris-web-component-gotchas` memory. Admin GraphQL runtime is 2025-10 — validate against that, not the TOML's 2026-07.
