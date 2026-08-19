# Feature 49 · Step 4 — Device previews: load the shared storefront stylesheet into the iframe

## Goal in one sentence

Make the preview **look like the storefront table** by injecting the theme app extension's own
`assets/spec-table.css` — **byte-for-byte, as the single source of truth** — into the iframe
document as an inline `<style>`, so the Step 3 unstyled browser-default table becomes the real
padded, bordered, label-column spec table, with **no device sizing, no auto-height, and no pill
affordance styling yet**.

[`spec-table.css`]: ../../extensions/product-specs-table/assets/spec-table.css

## Where this sits (feature 49 map)

Feature 49 makes the editor's **Desktop / Tablet / Mobile** toggle render read-only storefront
previews (Reshell **Phase D**). Locked design: a **sandboxed `<iframe>`** sized to each device
width, rendering **the storefront markup + the shared `spec-table.css`**; dynamic fields as
**labeled pills**; `TableStyling` + the mobile row-layout option deferred to the Style tab. The
8 steps:

1. ✅ Toggle swaps the stage (plumbing only) — `49-…`, shipped 2026-07-12.
2. ✅ Pure storefront-markup renderer (`renderSpecTableHtml`) — `50-…`, shipped 2026-07-12.
3. ✅ Render the markup in a sandboxed iframe (`SpecTablePreview.tsx`) — `51-…`, shipped 2026-07-12.
4. **Load the shared storefront stylesheet into the iframe ← THIS DOC.**
5. Device width sizing (`previewDeviceWidth(view)`).
6. Iframe auto-height.
7. a11y + read-only hardening + empty state (**incl. the dynamic-pill affordance styling**).
8. Docs + full gate + live sign-off.

## Why this is its own step

- **It's the payoff of the fidelity contract, and it's the second half of the "paints" boundary.**
  Step 3 proved the markup reaches the iframe (unstyled); Step 4 proves the **CSS lands on it**.
  Keeping them apart means a visual regression is unambiguous — if Step 3 looked right and Step 4
  looks wrong, the stylesheet plumbing is the only thing that changed.
- **The delivery mechanism is a real design decision with a constraint.** The iframe is
  `sandbox=""` (opaque origin, no `allow-same-origin`) and its content comes from `srcDoc` — so
  there is **no reliable URL to `<link>`** to (the extension's `spec-table.css` is served from the
  Shopify CDN only at storefront render, via Liquid `asset_url`; the admin app has no stable
  handle on it). The robust option is to **inline the CSS text** — which forces the "how does app
  code obtain the extension's CSS without drift" decision below. That deserves its own reviewed step.

## Foundation carried

- **`renderSpecTablePreviewDocument(rows)`** (Step 3) — the pure, currently style-free document
  wrapper. Step 4 edits exactly this seam: it injects a `<style>` into the `<head>`. Signature and
  purity unchanged (string in, string out).
- **`SpecTablePreview.tsx`** (Step 3) — unchanged; it already drops the wrapper's output into
  `srcDoc`. The CSS rides along inside that string, so the component needs no edit.
- **`.appx-spec-table*` class contract** (Steps 2–3) — the preview markup already uses the exact
  storefront class names, so the storefront CSS matches it with **zero selector drift**. This is
  the whole reason Step 2 mirrored the classes.

## The delivery decision (as built)

**Inline the extension's `spec-table.css` as a `<style>` block; keep the CSS as a plain string copy
in the app, guarded against drift by a byte-equality unit test — one guaranteed-in-sync copy.**

- **Inline `<style>`, not `<link>`** — the sandboxed opaque-origin `srcDoc` frame has no stable URL
  to the CDN-served asset, and inlining keeps the preview self-contained (no network fetch, no
  flash of unstyled content). Static subresource loads are moot; the bytes travel inside `srcDoc`.
- **Single source of truth enforced by a TEST, not a bundler import.** The doc originally locked a
  build-time Vite `?raw` import of `../../../extensions/.../spec-table.css`. In practice that import
  is **fragile in `shopify app dev`**: the extensions dir sits outside `server.fs.allow`, so the dev
  server blocks the cross-directory read and the editor's client bundle **fails to hydrate** (dead
  toggle, blank value cells). Adding `"extensions"` to `fs.allow` needs a `vite.config.ts` change,
  which only takes effect on a full dev-server restart and proved unreliable — a poor tax for every
  developer. **As built:** `previewStyles.ts` holds the CSS as a plain string `SPEC_TABLE_CSS`
  (zero dev-server coupling, works in build + dev + Node tests identically), and a unit test reads
  the **real** extension file (Node `fs`, which has no `fs.allow` restriction) and asserts
  `SPEC_TABLE_CSS` **equals it byte-for-byte** (line endings normalized). This delivers the same
  guarantee the `?raw` import promised — the copy can never drift *silently*, because divergence
  fails the gate — without any cross-boundary bundler import, `?raw`, `fs.allow`, or config change.
