# Feature 87 — Plain section header (Style tab)

**Status:** ✅ **COMPLETE 2026-07-27** — built, live-verified rail → Postgres →
metaobject, and all three remaining legs (rendered storefront, mobile, a
template stored as `TEXT_ONLY`) closed the same day — see "Verification".
**Depends on:** nothing new. Third member of a knob that has shipped since
feature 57 Step 8.
**Migration:** **none.** Existing `String?` column, third legal value.

---

## The ask

> "There is no 'plain' section header. `TEXT_ONLY` isn't text-only — it paints
> `border-block-end: 2px solid`. Both JBL and Samsung show a bare bold title
> with no rule under it."

Correct, and it was reproducible from the stylesheet alone. The two members
between them could not produce a bare title:

| member                     | band                       | rule under the title                        |
| -------------------------- | -------------------------- | ------------------------------------------- |
| `BANDED`                   | ✅ `--appx-spec-header-bg` | ❌ dropped (the band edge IS the separator) |
| `TEXT_ONLY`                | ❌ transparent             | ✅ **2px, kept**                            |
| **`PLAIN`** (this feature) | ❌                         | ❌                                          |

`TEXT_ONLY` drops only the _background_. Its name claimed both. That naming is
what made the gap hard to see from the rail: a merchant looking for "just the
title" picked the option that said so, got an underline, and had nowhere else to
go. So this feature is a member **and** a relabel.

Reported as item 1 of a five-item report; it blocks two of the five reference
tables. Items 2–5 are not scoped here.

## Vocabulary — 0 new columns

| field                | change                                  | delivery                |
| -------------------- | --------------------------------------- | ----------------------- |
| `sectionHeaderStyle` | `["BANDED", "TEXT_ONLY"]` → `+ "PLAIN"` | `--section-plain` class |

**Appended, never inserted.** `BANDED` stays `SECTION_HEADER_STYLES[0]`, so
`DEFAULT_STYLING_VALUES` is untouched and no stored row moves. Same law that
governed `GRID` joining `ROW_LAYOUTS` (feature 85).

### Why it is the cheapest unit the Style tab has had

`sectionHeaderStyle` is a **non-null keyword**, so the locked `tableStylingCss.ts`
rule (nullable → custom property, non-null keyword → modifier class) settles the
delivery before any design work happens. Consequences:

- **no schema change, no migration** — a third legal string in an existing column
- **no new field** in `STYLING_FIELD_NAMES`, so the feature-86 drop guard, the
  `COLOR_KNOBS` grids and the eight-group rail are all untouched
- **no hide predicate** — count stays **7**
- **no Liquid, no extension TOML, no markup** — sixth feature running that
  "server precomputes `styling_css`; Liquid only prints" has paid for
- **no `StyleTab.tsx` edit at all.** `SECTION_HEADER_OPTIONS` is a `.map` over
  the domain, so the third option appears in the select for free. That is the
  Step 8 option-list contract doing the job it was built for.
- **no repaint.** Nothing about `BANDED` or `TEXT_ONLY` changed on the wire.

Two sites make the work a **compile error until done** rather than something to
remember: `assertNever` in `sectionHeaderStyleClass`, and the
`Record<(typeof SECTION_HEADER_STYLES)[number], OptionCopy>` on
`SECTION_HEADER_LABELS`.

## The relabel — merchant decision 2026-07-27

| value (wire, **unchanged**) | label before | label now      | help text                               |
| --------------------------- | ------------ | -------------- | --------------------------------------- |
| `BANDED`                    | Banded       | Banded         | A shaded band behind the section title. |
| `TEXT_ONLY`                 | Text only    | **Underlined** | Bold title with a rule beneath it.      |
| `PLAIN`                     | —            | Plain          | Bold title, nothing else.               |

Every label now names the **look**, and **no label is reused across values.**
The rejected alternative was giving `PLAIN` the freed "Text only" string: it is
the strongest label for the new member, but it would point the same words at a
different value, so a merchant who remembers picking "Text only" would find
"Underlined" selected. Renaming a choice is honest; silently re-pointing its
name is not.

Leaving "Text only" where it was — the other alternative — would have shipped
two options that both read as "just the text" and left the misnomer that caused
the report, papered over with help text.

## The CSS — two rules, one per shape

Inserted directly after the `TEXT_ONLY` pair, at both sites:

```
.appx-spec-table--section-plain .appx-spec-table__section          { background: transparent; border-block-end: none; }
.appx-spec-table--collapsible.appx-spec-table--section-plain
  .appx-spec-table__section-summary                                { background: transparent; border-block-end: none; }
```

**Two rules, because the collapsible `<summary>` is a SIBLING** of the section
table rather than a cell inside it, so it carries its own copy of every header
declaration. A member styling only the flat shape would hand a merchant their
rule back the moment they enabled Collapsible — the composition hazard Step 9a
recorded, and the reason `BANDED` and `TEXT_ONLY` each have two rules too.

