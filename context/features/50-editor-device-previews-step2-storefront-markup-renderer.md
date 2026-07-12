# Feature 49 · Step 2 — Device previews: pure storefront-markup renderer

## Goal in one sentence

A **pure, framework-free `renderSpecTableHtml(rows)`** that turns the editor's working
`EditorRow[]` into the **same HTML string the storefront emits** ([`spec_table.liquid`] +
[`spec-table-value.liquid`]) — section rows, label/value rows, escaped author text,
`LINE_BREAK → <br>`, and the whole-cell `hideWhenEmpty` gate — with the **one intentional
divergence** that dynamic parts (`SHOPIFY_FIELD` / `METAFIELD`) render as **inert labeled
pills** (no product context in the admin), **fully unit-tested in Node and wired to no UI**.

[`spec_table.liquid`]: ../../extensions/product-specs-table/blocks/spec_table.liquid
[`spec-table-value.liquid`]: ../../extensions/product-specs-table/snippets/spec-table-value.liquid

## Where this sits (feature 49 map)

Feature 49 makes the editor's **Desktop / Tablet / Mobile** toggle render read-only
storefront previews (Reshell **Phase D**). Locked design: a **sandboxed `<iframe>`** sized to
each device width, rendering **the storefront markup + the shared `spec-table.css`**; dynamic
fields shown as **labeled pills**; `TableStyling` + the mobile row-layout option deferred to
the Style tab. The 8 steps:

1. ✅ Toggle swaps the stage (plumbing only) — feature 49 (serial 49), shipped 2026-07-12.
2. **Pure storefront-markup renderer ← THIS DOC**
3. Render the markup in an iframe (no shared CSS yet) — introduces `SpecTablePreview.tsx`
4. Load the shared storefront stylesheet into the iframe
5. Device width sizing (`previewDeviceWidth(view)`)
6. Iframe auto-height
7. a11y + read-only hardening + empty state
8. Docs + full gate + live sign-off

## Why this is its own step

- **It's the fidelity contract, and it's pure.** "Match the storefront exactly" hinges on the
  preview emitting the **same markup** as the Liquid (Liquid and TS can't share code, so this
  is a hand-mirrored contract). Isolating it as a pure `string`-returning function means the
  whole contract is **exhaustively unit-testable in the Node vitest env** — no DOM, no iframe,
  no browser — which is where the real coverage for this feature lives ([[testing-strategy]]).
- **Nothing renders yet.** Step 2 adds the function + its tests only; Step 3 feeds its output
  into the iframe `srcDoc`. Keeping the renderer and the iframe in separate steps gives two
  clean verification boundaries: _"the right HTML string"_ (unit, here) then _"it paints like
  the storefront"_ (browser, Steps 3–4).

## Foundation carried — the exact contract to mirror

### Block markup ([`spec_table.liquid`])

- Wrapper (rendered when `rows.size > 0`): `<div class="appx-spec-table"> <table
  class="appx-spec-table__table"> <tbody> … </tbody></table></div>`. The storefront also emits
  `{{ block.shopify_attributes }}` on the div — **preview omits it** (storefront-only).
- **Section row:** `<tr class="appx-spec-table__section-row"><th class="appx-spec-table__section"
  colspan="2" scope="colgroup">{{ row.label | escape }}</th></tr>`.
- **Data row:** `<tr class="appx-spec-table__row"><th class="appx-spec-table__label"
  scope="row">{{ row.label | escape }}</th><td class="appx-spec-table__value">{{ cell }}</td></tr>`.
- **hideWhenEmpty (whole-cell rule):** the block captures the resolved cell, computes
  `cell_plain = cell | strip_html | strip`, and renders the row `unless row.hideWhenEmpty and
  cell_plain == blank`. `strip_html` drops the `<br>`s first, so a `LINE_BREAK`-only cell
  counts as empty. TEXT-only cells always evaluate their real text. (The 50-row `for`-chunking
  is a Liquid-iteration-cap workaround — **irrelevant in TS**.)

### Value cell ([`spec-table-value.liquid`])

Per `ValuePart`: `TEXT → {{ text | escape }}` (author whitespace like `"Up to "` **preserved**),
`LINE_BREAK → <br>`, `SHOPIFY_FIELD`/`METAFIELD → the resolved product value` (escaped). The
preview keeps TEXT/LINE_BREAK **identical** and diverges only on the two dynamic types.

