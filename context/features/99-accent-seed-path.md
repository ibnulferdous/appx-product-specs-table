# Step 99 — the accent seed path (`&accent=` → resolved styling)

**Status:** ✅ **completed 2026-07-30.** Full gate green (typecheck · lint ·
format · **1184** tests / 43 files · build); baseline was 1179, so **+5** (six new
tests, one replaced). All five mutations run and recorded below.

✅ **The seam held exactly as feature 88 predicted.** `git diff --stat` for the
whole step is **two files**, both under `app/utils/`. The editor route is
byte-unchanged and `createFlowContract.test.ts` passes untouched — the accent
arrived as one line inside `resolveGalleryParams`, with no call-site change
anywhere.

🔴 **One prediction in this file was WRONG, and the mutation table below records
it rather than the prediction.** M5 (swap the merge order) was predicted to fail
nothing. It fails a pre-existing test — see the finding under the table. The
comment this file told me to write about it had to be corrected before the gate.

**Parent feature:** `93-style-accent-themes.md` (binding design — read it first;
this file does not restate the finding, the palette, or D1–D7).
**Position:** step 3 of 6. Previous is `98-accent-render-harness.md`; next is
`100-accent-swatch-row.md`.
**Depends on:** step 97's `ACCENT_PRESETS` / `findAccent` (shipped, `→ 1179`) and
feature 88 step 92's `resolveGalleryParams` (shipped, live-verified). Nothing
unbuilt.
**Migration:** **none.** An accent writes five columns that already exist.
**Merchant-visible:** **no.** Nothing generates a URL with `&accent=` yet — that
is step 101. This step makes a hand-typed one work.

---

## What this step is

The seam feature 88 cut at `stylePresets.ts:351` closes here:

> ⚠️ Takes `URLSearchParams`, not a `string`, on purpose: feature 93's route
> contract is `?style=<id>&accent=<token>` with the two independently optional.
> **The accent read is one line INSIDE this function when it lands, and no call
> site changes.**

That prediction is the thing this step tests. **One line of new logic, and the
editor route must come out byte-unchanged** — if `app.templates_.$id/route.tsx`
needs an edit, the seam did not work and this file has to say so.

**Scope in one line:** `?accent=<token>` becomes five colours on the scaffold the
editor opens, through the merge order that has been law since step 92.

🚫 **Not in this step:** the swatch row (100), the gallery's client state and the
cards' `&accent=` hrefs (101), and therefore anything a merchant can click.

---

## Decisions locked before writing code

### D1 · The return shape does **not** change — no accent comes back out

```ts
{ styling: StylingValues; basedOnPreset: string | null }
```

An accent has **no provenance column** (doc 93 §D7), so there is nothing for a
third field to carry and nowhere for a caller to put it. The token is consumed
and discarded; its whole effect is five real colour values inside `styling`.

🔴 **`basedOnPreset` must not move when the accent moves.** It names the
_pattern_. A resolver that stamped `"classic+blue"`, or stamped the accent when no
style was given, would corrupt a column that is read back as a closed vocabulary
across releases. A test pins the stamp constant across all seven accent states.

### D2 · The parser stays **total** — `?accent=` without `?style=` works

Doc 93 §D4 (Blank ignores the accent) is a decision about **the card's href**, not
about this function. The Blank card simply never emits the param.

So `?accent=blue` alone resolves to `DEFAULT_STYLING_VALUES` **plus five
colours**, with a `null` stamp. ⚠️ **This is the one behavioural surprise in the
step:** before it, `basedOnPreset === null` implied "byte-identical to bare
`/new`", and step 92's central guard was written on exactly that shortcut. It is
no longer true, and D5 below is how the guard is repaired rather than weakened.

Rejected: rejecting the combination, or ignoring the accent when the preset is
absent. Both add a validation branch to buy nothing — the gallery never generates
that URL, so only a hand-typed one reaches it, and a working theme-coloured blank
table is a fine answer to a hand-typed URL. Making it conditional also costs the
"one line, no call-site change" property this step exists to demonstrate.

### D3 · Everything invalid degrades, same posture as `?style=`

`findAccent` is already tolerant (step 97 D6). An absent param, `""`, an unknown
token, a wrong-cased id, `theme`, a padded value and a 10 KB string all → `null` →
`{}` → no colours. **No throw, no 404, no redirect, no toast** — the param is not
merchant-authored, so a bad one means a stale bookmark or a token dropped in a
later release.

