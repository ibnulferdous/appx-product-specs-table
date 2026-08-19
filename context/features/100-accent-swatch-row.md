# Step 100 — the accent swatch row (`AccentSwatchRow`)

**Status:** ✅ **completed 2026-07-30.** Full gate green (typecheck · lint ·
format · **1209** tests / **45** files · build); baseline was 1184 / 43, so **+25
tests, +2 files**. All six mutations run, plus a seventh added after one of them
exposed a weak guard. Five new files, **no existing file edited**.

🔬 **Two findings that cost real debugging time, both recorded below rather than
smoothed over:**

1. **The contract test's own comment-stripping regex silently deleted 2928
   characters of the component**, and the assertions failed as though the component
   were missing code. §"The strip that ate the file".
2. **One of my guards was evadable, and the mutation that evaded it also tripped a
   second guard by accident** — so it *looked* caught. §"The guard that only looked
   like it worked".

**Parent feature:** `93-style-accent-themes.md` (binding design — read it first;
this file does not restate the palette, the reach table, or D1–D7).
**Position:** step 4 of 6. Previous is `99-accent-seed-path.md`; next is
`101-accent-gallery-wiring.md`.
**Depends on:** step 97's `ACCENT_PRESETS` (shipped). Nothing unbuilt.
**Migration:** **none.**
**Merchant-visible:** **no.** Nothing mounts this component. The gallery gets it in
step 101.

---

## What this step is

The control, and nothing it controls. After this step a `<AccentSwatchRow>` exists,
is keyboard-operable, is announced correctly, and is imported by nobody.

**Scope in one line:** seven radios — "Theme" plus six accents — as a real
WAI-ARIA radiogroup, with the selected state legible without colour.

🚫 **Not in this step:** the gallery's client state, the cards' `accent` prop, the
`&accent=` hrefs, and the five-iframe flicker measurement. All step 101.

---

## 🔴 The finding that reshaped this step

**A real radiogroup with roving tabindex already exists in this codebase, it has
ZERO tests, and there is no tooling to test one.** All three facts were checked
before writing this file, and together they decide the step's shape.

### 1 · `SegmentedControl.tsx` is already the thing this step needs

`app/routes/app.templates_.$id/SegmentedControl.tsx` is a full WAI-ARIA radiogroup:
`role="radiogroup"` + `role="radio"`, `aria-checked`, roving `tabIndex`, and
arrows / Home / End moving **and** checking. Its own header comment argues against
what this step is about to do:

> Lives in its own module rather than inside `EditorShell.tsx` so every segmented
> group in the editor is one control … **a second, divergent copy is exactly what
> this prevents.**

`EditorShell` mounts it twice — the tab group and the device toggle.

### 2 · It cannot be reused as-is, for two reasons that are not style preferences

- **`SegOption.icon` is required and typed `SIconType`** (`<s-icon type>`'s own
  union). A swatch is a colour, not an icon; there is no member to put a hex in.
- **It imports the tripwired `SpecTableEditor.module.css`**, whose rule is stated
  in the file: _"importing that module is fine, changing it is not."_ A swatch chip
  needs new CSS. Widening the control means either editing a tripwired stylesheet
  or a second stylesheet fighting `.segBtn` for the same elements.

The presentations are genuinely different — a grey track with a white active pill
versus colour chips — and only the **behaviour** is identical.

### 3 · 🔴 `SegmentedControl` has no test at all, and none is possible today

- `grep -rn "SegmentedControl\|segBtn" app/ --include=*.test.*` finds **nothing**.
  (⚠️ A first pass appeared to find two matches. Both were the substring **"roving"
  inside the word "improving"**. Worth recording: a grep for a short behavioural
  term will happily match prose, and "there is a test" was the wrong conclusion for
  ten seconds.)
- `vitest.config.ts` is `environment: "node"`, and says so on purpose: _"A jsdom
  project gets added later only if/when component tests are introduced."_
- **`jsdom`, `happy-dom` and `@testing-library/react` are not installed.**

So the editor's tab group and device toggle — live, merchant-facing, on every
editor render — have **no automated coverage of their keyboard behaviour**, and
adding it is a testing-phase decision (new environment, new dependencies), not
something to smuggle into a step that adds one component.

### ✅ The resolution

