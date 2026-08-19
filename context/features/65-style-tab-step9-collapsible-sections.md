# Feature 57 · Step 9 — Style tab: collapsible sections (`<details>` markup)

## Goal in one sentence

Make `sectionsCollapsible` / `sectionsInitialState` real: when a merchant turns collapsible sections
on, each section renders as a `<details>/<summary>` wrapping **its own table**, on both the
storefront and the device previews — while a template with the knob **off** keeps today's markup
byte for byte.

## Where this sits (feature 57 map)

Feature 57 is the **Style tab (Reshell Phase B)** — binding spec locked 2026-07-18 in
`admin-screen-plan.md` §Tab 2 + `data-model.md` §5/§10. The steps (B1 = 1–12, B2 = 13–14,
B3 outlined):

1. Pure styling domain module — **COMPLETE** (`57-…`, 2026-07-18)
2. Pure presentation mapping — **COMPLETE** (`58-…`, 2026-07-18)
3. Storefront stylesheet rules (dormant) + mobile-stacked default — **COMPLETE** (`59-…`, 2026-07-18)
4. `add_table_styling` migration + server persistence — **COMPLETE** (`60-…`, 2026-07-18)
5. Engine styling state + Dividers control + Save round-trip — **COMPLETE** (`61-…`, 2026-07-19)
6. Live styling in the device previews — **COMPLETE** (`62-…`, 2026-07-19)
7. Metaobject serialization + Liquid emission (pipe complete) — **COMPLETE** (`63-…`, 2026-07-19)
8. Remaining non-structural knobs — **COMPLETE** (`64-…`, 2026-07-19)
9. **Collapsible sections ← THIS DOC** — ships as **9a** (markup + CSS, dormant) then **9b**
   (the two controls); split locked 2026-07-19, see §The split
10. Colors + Typography groups
11. Live styling on the editing grid (visual knobs)
12. Reset + a11y + docs + B1 sign-off
13. Built-in preset constants + in-rail preset cards
14. Creation gallery popup

## Why this is its own step

