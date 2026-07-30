# Step 102 — live verification: admin → Postgres → metaobject → storefront

**Status:** ✅ **COMPLETE 2026-07-30 — all six items answered, no code written.**
Tests **1227 / 45 files, unmoved** (the intended result — see gate 7).
🔴 **V5 came back ILLEGIBLE, and worse than §D3 predicted.** The verdict and the
numbers are in §Results below; the decision it raises is now doc 93 §Open
question 2, unanswered and owed to the merchant.

**Parent feature:** `93-style-accent-themes.md` (binding design — read it first).
**Position:** step 6 of 6, the last. Previous is `101-accent-gallery-wiring.md`.
**Depends on:** steps 97–101, all shipped and step 101 live-verified in the admin.
**Migration:** **none.**
**Merchant-visible:** nothing new — step 101 was the visible one. This step
**watches** what 101 already ships travel the rest of the way.

---

## 🔴 What makes this step different: it writes no code

Every other step in this feature produced a diff. **This one's deliverable is
evidence, and one decision.** Doc 93's cost profile is the reason:

> **No migration. No new field in `STYLING_FIELD_NAMES`. No Liquid, no TOML, no
> metaobject-definition change, no new CSS rule.** Every field an accent writes is a
> nullable colour that already serializes to `vars` and already renders.

So there is nothing here that can *fail to build* — only claims that can turn out to
be false. ⚠️ **If this step produces a code change, something in 97–101 was wrong**,
and that is the finding rather than the fix.

**Scope in one line:** watch one accent travel gallery → Postgres → metaobject →
a real product page, then answer the dark-theme question doc 93 §D3 has been
deferring since the feature was specced.

---

## The path being watched

Already built, already tested with mocked boundaries. This step confirms the real
one end to end, once.

```
gallery: ?style=…&accent=plum
   │  resolveGalleryParams  (step 99, unit-tested)
   ▼
StylingValues — five real colour fields among the 34
   │  Save
   ▼
Postgres  TableStyling.{headerBgColor, headerUnderlineColor,
                        headerTextColor, stripeBgColor, borderColor}
   │  upsertSpecTableMetaobject  (metaobjects.server.ts)
   ▼
metaobject  styling      = serializeStylingOverrides(...)   ← the DATA
            styling_css  = { classes, vars }                ← the PRESENTATION
   │  Liquid prints `vars` verbatim into an inline style attribute
   ▼
storefront: --appx-spec-header-bg: #f4e8f8; --appx-spec-header-text: #501760; …
```

🔬 **The one property worth stating precisely**, because it is what makes this step
short: an accent is not a new kind of value anywhere on this path. Feature 57 step 7
already proved colours reach `styling_css.vars` and render. What is new is only
**who wrote them** — a query param at create time instead of a merchant's swatch
click. So the risk is concentrated at the **front** of the chain (does the accent
survive the Save?), not the back.

---

## What this step must answer

### V1 · The five colours survive Save → Postgres

Create a template from the gallery **with an accent**, add rows, Save. Then confirm
the five columns hold the accent's exact hexes.

📌 Read Postgres directly rather than trusting the editor UI — the editor is showing
its own in-memory state, which is the thing under test. The Neon MCP `run_sql` is the
straightforward route. ⚠️ Expect a possible **P1001 on the first query** if the
branch is cold; that is [[neon-cold-start-prisma-connect-timeout]], not a failure of
this step.

### V2 · `basedOnPreset` holds the PATTERN only

`banded`, not `banded+plum`, not `plum`. Doc 93 §D7's column-safety claim, checked
where it actually lands. Step 99 pinned it in a unit test; this is the same claim one
layer down.

### V3 · The metaobject carries both halves

`styling` (the overrides-only data) contains the five keys; `styling_css.vars`
contains the five custom properties with the same hexes. ⚠️ **Check `vars`, not only
`styling`** — `styling` being right while `vars` is empty is exactly the shape of
failure that would render a completely untinted table with correct-looking data
behind it.

### V4 · A real product page renders the accent

Assign the template to a product, publish, open the product page. The band, the
title, the rules and the stripe carry the accent.

⚠️ **Two dev-store hazards to expect rather than debug from scratch:**

