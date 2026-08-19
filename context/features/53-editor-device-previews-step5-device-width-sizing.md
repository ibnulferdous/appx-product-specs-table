# Feature 49 · Step 5 — Device previews: size the iframe to each device width

## Goal in one sentence

Make the **Desktop / Tablet / Mobile** toggle actually change the preview's **width** — desktop fills
the column, tablet renders at a fixed **768px** frame, mobile at **375px**, each **centered** and
**never wider than the editor column** — by driving the iframe's width from a pure
`previewDeviceWidth(view)` helper, with **no auto-height, no pill styling, and no `@media` changes to
the storefront CSS yet**.

## Where this sits (feature 49 map)

Feature 49 makes the editor's **Desktop / Tablet / Mobile** toggle render read-only storefront
previews (Reshell **Phase D**). Locked design: a **sandboxed `<iframe>`** sized to each device width,
rendering **the storefront markup + the shared `spec-table.css`**; dynamic fields as **labeled pills**;
`TableStyling` + the mobile row-layout option deferred to the Style tab. The 8 steps:

1. ✅ Toggle swaps the stage (plumbing only) — `49-…`, shipped 2026-07-12.
2. ✅ Pure storefront-markup renderer (`renderSpecTableHtml`) — `50-…`, shipped 2026-07-12.
3. ✅ Render the markup in a sandboxed iframe (`SpecTablePreview.tsx`) — `51-…`, shipped 2026-07-12.
4. ✅ Load the shared storefront stylesheet into the iframe — `52-…`, shipped 2026-07-12.
5. **Device width sizing (`previewDeviceWidth(view)`) ← THIS DOC.**
6. Iframe auto-height.
7. a11y + read-only hardening + empty state (**incl. the dynamic-pill affordance styling**).
8. Docs + full gate + live sign-off.

## Why this is its own step

- **It's the one visible thing the device toggle promises and hasn't delivered.** Since Step 1 the
  toggle has swapped between three device labels that all render an identical full-width frame — the
  buttons "work" but nothing about the preview differs between Desktop, Tablet, and Mobile. Step 5 is
  where the toggle earns its name: three genuinely different widths.
- **The width rule is a small but real design decision** — what each device's px width is, that
  desktop **fills** rather than emulating a fixed desktop px, that a fixed frame is **centered** and
  **clamped** so a 768px tablet never overflows a narrow admin column, and where the mapping lives so
  it stays pure and unit-testable. That deserves its own reviewed step, separate from the (larger)
  auto-height mechanics in Step 6.
- **It stays self-contained because the storefront CSS has no media queries.** Confirmed:
  `spec-table.css` carries **no `@media`** rules, so narrowing the frame changes only how the cell
  text **wraps** — there is no responsive layout swap to reason about here. (The mobile row-layout
  option is a *later* Style-tab concern, explicitly out of feature 49.) Sizing the frame is therefore
  purely an outer-box change; the document inside is untouched.

## Foundation carried

- **`SpecTablePreview.tsx`** (Steps 3–4) — the component that drops the pure document into a
  `sandbox="" srcDoc` iframe. Step 5 edits **only** this component's outer sizing (an inline width +
  a centering wrapper); the `srcDoc` string and the renderer are untouched.
- **`deviceView.ts`** (Step 1) — the dependency-free view module (`ViewId`, `DeviceView`,
  `isPreviewView`), already unit-tested in `deviceView.test.ts`. Step 5 adds one more pure helper
  here, next to the type it keys off. No React, no CSS import — so it stays Node-unit-testable.
- **`.previewFrame`** (Step 3, in `SpecTableEditor.module.css`) — currently `width: 100%` +
  `height: 32rem`. Step 5 replaces the **static** `width: 100%` with a per-device inline width and
  adds `max-width` + centering; the **height stays the Step 3 provisional `32rem`** (Step 6 owns it).

## The width decision (as designed)

**Desktop fills the column (`100%`); Tablet is a fixed `768px`; Mobile is a fixed `375px`. Fixed
frames are horizontally centered and capped at the column width so they shrink instead of overflowing.**

