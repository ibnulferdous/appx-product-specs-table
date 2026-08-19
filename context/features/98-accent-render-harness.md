# Step 98 — the 5 × 6 accent render matrix, measured at 1:1

**Status:** ✅ **completed 2026-07-30.** 35 renders (5 presets × Theme + 6
accents) measured by `getComputedStyle` at 800px scale 1. **All three questions
answered; no palette value changed.** Gate green, tests unchanged at **1179 / 43**
— this step edits comments and one test NAME, not behaviour.

**Outcome in one line:** doc 93's reach table is confirmed field-by-field against
a per-preset control, the provisional underline is confirmed as the Title tone,
and the `borderColor` reach **increases** rule contrast rather than reducing it.

**Parent feature:** `93-style-accent-themes.md` (binding design).
**Position:** step 2 of 6. Previous: `97-accent-vocabulary.md` ✅. Next is
`99-accent-seed-path.md`.
**Depends on:** step 97's `ACCENT_PRESETS`, and
`renderSpecTablePreviewDocument` (`specTablePreviewHtml.ts:393`).
**Migration:** **none.**
**Merchant-visible:** **no.** The only shipped change this step can produce is a
revision to six hex values.

---

## What this step is

**A verification step, not a feature step.** It renders every preset under every
accent through the real pipeline, measures the result with `getComputedStyle` at
1:1, and answers three questions the design could only predict. It exists because
this project has already got a low-contrast styling claim wrong once by reading it
off a downscaled screenshot (feature 88 — the Classic stripe was reported as "the
label column is shaded", which would have been a real defect, and was not true).

⚠️ **It is deliberately placed BEFORE any UI.** Steps 100 and 101 build a swatch
row whose whole purpose is to restyle five cards; if the accent's reach is wrong,
that is a data problem, and finding it after the component exists means debugging
two things at once.

**Scope in one line:** thirty renders, measured not eyeballed, and six hex values
either confirmed or replaced.

---

## The three questions

### Q1 · Does the reach table in doc 93 hold?

Doc 93 predicts which accent fields are live on each preset, derived by reading
`spec-table.css` against the bundles. **A prediction, explicitly flagged as one.**

| Preset       | Predicted live accent fields               |
| ------------ | ------------------------------------------ |
| Modern       | band · title · row rules                   |
| Classic      | title · stripe · column rule + outline     |
| Minimal      | title only                                 |
| Multi-column | band · title                               |
| Accordion    | title · underline · row rules              |

A field predicted **live** must measure as the accent's hex. A field predicted
**dead** must measure as whatever it measures with no accent at all — that is the
stronger assertion, because "dead" means *the accent changed nothing*, not merely
"it looks neutral".

### Q2 · What should `headerUnderlineColor` be?

Step 97 shipped six **provisional** values (each accent's Title hex) with the
reasoning recorded but unverified. This step decides.

🔴 **The design intent is already on file and it constrains the answer.** Feature
88's Accordion comment:

> `TEXT_ONLY` rather than `PLAIN` here on purpose: the 2px rule gives a CLICKABLE
> header the presence a disclosure needs, where the other two cards' headers are
> inert.

So the rule exists to give a clickable header **presence**. That rules out the
pale option: with `borderColor` in the accent, an absent `headerUnderlineColor`
already falls back to the pale border hex, which is the same value the row rules
take — a header underline indistinguishable from a row boundary, which is the one
thing the member was chosen to avoid.

**Predicted outcome: the provisional Title hex is CONFIRMED.** ⚠️ If it is,
record it as *confirmed against feature 88's stated intent and measured
separation from the row rules* — not as "kept because nobody changed it". A
provisional value that survives by default is still a guess.

### Q3 · Does `borderColor`'s reach read as intentional?

D6 answered "tint them all", but the palette was approved on a combination with
**both** interior rule sets switched off, so the study only ever showed the
outline. Two surfaces have never been seen under an accent:

- **Modern's row rules** — `LINES` at the pale border hex, on every data row.
- **Classic's column rule** — the vertical label/value divider at the same hex.

Both are pale by construction (the border hexes are the palest of the four roles
after the stripe), so the risk is not garishness but **disappearance**: a rule
that was `rgba(0,0,0,0.1)` becoming a tint with less contrast against white than
the neutral it replaced. That is a legibility regression disguised as a colour
choice, and it is measurable.

**The bar:** each tinted rule must hold contrast against the row background at
least as well as the neutral it replaces. If a rule measures *fainter* than
`rgba(0,0,0,0.1)` on white, that is a finding and it goes to the merchant — the
fix would be a palette revision, not code.

---

## Method

### The harness lives in `.harness/`, untracked

✅ **Enforced by the project, not by restraint — `.gitignore:43` is `.harness/`.**
The convention predates this step (feature 94's `feature-94.html` sits there
ignored), so a generated artifact cannot be committed by accident.
**The harness is scaffolding; the measurements are the deliverable** and they go
in this file.

### It must render through the real pipeline

🚫 **No hand-written table markup, and no hand-copied CSS.** The whole reason
`renderSpecTablePreviewDocument` is used by the gallery cards is zero drift
against the storefront (`StylePresetCard.tsx:19`); a harness that reimplements the
markup measures the harness. The generator imports the real renderer and the real
`ACCENT_PRESETS`, and the document it emits already inlines the mirrored
stylesheet via `PREVIEW_DOCUMENT_STYLES`.

### Running a TS generator without polluting the suite

`vitest.config.ts` has `include: ["app/**/*.{test,spec}.{ts,tsx}"]`, so nothing in
`.harness/` is picked up by `npm test`. The generator runs under its own
throwaway config:

```
npx vitest run --config .harness/vitest.harness.config.ts
```

⚠️ **The generator must not live under `app/`.** A file matching that include
pattern would run on every `npm test` and write files as a side effect of the
suite — and `app/routes/` has an even sharper version of this trap (step 92
finding 1: a test file directly in `app/routes/` is a ROUTE and breaks the build
while the suite stays green).

### Geometry: 800px, scale 1

Feature 88 established **800px** as the preview width — below the storefront
stylesheet's **749px** mobile breakpoint every pattern collapses to its identical
phone form and the matrix stops distinguishing anything. The gallery *displays*
at `--appx-preset-scale: 0.55`; this harness renders at **scale 1**, because
`getComputedStyle` on a CSS-transformed subtree is what produced the wrong answer
in feature 88.

### Measurement, not inspection

For each of the 30 documents, read from the live frame:

| Surface        | Selector                        | Property                  |
| -------------- | ------------------------------- | ------------------------- |
| band           | `.appx-spec-table__section`     | `background-color`        |
| title          | `.appx-spec-table__section`     | `color`                   |
| underline      | `.appx-spec-table__section`     | `border-block-end-color` + `-width` |
| row rule       | `.appx-spec-table__label`       | `border-block-end-color` + `-width` |
| column rule    | `.appx-spec-table__label`       | `border-inline-end-color` + `-width` |
| stripe         | even `.appx-spec-table__label`  | `background-color`        |
| outline        | `.appx-spec-table`              | `border-color` + `-width` |

Plus a **no-accent control render per preset** (6th column of the matrix is
"Theme"), so every "dead" claim is a diff against the control rather than an
absolute.

---

## Measurements — 2026-07-30

Harness: `.harness/accentMatrix.gen.ts` → `.harness/accent-matrix.html`, 35
`renderSpecTablePreviewDocument` outputs in same-origin `srcdoc` frames at 800px,
`transform: none`. Values below are `getComputedStyle` reads, Blue shown as the
representative accent; every accent behaved identically in kind.

### Q1 · The reach table is CONFIRMED, 5 of 5

Each cell is **control → Blue**. "same" means byte-identical to the control, which
is the strong form of "the accent changed nothing here".

| Preset       | band                            | title                      | underline                       | row rule                            | column rule                         | stripe                          | outline                             |
| ------------ | ------------------------------- | -------------------------- | ------------------------------- | ----------------------------------- | ----------------------------------- | ------------------------------- | ----------------------------------- |
| Modern       | `rgba(0,0,0,.06)` → **#e6effc** | `#1a1a1a` → **#0a4e9e**    | 0px, same                       | `rgba(0,0,0,.1)` → **#b3cbec**      | 0px, same                           | none                            | **0px** (colour set, width 0)       |
| Classic      | transparent, same               | `#1a1a1a` → **#0a4e9e**    | 0px, same                       | **0px**, same                       | `rgba(0,0,0,.1)` → **#b3cbec**      | `rgba(0,0,0,.04)` → **#f1f6fd** | `rgba(0,0,0,.1)` → **#b3cbec**      |
| Minimal      | transparent, same               | `#1a1a1a` → **#0a4e9e**    | 0px, same                       | 0px, same                           | 0px, same                           | none                            | **0px** (colour set, width 0)       |
| Multi-column | `rgba(0,0,0,.06)` → **#e6effc** | `#1a1a1a` → **#0a4e9e**    | 0px, same                       | 0px, same                           | 0px, same                           | none                            | **0px** (colour set, width 0)       |
| Accordion    | transparent, same               | `#1a1a1a` → **#0a4e9e**    | `1.81818px` → **#0a4e9e**       | `rgba(0,0,0,.1)` → **#b3cbec**      | 0px, same                           | none                            | **0px** (colour set, width 0)       |

Every predicted-live field carries the accent value; every predicted-dead field is
identical to its control. **Minimal changes exactly one thing — the title** —
which is the prediction D3 was answered to make true, observed rather than argued.

🔍 **One nuance the prediction did not capture, and it is a nice property.** On
the four presets with no frame, the outline's **colour resolves to the accent hex
while its width stays `0px`**. So "dead" here means *zero width*, not *colour not
applied* — and the consequence is that a merchant who later turns on an outer
border on a Modern template gets the accent's border tone already waiting, with no
second write. Recorded because "the accent didn't reach it" would have been the
wrong mental model.

🔴 **A measurement error of mine, caught and corrected — worth recording because
it is the same class of mistake feature 88 made.** The first probe reported
Classic's stripe as *unchanged* under an accent, which would have falsified the
reach table. The probe was wrong, not the data: it searched for "the first label
whose background differs from label[0]", and on Classic **label[0] IS a striped
row**, so it found the *un*-striped neighbour and read `transparent`. Re-probing
for the full set of distinct backgrounds gives
`[rgba(0,0,0,.04), transparent] → [#f1f6fd, transparent]`. **Lesson: a probe that
looks for "the one that differs" assumes which element is the baseline.** Enumerate
the set instead.

### Q2 · The provisional underline is CONFIRMED as the Title tone

Accordion, control → Blue: `1.81818px rgb(26,26,26)` → `1.81818px rgb(10,78,158)`.
The rule is live and takes the title hex.

**Why that is right rather than merely unchanged.** In the same table the row
rules measure the *border* tone (`#b3cbec`, contrast to white **1.657**) while the
underline sits at the title tone (contrast to white ≈ **14**). Had the field
fallen back to `borderColor` — which is what an absent value does — the header
underline and the row rules would be the **same colour**, and feature 88 chose
`TEXT_ONLY` for this card precisely so a clickable header would have presence the
inert ones lack. The measurement shows the two surfaces are plainly distinct.

✅ `provisional` removed from the module comment and from the test name; the
`no accent's underline duplicates its border` guard is retained and re-justified
as the guard on a future palette revision.

### Q3 · `borderColor`'s reach INCREASES contrast — no regression

The bar was: a tinted rule must hold contrast against white at least as well as
the `rgba(0,0,0,0.1)` neutral it replaces. WCAG 2.x relative luminance, sRGB,
alpha composited over white.

| Accent         | row-rule contrast vs white | vs the 1.254 neutral |
| -------------- | -------------------------- | -------------------- |
| _(neutral)_    | **1.254**                  | —                    |
| Amber          | 1.513                      | +21%                 |
| Teal           | 1.643                      | +31%                 |
| Terracotta     | 1.639                      | +31%                 |
| Blue           | 1.657                      | +32%                 |
| Graphite       | 1.661                      | +32%                 |
| Plum           | 1.764                      | +41%                 |

**All six clear the bar; the weakest is 21% better than the neutral.** The feared
failure — a tint fainter than the grey it replaces, a legibility regression
disguised as a colour choice — does not occur, because every border hex is a
mid-pale tint rather than a near-white one.

✅ **And it reads as intentional**, checked by eye on the Modern control beside
Modern + Blue: with the row rules tinted, the lines belong to the band. Left
neutral they would have been **grey rules under a blue band**, which is the
incoherence D6 was answered to avoid. Same for Classic's column rule against its
blue stripes.

⚠️ **This visual check was made on a `transform: scale(0.48)` view, and only
after every number above was read untransformed.** Scaling for a screenshot is
fine; scaling before measuring is what produced feature 88's wrong answer.

### What was NOT measured

- **Dark storefront themes.** Every number above is against white. Doc 93 §D3's
  accepted risk is untouched by this step and is still owed to step 102 — the
  titles measured here at ≈14:1 on white are the same absolute hexes that would
  land on a near-black ground.
- **The gallery at 0.55 scale.** Deliberate; that is step 101's, and its question
  is flicker, not colour.
- **`sectionGapPx`, radius, and the feature-80 collapsible separator.** No accent
  field reaches them, and Accordion's own `sectionGapPx: 12` disables the
  separator rule.

---

## Completion gate — ✅ 7 of 7

1. ✅ **35**, not 30 — the per-preset Theme control was added as a 7th column,
   which is what turned every "dead" claim into a diff.
2. ✅ **Q1 confirmed 5 of 5** by diff against the control. No correction needed to
   doc 93's reach table; one nuance added (zero-width outline).
3. ✅ **Q2 confirmed** as the Title tone, with the measured separation from the row
   rules as the reason. `provisional` removed from the module comment and the test
   name; doc 93 §D5 updated.
4. ✅ **Q3 measured** — every accent 21–41% *more* contrasty than the neutral it
   replaces. Nothing to report to the merchant.
5. ✅ Measurements recorded here. `.harness/` stays untracked (its
   `accent-matrix.html` is 1.4 MB of generated `srcdoc`).
6. ✅ Full gate green: typecheck · lint · format:check · **1179 tests / 43 files**
   · build. Unchanged from step 97 **by design** — this step changed comments and
   one test name, so a moved number would have meant it changed behaviour.
7. ✅ `context/progress-tracker.md` updated.

🔬 **Method note worth carrying.** The single most valuable thing in this harness
was not the accent renders — it was the **control column**. Without it, "Classic's
band is transparent under Blue" is an observation that needs an argument to become
a finding; with it, the claim is "identical to the same table with no accent", and
the argument is unnecessary. Feature 94's harness learned the same thing
(`STACKED` first-child `0px` "identical to the no-gap control"). Any future matrix
should render its own baseline as a column rather than trusting a remembered one.

⚠️ **No storefront or embedded-admin verification is owed here** — this step
measures the renderer, which is the same code the gallery cards and the device
previews already run. The real-storefront leg is step 102's.
