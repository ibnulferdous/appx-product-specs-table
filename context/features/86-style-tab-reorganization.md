# Feature 86 — Style tab reorganization

**Status:** 🛠️ in progress. Step 1 (feature doc + drop-guard) landed
2026-07-26; steps 2–6 outstanding.
**Depends on:** nothing new. Every knob it moves already ships.
**Migration:** none, and that is the defining property of this feature — see
"What this feature is not" below.

---

## The ask

The merchant reported the Style rail as "unorganized" and hard to reason about,
and sent two Shopify theme-editor screenshots as design inspiration (a section
block's settings, and a text block's settings). Both show the same pattern: a
long single-column rail broken into **headed groups separated by dividers**,
where each group collects everything about **one thing** — never a global
"Colors" panel.

## Root cause — the rail is cut on two axes at once

The rail ships 34 controls over 33 `StylingValues` fields (the extra control is
the Custom-size px box, which is a second shape of `fontSize`). They sit in
seven groups, and those groups are not carved the same way:

| group | axis |
| --- | --- |
| Layout · Size & frame · Sections · Rows | **object** — the thing being styled |
| Colors · Typography | **property** — the kind of CSS declaration |

Mixing the two axes is the whole defect, and it produces the specific
symptoms the merchant felt:

- `headerBgColor` ("Section header background") sits ~20 controls away from
  `sectionHeaderStyle`, the control that turns the band on.
- `stripeBgColor` sits in Colors while `rowDividerStyle: STRIPES` — the switch
  that makes it paint at all — sits in Rows.
- `fontWeight` and `labelCase` sit in Typography, but there is **no** Labels
  group; a merchant styling the label column has to visit three groups.
- `outerBorderColor` sits in Colors while `outerBorderWidthPx` — without which
  it paints nothing — sits in Size & frame.

Two secondary problems, both cheap to fix and both contributing to the
"wall of controls" feel:

- **No visual hierarchy.** The rail is one `<s-stack gap="base">`, so the space
  *between groups* is identical to the space *between controls*. The headings
  are present but do not read as separators.
- **Help text under every field.** All 34 carry a `details` line; a good number
  of them only restate the label (`Italic` → "Slanted text.").

## The fix — one axis, the object axis

Eight groups, ordered outermost-to-innermost, each ending with its own colors:

| # | group | n | controls |
| --- | --- | --- | --- |
| 1 | Table layout | 4 | Row layout · Minimum column width *(Grid)* · On mobile *(2-col)* · Label column width *(2-col)* |
| 2 | Table size & frame | 5 | Maximum width · Alignment *(when capped)* · Outline width · Outline color · Corner radius |
| 3 | Table text | 4 | Text size · Custom size *(when Custom)* · Text style · Line height |
| 4 | Section headers | 7 | Header style · Title size · Title weight · Title case · Title spacing · [Header background \| Title color] |
| 5 | Collapsible sections | 3 | Enable collapsing · Sections start *(when on)* · Gap between sections *(when on)* |
| 6 | Rows | 5 | Row dividers · Column divider · Density · [Divider color \| Stripe background] |
| 7 | Labels | 4 | Weight · Case · [Background \| Text color] |
| 8 | Values | 2 | [Background \| Text color] |

`Colors` and `Typography` cease to exist; their nine and six controls
redistribute. **Every group ends with its colors in a 2-up row**, which makes
"structure knobs, then colors" one learnable rule across the whole rail rather
than eight local layout decisions.

## The six merchant decisions (2026-07-26)

**1. Table layout leads, not Size & frame.** The merchant's first draft opened
with the frame group. Row layout is the higher-leverage knob — it reshapes the
table and it gates whether four other controls exist at all (`mobileLayout`,
`labelWidthPct`, `gridMinColumnWidthPx`, and the Stripes option) — so the rail
opens on the decision everything else hangs off. The frame group is entirely
off-by-default and would have been a quiet opening.

**2. Sections splits in two.** A single Sections group came out at 10 controls,
nearly a third of the rail. Split into **Section headers** (7, appearance) and
**Collapsible sections** (3, behavior). Cost of the split, accepted knowingly:
with collapsing off, group 5 renders as a heading + divider + one switch. It is
re-merged in one step if that reads as overhead (judged in Step 5).

