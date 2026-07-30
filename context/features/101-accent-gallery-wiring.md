# Step 101 — wiring the swatch row to the gallery

**Status:** ✅ **completed 2026-07-30.** Automated gate green (typecheck · lint ·
`format:check` · **1227** tests / 45 files · build); baseline was 1209, so **+18**.
All five mutations run. **Live-verified on the dev store** (`appx-dev`, embedded
admin, Claude-in-Chrome) — all ten gate items closed, including the four debts other
steps left owed.

🔴 **D5's header placement FAILED live and the pre-decided fallback shipped.**
`<div slot="primary-action">` inside `<s-page>` was **silently dropped** — absent
from the DOM and from the accessibility tree, not clipped or hidden. §D5 result.

🔴 **One mutation exposed a hole no test could reach, and the fix was a type change
rather than an assertion.** `galleryHref`'s signature changed from two positional
strings to one named object as a direct result. §Mutation tests.

🔴 **I got one live reading WRONG and corrected it.** I first concluded the title
tint was imperceptible on the Minimal card — which would have undercut doc 93 §D3's
entire justification. It was an artifact of my own zoom crop. §The wrong reading.

**Parent feature:** `93-style-accent-themes.md` (binding design — read it first).
**Position:** step 5 of 6. Previous is `100-accent-swatch-row.md`; next is
`102-accent-live-verification.md`.
**Depends on:** steps 97 (`ACCENT_PRESETS`), 99 (`&accent=` decode) and 100
(`AccentSwatchRow`) — all shipped. Nothing unbuilt.
**Migration:** **none.**
**Merchant-visible:** 🔴 **YES — the first step of this feature a merchant can
see or click.** Everything before it was unreachable by construction.

---

## What this step is

The four wires between things that already exist, plus the first time anyone
**looks** at the feature.

1. `AccentSwatchRow` mounts on the gallery.
2. The gallery holds the selected accent — the one seam feature 88 did **not**
   pre-cut, because the page was a pure function of frozen constants.
3. Each of the five preset cards restyles live from it.
4. Each card's href gains `&accent=<id>`, which step 99's decoder already reads.

**Scope in one line:** the swatch row becomes the thing doc 93's ask described —
"when merchants click on a color, all the preset cards will reflect that theme
color."

⚠️ **This step is where the feature can look wrong for the first time**, and three
of its five completion items are observations rather than assertions. That is not a
weakness in the step; it is the step finally reaching the part no test in 97–100
could reach.

---

## Decisions locked before writing code

### D1 · The accent lives in `useState`, not in the URL

```tsx
const [accentId, setAccentId] = useState<string | null>(null);
```

The route stays **loaderless** (doc 88 D2, pinned by `galleryRouteContract`) — this
is client state only, and `useState` in a route module is fine on a page with no
server data to reconcile.

🚫 **Rejected: holding it in the gallery's own `?accent=` via `useSearchParams`.**
It would survive refresh and the back button, and it costs a navigation on *every
swatch click* — on a page that already reloads five iframes per click — plus either
seven history entries or a `replace: true` that makes the back button behave
differently from every other link on the page.

⚠️ **The accepted cost, stated so it is a decision and not a surprise:** a merchant
who picks Blue, clicks Classic, then presses **back** returns to a gallery showing
Theme. Their choice is gone and the cards are neutral again. Small — the accent is
create-time-only by D1 of doc 93 and is meant to be ephemeral — but it *is* a real
paper cut, and if merchants hit it the fix is the `useSearchParams` version above,
already reasoned through.

### D2 · 🔴 The card previews resolve through `seedStylingFromPreset` — the **same**
function the loader uses

The card currently calls `stylePresetValues(preset)`. It must switch to:

```ts
seedStylingFromPreset(preset.id, accent?.bundle);
```

**This is the zero-drift property, and it is the most valuable line in the step.**
The gallery's whole promise is that the card shows what the template will look
like. If the card merged bundle-and-accent its own way and
`resolveGalleryParams` merged them another, the two could disagree — and *nothing
would fail*, because no test compares a rendered preview against a seeded
template. Routing both through one function makes the disagreement
unrepresentable rather than merely tested. It is the same argument step 92 made for
`resolveGalleryParams` deriving both its outputs from one lookup.

