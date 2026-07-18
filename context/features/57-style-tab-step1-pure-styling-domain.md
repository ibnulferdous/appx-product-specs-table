# Feature 57 · Step 1 — Style tab: pure styling domain module

## Goal in one sentence

A **pure, framework-free `app/utils/tableStyling.ts`** owning the styling vocabulary end to
end — the `StylingValues` type, per-knob allowed-value constants, `DEFAULT_STYLING_VALUES`,
`stylingEquals`, a **tolerant, never-throwing `parseStylingValues(unknown)`** used at every
trust boundary (Save payload, DB row, metaobject JSON), and the **overrides-only
`serializeStylingOverrides(values)`** that is the ONE wire shape everywhere — fully
unit-tested in Node and **wired to nothing**.

## Where this sits (feature 57 map)

Feature 57 is the **Style tab (Reshell Phase B)** — binding spec locked 2026-07-18 in
`admin-screen-plan.md` §Tab 2 + `data-model.md` §5/§10; build order in
`~/.claude/plans/style-tab-phase-b-implementation-plan.md`. The steps (B1 = 1–12,
B2 = 13–14, B3 outlined):

1. **Pure styling domain module ← THIS DOC**
2. Pure presentation mapping (`stylingToCssVars` / `stylingToModifierClasses`)
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

- **Everything downstream speaks this vocabulary.** The engine state (Step 5), the Save
  payload + server parse (Steps 4–5), the metaobject `styling` field (Step 7), the CSS-var /
  modifier-class mapping (Step 2), and the preset bundles (Step 13) all consume these types
  and constants. Locking the vocabulary first — as a pure module — means every later step is
  wiring, not design.
- **The trust-boundary behavior is the real product decision.** Stored styling can be
  malformed (old rows, hand-edited metaobjects, a future bad deploy). A tolerant parse that
  degrades any invalid field to its default — instead of throwing — means a broken styling
  blob can never take down a merchant's editor or storefront table (merchant data safety,
  priority #1; storefront correctness, priority #2). That behavior is exhaustively
  unit-testable only if it lives in a pure module.
- **Pure = Node-testable.** Same rationale as `rows.ts` / `renderSpecTableHtml`
  ([[testing-strategy]]): no DOM, no Prisma, no browser — the entire contract is covered in
  the fast vitest lane.

## Foundation carried

- **The wire vocabulary is already locked** in `data-model.md` §5 — the `TableStyling`
  column comments name the exact constants (`"TWO_COLUMN"`, `"STACKED"`, `"BANDED"`, …).
  This module turns those comments into code; field names in `StylingValues` **equal the DB
  column names** (one vocabulary: TS fields = DB columns = wire keys = metaobject JSON keys).
- **String knobs, not Prisma enums** (locked in the spec) — allowed values live here as
  shared `as const` arrays; the server re-validates through this same module (Step 4).
- Convention to mirror: `app/utils/rows.ts` — pure domain module + co-located
  `*.test.ts`, shared constants exported (the `MAX_TEMPLATE_ROWS` pattern).

## What changes (architecture)

**One new pure module + its test. No component, no CSS, no schema, no dependency, no
server / persistence / reducer change. Wired to nothing.**

### `app/utils/tableStyling.ts` (NEW, pure, client-safe)

**Constants (single source; types derived via `typeof X[number]`):**

| Constant | Values (first = default) |
| --- | --- |
| `ROW_LAYOUTS` | `"TWO_COLUMN"`, `"STACKED"` |
| `MOBILE_LAYOUTS` | `"STACKED"`, `"SAME_AS_DESKTOP"` |
| `SECTION_HEADER_STYLES` | `"BANDED"`, `"TEXT_ONLY"` |
| `SECTIONS_INITIAL_STATES` | `"ALL_OPEN"`, `"FIRST_OPEN"`, `"ALL_CLOSED"` |
| `ROW_DIVIDER_STYLES` | `"LINES"`, `"STRIPES"`, `"NONE"` |
| `DENSITIES` | `"DEFAULT"`, `"COMPACT"`, `"SPACIOUS"` |
| `STYLING_FONT_SIZES` | `"SMALL"`, `"MEDIUM"`, `"LARGE"` — theme-relative presets; a bounded px **number** is also a valid `fontSize` (null = inherit) |
| `FONT_SIZE_PX_MIN` / `_MAX` | `10` / `40` (Custom-px bounds; clamped like `labelWidthPct`) |
| `STYLING_FONT_WEIGHTS` | `"REGULAR"`, `"MEDIUM"`, `"BOLD"` (null = inherit) |
| `STYLING_FONT_STYLES` | `"NORMAL"`, `"ITALIC"` (null = inherit; kept per merchant decision 2026-07-18) |
| `LINE_HEIGHTS` | `"TIGHT"`, `"NORMAL"`, `"LOOSE"` (null = inherit) |
| `LABEL_CASES` | `"DEFAULT"`, `"UPPERCASE"` — label column only (null = default) |
| `LABEL_WIDTH_PCT_MIN` / `_MAX` | `20` / `80` |
| `STYLING_FIELD_NAMES` | the canonical field list (drives `stylingEquals` + serialization iteration; the future B3 `StylePreset` drift test anchors on it) |
| `DEFAULT_STYLING_VALUES` | frozen `StylingValues` of all defaults |