- **Everything lives in one module** (`previewStyles.ts`): `SPEC_TABLE_CSS`, the ambient base, and
  the composed `PREVIEW_DOCUMENT_STYLES`. `specTablePreviewHtml.ts` stays a plain-string consumer.

### Why not the `?raw` import (resolved)

The `?raw` route was tried first and abandoned: the production `npm run build` inlined it fine, but
the `shopify app dev` server (with `server.fs.allow: ["app", "node_modules"]`) 403'd the
cross-directory read, breaking client hydration; and Vitest additionally stubs CSS imports to empty
by default (`test.css` false), so the Node unit env saw an empty string. Both are avoidable
friction. The plain-string-plus-drift-guard is strictly more robust and touches **no config**
(`vite.config.ts` / `vitest.config.ts` / `globals.d.ts` all stay at baseline).

## What changes (architecture)

**One tiny new module (the style payload) + a one-line-ish edit to the pure document wrapper + a
drift-guard test. No component change, no reducer / schema / dependency / server / persistence /
config change.**

### `app/routes/app.templates_.$id/previewStyles.ts` (NEW, the style payload)

- `export const SPEC_TABLE_CSS = \`…\`;` — a verbatim plain-string copy of the extension's
  `spec-table.css`, guarded against drift by the byte-equality test below.
- A small **preview-page ambient** base string (see below).
- `export const PREVIEW_DOCUMENT_STYLES = \`${PREVIEW_AMBIENT}\n${SPEC_TABLE_CSS}\`;` — ambient
  first so the storefront rules win any (currently non-existent) overlap.

### `app/routes/app.templates_.$id/specTablePreviewHtml.ts` — inject the style

- Import `PREVIEW_DOCUMENT_STYLES`; in `renderSpecTablePreviewDocument`, add
  `<style>${PREVIEW_DOCUMENT_STYLES}</style>` to the `<head>` (after the meta tags, before
  `</head>`). Nothing else changes; the function stays pure.

### Preview-page ambient (small, explicitly-scoped)

The storefront `spec-table.css` styles only the **table**; on a real product page the surrounding
page supplies the font and text color (the theme). The preview has no theme, so without a base it
falls back to the browser default **serif** — which no real storefront uses and which muddies the
"does it match the storefront" check. So Step 4 adds a **minimal, neutral preview-page ambient**:
a `body { margin; font-family: system sans-serif stack; color; }` reset — clearly **not** the
table's own CSS (fidelity) and **not** merchant-theme replication (out of scope, locked). It is the
neutral "page" the table sits on, and is intentionally replaceable. Keep it tiny; no colors beyond
a neutral ink, no table styling.

## Locked decisions

- **Inline `<style>`, byte-for-byte from the extension's `spec-table.css`, as a plain-string copy
  guarded by a byte-equality test** (not a build-time `?raw` import — that broke dev-server
  hydration; see "The delivery decision"). Single source of truth enforced by the gate, no silent
  drift, no config coupling, forced-inline by the sandbox having no reliable `<link>` target.
- **Same class names already in place** (Steps 2–3) → the storefront CSS applies with zero drift.
- **Minimal preview-page ambient** (neutral system font + ink + body reset) is added and is
  explicitly distinct from both storefront table CSS and merchant theme styling.
- **Pill affordance styling is Step 7, not here.** The Step 3 doc floated "Step 4/7" for the
  dynamic-pill visual; it is scoped to **Step 7** so Step 4 stays purely the shared-stylesheet
  load. Until then the pill renders as ordinary cell text (which visually matches the storefront,
  where that value resolves to plain text anyway) — the read-only affordance polish lands in Step 7.
- **No device sizing / auto-height** — the frame chrome stays the Step 3 provisional full-width +
  fixed height (Steps 5 / 6).
- **`renderSpecTablePreviewDocument` stays pure** — a string constant in, an HTML string out; the
  only new coupling is the `previewStyles` import boundary.

## What this step does *not* own (boundary with later steps)

- **Device widths** (`previewDeviceWidth(view)`) + centring narrow frames → **Step 5**.
- **Content-driven auto-height** → **Step 6**.
- **Dynamic-pill affordance styling** + **a11y + read-only hardening + the empty-rows state** →
  **Step 7**.
- **Merchant theme fonts/colors, `TableStyling`, the mobile row-layout option, live dynamic-value
  resolution** → out of feature 49.

