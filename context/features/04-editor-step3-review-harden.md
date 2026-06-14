# Editor Step 3 — Review & harden what Steps 1–2 built (no new features)

## Goal in one sentence

Before adding any new behavior, audit everything Steps 1–2 built — the reducer,
the `valueParts` normalize/merge rules, the `id`/`key` invariants, the segment
renderer, toolbar, gutter, Polaris usage, scoped CSS, and accessibility — hunt
for bugs and edge cases, **fix correctness and standards issues now**, and **log
everything else as tracked follow-ups** so the step stays bounded.

## Why this is now

The reducer in [rows.ts](app/utils/rows.ts) is the foundation every later step
splices onto: Step 4 reworks the pill on top of it, Step 5+ inserts picked fields
into it, Step 10 adds `MOVE_ROW`, Step 13 adds `PASTE_ROWS`, and Step 6 (Save)
re-validates and serializes whatever it produced. This is the **last cheap moment**
to fix a foundational mistake — once the pill rework, the field picker's network
calls, drag-and-drop, and persistence depend on this code, a fix here ripples
through all of them.

This step **adds no reducer actions and no UI surfaces**, so by construction it
cannot introduce the kind of bug it is hunting for. It is review, triage, and
small fixes only.

## Foundation under review (carried from Steps 1–2)

- The single source of truth: a `useReducer` over `rows` in
  [rows.ts](app/utils/rows.ts); array index is display order.
- Actions shipped so far: `ADD_ROW`, `ADD_SECTION`, `DUPLICATE_ROW`,
  `DELETE_ROW`, `SET_LABEL`, `SET_VALUE_TEXT` (part-indexed), `REMOVE_VALUE_PART`,
  `INSERT_VALUE_PART`.
- Helpers: `slugifyKey`, `uniqueKey`, `newRowId`, `createSectionRow` (internal),
  `placeholderMetafieldPart`, `normalizeValueParts`, `normalizeRows`,
  `insertRowAfter` (internal).
- The UI: [SpecTableEditor.tsx](app/routes/app.templates_.$id/SpecTableEditor.tsx)
  (container + `EditorRowItem` + `ValueCell` + `RowGutter`),
  [SpecTableEditor.module.css](app/routes/app.templates_.$id/SpecTableEditor.module.css),
  and the route in [route.tsx](app/routes/app.templates_.$id/route.tsx).
- Invariants that must still hold: `id` stable / never reused; `key` derived at
  creation and never rewritten by a label edit; `key` unique within a template;
  the `200` cap exists only as `MAX_TEMPLATE_ROWS`; reducer stays pure (no
  `crypto.randomUUID()` inside it); local React state only — nothing persists.

---

## In scope

1. **Read every file Steps 1–2 touched** against `data-model.md` (§6–7 row
   contract, Row ID/key rules, comparison-readiness invariant) and
   `code-standards.md` (TypeScript, React, Polaris, Spec Table Editor sections).
2. **Hunt for bugs and edge cases** across the surfaces below.
3. **Fix now**, in this step:
   - Correctness bugs (an action or render that produces a wrong/invalid row).
   - Violations of a `data-model.md` invariant.
   - Clear `code-standards.md` violations that are cheap to fix (hardcoded hex,
     mixed concerns, missing types, a11y gaps that block keyboard/SR users).
4. **Log, do not fix now** (so the step stays bounded):
   - Anything that depends on persistence/network/drag (Step 6 / 5+ / 10 territory).
   - The pill's ✕-removal interaction and its caret/focus quirks — **Step 4
     replaces this surface entirely**, so do not over-polish it.
   - Scope-for-improvement / nice-to-haves that are not correctness or standards.
5. Each logged item becomes a tracked follow-up in
   [progress-tracker.md](context/progress-tracker.md) (Open Questions or a
   "Step 3 follow-ups" list), with enough detail that a later step can act on it.

## Explicitly out of scope (do not build here)

- Any new reducer action or new UI affordance — this step is a freeze on behavior.
- The Claude-style inline pill rework (caret-deletable token) → **Step 4**.
- Field picker shell / native fields / search / metafield fetch → **Steps 5–9**.
- `@dnd-kit` reorder + keyboard nav → **Steps 10–11**.
- Clipboard paste → **Steps 12–13**.
- Save / persistence / server re-validation / metaobject sync → **Step 6**.
- Rewriting the per-segment `<input>` model into one contenteditable surface —
  that is the heart of **Step 4**, not a hardening fix. If the review concludes
  the segment model is the root cause of a focus bug, log it as a Step 4 input,
  do not start the rewrite here.

---

## Review surfaces and what to check on each

### A. Reducer purity & action correctness — [rows.ts](app/utils/rows.ts)

- Reducer is pure and deterministic: no `crypto.randomUUID()`, `Date.now()`, or
  other non-deterministic input inside `rowsReducer`; ids are minted by the
  caller (`newRowId`) and passed in. Confirm this still holds for every branch.
