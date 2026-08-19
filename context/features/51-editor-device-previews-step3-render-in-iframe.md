# Feature 49 · Step 3 — Device previews: render the markup in a sandboxed iframe

## Goal in one sentence

Introduce **`SpecTablePreview.tsx`** — a small read-only React component that feeds
`renderSpecTableHtml(rows)` (Step 2) through a pure **document wrapper** into a **sandboxed
`<iframe srcDoc>`**, and wire it into `SpecTableEditor` **in place of the Step 1 placeholder** —
so the Desktop / Tablet / Mobile toggle now shows the **real (still unstyled) storefront markup**
of the working rows, with **no shared CSS, no device sizing, and no auto-height yet**.

[`renderSpecTableHtml`]: ../../app/routes/app.templates_.$id/specTablePreviewHtml.ts

## Where this sits (feature 49 map)

Feature 49 makes the editor's **Desktop / Tablet / Mobile** toggle render read-only storefront
previews (Reshell **Phase D**). Locked design: a **sandboxed `<iframe>`** sized to each device
width, rendering **the storefront markup + the shared `spec-table.css`**; dynamic fields as
**labeled pills**; `TableStyling` + the mobile row-layout option deferred to the Style tab. The
8 steps:

1. ✅ Toggle swaps the stage (plumbing only) — `49-…`, shipped 2026-07-12.
2. ✅ Pure storefront-markup renderer (`renderSpecTableHtml`) — `50-…`, shipped 2026-07-12.
3. **Render the markup in an iframe (no shared CSS yet) ← THIS DOC** — introduces `SpecTablePreview.tsx`.
4. Load the shared storefront stylesheet into the iframe.
5. Device width sizing (`previewDeviceWidth(view)`).
6. Iframe auto-height.
7. a11y + read-only hardening + empty state.
8. Docs + full gate + live sign-off.

## Why this is its own step

- **It's the first thing that paints — and the first browser-verified boundary.** Steps 1–2
  were pure (plumbing + a string). Step 3 is where the string becomes pixels: the two clean
  verification boundaries the Step 2 doc promised are _"the right HTML string"_ (unit, done) then
  _"it paints"_ (browser, here). Keeping **rendering** separate from **styling** (Step 4) means a
  regression is unambiguous — Step 3 proves the markup reaches the iframe; Step 4 proves the CSS
  lands on it.
- **The iframe is the isolation boundary, and it earns its own step.** A sandboxed `srcDoc`
  iframe is the locked fidelity technique (true storefront box model, no admin/Polaris CSS
  bleed-in, no bleed-out). Standing it up — the document wrapper, the `sandbox` value, the frame
  chrome — is a discrete, reviewable change with real security surface (below), independent of
  what later steps put _into_ or _around_ it.

## Foundation carried

- **`renderSpecTableHtml(rows)`** (Step 2) — the pure storefront-markup string. Step 3 does not
  touch it; it consumes it.
- **`isPreviewView` / `DeviceView` / `ViewId`** (`deviceView.ts`, Step 1) — the edit-vs-preview
  predicate + view types.
- **`EditorShell.preview?: (view: DeviceView) => ReactNode`** (Step 1) — the render-prop slot
  already swapped in on a device view. Step 3 changes only **what** `SpecTableEditor` passes into
  it (the real preview instead of the placeholder); `EditorShell` itself is **unchanged**.
- **`engine.rows`** — the live `EditorRow[]` from `useRowEngine`, already owned by
  `SpecTableEditor`'s `engine` prop. The preview reads it directly (read-only; it never
  dispatches).

## What changes (architecture)

**One new pure document-wrapper function + one new small component; the placeholder is deleted
and the real preview is wired in. No reducer / schema / dependency / server / persistence change.
No shared `spec-table.css` yet.**

### `app/routes/app.templates_.$id/specTablePreviewHtml.ts` — add a pure document wrapper

Add, alongside `renderSpecTableHtml`, a second pure export:

`export function renderSpecTablePreviewDocument(rows: EditorRow[]): string` — wraps
`renderSpecTableHtml(rows)` in a **minimal, complete HTML document** suitable for an iframe
`srcDoc`:

- `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport"
  content="width=device-width, initial-scale=1">` + a `<title>` — then `<body>` containing the
  rendered rows string, then close.