- The storefront may be password-gated; the unlock rides in `_shopify_essential`, not
  the legacy `storefront_digest` ([[shopify-storefront-password-cookie]]).
- 🚫 **Do not run `shopify app dev clean`** between the Save and the storefront check
  — it wipes undeployed app-owned metaobject data
  ([[shopify-metaobject-deploy-clean-lifecycle]]). Data self-heals on a re-Save, but
  a mid-verification wipe reads as "the metaobject never got written", which is a
  false negative that would cost an hour.

### V5 · 🔴 The dark-theme observation — the feature's one accepted risk

**This is the only item that can change the product**, and it is the reason this step
exists as more than a formality. Doc 93 §D3, recorded before anything was built:

> Every text colour in the spec table defaults to `inherit` … there is **no
> `prefers-color-scheme` rule anywhere in `spec-table.css`** (verified 2026-07-30). An
> accent writes an _absolute_ hex, which opts one string out of that inheritance.
> … A merchant on a dark theme will get a dark title on a dark ground. Accepted
> because the alternative (no title tint) makes Minimal show nothing at all.

**Render the same product page under a dark ground and look.** The concrete route on
Dawn is the theme editor's colour schemes: set the product-information section to a
scheme with a dark background. That changes the theme's own ink to light while the
accent's title stays its absolute dark hex — which is precisely the collision D3
predicted.

Report **which of these it is**, with a screenshot:

| Outcome                                    | Response                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Legible                                    | Close the risk in doc 93 §D3 and §Open questions with the evidence.           |
| Marginal                                   | Record it and leave the palette alone; note it as a known limit in §D3.       |
| Illegible (dark ink on dark ground)        | 🔴 A **palette revision** — see below. Not a code change.                     |

🚫 **The fix is never contrast-checking code.** The 2026-07-20 binding rule holds: the
app cannot compute contrast against a theme colour it never sees. Doc 93 §Open
questions already names the remedy — *"the fallback is not a code change but a palette
revision — the six hexes are data, not logic"* — which is exactly the property step 97
D4 bought by refusing to derive the palette at runtime. **A palette revision is a
merchant decision with a date**, and it lands as six edited literals in
`ACCENT_PRESETS` plus the pinned test.

⚠️ **Scope the claim honestly.** One dark theme is one data point, not "accents work
on dark themes". Say which theme, which colour scheme, which surfaces.

### V6 · D1's "no capability is lost" claim

Doc 93 §D1 justified create-time-only on this basis:

> an accent lands in five **real colour columns** the merchant can already edit
> individually in the rail's feature-86 groups. Nothing is locked away — only the
> shortcut is create-time.

**Never verified.** Open the seeded template's Style rail and confirm the five
swatches show the accent's hexes and are editable. If they are not — if an accent
value renders blank or the control does not accept an edit — then D1's justification
is false and create-time-only becomes a real limitation rather than a shortcut.

---

## 🔬 Method: this step is all instrument, so the instrument rules ARE the method

Two of the last three steps produced a **false negative from my own measurement**,
each of which briefly looked like a product defect:

- **Step 98:** a stripe probe that searched for "the first element whose background
  differs from `label[0]`" — on Classic, `label[0]` *is* a striped row, so it found
  the unstriped neighbour and reported "no stripe". _A probe that hunts for "the one
  that differs" has already assumed which element is the baseline; enumerate the set._
- **Step 101:** a zoom crop too coarse to resolve hue in antialiased 8.8px text,
  which read as "the title tint is imperceptible on Minimal" and would have
  invalidated D3. _When a visual check says "no change", suspect the instrument
  before the code._

Since step 102 is **nothing but observation**, those two lessons are its operating
rules rather than footnotes:

1. **Always capture the baseline through the same instrument, same settings, same
   session.** A Theme-accent render read at a different zoom is not a control.
2. **Prefer reading the value over reading the pixel.** `run_sql`, the metaobject
   JSON and `getComputedStyle` are exact; a screenshot is an opinion. Use pixels only
   for the question that is genuinely perceptual — V5, which is *about* whether a
   human can see something.
3. **Enumerate, do not search for the odd one out.**
4. **A negative result gets re-run with a second method before it is written down.**
   Both false negatives above would have died instantly under that rule.

