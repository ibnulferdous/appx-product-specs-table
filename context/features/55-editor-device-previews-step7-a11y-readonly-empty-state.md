# Feature 49 · Step 7 — Device previews: a11y + read-only hardening + empty state + dynamic-pill affordance

## Goal in one sentence

Turn the preview from "renders correctly" into "reads correctly": give the inert **dynamic-field pills**
a clear placeholder look (so a merchant sees which values resolve per-product on the storefront), show
a friendly **empty state** instead of a blank frame when there are no rows to preview, and confirm the
preview is **accessible and unmistakably read-only** — all **without** touching the storefront-fidelity
markup/CSS, the Step 5 width, or the Step 6 height mechanism.

## Where this sits (feature 49 map)

Feature 49 makes the editor's **Desktop / Tablet / Mobile** toggle render read-only storefront
previews (Reshell **Phase D**). Locked design: a **sandboxed `<iframe>`** sized to each device width,
rendering **the storefront markup + the shared `spec-table.css`**; dynamic fields as **labeled pills**;
`TableStyling` + the mobile row-layout option deferred to the Style tab. The 8 steps:

1. ✅ Toggle swaps the stage (plumbing only) — `49-…`, shipped 2026-07-12.
2. ✅ Pure storefront-markup renderer (`renderSpecTableHtml`) — `50-…`, shipped 2026-07-12.
3. ✅ Render the markup in a sandboxed iframe (`SpecTablePreview.tsx`) — `51-…`, shipped 2026-07-12.
4. ✅ Load the shared storefront stylesheet into the iframe — `52-…`, shipped 2026-07-12.
5. ✅ Device width sizing (`previewDeviceWidth(view)`) — `53-…`, shipped 2026-07-12.
6. ✅ Content-driven iframe auto-height — `54-…`, shipped 2026-07-12.
7. **a11y + read-only hardening + empty state (incl. the dynamic-pill affordance styling) ← THIS DOC.**
8. Docs + full gate + live sign-off.

## Why this is its own step

- **It's the accumulated "affordance + polish" debt from Steps 3–6, and it's a compliance pass.** Every
  prior step explicitly deferred the dynamic-pill visual and the a11y/empty-rows work to here. This is
  the storefront-shopper-facing quality gate the app-store review cares about (CLAUDE.md priority #2:
  storefront correctness & **accessibility**). Grouping it keeps Steps 3–6 mechanically pure and lets
  this step be reviewed as one coherent UX/a11y unit.
- **The pill and the empty state are both "preview-only, never storefront" — a boundary that's easy to
  get wrong.** On a real product page a dynamic value resolves to **plain text** (no pill) and an empty
  template renders **nothing**. So neither the pill styling nor the empty-state message may leak into
  the storefront-fidelity layer (`renderSpecTableHtml` / the drift-guarded `SPEC_TABLE_CSS`). They live
  strictly in the **preview-only** ambient / document builder. Doing this as its own step makes that
  fidelity boundary explicit instead of smuggling merchant-facing chrome into the mirrored CSS.

## Foundation carried