- **No stylesheet link yet** — Step 4 adds the `spec-table.css` `<link>`/`<style>` here (this is
  the seam it will edit). Step 3's document is deliberately style-free so "unstyled browser-default
  table" is the expected, verifiable Step 3 look.
- Pure and framework-free (string in, string out), so it is **unit-testable in the Node vitest
  env** exactly like `renderSpecTableHtml`. Keeping the wrapper pure (not inline JSX in the
  component) is what preserves the feature's "the whole fidelity contract is Node-testable"
  property and gives Step 4 a pure seam to extend.

### `app/routes/app.templates_.$id/SpecTablePreview.tsx` (NEW component)

`export function SpecTablePreview({ rows, view }: { rows: EditorRow[]; view: DeviceView })` —
renders a single sandboxed iframe:

- `srcDoc={renderSpecTablePreviewDocument(rows)}`.
- **`sandbox=""`** — the empty token list is the **most restrictive** sandbox: no scripts, no
  forms, no popups, and a **unique opaque origin** (no `allow-same-origin`). The preview is static
  HTML with zero interactivity, so it needs none of those capabilities. This is a second,
  defence-in-depth layer beneath Step 2's escaping: even though `renderSpecTableHtml` escapes all
  author/merchant text, the sandbox guarantees that nothing the iframe contains can execute script
  or reach the parent admin — important for a production, App-Store app rendering merchant-authored
  content. (Step 6's auto-height must therefore use a strategy that does **not** rely on
  same-origin DOM access; noted there, not solved here.)
- **`title`** — a meaningful accessible name derived from `view` (e.g. `"Desktop preview"`), so the
  iframe is not an unnamed frame. This also **consumes the `view` prop** in Step 3 (sizing off
  `view` is Step 5); richer a11y/read-only hardening is Step 7.
- **Frame chrome** via a `SpecTableEditor.module.css` class (`.previewFrame`): `display: block`,
  `width: 100%`, a **provisional fixed height**, a subtle border, and a white background.
  - The **full width** is provisional — **Step 5** swaps it for a `previewDeviceWidth(view)`-driven
    width (and centres the narrow tablet/mobile frames in the stage).
  - The **fixed height** is provisional — **Step 6** replaces it with content-driven auto-height.
  - This is the iframe **element's** chrome (sizing/border/background), NOT storefront content
    styling — so it does not violate the "structural previews now, `TableStyling` later" rule
    (that rule governs the table's colors/fonts/padding _inside_ the iframe, which stay
    browser-default until the Style tab ships).

### `app/routes/app.templates_.$id/SpecTableEditor.tsx` — wire the real preview

- **Delete** the temporary `DevicePreviewPlaceholder` component and its `DEVICE_LABELS` map (Step 1
  stand-ins). The device-label lookup used for the iframe `title` moves into `SpecTablePreview`.
- Change the slot from `preview={(view) => <DevicePreviewPlaceholder view={view} />}` to
  `preview={(view) => <SpecTablePreview rows={engine.rows} view={view} />}`.
- Nothing else in `SpecTableEditor` changes (the freeze wrapper, SaveBar, tips are untouched).

## Locked decisions

- **Sandboxed `srcDoc` iframe, `sandbox=""`** — the locked fidelity + isolation technique; the
  empty sandbox (no `allow-scripts`, no `allow-same-origin`) is the read-only, opaque-origin,
  defence-in-depth choice.
- **Pure document wrapper** (`renderSpecTablePreviewDocument`) lives next to `renderSpecTableHtml`
  in `specTablePreviewHtml.ts`, so the whole HTML contract stays Node-unit-testable and Step 4 has
  a pure seam for the stylesheet.
- **Unstyled on purpose in Step 3** — no `spec-table.css`; browser-default table rendering is the
  expected look and the thing Step 4 will visibly change.
- **`view` is consumed only for the iframe `title`** in Step 3; width sizing is Step 5, so the
  frame is full-width for all three device buttons here.
- **Frame chrome (width/height/border/background) is provisional** — width → Step 5, height →
  Step 6 — and is distinct from storefront **content** styling (deferred to the Style tab).
- **Read-only** — the preview reads `engine.rows` and never dispatches; it re-renders whenever the
  rows change (the `srcDoc` string is recomputed from the current rows on every render).

## What this step does *not* own (boundary with later steps)

