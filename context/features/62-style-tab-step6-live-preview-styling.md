# Feature 57 · Step 6 — Style tab: live styling in the device previews

## Goal in one sentence

Feed the engine's live `styling` through the Step 2 presentation mapping into the preview
iframe's document — modifier classes on the `.appx-spec-table` wrapper, CSS vars in a `<style>`
rule — so changing a Style-tab knob **repaints the Desktop / Tablet / Mobile previews
instantly**, making the Step 5 Dividers control (and every knob Steps 8/10 add) visible for the
first time.

## Where this sits (feature 57 map)

Feature 57 is the **Style tab (Reshell Phase B)** — binding spec locked 2026-07-18 in
`admin-screen-plan.md` §Tab 2 + `data-model.md` §5/§10. The steps (B1 = 1–12, B2 = 13–14,
B3 outlined):

1. Pure styling domain module — **COMPLETE** (`57-…`, 2026-07-18)
2. Pure presentation mapping — **COMPLETE** (`58-…`, 2026-07-18)
3. Storefront stylesheet rules (dormant) + mobile-stacked default — **COMPLETE** (`59-…`, 2026-07-18)
4. `add_table_styling` migration + server persistence — **COMPLETE** (`60-…`, 2026-07-18)
5. Engine styling state + Dividers control + Save round-trip — **COMPLETE** (`61-…`, 2026-07-19)
6. **Live styling in the device previews ← THIS DOC**
7. Metaobject serialization + Liquid emission (pipe complete)
8. Remaining non-structural knobs
9. Collapsible sections (one-table-per-section `<details>` markup)
10. Colors + Typography groups
11. Live styling on the editing grid (visual knobs)
12. Reset + a11y + docs + B1 sign-off
13. Built-in preset constants + in-rail preset cards
14. Creation gallery popup

## Why this is its own step

- **It closes the feedback loop the Style tab exists for.** After Step 5 a merchant can change
  Dividers and see it *survive a reload* — but nothing repaints. The tracker calls this out
  explicitly as "persists but does not yet render" so it doesn't read as half-finished. This
  step is what finally makes the knob **visible**: knob → preview, live, no save required.
- **The wiring is total over all of `StylingValues`, so it lands once.** The Step 2 mapping is
  a total function of the whole resolved value — classes for every layout knob, vars for every
  nullable field. Wiring the whole value through now means Steps 8/10 add *controls only*; the
  previews react to every future knob with **zero further preview work**. That's worth landing
  and verifying in isolation before eighteen more controls arrive.
- **It also retroactively pays down a feature 49 delta.** Phase D shipped with "no live
  `TableStyling`" and "no mobile stacked layout" as recorded deltas (`56-…`). Turning styling on
  activates Step 3's `--mobile-stacked` media-query rules inside the 375px frame — the Mobile
  preview shows the stacked label-over-value layout for the first time, exactly what the
  storefront will do after Step 7.

## Foundation carried

- **`engine.styling`** (Step 5) — the whole resolved `StylingValues` in one state cell, already
  exposed on the engine return "for the preview in Step 6". Changing any field re-renders the
  editor, and `SpecTablePreview` already recomputes its `srcDoc` on every render — so liveness
  is free once the value is threaded through.
