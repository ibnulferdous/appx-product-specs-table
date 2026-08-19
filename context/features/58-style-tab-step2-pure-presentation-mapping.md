# Feature 57 · Step 2 — Style tab: pure presentation mapping

## Goal in one sentence

A **pure, framework-free `app/utils/tableStylingCss.ts`** that turns a parsed `StylingValues`
into the two things a stylesheet can consume — **`stylingToCssVars(values)`** (the nullable
color/typography/width knobs as CSS custom properties, absent when inherit) and
**`stylingToModifierClasses(values)`** (the non-null layout knobs as BEM modifier classes) —
plus the shared em-scale/weight constants both the storefront and the admin will read, fully
unit-tested in Node and **wired to nothing**.

## Where this sits (feature 57 map)

Feature 57 is the **Style tab (Reshell Phase B)** — binding spec locked 2026-07-18 in
`admin-screen-plan.md` §Tab 2 + `data-model.md` §5/§10; build order in
`~/.claude/plans/style-tab-phase-b-implementation-plan.md`. The steps (B1 = 1–12,
B2 = 13–14, B3 outlined):

1. Pure styling domain module — **COMPLETE** (`57-…`, 2026-07-18)
2. **Pure presentation mapping ← THIS DOC**
3. Storefront stylesheet rules (dormant) + the mobile-stacked default
4. `add-table-styling` migration + server persistence
5. Engine styling state + first control (Dividers) + Save round-trip
6. Live styling in the device previews
7. Metaobject serialization + Liquid emission (pipe complete)
8. Remaining non-structural knobs
9. Collapsible sections (one-table-per-section `<details>` markup)
10. Colors + Typography groups
11. Live styling on the editing grid (visual knobs)
12. Reset + a11y + docs + B1 sign-off
13. Built-in preset constants + in-rail preset cards
14. Creation gallery popup

## Why this is its own step

- **It is the single translation layer between the domain and every renderer.** The storefront
  Liquid block (Step 7), the preview iframe (Step 6), and the live editing grid (Step 11) each
  need the *same* CSS vars and the *same* class list from the *same* values. Written once as a
  pure function, three renderers cannot drift; written inline in each, they will.
- **The var-vs-class split is the real design decision.** Which knobs become custom properties
  and which become modifier classes determines what Step 3's stylesheet can express and how a
  merchant's theme interacts with it. Locking it before a single CSS rule exists means Step 3 is
  writing rules against a fixed contract, not inventing one.
- **Pure = Node-testable.** Same rationale as `rows.ts` / `tableStyling.ts` /
  `renderSpecTableHtml` ([[testing-strategy]]): no DOM, no Prisma, no browser. Exhaustive
  per-knob mapping tables are only cheap to cover in the fast vitest lane.

## Foundation carried

- **Step 1 locked the vocabulary.** This module consumes `StylingValues` and its derived unions
  from `app/utils/tableStyling.ts` and adds no new knob, no new allowed value, and no new
  default. If a mapping needs a value that does not exist, that is a Step 1 change first.
- **Values arriving here are already validated** — hex-only colors, clamped integer
  `labelWidthPct`, clamped integer or keyword `fontSize`. See "Security posture" below for what
  that does and does not license.
- Convention to mirror: `previewDeviceWidth(view)` (feature 49 Step 5) — a total pure mapping
  written as a `switch` with an exhaustive `never` default, so adding a union member is a
  **compile error**, not a silent fallthrough.
- Naming/placement convention: `app/utils/tableStyling.ts` + co-located `*.test.ts`.

## What changes (architecture)

**One new pure module + its test. No component, no CSS file, no Liquid, no schema, no
dependency, no server / persistence / reducer change. Wired to nothing.**

### `app/utils/tableStylingCss.ts` (NEW, pure, client-safe)

#### The locked split

> **Nullable fields → CSS custom properties. Non-null knobs → modifier classes.**

This falls straight out of Step 1's domain shape and is the module's organizing rule:

- A **nullable** field (colors, typography, `labelWidthPct`) has `null = inherit`. "Inherit"
  in CSS is expressed by **not setting the property at all** and letting the stylesheet's
  `var(--x, <fallback>)` fallback win. A var is therefore exactly right: present = override,
  absent = theme.