- **The pill markup already exists** (Step 2): `<span class="appx-spec-table__dynamic-pill"
  title="…">Field · vendor</span>`. The storefront CSS has **no** such selector (it resolves to text),
  so a preview-only rule for it collides with nothing. Step 7 adds only the **styling**, not the markup
  or the label text (those stay the renderer's contract).
- **`previewStyles.ts` already separates** the drift-guarded `SPEC_TABLE_CSS` (byte-equal to the
  extension) from the preview-only `PREVIEW_AMBIENT`. Step 7's new rules go in the **preview-only**
  section, so the byte-equality drift guard is untouched.
- **`renderSpecTablePreviewDocument` already owns the preview document** (Steps 3/4/6). The empty-state
  substitution sits here — `renderSpecTableHtml` stays storefront-faithful (empty in → `""` out).
- **The iframe is isolated** (Steps 3/6): it has **no access** to the admin's captured Polaris
  `--appx-token-color`, so the preview pill **cannot** reuse the editor's blue token color — it must be
  styled self-contained. That's not a limitation to fight; a **neutral placeholder** look is the right
  meaning here (a value that resolves later), distinct from the editor's editable blue token.

## What changes (architecture)

**Preview-only CSS (pill + empty-state) added to the ambient + a preview-only empty-state substitution
in the document builder + an accessible-name tweak on the iframe. No renderer row-logic change, no
`SPEC_TABLE_CSS` change, no Step 5 width / Step 6 height / reducer / schema / dependency / server /
persistence / config / extension change.**

### `app/routes/app.templates_.$id/previewStyles.ts` — preview-only affordances

- Add a **preview-only** style section (a new constant, e.g. `PREVIEW_AFFORDANCES`, composed into
  `PREVIEW_DOCUMENT_STYLES` alongside `PREVIEW_AMBIENT`) — **explicitly NOT in `SPEC_TABLE_CSS`** (that
  stays byte-equal to the extension; the drift guard must keep passing).
- **`.appx-spec-table__dynamic-pill`** — a small inline chip: subtle neutral background, slight
  horizontal padding, rounded corners, slightly smaller/medium-weight text, so it reads as a
  **placeholder token** rather than resolved copy. Self-contained colors (the iframe can't see admin
  tokens); **WCAG AA (≥ 4.5:1)** text-on-chip contrast, verified by the chosen hex pair. No accent
  blue (that's the editor's editable-token meaning, not this).
- **`.appx-spec-table-preview-empty`** — the empty-state block: centered, muted ink, comfortable
  padding, a readable max-width. Light-surface colors (the preview is a deliberately light,
  storefront-like page — see "not owned").

### `app/routes/app.templates_.$id/specTablePreviewHtml.ts` — empty state (preview-only)

- In `renderSpecTablePreviewDocument`, compute the rows fragment as today, then: **if the fragment
  renders no rows** (contains no `<tr` — this covers **both** zero rows *and* "rows exist but all are
  hidden by `hideWhenEmpty`", since both produce no `<tr>`), substitute a preview-only empty-state block
  (`<div class="appx-spec-table-preview-empty"><p>…</p></div>`) for the body content. `renderSpecTableHtml`
  itself is **unchanged** (still returns the storefront-faithful fragment / `""`).
- The empty-state copy is general enough to fit both cases (zero rows and all-hidden), e.g. *"No spec
  rows to preview yet — rows with content appear here as they'd render on your storefront."* Escaped/
  static text; no interactive elements.
- Still pure (rows in → string out) and **view-independent** — the empty-state depends only on `rows`,
  not on device view, so the document stays **byte-identical across views** (the Step 5/6 invariant).

### `app/routes/app.templates_.$id/SpecTablePreview.tsx` — accessible name + read-only

- Refine the iframe's accessible name so AT users know it is a **preview**, **which device**, and that
  it is **read-only** — e.g. `title={\`Spec table preview — ${DEVICE_LABELS[view]}, read-only\`}`.
- No behavior change: the parent still only reads a height (Step 6); the frame stays
  `sandbox="allow-scripts"` (no forms/popups/downloads) and the content emits **no interactive
  elements** (pills are `<span>`s), so there is no keyboard trap and nothing focusable to mis-activate.

## The a11y pass (what's checked / added)

- **Framed table semantics** (already from Step 2, reaffirmed + kept): real `<table>`, `<th scope="row">`
  labels, `<th colspan="2" scope="colgroup">` section headers, document `lang="en"`, a `<title>`. Screen
  readers reading into the iframe get a properly-associated data table.
- **Accessible name** on the iframe conveys preview + device + read-only (above).
- **Contrast**: the new pill and empty-state colors meet WCAG AA on the preview's light surface (proven
  by the chosen values, not eyeballed).
- **No motion**: the Step 6 height is applied **instantly** (no CSS transition), so there is nothing to
  gate behind `prefers-reduced-motion`; Step 7 adds no animation.
- **The pill's meaning** is carried by its **visible label** ("Field · vendor" / "Metafield · key") plus
  its `title` tooltip — Step 7 does **not** change that text (renderer contract), it only makes the pill
  *look* like a placeholder. (A separate explanatory legend/caption was considered and **deferred** — it
  adds non-storefront chrome to the preview; revisit only if user testing shows the styled pill + label
  is still unclear.)

## Locked decisions

- **Pill + empty-state are preview-only** — their CSS goes in the ambient/preview section of
  `previewStyles.ts`, never in the drift-guarded `SPEC_TABLE_CSS`; the empty-state HTML goes in
  `renderSpecTablePreviewDocument`, never in `renderSpecTableHtml`. Storefront fidelity is preserved
  (dynamic → plain text; empty → nothing).
- **Pill styled self-contained + neutral** (no admin-token blue; the iframe can't see it anyway), **AA
  contrast**. Neutral placeholder ≠ the editor's editable-token look, by design.
- **Empty state triggers on "no `<tr>` rendered"** — covers zero-rows **and** all-hidden; rendered
  **inside the iframe** (the preview surface is the whole iframe), not as separate admin chrome.
- **Iframe accessible name** states preview + device + read-only.
- **No motion, no interactive elements, sandbox unchanged** (`allow-scripts` only) — read-only by
  construction, reaffirmed.
- **Renderer row-logic, `SPEC_TABLE_CSS`, Step 5 width, Step 6 height mechanism, config, extension all
  untouched**; the document stays byte-identical across views.

## What this step does *not* own (boundary with later / out of feature 49)

- **Final docs, the full-gate sweep, and live sign-off** → **Step 8**.
- **Real merchant theme fonts/colors, `TableStyling`, the mobile row-layout option, live dynamic-value
  resolution** → out of feature 49.
- **A dark-mode preview surface** → out. The preview is intentionally a **light, storefront-like page**
  (most storefronts are light and the storefront CSS assumes a light context); Step 7's colors target
  that light surface. A theme-accurate preview is a Style-tab concern.
- **A pill-explaining legend/caption, any preview max-height cap** → deferred / out (see above).

## Testing

### Unit (Node, pure)

Extend `specTablePreviewHtml.test.ts` (and assert the styles in `previewStyles`):

1. **Empty state — zero rows** — `renderSpecTablePreviewDocument([])` now contains the empty-state block
   (`appx-spec-table-preview-empty` + the copy) in the body, **not** an empty `renderSpecTableHtml`
   fragment; the Step 6 shim + CSP are still present; no `<tr>`; no `"undefined"`. (Updates the Step 6
   "empty rows" assertion, which expected a bare `<body>${shim}`.)
2. **Empty state — all rows hidden** — rows that all fail the `hideWhenEmpty` gate (blank + flagged)
   also yield the empty-state block (the "no `<tr>`" trigger covers this case, not just zero rows).
3. **Non-empty is unaffected** — a populated `rows` still renders the real table fragment (with `<tr>`),
   **no** empty-state block.
4. **`renderSpecTableHtml` unchanged** — it still returns `""` for `[]` and the empty-tbody wrapper for
   all-hidden (the storefront-fidelity contract did not move; the empty state is a document-level,
   preview-only addition).
5. **Pill affordance CSS present + storefront CSS clean** — `PREVIEW_DOCUMENT_STYLES` contains a
   `.appx-spec-table__dynamic-pill` rule, but **`SPEC_TABLE_CSS` does not** (the pill stays preview-only;
   the byte-for-byte drift guard against the extension file still passes).
6. **View-independence intact** — the document (empty or populated) encodes no device view; same rows →
   identical string.

(The rendered pill look, the empty-state visual, contrast, and the iframe's accessible name are
**browser-/code-verified** — CSS painting and the cross-origin iframe `title` can't be asserted in the
Node env, per the project's testing strategy.)

### Browser (embedded app, per [[browser-verify-embedded-app]])

Per the memory's Step 6 note, verify via visual tells (the preview iframe can't be measured cross-origin):

1. **Dynamic pills read as placeholders** — on a template with dynamic fields (e.g. Motorola Moto G35
   5G, whose Brand/Model use a `vendor` field), the "Field · vendor" / "Metafield · …" values now render
   as **styled chips** clearly distinct from plain cell text, legible (AA) on the white preview, across
   Desktop / Tablet / Mobile.
2. **Empty state** — on a **zero-row** template (create a new template, or a scratch one — **clean it up
   after**), a device view shows the friendly empty-state message centered in the frame (auto-height
   floors at the Step 6 `min-height`), **not** a blank/collapsed frame.
3. **Read-only + Edit intact** — the preview still never mutates; pills/empty-state are non-interactive;
   **Edit** restores the fully interactive grid; the Settings-tab-with-preview invariant holds.
4. **No regressions** — Step 4 storefront styling (padding, hairlines, ~33% bold label column, section
   rule), Step 5 widths/centering, and Step 6 auto-height/re-height-on-toggle all still hold; console
   clean (no CSP/SecurityError), no oscillation.

Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run && npm run build`
all green, **plus** the browser pass above.

## File placement (per `code-standards.md`)

- Pill + empty-state CSS (preview-only) → **`app/routes/app.templates_.$id/previewStyles.ts`** (new
  preview-only section; **not** `SPEC_TABLE_CSS`).
- Empty-state substitution → **`app/routes/app.templates_.$id/specTablePreviewHtml.ts`**
  (`renderSpecTablePreviewDocument` only).
- Iframe accessible name → **`app/routes/app.templates_.$id/SpecTablePreview.tsx`**.
- Unit tests → **`app/routes/app.templates_.$id/specTablePreviewHtml.test.ts`** (empty-state both cases,
  pill-CSS-present-but-preview-only, view-independence).
- **Unchanged:** `previewBridge.ts` + `.test.ts`, `deviceView.ts` + `.test.ts`, `SpecTableEditor.tsx`,
  `EditorShell.tsx`, `useRowEngine.ts`, `route.tsx`, `SpecTableEditor.module.css`, `vite.config.ts`,
  `vitest.config.ts`, `app/globals.d.ts`, every `app/utils/*`, `app/models/*`, `app/shopify/*`,
  `prisma/schema.prisma`, `package.json`, and the `extensions/` theme app extension (including
  `spec-table.css` — the pill/empty rules are preview-only and must **not** be mirrored into it).

## Done when

1. `previewStyles.ts` has a preview-only section styling `.appx-spec-table__dynamic-pill` (neutral
   placeholder chip, AA contrast) and `.appx-spec-table-preview-empty`, composed into
   `PREVIEW_DOCUMENT_STYLES`; `SPEC_TABLE_CSS` is unchanged and its byte-equality drift guard still
   passes.
2. `renderSpecTablePreviewDocument` substitutes a preview-only empty-state block when the rendered
   fragment has no `<tr>` (zero rows or all-hidden); `renderSpecTableHtml` is unchanged and stays pure;
   the document is still byte-identical across views.
3. `SpecTablePreview.tsx` iframe accessible name conveys preview + device + read-only; sandbox and
   read-only behavior are unchanged.
4. Unit tests pass: empty-state (both cases), non-empty unaffected, `renderSpecTableHtml` contract
   intact, pill CSS present in preview styles but absent from `SPEC_TABLE_CSS`, view-independence; no
   config change ships.
5. Full gate passes (typecheck, lint, format, test, build).
6. Browser-verified on the dev store: dynamic pills read as styled placeholders (AA, all three views);
   a zero-row template shows the empty state (cleaned up after); Edit/read-only + Step 4/5/6 fidelity
   all intact; console clean, no oscillation.
7. `progress-tracker.md` updated — Step 7 complete; point at **Step 8 (docs + full gate + live
   sign-off)**.
