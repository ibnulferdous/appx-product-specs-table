# Feature 49 · Step 1 — Device previews: toggle swaps the stage (plumbing only)

## Goal in one sentence

Make the editor's **device toggle** (Desktop / Tablet / Mobile) actually _do_ something —
when a device view is active, the **stage** renders a `preview` slot instead of the editable
`ContentTab`; **Edit** returns to the editor — wiring **only the plumbing** (an
`EditorShell` `preview` render-prop + a tiny pure `isPreviewView` predicate + a **temporary
placeholder** from `SpecTableEditor`), with **no renderer, no iframe, no storefront markup,
no CSS reflow, no width sizing** (all later steps).

## Where this sits (feature 49 map)

Feature 49 turns the four-segment view toggle (**Edit · Desktop · Tablet · Mobile**) into
functional **read-only device previews** of the storefront table (Reshell **Phase D**). The
locked design (chat, 2026-07-12):

- **Sandboxed `<iframe>`** sized to each device width, rendering the **same markup + the same
  `spec-table.css`** the storefront uses — the truest match, viewport-accurate, no admin
  style bleed.
- **Structural previews now** — `TableStyling` (colors / fonts / padding) and the future
  **mobile row-layout option** (stacked cards vs. horizontal scroll) are **not** built here;
  they land with the Style tab and are honored by the same shared stylesheet automatically.
- **Dynamic fields show as labeled pills**, not resolved values (no product context in the
  admin) — the one intentional divergence from the live storefront.

The feature is built as **8 small, individually verifiable steps**:

1. **Toggle swaps the stage (plumbing only) ← THIS DOC**
2. Pure storefront-markup renderer (`renderSpecTableHtml(rows)`)
3. Render the markup in an iframe (no shared CSS yet) — introduces `SpecTablePreview.tsx`
4. Load the shared storefront stylesheet into the iframe
5. Device width sizing (`previewDeviceWidth(view)`)
6. Iframe auto-height
7. a11y + read-only hardening + empty state
8. Docs + full gate + live sign-off

## Why this is its own (first) step

- **Smallest verifiable slice — de-risk the plumbing before the iframe.** The toggle is
  already a working WAI-ARIA radiogroup ([[polaris-web-component-gotchas]] pattern) in
  `EditorShell.tsx`, but **nothing consumes `activeView`** — the code says so:
  _"The device toggle is visual-only in A2 — the stage does not yet react to activeView (the
  read-only device previews are Phase D)."_ This step closes exactly that gap and proves the
  `EditorShell → stage` swap end to end with a trivial placeholder, so Steps 2–8 build the
  real preview into a slot that is **already wired and verified**.
- **The only throwaway is the placeholder's _content_.** The `preview` render-prop and the
  `SpecTableEditor` wiring added here are **permanent**; Step 3 just swaps the inline
  placeholder for the real `<SpecTablePreview>`. Nothing built here is deleted.

## Foundation carried (reused unchanged)

- **`EditorShell` is presentational and slot-based** (reshell A2, feature 16). It owns only
  `activeTab` + `activeView`, and already renders the stage via a `stage: ReactNode` slot
  (plus reserved `stylePanel?` / `settingsPanel?`). This step adds **one more slot** in the
  same spirit — `EditorShell` still never touches the engine.
- **The view union already exists.** `type ViewId = "edit" | "desktop" | "tablet" | "mobile"`
  drives the `VIEWS` segmented options and `activeView` state. This step reuses it (and moves
  it to a tiny pure module so the predicate is importable from a Node test).
