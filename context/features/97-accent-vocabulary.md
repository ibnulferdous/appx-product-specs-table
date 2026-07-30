# Step 97 — the accent vocabulary (`ACCENT_PRESETS`)

**Status:** ✅ **completed 2026-07-30.** Full gate green (typecheck · lint ·
format · **1179** tests / 43 files · build); baseline was 1158, so **+21**. All
four mutation tests run and recorded below. No live verification owed — nothing
this step adds is on screen.

🔴 **One deviation, and it reverses an instruction in this file.** The mutation
list below originally said _"set an accent's underline equal to its border →
nothing fails … do not add a test that forbids it."_ A test **was** added
(`no accent's underline duplicates its border`), because the instruction was
wrong: the only justification for `headerUnderlineColor` being in the accent at
all is that it carries a **different** tone from `borderColor`. If step 98
concludes the border hex is the right underline, the correct move is to **drop the
field from `ACCENT_SCOPED_FIELDS`**, not to write the same value twice. The test
passes vacuously today (the underline tracks the title) and exists for step 98,
which is the step that could plausibly land on the border's hex.

**Parent feature:** `93-style-accent-themes.md` (binding design — read it first;
this file does not restate the finding, the palette rationale, or D1–D7).
**Position:** step 1 of 6. Next is `98-accent-render-harness.md`.
**Depends on:** `app/utils/stylePresets.ts` and `app/utils/tableStyling.ts`, both
shipped. Nothing unbuilt.
**Migration:** **none.**
**Merchant-visible:** **no.** Nothing imports what this step adds.

---

## What this step is

The accent half of the vocabulary, and **nothing else**. After this step the six
accents exist as frozen constants with a tolerant lookup and a comparison scope,
guarded by the same class of tests the bundles already have — but no route parses
a param, no card renders one, and no merchant can reach one.

That is the point of cutting it here. Steps 99 and 101 are two different consumers
of this data; building the vocabulary first means neither carries constant-shaping
work, and this step is verifiable without a browser.

⚠️ **It also lands the D7 correction**, which is the only edit in this step that
touches existing behaviour-adjacent text: three comments currently promise that
feature 93 appends accent colours to `PRESET_SCOPED_FIELDS`. It does not. Fixing
them here — in the same commit that creates the thing they mispredict — is what
stops the next reader from believing them.

**Scope in one line:** six accents × five colour fields, frozen, looked up
tolerantly, and provably disjoint from the structure scope.

---

## Decisions locked before writing code

### D1 · There is **no `theme` entry** in `ACCENT_PRESETS`

"Theme" is the ABSENCE of an accent, exactly as Blank is the absence of a preset.

🚫 It must not be faked into a seventh member with an empty bundle. The precedent
is explicit and load-bearing: `BlankStyleCard` is not a `StylePreset`
(`StylePresetCard.tsx:174`), and for the same reason —
`findAccent(null)` → `null` → `{}` → `DEFAULT_STYLING_VALUES` is _already_ the
"Theme" behaviour, through the code path every invalid input takes. A seventh
member would add a second way to express one state and give the swatch row two
code paths to keep in agreement.

✅ The swatch row renders "Theme" as a hardcoded first option in step 100. That is
a UI fact, not a data one.

### D2 · `ACCENT_SCOPED_FIELDS` — the structure-only rule, mirrored

```ts
export const ACCENT_SCOPED_FIELDS = [
  "headerBgColor",
  "headerUnderlineColor",
  "headerTextColor",
  "stripeBgColor",
  "borderColor",
] as const satisfies readonly StylingFieldName[];
```

The reason this constant exists is the reason `PRESET_SCOPED_FIELDS` does: **prose
does not fail a build.** Feature 93's composition rule ("a bundle sets structure,
an accent sets colour") becomes executable as three guards stated in terms of the
two scopes — every accent sets exactly this list, every member of it is a colour
field, and the two scopes are disjoint.

⚠️ **Field order is the order in `STYLING_FIELD_NAMES`, not the palette's
band/title/border/stripe reading order.** The palette table in doc 93 is
merchant-facing; this list is a comparison scope, and matching the domain's own
order is what lets a test derive it rather than hand-list it.

### D3 · Every accent sets **all five** fields — never a subset

Stricter than the bundle guard, which only forbids setting a field _outside_ its
scope (`stylePresets.test.ts:65`). Accents get an exact-set assertion.

**Why the asymmetry is right.** A bundle legitimately sets a subset — Modern's is
`{}`, because the default already _is_ the banded pattern. An accent has no such
story: a partial accent leaves one surface neutral grey while its neighbours are
tinted, and per doc 93's reach table that inconsistency would be **invisible on
four of the five cards** and appear only on the one preset where that surface is
live. Exactly the class of defect a gallery cannot afford, and exactly the class a
count-based guard misses.

### D4 · The palette is **data, copied byte-for-byte** — never derived at runtime

The six accents were approved from a 1:1 render study, and two of the four roles
were tuned against measured references (Blue's stripe `#f1f6fd` against Best Buy's
`#f1f8ff`). A runtime `hsl()` derivation would produce _similar_ values and
silently discard the approval.