- **The Step 2 mapping, written for this step and consumed by nothing yet**
  (`app/utils/tableStylingCss.ts`, grep-verified imported only by its own test):
  `stylingToModifierClasses` (every knob's BEM class, defaults included, stable order),
  `stylingToCssVars` (key only when non-null; all-inherit → `{}`), and
  `formatCssVarDeclarations` — whose doc comment already names this step's `<style>` block as
  one of its two consumers (the other being Step 7's inline `style` attribute).
- **The Step 3 stylesheet is live-but-unreferenced.** Every modifier rule set already sits in
  `spec-table.css` — and therefore in the byte-equal `previewStyles.ts` copy already inlined
  into the iframe `<head>`. Step 3's devtools experiment proved that hand-adding
  `--dividers-stripes` / `--layout-stacked` flips the rendering instantly. This step makes the
  markup emit those classes for real; **no CSS changes**.
- **The preview document contract** (`specTablePreviewHtml.ts`): pure string-in/string-out,
  byte-identical across device views (Step 5 of feature 49 — a device toggle must not reload
  the frame), strict CSP, height shim (Step 6 of feature 49) that re-measures on document load
  **and** on reflow via `ResizeObserver` — so a styling repaint re-heights automatically.
- **The security posture holds by construction.** `parseStylingValues` is the one trust
  boundary (loader-resolved values only); the mapping accepts `StylingValues`, never `unknown`,
  and its outputs are whitelist-shaped (Step 2's injection shape-guard test). Nothing new is
  escaped here because nothing unparsed can reach here.

## What changes (architecture)

**Two pure-function extensions + one prop thread. Client-only: no server, schema, CSS, Liquid,
metaobject, or dependency change. `spec-table.css` / `previewStyles.ts` are read, not edited —
the drift guard must stay green untouched.**

### 1 · Wrapper modifier classes (`renderSpecTableHtml`, extended)

- Signature becomes **`renderSpecTableHtml(rows, styling: StylingValues)`** (required — a
  resolved value always exists; optionality would just re-invent `DEFAULT_STYLING_VALUES` at
  the call site).
- The one markup change: the wrapper emits
  `class="appx-spec-table ${stylingToModifierClasses(styling).join(" ")}"`. Modifier classes
  belong **on the block element** (Step 3's compound selectors require it), so they cannot live
  at the document level. This anticipates exactly what the Step 7 Liquid wrapper will emit —
  the renderer stays the hand-mirrored fidelity contract, now leading the Liquid by one step
  instead of trailing it (note this in the file's header comment).
- Row/cell rendering, escaping, the hideWhenEmpty gate, and the empty-array → `""` contract are
  untouched.

### 2 · CSS vars in the document head (`renderSpecTablePreviewDocument`, extended)

- Signature becomes **`renderSpecTablePreviewDocument(rows, styling: StylingValues)`**, passing
  `styling` through to `renderSpecTableHtml`.
- A **second `<style>` block** after the existing `PREVIEW_DOCUMENT_STYLES` one, containing the
  single rule `` `.appx-spec-table { ${formatCssVarDeclarations(stylingToCssVars(styling))} }` `` —
  vars on the block so they inherit down to `__table`, where Step 3 reads the typography vars
  (the "em multiplies the theme base once" placement). Per the Step 2 lock: **the preview uses
  a `<style>` block, Step 7's Liquid uses the inline `style` attribute** — same
  `formatCssVarDeclarations` output either way, so the two renderers cannot drift on the join.
- **Emitted unconditionally**, even when all-inherit produces an empty rule body — one document
  shape, no conditional branch, and the all-default case stays trivially assertable.
- The Step 7 empty state is unaffected (no wrapper renders, classes are moot; the var rule is
  harmless).

### 3 · Prop thread (`SpecTablePreview.tsx` / `SpecTableEditor.tsx`)

- `SpecTablePreview` gains `styling: StylingValues`, passed straight into
  `renderSpecTablePreviewDocument`. No new state, no effects — the existing
  recompute-`srcDoc`-per-render behavior *is* the liveness mechanism.
- `SpecTableEditor` passes `styling={engine.styling}` alongside the existing `rows`.
- **Known, accepted behavior:** a styling change produces a new `srcDoc` string → the iframe
  **reloads its document** (unlike a device toggle, which changes only the outer width). The
  height shim re-posts on load, so the frame re-sizes; a brief repaint flash is acceptable at
  this step (same class of event as a row edit, which already reloads the frame).

### What deliberately does NOT change

- **The view-independence invariant holds**: the document is a function of `(rows, styling)`,
  never of the device view — the byte-identical-across-views guarantee (and its test) stands,
  so a device toggle still doesn't reload the frame. The Mobile difference comes from Step 3's
  `@media (max-width: 749px)` reacting to the 375px frame width, not from per-view markup.
- **`sandbox`, CSP, the height bridge, device widths** — all untouched.
- **`--collapsible` stays unreachable**: no control sets `sectionsCollapsible` yet (Step 9), so
  the presence-flag class never emits; the CSS-contract test's known-absent exemptions stand.

## Locked decisions

- **Classes on the wrapper via `renderSpecTableHtml`; vars via a head `<style>` rule on
  `.appx-spec-table`.** Both consume the Step 2 mapping verbatim — no styling logic, no string
  literals for class names or var names anywhere in the preview layer.
- **The whole resolved value is wired, not just Dividers.** The mechanism must be total on day
  one so Steps 8/10 ship controls without touching the preview.
- **`styling` parameters are required `StylingValues`** — never optional, never `unknown`. A
  caller that doesn't have a resolved value has a bug upstream.
- **The var `<style>` block is always emitted**, empty rule body included.
- **A styling change reloading the iframe document is accepted**; the device-toggle
  no-reload guarantee is the invariant that must not regress.
- **The Mobile preview stacking by default is a feature, not a regression** — it is Step 3's
  locked mobile-stacked default becoming visible, and it previews what the storefront will do
  after Step 7. The feature 49 docs' "no mobile stacked" delta is superseded by this step
  (tracker note; the `56-…` doc itself stays as history).
- **No CSS edits** (`spec-table.css`, `previewStyles.ts`) — if a Step 3 rule proves wrong when
  it first renders here, that is a Step 3 revision with its own drift-guard re-copy, not an
  inline fix.

## What this step does *not* own (boundary with later steps)

- **The storefront** — metaobject `styling` field, Liquid class/var emission → **Step 7**. A
  merchant sees the styled preview but an unchanged storefront until then; **the preview leads
  the storefront by one step** — say so in the tracker so it isn't filed as a bug.
- **The other structural knobs' controls** (row layout, mobile layout, section header style,
  density) → **Step 8**; **collapsible markup** (`<details>`, the `--collapsible` rules, the
  CSS-contract exemption shrink) → **Step 9**; **colors + typography controls** → **Step 10**
  — all of which this step's plumbing already renders the moment their controls exist.
- **The editing grid** reacting to styling → **Step 11** (the grid keeps its editor look).
- **Reset + a11y pass** (incl. Step 3's carried stacked-mode table-semantics item) → **Step 12**.
- **Any change to** `tableStyling.ts`, `tableStylingCss.ts`, `spec-table.css`,
  `previewStyles.ts`, `previewBridge.ts`, `deviceView.ts`, `useRowEngine.ts`,
  `template.server.ts`, `schema.prisma`, or the `extensions/` tree.

## Testing

### Unit (`specTablePreviewHtml.test.ts`, extended)

The renderer is pure, so the whole contract stays Node-testable; existing assertions gain a
`styling` argument (pass `DEFAULT_STYLING_VALUES` to keep their intent).

1. **Default classes** — with `DEFAULT_STYLING_VALUES`, the wrapper's class list is exactly
   `appx-spec-table` + `stylingToModifierClasses(DEFAULT_STYLING_VALUES)` in order (asserted
   against the mapping call, not a hand-typed list).
2. **Knob flip** — `rowDividerStyle: "STRIPES"` swaps in `--dividers-stripes` (and
   `--dividers-lines` is absent); a fully-overridden value renders every expected modifier.
3. **Vars rule** — all-inherit emits the `.appx-spec-table { }` rule with an empty body; a
   non-null `borderColor` (etc.) emits exactly `formatCssVarDeclarations(stylingToCssVars(v))`
   inside it; the rule sits in its own `<style>` after `PREVIEW_DOCUMENT_STYLES`.
4. **Fidelity intact** — escaping, hideWhenEmpty, section rows, empty-array → `""`, and the
   empty-state substitution all unchanged under a non-default styling.
5. **View-independence** — the document remains byte-identical across device views for a fixed
   `(rows, styling)`; **styling-dependence** — two different stylings produce different
   documents (the liveness mechanism, pinned).
6. **Drift guards stand untouched** — the `previewStyles.ts` byte-equality test and
   `specTableCssContract.test.ts` pass with zero edits (this step must not edit CSS).
7. Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
   npm run build` all green.

### Live verification (the step's headline is visual — this is the real proof)

On the dev store editor, on a **real** template with sections + a long-enough row set:

1. Open a preview (Desktop) with all-default styling → **renders identically to before**
   (default modifier classes select the restated-default rule sets; Step 3 proved them
   equivalent to the base rules).
2. Style tab → Dividers **Stripes** → the Desktop preview repaints **immediately, unsaved**:
   even rows banded, `nth-child` counting section-header rows correctly (the Step 3 stripe
   decision, first render in anger).
3. Dividers **None** → the hairline rules disappear — the exact "expected non-behavior"
   Step 5's sign-off logged is now behavior.
4. **Mobile** view (375px) → the table renders **stacked** (label over value, pairs reading as
   units, label divider dropped) — Step 3 Part C live for the first time; **Tablet** (768px)
   stays two-column (749px breakpoint puts it on the desktop side). Toggle back to Desktop —
   no reload on toggle (view-independence held).
5. **Auto-height** — a styling change that alters content height (Stripes/None, mobile
   stacking) re-heights the frame with no inner scrollbar and no oscillation.
6. **Dirty/save regression** — the repaint happens while dirty; **Discard** reverts both the
   control and the preview (remount reseed); Save + reload renders the persisted styling in
   the preview from the loader path.
7. **Empty state** — zero-row template still shows the friendly message, styled knobs or not.
8. **Boundary checks** — the live storefront product page still renders **unstyled/unchanged**
   (Step 7 not shipped); the editing grid is unchanged (Step 11); console clean throughout
   (CSP must not block the new inline `<style>`; no hydration or Polaris warnings).

## File placement (per `code-standards.md`)

- Markup + document changes → **`app/routes/app.templates_.$id/specTablePreviewHtml.ts`**
  (both renderers extended in place).
- Prop thread → **`app/routes/app.templates_.$id/SpecTablePreview.tsx`** and
  **`SpecTableEditor.tsx`** (one prop each).
- Tests → **`app/routes/app.templates_.$id/specTablePreviewHtml.test.ts`** (extended).
- **Unchanged:** `app/utils/tableStyling.ts`, `app/utils/tableStylingCss.ts`,
  `previewStyles.ts`, `previewBridge.ts`, `deviceView.ts`, `useRowEngine.ts`, `StyleTab.tsx`,
  `EditorShell.tsx`, `route.tsx` loader/action, `template.server.ts`, `prisma/schema.prisma`,
  the entire `extensions/` tree, `package.json`.

## Done when

1. `renderSpecTableHtml` emits the mapping-derived modifier classes on the wrapper and
   `renderSpecTablePreviewDocument` emits the mapping-derived var rule — both total over
   `StylingValues`, no hand-typed class or var strings.
2. `engine.styling` is threaded to the preview; changing Dividers repaints all three device
   views live, unsaved; Discard/save/reload keep preview and control in agreement.
3. The Mobile preview renders Step 3's stacked layout; Desktop/Tablet all-default rendering is
   visually unchanged; the device toggle still swaps views without a document reload.
4. No server, schema, CSS, Liquid, metaobject, or dependency change shipped; both CSS drift
   guards pass unedited.
5. All new/updated tests green; full gate passes.
6. `progress-tracker.md` updated — feature 57 Step 6 complete, noting the **preview now leads
   the storefront** (styled preview, unchanged storefront until Step 7) and that the feature 49
   "no mobile stacked / no live TableStyling" deltas are superseded here; point at **Step 7
   (metaobject serialization + Liquid emission — the pipe complete)**.
