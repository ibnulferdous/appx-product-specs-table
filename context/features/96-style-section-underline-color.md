# Feature 96 — Underline color (Section headers)

**Status:** 🟢 **BUILT + LIVE-VERIFIED 6 of 8, 2026-07-28.** Rail → Postgres →
metaobject → **real storefront** all measured, including the zero-repaint claim
before the write and the row-rules-did-not-move claim after it. Two rail-side
checks remain owed (the hide transitions, and the collapsible `<summary>`
shape) — see "Live verification". Two
merchant decisions taken the same day are recorded below and are binding.
**Scope:** one new nullable colour column + one swatch + four CSS declarations.
**Migration: YES** — the first Style-tab unit to need one since feature 86, which
re-arms a trap features 87 / 94 / 95 all avoided.
**Depends on:** nothing unbuilt. Feature 87 (`TEXT_ONLY` relabelled `Underlined`,
`PLAIN` added) and feature 95 (`ColorKnob.visibleWhen`) are both shipped and
live-verified; this is the first NEW field to use `visibleWhen`.

---

## Build results (2026-07-28)

**Tests 1147 → 1158 (+11).** Gate green: typecheck · lint · format · 1158 tests ·
`npm run build`. Migration `20260728083021_add_header_underline_color_styling`
applied — one `ALTER TABLE … ADD COLUMN "headerUnderlineColor" TEXT`, no default,
no backfill. ⚠️ `prisma generate` threw the usual Windows `EPERM` on the rename;
the client regenerated anyway (verified — 34 hits for the field in the generated
`index.d.ts`), which is exactly the behaviour the
`prisma-migration-stale-dev-server` memory records.

**+11, not the ~25 this doc estimated, and the shortfall is the point.** Eight
existing guards failed on the first run and NONE of them was a surprise — they
were the eight this doc predicted. Six needed only a number or a name moved,
because they were already derived from the domain rather than hand-listed:

| Guard                          | Edit it needed                   |
| ------------------------------ | -------------------------------- |
| `stylePresets` colour probe    | `9` → `10` — nothing else        |
| `tableStylingCss` var totality | added the field to `colorFields` |
| preview-document var totality  | one fixture line                 |
| `COLOR_KNOBS` alpha list       | one name, in position 2          |
| "prose for BOTH states"        | the exception list (below)       |
| "promises a theme value"       | `?? ""` for the optional gloss   |
| `visibleWhen` wiring + the BAR | `2` → `3`, named                 |
| `VISIBILITY_PREDICATES`        | the 10th entry + its count       |

The `stylePresets` probe deserves its own line: its comment already said "a tenth
color added later is covered here with no edit", and that turned out to be true —
the "no preset bundle sets a colour" law picked the new field up untouched, so
the gallery's zero-colour promise held by construction rather than by anyone
remembering to re-check it.

**Five genuinely new tests**, all derived from the domain rather than hand-listed:
the underline var reaches `TEXT_ONLY` and no other member (× both markup shapes),
the two section-header gates are mutually exclusive across `SECTION_HEADER_STYLES`,
the swatch shows for exactly one member, the predicate ignores collapsing, and the
`emptyHelpText` omission is confined to one named field.

### ✅ Mutation-tested, three ways, all as predicted

| Mutation                                      | Result                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| flatten the chain (drop the inner `var(...)`) | **2 failures**, both the new CSS-contract tests, nothing else                     |
| unwire `visibleWhen` from the knob            | **2 failures** — the wiring guard and the BAR                                     |
| weaken the predicate to `!== "BANDED"`        | **2 failures**, both the `SECTION_HEADER_STYLES`-derived ones, no hand-listed one |

The first is the one that mattered: a flat
`var(--appx-spec-header-underline-color, currentColor)` typechecks, passes the
other 1156 tests, and silently restyles every existing underlined table to the
theme's text colour. Only the inner-fallback assertion catches it.

### 🔴 Two deviations from this spec, both narrowing

1. **Only `emptyHelpText` became optional — `helpText` did not.** The file table
   below said both. `helpText` is still required on all ten swatches, which is
   the smaller loosening and all decision (a) actually asked for: the underline
   swatch keeps `"The rule beneath a section title."` and drops only the empty
   state. Doc corrected in place.