🚫 No hue arithmetic, no `derive(h)` helper, no shared lightness constant. Twenty
four hex literals, frozen, pinned by a test. If a value is ever revised it is a
merchant decision with a date, not a refactor.

### D5 · `headerUnderlineColor` takes the **Title** hex — provisionally

Doc 93 §D5 records this as an assumption owed to step 98, and it must land in the
code **with that provenance attached**, not silently.

```ts
// ⚠️ PROVISIONAL (feature 93 · D5). The palette study rendered banded + stripes,
// where a header has no rule, so it never produced a value for this field.
// The Title hex is a reasoned placeholder — the underline belongs to the header
// and pairs with the title's weight — NOT an approved colour. Step 98 renders
// Accordion under all six accents at 1:1 and locks the real value.
// It must NOT be set equal to `borderColor`: the stylesheet already falls back
// that way (`spec-table.css:205`), so writing the same value twice is a no-op.
```

✅ **Step 98 is expected to change these six values, and that is not rework** —
it is the step doing its job. What step 97 owes is that a reader can tell an
approved value from a placeholder without opening another file.

### D6 · No `normalizeAccentToken`, and no new lookup posture

`findAccent(id)` mirrors `findStylePreset` exactly — never throws, never guesses,
degrades unknown / `null` / `""` / non-string to `null`.

🚫 **No normalize-for-storage twin.** `normalizeStylePresetStamp` exists because
`basedOnPreset` is a **persisted column** that must stay a closed vocabulary
across releases. An accent has **no column** (doc 93 §D7) — its effect lands in
five colour columns that `parseStylingValues` already validates. A second gate
would guard nothing.

---

## Build instructions

All edits are in two files. **No new files.**

### 1 · `app/utils/stylePresets.ts`

Append a new `--- Accents ---` section **after** the existing pattern-comparison
block. Do not interleave it with the bundles.

```ts
export type AccentBundle = Readonly<Partial<StylingValues>>;

export interface AccentPreset {
  /** Stable and URL-safe — carried in `?accent=<id>`. NOT persisted anywhere. */
  id: string;
  label: string;
  bundle: AccentBundle;
}

export const ACCENT_SCOPED_FIELDS = [
  /* D2 */
] as const satisfies readonly StylingFieldName[];
export type AccentScopedField = (typeof ACCENT_SCOPED_FIELDS)[number];

export const ACCENT_PRESETS: readonly AccentPreset[] = Object.freeze([
  /* six, D4 */
]);

export function findAccent(id: string | null | undefined): AccentPreset | null;
```

Every entry `Object.freeze`d, same as the bundles. Order: **Graphite, Blue, Teal,
Amber, Terracotta, Plum** — merchant-facing, and Graphite leads because it is the
near-neutral one, the closest thing to "no accent" among the six.

Each `bundle` carries all five fields per D3, with the four approved hexes from
doc 93 §D5 and the provisional underline per this file's D5.

⚠️ **`AccentBundle` is a distinct type name from `StyleBundle` despite being
structurally identical.** They are two different vocabularies with two different
laws, and a shared alias would make a bundle assignable to an accent parameter
without a type error. Cheap insurance at the one seam
(`seedStylingFromPreset`) where mixing them up produces a silently wrong table.

### 2 · The D7 corrections — three comments, no logic

| Location                     | Currently says                                                                     | Must say                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `stylePresets.ts:60`         | "Append-only. Feature 93 appends the accent's color fields."                       | Colours never join; point at doc 93 §D7 and at `ACCENT_SCOPED_FIELDS`.                                                 |
| `stylePresets.test.ts:83–84` | "so feature 93 has exactly one place to revisit when accent colors join the scope" | The scope is permanently colour-free; the disjointness guard is the pair to this one.                                  |
| `88-style-preset-gallery.md` | "Feature 93 also still appends the accent's colour fields here."                   | Struck through with a pointer to doc 93 §D7 — **amend, do not delete**, the record of the reversal is the useful part. |

🚫 **`PRESET_SCOPED_FIELDS` itself is not edited.** Neither is
`isCustomizedFromPreset`, `presetScopedEquals`, or `isThemeDefault`. If a proposed
change touches any of them, the change is wrong — `stylePresets.ts:392` is correct
as written and D7 is the argument for leaving it alone.

---

## Tests

Extend `app/utils/stylePresets.test.ts` with an `accents` describe block. Reuse
the existing `COLOR_FIELDS` probe (`stylePresets.test.ts:26`) — do not hand-list
colour fields, for the reason its own comment gives.

**The three that carry the composition rule:**

1. **Every accent sets exactly `ACCENT_SCOPED_FIELDS`** — both directions, so a
   missing field fails as loudly as an extra one (D3).
2. **Every member of `ACCENT_SCOPED_FIELDS` is a colour field**, via the probe.
   The mirror-inverse of the existing "the comparison scope contains no color
   field" guard.
3. **The two scopes are disjoint.** `ACCENT_SCOPED_FIELDS ∩ PRESET_SCOPED_FIELDS
= ∅`. This is "structure and colour compose" in one line, and it is the guard
   that fails if anyone ever acts on the three comments D7 corrects.