**`StylingValues` (the resolved working shape):** layout knobs are **non-null** with their
defaults resolved (`rowLayout: RowLayout`, …, `sectionsCollapsible: boolean`); colors,
typography (`fontSize`, `fontWeight`, `fontStyle`, `lineHeight`, `labelCase`), and
`labelWidthPct` are **nullable, null = inherit/theme** (null is semantic — it is the
"Theme" swatch state and the `Inherit` font segment). `fontSize` is a **union**:
`"SMALL" | "MEDIUM" | "LARGE" | number | null` — keywords are theme-relative presets
(mapped to an em-scale in Steps 2–3, so they scale with the merchant's theme), a number is
an absolute px override. This is the shape the engine, rail controls, and mapping
functions work with — controls always have a concrete value to select, while "unset"
stays representable where it means something.

**Functions:**

- `parseStylingValues(input: unknown): StylingValues` — tolerant, **never throws**:
  non-object/array input → all defaults; unknown keys ignored; per-field: a value outside
  the allowed list / wrong type → that field's default; `sectionsCollapsible` accepts
  literal `true` only; colors accept **strict hex only** (`#rgb` / `#rrggbb` / `#rrggbbaa`,
  case-insensitive) — anything else → `null`; `labelWidthPct` accepts finite **numbers**
  only: integers clamped into `[20, 80]`, non-integers/non-numbers → `null`; `fontSize`
  accepts a keyword from the list, a finite integer **number**, or an all-digit **string**
  (the DB column shape, e.g. `"18"` — normalized to the number) — px integers clamped into
  `[10, 40]`, anything else (`"16px"`, `16.5`, `true`) → `null`. Works
  unchanged on all three boundary shapes: the Save payload's overrides object, a Prisma
  `TableStyling` row (extra `id`/`templateId` keys ignored; column nulls → defaults), and
  the parsed metaobject JSON.
- `serializeStylingOverrides(values: StylingValues): Record<string, unknown>` — the ONE
  wire shape: a plain object containing **only non-default fields** (knobs only when ≠
  default, `sectionsCollapsible` only when `true`, nullables only when non-null); all
  defaults → `{}`. **Round-trip law:** `parseStylingValues(serializeStylingOverrides(v))`
  deep-equals `v` for every valid `v`.
- `stylingEquals(a, b): boolean` — field-by-field over `STYLING_FIELD_NAMES` (flat strict
  compare; drives the dirty snapshot in Step 5 and the "Customized" hint in Step 13).

### `app/utils/tableStyling.test.ts` (NEW, Node unit)

Full case coverage (see Testing).

## Locked decisions

- **One vocabulary end to end:** TS field names = DB column names = wire keys = metaobject
  JSON keys; knob string values = the `data-model.md` §5 comment constants. No renaming at
  any boundary, ever.
- **Resolved domain shape:** knobs non-null (defaults resolved at parse time); colors /
  typography / `labelWidthPct` nullable with null = inherit. The DB's "null knob = default"
  exists only at the persistence edge — Step 4 maps default → column null on write.
- **Colors are strict hex-only** (`#rgb`/`#rrggbb`/`#rrggbbaa`). These values are later
  emitted into inline `style` attributes on the live storefront (Step 7) — the whitelist
  is CSS-injection defense in depth, not just tidiness. The Step 10 picker emits hex.
- **`labelWidthPct`:** integer, clamped to `[20, 80]` (exported constants); any other
  input → null (stylesheet default ratio). Locks the slider range early.
- **`STYLING_FONT_STYLES` = `NORMAL` / `ITALIC`** — the spec left `fontStyle` values open;
  locked here, and the field is **kept** (merchant decision 2026-07-18). (Control ships
  Step 10; the label-only-vs-label+value weight question stays open until then and does
  not affect this module.)
- **Typography addendum (2026-07-18 — Horizon theme-editor pattern):** `fontSize` is
  keyword-or-px. Keywords stay **theme-relative** (mapped to an em-scale in Steps 2–3 so
  they survive a theme switch); a px integer is an **absolute** override clamped to
  `[10, 40]` — the floor is an accessibility guard, and the numeric validation is the same
  injection defense as hex-only colors (only a validated integer ever reaches an inline
  style). Wire shape: px is a JSON **number**; the DB column (`String?`) stores the digit
  string — Step 4 maps number → string on write, `parseStylingValues` accepts both. New
  bounded knobs `lineHeight` (`TIGHT`/`NORMAL`/`LOOSE` — density's vertical-rhythm
  partner) and `labelCase` (`DEFAULT`/`UPPERCASE`, label column only). **Deliberately not
  adopted** (option-overload guard): font-family picker, letter spacing, wrap control,
  per-side px padding.
- **Tolerant parse never throws** — invalid stored styling degrades per-field to defaults
  so a bad blob can never blank a merchant's editor or storefront table.
- **`serializeStylingOverrides` is overrides-only** (`{}` = all defaults) and is the exact
  content of: `payload.styling` (Step 5), the metaobject `styling` field (Step 7, replacing
  today's `"{}"` placeholder), and the Step 13 preset bundles. Absent key = default.
- **Pure + unwired.** Imported by nothing after this step; no behavior change anywhere.

## What this step does *not* own (boundary with later steps)

- **CSS vars + modifier classes** (`stylingToCssVars` / `stylingToModifierClasses`) →
  **Step 2**. Stylesheet rules → **Step 3**.
- **Prisma model, migration, and the resolved→nullable-column write mapping** → **Step 4**.
  (Step 4 must write **every** column from a parsed `StylingValues` — default → explicit
  null — so a field reset to default is cleared in the DB; the overrides object is a wire
  shape, never the upsert input.)
- **Engine state, SaveBar, rail UI** → **Step 5+**; **metaobject write + Liquid** →
  **Step 7**; **preset bundles** → **Step 13**.

## Testing (unit — Node, pure; full case coverage)

`tableStyling.test.ts`:

1. **Defaults** — `DEFAULT_STYLING_VALUES` has resolved knobs (`TWO_COLUMN`, `STACKED`
   mobile, `BANDED`, `false`, `ALL_OPEN`, `LINES`, `DEFAULT`) and null colors/typography/
   width; `serializeStylingOverrides(DEFAULT_STYLING_VALUES)` → `{}`.
2. **Parse tolerance (shape)** — `undefined`, `null`, `42`, `"x"`, `[]` → all defaults;
   unknown keys ignored.
3. **Per-knob matrix** — every member of every allowed-value array parses through
   unchanged; an out-of-list string and a wrong-typed value each → that field's default,
   other fields unaffected.
4. **`sectionsCollapsible`** — `true` kept; `"true"`, `1`, `null` → `false`.
5. **Colors** — `#abc`, `#AABBCC`, `#aabbccdd` accepted; `"red"`, `"#ab"`, `"#zzz"`,
   `"url(x)"`, `"#fff;background:url(x)"` → `null` (injection strings rejected).
6. **`labelWidthPct`** — `33` kept; boundaries `20`/`80` kept; `19` → `20`, `100` → `80`
   (clamp); `33.5`, `"33"`, `NaN`, `Infinity` → `null`.
7. **`fontSize` union** — each keyword kept; `16` (number) kept; `"18"` (DB digit-string
   shape) → `18`; boundaries `10`/`40` kept; `9` → `10`, `100` → `40` (clamp); `16.5`,
   `"16px"`, `"small"` (wrong case), `true` → `null`.
8. **Serialize** — a single non-default knob emits exactly one key; `sectionsCollapsible`
   emitted only when `true`; nullables emitted only when non-null; a px `fontSize` emits
   as a JSON **number**; a fully-overridden object emits every field.
9. **Round-trip law** — `parse(serialize(v))` deep-equals `v` for: defaults, a
   single-override value, a **px-`fontSize`** value, and a fully-overridden value.
10. **`stylingEquals`** — identical → true; flipping each field in turn (loop over
    `STYLING_FIELD_NAMES`) → false; `parse({})` equals `DEFAULT_STYLING_VALUES`.
11. **Prisma-row shape** — an object with `id`/`templateId` extras and explicit column
    nulls parses to the right resolved values (including `fontSize: "18"` → `18`).

Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
npm run build` all green. **No browser step** (pure).

## File placement (per `code-standards.md`)

- New pure module → **`app/utils/tableStyling.ts`** (shared client-safe domain, beside
  `rows.ts` — consumed later by route engine, server, sync, and preview).
- New unit test → **`app/utils/tableStyling.test.ts`** (co-located, `rows.test.ts` pattern).
- **Unchanged:** everything else — `rows.ts`, `useRowEngine.ts`, `route.tsx`,
  `template.server.ts`, `metaobjects.server.ts`, `prisma/schema.prisma`,
  `previewStyles.ts`, `SpecTableEditor.*`, `package.json`, and the entire `extensions/`
  theme app extension.

## Done when

1. `tableStyling.ts` exports the constants table above, `StylingValues`,
   `DEFAULT_STYLING_VALUES`, `parseStylingValues`, `serializeStylingOverrides`, and
   `stylingEquals`, exactly per the locked decisions.
2. `tableStyling.test.ts` covers all cases above and is green.
3. The module is imported by **nothing** (no UI/server/storefront change anywhere).
4. Full gate passes (typecheck, lint, format, test, build); no browser step needed.
5. `progress-tracker.md` updated — feature 57 Step 1 complete; point at **Step 2 (pure
   presentation mapping — `stylingToCssVars` / `stylingToModifierClasses`)**.