### What the rules actually caught, 2026-07-30

They earned their place: **rule 4 fired twice in one step, on the same probe
mistake, and both times the code was fine.**

- **"No stripe."** The first probe read `backgroundColor` off each `<tr>` and got
  `rgba(0,0,0,0)` four times. The stripe is painted on the **cells**
  (`__label` / `__value`), not the row — `spec-table.css:510` targets
  `__row:nth-child(even) th/td`. Enumerating every descendant instead of the
  element I expected found `rgb(249,243,251)` immediately.
- **"No column divider."** The second probe read `borderInlineStart` off
  `__value` and got `0px`. The divider is `border-right` on the **`__label`**.
  Same fix, same lesson: _I had assumed which element carries the paint._
- ⚠️ **One probe that returned nothing and meant nothing.** Reading
  `document.styleSheets[].cssRules` to find the matching rule returned `[]` — the
  stylesheet is served from `cdn.shopify.com`, so `cssRules` throws on
  cross-origin and the `try/catch` swallowed it. An empty result there is an
  **instrument limit, not evidence**; computed style is the reliable read.

**Note 1 — the theme is Horizon, not Dawn.** This file's V5 recipe named Dawn's
colour schemes. The dev store runs **Horizon**, which has no shared named
palette: every section carries its own `color-custom-<section-id>` class. All
nine schemes on the page resolve to `--color-background: #ffffff` /
`--color-foreground: #000000`, so **there was no dark scheme to borrow and no way
to produce one without editing the merchant's live theme settings.**

So the dark ground was produced by overriding the theme's **own** scheme
variables on the product section (`--color-background: #101014`,
`--color-foreground: #f2f2f4`) and letting Horizon's cascade do the rest. 📌 State
the instrument plainly rather than implying a theme was configured: this is a
faithful reproduction of the *mechanism* under test — the table inherits `color`
from the theme and every accent value stays absolute — but it is **not** a real
merchant's dark theme, and the §V5 scope note says so. It is also fully
client-side: a reload restored the light rendering exactly (title `rgb(80,23,96)`,
stripe `rgb(249,243,251)`, ink `rgb(0,0,0)`), which is the same-session control
rule 1 asks for.

---

## Results — observed 2026-07-30

**Subject:** template `cms76k2s50006vp38ipdvnia9`, created from the gallery link
`/app/templates/new?style=classic&accent=plum`, ACTIVE, assigned to
`gid://shopify/Product/7897940623425` (DJI Flip Drone Fly More Combo).
**Store:** `appx-dev`. **Theme: Horizon**, not Dawn — see §Method note 1.

### V1 ✅ · The five colours survived Save → Postgres

Read with SQL against the Neon branch (`Template` ⋈ `TableStyling` — note
`basedOnPreset` lives on **`TableStyling`**, not `Template`):

| Column                 | Value     | Plum's palette entry |
| ---------------------- | --------- | -------------------- |
| `headerBgColor`        | `#f4e8f8` | Band ✅               |
| `headerTextColor`      | `#501760` | Title ✅              |
| `headerUnderlineColor` | `#501760` | Title ✅              |
| `stripeBgColor`        | `#f9f3fb` | Stripe ✅             |
| `borderColor`          | `#d5bade` | Border ✅             |

✅ **And D2's exclusion held at the data layer**: `labelTextColor`,
`valueTextColor`, `labelBgColor`, `valueBgColor`, `outerBorderColor` are all
NULL. The accent wrote its five and touched nothing else.

### V2 ✅ · `basedOnPreset` = `"classic"`

The bare pattern id. Not `classic+plum`, not `plum`. D7's column-safety claim
holds where it lands.

### V3 ✅ · The metaobject carries BOTH halves

`app--378906640385--appx_spec_table` / `template-cms76k2s50006vp38ipdvnia9`:

- `styling` → `{… "headerBgColor":"#f4e8f8","headerUnderlineColor":"#501760","headerTextColor":"#501760","stripeBgColor":"#f9f3fb","borderColor":"#d5bade"}`
- `styling_css.vars` → `--appx-spec-header-bg: #f4e8f8; --appx-spec-header-underline-color: #501760; --appx-spec-header-color: #501760; --appx-spec-stripe-bg: #f9f3fb; --appx-spec-border-color: #d5bade;`

