# Feature 57 · Step 11 (as originally planned) — WITHDRAWN

> **Status: BUILT, REJECTED ON REVIEW, FULLY REVERTED — 2026-07-19.**
> This document is kept as the record of a rejected approach. It is **not a spec**
> and nothing in it should be implemented. The rule it produced is binding; the
> plan it described is void.
>
> The replacement Step 11 — *reveal the preview when the merchant opens the Style
> tab* — has its own document (`68-…`). See `progress-tracker.md` for the live plan.

## The rule this produced (the part worth keeping)

> **The Edit grid is a fixed editing surface. It never reflects merchant styling.**
>
> The **Desktop / Tablet / Mobile** preview views are the *only* place Style and
> Settings changes appear, and they are already storefront-faithful (Step 6).
> There is no third renderer.

Corollary worth stating because a future reader will hit it: `tableStylingCss.ts`'s
header comment says *"the storefront Liquid block (Step 7), the preview iframe
(Step 6), and the live editing grid (Step 11) all consume THE SAME mapping."*
**The third clause is stale.** The mapping has two consumers and that is correct —
it is not an unfinished job waiting for someone to complete it.

## What was proposed

Make the Content tab's editing grid react to the merchant's colours and
typography — eleven of the thirteen var-backed fields painting the grid's cells,
inks, hairlines and section band — while a precedence rule kept editor state
(active row, selection, focus ring, drag ghost) winning over merchant colour.

It was specced at length, split into 11a (typography + text colours) and 11b
(surface colours), built, unit-tested, gate-green, and verified live on the dev
store. Both commits were then reverted; `app/` is byte-identical to the Step 10
sign-off and the suite is back to 812 tests / 34 files.

## Why it was wrong

**The editing grid is a tool, not a rendering of the merchant's table.** It exists
to be edited in: a gutter with select/drag/delete, three editable cells, keyboard
cell navigation, and interaction states that must stay legible. Painting the
merchant's design onto it makes the tool worse at being a tool, and it answers a
question the merchant already has a correct answer to one click away.

The strongest evidence is the shape the work took. The whole step was a
**subsetting-and-precedence problem** — deciding which of twenty fields were safe,
then writing a rule so merchant colour could not hide the selection. Every one of
those decisions was damage control against a feature nobody needed. When a step's
entire content is "make sure this doesn't break things", the thing to question is
the step.

There was a second signal, visible before any code: the step required **zero
backend change** — no schema, no server, no migration, no serialization. Nothing
but CSS and one inline style. That was written up as a virtue ("zero non-UI diff").
It was really a hint: a feature that touches no data and no contract may not be
adding anything.

## How the premise survived so long — the process failure

**The wrong question was asked, carefully.**

Before writing code, five questions were put to the project owner. The first was:

> *Do any of the four structural-but-cosmetic knobs apply to the editing grid —
> density, row dividers, section header style, label width?*

All three options assumed the grid gets styled and differed only in **how much**.
Even the chosen answer, *"None of them"*, meant *"none of those four, while the
other eleven still paint the grid."* **No option said "the grid isn't styled at
all."** The owner was answering inside a frame that had never been put up for
review, and their answer then read as agreement with the scope.

The question that should have come first, and would have ended the work in one
message:

> *Should merchant styling reach the editing grid at all — or is Edit mode a fixed
> surface, with the device previews being the only place styling appears?*

**Where the premise came from:** the line *"11. Live styling on the editing grid
(visual knobs)"* already sat in the feature-57 step map, repeated across docs
`57-…` to `66-…`. It was inherited as settled fact — but those docs were written
in earlier steps of this same effort, so it was not external truth being deferred
to. It was an early assumption copied forward often enough to look like a decision,
then elaborated into a 380-line spec, which made it look more decided still.

**The generalisable lesson, and the reason this file exists:**

> **Asking detailed questions about something makes the thing itself look settled.**
> Four careful questions about *which knobs* implied that the grid gets knobs. The
> more thorough the sub-questions, the more invisible the assumption beneath them
> becomes. When a step is inherited from a plan, re-ask the premise out loud before
> designing downward from it — especially when the plan is one you wrote yourself.

## What was salvaged

- **The rule at the top of this file**, now recorded in `progress-tracker.md`.
- **A real gap, found by accident.** The tab (Content/Style/Settings) and the view
  (Edit/Desktop/Tablet/Mobile) are **independent** controls in `EditorShell`, so a
  merchant on the Style tab in Edit view changes knobs and **sees nothing happen**.
  That is the genuine problem this step was groping at, and it is what the
  replacement Step 11 addresses — by showing the merchant the surface that already
  renders styling correctly, not by styling the grid.
- **A Step 10 verification debt, paid.** The left-column colour swatches — recorded
  in Step 10 as never driven live, with a suspicion they might be broken — were
  exercised during this step's live test. `Value background` accepted a typed
  `#E8F5E9` on the first attempt and rendered. The Step 10 doubt was **coordinate
  drift in the browser automation, not a defect**.
- **Confirmation the previews are healthy.** The Desktop preview rendered the test
  colours correctly in the stacked, collapsible-section layout — the surface that
  is *supposed* to show styling does show it.

## What was NOT changed (verified, not assumed)

Nothing shipped. Verified by full-tree diff against the Step 10 sign-off commit and
by SQL against the dev database:

- **Code** — no server, schema, migration, `spec-table.css`, `previewStyles.ts`,
  Liquid, metaobject, engine or dependency change. The reverted commits touched
  four frontend files.
- **Schema** — untouched; newest migration is still Step 4's `add_table_styling`.
- **Data** — the test colours were never saved. `labelBgColor` and `valueBgColor`
  are NULL on every row of `TableStyling`.

## Pointers

- Live plan and current step → `context/progress-tracker.md`
- The replacement Step 11 → `context/features/68-…`
- Step 10 (the last step that added knobs) → `context/features/66-…`
- Step 12 (Reset + a11y + docs + B1 sign-off) — **unchanged in scope except one
  simplification**: this document had argued contrast checking was *worse* in the
  editor (invisible text while you type it) and told Step 12 to inherit that.
  **That concern is void.** Contrast is purely a storefront concern again, and the
  merchant sees it in the preview, so Step 12 inherits Step 10's simpler framing:
  a non-blocking warning on the two text colours.