## Testing

### Unit (Node, pure) — the document now carries the stylesheet

Update/extend `specTablePreviewHtml.test.ts`:

1. **`<style>` present in `<head>`** — `renderSpecTablePreviewDocument([...])` now contains a
   `<style>…</style>` block inside the head (this **replaces** the Step 3 `not.toContain("<style")`
   assertion, which the Step 3 doc explicitly flagged as the invariant Step 4 flips).
2. **Real storefront rules inlined** — the style block contains signature selectors
   (`.appx-spec-table__table`, `.appx-spec-table__label`, `.appx-spec-table__section`), not a stub.
3. **Byte-for-byte drift guard (the single-source enforcement)** — read the real
   `extensions/product-specs-table/assets/spec-table.css` (Node `fs`) and assert `SPEC_TABLE_CSS`
   equals it (line endings normalized). This is the test that makes silent drift impossible.
4. **Still no external `<link>`** — inlined, not linked (`not.toContain("<link")`), so the frame
   stays self-contained.
5. **Ambient base present** — the document includes the neutral `body { font-family… }` reset.
6. **Empty rows unchanged** — an empty `rows` still yields a valid, complete, now-styled document
   (blank body, style present), no crash.

### Browser (embedded app, per [[browser-verify-embedded-app]])

On the live dev store editor (deep-link per the memory), ideally on a template that includes a
**section header** plus data rows and a dynamic-pill row:

1. **Desktop / Tablet / Mobile** now render the **storefront-styled** table: full-width table,
   left-aligned cells with `0.5rem 0.75rem` padding, **bold labels** in a ~33% first column, a
   hairline bottom border on each row, and (if present) a **section header** with the heavier
   `2px` bottom rule — matching [`spec-table.css`], not the Step 3 serif default.
2. **Fidelity check** — if any template is **ACTIVE** and its product page renders the storefront
   table, open it (same-origin `appx-dev.myshopify.com`, per the storefront-password memory) and
   confirm the preview's table matches the live table's structure/spacing.
3. Dynamic fields still show their **pill text** (unstyled affordance — Step 7), `hideWhenEmpty`
   empty rows still absent, **Edit** still restores the editable grid, and the **Settings-tab**
   sidebar invariant still holds.

Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run && npm run build`
all green, **plus** the browser pass above.

## File placement (per `code-standards.md`)

- Style payload → **`app/routes/app.templates_.$id/previewStyles.ts`** (new; `SPEC_TABLE_CSS` copy +
  ambient + `PREVIEW_DOCUMENT_STYLES`).
- Style injection → **`app/routes/app.templates_.$id/specTablePreviewHtml.ts`** (edit
  `renderSpecTablePreviewDocument`).
- Unit test → **`app/routes/app.templates_.$id/specTablePreviewHtml.test.ts`** (update the Step 3
  stylesheet assertions + add the drift guard).
- **Unchanged:** `SpecTablePreview.tsx`, `SpecTableEditor.tsx`, `EditorShell.tsx`, `deviceView.ts`,
  `useRowEngine.ts`, `route.tsx`, `SpecTableEditor.module.css`, `vite.config.ts`, `vitest.config.ts`,
  `app/globals.d.ts`, every `app/utils/*`, `app/models/*`, `app/shopify/*`, `prisma/schema.prisma`,
  `package.json`, and — critically — the `extensions/` theme app extension itself: `spec-table.css`
  is **read (mirrored + asserted)**, never edited.

## Done when

1. `previewStyles.ts` holds `SPEC_TABLE_CSS` (a verbatim copy of the extension's `spec-table.css`)
   plus a minimal ambient base, composed as `PREVIEW_DOCUMENT_STYLES`, and
   `renderSpecTablePreviewDocument` inlines it as a `<style>` in the document `<head>`; the function
   stays pure.
2. A drift-guard unit test reads the real `spec-table.css` and asserts byte-equality with
   `SPEC_TABLE_CSS`; no config change ships (`vite.config.ts` / `vitest.config.ts` / `globals.d.ts`
   at baseline).
3. Unit tests updated: `<style>` + real storefront selectors present, no `<link>`, ambient present,
   empty-rows still valid, drift guard green; all pass.
4. Full gate passes (typecheck, lint, format, test, build).
5. Browser-verified on the dev store: the preview renders as the real storefront-styled table
   (padding, borders, ~33% bold label column, section rule), matching `spec-table.css`; dynamic
   pills still plain, `hideWhenEmpty`/Edit/Settings invariants hold.
6. `progress-tracker.md` updated — Step 4 complete; point at **Step 5 (device width sizing —
   `previewDeviceWidth(view)`)**.