`none`, not a transparent or zero-width border: those still occupy the box and
would leave the title sitting on an invisible 2px gap.

⚠️ **No source-order hazard here, unlike feature 79.** The three members are
mutually exclusive classes at matching specificity (2 classes flat, 3 against the
2-class collapsible base), so they never contest a property with each other.
Nothing had to move.

`TEXT_ONLY`'s flat rule also gained a comment naming it as the underlined look —
its declarations were already identical to the base rule's, and stating that on
purpose is what keeps "one rule set per member" from decaying into "one member
means whatever the base rule happens to do".

## Tests — 1012 → 1021

`specTableCssContract.test.ts` gained one describe block (+9). The class-presence
loop already derived from `SECTION_HEADER_STYLES`, so `--section-plain` is
asserted present with no edit; the count moved **22 → 23**.

- **3 members × 2 shapes: each member states BOTH its `background` and its
  `border-block-end`.** This is the feature's real invariant, and the one that
  would have caught the original defect: a member declaring only one of the two
  silently inherits the other from the base rule, which is precisely how "text
  only" ended up underlined. Derived from the domain, so a fourth member added
  later must supply both or fail here.
- **2 shapes: PLAIN paints neither** (`background: transparent` +
  `border-block-end: none`), pinning the whole feature in two declarations.
- **1: the feature-80 separator stays scoped to BANDED alone** (below).

✅ **Mutation-tested, not assumed.** Dropping `border-block-end: none` from the
plain flat rule failed 2 tests naming PLAIN and the flat shape; dropping
`TEXT_ONLY`'s `border-block-end` failed the "owns BOTH" test for that member —
so the guard bites on an existing member, not only on the new one.

The selector lookups **anchor on the class and walk forward to the brace** rather
than matching a formatted selector verbatim: all three collapsible selectors wrap
across lines at prettier's 80 columns, and hardcoding the wrap would make
reformatting the stylesheet a test failure. Requiring `__section {` with the
space is what stops the flat lookup matching `__section-summary`.

`stylingControls.test.ts`'s `KEYWORD_KNOB_LISTS` passes **unchanged**, which is
the point: the option list is derived from the domain, not hand-typed.

## Two consequences, accepted in writing

- **Collapsible + Plain + all closed is a run of bare bold titles with no
  separator.** `BANDED` gets the feature-80 hairline, `TEXT_ONLY` gets its 2px
  rule, `PLAIN` by definition has neither. The separator is **deliberately not
  extended to PLAIN**: it exists because BANDED _drops_ an edge it would
  otherwise have, so two closed bands merge into one grey slab — a plain title
  has no fill to merge with, and the absent edge IS the member. A merchant who
  wants the sections held apart sets `sectionGapPx`, available whenever
  collapsing is on. Pinned by a test so a later change has to revisit the
  decision rather than drift into it.
- **`headerBgColor` does nothing under Plain** — the rule hardcodes
  `background: transparent`, exactly as `TEXT_ONLY` has always done. Pre-existing,
  not introduced here, and the swatch already self-reports it: its help text
  reads "The band behind a section title — needs Header style Banded."
  (the feature-86 per-swatch state idiom). Hiding it would mean an **8th** hide
  predicate and a feature-86 group change — **out of scope**, recorded as an open
  question in the tracker.

  > ✅ **CLOSED 2026-07-28 by feature 95 part 2** (doc `95-…`). The swatch now
  > hides unless Header style is Banded, and its help text dropped the caveat
  > along with it. ⚠️ The cost estimate above was **half wrong**: it was indeed a
  > new hide predicate, but **no group change at all** — a colour swatch's guard
  > rides `ColorKnob.visibleWhen` and is applied inside `colorGrid`, because the
  > nine swatches are generated by a filter rather than written as JSX. Worth
  > remembering when costing the next one: the rail's two kinds of control have
  > two different attachment points for the same law.

## Deliberately out of scope

- **Band radius / chevron position / open-close animation** — still 82 / 83 / 84,
  reserved by feature 81 with their own recorded reasons.
- **Items 2–5 of the same report.** Feature 86's lesson was that bundling
  unrelated system boundaries is what made the rail hard to reason about; each
  item gets scoped on its own.
- **A `sectionHeaderStyle`-gated hide rule for the two header swatches.** See
  above.

## Verification

✅ **Done 2026-07-27** on the DRAFT `Motorola Moto G45 5G` (0 assigned products),
with a `Phone Details` section header the merchant added for the purpose.

- **The rail, live.** All three options walked with the keyboard: `Banded` / **`Underlined`
  — "Bold title with a rule beneath it."** / **`Plain` — "Bold title, nothing else."**
