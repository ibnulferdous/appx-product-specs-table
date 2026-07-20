# Feature 57 · Step 12 — Reset, rail a11y, docs reconciliation, Phase B1 sign-off

> **Status: SPEC — not yet implemented.** Closes Phase **B1** (Steps 1–12).
> Precedent for the shape of a closing step: `56-…` (feature 49's docs + gate + sign-off).

## Goal in one sentence

Add the one control B1 is still missing (**Reset to theme defaults**), make the Style rail
**navigable by screen reader and keyboard**, **reconcile the spec files with what actually
shipped** — including a design doc that still contradicts the binding rule — and run a
**consolidated live sign-off** so "B1 complete" is a claim that has been tested rather than
asserted.

## Where this sits

Feature 57 (Style tab), 14 steps: B1 = 1–12, B2 = 13–14, B3 outlined.

1. ✅ Pure styling domain — `57-…`
2. ✅ Pure presentation mapping — `58-…`
3. ✅ Storefront stylesheet rules — `59-…`
4. ✅ Migration + server persistence — `60-…`
5. ✅ Engine state, dividers, save — `61-…`
6. ✅ Live preview styling — `62-…`
7. ✅ Metaobject + Liquid emission — `63-…`
8. ✅ Remaining non-structural knobs — `64-…`
9. ✅ Collapsible sections — `65-…`
10. ✅ Colors + typography — `66-…`
11. 🚫 *Live styling on the editing grid* — **WITHDRAWN**, `67-…`
    ✅ Replaced by *reveal the preview on the Style tab* — `68-…`
12. **Reset + a11y + docs + B1 sign-off ← THIS DOC.**

## Premise check (read this before designing downward)

Two premises inherited from the 14-step plan are **wrong or stale**. Both are recorded here
rather than silently carried forward, because carrying an inherited line forward until it
looked decided is exactly what produced the withdrawn Step 11.

**1. There was no contrast decision to inherit — and the answer turned out to be "build
nothing" (decided 2026-07-20, see §3).** Step 10 instructed itself to *"record whether
it is a warning or a block so Step 12 inherits a decision rather than a discovery"*
(`66-…` line 304) — **and never recorded one.** Doc `66-…`'s Locked Decisions (`:259-281`) and
its "ALL RESOLVED, none open" block (`:282-297`) contain no contrast decision; its only contrast
mention is the `alpha` rationale at `:208`. The tracker's whole Step 10 entry (`:207-354`)
likewise has none.

Doc `67-…` then asserted that "Step 12 inherits Step 10's simpler framing: a non-blocking
warning." **That framing exists in exactly one place — `67-…` itself (`:129-134`) — and `67-…`
declares on its own line 5 that it is NOT a spec.** A live decision resting solely on a
document that disclaims being a spec is itself a documentation defect for Step 12 to fix.
**Step 12 must MAKE this decision and record it in its own doc** — see §3. Citing `66-…` as
the source would be inaccurate.

**2. A tracked design file still contradicts the binding rule — in FIVE places, not one.**
`context/admin-screen-plan.md` is in-project, tracked, and still authoritative-looking. It is
**the origin of the withdrawn Step 11**. The audit found five separate assertions that the
editing grid is the styling surface:

| Line | What it says | Status |
| --- | --- | --- |
| 135 | "a WYSIWYG editor that renders exactly like the storefront table" | false |
| **137** | **"The editing table renders with the current `TableStyling` at all times and is itself the live preview."** | **the strongest contradiction in the repo** |
| 140 | "…the editing table remains the preview surface." | false |
| 175 | carries the premise **twice** — "beside the live table" *and* "all changes apply live to the WYSIWYG table" (inside the locked Tab 2 spec) | false |
| 203 | B1 slice described as "live WYSIWYG application" | false |
| **209** | **Tab 3 (Settings) spec: "Rendered in the left controls panel beside the live table"** | **false — outside the obvious cluster** |

Line **137** is worse than 140 — it governs the whole editor screen and asserts *exactly* the
behaviour that was built, rejected and reverted. Line **209** is the sneaky one: it sits in the
**Settings** tab spec, so **a sweep that stops at the Style tab leaves Settings still asserting
the editing grid is the live styled surface.**

**Find them with this grep, then read each hit before editing it:**
`WYSIWYG|live table|live preview|still-live|renders exactly like`

**Line 198 is a FALSE POSITIVE — do not edit it.** It matches on *"would change every merchant's
live table"*, which refers to the **storefront** table and is correct as written. Same trap as
`data-model.md:618` below. The grep finds the candidates; it does not decide them.

**And the remedy the plan prescribed is itself wrong.** The 14-step plan says this sentence
"gets a scope note." That was written for a world where the grid got styled *partially*. The
step was withdrawn **outright**, so these sentences need **correcting, not annotating**. Line
175 sits inside the locked Tab 2 spec — preserve its "knobs are real columns / rides the
SaveBar" content and fix only the surface claim.

## What changes

Four workstreams. Unlike `56-…` (which shipped no runtime code), Step 12 **does** ship code —
the Reset control and the a11y fixes are real behaviour.

### 1. Reset to theme defaults

**The reset target is exactly `DEFAULT_STYLING_VALUES`.** Verified, not assumed
(`tableStyling.ts:142-165`, asserted field-by-field at `tableStyling.test.ts:62-82`): the seven
structural knobs take concrete defaults (`TWO_COLUMN`, `STACKED`, `BANDED`, `false`, `ALL_OPEN`,
`LINES`, `DEFAULT`) and all thirteen nullable fields are `null`. It is the only such constant in
the repo. **Do not invent a second constant or a per-field null-vs-default rule.**

There is no default-vs-inherit distinction to model: for the thirteen nullable fields the default
*is* null, and the seven non-nullable ones have no inherit affordance at all (their defaults
resolve at parse time, so a control always has a concrete value).

*Precision worth keeping:* "null = inherit from theme" is the project's **vocabulary**, not the
mechanism. `stylingToCssVars` simply **omits** the custom property, and what actually renders is
the **stylesheet's own `var(…, fallback)`** in `spec-table.css`. The app never learns the theme's
colour — which is exactly why §3 rules out contrast checking entirely.

**The engine already has the state setter.** `useRowEngine.ts:216` holds
`const [styling, setStyling] = useState<StylingValues>(initialStyling)`; only the per-field
`setStylingField` (`:221`) is currently exposed. Reset needs a wholesale replace, so expose a
`resetStyling` callback rather than looping `setStylingField` over twenty fields (which would
be twenty renders and twenty dirty-checks for one user action).

Note the engine comment at `useRowEngine.ts:119`: styling is reseeded on remount so Discard
reverts it *"with no dedicated reset."* Step 12 adds the first dedicated one — so confirm the
dirty snapshot picks up a wholesale replace, not just per-field edits.

**Behaviour:**

- Lives at the **bottom of the Style rail**, as a low-emphasis control — it is a destructive
  bulk action, not a primary one.
- **Confirm dialog before applying.** Copy `BulkDeleteModal.tsx:13-42` rather than inventing
  one: a presentational `{engine}` component rendering `<s-modal id={CONST}>` with
  `slot="primary-action"` / `slot="secondary-actions"` buttons, the id constant in
  `editorShared.ts`, shown/hidden imperatively via `shopify.modal.show/hide`.

  **Two non-obvious obligations come with that pattern** (modals portal *outside* the editor's
  `inert` save-freeze): hide-on-save-start, and a `saving` re-guard in the confirm handler.

  **There are actually TWO shipped modal patterns — pick deliberately.** `editorShared.ts` holds
  **five** modal ids, not three. The three `ContentTab` modals use the extracted presentational
  `{engine}` shape above; `TemplateHeaderActions.tsx` is a second variant with **component-local**
  show/hide and handlers and `<s-modal>`s rendered **inline** (`:77-78, 84, 89, 91, 110, 132,
  181, 206`). Its delete confirm uses `tone="critical"` (`:217`), so the critical-tone convention
  holds across both. For a Style-rail-local control, the `TemplateHeaderActions` shape may be the
  better fit.

  **And the mount-site question is sharper than "StyleTab is conditionally mounted."**
  `EditorShell` does **not** render `ContentTab` unconditionally: it renders only `stageContent`
  (`EditorShell.tsx:253-255, 304, 307`), which is the preview whenever `isPreviewView(activeView)`.
  So **on any device view, `ContentTab` and all three of its modals are fully UNMOUNTED.**

  Since shipped Step 11 makes the Style tab open on a **desktop preview** by default, a merchant
  arriving at Style is in exactly that unmounted state. **Mount the Reset modal where it survives
  the tab and view the merchant will actually be in** — and confirm a tab/view switch mid-confirm
  cannot strand it.
- **Rides the SaveBar — and needs no dirty-tracking change.** `isDirty` is a JSON string compare
  over `editorMetaSnapshot`, whose styling leg is `serializeStylingOverrides`
  (`editorSnapshot.ts:41-51`, `useRowEngine.ts:375-387`). Replacing the whole styling object
  flips the SaveBar automatically, and correctly *un*-flips it if the reset happens to land back
  on the saved baseline.
- **Only touches styling.** Rows, name, status, scope and excludes are untouched.
- **Reset genuinely CLEARS overrides rather than persisting defaults as data — and needs zero
  server work.** `serializeStylingOverrides` emits only non-default fields, so an all-default
  value serializes to `{}` (`tableStyling.ts:321-337`, asserted at `tableStyling.test.ts:86`),
  which the server already writes as an all-NULL row (`useRowEngine.ts:422-429`). The reset is a
  pure client-state change riding the existing Save path unmodified. This also means reset state
  and never-styled state are identical in the database, by construction.
- **Update the now-false comment.** `useRowEngine.ts:114-120` says styling is reseeded on
  remount *"so Discard reverts a styling change with no dedicated reset."* Step 12 adds the
  dedicated reset, so that sentence stops being true — fix it in the same change. (Note the two
  are not equivalent: Discard reverts to the **last saved** styling; Reset goes to **theme
  defaults**.)
- **`admin-screen-plan.md:199` already describes this correctly** — *"clears every override
  (knobs to defaults, colors to null)"* is exactly `DEFAULT_STYLING_VALUES` and nothing more.
  Do not invent a second constant or a per-field null-vs-default rule.

### 2. Rail accessibility

**Precedent: `13-…` first, `55-…` second.** `13-…` (keyboard reorder + a11y) is the closer
template — it covers accessible names on icon-only controls (`:114-118`), a `:focus-visible`
ring with a no-hardcoded-hex rule (`:153-160`), live-region announcements (`:126-151`), keyboard
operability + focus return (`:263-264`), and accessibility-tree verification (`:191-198`).
`55-…` transfers only on accessible name and contrast: its subject emitted **no interactive
elements at all** (`55:95-97`), so it has no precedent for focus visibility, description
association, or group semantics — the three things this step actually needs.

**Three real gaps (A, B, C) and two non-gaps** — spend the budget accordingly. All three gaps are
the same underlying fault: **the rail conveys structure and description visually but not
programmatically.**

**NOT a gap — do not spend effort here.** All **21** controls already have a programmatic
accessible name via the Polaris `label` attribute (`StyleTab.tsx:130, 157, 190, 217, 241, 258,
288, 308, 346 (×7 colour fields), 368, 397, 419, 443, 466, 490`). Audit them, record that
labelling is complete, and move on.

**Gap A — help text is unassociated on 14 of 21 controls.** This is the **highest-value,
lowest-risk fix in the whole step.** Only the seven colour fields associate their help text
properly, via `details={knob.helpText}` (`StyleTab.tsx:347`). The other fourteen render help as
an **unassociated sibling** `<s-text color="subdued">` (`StyleTab.tsx:147, 172, 203, 232, 247,
273, 303, 323, 383, 435, 458, 481`), so a screen reader announcing *"Row dividers, combobox,
Lines"* never reads *"A hairline rule between rows."*

`details` is supported on all three control shapes in use (`s-select`, `s-number-field`,
`s-switch`), so the fix is a **pure attribute move**: the text stays visible, Polaris renders it
under the field, twelve JSX blocks disappear, and the rail becomes internally consistent with
the Colors group that already does it right.

**Gap B — no group semantics.** All five group headings plus the panel title are
`<s-text type="strong">` (`StyleTab.tsx:122, 127, 214, 285, 338, 365`), and each group is a bare
`<s-stack>` (`:126, 213, 284, 337, 364`). The rail reads to assistive tech as one flat run of 21
controls interleaved with six orphan bold strings — no heading to navigate by, and no way to
tell that "Border" belongs to Colors.

`s-text`'s `type` union has **no heading variant**, so this needs a different element. Two
verified-available routes:

- (a) `s-heading` + wrap each stack in `<div role="group" aria-labelledby={id}>`. Raw light-DOM
  ARIA is already an established pattern here — `EditorShell.tsx` uses a raw
  `<div role="radiogroup">`.
- (b) `s-section heading=…`, already used at `app/routes/app.templates.tsx:211` and `route.tsx:552`.

Note `s-box`'s `accessibilityRole` union does **not** include `group`, so that shortcut is
unavailable.

**Second non-gap — focus visibility is already clean.** The `outline: none` rules in
`SpecTableEditor.module.css` are scoped to the **editing-grid cells** and compensated by an inset
ring, and `StyleTab` imports **no CSS module at all**. Record it as audited; do not go looking.

**Gap C — the rail container is not a landmark. DECIDED 2026-07-20: IN SCOPE, fix it.**

`EditorShell.tsx:297` renders the ~300px controls panel as
`<s-box background="subdued" padding="base">` — a styled `<div>` with **visual identity only**:
no `role`, no accessible name.

Sighted users see two areas instantly (controls left, table right) from the grey background and
position. Screen-reader users get none of that. Landmarks are a primary navigation mechanism —
jump between regions instead of arrowing linearly — and because this panel is not one, there is
**no region to jump to and no way to skip past it** to reach the table. It is an unannounced run
of controls that simply ends.

The fix is two attributes; `EditorShell` already knows the active tab, so the name costs nothing:

```jsx
<s-box background="subdued" padding="base"
       role="region" aria-label={activeTab === "style" ? "Style" : "Settings"}>
```

**Why this is in scope despite living outside `StyleTab.tsx`.** It is the *same* a11y concern as
Gaps A and B — labelling the groups inside a container while leaving the container itself
anonymous is an incoherent half-job. Two attributes is not scope creep.

**But it necessarily touches the Settings tab**, because `EditorShell.tsx:252`
(`activeTab === "style" ? stylePanel : settingsPanel`) puts **one box behind both tabs**. That is
accepted deliberately, with one obligation attached:

> **Record it in `progress-tracker.md` as work that landed for Settings too**, so Phase C neither
> redoes it nor mistakes it for "Settings a11y is handled." **Silent partial work in a shared
> file is the real risk here — not the two attributes.**

**One lower-priority item — flagged, not recommended:**

- **Four controls mount/unmount silently** when another knob changes (e.g. the custom-px input
  appearing when Font size becomes Custom), with no announcement. The pattern to reuse already
  ships — it is the polite live region added in Step 11 (`EditorShell.tsx`).

**One thing source-reading cannot settle:** Polaris's own shadow-DOM keyboard behaviour inside
`s-color-field` (opening and navigating the swatch popover). Put it on the dev-store browser
list, the way `55-…` handled assertions jsdom cannot make — do not assert it either way from the
type definitions.

**Also:** confirm every control is keyboard-operable, and the new Reset dialog must trap focus,
restore it to the trigger on close, and close on `Escape`.

### 3. Contrast — DECIDED 2026-07-20: no check, no warning, no block

**Decision by the project owner: the app ships NO contrast checking of any kind.** Choosing
readable colours is the merchant's / store developer's job. Build nothing here.

This is a **decision, not a deferral** — do not reintroduce it in B2, B3, or a later "polish"
pass without a new decision.

**Why (so a future reader does not re-litigate it):**

1. **The app cannot compute contrast, so any signal would be a guess.** A null background
   inherits an unknown theme colour, and `alpha` is enabled on all five background knobs — the
   effective colour is a composite the app never sees. `stylingToCssVars` merely *omits* the
   custom property and the stylesheet's own `var(…, fallback)` wins, so the app genuinely does
   not know what renders.
2. **An unreliable a11y warning is worse than none.** It would over-trigger on cases that are
   fine and stay silent on cases it cannot see — and silence reads as approval. It also trains
   merchants to dismiss warnings.
3. **It is the merchant's storefront and their brand call.** Shopify's own theme editor does not
   block or warn on merchant colour choices; this app should not be stricter than the theme
   editor the merchant came from. That is the same reasoning that raised the `fontSize` ceiling
   40 → 184.
4. **The recovery path is already good.** Step 11 puts the merchant on the live preview the
   moment they open Style, so a bad pairing is visible immediately; Step 12's Reset is one click
   back to theme defaults.
5. **No compliance requirement was found.** There is no evidence Shopify App Store review
   requires apps to validate merchant-chosen colours. Do not cite compliance for this.

**On CLAUDE.md priority #2 (storefront correctness & accessibility):** that priority binds *the
app's own output* — semantic markup, real `<table>` semantics, accessible names, keyboard
operability. It does not make the app the arbiter of the merchant's brand palette. The genuine
storefront-a11y debt in this area is **stacked mode's `display: block` stripping table
semantics** (§4) — that is the app's own markup and *is* the app's responsibility.

> **Process note — why this item survived as long as it did.** It came from Step 10 instructing
> itself to *"record whether it is a warning or a block"* (`66-…:303-305`) and then never
> recording one. This spec's first draft correctly caught that the decision was missing — and
> then asked *"warning or block?"* rather than *"either?"*, which is precisely the failure doc
> `67-…` documents: **interrogating an inherited item's details makes its existence look
> settled.** Two steps in a row. The tell is the same both times: the whole item was
> damage-control against a capability nobody asked for.

### 4. Docs reconciliation + B1 sign-off

**Per-file verdicts — already audited (the `56-…` discipline), not left as "check these":**

| File | Verdict |
| --- | --- |
| `context/admin-screen-plan.md` | **NEEDS EDIT — highest severity.** The five-point sweep above (135, 137, 140, 175, 203). |
| `context/prd.md` | **NEEDS EDIT (small).** One stale clause on line 33. |
| `context/feature-roadmap.md` | **NEEDS EDIT (small).** Three post-MVP entries have actually shipped in B1. |
| `context/progress-tracker.md` | **NEEDS EDIT (routine).** Step 12 record + B1 sign-off; plus one stale deferral line. |
| `context/data-model.md` | ✅ **VERIFIED, NO EDIT.** §5 matches `prisma/schema.prisma` field-for-field; §10 matches shipped Step 7. Nothing claims the grid is styled. Do not open it. |
| `context/code-standards.md` | ⚠️ **RE-OPENED — likely needs a small ADDITION.** See below. |

**On `code-standards.md` — the first audit said "no edit, it already encodes the binding rule."
Adversarial verification refuted that, and the refutation is right.** Line 56 actually reads
*"Render rows with semantic HTML and centralized color — Polaris design tokens / shared CSS
variables, never hardcoded hex literals."* That is a **no-scattered-hex / colour-centralization**
rule about *where colour values come from* — **not** a rule about *whether merchant styling
reaches the Edit grid*.

The distinction matters concretely: **the withdrawn Step 11 painted the grid using the shared
`--appx-spec-*` variables, so it was fully compliant with line 56.** The coding standard as
written would have *permitted* the rejected approach. So Step 12 should **add** the binding rule
to `code-standards.md` as an explicit convention, rather than record the file as already
covering it. This is a good example of why "verified, no edit" needs the actual sentence read,
not a summary of it.

**Two reconciliation items found in passing:**

- **`context/features/68-…` still says "not yet implemented."** It shipped. Fix the status line.
- **The `fontSize` ceiling amendment (40 → 184) never reached the code docs.** It landed in
  `admin-screen-plan.md` §Tab 2 but not `prisma/schema.prisma` or the `parseFontSize` docstring.
  This is live doc-drift on a validated bound — worth correcting while the file is open.

**One thing NOT to do:** the `tableStylingCss.ts` header-comment debt (the stale "third consumer
(Step 11)" line) is **already paid** — it landed in Step 11. Do not redo it.

**Known unpaid debts — audited, so the sign-off pays or explicitly carries each:**

- **`labelWidthPct` and `stripeBgColor` have never been driven live.** Confirmed still
  outstanding (`progress-tracker.md:346-352`, `:262-270`). Both are correctly **wired** — this
  is a *verification* gap, not a wiring gap (`spec-table.css:50`, `:234`, `:184`). They need a
  `rowLayout=TWO_COLUMN` + `rowDividerStyle=STRIPES` template to be visible at all. Exercise
  them **through the UI, not SQL**, so the metaobject re-syncs, then restore. Without this, B1
  sign-off rubber-stamps two knobs no human has ever seen render.
- **Knob totality is provable — assert it.** All 20 fields in `STYLING_FIELD_NAMES` are wired
  end-to-end (control → engine → DB → metaobject → Liquid → storefront CSS); the audit found no
  knob without a control and no CSS var without a storefront rule. The single exemption,
  `appx-spec-table--mobile-same-as-desktop`, is **deliberately** rule-free
  (`specTableCssContract.test.ts:66`) — not a gap.
- **`basedOnPreset` / `extraStyles`** — confirmed present since Step 4's migration and never
  written by any code path except duplicate's verbatim row copy. Unwritten is correct until
  Step 13; assert it rather than assuming.
- **A second a11y item was deferred to Step 12 in writing** and is **not** the rail pass:
  stacked mode's `display: block` strips table semantics on the storefront. This is a
  *storefront* a11y issue, ranked above maintainability by CLAUDE.md. Confirm whether it is in
  scope here or is honestly carried to B2 — do not let it vanish between the two.
- **The DJI Mavic live baseline that Steps 7–9 relied on is explicitly invalidated** in the
  tracker. Any sign-off step re-using it must re-establish the baseline first.
- **`prisma/schema.prisma:141` still documents the px clamp as 10–40** after the ceiling was
  raised to 184. Stale, and on a validated bound.

**A grep guard for whoever implements this:** `context/data-model.md:618` says *"The editor
renders these breaks identically to the storefront (WYSIWYG)"*. That is scoped to `LINE_BREAK`
**value parts** (content structure), not to merchant styling, and is **still true**. A Step 12
sweep for `/WYSIWYG/` will surface it — **do not "fix" it.** Over-applying the binding rule is
its own failure mode.

**Consolidated live sign-off** — the full knob matrix across the three device previews **and**
the real storefront (desktop + mobile width), on a template exercising `TWO_COLUMN` +
`STRIPES` + collapsible sections + colour + typography overrides. This is the first pass that
drives B1 as one surface rather than one step's slice.

## Locked decisions

- **Reset targets `DEFAULT_STYLING_VALUES`** — the same constant the loader resolves an absent
  `TableStyling` row into, so reset state and never-styled state are identical by construction.
- **Reset is client-side + SaveBar.** It does not write to the server or delete the
  `TableStyling` row; saving all-defaults is the existing, already-tested path.
- **Reset confirms.** The SaveBar's Discard is not a substitute — it reverts unrelated edits too.
- **Nothing styles the editing grid.** The binding rule from `67-…` is not reopened.
- **No new knobs.** Font-family, letter spacing, wrap and per-side padding stay rejected.

## What this step does NOT own

- **Presets** (`stylePresets.ts`, the rail cards, the creation gallery) → Steps 13–14 (B2).
- **Shop-level default styling / bulk apply-to-all** → post-MVP, rejected for MVP.
- **Any new styling capability.** If the sign-off finds a defect, fix it in the **owning step's**
  file and note it here — Step 12 must not become a grab-bag.

## Testing

- **Unit** — the reset reducer/callback (returns exactly `DEFAULT_STYLING_VALUES`; leaves rows,
  name, status, scope, excludes untouched; marks dirty). Keep the rail's own rendering out of
  unit tests — jsdom cannot render Polaris web components ([[testing-strategy]]).
- **Gate** — `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
  npm run build`, all five green; record the final count. **`npm run build` is the only gate
  that validates CSS syntax** (learned the hard way in the withdrawn step).
- **Browser** — the §4 sign-off matrix, per [[browser-verify-embedded-app]].

## Done when

1. Reset ships: confirm dialog → `DEFAULT_STYLING_VALUES` → SaveBar → Discard reverts it.
2. Rail groups are programmatically grouped, help text is associated on all 21 controls, the
   rail container is a named landmark, and keyboard + focus are verified. **No contrast work
   ships** (§3) — verify nothing was added.
   - The landmark edit lands in `EditorShell`, so it applies to **Settings** as well. The tracker
     must say so explicitly — Phase C should neither redo it nor read it as "Settings a11y done."
3. `admin-screen-plan.md:140` no longer contradicts the binding rule.
4. Every context file is individually checked, with "verified, no edit" recorded where true.
5. `labelWidthPct` and `stripeBgColor` are **driven live at least once** on a
   `TWO_COLUMN` + `STRIPES` template — or the debt is explicitly carried into B2 with a reason.
6. Full gate green; tracker marks **Phase B1 complete** and points at B2.
7. The dev store is left clean — scratch templates discarded or deleted.

## Pointers

- Binding rule + the withdrawal → `context/features/67-…`
- Shipped Step 11 → `context/features/68-…`
- Step 10 (colours/typography, and the un-recorded contrast decision) → `context/features/66-…`
- Closing-step precedent → `context/features/56-…`