2. **The `visibleWhen` bar was reworded, not just incremented.** It read "the
   field must feed exactly one live RULE"; it now reads "one SURFACE", because a
   section header has two markup shapes and both `headerBgColor` and
   `headerUnderlineColor` feed two live rules apiece. Counting rules would have
   disqualified both of the gates that exist. This was flagged as likely in the
   pre-build analysis and is now the wording in `ColorKnob.visibleWhen` and in
   the test name.

## Live verification — 🟢 6 of 8 (2026-07-28)

Run against the dev store with `shopify app dev` live. Checks 1–4 were made with
**nothing saved**; checks 5–7 were made after the **merchant** set the colour and
saved through the rail (see the note on browser automation — the write path could
not be driven from here).

⚠️ **`Motorola Moto G45 5G` is ACTIVE and still carries `#E47272`.** It was not
reverted: the merchant chose the value on their own live template, so backing it
out is their call, not a test cleanup.

✅ **1. The migration is live in Neon.** `headerUnderlineColor` queried directly
on `TableStyling`; NULL on all 13 templates, so no existing row was disturbed.

✅ **2. Cold load reads the stored value.** `Motorola Moto G45 5G`
(`cmrqf87vv000hvpjscdt8k01u`, ACTIVE, stored `sectionHeaderStyle = TEXT_ONLY`)
opens with **Header style = "Underlined"** — feature 87's relabel intact.

✅ **3. The swatch exists and the group geometry is as designed.** Section
headers renders **`Underline color` · `Title color`** side by side, with
**`Background` absent** — the feature-95 gate and the feature-96 gate visible in
one screenshot, and the predicted slot layout (slot 1 = the header style's own
surface, slot 2 = the constant) confirmed by eye on the real rail rather than
inferred from a test.

🔴 **4. ZERO REPAINT, measured at 1:1 on the REAL storefront** — not the editor
mirror. `appx-dev.myshopify.com/products/motorola-moto-g45-5g`, computed style on
`.appx-spec-table__section`:

| probe                                | value                                |
| ------------------------------------ | ------------------------------------ |
| `--appx-spec-header-underline-color` | **empty** (null field ⇒ not emitted) |
| `--appx-spec-border-color`           | **empty**                            |
| section `border-bottom`              | `1.81818px solid rgb(0, 0, 0)`       |
| section `color`                      | `rgb(0, 0, 0)`                       |
| row rule (`__label` `border-bottom`) | `0.909091px solid rgba(0,0,0,0.1)`   |

Both vars absent ⇒ the chain resolves all the way to `currentColor`, which equals
the section `color`. That is byte-for-byte the pre-feature-96 rendering, and the
row rules are untouched. **The claim this doc rests on is now measured, not
argued** — and it is the exact thing mutation 1 breaks.

✅ **The edited stylesheet is genuinely live**, which is what makes check 4 mean
anything: the CDN-served extension asset
(`.../dev-83fcc7ca-…/assets/spec-table.css`) is **36,440 bytes — identical to the
local file** — and contains **5 occurrences** of
`--appx-spec-header-underline-color` (4 declarations + 1 comment), so the nested
`var()` parses and ships.

### ✅ 5–7. THE WRITE PATH, closed 2026-07-28 (merchant drove the rail; I measured the result)

The merchant set `Underline color` on `Motorola Moto G45 5G` and saved. Every
downstream leg then measured clean, end to end.

🔴 **Postgres — one column, and only one.** `headerUnderlineColor = "#E47272"`.
`headerBgColor` / `headerTextColor` / `borderColor` / `outerBorderColor` /
`stripeBgColor` all still **NULL**, and the template's pre-existing values
(`sectionGapPx 30`, `tableMaxWidthPx 1000`, `tableAlign CENTER`,
`labelWidthPct 24`, `gridMinColumnWidthPx 320`) are byte-identical to their
pre-save values. The upsert wrote the new column and disturbed nothing.