So the right-data-but-empty-vars failure did not occur. 🔍 Note
`--appx-spec-header-underline-color` **is emitted under `PLAIN`**, where nothing
reads it — the same "dead means zero width, not colour-absent" shape step 98
measured.

### V4 ✅ · A real product page renders the accent

Read with `getComputedStyle` on the live storefront, not from a screenshot:

| Surface                    | Element                            | Computed             | Expected            |
| -------------------------- | ---------------------------------- | -------------------- | ------------------- |
| Section title              | `.appx-spec-table__section`        | `rgb(80, 23, 96)`    | `#501760` ✅         |
| Stripe fill                | `__label` / `__value`, rows 1 & 3  | `rgb(249, 243, 251)` | `#f9f3fb` ✅         |
| Column divider             | `__label` **border-right**         | `rgb(213, 186, 222)` | `#d5bade` ✅         |
| Outline                    | root, all four sides, `0.909091px` | `rgb(213, 186, 222)` | `#d5bade` ✅         |
| Band (dead under `PLAIN`)  | `__section` background             | `rgba(0, 0, 0, 0)`   | transparent ✅       |
| Underline (dead)           | `__section` border-block-end       | `0px`, colour `#501760` | zero width ✅    |

The wrapper's inline `style` attribute is byte-identical to the metaobject's
`styling_css.vars`, so the whole chain is one copy with no transformation.

### V5 🔴 · The dark-theme observation — **ILLEGIBLE**, and broader than §D3 said

**The verdict is the third row of §D3's table: illegible.** §D3's prediction was
right, and the observation found a **second failure it never named** which is
worse than the one it did.

Contrast ratios, computed from the actual rendered colours (WCAG 2.x, AA body
text needs **4.5**):

| What                                            | Light theme | Dark theme  |
| ----------------------------------------------- | ----------- | ----------- |
| Accent title on the theme's ground (Plum)       | **12.86** ✅ | **1.48** 🔴 |
| Theme's body ink on the accent stripe (Plum)    | **19.24** ✅ | **1.02** 🔴 |
| Accent outline on the ground                    | —           | 10.76 ✅     |

Across all six accents, the same two collisions, and one non-collision:

| Accent     | Title on its own BAND | Title on a DARK ground | Ink on its STRIPE, dark |
| ---------- | --------------------- | ---------------------- | ----------------------- |
| Graphite   | 13.15 ✅               | **1.21** 🔴             | **1.03** 🔴              |
| Blue       | 6.98 ✅                | **2.35** 🔴             | **1.03** 🔴              |
| Teal       | 7.44 ✅                | **2.20** 🔴             | **1.07** 🔴              |
| Amber      | 8.34 ✅                | **1.99** 🔴             | **1.07** 🔴              |
| Terracotta | 8.73 ✅                | **1.85** 🔴             | **1.03** 🔴              |
| Plum       | 10.87 ✅               | **1.48** 🔴             | **1.02** 🔴              |

🔬 **Three things this matrix settles that reasoning had not.**

1. ✅ **Banded presets are SAFE on a dark theme, and §D3 never claimed that.**
   Modern and Multi-column put the title on the accent's own band — _both_
   colours absolute, so the pair travels together: 6.98–13.15, AA everywhere,
   theme-independent. The risk is **not uniform across the gallery**; it is
   confined to the three presets whose title sits on the theme's own ground
   (Classic, Minimal, Accordion) plus Classic's stripe.
2. 🔴 **The stripe is the worse failure, and it is a different failure.** The
   title is dark-on-dark and merely hard to read (1.21–2.35). The stripe is an
   _opaque near-white fill under the theme's now-light body ink_: **1.02–1.07 —
   the row's text disappears entirely.** In the capture, Material and Weight are
   blank while the unstriped Dimensions row between them reads normally.