- **The stage renders in two branches** of `EditorShell` today — inside the Style/Settings
  `<s-grid>` (sidebar + stage) and the Content-only `<s-box>`. Both branches get the same
  one-line swap, so the preview behaves identically regardless of the active tab (previews
  replace the **stage**; the sidebar's show/hide stays governed by `activeTab`, unchanged).
- **Testing pattern** ([[testing-strategy]]): Vitest runs in a **Node** environment — there
  is **no jsdom and no `@testing-library/react`**, and zero `.test.tsx` files. So the unit
  coverage for this step is a **pure predicate** in a `.ts` test; the actual DOM swap is
  **browser-verified** in the embedded admin ([[browser-verify-embedded-app]]).

## What changes (architecture)

Three small edits/additions. **No reducer, no schema, no dependency, no server, no
persistence, no CSS.**

### 1. `app/routes/app.templates_.$id/deviceView.ts` (NEW, pure)

A dependency-free module (no React, no CSS import) so a Node unit test can import it cleanly:

- Re-home `type ViewId = "edit" | "desktop" | "tablet" | "mobile"` here (imported back into
  `EditorShell`), and add `type DeviceView = Exclude<ViewId, "edit">`.
- `export function isPreviewView(view: ViewId): view is DeviceView` → returns
  `view !== "edit"`. A **type guard**, so callers can pass the narrowed `DeviceView` straight
  into the `preview` render-prop without a cast. This one predicate encodes the entire
  "slot renders only off-Edit" decision the step hinges on.

### 2. `EditorShell.tsx` (EDIT)

- Add an optional prop: `preview?: (view: DeviceView) => ReactNode`.
- Compute the stage content once:
  `const stageContent = isPreviewView(activeView) ? (preview?.(activeView) ?? stage) : stage;`
  (falls back to `stage` when no `preview` is supplied, so the prop is backwards-safe).
- Render `stageContent` in **both** stage positions (the Style/Settings `<s-grid>` cell and
  the Content-only `<s-box>`), replacing the two bare `{stage}` usages.
- Update the stale _"visual-only in A2 … Phase D"_ comment to describe the new behavior.

`activeView` stays owned by `EditorShell` (unchanged); the toggle already sets it.

### 3. `SpecTableEditor.tsx` (EDIT)

- Pass `preview={(view) => <DevicePreviewPlaceholder view={view} />}` to `<EditorShell>`.
- `DevicePreviewPlaceholder` is a **temporary**, local, presentational stand-in (e.g. an
  `<s-box>` reading _"{Desktop} preview — coming in a later step"_). It exists **only** to
  prove the swap; **Step 3 replaces it with `<SpecTablePreview view={view} rows=… />`**.

## Testing

- **Unit (Node, pure):** `deviceView.test.ts` covering `isPreviewView` for all four
  `ViewId`s — `"edit" → false`; `"desktop" | "tablet" | "mobile" → true`. This is the
  "slot renders only off-Edit" coverage the step calls for, expressible without a DOM.
- **Browser (the real gate)** — in the embedded admin on the `shopify app dev` preview
  ([[browser-verify-embedded-app]]), on a template editor (`/app/templates/:id`):
  1. Default **Edit** shows the normal editable grid (toolbar, gutter, rows).
  2. Click **Desktop** → the stage swaps to the placeholder; the editor grid is gone.
  3. **Tablet** and **Mobile** each swap to the placeholder and the placeholder reflects the
     active device name (the `view` arg is threaded through).
  4. Click **Edit** → the editable grid returns, fully interactive.
  5. On the **Settings** tab, entering a device view still swaps the stage while the Settings
     **sidebar stays put** (previews replace the stage, not the sidebar).
  6. No console errors in the admin top frame; the SaveBar / dirty state is untouched.

## Locked decisions

- **`preview` is a render-prop `(view: DeviceView) => ReactNode`**, not a bare `ReactNode` —
  the preview needs the active device view, which `EditorShell` owns, so it passes it in.
- **The predicate is the unit under test.** `isPreviewView` (a pure type guard in
  `deviceView.ts`) carries the edit-vs-preview logic so it is Node-unit-testable; `EditorShell`
  itself is verified in the browser (no component-test infra in this repo).
- **Previews replace the stage, never the sidebar.** The stage-slot content becomes the
  preview in both `EditorShell` branches; `activeTab`-driven sidebar show/hide is unchanged.
- **The placeholder is throwaway; the wiring is permanent.** Only `DevicePreviewPlaceholder`
  is removed (at Step 3); the `preview` prop, `deviceView.ts`, and the `EditorShell` swap stay.
- **No renderer / iframe / stylesheet / width sizing / CSS** in this step — all later.
- **No reducer / schema / dependency / persistence / server change.**

## What this step does *not* own (boundary with later steps)

- **The storefront-accurate markup** (`renderSpecTableHtml`) → **Step 2**.
- **The iframe + `SpecTablePreview.tsx`** (replacing the placeholder) → **Step 3**.
- **The shared `spec-table.css`** injected into the iframe → **Step 4**.
- **Device widths** (desktop full / tablet 768 / mobile 390, centered) → **Step 5**.
- **Iframe auto-height** → **Step 6**; **a11y / read-only hardening / empty state** → **Step 7**.
- **`TableStyling`, the mobile row-layout option, live dynamic-value resolution, and the
  merchant-theme ambient look** → out of feature 49 entirely (Style-tab work / future).

## File placement (per `code-standards.md` File Organization)

- New pure module → **`app/routes/app.templates_.$id/deviceView.ts`** (route-co-located,
  dependency-free).
- New unit test → **`app/routes/app.templates_.$id/deviceView.test.ts`** (Node env, matches
  the existing `include: app/**/*.{test,spec}.{ts,tsx}`).
- Edits → **`EditorShell.tsx`**, **`SpecTableEditor.tsx`** (same folder).
- **Unchanged:** `route.tsx`, `useRowEngine.ts`, `ContentTab.tsx`, every `app/utils/*`,
  `app/models/*`, `app/shopify/*`, `prisma/schema.prisma`, `package.json`,
  `SpecTableEditor.module.css`, and the `extensions/` theme app extension.

## Done when

1. The device toggle **swaps the stage** to the placeholder for Desktop / Tablet / Mobile and
   **Edit** restores the editable grid, browser-verified in the embedded admin (incl. the
   Settings-tab sidebar-stays-put case); no console errors.
2. `isPreviewView` exists as a pure type guard in `deviceView.ts` with `deviceView.test.ts`
   green for all four view values.
3. The `preview` render-prop + `SpecTableEditor` wiring are in place; `EditorShell` renders
   the preview slot in both stage branches; the stale toggle comment is updated.
4. `route.tsx` / `useRowEngine.ts` / `ContentTab.tsx` and the reducer/schema/deps are
   **unchanged**; the full test suite stays green.
5. Gate passes: `npm run typecheck && npm run lint && npm run format:check &&
   npm run test:run && npm run build`, then **browser-verified**.
6. `progress-tracker.md` updated — Step 1 complete; point at **Step 2 (pure
   `renderSpecTableHtml` renderer)**.