### Reused pieces

- **Types** — `EditorRow` (`DataRow` carries `valueParts` + `hideWhenEmpty`; `SectionHeaderRow`)
  and `ValuePart` from `app/utils/rows.ts` (type-only import).
- **Pill labels** — the existing pure `tokenLabels(part)` from `app/utils/valueDom.ts` (`text:
  "Field · vendor"` / `"Metafield · battery_life"`, plus a `title`). Reusing it keeps the pill
  label **identical to the editor's** (single source of truth). `valueDom.ts` touches the DOM
  only inside functions — its top level imports just a type, so a **Node test can import
  `tokenLabels` cleanly** (confirm at build; if it ever regresses, inline the tiny label map).
- **Escaping** — the repo has **no** `escapeHtml` helper, so the renderer supplies a small pure
  one mirroring Liquid `| escape` (`& < > " '` → entities), applied to every label + TEXT + the
  merchant-derived parts of a pill label/title.

## What changes (architecture)

**One new pure module + its test. No component, no CSS, no iframe, no reducer / schema /
dependency / server / persistence change. Wired to nothing.**

### `app/routes/app.templates_.$id/specTablePreviewHtml.ts` (NEW, pure)

`export function renderSpecTableHtml(rows: EditorRow[]): string` — framework-free (imports only
the `rows` types + `tokenLabels`), returning an HTML string:

- Empty array → `""` (mirrors the storefront rendering nothing when there are no rows).
- Otherwise → the `<div class="appx-spec-table"><table class="appx-spec-table__table"><tbody>…`
  wrapper around the rows, **in array order**.
- **`SECTION_HEADER`** → the section `<tr>`/`<th colspan="2" scope="colgroup">` with the
  escaped label.
- **`DATA`** → build the value-cell HTML from `valueParts` (TEXT escaped, `LINE_BREAK` → `<br>`,
  dynamic → an **inert** `<span>` pill carrying `tokenLabels().text` + `title`, with a
  preview-scoped class for Step 4/7 to style); then apply the **whole-cell hideWhenEmpty gate**:
  skip the row when `row.hideWhenEmpty` **and** the cell's static visible text (TEXT + pill
  labels, `<br>` ignored) is all-whitespace. Because a pill label is never blank, **any cell
  containing a dynamic part always renders** — the documented divergence (the storefront tests
  the _resolved_ value; the preview can only test authored/label content).
- **No status (`ACTIVE`) gate** — this is a **design preview** of the working draft, so it
  always renders the rows regardless of template status (status gating is a storefront-runtime
  concern, not a preview concern).

### `app/routes/app.templates_.$id/specTablePreviewHtml.test.ts` (NEW, Node unit)

Full case coverage (see Testing).

## Storefront-mirroring contract (part → output)

| Row / part            | Storefront (Liquid)                                   | Preview renderer (Step 2)                                  |
| --------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| Wrapper               | `<div class="appx-spec-table">…` + `shopify_attributes`, when `rows>0` **and ACTIVE** | same `<div><table><tbody>`, when `rows.length>0`; **no ACTIVE gate**, no `shopify_attributes` |
| `SECTION_HEADER`      | section `<tr>`/`<th colspan=2 scope=colgroup>` escaped | **identical**                                              |
| `DATA` wrapper        | `<tr class="…__row">` + `<th …__label scope=row>` + `<td …__value>` | **identical**                                    |
| `TEXT`                | `{{ text \| escape }}`                                 | **identical** (escape; whitespace preserved)               |
| `LINE_BREAK`          | `<br>`                                                 | **identical**                                              |
| `SHOPIFY_FIELD`       | resolved product value (escaped)                      | **inert pill** `<span … title>Field · {field}</span>` ⟵ divergence |
| `METAFIELD`           | resolved value (escaped + `newline_to_br`)            | **inert pill** `<span … title>Metafield · {key}</span>` ⟵ divergence |
| `hideWhenEmpty`       | hide iff flag **and** `cell \| strip_html \| strip == blank` (resolved) | hide iff flag **and** static visible text (TEXT + pill labels; `<br>` ignored) is all-whitespace → dynamic cells always render |

## Locked decisions

- **Dynamic parts render as inert labeled pills**, not resolved values (no product context in
  the admin). The single intentional divergence from the live storefront; live resolution is
  out of feature 49 entirely.