3. 🔴 **The mechanism is the alpha, and that is why the stripe cannot be tuned
   away.** The stylesheet's default is
   `background: var(--appx-spec-stripe-bg, rgba(0, 0, 0, 0.04))`
   (`spec-table.css:510`) — a **translucent black**, which darkens whatever ground
   it lands on and is therefore theme-agnostic _by construction_. An accent
   replaces it with an **opaque hex**. Every stripe hex in the palette is
   near-white because it has to be on a light theme, so no re-tuning of an opaque
   value fixes this: it is the opacity, not the hue. (The band has the same
   default shape — `rgba(0, 0, 0, 0.06)` — but does **not** fail, because the only
   text on a band is the accent's own absolute title. See point 1.)

⚠️ **Scope of the claim, honestly.** One theme (Horizon), one product page, one
dark ground (`#101014` / `#f2f2f4`), one preset rendered (Classic) with the other
five computed from the same palette. It is enough to answer "does it read badly" —
it is **not** a survey of real merchant themes.

🚫 **No fix was applied, and that is deliberate.** The remedy is a palette or
scope decision, both of which are the merchant's — recorded as doc 93 §Open
question 2 with the options and what each costs. Contrast-checking code stays
barred by the 2026-07-20 rule; nothing here changes that, and note the numbers
above were computed **by the verifier, off-line, against a ground we chose** —
the app still cannot see a merchant's theme colour at runtime.

### V6 ✅ · D1's "no capability is lost" claim — TRUE, with one wrinkle worth knowing

All five values are present in the Style rail and editable. Proven both ways:
the controls **show the accent's hexes** (Title `#501760`, Stripe background
`#F9F3FB`, Divider colour `#D5BADE`), and one **accepted an edit** — typing
`#008000` into Title colour turned its swatch green and repainted the preview's
title green while the underline stayed plum, so the fields are independently
wired, not decorative.

⚠️ **The wrinkle: two of the five are gated out of view by Header style.** Under
`Plain` — which is what Classic seeds — the rail shows no band control and no
underline control, because neither surface exists under that header style. Switch
Header style to `Banded` and **Background `#F4E8F8`** appears already holding the
accent's value; switch to `Underlined` and **Underline colour `#501760`** appears.
So nothing is lost or unreachable, but "all five swatches are in the rail" is true
only **relative to the header style the merchant is on**. That is the feature-96 /
step-4912f3b gating behaving correctly, not a defect — recorded because D1's
sentence reads as though all five are always visible.

---

## Completion gate

1. ✅ V1 — five hexes in Postgres, read with SQL, matching Plum exactly.
2. ✅ V2 — `basedOnPreset` is `"classic"`, the bare pattern id.
3. ✅ V3 — metaobject `styling` **and** `styling_css.vars` both carry the colours.
4. ✅ V4 — a real product page renders the accent; four live surfaces read by
   `getComputedStyle` and a capture.
5. ✅ V5 — **answered: illegible**, with a capture, a six-accent contrast matrix,
   and the mechanism. Doc 93 §D3 and §Open questions updated to record it.
6. ✅ V6 — the rail holds the accent's five values and accepts an edit; the
   header-style gating wrinkle recorded.
7. ✅ `npm run build` green, suite **1227 / 45 files — unmoved**, which is the
   result this step wanted: no code changed, so no count should have.
8. ✅ Doc 93 at **6 of 6**, §D3 carrying the observation, §Open question 1 closed
   and 2 **re-opened as a decision** rather than closed by silence;
   `context/progress-tracker.md` updated.

✅ **The gate's standing warning is discharged.** "Do not mark the feature
complete while V5 is unanswered" — V5 is answered, in the direction §D3 feared,
and the risk is now a dated finding with numbers instead of a prediction. What is
**not** discharged, and must not be quietly dropped, is the decision it raises.

⚠️ **Do not mark the feature complete while V5 is unanswered.** It is the one item
this feature has been deferring since it was specced, and closing 102 without it would
retire the risk by silence rather than by observation — which is the specific failure
mode doc 93 §D3 warns about ("whichever way this goes, it goes silently").

---

## Deliberately out of scope

- **Re-verifying that colours reach the storefront in general** — feature 57 step 7
  did that. This step watches one accent through, not the mechanism from scratch.
- **A custom hex accent, a Style-rail accent control, tinting the table body,
  contrast checking** — doc 93 §Deliberately out of scope, all unchanged.
- **Any code change.** If one is needed, it belongs to a new step with its own gate,
  and this file records why.