**The data guards:**

4. Ids unique, non-empty, URL-safe (`encodeURIComponent(id) === id`); labels
   unique and non-empty. Same shape as the preset guards.
5. **The palette pinned byte-for-byte** — all six accents × four approved roles
   as literal hexes (D4). ⚠️ The underline is asserted **separately**, in a test
   whose name says `provisional`, so step 98's revision changes one clearly
   labelled test rather than editing the approved-palette pin.
6. Every accent is a **fixed point of parse-then-serialize**, closing the hole a
   type cannot (an in-range-looking value the parser clamps or rejects). Same
   guard the bundles have — an accent hex failing `HEX_COLOR_PATTERN` would
   otherwise vanish to `null` at runtime with nothing failing.
7. `ACCENT_PRESETS` order pinned (Graphite first), because it is merchant-facing.
8. `findAccent` tolerance: a known id round-trips; `null`, `undefined`, `""`, an
   unknown id, a wrong-cased id and a 10 KB string all → `null`.
9. **No `theme` id exists** in `ACCENT_PRESETS` (D1), and `findAccent("theme")`
   is `null` like any other unknown.

**The merge law, which is the whole reason the vocabulary is split:**

10. For **every** preset × **every** accent,
    `seedStylingFromPreset(preset.id, accent.bundle)` carries all five accent
    colours _and_ every field the bundle set. 30 combinations, derived from the
    two arrays rather than hand-written — so a seventh accent or a sixth preset is
    covered with no edit.
11. `seedStylingFromPreset(preset.id)` with **no** accent still resolves to
    exactly what it does today, with all ten colour fields `null`. The
    zero-config theme-inherit promise, pinned against this step.

**The D7 guard, kept:**

12. The existing "the comparison scope contains no color field" test is **not
    deleted**. Its comment is corrected; its assertion is untouched.

### Mutation tests — ✅ all four run 2026-07-30

Per the project's standing practice — a guard that cannot fail is not a guard.
Each mutation was applied to the real module, the suite run, and the module
restored.

| Mutation                                    | Predicted     | Observed                                                                                             |
| ------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| Drop `headerUnderlineColor` from `graphite` | test 1 fails  | ✅ **3 fail**, diff names `graphite`                                                                 |
| Set `graphite`'s underline = its border     | nothing fails | 🔴 **2 fail** — see the deviation at the head of this file                                           |
| Add `borderColor` to `PRESET_SCOPED_FIELDS` | tests 3 + 12  | ✅ **4 fail**, incl. `is FALSE when only a color changes`                                            |
| Corrupt `blue`'s stripe to a 5-digit hex    | tests 5 + 6   | ✅ **3 fail**, and one names the mechanism: `banded + blue lost stripeBgColor: expected null to be…` |

🔍 **Two of the four over-delivered, and both are worth keeping.**

The `PRESET_SCOPED_FIELDS` mutation took down **`is FALSE when only a color
changes`** — a pre-existing `isCustomizedFromPreset` guard nobody wrote for this
feature. That test _is_ D7's argument, executable: it fails the instant a colour
enters the scope, which means the reversal was already enforced by the suite
before this step named it. The disjointness guard added here is the second lock,
not the only one.

The corrupted-hex mutation printed the exact failure mode the fixed-point test
exists for — `parseStylingValues` **silently dropped the bad value to `null`**, so
without that guard the accent would have shipped a swatch that writes nothing and
paints nothing, with the whole suite green.

---

## Completion gate — ✅ 6 of 6

1. ✅ `ACCENT_PRESETS` exports six accents; `findAccent` is tolerant; the two
   scopes are disjoint by test.
2. ✅ **Nothing imports the new exports.**
   `git grep -l 'ACCENT_PRESETS\|findAccent\|ACCENT_SCOPED_FIELDS' -- app/ extensions/`
   returns `stylePresets.ts` and `stylePresets.test.ts` only.
3. ✅ All three D7 comments corrected (`stylePresets.ts`, `stylePresets.test.ts`,
   and doc 88 — the last **struck through, not deleted**, plus its code-block
   comment). `PRESET_SCOPED_FIELDS` and the four functions that read it are
   byte-unchanged.
4. ✅ The provisional underline is labelled in **both** the module and the test
   name (`carries a provisional underline colour, equal to the title`).
5. ✅ Full gate green: typecheck · lint · format · **1179 tests / 43 files** ·
   build. Baseline 1158, so **+21**.
6. ✅ `context/progress-tracker.md` updated.

⚠️ **No live verification is owed by this step** and none is claimed. There is
nothing on screen to look at; the first observable change is step 101.

🔬 **One shape worth carrying into step 98.** The `--- Accents ---` block sits
**after** the pattern-comparison functions rather than beside the bundles, and
that placement is doing work: a reader scrolling `stylePresets.ts` meets the
structure vocabulary, then the comparison scope that judges it, then the colour
vocabulary that must not enter that scope — the file's own order argues D7.
Interleaving the two would lose it.