- 🔴 **The reported defect reproduced on the way through.** Selecting `Underlined`
  paints a heavy 2px rule under the title with the band gone — the exact state a
  merchant reached by picking the option that said "Text only". Seeing it between
  Banded and Plain is what makes the third member's case concrete rather than argued.
- ✅ **Flat shape:** `Plain` renders `Phone Details` as a bare bold title — no band,
  no rule (zoomed to confirm, not eyeballed at rail scale).
- ✅ **Collapsible shape — the composition hazard, and the reason there are two
  rules.** Toggling Enable collapsing turns the title into a native disclosure
  (`▼ Phone Details`) and it stays bare. Had the second rule been missing, the
  summary would have taken the base rule's 2px border and handed the merchant an
  underline back the moment they enabled collapsing.
- ✅ **Postgres:** `sectionHeaderStyle = "PLAIN"`, and it is the ONLY styling column
  the save touched (`rowDividerStyle: "NONE"` was already stored).
- ✅ **Metaobject, measured on the wire** (`gid://…/201635332161`, Admin API 2025-10):
  `styling` is overrides-only — `{"sectionHeaderStyle":"PLAIN","rowDividerStyle":"NONE"}`;
  `styling_css.classes` carries `appx-spec-table--section-plain` **in
  `STYLING_FIELD_NAMES` order** (third, where `--section-banded` sat), class **count
  unchanged at 7**; and **`vars` is the empty string** — the no-custom-property claim
  measured rather than asserted, which is what proves the knob is a pure modifier
  class with no presence flag.
- Template left saved on **Plain**, collapsing discarded back to off, the merchant's
  section header intact (20 rows).

✅ **All three legs closed 2026-07-27**, on the real `appx-dev.myshopify.com` storefront
(not the editor mirror), using the already-ACTIVE `Unikyy Blade Pro Turbo Fan` template
(`cmrrx2ocj000ivpwk8qp2ehm9`, 4 real section headers, GRID layout) assigned to product
**Motorola Edge 60 Fusion 5G** (`motorola-edge-60-fusion-5g`):

1. **Rendered storefront on an ACTIVE template.** Set `Header style` → `Plain` on the
   live template via the rail and Saved (`sectionHeaderStyle` confirmed `"PLAIN"` in
   Postgres). Loaded the real product page: all four section headers (`General
Information`, `Power Supply`, `Physical Information`, `Warranty Information`) render
   as bare bold titles — no band, no rule — exactly the flat-shape rule from this doc,
   live on the storefront rather than only in the editor's mirrored preview.
2. **Mobile ≤749px.** Rather than the editor's Mobile preview (cross-origin, can't be
   measured — see `browser-verify-embedded-app` memory), resized the **real storefront
   tab** to 390px width — a plain public page, so `resize_window` reflows it correctly
   (unlike the admin iframe). All four PLAIN headers still render bare with no band or
   rule at mobile width, GRID collapsed to one column as expected.
3. **A template already STORED as `TEXT_ONLY`** — opened `AGX TF36 Handheld Turbo Fan`
   (`cmrqfhmz1000lvpjsltte4s77`, DRAFT, `sectionHeaderStyle` confirmed `"TEXT_ONLY"` in
   Postgres beforehand). On load, before touching anything, the rail's `Header style`
   read **"Underlined"** with help text "Bold title with a rule beneath it." — the
   relabel reads correctly from a cold load, not only after an in-session pick.

**Cleanup:** the Unikyy template was reverted — `Header style` set back to `Banded` and
Saved; Postgres confirms `sectionHeaderStyle` is `null` again with every other
`TableStyling` column (`rowDividerStyle`, `rowLayout`, `gridMinColumnWidthPx`,
`tableAlign`, `tableMaxWidthPx`, `sectionGapPx`, `headerPaddingBlockPx`) byte-identical
to before the test. No lasting change to the live storefront.

🚫 **The `.harness/` CSS matrix was NOT run** — the live pass was done directly
instead. Justified here because the feature is two declarations with no specificity
or source-order interaction to explore (contrast features 79/80/85, where the harness
found real plan errors first), but recorded as a deviation rather than glossed.

⚠️ The **stale-Prisma-client trap does not apply** — it needs a migration, and
there isn't one. The dev server does not need restarting before the first save.

## Invariants respected

- `SpecTableEditor.module.css` / `RowGrid.tsx` untouched (byte-clean against
  `a7b304c`).
- `previewStyles.ts` re-mirrored from `spec-table.css`; the byte-exact drift
  guard in `specTablePreviewHtml.test.ts` passes. ⚠️ No backticks in the new
  comments (the trap that fired on 81 and 85) — the regeneration script refuses
  to run when the CSS contains one, and it was used rather than hand-editing.
- The Edit grid still never reflects merchant styling.