**Extract the pure arithmetic, not the component. Do not touch
`SegmentedControl` in this step.**

| Option                                          | Verdict                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Widen `SegmentedControl` to take a swatch visual | 🚫 Fights the tripwired stylesheet, couples the gallery to the editor's CSS.                                                                                   |
| Extract the whole control into a shared base     | 🚫 Refactors two untested live controls with no way to verify. Wrong risk for a step that ships nothing visible.                                               |
| Copy the keyboard logic into the new component    | 🚫 Two divergent implementations of the exact thing `SegmentedControl`'s comment forbids.                                                                      |
| **Extract the index arithmetic to a util**        | ✅ The part where the bugs live becomes **node-testable today**, the duplication shrinks to React glue, and no live control is touched.                        |

```ts
// app/utils/rovingRadioKeys.ts — framework-free, no React, no DOM.
export function nextRovingIndex(
  key: string,
  current: number,
  count: number,
): number | null;
```

`null` means "not a key this control handles" — the caller's cue to skip
`preventDefault` and let the event through. Wrap-around included; `count` of 0 and
a `current` of `-1` (nothing selected) must both be total.

🔬 **Why this specific line is worth a module.** It carries
`((index % count) + count) % count`, the negative-modulo idiom that silently
returns `NaN` or a negative index when it is got wrong, and it is the only part of
a radiogroup that is *pure*. Everything else is refs and focus calls that need a
DOM. Extracting it is what lets step 100 ship **real behavioural coverage** rather
than only the file-reading contract tests this area has had to settle for.

⚠️ **Recorded as explicit debt, not silently:** `SegmentedControl` keeps its own
`switch`. Swapping it to `nextRovingIndex` is a two-line mechanical change that
belongs in the step that can *verify* it — i.e. after a jsdom project exists. It is
listed under "Deliberately out of scope" so it is a decision with a reason and not
an oversight.

---

## Decisions locked before writing code

### D1 · `value: string | null` — `null` **is** "Theme"

```tsx
<AccentSwatchRow value={accentId} onChange={setAccentId} />
// value: string | null      — null means Theme
// onChange: (next: string | null) => void
```

🚫 **The component must not invent a `"theme"` sentinel string.** Step 97 D1
forbade a seventh `ACCENT_PRESETS` member with an empty bundle, for a reason that
applies with equal force to a magic value in the props:

> A seventh member would add a second way to express one state and give the swatch
> row two code paths to keep in agreement.

`null` is already what `findAccent` returns for "no accent" and what
`resolveGalleryParams` leaves the colours at. One representation, end to end, from
the URL through the props to the five colour columns. A test asserts the string
`"theme"` appears nowhere as a value.

✅ "Theme" is still rendered **first and pre-selected** (D5) — as a hardcoded
element before the map, which is the UI fact step 97 said it was.

### D2 · The chip is **two-tone**: the band fills it, the title rings it

Six chips filled with `headerBgColor` alone would be six near-white circles — the
palette's band tones run `#ddf3ee` to `#fbeeda`, all of them ≥ 0.85 luminance.
Filling with `headerTextColor` alone gives six dark inks and throws away the pairing
the merchant is actually choosing.

**So: `headerBgColor` as the fill, `headerTextColor` as the ring.** Both come from
the accent's own bundle — 🚫 **no new constant, no seventh colour role.** It also
previews the real pairing: what the merchant sees in the chip is the band-plus-title
combination that lands on the card.

⚠️ **"Theme" gets no colour at all** — a neutral dashed chip, borrowing the
vocabulary the gallery already uses for `BlankStyleCard`'s dashed plate. The two mean
the same thing in two places ("nothing added"), and they should look related.

### D3 · 🔴 The selected state must be legible **without colour**

WCAG 1.4.1. A chip that is only "the one with a thicker ring in a slightly different
tone" is a colour-only state, and this control's entire content is colour.

**Required: a non-colour indicator on the selected chip** — a checkmark glyph inside
it, plus an outline offset from the chip. Not a size change alone (invisible at one
glance across seven items) and not a ring alone (that is what the accent's own title
tone already draws). A contract test asserts the indicator element exists.

⚠️ `aria-checked` covers assistive tech and does **nothing** for a sighted merchant
with low colour discrimination. The two are separate requirements; satisfying one is
not evidence about the other.