🔴 **The metaobject carried it, and the storefront printed it.** The rendered
wrapper's inline style — which IS `styling_css.vars`, printed verbatim by Liquid
— reads:

```
--appx-spec-section-gap: 30px; --appx-spec-table-max-width: 1000px;
--appx-spec-grid-min-column: 320px; --appx-spec-header-underline-color: #E47272;
--appx-spec-label-width: 24%;
```

✅ **`classes` is UNCHANGED** — still the same nine, still `--section-text-only`,
**no new modifier class**. The Step 2 rule (nullable ⇒ custom property, never a
class) held for the tenth colour, measured rather than asserted.

🔴 **The paint, at 1:1 on the real storefront, and the row rules did NOT move —
which is the entire feature.**

| element                                     | computed                                |
| ------------------------------------------- | --------------------------------------- |
| all **5** section headers (`border-bottom`) | `1.81818px solid rgb(228, 114, 114)` ✅ |
| section `color` / `background`              | `rgb(0,0,0)` / transparent — untouched  |
| row rule, `__label` and `__value`           | `rgba(0, 0, 0, 0.1)` — **untouched**    |

`rgb(228,114,114)` is `#E47272` exactly. Before the save the same headers
measured `rgb(0,0,0)` via `currentColor`; the row rules measured
`rgba(0,0,0,0.1)` then and now. **A merchant can now colour the underline
without touching their row rules** — the thing that was impossible before this
feature, observed rather than argued. Visually confirmed too: salmon rules under
`Display` / `Processor` / `Camera` / `Others` with grey hairlines between every
data row.

✅ **Mobile needs no separate check, and that is now a measurement.** The served
stylesheet's `@media` block **never mentions
`--appx-spec-header-underline-color`**, so the underline is breakpoint-independent
by construction — unlike feature 87, which had to be walked at 390px.

✅ **Exactly four rules read the var** in the live CDN asset — base `__section`,
`--section-text-only __section`, collapsible base `__section-summary`, and
`--collapsible--section-text-only __section-summary` — matching the design's
four-declaration plan with no stragglers.

### ❌ STILL OWED — 2 of 8, both rail-side

1. **The hide transitions and preserve-on-hide.** Underlined → Banded → the
   swatch disappearing and `Background` taking its cell, Plain → both gone with
   `Title color` alone, and `#E47272` surviving the round trip. Unit-tested over
   `SECTION_HEADER_STYLES` and mutation-tested, but not seen.
2. **The collapsible `<summary>` shape.** `sectionsCollapsible` is `false` on the
   verified template, so the second of the two mirrored rules never fired. It is
   asserted in `specTableCssContract` for both shapes and the live CSS was
   confirmed to carry all four rules — but the summary was not observed painted.
   This is feature 87's composition hazard, and 87 DID observe it; 96 has not.

🔬 **Blocked on browser automation, not on the feature.** The embedded admin's
cross-origin iframe would not accept the interactions needed to reach the
swatches, which sit below the Style rail's visible clip:

