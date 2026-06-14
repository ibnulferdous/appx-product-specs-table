# Editor Step 4 — Claude-style inline pills (atomic, link-styled, keyboard-deletable)

## Goal in one sentence

Replace the chip-plus-✕ pill with an inline, **link-styled token** that behaves
like a Claude desktop file-reference — blue link-like text, a light hover
background, a slightly darker "caret-on-it" background, and a tooltip carrying its
`namespace · key` (METAFIELD) or field source (SHOPIFY_FIELD) — **deleted as a
single unit by Backspace/Delete from the keyboard** (no per-pill ✕), exactly like
a character of text.

## Why this is now

The pill's interaction model must be **final before the field picker (Step 5+)
starts inserting pills into it** — every later picker step (open popover → native
fields → search → fetch → live metafields) fills _this_ token, so its caret,
deletion, and focus behavior have to be settled first. This is genuinely the hard
part again: the caret handling Step 2 deferred and Step 3 explicitly logged
(finding #3). It adds no reducer action and no new data surface, so it stands
alone rather than hiding inside the review or the picker.

## Foundation carried from Steps 1–3

- The value shape is **unchanged** — a value is still an ordered `ValuePart[]` of
  `TEXT` / `SHOPIFY_FIELD` / `METAFIELD` (`data-model.md` §6–7). Step 4 changes
  only **how that array is rendered and edited**, never its shape, the reducer's
  actions, or the 200-row cap.
- **Deletion reuses `REMOVE_VALUE_PART { id, partIndex }`** — it already drops a
  part and runs `normalizeValueParts` (merge adjacent TEXT, guarantee ≥1 TEXT).
  No new reducer action.
- Text editing still flows through `SET_VALUE_TEXT { id, partIndex, text }`.
- The token is still a **placeholder** (no field chosen yet): it reads
  `Metafield · choose field` — `placeholderMetafieldPart()` mints an empty
  `namespace`/`key`, which the picker fills from **Step 6** on. **Clicking the
  token does nothing yet** — opening a popover is Step 5.
- The Step 2 Polaris workarounds being **retired** here: the `strong`-tone
  `<s-chip>` + explicit ✕ button is exactly the surface this step replaces — do
  not carry them forward (see [[polaris-web-component-gotchas]]).

## What changes (architecture)

The value cell's row of per-segment native `<input>`s + chip pills becomes **one
inline editable surface** (`contenteditable`):

- `TEXT` parts → editable text runs (text nodes).
- `METAFIELD` / `SHOPIFY_FIELD` parts → **atomic, non-editable token spans**
  (`contenteditable="false"`), styled as link tokens.

DOM order = `valueParts` order; the caret moves across text and **over** tokens
as one continuous line. This is the consolidation logged as the Step 3 caret
follow-up (finding #3) — it lives here, not in the review.

---

## Sub-steps (build and verify one at a time)

Chain: **render the token → consolidate the surface → keyboard-delete**. Each
builds clean (`npm run typecheck` + `lint` + `build`), is visually verifiable on
its own, and adds **no** reducer action — so a regression points at exactly one
sub-step.

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
- **Tooltip on hover:** `namespace · key` for METAFIELD (e.g. `custom · battery_life`),
  the field source for SHOPIFY_FIELD, and a "no field chosen yet" hint while the
  part is still a placeholder (empty `namespace`/`key`).

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
character:

- Backspace with the caret **immediately after** a token (or Delete **immediately
  before** it) → `REMOVE_VALUE_PART` for that token's part index;
  `normalizeValueParts` merges the surrounding TEXT and guarantees ≥1 TEXT.
- A selection that **spans** a token deletes it too.
- **Remove the per-pill ✕ button entirely** — the token is now deleted only from
  the keyboard (and re-pickable later via Step 5+).
- Reflect the 4.1 "caret-on" darker state **live** as the caret lands beside a
  token, so the merchant sees what the next Backspace will remove.

**Verify:** caret just after a token + Backspace removes the whole token and the
text merges; Delete just before it does the same; ≥1 TEXT part always remains;
there is **no ✕ control anywhere**; deletion still dispatches only
`REMOVE_VALUE_PART`.

---

## Reducer actions

**None added.** Step 4 is entirely in the value cell's render + caret/selection
handling and scoped CSS:

| Interaction        | Existing action used                          |
| ------------------ | --------------------------------------------- |
| Delete a token     | `REMOVE_VALUE_PART` (+ `normalizeValueParts`) |
| Edit a TEXT run    | `SET_VALUE_TEXT` (part-indexed)               |

Keep it this way. If DOM→state sync seems to want a coarser "replace all
`valueParts`" action, treat that as a **decision to record**, not a default — the
step's intent is _no new reducer action_ (see Open questions).

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

- **Field-picker popover** (open / anchor / focus-trap on token click) → **Step
  5**. Step 4 tokens are placeholders; clicking does nothing yet.
- Native Shopify fields / search / metafield fetch / live data → **Steps 6–9**.
  The token still reads "choose field" until then.
- Drag reorder + keyboard reorder → **Steps 10–11** (the gutter `⠿` stays inert).
- Clipboard paste → **Steps 12–13**.
- Save / persistence / server re-validation → **Step 6**. Step 4 is still local
  React state only — nothing persists.
- Any change to the `valueParts` shape, the reducer's actions, or the 200-row cap.

## File placement (unchanged from Steps 1–3)

- Value-cell render + caret/selection handling stays co-located with the editor in
  [SpecTableEditor.tsx](app/routes/app.templates_.$id/SpecTableEditor.tsx)
  (promote to `app/components/` only if a second route needs it —
  `code-standards.md`).
- Token + state styling in
  [SpecTableEditor.module.css](app/routes/app.templates_.$id/SpecTableEditor.module.css),
  scoped to the component, **Polaris color tokens only, no hardcoded hex**.
- No new pure helper is expected; if DOM↔`valueParts` parsing grows, a pure,
  framework-free helper in `app/utils/` is its home (kept testable) — but prefer
  to keep it minimal.

## Done when

1. Sub-steps 4.1–4.3 each pass their verify check.
2. The pill is an inline link-styled token (link-blue text, light hover bg, darker
   caret-on bg, tooltip carrying `namespace · key` / field source); there is **no
   per-pill ✕ anywhere**.
3. A token is deleted as a single unit by Backspace/Delete from the keyboard; text
   editing and token deletion both still flow **only** through the existing
   `SET_VALUE_TEXT` and `REMOVE_VALUE_PART` — no new reducer action.
4. The three Step 3 **[Step 4]** follow-ups are resolved (caret/focus stable,
   single accessible labelled surface, no fiddly empty segment).
5. **No hardcoded hex** — token colors are Polaris tokens / CSS custom properties;
   the module stays token/`currentColor`-only.
6. Accessibility holds: the surface and every token are keyboard-reachable and
   screen-reader labelled; IME/composition input is not broken.
7. `npm run typecheck`, `npm run lint`, and `npm run build` pass clean.
8. **Re-verify in the real embedded app** (dev store, behind Shopify auth —
   Claude-in-Chrome on the `shopify app dev` preview URL, see
   [[browser-verify-embedded-app]]): author "Up to `[token]` hours", arrow across
   the token, Backspace/Delete removes it as one unit and the text merges, hover
   shows the tooltip, the four visual states read correctly, no console errors.
   (Still local React state — nothing persists.)
9. `progress-tracker.md` updated to mark Step 4 complete and point at Step 5
   (field-picker popover shell).

## Open questions to resolve during build

- **React + `contenteditable` reconciliation:** confirm the "uncontrolled while
  typing, re-render only on structural change, restore the caret" model keeps the
  caret stable — this is the genuine risk of the step. Settle on one approach
  before building 4.3 on top of it.
- **Exact Polaris color tokens** for the link-blue text and the hover / caret-on
  surfaces in the current CDN build (the build has repeatedly differed from
  `@shopify/polaris-types` — see [[polaris-web-component-gotchas]]). If Polaris
  exposes no usable surface token, decide the token-only fallback (still no
  hardcoded hex) and comment why.
- **DOM→state sync:** is per-run `SET_VALUE_TEXT` + `REMOVE_VALUE_PART` sufficient
  for every caret operation (typing, splitting, merging across a token), or does a
  correct sync need a new "replace `valueParts`" action? Default: no new action;
  if one proves unavoidable, record the decision before adding it.
- **"Caret-on" semantics:** define precisely when a token shows the darker state
  (caret immediately before, immediately after, or either) to match the Claude
  reference.
- **Tooltip mechanics:** native `title` attribute vs. an accessible
  `aria-describedby` tooltip — pick the one that is both accessible and does not
  fight the `contenteditable` surface.
