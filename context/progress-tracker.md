# Progress Tracker

Update this file after every meaningful implementation change.

> **Forward-looking status doc, kept compact.** Per-step detail (verification logs,
> file lists, decisions) lives in `context/features/NN-*.md` and git history — link
> there, don't re-narrate. Each completed item is one line + its feature-doc pointer.

---

## Current Phase

Building the MVP.

> 🛠️ **IN PROGRESS — feature 88 (style preset gallery).** The design is
> `context/features/88-style-preset-gallery.md`; the build is split into four
> step files, each with its own instructions and completion gate. **Nothing is
> merchant-visible until step 90.**
>
> | Step | File | Scope | Status |
> | --- | --- | --- | --- |
> | 13a | — | pure domain (`app/utils/stylePresets.ts`) | ✅ `3714361`, 1021 → 1044 tests |
> | 89 | `89-style-preset-engine-persistence.md` | `basedOnPreset` state + write path | ✅ **2026-07-27**, 1044 → **1055** |
> | 90 | `90-style-preset-rail-cards.md` | rail cards + "Customized" hint | ⬜ next |
> | 91 | `91-style-preset-card-preview.md` | preview component + canned sample | ⬜ |
> | 92 | `92-style-preset-gallery-route.md` | `/app/templates/styles`, Skip, `?style=` | ⬜ |
>
> **Step 89 landed 2026-07-27.** A preset id now travels merchant → engine →
> dirty snapshot → Save payload → action → Postgres → loader → engine, normalized
> at both ends by `normalizeStylePresetStamp` (an unknown id or a non-string
> stores NULL). Engine gained `basedOnPreset`, `applyStylePreset`,
> `isCustomizedFromStylePreset`; `resetStyling` clears the stamp,
> `setStylingField` deliberately does not. **No control writes it yet**, so a
> merchant sees no change — live verification is owed by step 90 and listed in
> the step-89 file. No migration (the column has existed since feature 57 Step 4),
> so the stale-Prisma-client trap does not apply.
>
> ⚠️ **The accent/colour-theme feature renumbered 89 → 93** when the step files
> took 89–92. Doc 88 and `stylePresets.ts` were updated; the design is unchanged.

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

Test suite 1021 tests / 38 files; full gate (typecheck · lint · format · test · build) green.

Since B1: the Style tab's width surface — the collapsible rail (feature 76). Feature 75's
full-size preview modal shipped the same day and was **removed 2026-07-25**; see Completed.

**Next:** ⚠️ **feature 87 (plain section header) is BUILT + live-verified rail → Postgres
→ metaobject 2026-07-27; three legs owed** (rendered storefront on an ACTIVE template,
mobile ≤749px, and a template stored as `TEXT_ONLY`) — a third `SECTION_HEADER_STYLES`
member plus a relabel; doc `87-…`. It is item 1
of a five-item merchant report and blocks two of the five reference tables; items 2–5 are
unscoped. Zero-cost by construction (no migration, no new field, no hide predicate, no
`StyleTab.tsx` edit), so it does not move B2.

Then: ✅ **feature 86 (Style tab reorganization) is COMPLETE** — all six steps, shipped
2026-07-26, and it landed BEFORE B2 by merchant decision so presets arrive onto an
organised rail rather than adding a group to a disorganised one. The rail now carries
**eight groups on one axis** (the object being styled), each ending with its own colors.
Doc `86-…`. B2's preset cards slot in ABOVE all eight.

Then: ⚠️ **feature 85 (multi-column row flow) is BUILT but not signed off** — the
feature-70 screen-reader pass it was gated on was skipped at the merchant's instruction
and is still owed, plus two small live checks (see Next Up item 4). It cleared B2's
`ROW_LAYOUTS` blocker, so B2 = steps 13–14 can proceed. **Specced 2026-07-27 as
feature 88, doc `88-…`** — `stylePresets.ts` constants, rail preset cards, and a
gallery **route** (`/app/templates/styles`, NOT a modal) reached from Create template.
**Copy** semantics into real `TableStyling` columns, `basedOnPreset` as provenance
only. `basedOnPreset` / `extraStyles` exist in the schema, deliberately unwritten
until Step 13. Then Phase C (Settings display rules) → E
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

**Plain section header (feature 87, doc `87-…`) — 🛠️ BUILT 2026-07-27, ✅ live-verified
rail → Postgres → metaobject, ⚠️ 3 legs owed**
- Merchant report item 1 of 5: there is no **plain** section header, and `TEXT_ONLY`
  **is not text-only** — it drops the band but keeps `border-block-end: 2px solid`
  (`spec-table.css:218`). Both reference tables (JBL, Samsung) show a bare bold title with
  no rule, so nothing the rail offered could reproduce them. Fix is a third
  `SECTION_HEADER_STYLES` member, `PLAIN`. Tests 1012 → 1021.