### D4 · Accessible name from the label; the visible chip carries no text

Seven labelled chips do not fit the page-header slot doc 88 reserved, and the
merchant is choosing a **colour** — which they can see. The **name** matters only to
AT.

Follow the codebase's own icon-only pattern exactly (`SegmentedControl`'s
`hideLabel` segments): `aria-label` on the button, plus an `<s-tooltip>` targeted by
`interestFor` so a sighted mouse user can still get "Terracotta".

### D5 · Focus and motion follow the gallery's existing conventions

Not invented here — copied from `StylePresetCard.module.css`, which is the
stylesheet next door:

- `:focus-visible` only, with `outline-offset`, so a pointer click leaves no ring
  (`StylePresetCard.module.css:119`).
- Any transition wrapped in `@media (prefers-reduced-motion: reduce)`
  (`StylePresetCard.module.css:212`).

⚠️ **The focus ring must not be one of the palette's own tones.** A ring drawn in
the accent's colour is invisible on the chip it surrounds. `currentColor` at the
row's text colour, offset outside the chip — same as the card's.

---

## Build instructions

Three new files. **No existing file is edited.**

| File                                                     | What                                                      |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `app/utils/rovingRadioKeys.ts`                           | `nextRovingIndex`, framework-free                          |
| `app/routes/.../choose-style/AccentSwatchRow.tsx`         | the radiogroup                                             |
| `app/routes/.../choose-style/AccentSwatchRow.module.css`  | chip, ring, checkmark, focus, motion                       |

The component maps `ACCENT_PRESETS` — ⚠️ **never a hand-listed seven.** Swatch order
is merchant-facing and is recorded in the array's literal order (step 97: Graphite
leads because it is the near-neutral one). Enumerating them here would copy that
decision into a second place nothing keeps in agreement, exactly as
`choose-style/route.tsx:74` says about the cards.

Colour values reach CSS as **custom properties set inline from the bundle**
(`style={{ "--chip-fill": accent.bundle.headerBgColor }}`), not as class names. Ten
palette classes in a stylesheet would be the same "palette as data" violation step
97 D4 rejected `hsl()` derivation for — the hexes live in `ACCENT_PRESETS` and
nowhere else.

---

## Tests

### 1 · `app/utils/rovingRadioKeys.test.ts` — real behaviour, in node

The first genuinely behavioural coverage in this feature area. Exhaustive, because
the function is small enough to be:

- `ArrowRight` / `ArrowDown` → +1; `ArrowLeft` / `ArrowUp` → −1; `Home` → 0;
  `End` → `count - 1`.
- **Wrap in both directions**, which is the whole reason the module exists: from
  the last index forward → 0, and from index 0 backward → `count - 1` (**not** −1).
- Unhandled keys → `null`: `Tab`, `Enter`, `" "`, `"a"`, `"ArrowRightt"`, `""`.
  ⚠️ Returning `0` instead of `null` for an unhandled key would silently make Tab
  select the first swatch, which is why the miss case is asserted by name.
- Totality: `count = 1` (every key returns 0), `count = 0`, `current = -1`
  (nothing selected — `ArrowRight` must land on a real index, never `NaN`), and a
  `current` out of range.
- 🔴 **No result is ever negative, `NaN`, or `>= count`** — stated as a property
  over a swept matrix of keys × counts × currents, so it holds for inputs nobody
  enumerated. This is the negative-modulo guard.

### 2 · `AccentSwatchRowContract.test.ts` — structure, read off disk

Same technique and same reason as `StylePresetCardContract.test.ts` (jsdom cannot
render Polaris web components, and per the finding above it is not installed at
all). **Comments stripped first** — this file's subject matter is `role="radio"`,
`aria-checked` and `aria-label`, and the component narrates all three in prose; a
guard that counts its own documentation passes vacuously.

- `role="radiogroup"` with an `aria-label`, and `role="radio"` + `aria-checked` on
  the options.
- **Roving tabindex present** (`tabIndex={` … `? 0 : -1}`), not `tabIndex={0}` on
  every option — seven tab stops in a row is the classic wrong build of this
  control.