- A **non-null knob** (`rowLayout`, `mobileLayout`, `sectionHeaderStyle`, `rowDividerStyle`,
  `density`, `sectionsCollapsible`) always has a concrete value and selects between *structural
  rule sets* (a grid vs. a stacked block; stripes vs. hairlines), which a single value
  substitution cannot express. A class is therefore exactly right.

#### `stylingToCssVars(values: StylingValues): Record<string, string>`

Emits a key **only** when the source field is non-null. All-inherit values → `{}`.

| Field | Custom property | Emitted value |
| --- | --- | --- |
| `headerBgColor` | `--appx-spec-header-bg` | the hex string verbatim |
| `labelBgColor` | `--appx-spec-label-bg` | the hex string verbatim |
| `valueBgColor` | `--appx-spec-value-bg` | the hex string verbatim |
| `stripeBgColor` | `--appx-spec-stripe-bg` | the hex string verbatim |
| `borderColor` | `--appx-spec-border-color` | the hex string verbatim |
| `labelTextColor` | `--appx-spec-label-color` | the hex string verbatim |
| `valueTextColor` | `--appx-spec-value-color` | the hex string verbatim |
| `fontSize` (keyword) | `--appx-spec-font-size` | `FONT_SIZE_EM_SCALE[kw]` → `"0.875em"` / `"1em"` / `"1.125em"` |
| `fontSize` (number) | `--appx-spec-font-size` | `` `${n}px` `` — an absolute override |
| `fontWeight` | `--appx-spec-font-weight` | `"400"` / `"500"` / `"700"` |
| `fontStyle` | `--appx-spec-font-style` | `"normal"` / `"italic"` |
| `lineHeight` | `--appx-spec-line-height` | `"1.25"` / `"1.5"` / `"1.8"` (unitless — multiplies the resolved font size) |
| `labelCase` | `--appx-spec-label-transform` | `"none"` / `"uppercase"` |
| `labelWidthPct` | `--appx-spec-label-width` | `` `${n}%` `` |

- **Keywords stay theme-relative** (`em`, per the Step 1 lock): S/M/L multiply the merchant's
  theme base font, so they survive a theme switch. Only the Custom-px escape hatch is absolute.
- **`lineHeight` is unitless on purpose** — a unitless line-height inherits as a *ratio*, so
  child elements recompute against their own font size instead of a frozen px value.
- The numeric scales live as exported frozen constants (`FONT_SIZE_EM_SCALE`,
  `FONT_WEIGHT_SCALE`, `LINE_HEIGHT_SCALE`, `LABEL_CASE_TRANSFORMS`), not inline literals, so
  Step 3's stylesheet fallbacks and the Step 10 control previews read the same numbers.
- Property names are exported as a frozen `SPEC_TABLE_CSS_VARS` map keyed by field name, so
  Step 3 / 6 / 7 reference `SPEC_TABLE_CSS_VARS.borderColor` rather than retyping the string.

#### `stylingToModifierClasses(values: StylingValues): string[]`

| Knob | Classes |
| --- | --- |
| `rowLayout` | `appx-spec-table--layout-two-column` \| `--layout-stacked` |
| `mobileLayout` | `appx-spec-table--mobile-stacked` \| `--mobile-same-as-desktop` |
| `sectionHeaderStyle` | `appx-spec-table--section-banded` \| `--section-text-only` |
| `rowDividerStyle` | `appx-spec-table--dividers-lines` \| `--dividers-stripes` \| `--dividers-none` |
| `density` | `appx-spec-table--density-default` \| `--density-compact` \| `--density-spacious` |
| `sectionsCollapsible` | `appx-spec-table--collapsible` — **only when `true`** |

- **Every knob emits its class, including at its default** (locked). The alternative —
  omitting defaults — makes "default" mean "whatever the unmodified base rule happens to do",
  which drifts the moment a base rule changes for an unrelated reason. Emitting always keeps
  every knob's rules at **equal specificity** in Step 3's stylesheet (no `!important`, no
  ordering fights) and makes the class list a **total function** of the value, so a test can
  assert an exact array. `sectionsCollapsible` is the one boolean and follows the CSS idiom of
  a presence flag.
- **Deterministic order** — knob order follows `STYLING_FIELD_NAMES`. Both outputs must be
  stable across calls: Step 6 recomputes the preview `srcDoc` on every render, and an unstable
  class order would churn the iframe document (and make byte-comparison tests impossible).