- **wheel-scroll does not reach the rail** this session (the
  `embedded-admin-iframe-automation` memory already records this as
  session-dependent — feature 95's session had it working);
- **dragging the rail's scrollbar DOES scroll it**, but afterwards the iframe
  stops accepting clicks until a full page reload — a new failure mode, worth
  adding to that memory;
- **clicking a rail control does not take focus**, so `Tab` walks the admin
  chrome instead of the rail (the focus ring lands on the admin's account
  button), which defeats the click → `Escape` → arrow-keys recipe feature 95
  relied on;
- the app's iframe is **absent from the top frame's a11y tree**, so `find` /
  `scroll_to` cannot address the swatch either (already on file from step 91);
- loading the tunnel origin directly (`…trycloudflare.com/app/templates/<id>`)
  **bounces to `/auth/login`**, so the non-embedded route is not a way around it.

⚠️ **A DB write is NOT a substitute for the remaining legs.** The metaobject is
synced on SAVE, so setting the column in Postgres would prove the loader and the
rail but leave `styling_css.vars` stale — the storefront leg specifically
requires a merchant Save through the UI.

## The ask

> When section header's "Header style" is underline, can we add "Underline
> color"? Will it create any problem or edge cases?

Answer to the second half: one real problem, resolved by merchant decision (a)
below, and three edge cases, all recorded under "Edge cases".

## What paints the underline today

`Underlined` is the wire value `TEXT_ONLY` (feature 87 relabelled the option;
the stored string is unchanged). Its rule:

```css
.appx-spec-table--section-text-only .appx-spec-table__section {
  background: transparent;
  border-block-end: 2px solid var(--appx-spec-border-color, currentColor);
}
```

`spec-table.css:223`, mirrored onto the collapsible `<summary>` at
`spec-table.css:312`.

So the underline colour is **already merchant-controllable** — it is
`borderColor`, the **Divider color** swatch in the Rows group. What a merchant
cannot do today is make the underline differ from their row rules, column
divider and outline. That is the whole feature, and it is the same story
`outerBorderColor` already tells (feature 78).

## Vocabulary — one new `TableStyling` column

|                       |                                        |
| --------------------- | -------------------------------------- |
| Column                | `headerUnderlineColor String?`         |
| `StylingValues` field | `headerUnderlineColor: string \| null` |
| CSS var               | `--appx-spec-header-underline-color`   |
| Rail group            | `sectionHeaders`                       |
| Label                 | `Underline color`                      |
| `alpha`               | **true**                               |

**Named on the `header*` family, not `section*`.** `tableStylingCss.ts:57-65`
states the convention: a reader can tell which surface a var dresses from its
name alone, and `header` is already the established prefix for this element
(`--appx-spec-header-bg`, `-color`, `-font-size`, `-padding-block`).
`sectionUnderlineColor` would be the only member of a second family for one
field.

**`alpha: true`**, matching `borderColor` and `outerBorderColor` — it is a
surface line, not body text, and the 2026-07-19 alpha lock turns on that
distinction. ⚠️ `stylingControls.test.ts:491` hand-lists the alpha-on fields in
order, so this is a test edit, not an inferred property.

### Position in `STYLING_FIELD_NAMES` — between `headerBgColor` and `headerTextColor`

The colour block is contiguous and `stylingControls.test.ts:549` pins
`COLOR_KNOBS` order to `STYLING_FIELD_NAMES` order, so the position is a
merchant-facing layout decision, not a filing one. Insert it as the **second**
colour, giving the Section headers grid a stable geometry:

| Header style | slot 1            | slot 2        |
| ------------ | ----------------- | ------------- |
| Banded       | `Background`      | `Title color` |
| Underlined   | `Underline color` | `Title color` |
| Plain        | `Title color`     | —             |

`Background` and `Underline color` are mutually exclusive by construction (see
the predicate), so slot 1 always holds "this member's own surface" and slot 2
always holds the constant. Filing it after `headerTextColor` instead would work
and would make `Title color` jump cells between Banded and Underlined for no
reason.

⚠️ **This edits a comment that says "immediately after".** `tableStyling.ts:301`
tells `headerTextColor` to stay "immediately after its background partner". The
comment's _reason_ is the contiguous colour block and the derived-order test,
both of which survive an insert; the adjacency itself was never load-bearing.
Update the comment rather than working around it.

## 🔴 Merchant decision (a) 2026-07-28 — no empty-state help text

The problem this closes: the section rule's fallback chain ends in
**`currentColor`**, not in a literal.

```
--appx-spec-header-underline-color  →  --appx-spec-border-color  →  currentColor
```

`currentColor` on `.appx-spec-table__section` resolves to the section title's
own colour, i.e. `headerTextColor`, i.e. the theme. So with both swatches empty
the underline follows the **title colour**, not a grey hairline.
`outerBorderColor` got away with a one-line `"Follows Divider color."` because
its chain ends in `rgba(0, 0, 0, 0.1)`; this one has a two-level truth to state
in a string that must not wrap in a 2-up grid.

**Decision: don't state it. The swatch carries no `emptyHelpText` at all.**
`helpText` stays, short and true in the only state it renders in:

```ts
helpText: "The rule beneath a section title.";
```

### The contract this loosens, and the precedent for loosening it

`ColorKnob.emptyHelpText` is **required today**, and
`stylingControls.test.ts:512` asserts every swatch has non-empty `label`,
`helpText` AND `emptyHelpText`, with the reasoning written into the test: an
empty swatch is the default state of all nine, so a missing gloss leaves the
colour undescribed until a merchant touches it.

So this is not "omit a string" — it makes the field optional for all ten
swatches. The precedent is one interface over: **feature 86 made
`StylingOption.helpText` optional for exactly this reason**, cutting ten
always-on descriptions and leaving the rail's help text state-reporting
throughout. Do the same here, and change the test from "every swatch has both"
to **"every swatch except the named exception"** — a list, not a count, the same
shape `visibleWhen`'s own bar test already uses so a second omission cannot
quietly join.

### ✅ What decision (a) also kills

The pre-build analysis flagged that `Divider color`'s help text would need a
third clause under feature 86's "both ends name each other" rule. With the new
swatch carrying no empty-state prose there is no second end, so:

🚫 **`borderColor`'s help text is NOT touched.** It reads "Row and column rules,
and the outline unless Outline color is set." — it has never mentioned the
section underline, which it has dressed all along. That understatement is
pre-existing and this feature does not worsen it: the coupling behaves exactly
as it does today whenever `headerUnderlineColor` is null.

## 🔴 Merchant decision (b) 2026-07-28 — hidden unless Header style is Underlined

> Don't read it when Header style is Banded.

```ts
export function showsHeaderUnderlineColorControl(
  styling: StylingValues,
): boolean {
  return styling.sectionHeaderStyle === "TEXT_ONLY";
}
```

**A bare predicate, no second clause**, and the reason is the same one feature 95
part 2 established for `headerBgColor`: `BANDED` and `PLAIN` both hardcode
`border-block-end: none` at member specificity, so under either of them there is
no rule left to read the var. Not a knob whose effect is hard to see — a knob
with **no referent**, which is the bar `showsGridMinColumnWidthControl` set.

Unlike `showsStripeBackgroundControl` there is no orphan state to guard: no other
knob can suppress the underline rule from a stored-data combination the rail
would not otherwise show. (The one partial suppression is the outer-border case
under "Edge cases" — it drops one element's rule, not the whole surface, so it
is not a hide condition.)

**It inherits `headerBgColor`'s safety argument, mirrored and stronger.** That
one is safe to hide because `BANDED` is `SECTION_HEADER_STYLES[0]`, the default,
so "I wanted to set the colour before switching" needs an order of work nobody
arrives in. Here it is the reverse: `TEXT_ONLY` is **not** the default, so the
only way to reach this swatch at all is to have actively picked Underlined — the
merchant is already standing in the state the colour applies to.

Registered in `VISIBILITY_PREDICATES`, pure read, so preserve-on-hide is covered
by the shared law test automatically: a hex survives Underlined → Banded →
Underlined.

⚠️ **Predicate count 9 → 10; JSX guard count stays 7.** The third `visibleWhen`
entry, and the third gated swatch. The Section headers colour grid then holds
three swatches, **two of them conditional** — safe only because `Title color` is
unconditional, which is what keeps `colorGrid` from ever painting an empty
`<s-grid>` (the hazard feature 95 opened and pinned).

## The CSS — a nested fallback, and zero repaint

```css
border-block-end: 2px solid
  var(
    --appx-spec-header-underline-color,
    var(--appx-spec-border-color, currentColor)
  );
```

Null → the var is never emitted → every table alive today renders
byte-identically. That is the entire repaint story, and it is `outerBorderColor`'s
exact shape (`spec-table.css:72-76`).

**Change all four occurrences, not just the two live ones.** The declaration
appears at `spec-table.css:205` / `:225` / `:294` / `:315`. Feature 95 proved the
two BASE ones (`__section`, and `__section-summary` under `--collapsible`) are
**unreachable** — `stylingToModifierClasses` emits a section-header class
unconditionally and every member outspecifies the base. Mirroring the var into
them anyway costs nothing (dead rules stay dead) and means no reader has to
reconstruct the reachability argument to explain why two of four otherwise
identical declarations differ. The alternative — touch only `--section-text-only`
— is defensible and was considered; it trades a reader's confusion for a fact
already documented elsewhere.

✅ **The member contract test needs no change.**
`specTableCssContract.test.ts:371` asserts each member states BOTH its
`background` and its `border-block-end`; the new var goes _inside_ the existing
declaration, so the guard passes untouched.

⚠️ **`previewStyles.ts` is a byte-mirror and the drift test enforces it** — same
four edits at `previewStyles.ts:223` / `:243` / `:312` / `:333`.

## Where the pieces live

| File                                                 | Change                                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                               | `headerUnderlineColor String?` on `TableStyling` + migration                                                                                                     |
| `app/utils/tableStyling.ts`                          | `StylingValues` field, `STYLING_FIELD_NAMES` (2nd colour), `DEFAULT_STYLING_VALUES`, `parseColor` in `parseStylingValues`                                        |
| `app/models/template.server.ts`                      | the column type at `:71-79` and the upsert at `:143-151` — **two spots**                                                                                         |
| `app/utils/tableStylingCss.ts`                       | `SPEC_TABLE_CSS_VARS` entry                                                                                                                                      |
| `app/routes/app.templates_.$id/stylingControls.ts`   | `StylingColorFieldName`, `COLOR_KNOBS` entry, `showsHeaderUnderlineColorControl`, `ColorKnob.emptyHelpText` → optional (`helpText` stays required — deviation 1) |
| `extensions/.../spec-table.css` + `previewStyles.ts` | 4 declarations each, byte-mirrored                                                                                                                               |
| **Liquid / TOML / metaobject definition**            | **nothing**                                                                                                                                                      |

**The Liquid row is the point.** `styling_css.vars` is a formatted string built
from `stylingToCssVars` (`metaobjects.server.ts:175-183`), so a new var reaches
the storefront with no extension work at all. Seventh feature paid for by
"server precomputes styling; Liquid only prints".

### 🔴 The migration trap

Features 87 / 94 / 95 all shipped with **no migration**, so three consecutive
units did not touch this. After the migration runs, **Saves fail _silently_ until
`shopify app dev` is restarted** (`prisma-migration-stale-dev-server` memory) —
and an `EPERM` on `prisma generate` can still have rewritten the types, so a
green typecheck is not evidence the running server is current. Restart before the
first live save, and do not diagnose a failed save as a code bug until you have.

## Edge cases — recorded, none blocking

1. **⚠️ A pre-existing dead spot this makes visible.** With an Outline width set
   and the **final** section **closed**, `spec-table.css:131-134` deliberately
   sets that summary's `border-block-end: none` (the last visible rule would
   otherwise sit on the wrapper border and read as one thick line). So the last
   underline vanishes in that state. True today; a merchant painting a bright
   underline will simply notice it. **Accepted, not fixed** — the exception is
   right and the alternative is a double line.