✅ **Behaviour-neutral for Theme**, so the switch carries no risk of changing what
merchants see today: `stylePresetValues(preset)` is `parseStylingValues(preset.bundle)`
and `seedStylingFromPreset(preset.id)` is `parseStylingValues({ ...preset.bundle })`.
Identical output. A test pins that equivalence so the swap is provably a no-op at
`accent = null`.

⚠️ `useMemo`'s dependency array becomes `[preset, accent]`. Missing that is the
defect that makes this whole step silently do nothing: the state would update, the
row would repaint, and five stale documents would sit there.

### D3 · The href is built by a **pure function**, so the wire is testable

```ts
// app/utils/stylePresets.ts — beside resolveGalleryParams, its inverse.
export function galleryHref(
  presetId: string | null,
  accentId: string | null,
): string;
```

🔬 **This is step 100's lesson applied deliberately.** There, extracting
`nextRovingIndex` was the only way to get executable coverage of a component that
cannot be mounted. Here the same move buys something better than coverage — it lets
one test **compose the encoder with the decoder**:

```ts
resolveGalleryParams(new URL(galleryHref(p, a), "https://x").searchParams);
```

That closes the loop end to end without a browser: step 99 built the decode, this
step builds the encode, and the composition proves they agree about the wire format
for **every** preset × accent pair. Neither half can drift without the other
failing. **This is the step's centrepiece test.**

⚠️ It lives in `stylePresets.ts` next to `resolveGalleryParams`, not in the card.
Encoder and decoder of one format belong in one file, where a reader edits both or
neither.

### D4 · Blank's href is untouched — bare `/app/templates/new`

Doc 93 §D4. `BlankStyleCard` never emits an accent param, so it must **not** route
through `galleryHref` with a non-null accent. A test asserts its href stays a
literal, and that no accent state reaches it.

⚠️ The swatch row therefore visibly does nothing for one of six cards. Invisible in
practice — Blank renders no preview either way — and this is the *only* place doc
93 §D4 is enforced, since step 99 deliberately left the parser total.

### D5 · The row mounts in `slot="primary-action"`, with a recorded fallback

Feature 88 seam 5 reserved it (`choose-style/route.tsx:57`: _"Nothing goes in
`slot="primary-action"`: feature 93's accent swatch row is specced into the page
header's right side"_), and Kaching puts it there.

⚠️ **Verify it live before believing it.** That slot is meant for a button, and a
caption plus seven 24px chips is roughly 240px. At `inlineSize="base"` (966px) beside
the short heading "Choose a style" it should fit — but Polaris may style slotted
content in ways a radiogroup does not want, and `<s-page>`'s slots are shadow-DOM
territory ([[polaris-web-component-gotchas]]).

✅ **Fallback, decided now so the live check is a yes/no rather than a redesign:**
put the row inside `styles.gallery`, immediately **above** the existing
`<s-paragraph>`. It reads fine there ("pick a colour, then pick a pattern") and
needs no slot cooperation. Take it if the header placement fights back; record which
one shipped and why.

### D6 · No `aria-live` announcement for the restyle, and the reason matters

Clicking a swatch changes five previews. **Nothing should be announced about that**,
and the silence is correct rather than an omission:

- The previews are `aria-hidden` by step 90's decision (a screen-reader user must
  hear "Minimal — no bands and no rules", not a fake sample's nine rows read five
  times).
- So there is no accessible content that changed.
- The `role="radio"` itself announces the choice — "Blue, selected" — which is the
  complete information a non-visual user needs, because the accent's *effect* is
  something they were never being shown.

🚫 An `aria-live` region saying "previews updated" would announce a change to
content that is deliberately hidden. Recorded because "live region on a live update"
is the reflexive answer, and here it is the wrong one.

---

## 🔬 The measurement this step owes: five-iframe flicker