- **`sectionsInitialState` produces NO class** — it decides the `open` attribute on each
  `<details>` element in the Step 9 markup. It is a *markup* decision, not a style rule, and
  putting it here would imply CSS can express it.

#### `formatCssVarDeclarations(vars: Record<string, string>): string`

A five-line join (`--k: v;` per entry, stable order, `""` for `{}`). A small, deliberate
extension of the parent doc's two-function sketch, included here because **both** downstream
renderers need the identical string form — the Step 6 preview injects it into a `<style>` block
and the Step 7 Liquid emits it into the wrapper's `style` attribute — and duplicating the join
in two places is exactly the drift this step exists to prevent. It formats only; it does not
validate (see below).

### Security posture (explicit, because this feeds inline styles)

Every value emitted here reaches a **live storefront**, mostly via an inline `style` attribute
(Step 7). The posture is:

- **`parseStylingValues` is the only trust boundary.** Colors are hex-whitelisted, `fontSize`
  and `labelWidthPct` are clamped integers, keywords are list-membership checked. Nothing
  reaches this module unvalidated.
- **This module therefore does not re-escape — and its signature enforces that.** It accepts
  `StylingValues`, never `unknown`. A caller holding raw input must parse first; there is no
  overload that lets it skip.
- **Totality is the guard against a future knob.** Every mapping is a `switch` with an
  exhaustive `never` default, so adding a member to any allowed-value array fails the build
  until it is mapped here. No silent `undefined` can ever be interpolated into a declaration.
- Numeric interpolation (`${n}px`, `${n}%`) is safe **only** because Step 1 clamped to an
  integer; a test asserts the emitted strings match `/^\d+(px|%)$/` so a future loosening of
  the parse cannot quietly become a CSS-injection vector here.

### `app/utils/tableStylingCss.test.ts` (NEW, Node unit)

Full case coverage (see Testing).

## Locked decisions

- **Nullable → var, non-null knob → class.** The module's organizing rule; restated above with
  rationale. A knob that needs both (none today) is a Step 1 shape question first.
- **Absent var = inherit.** `stylingToCssVars` never emits an empty string, `"inherit"`, or
  `"initial"` for a null field — it omits the key. Step 3's stylesheet supplies the fallback in
  `var(--x, <fallback>)`, which is what makes the merchant's theme the true default and keeps
  the app's zero-config promise (PRD) intact.
- **Every knob emits a class, defaults included** (equal specificity, total function).
- **Keywords are `em`, Custom px is `px`** — carries the Step 1 typography lock into CSS.
  `lineHeight` is unitless.
