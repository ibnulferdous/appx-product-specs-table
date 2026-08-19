# Feature 74 — Suppress content-free tables on the storefront (and the preview)

> **Status: ✅ SHIPPED & VERIFIED 2026-07-23.** Full gate (typecheck · lint · format ·
> test 862/36 · build) green; Shopify Theme Check clean (13 pre-existing warnings, none
> new — baseline compared). Verified live on the dev store end to end, including the
> storefront (see "Verification" at the bottom).
> Sibling docs: [`35-storefront-value-part-resolution.md`](35-storefront-value-part-resolution.md)
> (the `hideWhenEmpty` whole-cell gate this extends),
> [`55-editor-device-previews-step7-a11y-readonly-empty-state.md`](55-editor-device-previews-step7-a11y-readonly-empty-state.md)
> (the preview empty state this finally makes reachable),
> [`65-style-tab-step9-collapsible-sections.md`](65-style-tab-step9-collapsible-sections.md)
> (the two markup shapes both gates must cover).

## The ask

Merchant report (2026-07-23): create a new template and open the **Style** or **Settings**
tab — the storefront preview shows a bare grey box instead of the "nothing to preview yet"
empty state.

Traced to source, the grey box is not a preview artifact. It is the starter scaffold
rendering **faithfully**:

| scaffold row | what happens today |
| --- | --- |
| 1 × `SECTION_HEADER`, `label: ""` | renders — section headers have **no** emptiness gate at all |
| 5 × `DATA`, `label: ""`, one empty `TEXT` part | all five skipped — `hideWhenEmpty` defaults to `true` ([`rows.ts:145`](../../app/utils/rows.ts)) |

So the document is one `<tr>` carrying an empty `<th class="appx-spec-table__section">`,
and the default `sectionHeaders: BANDED` paints it `rgba(0, 0, 0, 0.06)` with `0.75rem`
padding ([`spec-table.css:75`](../../extensions/product-specs-table/assets/spec-table.css)).
An empty grey band ≈ 28px tall. Exactly the reported box.

**The decision (merchant, 2026-07-23):** a table with no data renders **nothing** — on the
storefront first, and the preview inherits the fix because the two renderers are
hand-mirrored.

### Two defects, one root

1. **Storefront (the real bug).** Nothing in the pipeline suppresses a content-free table.
   `rowsSerialize.ts`, the metaobject sync, and `spec_table.liquid` all pass blank rows
   through untouched, and the Liquid's only emptiness gate is the shallow
   `rows != blank and rows.size > 0` (line 109) — which counts rows that will render
   nothing. A merchant who saves an untouched scaffold, activates it, and assigns it ships
   a naked grey band onto a live product page. The block's own header comment already
   promises the opposite: *"no rows renders NOTHING on the storefront (no diagnostic text,
   no empty box)"*. Today that promise is only true for a **zero-length** rows array.
2. **Preview (the symptom).** The empty state exists but its gate is a substring sniff —
   `fragment.includes("<tr")` ([`specTablePreviewHtml.ts:341`](../../app/routes/app.templates_.$id/specTablePreviewHtml.ts)).
   The blank section header *is* a `<tr>`, so the preview reads "this has content" and
   shows the band. Fixing the storefront makes the fragment empty and the existing empty
   state fires on its own.

## The rule

Two new gates. Both are **render-time only** — the stored rows JSON is untouched, so a
merchant's blank scaffold still survives a save/reload round-trip in the editor grid.

- **R1 — row level: a `SECTION_HEADER` with a blank label renders nothing.**
  There is no text to print; the element exists purely to carry a title. Tested with the
  label *trimmed* (`| strip` / `.trim()`), emitted *untrimmed*, exactly as `hideWhenEmpty`
  already splits its test input from its output.
- **R2 — table level: if no row survives its gate, emit no wrapper at all.**
  Not an empty `<div class="appx-spec-table">`, not an empty `<table>` — nothing. This is
  what makes the block's "silent by design" header comment true.

R1 is required for R2 to reach the reported case: without it the blank section header is
"content" and R2 never fires.

### Deliberately NOT in this unit — R3, the orphan titled section