- **hideWhenEmpty is evaluated on static/label content only** (whole-cell rule mirrored). A
  cell with any dynamic pill always renders, because its resolved emptiness is unknowable here.
- **No `ACTIVE` status gate** — the preview renders the working draft as-authored.
- **Author whitespace in TEXT is preserved**; only `| escape` is applied (no trim).
- **Same class names + structure as the storefront** so Step 4's shared `spec-table.css`
  styles the preview with zero drift. Pill **visual** styling is deferred (the storefront CSS
  has no pill; a preview-only rule lands in Step 4/7) — Step 2 fixes only the pill **markup**
  (class + label + title).
- **Escaping mirrors Liquid `| escape`** (`& < > " '`); a small pure helper, since the repo has
  none.
- **Pure + unwired.** No component, iframe, CSS, dependency, reducer, schema, server, or
  persistence change.

## What this step does *not* own (boundary with later steps)

- **Rendering the string** (iframe `srcDoc` + `SpecTablePreview.tsx`) → **Step 3**.
- **The shared `spec-table.css`** in the iframe + **pill visual styling** → **Step 4** (/ 7).
- **Device widths** → **Step 5**; **auto-height** → **Step 6**; **a11y + empty state** → **Step 7**.
- **Live dynamic-value resolution, `TableStyling`, the mobile row-layout option, and theme
  ambient styling** → out of feature 49.

## Testing (unit — Node, pure; full case coverage)

`specTablePreviewHtml.test.ts`:

1. **Empty** — `renderSpecTableHtml([])` → `""`.
2. **Wrapper** — a non-empty array is wrapped in `<div class="appx-spec-table"><table
   class="appx-spec-table__table"><tbody>…`.
3. **Section row** — correct `<tr>/<th colspan="2" scope="colgroup">`, label present.
4. **Data row** — `<th …__label scope="row">` + `<td …__value>`, plain TEXT value.
5. **LINE_BREAK** — emits `<br>` inside the value cell.
6. **SHOPIFY_FIELD pill** — inert `<span>` with `Field · vendor` + a `title`.
7. **METAFIELD pill** — inert `<span>` with `Metafield · {key}` + a `title`.
8. **Mixed value** — `TEXT + pill + TEXT` (e.g. `"Up to "` + metafield + `" hours"`) preserves
   order and whitespace.
9. **Escaping** — labels + TEXT containing `< > & " '` emit entities (`&lt;`, `&amp;`, …); no
   raw injection.
10. **hideWhenEmpty** — static-empty cell **+ flag** → row omitted; same cell **no flag** →
    rendered; **whitespace-only** TEXT + flag → omitted; **`LINE_BREAK`-only** + flag → omitted;
    cell **with a dynamic pill** + flag → **rendered** (pill counts as content).
11. **Order + mix** — several DATA + SECTION rows keep array order.

Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
npm run build` all green. **No browser step** (pure).

## File placement (per `code-standards.md`)

- New pure renderer → **`app/routes/app.templates_.$id/specTablePreviewHtml.ts`**
  (route-co-located with `deviceView.ts`; framework-free).
- New unit test → **`app/routes/app.templates_.$id/specTablePreviewHtml.test.ts`**.
- **Unchanged:** `EditorShell.tsx`, `SpecTableEditor.tsx`, `route.tsx`, `useRowEngine.ts`,
  every `app/utils/*`, `app/models/*`, `app/shopify/*`, `prisma/schema.prisma`, `package.json`,
  `SpecTableEditor.module.css`, and the `extensions/` theme app extension (the Liquid the
  renderer mirrors is **read**, never edited).

## Done when

1. `renderSpecTableHtml(rows)` exists as a pure function mirroring the storefront markup, with
   dynamic parts as inert labeled pills and the whole-cell hideWhenEmpty gate.
2. `specTablePreviewHtml.test.ts` covers all cases above and is green.
3. The function is imported by **nothing** yet (no UI change); `EditorShell` / `SpecTableEditor`
   from Step 1 are unchanged.
4. Full gate passes (typecheck, lint, format, test, build); no browser step needed.
5. `progress-tracker.md` updated — Step 2 complete; point at **Step 3 (render the markup in an
   iframe → `SpecTablePreview.tsx`)**.