- **Device widths in CSS pixels, not rem.** A phone is **375 CSS px** wide regardless of the admin's
  root font size; rem would let the admin's typography scale distort the emulated device. So the
  fixed widths are **px** — a deliberate, documented exception to the module's rem convention,
  because these values emulate a real device viewport, not admin chrome. `768` / `375` are the
  conventional tablet / phone breakpoints (and match the phone-class device the preview is checked
  against). Desktop is the one **non-px** value: it **fills** the available column (`100%`) rather
  than pinning a fake desktop px width the narrow admin column could never show anyway.
- **`max-width: 100%` so a fixed frame never overflows.** The editor column is often narrower than
  768px; a hard `width: 768px` would push a horizontal scrollbar onto the whole editor. Clamping the
  frame to the column width means a tablet preview in a narrow column simply renders at the column
  width (still exercising the wrap behavior), never overflowing. This is a fidelity *compromise the
  reviewer should see*: at very narrow admin widths the "768px" tablet is not truly 768px — it is
  capped. That is the correct trade (no overflow) and is called out here, not hidden.
- **Centered.** A fixed frame narrower than the column is centered (`margin-inline: auto`), so the
  tablet/mobile preview sits in the middle of the stage like a device on a desk, not jammed to the
  left edge. Desktop (`100%`) centering is a no-op.
- **The mapping is a pure function, not inline JSX.** `previewDeviceWidth(view)` lives in
  `deviceView.ts` and returns the CSS width string; the component just spreads it into the iframe's
  inline `style`. Pure string-in/string-out → unit-tested exhaustively in the Node env, exactly like
  `isPreviewView`.

## What changes (architecture)

**One pure helper in `deviceView.ts` + a small edit to `SpecTablePreview.tsx` (inline width + a
centering wrapper) + a CSS tweak to `.previewFrame`. No renderer change, no reducer / schema /
dependency / server / persistence / config change, and no change to the storefront extension.**

### `app/routes/app.templates_.$id/deviceView.ts` — the width mapping (NEW helper)

- `export function previewDeviceWidth(view: DeviceView): string` returning the CSS width:
  `desktop → "100%"`, `tablet → "768px"`, `mobile → "375px"`. A `switch` with an exhaustive
  `never` default so a future `ViewId` addition fails typecheck here. Keyed on `DeviceView` (not
  `ViewId`) because only device views ever reach the preview.

### `app/routes/app.templates_.$id/SpecTablePreview.tsx` — apply the width

- Set the iframe's width from the helper via an **inline style** (the value is dynamic per render):
  `style={{ width: previewDeviceWidth(view) }}`. The class keeps the static chrome (border, radius,
  background, provisional height, `max-width`, centering); only the width is dynamic.
- Ensure the fixed frame **centers** within the existing `<s-box padding="base">` — a block iframe
  with `margin-inline: auto` centers itself against the box; if the box does not establish a
  containing width the iframe can center against, wrap the iframe in a simple full-width `<div>` (or
  rely on the box) so centering is unambiguous. Keep it minimal — no new layout system.

### `app/routes/app.templates_.$id/SpecTableEditor.module.css` — `.previewFrame`

- Remove the static `width: 100%` (width now comes from the inline style).
- Add `max-width: 100%` (clamp) and `margin-inline: auto` (center a narrow fixed frame).
- **Keep** `height: 32rem` (provisional — Step 6), the border, radius, and white background.
- Update the block comment: width is now device-driven (Step 5); height is still provisional (Step 6).

## Locked decisions

- **Widths: desktop `100%` (fill), tablet `768px`, mobile `375px`.** Fixed widths are **px**
  (device-viewport semantics), a documented exception to the module's rem rule; desktop fills rather
  than pinning a fake desktop px.
- **`max-width: 100%` + `margin-inline: auto`** — a fixed frame is clamped to the column and centered;
  it shrinks rather than overflowing. The clamp means a "768px" tablet in a narrow column is not
  literally 768px, and that compromise is intentional and disclosed.
- **The mapping is a pure `previewDeviceWidth(view)` in `deviceView.ts`**, unit-tested next to
  `isPreviewView`; the component only spreads it into the iframe's inline style.
- **Height stays the Step 3 provisional `32rem`** — content-driven auto-height is **Step 6**.
- **No `@media` / responsive changes to the storefront `spec-table.css`** — it has none, and Step 5
  adds none. Narrowing the frame only changes wrapping. The mobile row-layout option is out of
  feature 49.
- **`renderSpecTablePreviewDocument` / `renderSpecTableHtml` untouched** — the document string is
  identical across all three device views; only the iframe's outer width differs.