- The keyboard handler routes through `nextRovingIndex` — i.e. the file contains no
  second `case "ArrowRight"` of its own. The anti-duplication guard for the finding
  above.
- **`ACCENT_PRESETS` is mapped, not hand-listed**, and no palette hex appears as a
  literal in either the component or its stylesheet. Derived: assert every
  `bundle.headerBgColor` string is absent from both files. A seventh accent is
  covered with no edit.
- **"Theme" is hardcoded before the map** and is not an `ACCENT_PRESETS` member.
- 🚫 The string `"theme"` never appears as a value (D1).
- The non-colour selected indicator exists (D3).
- `:focus-visible` and `prefers-reduced-motion` both present in the stylesheet
  (D5) — cheap, and both are the kind of thing that gets dropped in a rewrite.

### Mutation tests — ✅ all six run 2026-07-30, plus a seventh

| Mutation                                        | Predicted                          | Observed                                                                |
| ----------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `((i % n) + n) % n` → `i % n`                   | the no-negative property fails     | ✅ **4 fail**, incl. `ArrowRight @ -2 of 2: expected -1 …` and a `-0`/`+0` |
| Unhandled key returns `0` instead of `null`     | the miss-case test fails           | ✅ **1 fails**: `Tab: expected +0 to be null`                            |
| `tabIndex={0}` on every option                  | the roving-tabindex contract fails | ✅ **1 fails**, precisely                                                |
| Drop the checkmark, keep the ring               | the D3 indicator test fails        | ✅ **1 fails**                                                           |
| Hand-list one accent's hex in the CSS           | the no-literal-hex test fails      | ✅ **2 fail**, one naming `blue: #e6effc leaked into the stylesheet`      |
| A `"theme"` sentinel instead of `null`          | the D1 test fails                  | ⚠️ **1 fails — but for the wrong reason.** See below                     |
| **(added)** sentinel in the COMPARISON only     | —                                  | ✅ fails the rewritten count-based guard                                 |

🔬 **The `-0` in the first row is a small gift.** With `count = 1`, the broken
`index % count` returns `-0` for ArrowLeft, and `toBe` uses `Object.is`, so
`expected -0 to be +0` failed where `==` would have passed. Not designed for; worth
knowing that `toBe` catches signed-zero and a looser matcher would not.

---

## 🔴 The guard that only looked like it worked

The D1 mutation was meant to prove the "no `theme` sentinel" guard. It **did** turn
the suite red — and inspecting *which* assertion failed is what showed the guard was
weak.

The guard was three negative patterns:

```ts
expect(body).not.toMatch(/===\s*"theme"/);
expect(body).not.toMatch(/value\s*===\s*"theme"/);
expect(body).not.toMatch(/id:\s*"theme"/);
```

The mutation changed two things — the comparison **and** the option's `id`. Only
`id: "theme"` fired. The comparison half was
`(option.id ?? "theme") === (value ?? "theme")`, which has **no `===` directly
followed by the literal**, so all three patterns missed it. A mutation that touched
the comparison *alone* would have passed the suite with a sentinel live in the
selection path.

✅ **Rewritten to count, not to pattern-match.** The literal cannot be eliminated —
`null` is not usable as a React key or an element-id fragment — but it can be
confined to one named helper:

```ts
const domKey = (id: string | null) => id ?? "theme";
```

The guard now asserts `"theme"` appears **exactly once** in the stripped source, and
that the one occurrence is that helper. Verified against the previously-evasive
mutation: `expected [ '"theme"', '"theme"' ] to have a length of 1`.

🔬 **The lesson, and it generalizes past this file:** _a pattern guard enumerates
the spellings someone has thought of; a count covers the ones they have not._ The
near-miss was only visible because the mutation's failure was **read** rather than
counted — "1 test failed, as predicted" was the wrong level of detail to stop at. It
also improved the component: three copies of `?? "theme"` became one.

---

## 🔴 The strip that ate the file

Five of the contract test's assertions failed on strings that were plainly in the
component — `nextRovingIndex(`, `next === null`, `ACCENT_PRESETS.map(`,
`label: "Theme"`, `string | null`.

The component was fine. **The test's own preprocessing was deleting them.** I had
copied the three-rule comment strip from `createFlowContract.test.ts`, whose first
rule targets JSX comments:

```js
.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
```