Feature 88 measured the gallery's five frames at **130.4 ms** to load all five,
24.7 ms first-to-last, 180 KB of `srcDoc`, 0.09 ms to build all five documents in
JS. Doc 93's cost profile says plainly what that does and does not settle:

> The JS cost is negligible and the total is ~7× under the 1 s threshold, so no
> shared-stylesheet fallback is needed — but _flicker on every swatch click_ is a
> distinct question the load measurement does not answer, and step 101 owes it.

An accent click re-memos five documents and assigns five new `srcDoc` values, which
means **five iframe navigations**. The question is what paints in between.

🔍 **A hypothesis worth checking first, because it would make this a non-issue:**
the flash between documents is typically white, the card surface is
`--appx-preset-surface: #ffffff`, and the preview document's own background is
white. **A white flash on a white card may be literally invisible.** Check that
before engineering anything.

**If it does flicker, ranked:**

| Option                                              | Cost                                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Accept it                                           | Free. Legitimate if it reads as a repaint rather than a blink.                                                    |
| Debounce the state by ~50 ms                        | Cheap; only helps a merchant dragging across swatches, not a single click.                                        |
| `postMessage` the new custom properties into frames | 🚫 Requires re-granting `sandbox="allow-scripts"`, which step 90 **removed on purpose**. Do not do this casually. |
| Shared stylesheet instead of `srcDoc`               | A rewrite of the preview pipeline. Out of scope; doc 93 already judged it unnecessary.                            |

⚠️ **Whatever the answer, record the observation with a number or a plain "no
visible flicker at 1× and at 4× CPU throttle".** "Looked fine" is not a
measurement, and this is the one performance question the feature was told to
answer.

---

## Build instructions

| File                                | Change                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `app/utils/stylePresets.ts`         | **add** `galleryHref` beside `resolveGalleryParams`                       |
| `choose-style/route.tsx`            | `useState`, mount the row, pass `accent` to each card                     |
| `choose-style/StylePresetCard.tsx`  | accept `accent`, re-key the `useMemo`, build the href via `galleryHref`   |

`StylePresetCard` takes the resolved `AccentPreset | null`, not an id string — the
route already has the object from `findAccent`, and passing the id would make every
card repeat the lookup.

🚫 **Not edited:** `AccentSwatchRow.tsx` and its stylesheet (step 100 built them to
this interface — if they need changing, step 100's props were wrong and that is the
finding), `rovingRadioKeys.ts`, `stylePresets.ts`'s accent constants, and
`app.templates_.$id/route.tsx` (step 99 already made the loader total).

⚠️ **A hazard specific to this step's files.** `galleryRouteContract.test.ts` and
`StylePresetCardContract.test.ts` strip comments before asserting, and
`galleryRouteContract` uses the **three-rule** strip whose JSX rule over-matches on a
`/** … */` that follows a `{` — the bug that cost step 100 a debugging session (doc
100 §"The strip that ate the file"). Both target files are safe **today**. If this
step adds a doc comment to a destructured prop type in either one, the contract test
will fail claiming the source is missing code it plainly contains. Either avoid that
shape or fix the strip to the two-rule form.

---

## Tests

**The wire, end to end (the centrepiece):**

1. 🔴 **`galleryHref` ∘ `resolveGalleryParams` round-trips for every preset ×
   accent** — 30 pairs plus the null cases, derived from both arrays. Asserts the
   decoded styling carries all five accent hexes and the bundle's structure, and
   that the stamp is the preset id. Neither encoder nor decoder can drift alone.
2. `galleryHref` shape: no `accent` param when the accent is null; no `style` param
   when the preset is null; both when both; `encodeURIComponent` applied to each.
3. 🚫 `galleryHref(null, null)` is bare `/app/templates/new` — no `?`, no `&`. The
   Blank landing, byte-identical to the literal `BlankStyleCard` uses.

**The no-op proof for D2:**

4. `stylePresetValues(preset)` deep-equals `seedStylingFromPreset(preset.id)` for
   every preset — so switching the card's resolver is provably invisible at
   `accent = null`, and the switch is not a silent restyle of today's gallery.