2. **Underline width stays hardcoded at 2px.** `columnDividerStyle` faced the
   identical pressure and refused it in writing (`spec-table.css:500`: "do not
   quietly parameterise this"). Colour-without-width is coherent; a width knob is
   a new knob and a new decision. See "Deliberately not built".
3. **Two swatches can paint the same line in different states.** A merchant who
   sets `Divider color` sees the underline follow it — until they set
   `Underline color`, after which it does not. Identical to the coupling
   `outerBorderColor` already carries, and unchanged from today's behaviour
   whenever the new field is null.

### ✅ Checked and NOT problems

- **Row layout** — the stacked and grid refinements drop `__label`'s border only;
  `__section` keeps its rule in all three layouts.
- **Row dividers** — `LINES` / `STRIPES` / `NONE` all scope to `__label` /
  `__value` and never touch the section rule.
- **`borderColor`'s four surfaces are undiminished** (row rules · column divider ·
  f80 separator · outline fallback), so feature 86 decision 3 — `Divider color`
  stays ungated — is **not** reopened.
- **Presets** — `PRESET_SCOPED_FIELDS` is structure-only; colours are excluded, so
  the six gallery cards keep their "no colour column written by any card"
  property. Zero interaction. (Confirm no preset test enumerates colour fields.)
- **`stylingEquals`, dirty snapshot, SaveBar, Reset, the round-trip law** all
  iterate `STYLING_FIELD_NAMES` — free.