## What this step does *not* own (boundary with later steps)

- **Content-driven auto-height** (replacing the fixed `32rem`) → **Step 6**.
- **Dynamic-pill affordance styling** + **a11y + read-only hardening + the empty-rows state** →
  **Step 7**.
- **Merchant theme fonts/colors, `TableStyling`, the mobile row-layout option, responsive `@media`
  breakpoints, live dynamic-value resolution** → out of feature 49.

## Testing

### Unit (Node, pure) — the width mapping

Extend `deviceView.test.ts`:

1. **Exact widths** — `previewDeviceWidth("desktop") === "100%"`,
   `previewDeviceWidth("tablet") === "768px"`, `previewDeviceWidth("mobile") === "375px"`.
2. **Total, no throw** — every `DeviceView` returns a non-empty string (iterate the three views).
3. **Desktop is the only fill** — desktop returns `"100%"`; tablet and mobile return a `px` value
   (guards against a future accidental swap to a fill/rem value).

(The component's actual sizing/centering is browser-verified — it is DOM/visual, which the Node env
cannot assert, per the project's testing strategy.)

### Browser (embedded app, per [[browser-verify-embedded-app]])

On the live dev store editor (deep-link per the memory), on a template with a section header + data
rows + a dynamic-pill row:

1. **Desktop** — the preview frame **fills** the stage width (as today), storefront-styled table.
2. **Tablet** — the frame narrows to a **fixed ~768px**, **centered** in the stage (visible gutters
   left and right when the column is wider than 768px); the table reflows within it.
3. **Mobile** — the frame narrows further to a **fixed ~375px**, still centered; the same table
   wraps more tightly (no layout swap — expected, no `@media`).
4. **No overflow** — at a narrow admin width, the tablet frame **clamps to the column** (no
   horizontal scrollbar on the editor); confirm by checking the stage does not scroll sideways.
5. **Toggle is live** — switching Desktop ↔ Tablet ↔ Mobile changes the width immediately with no
   reload; **Edit** still restores the editable grid; the **Settings-tab** sidebar invariant holds.
6. **Fidelity carried** — the Step 4 storefront styling (padding, hairlines, ~33% bold label column,
   section rule) still renders inside every device width; dynamic fields still show plain pill text
   (Step 7).

Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run && npm run build`
all green, **plus** the browser pass above.

## File placement (per `code-standards.md`)

- Width mapping → **`app/routes/app.templates_.$id/deviceView.ts`** (add `previewDeviceWidth`).
- Width application + centering → **`app/routes/app.templates_.$id/SpecTablePreview.tsx`**.
- Frame chrome → **`app/routes/app.templates_.$id/SpecTableEditor.module.css`** (`.previewFrame`).
- Unit test → **`app/routes/app.templates_.$id/deviceView.test.ts`** (add `previewDeviceWidth` cases).
- **Unchanged:** `specTablePreviewHtml.ts` + `.test.ts`, `previewStyles.ts`, `SpecTableEditor.tsx`,
  `EditorShell.tsx`, `useRowEngine.ts`, `route.tsx`, `vite.config.ts`, `vitest.config.ts`,
  `app/globals.d.ts`, every `app/utils/*`, `app/models/*`, `app/shopify/*`, `prisma/schema.prisma`,
  `package.json`, and the `extensions/` theme app extension (including `spec-table.css`).

## Done when

1. `previewDeviceWidth(view)` in `deviceView.ts` returns `100%` / `768px` / `375px` for
   desktop / tablet / mobile, with an exhaustive `never` default; it stays pure and dependency-free.
2. `SpecTablePreview.tsx` applies that width to the iframe via inline style and centers a fixed frame;
   `.previewFrame` drops the static `width: 100%`, adds `max-width: 100%` + `margin-inline: auto`, and
   keeps the provisional `32rem` height.
3. Unit tests for `previewDeviceWidth` (exact values, totality, desktop-only-fill) pass; no config
   change ships.
4. Full gate passes (typecheck, lint, format, test, build).
5. Browser-verified on the dev store: Desktop fills; Tablet ~768px centered; Mobile ~375px centered;
   no editor horizontal overflow at narrow widths; toggle is live; Step 4 styling + Edit/Settings
   invariants hold.
6. `progress-tracker.md` updated — Step 5 complete; point at **Step 6 (iframe content-driven
   auto-height)**.