- **The cheapest unit the Style tab has had, and it is the Step 2 rule paying out again.**
  `sectionHeaderStyle` is a non-null keyword ⇒ modifier class, so: **no migration** (a
  third legal string in an existing `String?` column), **no new field** in
  `STYLING_FIELD_NAMES` (feature 86's drop guard and the `COLOR_KNOBS` grids untouched),
  **no hide predicate** (count stays 7), **no Liquid / TOML / markup** — the sixth feature
  running that "server precomputes `styling_css`; Liquid only prints" pays for — and
  **no `StyleTab.tsx` edit at all**, because `SECTION_HEADER_OPTIONS` is a `.map` over the
  domain. Appended, never inserted, so `BANDED` stays `[0]` and nothing repaints.
- **It is a member AND a relabel** (merchant decision 2026-07-27). `TEXT_ONLY`'s LABEL
  becomes **`Underlined`** ("Bold title with a rule beneath it"); `PLAIN` reads `Plain`
  ("Bold title, nothing else"). Every label now names the look and **no label is reused
  across values.** 🚫 Giving `PLAIN` the freed "Text only" string was rejected: it is the
  strongest label for the new member but points the same words at a different value, so a
  merchant who remembers picking "Text only" would find "Underlined" selected. Renaming a
  choice is honest; silently re-pointing its name is not. The wire value is unchanged.
- **Two CSS rules, one per shape**, because the collapsible `<summary>` is a **sibling** of
  the section table carrying its own copy of every header declaration — a member styling
  only the flat shape hands the rule back the moment Collapsible is enabled (the Step 9a
  composition hazard). `border-block-end: none`, not a transparent or zero-width border:
  those still occupy the box. ⚠️ **No source-order hazard, unlike feature 79** — the three
  members are mutually exclusive at matching specificity, so they never contest a property.
- **The new guard is the one that would have caught the original defect**, and it is
  derived from the domain rather than hand-listed: **each member states BOTH its
  `background` and its `border-block-end`**, in both shapes (3 × 2). A member declaring
  only one silently inherits the other from the base rule — precisely how "text only" ended
  up underlined. ✅ **Mutation-tested:** dropping `TEXT_ONLY`'s `border-block-end` fails it,
  so it bites on an existing member and not only on the new one. Selector lookups anchor on
  the CLASS and walk to the brace, because all three collapsible selectors wrap at
  prettier's 80 columns and hardcoding the wrap would make reformatting a test failure.
- ⚠️ **Two consequences accepted in writing.** (1) Collapsible + Plain + all closed is a run
  of bare titles with **no separator** — the feature-80 hairline is deliberately NOT
  extended, since it exists because BANDED *drops* an edge and two closed bands merge into
  a slab; a plain title has no fill to merge with, and the absent edge IS the member.
  `sectionGapPx` is the answer, and a test pins the banded-only scope so a later change has
  to revisit the decision rather than drift into it. (2) **`headerBgColor` does nothing
  under Plain** — the rule hardcodes `transparent`, exactly as `TEXT_ONLY` always has.
  Pre-existing; the swatch already self-reports ("needs Header style Banded"). Hiding it
  would be an 8th hide predicate + a feature-86 group change — **open question, not done.**
- ✅ **Live-verified on the DRAFT `Motorola Moto G45 5G`** (0 assigned; merchant added a
  `Phone Details` section header for the purpose). All three options walked by keyboard;
  🔴 **the reported defect reproduced en route** — `Underlined` paints the heavy 2px rule
  with the band gone, which is the state a merchant reached by picking the option that
  said "Text only". `Plain` renders a bare bold title in the flat shape **and** as a
  native disclosure once collapsing is toggled on — the composition hazard the second
  rule exists for, confirmed rather than assumed. Postgres `sectionHeaderStyle="PLAIN"`
  (only column touched). **Measured on the wire:** `styling` overrides-only,
  `styling_css.classes` carries `--section-plain` in field order with the **count
  unchanged at 7**, and **`vars` is EMPTY** — the no-custom-property claim measured, not
  asserted. Left saved on Plain; collapsing discarded back off.
- ⚠️ **Three legs owed:** rendered storefront on an ACTIVE template (this one is DRAFT
  with 0 assigned, so it renders nothing by design), mobile ≤749px in the Mobile preview,
  and a template already STORED as `TEXT_ONLY` to confirm the relabel reads on load.
  🚫 The `.harness/` CSS matrix was **skipped** (recorded as a deviation): two
  declarations with no specificity or source-order interaction to explore, unlike
  79/80/85 where the harness caught real plan errors first.
- ⚠️ **The stale-Prisma-client trap does NOT apply** (no migration), so the dev server
  needs no restart before the first save. Numbering: takes **87**; 82/83/84 stay reserved.
  Report items 2–5 are **unscoped** — feature 86's lesson was not to bundle boundaries.

**Style tab reorganization (feature 86, doc `86-…`) — ✅ COMPLETE, all 6 steps
2026-07-26**
- Merchant reported the Style rail as unorganized and sent two Shopify theme-editor
  screenshots as the target. Root cause: the rail's six groups are cut on **two axes at
  once** — four by OBJECT (Layout / Size & frame / Sections / Rows), two by CSS PROPERTY
  (Colors / Typography). So `headerBgColor` sits ~20 controls from the band it paints,
  `stripeBgColor` sits away from the switch that makes it visible, and `fontWeight` /
  `labelCase` sit in Typography with no Labels group to belong to. Fix: one axis, the
  object axis — **8 groups**, Colors and Typography dissolved, every group ending with its
  own colors 2-up ("structure knobs, then colors" as one learnable rule).
- **Six merchant decisions (2026-07-26)**, all recorded in `86-…`: Table layout leads (not
  Size & frame — Row layout gates four other controls); Sections **splits** into Section
  headers (7) + Collapsible sections (3); **Divider color stays always-visible** (🚫 the
  proposed hide-unless-LINES is a functional regression — `borderColor` also dresses the
  column divider, the feature-80 separator, and the outline whenever `outerBorderColor` is
  unset); Stripe background likewise; **short labels inside groups** (`Weight`, `Title
  size`); and it lands **before B2**.
- **Three structural calls, not preferences.** (1) `labelCase` goes to Labels, NOT the
  merchant's "Table text" — verified against the stylesheet, `--appx-spec-label-transform`
  and `-font-weight` sit on `.appx-spec-table__label` while size/style/line-height sit on
  `__table`; filing case as table-wide is falsifiable in one click. (2) Short labels are
  safe only because every group keeps `role="group"` + `aria-labelledby` — the "do not
  rename Label weight" lock in `stylingControls.ts` is satisfied by a different mechanism
  and its comment must be updated (Step 6). (3) The Colors group's "leave a swatch empty to
  inherit" note has no home once the swatches scatter, so **each swatch reports its own
  state** instead (the idiom six number fields already use) — better than the group note
  even for sighted users, and this is the feature's a11y answer rather than repeating one
  sentence five times.
- **Zero storefront diff, by construction.** No column added/renamed/dropped, no schema, no
  migration, no CSS, no Liquid, no TOML, no `tableStylingCss.ts`, no metaobject change.
  Every rename is a merchant-facing LABEL — `borderColor` stays `borderColor` on the wire.
  No new hide predicates either: the count stays **7**.
- ✅ **Step 1 — the drop guard** (`styleTabContract.test.ts`, 5 tests, 981 → 986). Nothing
  stopped a Style-tab edit from silently dropping a control: the knob would vanish from the
  rail while its column, CSS var, serialization and storefront rule all stayed live, so it
  would keep round-tripping and rendering the last saved value while being unreachable —
  no failing test, no type error, detectable only by eye. Tolerable when adding one
  control; not when relocating all 34, so the guard was built **first and against the
  pre-move rail**. Pins: every `STYLING_FIELD_NAMES` member is reachable from a control,
  and **no field is reachable from two** (a field on both routes would render twice, each
  control silently overwriting the other). Two routes because the rail has two — a literal
  `setStylingField("field", …)` for the 24 non-colors, and a `COLOR_KNOBS` entry for the 9
  colors, whose call passes a VARIABLE and is invisible to a text scan. Reads the real file
  off disk with comments stripped, same technique + same reason as
  `specTableCssContract` / `specTableAriaContract` (jsdom cannot render Polaris web
  components, so text is the only handle on JSX).
  ⚠️ **Mutation-tested, not assumed:** removing Density's literal call and the `COLOR_KNOBS`
  render both failed the guard, and the first named `density` in the diff. The
  `COLOR_KNOBS` check counts **≥2 occurrences** rather than `toContain` — the import alone
  would satisfy a presence check, so a rail that imported the list and rendered none of it
  would have passed.
  🚫 **Deliberately NOT asserted:** that every scanned name is a real field.
  `setStylingField` is generic over `keyof StylingValues` (`useRowEngine.ts:223`), so a typo
  is already a compile error — a runtime check would be a weaker second copy of the type
  system. And the guard proves **reachability, not correctness**: it cannot see a control in
  the wrong group or a wrong label, which is why steps 4–5 are live verification.
- ✅ **Step 2 — the copy and data pass** (986 → 1004 tests). Copy only: no control moved,
  no group changed, no value changed. Eleven control labels shortened + two swatches
  renamed (`Table outline` → `Outline color`, `Border` → `Divider color`) + four shortened
  to bare `Background` / `Text color`. `StylingOption.helpText` became **optional**, which
  cut ten always-on descriptions; the surviving glosses are mostly `Inherit` and
  empty-state lines, so **the rail's help text is now state-reporting throughout** —
  it speaks in the states that need explaining and stays quiet otherwise, which makes one
  idiom out of what were two. `COLOR_KNOBS` gained `group` + `emptyHelpText`, and
  `STYLE_GROUP_HEADINGS` is the new one table of truth for the eight groups.
- ⚠️ **The `stylingControls.ts` scope lock was NOT broken, it changed mechanism.** It
  forbade renaming "Label weight" because "the control names its own scope"; the control
  now reads "Weight" and the `Labels` group heading states the scope instead — wired with
  `role="group"` + `aria-labelledby`, so it is announced, not merely seen. What still
  holds: a table-wide "Font weight" would require moving the var off
  `.appx-spec-table__label` and repainting every live table. **Dropping a group wrapper
  would silently break the lock**, which is why `STYLE_GROUP_HEADINGS` says so too.
- ⚠️ **The old Colors group note was WRONG about four of nine swatches, and per-swatch
  state text is what exposed it.** "Leave a swatch empty to inherit that color from your
  theme" holds for five; the band (`rgba(0,0,0,0.06)`), the stripe (`0.04`) and the row
  rules (`0.1`) fall back to this app's own literals, and **`outerBorderColor` inherits
  nothing** — it falls back THROUGH `borderColor`, so its empty state is "follows another
  control on this screen" ("Follows Divider color."), which no group-level sentence could
  have said. A test pins which five may say "theme".
- 🔴 **One defect found LIVE that the character count had passed.** `Header background`
  (17 chars) wrapped in the 2-up color grid and pushed its swatch below its neighbour's,
  misaligning the row — while `Stripe background`, the *same 17 characters*, fits, because
  "Stripe" sets narrower than "Header". The usable cell is right at the boundary and the
  real limit is nearer 15. Shortened to `Background` and re-verified. **Method note:
  measuring labels analytically filters but does not substitute for looking at the rail.**
- 🚫 The two feature-81 header `Record`s are now character-identical to their Labels-group
  twins (the "titles" prose was cut on both sides) and are **deliberately not merged**: the
  guard asserting the header lists never say "label" can only fail while they are
  separable. A vacuous guard is worse than four lines of duplication. A second test pins
  that the two `Inherit` glosses still differ.
- **Live-verified** top to bottom on the DRAFT `Motorola Moto G45 5G` (0 assigned; nothing
  saved, SaveBar never appeared): every rename, `On mobile`/`Density` with no help line and
  **no leftover gap** (the `undefined` mapping works — `""` would paint a blank grey row),
  and every empty-swatch state line.
  ⚠️ **The rail is transiently worse in one spot until Step 4** — short labels landed
  before the groups that justify them, so the still-undivided `Colors` group shows three
  `Background`s and two `Text color`s in one run. Consequence of the step order, not a
  defect; the per-group uniqueness test already asserts the post-Step-4 grouping.
- ✅ **Step 3 — the separation treatment** (1004 → 1006 tests). Visual only: nothing moved
  between groups, no control and no copy changed, so the step answers *does the separation
  read well at 300px* on its own rather than inside Step 4's 34-control diff. Outer stack
  `gap="base"` → **`large-200`**, inner per-group stacks stay **`base`**, and an
  `<s-divider>` between each pair of groups plus one above Reset. The pair is the point:
  proximity alone already reads as groups **before a rule is drawn**, and the dividers
  restate that boundary for anyone reading structure rather than rhythm. `large-200`
  verified as a real `SizeKeyword` against `polaris-types`; its px value is not shipped in
  the package, so the amount was settled by looking (~20px). Reset lost its
  `paddingBlockStart="base"` — it only ever existed to buy space the stack and rule now
  supply twice over — and takes a rule despite not being a group, because it acts on
  everything above it.
- 🔢 **Count correction: the rail has SIX groups, not seven.** Earlier notes here (and the
  root-cause line above) say seven; `role="group"` in `StyleTab.tsx` counts **six** —
  Layout · Size & frame · Sections · Rows · Colors · Typography. That is exactly what the
  two-axes diagnosis predicts (four by object + two by CSS property), so seven was a
  miscount. The target is still 8. It mattered concretely: it set the divider count.
- **The Step 3 guard is scale-free on purpose** (+2 tests in `styleTabContract.test.ts`),
  so Step 4 can add two groups and move all 34 controls without editing either assertion.
  (1) **`dividerCount === groupCount`** — not a coincidence: N−1 rules between groups plus
  one closing rule above Reset means N groups always want N dividers, six today and eight
  after the move. A group added later without its rule is invisible to every other test in
  the repo and reads as a rendering glitch rather than a missing line of JSX. (2) **the two
  gap scales stay different** — outer matches `large-\d+`, every inner stack is `base`;
  collapsing them would delete the proximity signal, not merely tighten the rail.
- **Live-verified** on the DRAFT `Motorola Moto G45 5G` (nothing saved, SaveBar never
  appeared): all six boundaries reading cleanly, even spacing either side of each rule, and
  Reset now sitting at the same rhythm as a group heading. The rule is a faint hairline
  inset to the control width — correct here, since `s-divider`'s default `base` keeps
  whitespace primary where `strong` would read boxy.
  ⚠️ **"Both rail widths" was a non-question:** the rail is a fixed `18.75rem` track
  (`EditorShell.tsx:252`) or hidden outright (`railCollapsed` → `1fr`). No intermediate
  width exists, so window size cannot change the treatment.
  ⚠️ **Tooling correction:** mouse-wheel scroll does **not** reach the rail inside the admin
  iframe — the earlier session note claiming it did was wrong. Click a control and `Tab`;
  the scroll container follows focus. Each `s-color-field` takes **two** tab stops.
- ✅ **Step 4 — the move** (1006 → 1010 tests). Six groups became **eight**, `Colors` and
  `Typography` dissolved, all 34 controls now on one axis — the object being styled:
  Table layout (4) · Table size & frame (5) · Table text (4) · Section headers (7) ·
  Collapsible sections (3) · Rows (5) · Labels (4) · Values (2). Every group ends with its
  own colors, which is the one rule a merchant learns once: **structure knobs, then
  colors.** Headings render FROM `STYLE_GROUP_HEADINGS`, so the Step 2 vocabulary finally
  has a consumer instead of drifting unobserved.
- **`colorGrid(group)` is a plain function, not a component.** The nine swatches were one
  `.map` and are now five FILTERED grids — filtering, never reordering, which is what lets
  `COLOR_KNOBS` stay in `STYLING_FIELD_NAMES` order. Called as `{colorGrid("labels")}`
  rather than `<ColorGrid/>` because a component declared inside `StyleTab` is a new type
  every render and would remount its subtree, losing focus and any half-typed hex; not
  hoisted to module scope either, since it closes over `styling` + `setStylingField`.
  `tableFrame`'s single swatch still renders 2-up (half width, gap beside it) — a
  full-width lone swatch would make Outline color the only differently-sized color input in
  the rail.
- ⚠️ **The move opened a hole the Step 1 drop guard cannot see, and it is closed.** That
  guard proves a color is reachable via `COLOR_KNOBS`, which was airtight while ONE `.map`
  rendered the whole list; with five filtered grids, deleting a single
  `{colorGrid("values")}` strips two swatches while `COLOR_KNOBS` still appears five times
  and every pre-Step-4 test passes. Four tests added, all derived from data rather than
  hand-listed: every `STYLE_GROUP_HEADINGS` id has a group; every heading is taken FROM the
  vocabulary rather than retyped (a hardcoded `<s-heading>Labels` renders fine today and
  silently disagrees the first time a heading is reworded); every group with swatches
  renders its grid; and the Colors note is gone. ✅ **Mutation-tested** — deleting
  `{colorGrid("values")}` fails and the diff names `values`.
- **Live-verified** top to bottom on the DRAFT `Motorola Moto G45 5G` (nothing saved,
  SaveBar never appeared; storefront preview pixel-identical to before the move, which is
  the zero-diff claim holding in practice). ✅ **The Step 2 transient regression is
  resolved** — the three `Background` and two `Text color` swatches now each sit under
  their own announced heading, and Labels' pair vs Values' pair reads cleanly across a
  heading plus a rule, which is exactly the bet the short-label decision made. ✅ `Outline
  color` sits under Outline width reading **"Follows Divider color."**
  ⚠️ **`Collapsible sections` collapses to a heading + one switch** while collapsing is
  off, and the heading nearly restates the switch label. It earns itself at three controls
  when on. **Step 5 decides** — recorded as a live observation, not acted on.
- ✅ **Step 5 — conditional state + a11y** (1010 → 1012 tests). The move redistributed the
  seven hide-gated controls — `showsCustomFontSizeInput` into a group of four, BOTH
  `sectionsCollapsible` rules into a group of three — so the new risk was a group whose
  every control is gated rendering as **a heading and a divider fencing nothing**: an empty
  section a merchant reads as broken, and a `role="group"` with no members. Pinned as a
  static test over all **2⁷ combinations**, which beats live toggling (that only samples).
  Counted rather than parsed, and the soundness condition — each guard wraps exactly one
  control — is itself asserted at 7 against the registry count; without it the first
  assertion decays from a real check into an arithmetic accident.
- **All seven predicates toggled LIVE and correct**, count unchanged at 7 (feature 86 added
  none, and the rail-side guard now cross-checks the number from the JSX as well as the
  registry): Stacked/Grid hide On mobile + Label column width · Grid shows Minimum column
  width · Maximum width 960 shows Alignment · Text size Custom shows Custom size seeded 16
  · Enable collapsing shows Sections start + Gap. Thinnest state seen live is `Table
  layout` under Stacked — heading + `Row layout` alone — and it reads as a group, not an
  empty section. **All changes discarded; nothing saved.**
- ✅ **`Collapsible sections` KEPT** (the Step 4 open question). At three controls it is
  unambiguously a group; at one it is a heading plus a switch that nearly restates it. Kept
  because the redundancy is the standard settings idiom (a section named X whose first
  control enables X), the thin state is the one where the merchant has least to do there,
  and merging back would rebuild the eight-control group the merchant asked to split.
- ⚠️ **Two Polaris limits found and accepted.** `s-heading` takes **no level prop** (only
  `accessibilityRole`), so the panel title and all eight group headings are peers rather
  than nested — pre-existing, not an 86 regression, and `role="group"` + `aria-labelledby`
  is what carries the structure; wrapping groups in `s-section` to get levels would add
  card chrome the rail does not want. `s-divider` extends only `GlobalProps` (no
  `accessibilityVisibility`), so it cannot be marked decorative — Polaris's call, and a
  separator between groups is semantically honest anyway. Also: **`s-number-field` commits
  on blur, not per keystroke** — worth knowing before reading a hide rule as broken.
- ✅ **Step 6 — lock reconciliation + docs.** `StyleTab.tsx`'s header comment narrated the
  rail as a sequence of feature-57 steps ("first three groups — Layout · Sections · Rows",
  "Step 10a adds the Colors group") and described a rail that no longer exists. Rewritten
  around the **organising rule** plus the four invariants a future knob must respect: one
  axis (the object), every group ending with its colors; placement decided by **where the
  CSS var lands**, checked against `spec-table.css`; the headings are load-bearing; and no
  group may consist entirely of hide-gated controls. Still-true material kept (no contrast
  checking, no generic control wrapper, the `""`-to-null rule, the a11y decisions).
  The two `stylingControls.ts` locks needed no work — Step 2 rewrote them when the labels
  actually shortened; re-read and correct as written.
- **`admin-screen-plan.md` §Tab 2 amended, not rewritten.** Its "Style rail (top → bottom)"
  list is the original grouping — now wrong about structure, still right about every knob —
  so a superseding note was added at the head of the list (the convention the doc already
  uses for its 2026-07-19 amendments) carrying the eight-group table and the var-placement
  rule. It also fixes two drifts the list had accumulated independently of feature 86:
  ⚠️ it says **"seven" colors when there are NINE** (`headerTextColor` from feature 81 and
  `outerBorderColor` both post-date the spec), and it records that **Style presets still
  sits ABOVE all eight groups** when B2 lands — the reason 86 deliberately preceded B2.

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

**Multi-column row flow (feature 85, doc `85-…`) — 🛠️ BUILT & live-verified
2026-07-26, ⚠️ NOT SIGNED OFF (feature-70 screen-reader pass still owed)**
- Merchant sent five competitor spec tables laying rows out in 2–3 side-by-side tracks.
  Ships "Type A" only (the unit laid out is one label/value pair); section-level flow is
  out of scope with a recorded reason. `GRID` joins `ROW_LAYOUTS` (appended, never
  inserted) + one nullable `gridMinColumnWidthPx` (160–640, null = the stylesheet's
  240px). Migration `20260726100927_add_grid_min_column_width_styling`, confirmed
  non-repainting (6 rows, 0 affected). **No Liquid, no TOML, no markup change** — the
  fifth feature running that the "server precomputes `styling_css`; Liquid only prints"
  pipe paid for. Tests 943 → 981.
- ⚠️ **Built ahead of its own blocker at the merchant's instruction.** The doc gates this
  on feature 70's screen-reader pass (item 3 in Next Up) because GRID is the THIRD
  departure from `display: table` riding on an ARIA chain no assistive tech has ever
  confirmed. The pass is still owed. One new data point in its favour: Chrome's
  accessibility tree was read on the live storefront under `display: grid` and still
  exposes table/rowgroup/row/rowheader/cell — the roles survive the display change.
  That is not the same as a screen reader ANNOUNCING the pairs, which is what feature 70
  actually owes.
- **A minimum column width, never a column count** — `repeat(auto-fit, minmax(min(var(…,
  240px), 100%), 1fr))`. Responsiveness with no media query, no unreadable 3-tracks-in-a-
  600px-theme case, and it is what keeps the ~640px editor preview honest (a count knob
  would render "3 columns" there and on a 1400px storefront while looking nothing alike).
- 🔴 **Three plan corrections, all found by the CSS harness and all invisible when
  broken** — the full write-up is the build log at the top of `85-…`:
  (1) the **stripe stand-down LOST on specificity**, not source order — the plan's "they
  tie" math missed the fill rule's `:nth-child` and `__row`, so the specced 3-part
  selector never won and the checkerboard painted anyway; the shipped rule mirrors the
  fill rule's shape (5 parts) and additionally stops the broad form wiping a merchant's
  own `labelBgColor` / `valueBgColor`; (2) a bare `minmax(<min>, 1fr)` **overflows** when
  the minimum exceeds the container — measured 25px at 400 and 265px at 640 in a 375px
  container, both reachable from the rail's range — fixed with `min(…, 100%)`;
  (3) the **`--outer-border` last-row exception is wrong in grid** (it assumes the last
  DOM row is the row against the frame; measured `1px,1px,1px,0px` across the final track
  row), so it now stands down via `:not(--layout-grid)` on all three of its selectors.
- **The height win is real but ~half the plan's claim, and it peaks at the default.**
  Measured on the live 44-row DJI storefront, all sections open, 1440px: TWO_COLUMN 3963px
  → GRID@240 **2848px (−28%, ~1100px, about one screen)**. Not the "44 rows becomes ~15"
  the plan assumed, because **a grid row is as tall as its tallest member** and this
  catalog is ragged (value heights median 43px, max 536px). ⚠️ Going BELOW 240 makes it
  worse (@160 = 2893px): narrower tracks wrap long values more. Empirical vindication of
  the 240 default, and the guidance to give a merchant who assumes narrower = shorter.
- **Rail:** third Row layout option; new **Minimum column width** box (blank = 240, the
  blank-box idiom — 0 clamps UP to the floor rather than meaning "off", unlike Outline
  width); hide-rule count **6 → 7** (`showsGridMinColumnWidthControl`, registered in
  `VISIBILITY_PREDICATES` so it inherits preserve-on-hide); `showsMobileLayoutControl`
  narrowed `!== "STACKED"` → `=== "TWO_COLUMN"`; `showsLabelWidthControl` hides for GRID
  for free. **Stripes is hidden in Grid** (merchant call) via `rowDividerOptionsFor`, the
  rail's first per-option hide — deliberately NOT in `VISIBILITY_PREDICATES`, which
  governs whole controls. Its orphan case (a merchant already on Stripes who switches to
  Grid) keeps the entry visible and labelled rather than blanking the select or coercing
  the value.
- **Round-trip live-verified end to end** on the ACTIVE DJI template: rail → Save →
  Postgres → metaobject (`styling` overrides-only carrying `rowLayout`/`gridMinColumnWidthPx`;
  `classes` carrying `--layout-grid` in field order and the **same length as before** —
  the no-new-presence-flag claim measured on the wire; `vars` carrying
  `--appx-spec-grid-min-column: 400px`) → rendered Horizon storefront (3 × 480px tracks
  in 1440px, page overflow 0, 9 disclosures intact). Section header spanning every track,
  stripe stand-down, and the dropped column divider all re-verified against the production
  stylesheet. An all-`TWO_COLUMN` control measured **394px before and after**.
  **Left saved with Grid + minimum 400** (revert = two controls; consider clearing the
  400, since 240 measured materially shorter).
- ✅ **Both deferred live checks closed on a second pass 2026-07-26.** (1) The **Stripes
  orphan renders as specced** on the Moto G35 template (saved `TWO_COLUMN` + `STRIPES`):
  switching to Grid leaves the select reading "Stripes" with "Stripes do not apply in Grid
  layout. Pick Lines or None." rather than going blank, the orphan is the TRAILING entry
  after Lines/None (walked with the keyboard), picking another member **drops it for
  good**, and the preview's stripe fill vanished the moment Grid was picked — the CSS
  stand-down is visible in the preview surface too. Template left untouched via Discard,
  re-read from Postgres to confirm. (2) **Mobile measured at a genuine narrow viewport**
  (the storefront sends `frame-ancestors 'none'`, so the probe is the real markup + the
  real CDN-deployed stylesheet in a `srcdoc` iframe): **overflow 0 at every width**, and
  the doc's "no media query" claim **splits in two** — above 749px `auto-fit` genuinely
  collapses on its own (1 track at 800px), but at/below 749px the pre-existing
  `--mobile-stacked` rule is later in the file, wins, and turns the grid OFF in favour of
  the stacked layout. Same look, different mechanism. On the `--mobile-same-as-desktop`
  path (rule-less, and reachable because the rail hides that control without clearing it)
  the grid DOES stay on and `min(…, 100%)` holds it to one 356px track at 375px and one
  301px track at 320px even with a 640px minimum — which is what makes build-log fix 2 a
  real shipping guard rather than a theoretical one.
- ⚠️ **The backtick trap fired for the second feature running** (81 recorded it first): a
  comment written for the stripe rule contained a backticked snippet, which breaks the
  `previewStyles.ts` mirror. The mirror is now regenerated by a script that REFUSES to run
  when the CSS contains a backtick, rather than relying on remembering.
- ⚠️ **The stale-Prisma-client trap did NOT fire this time, because the dev server was
  restarted before the first save** — the discipline works. Restarting also let
  `prisma generate` complete without the usual `EPERM … query_engine-windows.dll.node`,
  since the running server was what held the lock.
- Numbering: takes **85**; 82/83/84 stay reserved. ⚠️ **Superseded by feature 88
  (2026-07-27):** the "must land in the B2 preset bundles" claim repeated across 78–85
  is wrong — bundles set **structure only** (4 axes + collapsible, 0–3 fields each), so
  every colour, typography and frame field stays a rail knob and is deliberately absent
  from every bundle. `GRID` DOES land (Multi-column's bundle); `gridMinColumnWidthPx`
  does not — null = the stylesheet's 240px, which measured shortest. **No bundle ships
  `GRID` + `STRIPES`** still holds and now falls out of the rule for free, since no
  bundle names a divider style other than `NONE`.

**Section header typography & spacing (feature 81, doc `81-…`) — ✅ shipped & fully
live-verified 2026-07-26**
- Merchant sent five competitor spec tables (Best Buy, Amazon, Trek, AppleGadgets, a fifth
  blue-band sample) and asked which section-header treatments the app can reproduce. Five
  were missing; all five ship here as **nullable `TableStyling` columns** — `headerTextColor`,
  `headerFontSizePx`, `headerFontWeight`, `headerCase`, `headerPaddingBlockPx`. Migration
  `20260726054441_add_section_header_typography_styling`. Band radius / chevron position /
  open-close animation from the same report are **82 / 83 / 84**, each split out for a
  recorded technical reason. Per-row ⓘ icons are content, not styling → Phase C.
- **The cheapest unit the Style tab has had, and that is a consequence of the Step 2 rule,
  not a coincidence.** Nullable ⇒ CSS custom property, so: **no modifier class, no presence
  flag, no hide predicate (count stays 6), no markup, no Liquid, no TOML.** Fourth feature
  running that "server precomputes `styling_css`; Liquid only prints" paid for. Three tests
  now pin the no-class claim, and it was **measured on the wire**: after saving three knobs
  to the ACTIVE DJI template the metaobject's `styling_css.classes` string is byte-identical
  to before the feature, while `.vars` gained three declarations.
- ⚠️ **`headerFontSizePx` is absolute px, NOT an em keyword — structural, not taste.** The
  collapsible `<summary>` is a **sibling** of the `<table>` that carries
  `--appx-spec-font-size`, so an em multiplier would resolve against a different base in each
  shape and silently resize when a merchant toggled Collapsible. px resolves identically in
  both. This also collapsed the control from a five-option tri-state to a plain number box.
- **`headerPaddingBlockPx` is the ONE integer knob with a 0 floor** (merchant's call). Feature
  78's minimum-of-1 law governs knobs where null already means off; here null means the
  `0.75rem` literal, so 0 is a *first* spelling of a genuinely different render, nothing keys
  a presence flag on it, and the mapping guard is `!== null` rather than falsiness so a stored
  0 emits `0px` instead of falling through to the fallback. **Block axis only** — the inline
  padding stays welded to the row cells' `0.75rem`, or a 24px title would indent past its own
  labels. Written as `padding-block`/`padding-inline` longhands: a var inside a shorthand is
  IACVT and would drop **all four sides** to zero.
- **Live-verified end to end** on the ACTIVE DJI template: rail → Save → Postgres → metaobject
  → rendered Horizon storefront, all 9 sections at `22px / 700 / uppercase / 18px block`, with
  **`padding-inline` still `12px`** (the block-only decision in production) and `font-weight:
  700` coming from the *literal fallback* since `headerFontWeight` is null. Features 79/80
  undisturbed (`margin-block-start` 0/25px, every `border-block-start` 0px). Row labels stay
  `text-transform: none` — `headerCase` never touches `labelCase`'s surface. Mobile checked at
  a genuinely reflowed `innerWidth: 502` (`labelDisplay: block` proves the @media fired): all
  five identical to desktop. A 16-case CSS harness against the real stylesheet ran **first**;
  its all-null control measured `12px/16px/700/none` — the pre-feature literals, so the
  no-repaint claim is measured, not asserted. Migration non-repainting (6 rows, 0 non-null).
  Tests 914 → 943.
- ⚠️ **Two traps worth carrying forward.** (1) A **backtick in a `spec-table.css` comment**
  breaks the `previewStyles.ts` mirror — the file header says so and the first comment written
  here violated it; use plain words for CSS syntax in that file. (2) The **stale-Prisma-client
  trap hit for the fourth consecutive feature** (78/79/80/81) and presented at its sharpest:
  Save wrote nothing and left the SaveBar reading "Unsaved changes" — no toast, no error. The
  discriminator settled it in one command (a fresh `node -e` writes fine ⇒ the server is just
  stale). Also: `prisma generate` can report `EPERM … query_engine-windows.dll.node` while
  still having rewritten the types and client JS, so typecheck/build pass on a "failed"
  generate — the engine binary is version-, not schema-specific. Don't loop on it.
- **Left saved with** Section title size 22 · case Uppercase · padding 18 (revert = two boxes
  + one select). `headerFontWeight` / `headerTextColor` deliberately left null, which is what
  made "absent from the wire when null" a real check.
- Numbering: this takes **81**. ⚠️ **Superseded by feature 88 (2026-07-27):** these five
  do **not** join any preset bundle — header typography is tuning within a pattern, not a
  pattern. They remain what lets the reference tables be reproduced rather than
  approximated; that reproduction now happens in the rail after a card is picked.

**Section separation + section gap (feature 80, doc `80-…`) — ✅ shipped & fully
live-verified 2026-07-26**
- Merchant collapsed every section on the ACTIVE DJI template and the banded headers
  rendered as **one unbroken grey slab** — no edge between adjacent bands. Root cause is
  one Step 8 rule doing exactly what it says: `--section-banded` drops the summary's
  `border-block-end` because "the band edge IS the separator", which is true when a band
  is followed by ROWS and false when it is followed by ANOTHER BAND — a state only
  collapsible sections can reach. **Not a regression from 77–79.** Two halves shipped
  together: **A** a base-rule separator (no knob), **B** a `sectionGapPx` knob.
  Migration `20260725181733_add_section_gap_styling`. **No Liquid change** — third
  feature running that the "server precomputes, Liquid only prints" pipe paid for itself.
- **A — `border-block-START`, not `-end`, and that is the whole trick.** The banded rule
  owns the bottom edge of the very same element, so claiming the opposite side means the
  two rules never contest a property: no specificity tie, **no source-order dependency**
  (contrast feature 79, where the tie made file order load-bearing), no `!important`.
  Reads `--appx-spec-border-color`, so it matches the row rules by construction — the
  feature-79 call made again, no new swatch.
- ⚠️ **`:not([open])` on the PRECEDING section is a no-repaint device, not a nicety.**
  `ALL_OPEN` is the default initial state, so an unconditional rule would add a second
  hairline above every band on every collapsible banded table already live. Scoped this
  way, only the broken state changes — **measured**: a banded ALL_OPEN table renders
  `border-block-start: 0px` throughout, exactly as before. Free bonus: `[open]` is a live
  attribute, so the separator appears/disappears as a shopper toggles a section, with
  **zero JavaScript** — verified on the storefront by clicking (`0px → 0.909091px` on
  close, and back).
  **Accepted gap:** an OPEN but EMPTY section (Step 9a's empty collapsible / feature 74
  R3) renders a zero-height table, so its band still abuts the next. Closing it means
  dropping `:not([open])` and repainting every default table — the law wins.
- **B — `sectionGapPx Int?` (1–48, null = no gap)**, in **Sections** under "When the page
  loads", as a **zero-means-off** box (the third, joining Outline width and Corner
  radius). px not a keyword: nothing here can clash the way a column-rule width could, and
  matching a theme's rhythm needs a number. `showsSectionGapControl` is the **6th** hide
  rule and the second gated on `sectionsCollapsible` — for a harder reason than the
  initial-state control: a gap is not merely meaningless in the flat shape, it is
  **unexpressible**, since a flat section header is a `<tr>` and a `<tr>` takes no margin.
  (🚫 The transparent-`border-block-start` approximation is rejected in writing: under
  `border-collapse: collapse` the wider border wins the shared edge and would delete the
  previous row's divider.) Inherited the preserve-on-hide law by adding one row to
  `VISIBILITY_PREDICATES`.
- **The third presence flag `--section-gap` earns its keep twice**, and one of those was a
  **plan correction found during the build**: the gap rule is gated on the class rather
  than left to `var(--…, 0)`, because an always-declared `margin-block-start: 0` from a
  two-class selector **beats a theme's own element-level `details` margin** — inert as a
  value, not as a declaration. Its other job is telling A's hairline to stand down once
  whitespace already separates the bands. A test pins that the file declares
  `margin-block-start` exactly once, inside that rule.
- **Round-trip live-verified end to end** on the ACTIVE DJI template: rail → Save →
  Postgres `sectionGapPx=12` → metaobject (`styling` overrides-only, `styling_css.classes`
  ending `--section-gap`, `vars` = `--appx-spec-section-gap: 12px;`) → rendered Horizon
  storefront (first section `margin-block-start: 0px`, all 8 others `12px`, every
  `border-block-start` `0px`). Frame interaction probed live without saving: with
  `--outer-border`/`--outer-radius` on, gaps survive inside the frame, `overflow: hidden`
  engages, the last summary's bottom rule was already `0px` so nothing doubles, and width
  stays 1440px (feature 77 unaffected). Mobile ≤749px checked in the editor's Mobile
  preview: stacked, gap intact, no artifacts. Migration confirmed non-repainting (6 rows,
  0 non-null). An isolated 6-case CSS harness against the real stylesheet ran **first**, so
  the storefront pass was a confirmation rather than an exploration. Tests 892 → 914.
  ⚠️ **`s-number-field` commits on blur, not per keystroke** — typing a value leaves the
  help text and SaveBar untouched until focus leaves. Pre-existing (all three px boxes do
  it); knowing it saves a false "the knob is dead" diagnosis.
  **The DJI template is left saved with `Banded` + `Gap = 12`** (it had been on `Text
  only`, which was the workaround for this bug). Revert = two controls.
- Numbering: this takes **80**. `sectionGapPx` is the ONE tuning value feature 88 keeps in
  a bundle (`Accordion`, at 12px) — a Trek-style accordion needs whitespace between
  disclosures to read as separate blocks. ⚠️ **Corrected 2026-07-27:** the Accordion preset
  is collapsible + **`TEXT_ONLY`** + a gap, not banded — a clickable header wants the 2px
  rule, and banded is its own card.

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
- Numbering: this takes **79**. ⚠️ **Superseded by feature 88 (2026-07-27):**
  `columnDividerStyle` lands in **no** bundle, and the "Bordered / Grid" preset it was
  meant to enable was **withdrawn**. The two banded references (startech, techlandbd)
  differ only on the frame and column-rule axes, which is evidence those are tuning
  *within* Banded rather than a look a merchant starts from. The knob is unaffected —
  it is two clicks from the Banded card.

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
  ⚠️ B2 note **superseded by feature 88 (2026-07-27)**: none of these five lands in a
  preset bundle. Frame and width are tuning within a pattern, not a pattern — and the
  frame is the one axis that can collide with the merchant's theme (startech's apparent
  "frame" is the theme's own section card, not the table's).
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

1. **Reshell Phase B2** — built-in preset gallery (Style tab steps 13–14), **specced
   2026-07-27 as feature 88, doc `88-…`**. Every blocker is cleared and there is **no
   migration** (`basedOnPreset` already exists, unwritten since Step 4).
   **The plan is derived from SEVEN merchant-supplied reference tables**, not invented:
   four axes define a pattern (pair layout · section headers · row separation · frame)
   plus one behavioural axis (collapsible); everything else in `STYLING_FIELD_NAMES` is
   tuning *within* a pattern.
   ⚠️ **This overturns the "must land in the preset bundles" note repeated across 78–85.**
   A bundle sets **structure only** — no colour, no typography, no density, no width — so
   bundles are 0–3 fields, all nine swatches stay null after a pick, and the zero-config
   theme-inherit promise survives a preset pick intact. Five cards: **Banded `{}`** (the
   app's default already IS the dominant retail pattern, so it merges with the planned
   "use my theme's styles" option) · Simple · Minimal · Multi-column (`GRID`) · Accordion.
   **No bundle ships `GRID` + `STRIPES`** still holds — now for free, since no bundle
   names a divider style other than `NONE`.
   Two decisions that must be built in Step 13 rather than retrofitted: the gallery is a
   **route** (`/app/templates/styles`), not a modal, and the "Customized" hint compares a
   **fixed `PRESET_SCOPED_FIELDS` set**, NOT `stylingEquals` over all 34 fields (which
   would break the moment Step 89's accent themes write a colour) and NOT the bundle's own
   keys (Banded's `{}` would compare nothing). **Feature 89 = accent / colour themes**,
   deferred by merchant decision with its six seams cut in 88.
   (**Feature 88**; 82/83/84 stay reserved, 86 = Style tab reorganization, 87 = plain
   section header. Before those: 70 = stacked-semantics, 71 = sidebar inner-scroll,
   72 = device-preview mockups, 73 = desktop preview inner scroll, 74 = content-free
   tables, 75 = full-size preview modal (removed), 76 = collapsible Style rail,
   77 = container stretch, 78 = width + outer border, 79 = column divider, 80 = section
   separation + gap, 81 = section header typography, 85 = multi-column row flow — a
   retired number is still spent.) Then C (Settings display rules) → E (assignment into
   the reshell) → F (top-bar status/save + cleanup).
2. **Section band radius / chevron position / animated open-close (proposed 82 / 83 / 84).**
   The rest of the same merchant report feature 81 answered. Each is its own unit for a
   recorded reason — see "Deliberately out of scope" in `81-…`: a radius behaves differently
   on a `th` under `border-collapse` than on a `<summary>` and needs a gap to look right; a
   right-aligned chevron means abandoning `list-style-type` for a pseudo-element, which
   already broke once against Horizon's `summary { list-style: none }`; and height animation
   needs `::details-content` + `interpolate-size`, so it is progressive-enhancement only and
   must be reduced-motion guarded. 🚫 Not the JS `grid-template-rows` trick — that breaks the
   zero-JS `<details>` invariant.
3. **Storefront table semantics in stacked layouts (feature 70)** — code shipped;
   screen-reader pass still owed (see Open Questions). ⚠️ **Now blocking feature 85**
   (below), which would be the third `display`-departure riding on the same unverified
   ARIA chain. Run the pass before building it.
4. **Feature 85 sign-off — one blocker left.** The build is done and fully live-verified
   (see Completed; both deferred checks closed 2026-07-26), but it is deliberately NOT
   marked shipped: ⚠️ the **feature-70 screen-reader pass** (item 3) was its stated
   blocker and was skipped at the merchant's instruction. Run it — and if the roles are
   wrong, feature 70's own instruction is "revert, do not patch", which now costs three
   consumers rather than two. One data point in its favour: Chrome's accessibility tree
   under `display: grid` still exposes table/rowgroup/row/rowheader/cell on the live
   storefront, but that is not the same as a screen reader ANNOUNCING the pairs.
   Also decide whether to clear the DJI template's saved minimum of 400: **240 measured
   511px shorter** on that table.
5. **Editor page should not scroll at the document level** — the app document overflows the
   iframe by roughly the `.tipsFooter` height (it renders BELOW the card, outside
   `useScrollRegionHeight`'s flat `BOTTOM_PAD_REM = 3` budget), producing a stray outer
   scrollbar stranded beside admin's reserved 16px scrollbar gutter. Fix = measure the actual
   footer/card bottom instead of the hardcoded 3rem. Touches the measurer both scrollers share,
   so it is its own unit.
6. **Templates-list Phase 2** — search / sort / pagination (server-side, with pagination) when the list can grow large; multi-select bulk actions later.
7. **Pre-submission** — mandatory privacy webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) + Billing (`prd.md`, `context/app-store-review-checklist.md`).

**Deferred:** editor bulk-delete range-select (Shift+click) + Delete/Backspace shortcut; per-product overflow materialization + a bulk apply-to-all styling route.

---

## Step 3 Follow-ups (tracked)

- **[Later, low priority] `insertActive` optimism at the cap.** `insertActive` sets `scrollTargetRef`/`activeRowId` before the reducer runs; at the cap the reducer no-ops, so they can point at a never-added row. Unreachable today (buttons disabled at cap); guard on `!atCap` if a future keyboard/programmatic add bypasses the disabled button.

---

## Open Questions

- **Collapsible section titles do not inherit the table's typography (found 2026-07-26 while
  specing feature 81; pre-existing since Step 9a).** `--appx-spec-font-size` / `-font-style` /
  `-line-height` are declared on `.appx-spec-table__table` (`spec-table.css:141–143`), and the
  collapsible shape is `<details><summary>…</summary><table>…</table></details>` — the summary
  is a **sibling** of the table, not a descendant. So Text size = Large grows flat section
  titles and leaves collapsible ones untouched. Closing it means adding the three vars to the
  summary rule, which repaints every live collapsible table with a non-null `fontSize` — a
  no-repaint-law decision of its own, not a rider on 81. (Feature 81 is unaffected either way:
  `headerFontSizePx` is absolute px on the summary's own rule, which is precisely *why* it is
  px and not an em-scale keyword — an em multiplier would resolve against two different bases
  depending on the shape.)
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