- **Shop isolation / App Store surface** — none. One column on a template-owned
  row, one rail control, no new external surface, no Admin API change.

## Tests — what each is for

- `VISIBILITY_PREDICATES` entry #10: preserve-on-hide inherited free (never
  writes; hex survives the hidden state; the hidden value asserted non-default so
  the check is not a tautology).
- `SECTION_HEADER_STYLES`-derived: **exactly one member shows the swatch, and it
  is `TEXT_ONLY`.** A fourth member added later defaults to hidden and has to come
  and say otherwise — the same shape as feature 95's header assertion, and the
  reason it is derived rather than hand-listed.
- The predicate ignores collapsing, asserted across every member × both markup
  shapes — feature 87's composition hazard inverted into a guarantee.
- 🚫 **The BAR, updated not just incremented**: exactly **three** knobs carry
  `visibleWhen`, named — `headerBgColor`, `headerUnderlineColor`,
  `stripeBgColor`. A list, so `borderColor` still cannot quietly join.
- The empty-grid backstop: Section headers keeps `Title color` unconditional, so
  no group can collapse to a bare heading. Now covering a group where **2 of 3**
  swatches are gated, which is the closest the rail has come to that hazard.
- The `emptyHelpText` exception list — one named knob may omit it; every other
  swatch must carry both strings.