### D4 · The merge stays inside `seedStylingFromPreset`

`resolveGalleryParams` passes the accent through; it does **not** spread the two
bundles itself. Step 92's own comment says why:

> Routed through `seedStylingFromPreset` rather than `parseStylingValues`
> directly, because that function is where the bundle/accent merge ORDER lives.
> Bypassing it would mean retrofitting the merge in two places.

### D5 · 🔴 Step 92's central guard is **restated, not relaxed**

`never seeds without stamping, and never stamps without seeding` currently reads:
_if the stamp is null, the styling must equal `DEFAULT_STYLING_VALUES`_. Its input
matrix already contains `"accent=blue"`, which this step makes **fail** — correctly,
because the styling is no longer the defaults.

The lazy repair is to delete `"accent=blue"` from the matrix. That would throw
away the guard's whole point, which is that a resolver splitting its two outputs
across two lookups fails **however** it drifts.

✅ **The repair is to state the invariant in two halves, one per scope:**

| Half      | Scope                  | Must equal                                          |
| --------- | ---------------------- | --------------------------------------------------- |
| Structure | `PRESET_SCOPED_FIELDS` | the stamp's bundle resolved — the stamp explains it  |
| Colour    | `ACCENT_SCOPED_FIELDS` | the accent's bundle, or all-`null` when there is none |

**This is only possible because step 97 proved the two scopes disjoint.** With no
overlap, "the stamp explains the structure" survives accents completely untouched
— the colour half cannot reach into it. The disjointness guard stops being a
tidiness assertion here and starts being the thing that lets a stronger invariant
be written. Worth noticing: step 97's third test was justified as executable prose,
and its first real payoff is two steps later.

The restated guard is **strictly stronger** than the original: it pins every
structure field individually rather than accepting a whole-shape match, and it
adds a colour-half claim the original had no vocabulary for.

---

## Build instructions

Two files. **No new files. No route change.**

### 1 · `app/utils/stylePresets.ts` — the one line

```ts
export function resolveGalleryParams(params: URLSearchParams): {
  styling: StylingValues;
  basedOnPreset: string | null;
} {
  const preset = findStylePreset(params.get("style"));
  const accent = findAccent(params.get("accent")); // <- the step
  return {
    styling: seedStylingFromPreset(preset?.id, accent?.bundle),
    basedOnPreset: preset?.id ?? null,
  };
}
```

⚠️ **`accent?.bundle` is `undefined` on a miss, and that is deliberate** — it
lands on `seedStylingFromPreset`'s `= {}` default. Writing `accent?.bundle ?? {}`
would duplicate a default the signature already owns, and give two places to keep
in agreement about what "no accent" means.

Rewrite the doc comment's forward-looking `⚠️` paragraph (`stylePresets.ts:351`)
into the present tense, and keep the sentence about `URLSearchParams` — it is now
a fact with evidence rather than a plan.

⚠️ **The "everything invalid degrades" paragraph needs a correction, not just an
extension.** It currently claims every invalid input produces
"`DEFAULT_STYLING_VALUES` + a `null` stamp — byte-identical to the 'Blank' card's
landing". Per D2 that is now false for `?accent=blue`: null stamp, non-default
styling. The comment must say so, or it becomes the next reader's wrong belief.

### 2 · The `AccentBundle` overclaim — correct it at the seam that uses it

Step 97 wrote, at `stylePresets.ts:453`:

> **Deliberately a separate type name.** … a shared alias would let a bundle pass
> as the `accent` argument to `seedStylingFromPreset` with no type error.

🔴 **That is false, and this is the step that discovers it**, because this is the
first non-test caller of the two-argument form. TypeScript is structural:
`AccentBundle` and `StyleBundle` are both `Readonly<Partial<StylingValues>>`, so
they are **mutually assignable** and a `StyleBundle` passes as an `accent` with no
error. Verified with `tsc --noEmit --strict` on a two-alias reduction — exit 0, no
diagnostic.

The separate name is worth keeping — it names two vocabularies with two different
laws, and it is what the exact-set test is stated about — but it must stop
claiming enforcement it does not provide. Two edits:

- Correct the comment: the name is **documentation**, the guard is the test.
- Type `seedStylingFromPreset`'s second parameter `AccentBundle`, since the
  parameter is called `accent` and that is what every caller passes. Type aliases
  hoist, so the forward reference to a type declared lower in the file is fine.
  This adds no enforcement either; it makes the signature agree with the prose.

🚫 **What is NOT edited:** `PRESET_SCOPED_FIELDS`, `ACCENT_SCOPED_FIELDS`,
`ACCENT_PRESETS` and its hexes, `findAccent`, `findStylePreset`,
`presetScopedEquals`, `isCustomizedFromPreset`, `isThemeDefault`, and
`app/routes/app.templates_.$id/route.tsx`. If a proposed change touches the route
file, the seam claim in "What this step is" has failed and the failure is the
finding.

---

## Tests

All in `app/utils/stylePresets.test.ts`, inside the existing
`resolveGalleryParams` describe block. Import `ACCENT_PRESETS` /
`ACCENT_SCOPED_FIELDS` / `findAccent` — already imported by step 97.

**The merge law at the route boundary:**

1. **Every preset × every accent through a real query string.** 30 combinations
   derived from the two arrays. ⚠️ Assert against the **bundle's own entries and
   the accent's own entries**, NOT against `seedStylingFromPreset(...)` — routing
   the expectation through the same helper the implementation calls makes the test
   agree with a broken merge. Two claims per combination: every key the bundle set
   still holds the bundle's value, and all five accent hexes are present literally.
2. **`&accent=` with no `&style=`** (D2): five colours land, the stamp is `null`,
   and every `PRESET_SCOPED_FIELDS` value equals its default. The test that fails
   if anyone "fixes" D4 in the parser.

**The restated invariant (D5) — replaces the `null stamp ⇒ defaults` shortcut:**

3. `never seeds without stamping, and never stamps without seeding`, in two halves
   per the D5 table, over a matrix extended with accent garbage: `accent=blue`
   alone, `style=zzz&accent=blue`, `style=classic&accent=zzz`,
   `style=classic&accent=Blue`, `accent=theme`, `accent=` + 10 KB, a repeated
   `accent` key, and all 30 valid pairs.

**Tolerance and identity:**

4. Every invalid accent token is **indistinguishable from no accent param at all**,
   for a fixed style: `""`, unknown, wrong case, `theme`, padded, 10 KB → deep-equal
   to `resolve("style=classic")`. One assertion, six inputs, the whole of D3.
5. A repeated `accent` key takes the **first** value (`URLSearchParams.get`
   semantics, same as `style`).
6. 🔴 **The stamp is constant across all seven accent states** for a fixed style
   (six accents + no accent). D1's column-safety claim, executable.
7. **No accent ⇒ all ten colour fields `null`**, at the route level. The
   zero-config theme-inherit promise, pinned where the URL enters rather than only
   on `seedStylingFromPreset`.

⚠️ **Two existing tests change and neither is deleted.**
`ignores unrelated params, "accent" included (feature 93 seam)` is the assertion
its own comment nominated: _"`accent` is not read yet. When it is, this assertion
is the one that changes."_ It becomes the unknown-accent case of test 4, keeping
the `foo=1` half. And test 3 above is the same test as step 92's, restated.

### Mutation tests — ✅ all five run 2026-07-30

Per standing practice — a guard that cannot fail is not a guard. Each mutation was
applied to the real module, the suite run, and the module restored.

| Mutation                                                    | Predicted                        | Observed                                                                |
| ----------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| Drop the `accent?.bundle` argument (back to step 92)        | tests 1, 2, 3 fail               | ✅ **4 fail** (also the repeated-key test)                              |
| Read `params.get("style")` for the accent (copy-paste slip) | test 1 fails, naming a preset id | ⚠️ **4 fail** — under-predicted, see below                              |
| `preset ? findAccent(...) : null` (D4 in the parser)        | test 2 fails, alone              | ⚠️ **3 fail** — under-predicted; test 2's message is `expected 'teal'…`  |
| Return the accent id in `basedOnPreset` when no style       | tests 3 + 6 fail                 | ✅ **3 fail**, incl. `expected 'graphite' to be null`                    |
| **Swap the merge order** to `{ ...accent, ...bundle }`      | 🔴 nothing fails                 | 🔴 **WRONG — 1 fails**, and it is the right one                         |