**Contract extensions (source-read, same technique and limits as before):**

5. The route imports and mounts `AccentSwatchRow`, holds `useState`, and passes an
   `accent` prop into the mapped `StylePresetCard`.
6. 🔴 **`useMemo`'s deps include the accent.** The defect that makes the whole step
   do nothing while every other guard passes.
7. The card's href goes through `galleryHref`, and 🔴 **`BlankStyleCard`'s href is
   still the bare literal** with no accent threaded into it (D4).
8. The route still exports no `loader` and no `action` (D1 — the existing guard,
   which must keep passing now that the page has state).

### Mutation tests — ✅ all five run 2026-07-30

| Mutation                                         | Predicted                                   | Observed                                                     |
| ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------ |
| Drop `accent` from the `useMemo` deps            | test 6 fails — and **nothing else**         | ✅ **exactly 1 fails**, and it is that guard                  |
| `galleryHref` emits `&accent=` even when null    | tests 1 + 2 fail                            | ✅ **2 fail**, incl. `expected '…?accent=' to be '…/new'`     |
| Card resolves via `stylePresetValues` again      | the accent never reaches the preview        | ✅ **1 fails**, naming `seedStylingFromPreset(`               |
| Thread the accent into `BlankStyleCard`          | test 7 fails                                | ✅ **2 fail**, incl. the pre-existing `NO style param` guard   |
| Swap `galleryHref`'s params at the **call site** | test 1 fails — the round-trip's real payoff | 🔴 **WRONG — all 119 passed.** See below                      |

✅ **The first row landing on exactly one test is the useful result, not a thin one.**
It confirms what the guard was written for: a stale-`useMemo` gallery highlights its
swatches correctly and never restyles a card — the precise symptom this feature
exists to prevent — and **nothing else in 119 tests notices**. The guard is not
belt-and-braces; it is the only thing there.

---

## 🔴 The mutation that passed, and why the fix was a type

`galleryHref` was written as two positional strings. Transposing them **at the call
site** —

```tsx
to={galleryHref(accent?.id ?? null, preset.id)}
```

— left **all 119 tests green**, while every merchant clicking any card would have
gone to `/app/templates/new?style=blue&accent=classic`. Neither id resolves in the
other's lookup, so both degrade to `null`: **every card would silently create a
blank, unstamped, uncoloured template.** Total feature failure, green suite.

🔬 **The round-trip test cannot see it, and understanding why matters more than the
bug.** It composes `galleryHref` with `resolveGalleryParams`, so it proves the
encoder and decoder agree about the **format**. It says nothing about what a caller
**passes**. I had recorded it in this file as the guard that would catch this, which
was wrong — a composition test covers the seam between two functions, not the seam
between a function and its caller.

✅ **Two changes, in order of what each is worth:**

1. **The signature became one named object** —
   `galleryHref({ preset, accent })`. Two params of identical type is the shape that
   invites transposition; with named keys the mistake cannot be made by accident,
   because the wrong key has to be written beside the wrong value.
   ⚠️ **Not compiler-enforced, and the doc comment says so explicitly** — both
   fields are `string | null`, so `{ preset: accent.id, accent: preset.id }` still
   typechecks. Verified rather than assumed.
2. **A textual backstop in `StylePresetCardContract.test.ts`** pinning the call
   site's key/value pairing. Brittle by nature, which is the right trade at exactly
   one call site for a failure this total. Re-verified: the same mutation now fails.

🔬 **The general lesson: a positional signature whose params share a type is a
defect waiting for a call site, and no amount of testing the function reaches it.**
Prefer named arguments the moment two params could be swapped without a type error.

---

## 🔴 The wrong reading, and how the crop caused it

My first live conclusion was that **the title tint is imperceptible on the Minimal
card** — which, since the title is Minimal's *only* live accent field, would have
meant Minimal shows nothing and doc 93 §D3's whole justification collapses:

> ⚠️ Minimal showing title-only is expected, not a defect — it is precisely why D3
> had to be answered. If D3 had gone the other way, Minimal would show nothing at all.

**It was wrong.** The evidence was a zoom of Minimal's "Overview" under Plum beside
one under Theme; the two looked identical. Re-run with a **tighter crop** (220×27
rather than 175×30 of the same text) and a proper baseline, all three are plainly
distinct: Theme near-black, Terracotta reddish-brown, Plum purple — at 8.8px, at 0.55
card scale.

🔬 **The confound was my measurement, not the design.** A coarser zoom region is
upsampled more aggressively, and the hue in antialiased 8.8px glyphs washes out in
the resampling. The pixels were always there.

⚠️ **This is the same class of error as step 98's stripe probe** (doc 98: "a probe
that hunts for 'the one that differs' has already assumed which element is the
baseline"). Both times my *instrument* produced a false negative about a feature that
worked. The lesson that generalizes: **when a visual check says "no change", suspect
the instrument before the code** — and always capture the baseline through the exact
same instrument, at the exact same settings, in the same session.

✅ **Doc 93's reach table, D3, and the palette all stand unchanged.** Nothing was
altered as a result of this.

---

## Completion gate — ✅ 10 of 10

1. ✅ Clicking a swatch restyles all five preset cards; **Blank is unchanged** (D4
   observed, not just asserted). Verified in both directions — selecting an accent
   and returning to Theme reverts every card.
2. ✅ The href is `/app/templates/new?style=banded&accent=plum` — both params, right
   slots — and following it opens a scaffold whose storefront preview renders a **plum
   band and a plum section title**, matching the Modern card it came from. The
   zero-drift claim, checked end to end by eye.
   🔬 At full editor size the plum ink is unmistakable, which is what made the §"wrong
   reading" correction obvious in hindsight.
3. ✅ All eight test items pass (**+18**, 1209 → 1227); all five mutations run and
   recorded, including the one that passed.
4. ✅ **Flicker: none observed.** Screenshots taken with no wait immediately after a
   click showed fully rendered cards; five rapid keyboard changes in one burst
   produced a consistent final render with **no blank, partial or torn frames** (never
   a mix of two accents across the five cards).
   ⚠️ **Stated limit:** a screenshot cannot capture a sub-frame flash, so this is "no
   visible flicker", not a frame-level measurement. It is consistent with the
   hypothesis this file recorded up front — the card surface and the preview
   document's background are both white, so a reload flash is white-on-white. **No
   mitigation was needed**; the debounce and `postMessage` options stay unused, and
   `sandbox=""` keeps its no-capabilities posture.
5. ✅ **Keyboard-only pass — the debt step 100 could not pay, now paid.**
   - Arrows **move and check** together: 3× Right from Theme lands on Teal, selected.
   - `Home` → Theme.
   - 🔴 **The wrap works live**: `Home` then `Left` lands on **Plum**, the last chip.
     That is `nextRovingIndex`'s negative-modulo path (`-1 → 6`) — the exact case the
     M1 mutation breaks and the property test covers — executing in a real browser.
   - 🔴 **Tab LEAVES the row**: from the selected chip, one Tab moves focus to the
     Modern card, not to the next swatch. **One tab stop, confirmed** — the claim the
     contract test could only infer from a `tabIndex` expression.
   - Tooltips appear on keyboard focus, not only hover (`interestFor` + `<s-tooltip>`).
   - The previews follow every keyboard change, same as clicks.
6. ✅ **Focus ring visible on a tinted chip** — a dark `currentColor` ring, offset
   outside the chip's own accent-toned border, clearly distinguishable from it.
   📌 **A finding about the "dark admin" half:** the admin **chrome** goes dark, but
   the app's own content area stays light regardless, so there is no dark variant of
   this row to check. The ring is therefore dark-on-pale in every admin state. ⚠️ This
   does **not** discharge doc 93 §D3 — that risk is about the merchant's **storefront
   theme**, which this page never renders under, and it remains step 102's.