- Cap is enforced **inside** every row-creating action (`ADD_ROW`,
  `ADD_SECTION`, `DUPLICATE_ROW`), not only via disabled buttons — confirm no
  path can push `rows.length` past `MAX_TEMPLATE_ROWS`.
- `DUPLICATE_ROW` mints a fresh `id` (`action.newId`) and a fresh unique `key`,
  deep-copies `valueParts` (no shared object references between source and copy),
  and inserts directly below the source. Verify a duplicated row shares no
  mutable structure with its source.
- `SET_LABEL` changes the label only and never the `key`.
- `SET_VALUE_TEXT` / `REMOVE_VALUE_PART` / `INSERT_VALUE_PART` no-op safely on a
  missing id and on a `SECTION_HEADER` row (sections have no `valueParts`).
- Unknown action → `default` returns state unchanged.

### B. `valueParts` normalize/merge rules — `normalizeValueParts`

- Removing a pill from `[TEXT, PILL, TEXT]` merges back to a single `TEXT`.
- At least one `TEXT` part is always guaranteed (cell stays editable).
- An empty `TEXT` deliberately kept between two pills as a caret target is fine —
  confirm it is intentional and not treated as a bug to "clean up."
- `INSERT_VALUE_PART` always leaves a trailing `TEXT` part.

### C. `id` / `key` invariants — `slugifyKey`, `uniqueKey`, `newRowId`

- `key` is unique within the template across `ADD_ROW`, `ADD_SECTION`, and
  `DUPLICATE_ROW` (including repeated blank rows → `row`, `row_2`, …, and blank
  sections → `section`, `section_2`, …).