🔴 **M5 falsified this file's own reasoning, and the correction is the finding.**
The prediction was that with the two scopes disjoint no bundle and accent ever
collide, so the merge order is unenforceable over real data. The first half is
true — the swap is a no-op on all 30 shipping combinations. The conclusion was
wrong, because one pre-existing test does not use real data:

```ts
// stylePresets.test.ts — written in step 92, before ACCENT_PRESETS existed
seedStylingFromPreset("minimal", {
  headerBgColor: "#112233",
  sectionHeaderStyle: "BANDED", // <- a STRUCTURE field. No real accent may set this.
});
```

**It fabricates the collision on purpose.** `sectionHeaderStyle` is in
`PRESET_SCOPED_FIELDS`, so a real accent is forbidden from carrying it — which is
exactly why a synthetic one has to, if the precedence law is to be testable at all.
The mutation fails that test and nothing else: precise, and the only coverage the
line has.

🔬 **The general lesson, worth carrying:** _a precedence law cannot be tested with
values that never overlap._ Disjointness makes the composition safe and
simultaneously makes the merge order invisible to every realistic fixture. The test
that covers it must violate the very law that guarantees the disjointness. Two
consequences were applied before the gate:

- The comment this file instructed me to write on `seedStylingFromPreset` ("no test
  can currently break that order") was **false and had to be rewritten** — it now
  points at the synthetic test and says why it must stay synthetic.
- That test's own comment was updated: it still said "`ACCENT_PRESETS` does not
  exist yet", and it now carries a 🚫 against "tidying" it to use a real accent —
  which would still pass and would stop testing anything.

🔍 **Both under-predictions are the same shape and both are benign.** M2 reads
`params.get("style")` for the accent, and since no preset id is an accent id
`findAccent` returns `null` for every realistic input — so M2 degenerates into M1
rather than mis-applying a preset's colours, which is why it took four tests and
not one. M3 additionally fails the repeated-accent-key test, because
`accent=blue&accent=plum` carries no `style` and so has its accent suppressed.
Under-predicting which guards catch a mutation is a smaller error than
over-predicting; nothing was adjusted.

---

## Completion gate — ✅ 8 of 8

1. ✅ `?style=&accent=` resolves both halves; all seven test items pass.
2. ✅ **`app/routes/app.templates_.$id/route.tsx` is byte-unchanged.**
   `git diff --stat` for the step is `stylePresets.ts` + `stylePresets.test.ts`
   only, and `git diff --name-only | grep routes` is empty.
   `createFlowContract.test.ts` passes untouched. **This is the seam claim, and it
   is the most load-bearing line in this file** — feature 88 paid for a
   `URLSearchParams` signature it did not need in order to buy exactly this.
3. ✅ The `AccentBundle` overclaim is corrected and the parameter retyped.
   Behaviour-neutral both times (structurally identical aliases; the retype adds no
   enforcement, only agreement between the signature and the prose).
4. ✅ The "everything invalid degrades" comment now splits `style` from `accent`
   and carries a 🔴 that a `null` stamp no longer implies default styling.
5. ✅ Nothing outside `app/utils/` imports `findAccent`
   (`git grep -l findAccent -- app/ extensions/` → `stylePresets.ts`,
   `stylePresets.test.ts`).
6. ✅ All five mutations run and recorded — including the one predicted to fail to
   fail, which is the one that taught this step something.
7. ✅ Full gate green: typecheck · lint · `format:check` ("All matched files use
   Prettier code style!") · **1184** tests / 43 files · build.
8. ✅ `context/progress-tracker.md` updated; doc 93's step table flipped.

🔬 **One shape worth carrying into step 101.** This step's whole cost was one line
plus honest comment maintenance, and the reason is that step 92 spent something on
a signature nothing then needed. Step 101 is the mirror image — it is the step that
finally generates the URL this one decodes — so the question to ask there is which
of ITS choices the swatch row's next consumer will have to live with. The cheapest
one to get wrong is href construction: the repeated-`accent` guard added here exists
because `&accent=` appended by concatenation is a plausible way to build it.

⚠️ **No live verification is owed** and none will be claimed: nothing generates
the URL yet. A hand-typed `?style=classic&accent=teal` on the dev store would work
after this step, but it is not the merchant path and step 101 is where the path
gets checked.