- **It is the only remaining B1 step that changes MARKUP.** Steps 1–8 moved a value through a
  pipeline that never altered the document's shape: knob → class on the wrapper → CSS. This one
  restructures the table itself, which is why Step 8 deliberately landed first ("Step 9 opens a
  stable file") and why Steps 10–12 are safe to sequence after it.
- **It re-opens two things earlier steps explicitly deferred to here**, both recorded in the source:
  the `--collapsible` placeholder comment in `spec-table.css:85` ("its `<details>` markup arrives in
  Step 9 … rules for markup that does not exist would be speculative drift"), and the striping
  comment at `spec-table.css:101` ("Step 9's one-table-per-section markup will re-open this — noted
  there, not solved here"). Both are now due.
- **It is the last chance to get the markup right before the visual knobs pile on.** Step 10 adds
  seven colors and five typography knobs whose selectors will target this structure. Landing the
  structure first means Step 10 styles a shape that is not about to move.

## Foundation carried

- **The domain already owns both knobs** (`app/utils/tableStyling.ts`, Step 1): `sectionsCollapsible`
  is the one **boolean** (default `false`), `sectionsInitialState` is a keyword
  (`ALL_OPEN` | `FIRST_OPEN` | `ALL_CLOSED`, default `ALL_OPEN`). Both parse, serialize, round-trip
  and persist today — Step 4 writes `sectionsCollapsible` verbatim and `sectionsInitialState` as an
  override-or-NULL column. **No domain, schema, migration or server change is needed.**
- **The mapping already draws the right line** (`app/utils/tableStylingCss.ts`, Step 2):
  `sectionsCollapsible` emits the presence flag `appx-spec-table--collapsible` **only when true**,
  and `sectionsInitialState` deliberately emits **nothing at all** — it is a markup decision
  (`<details open>`), not a CSS one, and there is a standing test asserting it leaks into neither
  output. Step 9 must honour that split rather than inventing a class for the initial state.
- **The raw `styling` field is ALREADY on the metaobject** (`metaobjects.server.ts:250`, Step 7) —
  the overrides-only wire shape, synced beside the precomputed `styling_css`. This is the fact that
  makes this step cheap: **Liquid can read the two markup knobs without any metaobject or
  `shopify.app.toml` change.** See "The Liquid question" below.
- **Both renderers are in lockstep and know it.** `specTablePreviewHtml.ts` carries the standing
  instruction to keep its markup identical to `spec_table.liquid`; Step 6 noted the preview LEADS the
  Liquid. Here they must move **together, in one step**, or preview and storefront drift on structure
  — a worse failure than drifting on a colour.

## The Liquid question (resolved — read before writing code)

Step 7's locked decision was "**the server precomputes; Liquid only prints**", because re-deriving a
20-knob CSS mapping in a language with no exhaustiveness checking would have been a fourth
hand-maintained copy. That decision stands, and **this step does not violate it**, for three reasons
worth stating explicitly so a future reader does not "fix" it:

1. **This is markup structure, not the CSS mapping.** The class list and the custom properties still
   come precomputed from `styling_css`. Nothing about that changes.
2. **It is two scalars, not a mapping.** `{% if styling.sectionsCollapsible %}` and one keyword
   compared three ways. There is no per-knob table to fall out of sync.
3. **The defaults are the absent case, so there is no defaulting logic to drift.** The wire shape is
   overrides-only: a default-styled template has **no** `sectionsCollapsible` key, which is `nil` in
   Liquid, which is falsy — the correct default (`false`) with zero code. Likewise
   `| default: "ALL_OPEN"` for the initial state.

**Locked: Liquid reads `spec.styling.value` for these two knobs.** No new metaobject field, no
`shopify.app.toml` edit, no sync change. If a later step ever needs *more* than a couple of markup
scalars, that is the point to revisit a precomputed `styling_markup` field — not now.

## What changes (architecture)

### 1 · The markup contract (the real work)

**Two shapes, switched by the flag.** This is the central locked decision:

- **`sectionsCollapsible: false` (the default) → today's markup, unchanged.** One `<div>`, one
  `<table>`, one `<tbody>`, section headers as `<tr><th colspan="2" scope="colgroup">`. **Byte for
  byte.** Every existing template must render exactly as it does the day before this step ships.
- **`sectionsCollapsible: true` → one `<details>` per section, each wrapping its own `<table>`.**

Sketch of the ON shape (final class names to be settled in code, but the structure is locked):

```html
<div class="appx-spec-table appx-spec-table--collapsible …">
  <!-- leading rows before the first section header, if any: a bare table, no <details> -->
  <details class="appx-spec-table__section-group" open>
    <summary class="appx-spec-table__section-summary">Aircraft</summary>
    <table class="appx-spec-table__table"><tbody>…that section's rows…</tbody></table>
  </details>
  <details class="appx-spec-table__section-group">…</details>
</div>
```

**Why the default stays byte-identical is not negotiable.** Step 7 shipped a default-look change
(the section band) that had to be reasoned about after the fact; the lesson taken from it is that
structural changes ride an explicit opt-in. Two code paths is the cost, and it is the right trade:
all risk is confined to a knob the merchant turned on deliberately.

### 2 · The four edge cases, decided up front

These are the shapes that will actually break this step if they are discovered during implementation
rather than before it:

- **Rows before the first section header.** A template may open with DATA rows. Locked: they render
  in a **leading bare `<table>` with no `<details>`** — there is no section to name, and inventing an
  "Ungrouped" summary would put words on the storefront the merchant never wrote.
- **A template with NO section headers at all.** Collapsible is meaningless. Locked: **degrade to the
  single-table shape** (identical to the OFF path). The `--collapsible` class may still be present on
  the wrapper — it is a presence flag, and the CSS must tolerate it with nothing to act on.
- **A section whose rows are all hidden by `hideWhenEmpty`.** Locked: **no new emptiness logic.** It
  renders as an empty collapsible, exactly as it renders as a lone section-header row today.
  Inventing a "skip empty sections" rule here would silently change the OFF path too, and belongs to
  its own decision if a merchant ever asks for it.
- **`sectionsInitialState` when collapsible is OFF.** It is stored but inert. The control is hidden
  (see §4) and the markup ignores it entirely.

### 3 · Striping — the deferred problem, now due

`spec-table.css:101` uses `:nth-child(even)` on `.appx-spec-table__row`, chosen because section
headers are table rows too and banding must count **real rendered rows**. The collapsible shape
breaks both halves of that reasoning: rows live in per-section tables (so `nth-child` **restarts at
every section**), and the section header is no longer a `<tr>` at all (so it stops being counted).

**Locked 2026-07-19 (confirmed with the project owner): accept the restart, and pin it with a test.**
Within a collapsed/expanded section, striping
that starts fresh reads as *more* correct, not less — the alternation is a within-section reading
aid, and continuing a global parity across a collapsed boundary would look arbitrary once a section
is closed. This is a **deliberate, documented behavioral difference between the two shapes**, and the
CSS comment at line 101 must be rewritten to say so instead of pointing forward to this step.

Do **not** attempt to preserve global parity with `nth-of-type` gymnastics or server-computed
odd/even classes. That would be real complexity bought for a look nobody asked for.

### 4 · The controls (`stylingControls.ts` + `StyleTab.tsx`)

Both land in the **Sections** group, under the existing Section-headers control:

- **`sectionsCollapsible`** — the styling rail's **first non-select control**, a toggle
  (`s-checkbox`, or `s-switch` if Polaris exposes one — check before assuming; see
  [[polaris-web-component-gotchas]]). It is a `boolean`, so it needs no option list.
- **`sectionsInitialState`** — a `SECTIONS_INITIAL_STATE_OPTIONS` list built exactly like Step 8's
  four: a `Record` keyed on the domain union, `.map`ped over `SECTIONS_INITIAL_STATES`, never
  hand-typed. Labels per `admin-screen-plan.md` §Tab 2 — roughly "All open" / "First open" /
  "All closed", with one-line help text.

**The visibility rule repeats Step 8's, including its trap.** `sectionsInitialState` is meaningless
when collapsible is off, so **hide it** (do not disable it) — and, exactly as with the On-mobile
control, **hiding must not mutate state**: toggle collapsible off and back on and the merchant's
initial-state choice must still be there. Add `showsSectionsInitialStateControl(styling)` beside
`showsMobileLayoutControl`, as a pure predicate, and unit-test the preserve-on-hide round trip. This
is the second instance of the pattern; if a third appears in Step 10, *that* is when to consider
generalising it — not now.

**The `<StylingSelect>` question, again.** Step 8 rejected a generic wrapper because Step 9/10 bring
non-select shapes. This step ships the first of them (a toggle), which confirms that call. Keep the
controls explicit; the only shared helper remains `selectedHelpText`.

### 5 · CSS + the drift guard

**This step is allowed to edit `spec-table.css`** — unlike Step 8, whose bar was zero non-UI diff.
That means the feature 49 CSS drift guard **will fail on the edit and must be re-greened by a
mechanical, byte-exact re-copy into `previewStyles.ts`** ([[app-extension-snippet-render-wrapper]] is
unrelated here; the relevant precedent is Step 3's re-copy). Rules to add, all under
`.appx-spec-table--collapsible` at equal specificity, no `!important`:

- `<summary>` styled to match the section header it replaces — **and it must respect
  `sectionHeaderStyle`**, so `--section-banded` and `--section-text-only` both need a `summary`
  variant. This is the subtle one: the two knobs now compose, and a merchant who picked "Text only"
  must not get a band back the moment they enable collapsing.
- Marker/disclosure affordance, and a visible `:focus-visible` ring on the summary.
- Whatever the per-section `<table>` needs so density/dividers/layout keep working across the split.

**The contract test must shrink its exemption list.** `specTableCssContract.test.ts:64` lists
`appx-spec-table--collapsible` in `KNOWN_ABSENT_SELECTORS` with the comment "no `<details>` markup
until Step 9". Step 9 **removes that entry** — the list was designed to shrink consciously here, and
leaving it would let the new rules go unasserted. `appx-spec-table--mobile-same-as-desktop` stays.

### 6 · Accessibility

`<details>/<summary>` is natively keyboard-operable, which is most of the win. Two things it does not
give for free:

- **Each per-section `<table>` loses its `<th scope="colgroup">` heading**, so it needs an accessible
  name — an `aria-label` (or `aria-labelledby` pointing at the summary) carrying the section title.
  A screen-reader user meeting six unnamed tables is a regression over one named one.
- **The summary must be reachable and its state announced.** Native `<details>` handles
  expanded/collapsed; do not re-implement it with ARIA on a `<div>`.

Step 12 already carries an a11y item (stacked `display:block` strips implicit table semantics). Add
the per-section table naming to that list if anything is left unresolved here, but prefer to land it
correctly in this step — it is markup this step owns.

## Locked decisions

- **Default OFF renders byte-identically to today.** Non-negotiable, and the first thing to verify.
- **Liquid reads `spec.styling.value` for the two markup knobs** — no metaobject field, no
  `shopify.app.toml` change, no sync change. Justified in "The Liquid question" above.
- **One `<details>` per section, each wrapping its own `<table>`** — not one table with `<tbody>`
  toggling, which cannot be made accessible or animatable, and not a JS-driven accordion.
- **No JavaScript on the storefront.** `<details>` is native. The theme app extension ships plain
  Liquid + CSS, and adding a script for something the platform does natively would be a regression in
  both performance and App Store review surface.
- **Striping restarts per section in the collapsible shape**, deliberately and documented.
- **`sectionsInitialState` never becomes a CSS class** — it is the `open` attribute, per Step 2's
  standing no-leak test.
- **Hiding the initial-state control must not clear it**, unit-tested, exactly as Step 8.
- **The editing grid is untouched** (Step 11), and colors/typography stay out (Step 10).

## What this step does *not* own (boundary with later steps)

- **Colors + Typography** (seven swatches, five knobs), and **`labelWidthPct`** → **Step 10**, where
  nullable "inherit" gets its UI vocabulary.
- **The editing grid reacting to any of this** → **Step 11**.
- **Reset to theme defaults, the rail a11y pass, disclosure groups, docs, B1 sign-off** → **Step 12**.
- **Presets** → **Steps 13–14**.
- **Animating the disclosure**, remembering open/closed per shopper, deep-linking to a section — none
  of these are in the PRD. Do not invent them.

## Testing

### Unit

- **`specTablePreviewHtml.test.ts`** — the bulk of the work:
  - **OFF is byte-identical**: assert the rendered string for a default-styled template is unchanged
    (the existing Step 6/7 assertions should pass untouched — if one needs editing, that is a signal
    the OFF path moved and the step is wrong).
  - **ON produces one `<details>` per section header**, each containing exactly that section's rows,
    in order.
  - **The `open` matrix**: `ALL_OPEN` → every `<details open>`; `FIRST_OPEN` → only the first;
    `ALL_CLOSED` → none.
  - **The four edge cases** from §2, each as its own test: leading rows before the first section, a
    template with no sections at all, an all-hidden section, and initial-state-with-collapsible-off.
  - **Each section table carries its accessible name.**
  - The existing test at `specTablePreviewHtml.test.ts:534` ("does not emit the collapsible class
    until Step 9 wires the control") **is now obsolete and must be replaced**, not deleted quietly —
    it becomes the positive assertion.
- **`specTableCssContract.test.ts`** — drop `appx-spec-table--collapsible` from
  `KNOWN_ABSENT_SELECTORS`; the producible-class count of 13 does not change (no knob gains a
  member).
- **`stylingControls.test.ts`** — the new option list joins the Step 8 `describe.each` table (it will
  satisfy the same five assertions unchanged), plus `showsSectionsInitialStateControl` including the
  **preserve-on-hide** case.
- **`tableStylingCss.test.ts`** — unchanged. The mapping does not move in this step; if it does,
  something is wrong.

### Live verification

The pipe and the controls are both proven, so this pass is about **structure**. Restore every knob
touched and leave the DB as found (see the Step 8 entry in `progress-tracker.md` for the baseline
table and the restore-through-the-UI-not-SQL rule, so the metaobject re-syncs).

1. **The regression first, before anything else:** open a default-styled ACTIVE template's product
   page and confirm the wrapper, row count and computed styles are **unchanged** from the Step 8
   sign-off numbers (DJI Mavic: 44 rows, 9 sections, banded `rgba(0,0,0,0.06)`, `8px` label padding,
   **table height 2980px**). If this moved, stop.
2. Enable **Collapsible sections** in the rail → the previews restructure into per-section
   disclosures; the SaveBar opens on the styling change alone.
3. Walk the **initial-state matrix** in the preview: All open / First open / All closed.
4. Toggle collapsible **off and back on** → the initial-state choice is still the merchant's, not the
   default. (The Step 8 data-loss trap, second instance.)
5. Confirm **Section headers: Banded ↔ Text only still composes** with collapsing — the summary
   follows the chosen style in both states.
6. Save, reload, then check the **live product page**: sections expand and collapse with **no
   JavaScript**, keyboard (Tab + Enter/Space) operates each summary, and striping restarts per
   section as decided.
7. **A 44-row / 9-section template is the right subject** (DJI Mavic) — it is the only one that makes
   a nine-disclosure document real.
8. Restore the template to its original styling and status; re-confirm the baseline numbers from (1).

## File placement (per `code-standards.md`)

**9a (markup + CSS, dormant):**

- `extensions/product-specs-table/blocks/spec_table.liquid` — **edit** (the ON/OFF markup branch).
- `extensions/product-specs-table/assets/spec-table.css` — **edit** (collapsible rules; rewrite the
  striping comment at line 101 and replace the placeholder at line 85).
- `app/routes/app.templates_.$id/previewStyles.ts` — **mechanical byte-exact re-copy** (drift guard).
- `app/routes/app.templates_.$id/specTablePreviewHtml.ts` — **edit** (the mirrored markup).
- `app/routes/app.templates_.$id/specTablePreviewHtml.test.ts` — **edit** (the markup matrix + the
  four edge cases; replaces the now-obsolete test at line 534).
- `app/routes/app.templates_.$id/specTableCssContract.test.ts` — **edit** (drop the exemption).

**9b (controls, UI-only):**

- `app/routes/app.templates_.$id/stylingControls.ts` — **edit** (option list + visibility predicate).
- `app/routes/app.templates_.$id/StyleTab.tsx` — **edit** (toggle + conditional select).
- `app/routes/app.templates_.$id/stylingControls.test.ts` — **edit** (new blocks).

**No** schema, migration, server, `metaobjects.server.ts`, `templateSync.server.ts`,
`shopify.app.toml`, `useRowEngine.ts` or dependency change. A diff touching any of those is a signal
to stop and re-read this doc.

## The split — LOCKED 2026-07-19, decided before any code

This is the largest remaining B1 unit, and the standing rules prefer small verifiable increments, so
it ships as **two commits** in the Step 3/5 pattern — decided up front rather than halfway through:

### 9a — markup + CSS, dormant

Both renderers learn the collapsible shape and the CSS lands, but **no control can set the flag**, so
the whole thing is unreachable and provably inert — exactly Step 3's posture. Scope:

- `spec_table.liquid`, `specTablePreviewHtml.ts`, `spec-table.css`, the `previewStyles.ts` re-copy,
  and the two markup/CSS test files.
- **Not** `stylingControls.ts`, **not** `StyleTab.tsx`.

**Verifiable without a control**, which is the point: the unit tests drive `sectionsCollapsible: true`
directly, and the live pass proves dormancy the way Step 3 did — the storefront renders byte-identically,
then a devtools experiment adds `appx-spec-table--collapsible` (and the markup, where feasible) by
hand to confirm the rules are live-but-unreferenced, and reverts it.

The natural hazard here: with no control, the ONLY thing standing between "correct" and "silently
broken" is the unit tests. Write the four edge cases from §2 first, not last.

### 9b — the two controls

A small UI-only step in the exact shape of Step 8: an option list + a visibility predicate in
`stylingControls.ts`, a toggle + conditional select in `StyleTab.tsx`, tests. **Zero non-UI diff**
applies here as it did in Step 8 — if 9b needs a CSS or Liquid change, 9a was wrong, and that is the
finding rather than the workaround.

The full live matrix (§Live verification) belongs to **9b**, since that is the first point a merchant
can reach the feature. 9a's live pass is only the dormancy check.

## Done when

**9a:**

1. A default-styled (collapsible OFF) template renders **byte-identically** on both the storefront
   and the previews — verified against the Step 8 numbers, not by eye.
2. Collapsible ON renders one `<details>` per section on both surfaces, from the same structure, with
   the `open` matrix correct for all three initial states — proven by unit tests, since no control
   exists yet.
3. All four edge cases from §2 behave as locked, each with its own test.
4. Each per-section table has an accessible name; the summary is keyboard-operable with **no
   JavaScript**.
5. Striping restarts per section, deliberately, with the CSS comment at line 101 rewritten to say so
   instead of pointing forward to this step.
6. `specTableCssContract.test.ts` no longer exempts `--collapsible`; both CSS drift guards green
   after the mechanical re-copy.
7. **Dormancy proven live**: the storefront is unchanged, and a devtools experiment confirms the new
   rules are live-but-unreferenced, then reverted.
8. Full gate green; `progress-tracker.md` updated — 9a complete, next → 9b.

**9b:**

9. Both controls render in the Sections group, mutate engine state, ride the SaveBar, and survive a
   save + reload.
10. The initial-state control hides for collapsible-off **without losing its value**.
11. The full live matrix passes (§Live verification), including Banded ↔ Text only composing with
    collapsing, and keyboard operation on the real product page.
12. **Zero non-UI diff** — no CSS, Liquid, server or schema change; both drift guards pass unedited.
13. Full gate green; `progress-tracker.md` updated — Step 9 complete, next → Step 10 (Colors +
    Typography).