- `COLOR_KNOBS` order still equals `STYLING_FIELD_NAMES` order, and the alpha-on
  list gains the field in position 2.
- CSS: the `--section-text-only` rules read the new var with `borderColor` as the
  inner fallback, in both shapes — mutation-check by dropping the inner `var(...)`
  and confirming a repaint test fails.
- A round trip on a frozen input: Underlined → Banded → Underlined returns the
  merchant's own hex.

**Mutation-test at minimum:** (1) drop the inner `var(--appx-spec-border-color,
…)` — an existing table's underline changes colour, which a repaint guard must
catch; (2) drop `visibleWhen` from the knob — exactly the guard written for it
should fail; (3) weaken the predicate to `!== "BANDED"` (letting Plain keep the
swatch) — the `SECTION_HEADER_STYLES`-derived assertion should fail, not a
hand-listed one.

## Done when

1. Rail: Header style = Underlined shows `Underline color` beside `Title color`;
   Banded and Plain both hide it; `Title color` never moves cells between Banded
   and Underlined.
2. A set colour paints the section underline in the Desktop preview and leaves
   the row rules, column divider and outline **unchanged** — the whole point,
   verified by contrast against `Divider color` set to something different.
3. The collapsible shape gets the same colour on its `<summary>` (feature 87's
   hazard — verify, do not assume).
4. Preserve-on-hide observed live, not only unit-tested: Underlined → Banded →
   Underlined returns the hex.
5. An untouched template is **byte-identical** on the storefront — the null case
   is the repaint claim and it needs measuring, not asserting.
6. Postgres shows `headerUnderlineColor` as the only column touched; the
   metaobject's `styling_css.vars` carries the new declaration and `classes` is
   unchanged.
7. The real storefront leg (feature 94 left this owed; do not let it slide twice).
8. Gate green: typecheck · lint · format · tests · `npm run build`.

## Deliberately not built

- 🚫 **An underline width knob.** Edge case 2. If the 2px ever needs to move, that
  is its own feature and its own decision.
- 🚫 **Reading the colour under Banded or Plain.** Merchant decision (b). Both
  members hardcode the rule away; a visible swatch there paints nothing.
- 🚫 **Touching `borderColor`'s help text.** Decision (a) removed the reason.
- 🚫 **Contrast checking** — the standing 2026-07-20 rule. Null colours inherit
  unknown theme values and alpha is on, so any signal would be a guess.

## Open questions

- None blocking. The two that were open at spec time — the empty-state wording and
  whether the swatch reads under Banded — were both answered by the merchant on
  2026-07-28 and are recorded above as decisions (a) and (b).