This component destructures its props with an inline type literal whose first member
carries a doc comment:

```tsx
}: {
  /** The selected accent id, or `null` for "Theme" (the pre-selected default). */
  value: string | null;
```

`}: {` + newline + `/**` matches the opening `\{\s*\/\*`. That comment's `*/` is
**not** followed by `}`, so the lazy quantifier backtracks *forward* to the next
`*/}` anywhere in the file — and swallows everything between. Measured: **one match,
2928 characters**, versus the ~60–870 of the three real JSX comments.

✅ **Fix: strip block comments only** — the two-rule form
`StylePresetCardContract.test.ts` already uses, which is the file this one was
modelled on. `/* … */` non-greedy has no `}` to backtrack toward, and it turns
`{/* … */}` into a harmless `{}`.

⚠️ **The dangerous part is the failure mode, not the bug.** The assertion messages
said "the source does not contain `nextRovingIndex(`" — which reads as *the component
is wrong*. I spent the first minutes looking at the component. The tell was that
five unrelated assertions failed at once while a sixth on the same file passed.

📌 **`createFlowContract.test.ts` is not broken and was not touched** — neither file
it reads has a `/** */` after a `{`. But the idiom is a trap for the next contract
test that copies it, so the warning is recorded **in the new test file itself**, at
the point where someone would copy the wrong version.

---

## Completion gate — ✅ 8 of 8

1. ✅ `nextRovingIndex` exists, is framework-free (no React, no DOM), and is tested
   exhaustively — including the swept no-negative/no-`NaN`/in-range property.
2. ✅ `AccentSwatchRow` renders seven radios — Theme first and pre-selected — with
   `ACCENT_PRESETS` mapped and **no palette hex in either the component or its
   stylesheet**, asserted by iterating the real bundles.
3. ✅ The selected state is legible without colour (checkmark glyph + offset
   outline), and `aria-checked` is asserted as a **separate** claim.
4. ✅ **`SegmentedControl.tsx` and `SpecTableEditor.module.css` are byte-unchanged**
   — `git status --short` names neither. The extraction is the util only.
5. ✅ **Nothing imports `AccentSwatchRow` or `nextRovingIndex`.** A grep across
   `app/` returns the four new files and nothing else. ⚠️ Note `git grep` is
   useless for this check until the files are committed (they are untracked, so it
   silently returns nothing and looks like a pass) — use a plain content search.
6. ✅ Six mutations run and recorded, plus a **seventh** added because one of the six
   exposed a weak guard.
7. ✅ Full gate green: typecheck · lint · `format:check` ("All matched files use
   Prettier code style!") · **1209** tests / 45 files · build.
8. ✅ `context/progress-tracker.md` updated; doc 93's step table flipped.

⚠️ **One TS hole hit and handled, not worked around blindly.** `interestFor` is not
in React's typings for a native `<button>` (TS2322 on the whole element). Attached
via a spread, which skips excess-property checks — the identical workaround
`SegmentedControl` documents, for the identical reason. Not a new hack; the same one,
cited.

⚠️ **What this step CANNOT verify, stated plainly rather than left implied.** With
no jsdom, the contract test reads source text: it can see that a roving `tabIndex`
expression is present and cannot see that **arrow keys actually move focus**. The
arithmetic is covered; the wiring between the arithmetic, the refs and `.focus()`
is not. Nor can any test here see that seven chips are distinguishable by eye, that
the checkmark is visible against a pale band, or that the focus ring shows on a
tinted chip.

**All of that is owed to step 101**, which is when the row first appears on screen —
and it must include a **keyboard-only pass** (Tab reaches the row once, arrows move
within it, Home/End jump) and a **dark-admin check of the focus ring**, neither of
which any assertion in this step can stand in for.

---

## Deliberately out of scope

- **Swapping `SegmentedControl` to `nextRovingIndex`** — the finding above. Two
  mechanical lines, deferred until a jsdom project makes the change verifiable on
  two live merchant-facing controls that have no coverage today.
- **Adding jsdom / `@testing-library/react`** — a testing-phase decision with its
  own dependencies, not a side effect of one component.
- **Mounting the row, restyling the cards, `&accent=` hrefs** — step 101.
- **A custom hex swatch** — doc 93 §D5, deferred not rejected.