- **The shared `spec-table.css` inside the iframe** + **pill visual styling** → **Step 4**.
- **Device widths** (`previewDeviceWidth(view)`) + centring narrow frames → **Step 5**.
- **Content-driven auto-height** (replacing the provisional fixed height) → **Step 6**.
- **a11y + read-only hardening + the empty-rows state** → **Step 7**.
- **Live dynamic-value resolution, `TableStyling`, the mobile row-layout option, theme ambient
  styling** → out of feature 49.

## Testing

### Unit (Node, pure) — the document wrapper

Extend `specTablePreviewHtml.test.ts` (or a sibling) with `renderSpecTablePreviewDocument`:

1. **Well-formed document** — output starts with `<!doctype html>` and contains one `<html …>`,
   one `<head>` (with `<meta charset>` + viewport), and one `<body>`.
2. **Body carries the rendered rows** — for a non-empty `rows`, the document `<body>` contains the
   exact `renderSpecTableHtml(rows)` fragment (`<div class="appx-spec-table">…`).
3. **Empty rows** — an empty `rows` still yields a valid, complete document whose `<body>` holds
   the empty string (blank iframe; the empty-state UX is Step 7). No crash, no `undefined`.
4. **No stylesheet yet** — the document contains no `spec-table.css` reference (guards the Step 3
   "unstyled" invariant; Step 4 flips this).

### Browser (embedded app, per [[browser-verify-embedded-app]])

On the live dev store editor (deep-link per the memory), with a template that has a few
representative rows (a section, a plain-text row, a row with a dynamic pill, a `hideWhenEmpty`
empty row):

1. **Edit** shows the editable grid (unchanged).
2. **Desktop / Tablet / Mobile** each swap the stage to an **iframe** rendering the rows as a real
   (unstyled) HTML table: section header row, label/value rows, the dynamic part visible as its
   pill **text**, and the `hideWhenEmpty` empty row **absent** — matching `renderSpecTableHtml`.
3. Editing a row in **Edit**, then returning to a device view, shows the **updated** rows (the
   preview reflects live `engine.rows`).
4. The preview is **inert** — no editing affordances, no toolbar, and (sandbox) no console errors
   about blocked scripts beyond the expected sandbox behavior.
5. **Settings tab + a device view** still shows the Settings sidebar beside the iframe (Step 1
   invariant holds).

Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run && npm run build`
all green, **plus** the browser pass above (this is the first painting step).

## File placement (per `code-standards.md`)

- Pure document wrapper → **`app/routes/app.templates_.$id/specTablePreviewHtml.ts`** (new export
  beside `renderSpecTableHtml`; framework-free).
- New component → **`app/routes/app.templates_.$id/SpecTablePreview.tsx`** (route-co-located,
  presentational, read-only).
- Frame-chrome class → **`app/routes/app.templates_.$id/SpecTableEditor.module.css`** (the
  `.previewFrame` element styles — sizing/border/background only).
- Unit test → **`app/routes/app.templates_.$id/specTablePreviewHtml.test.ts`** (extend) or a sibling.
- **Unchanged:** `EditorShell.tsx`, `deviceView.ts`, `useRowEngine.ts`, `route.tsx`, every
  `app/utils/*`, `app/models/*`, `app/shopify/*`, `prisma/schema.prisma`, `package.json`, and the
  `extensions/` theme app extension (the Liquid/CSS the preview mirrors is **read**, never edited —
  Step 4 references `spec-table.css`, it does not modify it).

## Done when

1. `renderSpecTablePreviewDocument(rows)` exists as a pure function wrapping `renderSpecTableHtml`
   in a complete, style-free HTML document, unit-tested and green.
2. `SpecTablePreview.tsx` renders a `sandbox=""` `srcDoc` iframe of that document, titled from
   `view`, with provisional full-width frame chrome.
3. `SpecTableEditor` passes the real `SpecTablePreview` into `EditorShell.preview` and the Step 1
   `DevicePreviewPlaceholder` + `DEVICE_LABELS` are removed; `EditorShell` is unchanged.
4. Full gate passes (typecheck, lint, format, test, build).
5. Browser-verified on the dev store: each device view renders the live rows as a real (unstyled)
   iframe table; the empty/`hideWhenEmpty` and dynamic-pill cases match `renderSpecTableHtml`;
   Edit restores the editable grid; the Settings-tab sidebar invariant holds.
6. `progress-tracker.md` updated — Step 3 complete; point at **Step 4 (load the shared
   `spec-table.css` into the iframe)**.