- `uniqueKey` suffixing is correct against the live key set (which includes the
  source row's own key on duplicate).
- **Confirm the label→key story** (see Candidate finding #1 below).

### D. Segment renderer & value cell — `ValueCell`, `RowGutter`

- The `key` props on mapped segments/pills are index-based
  (`` `${partIndex}:TEXT` ``); reason about what happens on remove/insert/merge
  (focus/caret). Triage per the Step 4 carve-out — log, don't over-polish.
- `pillLabel` / `pillIcon` handle a placeholder (keyless) pill → "choose field".
- The content-sized `<input>` (`size` from text length, `min-width` in CSS) stays
  clickable when empty.

### E. Toolbar / activeRow / gutter — `SpecTableEditor` container

- Insert-below-active works; bottom "Add row" appends; `activeRowId` is cleared
  when the active row is deleted so inserts fall back to appending.
- Duplicate is disabled with no active row and at the cap; the handler also
  guards `activeRowId === null`.
- Cap disables Add row / Add section / Duplicate (top and bottom) and shows the
  at-limit banner; the counter is accurate.
- Memoization holds: a single cell edit re-renders only its row (`dispatch`,
  `onActivate`, `onDelete` stable; `isActive` a boolean). `index`/`rowNumber`
  shifting on insert/delete re-rendering trailing rows is expected — confirm it
  is not doing more work than necessary.
- `scrollTargetRef` scrolls a freshly created row into view exactly once.

### F. Polaris web-component usage

- Only `<s-...>` web components + design tokens; no legacy `@shopify/polaris`
  React imports; no overriding component internals.
- Re-confirm the Step 2 workarounds are still the right call and are commented:
  `<s-chip>` + explicit `<s-button icon="x">` (chip `removable` paints nothing),
  `<s-stack>` instead of `<s-button-group>` (no slot), `strong` chip tone for the
  "blue" pill (no blue variant). See [[polaris-web-component-gotchas]].

### G. Scoped CSS — `SpecTableEditor.module.css`

- No hardcoded hex; colors are `currentColor`/tokens only; everything else is
  spacing/sizing in rem/ch.
- CSS is scoped to the component (CSS module) and each rule has a reason Polaris
  alone could not express it.

### H. Accessibility

- Every interactive control is keyboard reachable and screen-reader labelled
  (text segments, pill remove, insert, gutter delete, label/section fields).
- The inert drag handle is `aria-hidden` and not a focus trap (real keyboard
  reorder is Step 11).
- Row activation via `onFocusCapture` (not a click on a non-interactive div) is
  still correct and does not strand keyboard users.

### I. Route & types — [route.tsx](app/routes/app.templates_.$id/route.tsx)

- Loader/action return shapes are consistent (`{ ok, … }`); the non-`new` action
  still returns `{ ok: false }` (Save is Step 6) and the form narrows the
  no-`values` branch correctly.
- `normalizeRows` is the only thing turning loader `Json` into `EditorRow[]`
  today (see Candidate finding #4).

---

## Candidate findings to verify and triage

These were surfaced while reading the code for this plan. Confirm each, then
either fix now or log per the triage rules. They are starting points, **not** an
exhaustive list — the review should look beyond them.

1. **`slugifyKey` is exported but never called; row `key` is never derived from
   the label.** New data rows are created blank and `ADD_ROW` always uses
   `uniqueKey(FALLBACK_KEY_BASE, …)`, so every UI-created row gets `row`,
   `row_2`, … and a later `SET_LABEL` deliberately does not touch the key. The
   merchant types "Screen Size" but the key stays `row_2`. `data-model.md` (§7
   "Row ID and key rules", §12 "Why Row Keys Matter") intends `key` to be a
   stable, human-readable slug derived from the label at creation, because it is
   the cross-product/cross-template alignment mechanism for import/export, AI,
   localization, JSON-LD, and the comparison feature. **Decide the policy:**
   derive the key from the label at the first meaningful moment (e.g. first label
   edit, or on blur, or at Save in Step 6) while preserving "never rewrite after
   set," vs. keeping opaque `row_N` keys and removing the dead `slugifyKey`
   helper. This is a correctness/data-model question, not a nice-to-have — resolve
   it here or record it as an explicit, owned open question.

2. **Section header may not render full-width.** `SECTION_COLUMNS` is
   `` `${GUTTER} 1fr` ``, so a section row spans only the gutter + the Label
   column, not the Label + Value width. Step 2 (sub-step 2.5) specified the
   section as a "distinct full-width header row." Verify in the browser whether
   the section visually spans the full table width; if not, this is a small
   grid/CSS fix (e.g. span both data columns) — fix now.

3. **Caret/focus loss on pill remove and after insert.** Index-based React keys
   plus the narrow empty `TEXT` segment mean focus can be lost when parts are
   removed/merged or after an insert (already noted in the Step 2 session notes).
   **Do not fix here** — Step 4 consolidates the per-segment inputs and owns caret
   handling. Log it as a Step 4 input.

4. **`normalizeRows` does no per-row validation** — it casts `value as
   EditorRow[]` for any array. No live risk today (no Save path writes `rows`;
   loaded templates carry `[]`), but malformed persisted rows would render
   garbage or crash once Save lands. **Log as a Step 6 follow-up** (server-side
   validation + safe parse), don't build it here.

5. **Duplicating a `SECTION_HEADER` is allowed** via the Duplicate toolbar
   button. Confirm this is intended and the copy is a valid section row (it is
   handled in the reducer's non-`DATA` branch). Likely fine — note the decision.

---

## Triage protocol (how to keep this bounded)

For each finding, classify and act:

| Class | Action |
| ----- | ------ |
| Correctness bug (wrong/invalid row from an action or render) | **Fix now.** |
| `data-model.md` invariant violation | **Fix now**, or record an explicit owned decision if it is genuinely a policy choice (e.g. finding #1). |
| `code-standards.md` violation, cheap | **Fix now.** |
| Depends on Step 4/5+/6/10+ surfaces | **Log** as an input to that step. |
| Pill ✕ / caret / focus polish | **Log** for Step 4 — do not over-polish. |
| Scope-for-improvement / nice-to-have | **Log** as a tracked follow-up. |

A fix is in-bounds only if it adds no new action and no new surface and keeps the
diff small. If a "fix" starts to grow into a feature, stop and log it instead.

---

## Done when

1. Every surface in **Review surfaces** (A–I) has been read against
   `data-model.md` and `code-standards.md`, and each **Candidate finding** (1–5)
   is confirmed and classified.
2. All correctness and standards issues are fixed in place; the diff stays small
   and introduces no new reducer action and no new UI surface.
3. Every not-fixed-now item is logged as a tracked follow-up in
   `progress-tracker.md` (with the step that will own it), so nothing is lost.
4. `200` is still only `MAX_TEMPLATE_ROWS` — no stray literal crept in.
5. The Step 1–2 invariants still hold after the fixes: `id` stable/never reused,
   `key` unique and not rewritten by label edits, reducer pure, cap unbreakable
   from any path, local React state only.
6. `npm run typecheck`, `npm run lint`, and `npm run build` all pass clean.
7. Re-verify the core Step 2 flows still work in the real embedded app (author
   "Up to `[pill]` hours", edit segments, remove pill → text merges, add/section/
   duplicate below active, gutter delete, bottom Add row appends, cap blocks all
   three) — a review must not regress what it reviewed.
8. `progress-tracker.md` updated to mark Step 3 complete and point at Step 4
   (Claude-style inline pills).

## Open questions to resolve during the review

- **Label → key policy** (finding #1): derive the slug from the label (and when —
  first edit / blur / Save), or keep opaque `row_N` keys and delete `slugifyKey`?
  This affects the comparison-readiness invariant and Step 6 serialization.
- **Section full-width** (finding #2): is spanning both data columns the intended
  look, and does the column header row need a matching treatment when sections
  are present?
- Are there any reducer edge cases not covered by the candidate list — e.g.
  inserting between two pills, an all-empty value, or duplicate-then-edit-label —
  that change `key` uniqueness or `valueParts` shape unexpectedly?