- **`sectionsInitialState` maps to nothing here** — it is markup (`<details open>`), Step 9.
- **Var names are `--appx-spec-*`** — the existing `--appx-*` prefix convention
  (`code-standards.md` → Color & Theming; the editor's captured `--appx-token-color`), scoped
  with `spec` so a merchant theme cannot collide.
- **Classes are BEM modifiers on the existing `appx-spec-table` block** — same wrapper the
  storefront already renders, so Step 3 adds rules without touching markup.
- **Pure + unwired.** Imported by nothing after this step; no behavior change anywhere.

## What this step does *not* own (boundary with later steps)

- **Any actual CSS rule** consuming these vars/classes, and the mobile-stacked `@media`
  default → **Step 3**. This step decides the *names*; Step 3 decides what they *do*.
- **Applying the output to a wrapper element** — preview iframe → **Step 6**, storefront Liquid
  → **Step 7**, live editing grid → **Step 11**.
- **Prisma model, migration, persistence** → **Step 4**; **engine state / rail UI** → **Step 5+**;
  **`<details>` markup + `sectionsInitialState`** → **Step 9**; **preset bundles** → **Step 13**.
- **`spec-table.css` is not edited in this step.** Note for Step 3: the file currently hardcodes
  the values these knobs will own — `width: 33%` and `font-weight: 600` on `__label`,
  `padding: 0.5rem 0.75rem` and a `rgba(0,0,0,0.1)` hairline on cells, `font-weight: 700` +
  a `currentColor` bottom border on `__section`. Step 3 replaces each with the corresponding
  `var(--appx-spec-*, <current value>)` so **today's rendering is the exact fallback** and the
  dormant stylesheet is a no-op until a merchant sets a knob. The preview's byte-equality drift
  guard (feature 49 Step 4) will fail on that edit — updating the `previewStyles.ts` copy is
  part of Step 3, expected, not a regression.

## Testing (unit — Node, pure; full case coverage)

`tableStylingCss.test.ts`:

1. **All-defaults** — `stylingToCssVars(DEFAULT_STYLING_VALUES)` → `{}` (every nullable is
   null); `stylingToModifierClasses(DEFAULT_STYLING_VALUES)` → the exact default class array.
2. **Color matrix** — each of the seven color fields emits its own property with the hex
   verbatim; a null field emits **no key** (`expect(vars).not.toHaveProperty(...)` — not
   `toBeUndefined`, which an empty-string bug would also pass); setting one color leaves the
   other six absent.
3. **`fontSize` union** — each keyword maps to its em value from `FONT_SIZE_EM_SCALE`; a px
   number maps to `"18px"`; null emits no key; the emitted string matches `/^\d+px$|em$/`.
4. **Typography scales** — every `fontWeight` / `fontStyle` / `lineHeight` / `labelCase` member
   maps to its documented literal; each null emits no key; `lineHeight` is asserted **unitless**
   (no `px`/`em` suffix).
5. **`labelWidthPct`** — `35` → `"35%"`; null → no key; the emitted string matches `/^\d+%$/`.
6. **Class matrix** — every member of every knob's allowed-value array yields its documented
   class; a loop over each array asserts the class list length is constant (one class per knob)
   so no member silently maps to nothing.
7. **`sectionsCollapsible`** — `true` adds `--collapsible`; `false` omits it and changes nothing
   else in the array.
8. **`sectionsInitialState` maps to nothing** — all three members produce an **identical** class
   list and an identical var record (the explicit no-leak assertion).
9. **Determinism / stability** — both functions called twice on the same value produce
   deep-equal output in the **same order** (`Object.keys` order and array order asserted, not
   just set membership).
10. **Totality** — every member of every allowed-value array is exercised by (6); a value built
    from `FULLY_OVERRIDDEN` emits **all 14** var keys and the full class list, proving no field
    is unmapped.
11. **Injection shape guard** — for a fully-overridden value, every emitted var value matches
    the strict shape whitelist (hex / `\d+px` / `\d+%` / a known keyword literal); no emitted
    string contains `;`, `{`, `}`, `<`, `url(`, or a newline.
12. **`formatCssVarDeclarations`** — `{}` → `""`; one entry → `"--k: v;"`; multiple entries
    preserve input order; round-trips the Step 1 → Step 2 chain
    (`stylingToCssVars(parseStylingValues(overrides))`) into a stable string.

Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
npm run build` all green. **No browser step** (pure, renders nothing).

## File placement (per `code-standards.md`)

- New pure module → **`app/utils/tableStylingCss.ts`** (beside `tableStyling.ts`, which it is
  the presentation half of — consumed later by the preview, the storefront serializer, and the
  editing grid).
- New unit test → **`app/utils/tableStylingCss.test.ts`** (co-located, `rows.test.ts` /
  `tableStyling.test.ts` pattern).
- **Unchanged:** everything else — `tableStyling.ts` (consumed, not edited), `rows.ts`,
  `useRowEngine.ts`, `route.tsx`, `template.server.ts`, `metaobjects.server.ts`,
  `prisma/schema.prisma`, `previewStyles.ts`, `SpecTableEditor.*`, `package.json`, and the
  entire `extensions/` theme app extension (including `spec-table.css` — Step 3).

## Done when

1. `tableStylingCss.ts` exports `stylingToCssVars`, `stylingToModifierClasses`,
   `formatCssVarDeclarations`, `SPEC_TABLE_CSS_VARS`, and the four numeric/keyword scale
   constants, exactly per the locked decisions.
2. `tableStylingCss.test.ts` covers all cases above and is green.
3. The module is imported by **nothing** (no UI/server/storefront change anywhere); grep-verified.
4. Full gate passes (typecheck, lint, format, test, build); no browser step needed.
5. `progress-tracker.md` updated — feature 57 Step 2 complete; point at **Step 3 (storefront
   stylesheet rules, dormant + the mobile-stacked default)**, carrying the `spec-table.css`
   fallback note and the expected preview drift-guard update.