7. ✅ **Narrow-admin one-column pass — 📌 the debt open since step 92, cleared.**
   At 900px and again at 600px: the grid collapses to one column (the
   `@container (width < 948px)` breakpoint fires), the swatch row fits on one line,
   and **no sideways scroll appears** — the regression step 91 found the hard way.
   Card previews crop rather than shrink, which is step 91's intended behaviour.
8. ✅ **Placement: D5's header slot FAILED; the pre-decided fallback shipped.** See
   below — this is the one design decision the live pass overturned.

### 🔴 D5 result — `<s-page>` silently discards a slotted `<div>`

Built on `slot="primary-action"` exactly as feature 88 seam 5 reserved it. Observed
live: **the row did not render at all.** Not clipped, not off-screen, not
`display: none` — absent from the DOM *and* from the accessibility tree
(`find` for the radiogroup returned nothing).

⚠️ **Same family of surprise as `<s-button-group>` rendering no slot**
([[polaris-web-component-gotchas]]): these elements accept specific children in their
named slots and **discard the rest without warning** — no console error, no fallback.

✅ **Shipped the fallback this file pre-decided**: the row sits inside
`styles.gallery`, immediately above the paragraph. It reads in the order the merchant
works — pick a colour, then pick a pattern — and needs no slot cooperation. One JSX
move, no logic change, and the contract tests were unaffected because none of them
asserted the placement.

🔬 **Deciding the fallback before looking is what made this cheap.** The live pass
turned a redesign into a yes/no; had D5 been left open, discovering the slot failure
would have meant stopping to invent a placement with the dev server running.
9. ✅ Automated gate green: typecheck · lint · `format:check` ("All matched files use
   Prettier code style!") · **1227** tests / 45 files · build.
10. ✅ `context/progress-tracker.md` updated; doc 93's step table shows 🟡, not ✅.

### What shipped, for the live pass to check against

| File                                | Change                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `stylePresets.ts`                   | `galleryHref({ preset, accent })` added beside `resolveGalleryParams`      |
| `choose-style/route.tsx`            | `useState`, one `findAccent`, row in `slot="primary-action"`, `accent` prop |
| `choose-style/StylePresetCard.tsx`  | `accent` prop, `seedStylingFromPreset`, `[preset, accent]`, `galleryHref`  |
| + the three matching test files     | round-trip, no-op proof, contract extensions                                |

🚫 `AccentSwatchRow.tsx` and its stylesheet are **byte-unchanged** — step 100 built
them to this interface and the interface held, which is the small confirmation that
splitting 100 from 101 was the right cut.

✅ **Live verification was required by this step and was done, not deferred.** 102's
subject is the storefront — admin → Postgres → metaobject → rendered table, plus doc
93 §D3's dark-theme observation. Items 4–7 are about the *admin gallery*, which 102
never opens.

### 🔍 One observation for the merchant to weigh, not a defect

The chips read as **pale circles with a coloured ring** rather than saturated dots.
That is D2 working exactly as specified — the fill is the accent's band tone, and
every band tone is above 0.85 luminance by design — and the ring does carry the hue
legibly: graphite, blue, teal, amber, terracotta and plum are all distinguishable at
native size.

⚠️ It is nonetheless **less immediate than a conventional colour picker**, where each
swatch is a solid dot. If the merchant wants that, the cheapest change that keeps the
palette honest is a **diagonal two-tone fill** — band on one half, title tone on the
other — which shows both approved colours at full strength and adds no data. 🚫 Not
changed unilaterally: the two-tone chip was a recorded decision (doc 100 §D2), it
works, and swapping to a saturated fill would stop previewing the band, which is the
biggest surface the accent actually paints.

📌 **Verification route:** the editor and gallery are behind Shopify admin auth, so
this needs Claude-in-Chrome on the `shopify app dev` preview URL, not a bare
headless browser ([[browser-verify-embedded-app]]). Note that wheel-scroll and drag
do not reach the embedded iframe, though clicks and keys do
([[embedded-admin-iframe-automation]]) — which is fine here, since the whole check
is clicks and keys.
