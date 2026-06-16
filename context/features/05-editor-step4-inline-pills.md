# Editor Step 4 — Claude-style inline pills + hard-break multiline

## Goal in one sentence

Replace the chip-plus-✕ pill with an inline, **link-styled token** that behaves
like a Claude desktop file-reference — blue link-like text, a light hover
background, a slightly darker "caret-on-it" background, and a tooltip carrying its
`namespace · key` (METAFIELD) or field source (SHOPIFY_FIELD) — **deleted as a
single unit by Backspace/Delete** (no per-pill ✕); and on that same surface, let
a value hold **author-intended hard line breaks** (`LINE_BREAK`) so a "Features"
value can list one item per line.

## Why this is now

The pill's interaction model **and** the editing surface's caret model must be
**final before the field picker (Step 5+) starts inserting pills into it** — every
later picker step (modal shell → native fields → search → fetch → live metafields)
drops a complete pill into _this_ surface at the merchant's caret, so caret,
deletion, and focus behavior have to be settled first. This is genuinely the hard
part again: the caret handling Step 2 deferred and Step 3 explicitly logged
(finding #3). Multiline (`LINE_BREAK`) rides along here as **sub-step 4.4** rather
than a standalone step because it lives on the exact same `contenteditable`
surface and shares Step 4's caret machinery — splitting it out would mean building
the caret model twice.

## Foundation carried from Steps 1–3

- A value is an ordered `ValuePart[]` in [rows.ts](app/utils/rows.ts). Through
  4.1–4.3 the **shape is unchanged** (`TEXT` / `SHOPIFY_FIELD` / `METAFIELD`,
  `data-model.md` §6–7); those sub-steps change only **how the array is rendered
  and edited**. **4.4 is the one exception** — it adds a `LINE_BREAK` member to
  the union (see 4.4).
- **Deletion reuses `REMOVE_VALUE_PART { id, partIndex }`** — it already drops a
  part and runs `normalizeValueParts` (merge adjacent TEXT, guarantee ≥1 TEXT).
- Text editing still flows through `SET_VALUE_TEXT { id, partIndex, text }`.
- **Pills are now created complete — the placeholder pill is retired.** The
  pick-then-insert decision (2026-06-15) reversed the old insert-then-fill model:
  a pill is only ever rendered as a finished `SHOPIFY_FIELD` (`Field · <field>`)
  or `METAFIELD` (`Metafield · <key>`) token. There is **no `· choose field`
  empty state** to style or guard, and no incomplete reference can reach the
  storefront. So `placeholderMetafieldPart()` and the append-only
  `INSERT_VALUE_PART` path that seeded it are **dead after this slice**; they are
  removed when **Step 5** lands the modal + the caret-aware insert (4.4) that
  replaces them. **Clicking a token does nothing yet** — opening the modal is
  Step 5; reopening it pre-filled to **Update** a field is Step 6.
- **Verifying Step 4 without the picker:** because the real insert path is the
  Step 5 modal, seed a **complete sample pill** in the editor's initial state
  (e.g. a `METAFIELD custom/battery_life` inside "Up to `[pill]` hours") so the
  token's render/hover/caret/delete behavior is exercisable on its own. Do **not**
  reintroduce a placeholder insert button as a shortcut — the token must be
  verified in its final, always-complete form.
- The Step 2 Polaris workarounds are **retired here**: the `strong`-tone
  `<s-chip>` + explicit ✕ button is exactly the surface this step replaces — do
  not carry them forward (see [[polaris-web-component-gotchas]]).

## What changes (architecture)

The value cell's row of per-segment native `<input>`s + chip pills becomes **one
inline editable surface** (`contenteditable`):

- `TEXT` parts → editable text runs (text nodes).
- `METAFIELD` / `SHOPIFY_FIELD` parts → **atomic, non-editable token spans**
  (`contenteditable="false"`), styled as link tokens.
- `LINE_BREAK` parts (4.4) → an atomic `<br>`, rendered identically in the editor
  and on the storefront.

DOM order = `valueParts` order; the caret moves across text and **over** tokens
and breaks as one continuous flow. This is the consolidation logged as the Step 3
caret follow-up (finding #3) — it lives here, not in the review.

---

## Sub-steps (build and verify one at a time)

Chain: **render the token → consolidate the surface → keyboard-delete → hard-break
multiline**. Each builds clean (`npm run typecheck` + `lint` + `build`), is
visually verifiable on its own, and 4.1–4.3 add **no reducer action** — so a
regression points at exactly one sub-step. The single new reducer action lands in
**4.4**.

### 4.1 — Inline link-styled token + states + tooltip (presentation only)

Replace the `<s-chip color="strong">` pill with an inline **link-styled token**
(a styled `<span>`, not a chip) and define its visual states in scoped CSS, while
the rest of the cell is still input-based (work on the existing `.cell` flex
flow):

- **Resting:** blue link-like text, no border, sitting inline in the value flow.
- **Hover (mouse):** light-blue background.
- **Caret-on (deletion target):** a slightly darker background — shown when the
  caret sits immediately before/after the token (wired live in 4.3; in 4.1 prove
  it with a `data-*` attribute toggled by hand).
- **Tooltip on hover:** `namespace · key` for METAFIELD (e.g.
  `custom · battery_life`), the field source for SHOPIFY_FIELD. (No
  "choose field" hint — pills are always complete now.)

Colors come from **Polaris color tokens** (CSS custom properties) — an
interactive/link text token and a subdued/info surface token — confirmed against
the current CDN build; **no hardcoded hex** (the module stays `currentColor`/
token-only). Keeping the small Step 2 field icon is optional — the Claude
reference is text-forward; decide in-browser. The ✕ button stays operational
through 4.1 so removal isn't lost mid-rework; **4.3 removes it.**

**Verify:** a token renders as inline blue link text; hover shows the light
background and the tooltip; the `data-*`-driven "caret-on" state shows the darker
background. No reducer changes.

### 4.2 — Consolidate per-segment inputs into one `contenteditable` surface

Replace the N `<input>`s + token spans with **one `contenteditable` host** that
renders text runs as text nodes and tokens (4.1's styled spans) as atomic
`contenteditable="false"` spans:

- On input, re-derive the changed TEXT run and dispatch `SET_VALUE_TEXT` for its
  part index (DOM order = part index). Tokens are inert to typing.
- The surface is **uncontrolled while typing**: let the browser own the caret on
  keystrokes, and only re-render from `valueParts` (restoring the caret) when
  parts are **added/removed**, so React's render does not fight the native caret.
  _(This is the hard part — see Open questions.)_
- **Guard IME:** do not sync mid-composition — listen for
  `compositionstart`/`compositionend` and reconcile only on composition end (CJK
  and accent input must not break).
- **One accessible surface:** a single `role` + `aria-label` on the host (this
  fixes the duplicate-`aria-label` follow-up), and each token carries its own
  accessible name so SR users hear e.g. "Metafield custom battery_life" when
  arrowing across.

**Verify:** "Up to `[token]` hours" renders as one continuous line; typing
before/after/between tokens edits only the correct TEXT part; the caret/focus is
**stable** across edits (the Step 3 caret-loss follow-up is gone); clicking
anywhere in the cell places the caret (the fiddly empty-segment problem is gone).

### 4.3 — Keyboard-delete a token as one unit; remove the ✕

Wire Backspace/Delete so a token is removed as a **single unit**, like a
character — and write the handler against **any atomic non-TEXT part**, not just
tokens, so 4.4's `LINE_BREAK` deletion comes for free:

- Backspace with the caret **immediately after** an atomic part (or Delete
  **immediately before** it) → `REMOVE_VALUE_PART` for that part's index;
  `normalizeValueParts` merges the surrounding TEXT and guarantees ≥1 TEXT.
- A selection that **spans** an atomic part deletes it too.
- **Remove the per-pill ✕ button entirely** — the token is now deleted only from
  the keyboard (and re-pickable later via the Step 5 modal).
- Reflect the 4.1 "caret-on" darker state **live** as the caret lands beside a
  token, so the merchant sees what the next Backspace will remove.

**Verify:** caret just after a token + Backspace removes the whole token and the
text merges; Delete just before it does the same; a span-selection delete removes
it; ≥1 TEXT part always remains; there is **no ✕ control anywhere**; deletion
still dispatches only `REMOVE_VALUE_PART`.

### 4.4 — Hard-break multiline (`LINE_BREAK`)

Let a value carry **author-intended** line breaks on the same surface (soft-wrap
of long text already happens for free via CSS — `LINE_BREAK` is only for breaks
the merchant types). This is the one place Step 4 touches the data shape and adds
a reducer action.

- **Data shape:** add `| { type: "LINE_BREAK" }` to the `ValuePart` union in
  [rows.ts](app/utils/rows.ts) (matches `data-model.md` §7). It carries no `text`
  and no dynamic reference.
- **Insert at the caret:** Enter (and Shift+Enter — there is no paragraph concept
  in a value cell, so both map to a hard break) inserts a `LINE_BREAK` **at the
  caret**. `preventDefault` the browser's native Enter so the `contenteditable`
  does not inject its own `<div>`/`<br>`; dispatch the new action below and
  re-render from `valueParts`, placing the caret after the break.
- **New reducer action — caret-aware insert/split.** The existing
  `INSERT_VALUE_PART` only **appends**, so it cannot place a part at the caret or
  split a TEXT run. Add one action — e.g.
  `INSERT_VALUE_PART_AT { id, partIndex, offset, part }` — that splits the TEXT at
  `partIndex` at character `offset`, inserts `part` between the halves, then runs
  `normalizeValueParts`. The editor computes `(partIndex, offset)` from the DOM
  caret `Range` and dispatches **plain numbers**, so the reducer stays pure and
  DOM-free (Step 1 invariant). For 4.4, `part = { type: "LINE_BREAK" }`.
  **This same action is what Step 5 reuses to drop a picked pill at the saved
  caret** (`part` = the `SHOPIFY_FIELD` / `METAFIELD`) — one action serves both
  line break and pill insert.
- **Delete:** a `LINE_BREAK` is an atomic non-TEXT part, so 4.3's
  keyboard-delete removes it via `REMOVE_VALUE_PART` and `normalizeValueParts`
  re-merges the now-adjacent TEXT — no extra code if 4.3 was written generally.
- **Normalize:** `normalizeValueParts` needs **no change** — it already treats any
  non-TEXT part as a merge boundary (so two TEXT runs split by a `LINE_BREAK` stay
  separate) and never strips non-TEXT parts. Confirm the ≥1-TEXT guarantee still
  holds for a value like `[TEXT, LINE_BREAK, TEXT]`.
- **Emptiness is whole-row, never per line (`data-model.md` §10):** `LINE_BREAK`
  carries no content and is ignored when judging whether a row is empty. The
  editor adds **no per-line hide logic**; `hideWhenEmpty` is unchanged.
- **WYSIWYG parity:** the editor renders the break exactly as the storefront will
  (`<br>`); a `LINE_BREAK` never counts toward the 200-row cap (only rows do) and
  is product-agnostic, so it does not affect row `key` alignment or the
  comparison-readiness invariant.

**Verify:** type "1000 nits max brightness (typical)", press Enter, type "1600
nits peak brightness (HDR)" → two visual lines in **one** value cell, **one** row
(the `Rows: N / 200` counter does not change); Backspace at the start of the
second line removes the break and rejoins the lines; the value round-trips to
`[TEXT, LINE_BREAK, TEXT]` in `valueParts`; a value of only TEXT + `LINE_BREAK`
always renders (never treated as empty).

---

## Reducer actions

4.1–4.3 add **none** (render + caret/selection handling + scoped CSS only). 4.4
adds **one** — the caret-aware insert/split — shared with Step 5:

| Interaction                        | Reducer action                                     |
| ---------------------------------- | -------------------------------------------------- |
| Edit a TEXT run                    | `SET_VALUE_TEXT` (part-indexed) — existing         |
| Delete a token or line break       | `REMOVE_VALUE_PART` (+ `normalizeValueParts`) — existing |
| Insert a line break at the caret   | **new** caret-aware insert/split (4.4)             |
| Insert a picked pill at the caret  | same **new** action (Step 5 reuses it)            |

The append-only `INSERT_VALUE_PART` and `placeholderMetafieldPart()` become dead
once pick-then-insert lands; remove them with Step 5's modal, not before (Step 4
still seeds its sample pill in initial state).

## What Step 4 does *not* own (boundary with Step 5+)

Pick-then-insert keeps the picker **entirely outside** this `contenteditable`, so
Step 4 never has to model field selection inside the caret flow. Step 4 owns the
**surface** (render, caret, keyboard-delete, line breaks) and the **caret-aware
insert action**. It does **not** own:

- The **Insert field** toolbar button, the focus-trapped **modal**, or
  caret save/restore around it → **Step 5**.
- Click-a-pill-to-reopen-the-modal-pre-filled → **Update** → **Step 6**.
- Any field data (native list, search, metafield fetch, live data) →
  **Steps 6–9**.

## Step 3 follow-ups this step resolves

The three items tagged **[Step 4]** in `progress-tracker.md`:

- **Caret/focus loss on pill remove & after insert (finding #3)** — fixed by the
  single `contenteditable` surface (4.2) owning caret/selection.
- **Duplicate `aria-label`s on multi-TEXT cells** — fixed by one labelled surface
  + per-token accessible names (4.2).
- **Empty TEXT segment fiddly to click** — fixed by one continuous surface (4.2);
  the deferred "auto-focus the trailing segment after insert" is no longer needed
  (the caret simply stays in the surface).

## Explicitly out of scope (later steps)

- **Insert field modal + caret save/restore** (the pick-then-insert container) →
  **Step 5**. It is a **modal, not a popover** — room for the growing
  search + native-fields + live-metafields content and zero positioning math in
  the embedded-admin iframe (see [[polaris-web-component-gotchas]]).
- Native Shopify fields / search / metafield fetch / live data, and
  click-a-pill-to-**Update** → **Steps 6–9**.
- Drag reorder + keyboard reorder → **Steps 10–11** (the gutter `⠿` stays inert).
- Clipboard paste → **Steps 12–13**.
- Save / persistence / server re-validation → first slice after the editor. Step 4
  is still local React state only — nothing persists.
- Any inline rich formatting, links, or widgets (links are the roadmap's Phase 4
  URL field; star-rating widgets are out). A full editor framework (Lexical) was
  considered and **rejected** — no committed MVP feature justifies it.

## File placement (unchanged from Steps 1–3)

- Value-cell render + caret/selection handling stays co-located with the editor in
  [SpecTableEditor.tsx](app/routes/app.templates_.$id/SpecTableEditor.tsx)
  (promote to `app/components/` only if a second route needs it —
  `code-standards.md`).
- Token + state styling in
  [SpecTableEditor.module.css](app/routes/app.templates_.$id/SpecTableEditor.module.css),
  scoped to the component, **Polaris color tokens only, no hardcoded hex**.
- The `LINE_BREAK` union member and the caret-aware insert/split action live in
  [rows.ts](app/utils/rows.ts) (framework-free, covered by `rows.test.ts`).
- If DOM↔`valueParts` parsing grows (mapping a caret `Range` to `(partIndex,
  offset)`, or serializing the surface back to parts), put it in a pure,
  framework-free helper in `app/utils/` so it stays unit-testable — but keep it
  minimal.

## Open questions

- **Uncontrolled-while-typing vs. controlled re-render (4.2):** the exact rule for
  when React re-renders the surface from `valueParts` (only on add/remove of
  parts) vs. lets the browser own the caret (on keystrokes), and how the caret is
  saved/restored across a structural re-render. This is the step's main risk.
- **Caret `Range` → `(partIndex, offset)` mapping (4.4 / Step 5):** the precise
  helper that turns a DOM selection into the reducer's plain-number coordinates,
  including the caret-immediately-beside-a-token boundary cases.

## Done when

1. Sub-steps 4.1–4.4 each pass their verify check.
2. The pill is an inline link-styled token (link-blue text, light hover bg, darker
   caret-on bg, tooltip carrying `namespace · key` / field source) and is always
   **complete** — there is **no per-pill ✕ and no "choose field" state anywhere**.
3. A token is deleted as a single unit by Backspace/Delete; text editing and
   token deletion flow through the existing `SET_VALUE_TEXT` / `REMOVE_VALUE_PART`;
   the **only** new reducer action is the caret-aware insert/split (4.4), reused
   by Step 5.
4. A value can hold **author-intended hard line breaks** via `LINE_BREAK`: Enter
   inserts one at the caret, Backspace rejoins, breaks render identically in
   editor and storefront, never count toward the 200-row cap, and never trigger
   per-line hide logic (`hideWhenEmpty` stays whole-row).
5. The three Step 3 **[Step 4]** follow-ups are resolved (caret/focus stable,
   single accessible labelled surface, no fiddly empty segment).
6. **No hardcoded hex** — token colors are Polaris tokens / CSS custom properties;
   the module stays token/`currentColor`-only.
7. Accessibility holds: the surface and every token are keyboard-reachable and
   screen-reader labelled; IME/composition input is not broken.
8. `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:run`
   all pass; `rows.test.ts` covers the new `LINE_BREAK` member and the caret-aware
   insert/split action.