**3. Divider color stays visible always.** The merchant's draft proposed hiding
it unless `rowDividerStyle === LINES`. 🚫 Rejected as a functional regression:
`borderColor` also dresses the **column divider** (feature 79 reads
`--appx-spec-border-color` by construction), the **section separator hairline**
(feature 80), and the **table outline** whenever `outerBorderColor` is unset
(feature 78's fallback chain). A merchant on `NONE` rows + `LINE` column + a
2px outline would lose the only control that colors two live surfaces.

**4. Stripe background stays visible too.** Same shape of question, same
answer, and it matches the existing written decision for `headerBgColor`
("only visible while Banded, but that is a composition fact rather than a
reason to hide"). The caveat lives in help text, where it already does.

**5. Short labels inside groups.** `Weight`, `Case`, `Title size`, `Text size`
— the theme editor's own idiom, and what makes 300px readable: "Section title
weight" wraps to two lines in the rail, "Title weight" does not.

**6. Lands before B2.** The preset gallery (feature 57 steps 13–14) should ship
onto an organized rail, not the reverse. Worth stating the division of labour:
this feature makes 34 knobs **navigable**; presets are what make them
**skippable**. It does not remove the need for B2.

## Three structural calls, not preferences

**`labelCase` goes to Labels, not Table text.** The merchant's draft listed
"case" under table text. Verified against the real stylesheet:

| var | selector | scope |
| --- | --- | --- |
| `--appx-spec-font-size` / `-font-style` / `-line-height` | `.appx-spec-table__table` | table-wide |
| `--appx-spec-font-weight` / `-label-transform` | `.appx-spec-table__label` | **label only** |

Filing case under "Table text" would be a claim a merchant can falsify in one
click — they would set Uppercase and watch only the left column change. Weight
was already correctly filed under Labels in the merchant's draft; case follows
it for the same reason.

**Short labels are safe only because the group wiring stays.** Every group
keeps its `role="group"` + `aria-labelledby` heading. `stylingControls.ts`
carries a written lock against renaming "Label weight" *because the control
names its own scope*; under a Labels heading the scope is still stated, both
visually and programmatically — by a different mechanism. That comment must be
updated in Step 6 or the next reader reads a broken invariant.

**The empty-swatch note becomes per-control state text.** The Colors group
carries one note — *"Leave a swatch empty to inherit that color from your
theme"* — associated to the group with `aria-describedby`. Scattering the nine
swatches across five groups leaves that sentence with no home, and repeating it
five times is exactly the help-text noise this feature exists to cut. Instead
each swatch reports **its own state**, the idiom six number fields in this rail
already use: empty → "From your theme.", set → the surface it paints. That is
strictly better than the group note — it is programmatically associated for a
screen-reader user landing directly in Labels, and for a sighted user it says
what the field is doing now rather than stating a general rule.

## Help text — the rule

Currently 34 `details` lines. Keep one only when it does one of three jobs:

1. **Reports a state the control cannot show.** Every number field's
   empty/`0`/null case — "Full width. Enter a number to cap it.", "Square
   corners. Set 1 or more to round them." — and, newly, every empty swatch.
   These are the load-bearing ones; keep all of them.
2. **Carries a composition caveat** — "needs Row dividers set to Stripes",
   "two-column layouts only", "needs an Outline width". These get *better*
   after the move, because the control each one names is now in the same group.
3. **Describes a shopper-facing behavior change** — Enable collapsing, Row
   layout.

Everything else goes: Text style, Line height, Density, Alignment, Sections
start, and the per-option glosses on the weight and case selects — but the four
nullable selects **keep their `Inherit` gloss**, since inherit is the one option
whose meaning is not self-evident. Roughly 34 lines → 20, all of them working.

## What this feature is not

No `TableStyling` column is added, renamed, or dropped. No schema, no
migration, no `spec-table.css`, no `spec_table.liquid`, no TOML, no
`tableStylingCss.ts`, no metaobject shape change. **Zero storefront diff** —
a merchant's live table renders byte-identically before and after.

Every rename in this feature is a **merchant-facing label**. `borderColor`
stays `borderColor` in the model and on the wire; only its label changes from
"Border" to "Divider color".

Out of scope, deliberately: no new knobs (Values has no weight or case because
no CSS var exists for them — noted as an asymmetry, not a gap being filled), no
new hide predicates (the count stays **7**), and no collapsible groups. Polaris
web components ship no accordion, so collapsing would mean a hand-rolled
`<details>` and its own a11y pass; the rail already scrolls internally
(feature 71), and presets are the real answer to rail length.

## Step 1 — the drop guard (2026-07-26)

Nothing in the repo stopped a Style-tab edit from silently dropping a control.
The knob would vanish from the rail while its column, its CSS var, its
serialization and its storefront rule all stayed live — so the field would keep
round-tripping, keep rendering whatever was last saved, and simply become
unreachable. No test failed, no type broke, and the only detection was noticing
an absence by eye.

That is an acceptable risk for a feature that adds one control. It is not
acceptable for one that relocates all 34, so the guard is built **first** and
against the pre-move rail, which is what makes it meaningful: it passed on the
current file before a single control moved, and it was confirmed to fail when a
control was temporarily removed.

`styleTabContract.test.ts` pins one invariant:

> Every member of `STYLING_FIELD_NAMES` is reachable from a control in the
> rail, and no field is reachable from two.

Reachable means one of exactly two routes, because the rail has exactly two:

| route | fields | how the test sees it |
| --- | --- | --- |
| a literal `setStylingField("field", …)` call | the 24 non-colors | text scan of `StyleTab.tsx` |
| a `COLOR_KNOBS` entry the rail maps over | the 9 colors | `setStylingField(knob.field, …)`, a **variable** — invisible to a text scan |

The color route is why this is a two-branch test rather than a one-line grep.
`COLOR_KNOBS` membership only proves a swatch *could* render, so a separate
assertion pins that `StyleTab.tsx` actually references `COLOR_KNOBS` — without
it the second branch would be satisfied by a list nothing reads.

Reads the real file off disk, the same technique as
`specTableCssContract.test.ts` and `specTableAriaContract.test.ts`: a rail is
JSX and jsdom cannot render Polaris web components, so text is the only handle
on it. Comments are stripped first for the same reason the ARIA contract strips
them — this file's subject matter *is* `setStylingField` calls, and a guard
that counts its own documentation passes vacuously.

**Not asserted, deliberately: that every scanned field name is a real field.**
`setStylingField` is generic over `keyof StylingValues`
(`useRowEngine.ts:223`), so a typo is already a compile error. A runtime check
would be a second, weaker copy of what the type system does exactly.

⚠️ **The guard proves reachability, not correctness.** It cannot see that a
control landed in the wrong group, that a label is wrong, or that two controls
render on top of each other. Steps 4–5 are live verification for a reason.

## Step 2 — the copy and data pass (2026-07-26)

Copy only. No control moved, no group changed, no value changed — the rail still
renders today's seven groups, with new words in them. Tests 986 → 1004.

### Short labels, and where the scope went

Eleven control labels shortened: `Font size` → `Text size`, `Label weight` →
`Weight`, `Label case` → `Case`, `Section title size/weight/case` → `Title …`,
`Section headers` → `Header style`, `Section header padding` → `Title spacing`,
`When the page loads` → `Sections start`, `Collapsible sections` → `Enable
collapsing`, `Label width` → `Label column width`. Two swatches renamed for the
same reason (`Table outline` → `Outline color`, `Border` → `Divider color`) and
four shortened to bare `Background` / `Text color`.

⚠️ **`stylingControls.ts` carried a written lock against exactly this rename**
("the control says 'Label weight' so the UI itself states the scope"). The lock
is not broken, it is satisfied by a different mechanism — the `Labels` group
heading, wired to the control with `role="group"` + `aria-labelledby`, so the
scope is announced and not merely seen. The comment now says so, and says the
part that has NOT changed: a table-wide "Font weight" would still require moving
`--appx-spec-font-weight` off `.appx-spec-table__label`, which repaints every
live table. **Dropping a group wrapper would silently break the lock**, which is
why `STYLE_GROUP_HEADINGS` states it too.

Measured rather than eyeballed, since 300px is the constraint: the longest
control label is **20 chars** ("Gap between sections", "Minimum column width")
against ~268px of usable width, and the longest swatch label in a 2-up cell is
**17** ("Header background", "Stripe background") against ~130px. Both are
improvements on what ships — the current Colors group carries "Section header
background" at **25 chars**, which already wraps. No help string exceeds the
71-char line ("Columns are at least this wide…") that ships today.

### `helpText` became optional, and help text became state-reporting

The rule lives on `StylingOption.helpText`. Ten controls lose their always-on
description; five (On mobile, Density, Alignment, Sections start, Custom size)
carry none at all now.

The interesting consequence was not planned and is worth stating: because the
survivors are mostly `Inherit` glosses and empty-state lines, **the rail's help
text now appears precisely in the states that need explaining and stays quiet
otherwise**. Pick `Bold` and the line disappears; pick `Inherit` and it says what
is inherited and from where. That matches what the six number fields already did
and makes one idiom out of what were two.

🚫 **Absent, never `""`.** A deleted gloss left as an empty string would paint a
blank subdued line and the control would keep the vertical space of a
description it does not have. `selectedHelpText` maps falsy to `undefined`, and
a test on every option list pins that no list contains `""`.

Two lists kept **every** gloss, on merit rather than exception: Row dividers
(`Lines` / `Stripes` / `None` name a mechanism, not an outcome) and Column
divider (whose `LINE` caveat is a shipped requirement pinned by its own test).
Font size kept its three, because `Small` states a size but not that it is
measured against the **theme** — the em-multiplier fact is the only thing
separating those options from `Custom`.

### The two header selects are now identical to their twins, deliberately

Feature 81 kept `HEADER_FONT_WEIGHT_LABELS` / `HEADER_CASE_LABELS` separate from
their Labels-group counterparts because the prose had to say "titles" rather
than "labels". That prose is now cut on both sides, so the `Record`s are
character-identical and the only remaining difference is the `Inherit` gloss
(`Keep the standard bold section title.` vs `Use your theme's weight.` — not a
wording preference; there is no theme value behind a section title's weight).

🚫 **They are still not merged.** The guard asserting the header lists never say
"label" can only fail while the lists are separable; share one record and that
test becomes structurally incapable of failing. A vacuous guard is worse than
four lines of duplication. A second test now pins that the two Inherit glosses
differ, so a future edit that makes them agree has to be deliberate.

### `COLOR_KNOBS` gains `group` and `emptyHelpText`

`STYLE_GROUP_HEADINGS` is the new single table of truth for the eight groups and
their headings; each swatch files itself under one. **The array order is
untouched** — `tableStyling.ts:271` documents the colour block as contiguous and
`stylingControls.test.ts` derives the expected order from it, so groups select by
**filtering**. Within-group render order is therefore inherited from the
canonical field order rather than chosen, which is harmless: every group's
swatches sit side by side in one 2-up row. A test now pins the ordering
invariant next to the code that depends on it, because sorting `COLOR_KNOBS` by
group would read as tidying and would break a test several files away.

⚠️ **The old group note was wrong about four of the nine swatches, and
per-swatch state text is what exposed it.** "Leave a swatch empty to inherit that
color from your theme" is true for five. Checked against the real stylesheet:

| swatch | empty falls back to | empty-state text |
| --- | --- | --- |
| Title color · Label/Value background · Label/Value text | `inherit` / `transparent` | "From your theme." |
| Header background | `rgba(0, 0, 0, 0.06)` — this app's literal | "The default grey band." |
| Stripe background | `rgba(0, 0, 0, 0.04)` | "The default grey shading." |
| Divider color | `rgba(0, 0, 0, 0.1)` | "The default hairline grey." |
| **Outline color** | **through `--appx-spec-border-color`** | **"Follows Divider color."** |

The last row is the one no group-level sentence could ever have said: its empty
state is "follows another control on this screen". A test pins which five
swatches are permitted to say "theme", so the claim cannot spread back.

### Label uniqueness weakened from global to per-group, on purpose

`Labels` and `Values` each contain a `Background` and a `Text color`. The
existing test asserted all nine swatch labels were distinct; it now asserts
distinctness **within** each group. That weakening is only legitimate because the
group heading is announced — the test comment says so, so the dependency is
recorded where someone would otherwise "fix" the duplicate labels.

### Verified — live on the dev store

Full gate green (typecheck · lint · format · test · build), 986 → 1004 tests,
then read top to bottom in the real rail on the DRAFT `Motorola Moto G45 5G`
template (0 assigned products; nothing saved, the SaveBar never appeared).

Confirmed on screen: every rename; `On mobile` / `Density` rendering with **no
help line and no leftover gap** (the `undefined` mapping works — a `""` would
have left a blank grey row); the five Typography controls each showing only
their `Inherit` gloss; and the empty-state swatch text, including the one that
motivated it — **`Outline color` reads "Follows Divider color."**

🔴 **One defect found live that the character count had passed.** `Header
background` (17 chars) **wrapped** to "Header / background" in the 2-up color
grid and pushed its swatch a line below its neighbour's, so the two fields in
the row no longer aligned. `Stripe background` is the *same 17 characters* and
fits — "Stripe" sets narrower than "Header" — so the cell is right at the
boundary and the real limit is nearer 15. Fixed by shortening to `Background`
(the `Section headers` heading makes it unambiguous, and it makes the swatch
pair read identically in all three groups that have one); re-verified live,
both labels single-line and the swatches aligned.

⚠️ Worth recording as a method note: the pre-flight estimate said 17 chars would
fit ~130px and it was wrong, because proportional glyph widths decide it, not
character count. Measuring labels analytically is a useful filter but not a
substitute for looking at the rail.

⚠️ **The rail is transiently WORSE in one spot until Step 4, and that is a
consequence of the step order rather than a defect.** Short labels landed before
the groups that justify them, so the still-undivided `Colors` group now shows
three swatches labelled `Background` and two labelled `Text color` in one run.
Nothing distinguishes them until they separate into Section headers / Labels /
Values. The per-group uniqueness test passes throughout, because it already
asserts the post-Step-4 grouping.