A section header with a **real** label whose rows are all hidden (`Dimensions` with five
empty rows) still renders as a lone titled band. That is authored content — the merchant
typed the word — and suppressing it would contradict a locked Step 9a decision
(`spec_table.liquid:121`: *"A section whose rows are all hidden renders as an empty
collapsible — no new emptiness logic, which would change the OFF path too"*). It also
belongs to the Phase C "Display rules" question, not here. Logged as an open question in
`progress-tracker.md`; do not fold it into this unit.

Note the interaction: R2 measures *after* R1, so `[blank section]` → nothing, but
`[named section]` alone → the named band, and the table renders. That asymmetry is
intended, and it is precisely R3's territory.

## The design

### Storefront — `blocks/spec_table.liquid`

The wrapper `<div>` currently opens at line 110, **before** the row loop, so at that point
nothing knows whether any row will render. And emptiness is genuinely undecidable without
rendering: a `DATA` cell's content depends on live product data resolved by
`{% render "spec-table-value" %}`.

So: **capture the body, flag as you go, then decide.** One pass, no double-rendering of
value cells.

```liquid
{%- assign has_content = false -%}
{%- capture table_body -%}
  … the existing loop, unchanged except for the two gates below …
{%- endcapture -%}
{%- if has_content -%}
  <div class="appx-spec-table {{ styling_css.classes | escape }}"
       style="{{ styling_css.vars | escape }}" {{ block.shopify_attributes }}>{{ table_body }}</div>
{%- endif -%}
```

`assign` inside a `capture` writes to template scope and survives the block — `capture`
redirects *output*, not assignments. That is the load-bearing mechanic here, and it is
already relied on inside this file (`table_open` / `details_open` / `section_index` are all
assigned inside branches and read after). Still, verify it live before sign-off.

`{{ table_body }}` prints raw — Liquid does not auto-escape, and every author string inside
was already escaped at emission time. Same posture as `{{ cell }}` on line 199.

Three edits inside the captured loop:

- **R1, flat shape** (line 184–188): wrap the `<tr class="…__section-row">` emission in
  `{%- if row.label | strip != blank -%}`. A skipped blank header simply vanishes; its
  following rows continue in the same open `<table>`, which *is* what "no section header"
  means.
- **R1, collapsible shape** (line 165–183): a blank header still **closes** the previous
  `</tbody></table>` and `</details>`, then emits no disclosure and does not increment
  `section_index` (a skipped section is not a section, so `FIRST_OPEN` still means the
  first *real* one). The following rows then hit the existing lazy-open branch (line
  193–196) and land in a fresh bare unnamed table. Without the close, they would silently
  be filed under the *previous* section's heading — a worse bug than the one being fixed.
- **R2 flag**: `assign has_content = true` on exactly two emission paths — a section header
  that passes R1, and a data row that passes the `hideWhenEmpty` `unless`.

The eager `<table><tbody>` open on line 151 (flat shape) **stays** — the OFF path is
required to be byte-identical, and an unused `<table><tbody></tbody></table>` inside a
discarded capture costs nothing.

The `section_rows.size > 0` collapsible-degrade check (line 87) also **stays unchanged**.
It counts blank headers, so a template whose only section is blank keeps
`collapsible = true` — harmless: no `<details>` is emitted, every row falls into the
leading bare table, and the output equals the flat shape modulo an inert
`--collapsible` wrapper class the CSS tolerates by design. Filtering "not blank" out of a
`where`-produced array is awkward in Liquid and would buy nothing.

### Preview — `specTablePreviewHtml.ts`

The mirror moves in the **same commit**. Structure mirrors Liquid rather than taking the
shortcut TS could afford (in the admin a dynamic pill always counts as content, so
emptiness *is* statically decidable — but two renderers that disagree in shape drift).

- Both body builders return a flag instead of a bare string:
  ```ts
  type RenderedBody = { html: string; hasContent: boolean };
  ```
  `renderSingleTableBody` / `renderCollapsibleBody` set `hasContent` on the same two paths
  Liquid does.
- R1 lands in both builders: skip when `row.label.trim() === ""`, emit
  `escapeHtml(row.label)` untrimmed. In `renderCollapsibleBody` the blank header runs
  `closeTable(); closeDetails();` and returns *without* touching `sectionIndex`.
- `renderSpecTableHtml` returns `""` when `!hasContent`. Its JSDoc contract changes from
  *"empty array → `''`"* to *"no renderable content → `''`"*; the `rows.length === 0`
  early return becomes redundant but is kept as a cheap short-circuit.

### The preview empty-state gate — and a latent divergence it closes

With the fragment now empty, the existing gate already works. Tighten it anyway:

```ts
const body = fragment === "" ? PREVIEW_EMPTY_STATE_HTML : fragment;
```

`includes("<tr")` is not merely loose, it is **wrong today** in one case: a *collapsible*
template with a named-but-empty section renders
`<details><summary>Dimensions</summary><table><tbody></tbody></table></details>` — legitimate
output under the Step 9a decision, containing no `<tr>`. The preview currently replaces it
with the empty state while the storefront renders the disclosure. Moving the emptiness
decision upstream into `renderSpecTableHtml` (where both renderers agree) fixes that
divergence as a side effect. Call it out in the header comment so it is not "simplified"
back later.

### What does not change

No migration. No Prisma / row-JSON / metaobject-TOML change. No server change
(`rowsSerialize.ts`, `templateSync.server.ts`, `metaobjects.server.ts` untouched — blank
rows keep round-tripping so the editor grid still shows the merchant's scaffold). No CSS
change, so `specTableCssContract.test.ts`'s byte guard is unaffected. The tripwired
`SpecTableEditor.module.css` / `RowGrid.tsx` are not involved.

## Edge cases (decide here, not later)

| input | flat shape | collapsible shape |
| --- | --- | --- |
| pristine scaffold (blank section + 5 empty data rows) | nothing | nothing |
| zero rows | nothing (unchanged) | nothing (unchanged) |
| blank section + data rows with content | table, no header row | rows in a leading bare table |
| named section, all rows hidden | the named band (R3 territory — unchanged) | empty `<details>` (Step 9a — unchanged) |
| named section, then blank section, then rows | rows continue under the named header | blank header closes the group; rows open a fresh unnamed table |
| section whose label is only whitespace (`"  "`) | treated as blank (`strip`/`trim`) | same |
| all data rows have `hideWhenEmpty: false` and empty values | renders (label-only rows are content) | renders |

## Tests

**`specTablePreviewHtml.test.ts`** — new `describe("content-free tables (feature 74)")`:

1. `createInitialRows()` → `renderSpecTableHtml` returns `""`.
2. …and `renderSpecTablePreviewDocument` contains `appx-spec-table-preview-empty`.
3. Blank section header alone → `""`; whitespace-only label → `""`.
4. Blank section header + one content row → renders, and the output contains **no**
   `appx-spec-table__section` element.
5. Named section + zero surviving rows → still renders (R3 is out of scope — this test is
   the tripwire that stops R3 leaking in accidentally).
6. Collapsible: named-but-empty section → renders a `<details>`, and the preview document
   does **not** fall back to the empty state (the divergence closed above).
7. Collapsible: named section, then blank section, then rows → the blank section closes the
   first `<details>` and the rows land in a bare table, not under `Dimensions`.
8. Collapsible + `FIRST_OPEN`: a leading blank section does not consume the "first" slot —
   the first *named* section is the one that gets `open`.

**`specTableAriaContract.test.ts`** — its fixture is a named section + a real data row, so
it passes both new gates unchanged. No edit expected; confirm it still runs green rather
than assuming it.

**Liquid** has no test harness — its half of the mirror is verified live (below). Both files
carry hand-mirror warnings in their headers; extend those comments with the R1/R2 gates so
the next editor knows the pair must move together.

## Files touched

- `extensions/product-specs-table/blocks/spec_table.liquid` — capture + `has_content`,
  R1 in both shapes, header-comment reconciliation.
- `app/routes/app.templates_.$id/specTablePreviewHtml.ts` — `RenderedBody`, R1 in both
  builders, `renderSpecTableHtml` returns `""`, empty-state gate tightened.
- `app/routes/app.templates_.$id/specTablePreviewHtml.test.ts` — the 8 cases above.
- `context/data-model.md` — §7 "Section header row" (`label`: blank ⇒ the row does not
  render) and §8 (a template whose rows all resolve empty renders nothing, alongside the
  existing status/assignment gates).
- `context/progress-tracker.md` — completed entry + R3 logged under Open Questions.

## Done when

1. Full gate green (typecheck · lint · format · test · build).
2. Tripwired `SpecTableEditor.module.css` / `RowGrid.tsx` byte-clean.
3. **Preview:** a brand-new template on the Style tab shows the "No spec rows to preview
   yet…" empty state — no grey band. Typing a label into any data row makes the table
   appear; clearing it returns the empty state.
4. **Preview:** an existing populated template (e.g. DJI Mavic, 44 rows) renders
   byte-identically to before — this change must be invisible to every non-empty template.
5. **Storefront, the actual fix:** save the untouched scaffold, set it ACTIVE, assign it to
   a product, and confirm the product page renders **nothing** — no grey band, no empty
   `div.appx-spec-table` in the DOM. Then give one row a label + value and confirm the
   table appears. (Requires unlocking the dev storefront — see
   [[shopify-storefront-password-cookie]].)
6. **Storefront:** a template with a blank section header between two populated sections
   renders both sections correctly, with the blank one absent — checked in both
   `sectionsCollapsible` states.
7. `capture` + `assign` scope confirmed live (item 5 passing *is* that confirmation — if
   `has_content` did not survive the capture, nothing would ever render).
8. Live verification via Claude-in-Chrome on the `shopify app dev` preview
   ([[browser-verify-embedded-app]]); the preview iframe is sandboxed/opaque-origin, so
   verify visually, not by reading its DOM.

## Verification (2026-07-23)

### Two corrections to the plan above

1. **Liquid `if` conditions do not accept filters.** The plan's
   `{%- if row.label | strip != blank -%}` will not parse. The trimmed label has to
   land in an `assign` first — `{%- assign section_label = row.label | strip -%}` then
   `{%- if section_label != blank -%}`. Implemented that way.
2. **Done-when #3's second clause was wrong.** "Typing a label into any data row makes
   the table appear" — it does not, and should not. The scaffold's rows carry
   `hideWhenEmpty: true`, and that gate tests the **value cell**, never the label. A
   label alone leaves the row hidden. Confirmed live; the correct trigger is content in
   the value cell (or a real section title). Not a defect — feature 35 behavior, unchanged.

### How the storefront half was proven

Non-empty templates render byte-identically by design, which means a passing product page
could not by itself prove the new Liquid was even deployed (whitespace signature checked —
also identical). So a temporary `APPX74-PROBE` HTML comment was added after the capture,
read off live product pages, and then removed (`grep` confirmed clean; gate re-run green).
It answered the load-bearing question directly:

- `has_content=true body_len=2712` on a populated page ⇒ **`assign` inside `capture` does
  survive the block** on the real Shopify Liquid runtime (done-when #7), and edits *are*
  being pushed to the dev store.
- `empty_is_blank=ok spaces_is_blank=ok real_is_kept=ok` ⇒ the R1 predicate behaves:
  `""` and `"   "` both read blank after `| strip`, a real label does not.
- On the 44-row DJI Mavic template: `sections=[Aircraft|kept][Gimbal|kept]…` — **all 9
  authored sections kept**, 35 data rows + 9 sections = 44. R1 never eats a real section,
  in the collapsible shape.

### End-to-end, on a live product page

A scratch template (blank section header + one `Weight / 249 g` row) was set ACTIVE and
assigned to *DJI Flip Drone Fly More Combo*, then emptied:

| state | probe | rendered |
| --- | --- | --- |
| one content row | `has_content=true`, `sections=[\|skipped]` | the row, and **zero** `__section` bands — pre-74 this page would have shown the grey band (**R1**) |
| value cleared → content-free | `has_content=false body_len=90` | **nothing**: no wrapper, no `<table>`, no rows, 0 DOM nodes (**R2**) |

`body_len=90` is the flat shape's eagerly-opened empty `<table><tbody></tbody></table>`
sitting in the capture and being correctly discarded — the exact path the plan predicted.
Postgres showed the rows JSON fully preserved across that save, confirming render-time-only
suppression. Control throughout: the 8-row ACEFAST template kept rendering all 8 rows.
The scratch template and its assignment were deleted afterwards (store back to 6 templates,
no orphan assignment rows).

Also observed working as designed en route: the DRAFT→ACTIVE **block-on-conflict gate**
(feature 42) refused the first product because it overlapped the Unikyy template's scope.

### In the editor preview

Brand-new template → Style tab shows "No spec rows to preview yet…" instead of the grey
box (**the reported bug**). Typing a value makes the table appear with **no** phantom
section band above it. Both re-checked on the Settings tab.

### Not covered

No screen-reader pass (nothing about the ARIA chain changed; `specTableAriaContract.test.ts`
still green). The admin iframe rescaled unpredictably between screenshot and click
throughout — [[embedded-admin-iframe-automation]] — so UI steps were driven by direct
template-URL navigation, keyboard on `<select>`s (synthetic clicks cannot reach a native
select popup), and Neon SQL for state assertions.

## Open questions this raises

- **R3 — orphan titled sections.** Should a named section with no surviving rows render?
  Belongs with Phase C display rules and with the Step 9a empty-collapsible decision.
- **Should activation warn on a content-free template?** A merchant can still set an empty
  template ACTIVE and assign it; it now renders nothing, silently. A DRAFT→ACTIVE advisory
  ("this template has no content") would be friendlier, but the activation gate is today a
  hard *block* mechanism for conflicts, and adding a soft warning lane is its own unit.
- **Theme-editor selectability.** A block that emits nothing can be awkward to select in
  the theme editor. Already true for unassigned products, so not a regression — but worth
  confirming during item 5 that the merchant can still find the block.
