# Reshell A2 — Build the EditorShell (the mockup chrome)

## Goal in one sentence

Build the editor's **mockup chrome** — a full-bleed Polaris **editor card** holding a
**control row** (segmented **tabs** Content / Style / Settings + a segmented **device
toggle** Edit / Desktop / Tablet / Mobile) above a **stage-wrap** (a 300px **sidebar slot**
shown only on Style / Settings + an always-present **stage slot**) — as a **presentational
`EditorShell`** authored in its final home (`app/routes/app.templates_.$id/EditorShell.tsx`)
and exercised in a **throwaway `/app/editor-shell` sandbox route** with **dummy rows**, so
the chrome is proven in the real embedded admin **without touching the working 1,521-line
editor**, **with no reducer change, no schema change, no persistence, no new dependency**,
and **no bounded scroll yet** (that is A3).

## Why this is now (and why it's a separate step)

- **The reshell is a committed plan and A2 is its chrome layer.** Per
  `plan-reshell-spec-table-editor.md` → Phase A: *"A2 — Build `EditorShell` (the mockup
  chrome). Control row: segmented tabs … + segmented device toggle …, both as `<s-stack>`
  buttons with scoped segmented CSS. `activeTab`/`activeView` state in the shell. … Sidebar
  slot is an empty 300px placeholder shown **only** on Style/Settings."* This step builds
  exactly that shell — the structure of `design/spec-editor-mockup.html` (the **editor
  card**: `.controlrow` + `.stage-wrap`), treated as a **visual target, not literal
  markup**.
- **Built in a sandbox so the reorder is safe.** The plan's default order is A1 → A2 → A3
  ("behavior freeze before re-skin"). We deliberately run **A2 → A3 → A1** instead, which is
  *safer*, not riskier: A2/A3 are built in a **new throwaway route with dummy data**,
  touching **none** of `route.tsx` / `SpecTableEditor.tsx`. The original A1-first order was
  required only because the original plan built the shell **directly into the live route**,
  so the engine had to be extracted first to have something to host. The sandbox inverts
  that dependency cleanly — the real editor stays **frozen and fully working** until A1.
  **Consequence (made explicit):** the A2/A3 gates verify *"the chrome renders / only the
  rows scroll, with dummy rows."* They do **not** verify *"the real editing engine is
  unchanged"* — that **real-engine-parity gate moves to A1**, when the real
  `ContentTab` / `RowGrid` are wired into this shell.
- **The risky code is untouched.** The project's hardest code — the contenteditable caret
  model, the smart-pill modal, `@dnd-kit` reorder, the Save → Postgres → metaobject
  round-trip — is **not** refactored here. A2 renders **dummy static content**; it has **no
  reducer, no engine, no caret, no save**. A bug in A2 is therefore a **layout / CSS /
  tab-state** bug, fully contained in new files, with the 219-test suite as a regression
  tripwire on the frozen engine.

A2 is an **internal scaffolding increment** (like Step 12 was "an internal verification
increment that must not ship to a merchant on its own"): the sandbox route is a dev harness,
not a merchant-facing screen. Its **durable output** is `EditorShell` + the chrome CSS; the
route and its dummy data are **deleted at A1**.

## Scope correction — what "implement the mockup" means in the embedded app

The mockup renders the **entire Shopify Admin** — the dark topbar, the left nav, the
contextual "Unsaved changes" save bar, and a page-header status dropdown + ⋯. **We build
none of that chrome.** In the embedded app:

- **Topbar + left nav** → Shopify renders these. The app lives in the iframe under
  `app.tsx` (`<AppProvider embedded>` + `<s-app-nav>` + `<Outlet />`). Never rebuilt.
- **Contextual "Unsaved changes" save bar** → App Bridge `<SaveBar>` (already wired in the
  real editor; re-added per Phase F). Not in A2.
- **Page-header status dropdown + ⋯ + rename** → Phase F. Not in A2.

So **A2 = only the editor card**: the **control row** and the **stage-wrap**. Everything
outside `.editor` in the mockup is out of scope.

## Foundation carried (reused unchanged)

- **The working editor's contract is frozen.** `route.tsx` mounts
  `<SpecTableEditor key={editorNonce} initialName initialStatus initialRows onDiscard />`
  inside `<s-page><s-section heading="Rows">`. A2 **does not touch** `route.tsx`,
  `SpecTableEditor.tsx`, or any util/server file. The 219-test suite stays green as the
  tripwire.
- **The CSS conventions are established.** `SpecTableEditor.module.css` already proves the
  house style A2 extends: **Polaris carries the chrome; scoped CSS covers only what Polaris
  can't express; no hardcoded hex** — colors are Polaris tokens, the runtime-captured
  `--appx-token-color` custom property, `currentColor`, and `color-mix()` tints; everything
  else is rem. A2 adds the **segmented-control** rules under the same rules.
- **The Polaris quirks are known** ([[polaris-web-component-gotchas]]): **`<s-button-group>`
  has no `<slot>`** — its children render at 0×0, so the segmented **tabs** and **device
  toggle** are plain `<button>`s grouped in an **`<s-stack direction="inline">`** with
  scoped segmented CSS. **Polaris `--p-color-*` / `--s-color-*` tokens are not exposed to
  light-DOM CSS** — any admin-chrome color the segmented CSS needs beyond what `<s-box>`
  token props supply is **captured at runtime into an `--appx-*` variable** (the
  `useCapturedTokenColor` precedent), never a hex literal. Valid `<s-icon>` names come from
  the `IconType` union in `@shopify/polaris-types`.
- **The route/auth pattern is fixed.** Every `/app/*` route authenticates via
  `authenticate.admin(request)`, re-exports `boundary.headers`, and is auto-registered by
  `flatRoutes()`. The sandbox route follows this so the embedded session + App Bridge +
  Polaris resolve.
- **Standards** (`code-standards.md`): Polaris `<s-…>` first (no legacy `@shopify/polaris`
  React); custom CSS tightly scoped + commented with the why; **Color & Theming** =
  one source of truth, admin = Polaris-faithful; a11y non-negotiable (keyboard + SR labels);
  File Organization (route-co-located components; the sandbox is a `app/routes/` file).

## What changes (architecture)

Two **durable** new artifacts (built in their final home) and two **throwaway** sandbox
artifacts (deleted at A1). **No reducer, no schema, no `package.json`, no server, no
persistence.**

### 1. `EditorShell.tsx` (NEW, durable) — `app/routes/app.templates_.$id/`

A **presentational** component. It owns the two pieces of shell state and renders the card,
the control row, and the stage-wrap **slots** — it knows nothing about the editing engine.

- **State (owned here):** `activeTab: "content" | "style" | "settings"` (default `content`)
  and `activeView: "edit" | "desktop" | "tablet" | "mobile"` (default `edit`).
- **Slots, not an engine.** This **refines the plan's `<EditorShell engine={engine} />`
  sketch into slots** so the sandbox can host dummy content and A1 just wires the engine
  one level up. EditorShell takes a **`stage: ReactNode`** (the Content grid in real use;
  the dummy grid in the sandbox) and reserves **`stylePanel?` / `settingsPanel?: ReactNode`**
  (Phases B / C — default to the empty placeholder in A2). The real route's thin wrapper
  later passes `stage={<ContentTab engine={engine} />}`; the shell stays engine-free.
- **Card framing (Polaris-first).** The card is a full-bleed **`<s-box>`** (surface
  background, border, `borderRadius`, overflow hidden) — **not** wrapped in
  `<s-section heading="Rows">` (locked decision). Prefer `<s-box>` / `<s-stack>` with
  Polaris token props for the card, the control-row container, the stage-wrap split, and the
  sidebar region; **drop to raw JSX + scoped CSS only where Polaris can't express the layout**
  (the segmented look, the sticky/scroll structure A3 adds). Verify exact `<s-box>` prop
  names/values against `polaris-types` (typecheck is the gate).
- **Control row** (top of the card): segmented **tabs** on the left + segmented **device
  toggle** on the right, each a row of plain `<button>`s inside an `<s-stack direction=
  "inline">` (not `<s-button-group>`), styled segmented via scoped CSS. **A11y:** tabs as a
  `role="tablist"` with `role="tab"` + `aria-selected` + roving arrow-key focus; the device
  toggle as a labelled group of toggle buttons with `aria-pressed`; every button
  keyboard-reachable and SR-named (icon-only buttons get an `aria-label`, inner `<s-icon>`
  marked `aria-hidden`). Clicking a tab sets `activeTab`; clicking a toggle button sets
  `activeView`. **In A2 the device toggle only updates its own active state** — the
  preview rendering of the stage is **Phase D**.
- **Stage-wrap** (below the control row): a flex split of **[ sidebar (conditional) | stage
  (always) ]**. The **sidebar** (300px) renders **only when `activeTab !== "content"`** and
  holds the **empty placeholder** for A2 (or `stylePanel` / `settingsPanel` when those land);
  the **stage** (`flex: 1`) always renders the `stage` slot. Switching tabs **reveals/hides
  the sidebar** — it never replaces the stage (mirrors the mockup's `render()`:
  `leftpanel.classList.toggle('hidden', tab==='content')`, grid always present).

### 2. CSS additions (durable) — `SpecTableEditor.module.css`

Extend the existing module with the chrome classes the plan names: `.editorCard`,
`.controlrow`, `.tabs` / `.tab`, `.toggle` / `.toggleBtn`, `.stageWrap`, `.leftpanel`,
`.stage`. Scope tightly; comment the why (segmented control is not a Polaris primitive).
**No hardcoded hex** — Polaris token props on `<s-box>` carry surfaces/borders where
possible; the segmented active/inactive states use captured `--appx-*` tokens /
`currentColor` / `color-mix()`. The **sticky header + bounded-scroll** rules are **A3**, not
here.

### 3. Sandbox route (NEW, throwaway) — `app/routes/app.editor-shell.tsx`

A dev harness at `/app/editor-shell`. A `loader` that `authenticate.admin(request)` and
returns nothing meaningful; `headers = boundary.headers`; a default export that renders
`<s-page heading="Spec table editor — shell preview">` containing
`<EditorShell stage={<DummyGrid rows={DUMMY_ROWS} />} />`. **Not added to `<s-app-nav>`** —
reached by typing the URL during dev. **Deleted at A1.**

### 4. Dummy data + `DummyGrid` (NEW, throwaway) — co-located with the sandbox route

- **`DUMMY_ROWS`** — a long `EditorRow[]` fixture (~60–80 rows: a mix of `DATA` rows with
  plain `TEXT`, multiline `LINE_BREAK` values, native-field pills, and metafield pills, plus
  several `SECTION_HEADER` rows) using the **real `EditorRow` type** from `app/utils/rows.ts`
  (type-only import). Enough rows to overflow the iframe so **A3** has something to scroll.
- **`DummyGrid`** — a **static, non-interactive** stage renderer: a sticky Label/Value
  header + a list of rows mirroring the mockup's grid DOM (gutter / label cell / value
  cell). It is a **stand-in for the real `RowGrid`** (extracted at A1) deliberately shaped
  so **A3's sticky-header + scroll-height work and A1's real `RowGrid` port over with
  minimal divergence**. No caret, no dnd, no handlers — pills/text render as read-only
  spans.

## Sub-steps (build and verify one at a time)

Each gate = `npm run typecheck && npm run lint && npm run format:check && npm run test:run
&& npm run build` all green, **then** browser-verify in the embedded admin (Claude-in-Chrome
on the `shopify app dev` preview — jsdom can't render Polaris web components; see
[[browser-verify-embedded-app]]). No new unit tests are expected (A2 adds no pure logic);
the **219-test suite stays green** as the frozen-engine tripwire.

### A2.1 — Sandbox route + dummy data + card framing

Scaffold `app.editor-shell.tsx` (auth + `boundary.headers`), `DUMMY_ROWS`, `DummyGrid`, and
a minimal `<EditorShell>` that renders the full-bleed **`<s-box>` card** with the `stage`
slot (the dummy grid). No tabs/toggle behavior yet.

**Verify (browser):** `/app/editor-shell` loads inside the Shopify admin; the editor card
renders as a full-bleed card (border + radius, Polaris-faithful surface); the long dummy
table is visible. The **whole page still scrolls** (expected — A3 fixes the bounded scroll).
No console errors in the admin top frame.

### A2.2 — Control row: segmented tabs + device toggle

Add the control row: tabs (Content / Style / Settings) + device toggle (Edit / Desktop /
Tablet / Mobile) as `<s-stack>` `<button>`s with the segmented CSS; wire `activeTab` /
`activeView`; add the a11y semantics.

**Verify (browser):** both groups render with the segmented look; clicking a tab marks it
active; clicking a device button marks it active (visual only — the stage does not change,
preview is Phase D); both groups are **keyboard-reachable** (Tab to them, arrow/Enter/Space
operate them) with a visible focus ring and accessible names. No hex anywhere (spot-check
computed styles trace to Polaris tokens / `--appx-*` / `currentColor`). No console errors.

### A2.3 — Sidebar slot (Content vs Style/Settings)

Add the stage-wrap split: the 300px sidebar placeholder renders **only** on Style /
Settings; Content shows the stage full-width with no sidebar; the stage/grid stays present
across all tabs.

**Verify (browser):** on **Content** there is no sidebar; switching to **Style** or
**Settings** reveals the 300px empty placeholder to the left while the grid stays in the
stage; switching back to **Content** hides it. The toggle behaves independently of the tabs.
No layout jump that breaks the card; no console errors.

## What renders where (A2 surface map)

| Mockup region                          | A2 owner / treatment                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| Dark topbar, left admin nav            | **Shopify** (iframe parent) — never built                                       |
| "Unsaved changes" save bar             | App Bridge `<SaveBar>` — **Phase F**, not A2                                     |
| Page header status dropdown + ⋯        | **Phase F**, not A2 (sandbox just uses `<s-page heading>`)                       |
| `.editor` card framing                 | **`<s-box>`** full-bleed card (durable `EditorShell`)                            |
| `.controlrow` tabs (Content/Style/Settings) | `<s-stack>` of `<button>`s + segmented CSS; sets `activeTab` (A2.2)         |
| `.controlrow` device toggle            | `<s-stack>` of `<button>`s + segmented CSS; sets `activeView` (visual only, A2.2) |
| `.stage-wrap` left panel (300px)       | Sidebar slot — empty placeholder, shown only on Style/Settings (A2.3)           |
| `.stage` grid                          | `stage` slot — the throwaway `DummyGrid` over `DUMMY_ROWS`                       |
| Bounded inner-scroll + sticky header   | **A3**, not A2                                                                   |
| Device-preview WYSIWYG rendering       | **Phase D**, not A2                                                              |

## Locked decisions

- **Full-bleed editor card, Polaris-first.** The card is an `<s-box>` (not
  `<s-section heading="Rows">`), matching the mockup. Build with Polaris web components
  (`<s-box>` / `<s-stack>` + token props) wherever they express the layout; drop to raw JSX
  + tightly-scoped module CSS only where they can't (the segmented control look; the
  sticky/scroll structure A3 adds). **No hardcoded hex** — Polaris tokens / captured
  `--appx-*` / `currentColor` / `color-mix()` only.
- **`EditorShell` is presentational (slots), not engine-coupled.** It takes a `stage`
  `ReactNode` (and reserves `stylePanel` / `settingsPanel` for B/C); it owns only
  `activeTab` / `activeView`. The plan's `engine={engine}` becomes
  `stage={<ContentTab engine={engine} />}` wired one level up at A1.
- **Components authored in their final home** (`app/routes/app.templates_.$id/`); the
  **sandbox route + `DummyGrid` + `DUMMY_ROWS` are throwaway**, removed at A1. No file moves
  at integration.
- **A2/A3 built in the sandbox so the working editor stays frozen.** Reordering A2/A3 before
  A1 is safe because of this quarantine; the real-engine-parity gate moves to A1.
- **Tabs and device toggle are `<s-stack>` `<button>`s** with scoped segmented CSS, **not
  `<s-button-group>`** (no slot — [[polaris-web-component-gotchas]]).
- **Device toggle is visual-only in A2.** It updates `activeView` and its own active state;
  the stage rendering does not react to it — device-preview WYSIWYG is **Phase D**.
- **Sidebar appears only on Style/Settings**, as an **empty 300px placeholder**; Content
  shows none; the stage/grid is always present (tabs reveal/hide the sidebar, never replace
  the stage).
- **No reducer / schema / dependency / persistence / server change.** A2 is pure admin UI
  over dummy data.

## What A2 does *not* own (boundary with later steps)

- **The editing engine** — caret model, value surface, smart-pill modal, `@dnd-kit` reorder,
  reducer, Save → Postgres → metaobject. All **frozen**; A2 renders dummy static content.
  Extraction + real integration is **A1** (after A3).
- **Bounded inner-scroll + sticky header** → **A3** (the `useScrollRegionHeight` hook + the
  sticky `.grid-head` + scroll-into-view inside the internal scroller).
- **Device-preview WYSIWYG** (constrained widths, mobile stacking, resolved-value stand-ins)
  → **Phase D**.
- **Style / Settings sidebar contents** → **Phases B / C** (A2 = empty placeholder).
- **Header status dropdown / ⋯ / rename + contextual Save bar** → **Phase F** (+ App Bridge
  `<SaveBar>`); the **admin topbar + left nav** are **Shopify's** and are never built.

## File placement (per `code-standards.md` File Organization)

- Durable shell → **`app/routes/app.templates_.$id/EditorShell.tsx`** (route-co-located).
- Chrome CSS → extend **`app/routes/app.templates_.$id/SpecTableEditor.module.css`**.
- Throwaway sandbox route → **`app/routes/app.editor-shell.tsx`** (`/app/editor-shell`,
  auto-registered by `flatRoutes()`; **not** linked in `<s-app-nav>`).
- Throwaway dummy data + grid → co-located with the sandbox route (e.g.
  `app/routes/app.editor-shell.tsx` inline, or a sibling fixture deleted with it at A1).
- **Unchanged:** `route.tsx`, `SpecTableEditor.tsx`, every `app/utils/*`, `app/models/*`,
  `app/shopify/*`, `prisma/schema.prisma`, `package.json`.

## Open questions (resolve while building A2)

- **Exact `<s-box>` props** for the card surface / border / radius / padding and the
  control-row + stage-wrap containers — confirm names/values against `polaris-types`
  (typecheck is the gate). Decide per region whether Polaris props suffice or a scoped class
  is needed.
- **Admin-chrome grays** the segmented CSS needs (segment track background, active-tab
  surface + shadow, dividers) — decide which come from `<s-box>` token props vs. a
  **captured `--appx-*` token** (extending `useCapturedTokenColor`). Hex-free either way.
- **Device-toggle icon names** (`desktop` / `tablet` / `mobile` / edit) — confirm against the
  `IconType` union; if `tablet` is absent, pick the closest icon or a short text label.
- **Tab a11y semantics** — `role="tablist"` + roving arrow-key focus vs. simple toggle
  buttons with `aria-pressed`; pick the most standards-correct that works with the keyboard
  and verify **functionally** (the embedded iframe is cross-origin, so the live region / AOM
  can't be inspected from the top frame — confirm via screenshots + keyboard, not by reading
  the iframe a11y tree).
- **Sandbox route name** — `app.editor-shell.tsx` (→ `/app/editor-shell`) proposed; trivial
  to rename.

## Done when

1. Sub-steps **A2.1–A2.3** each pass their browser verify.
2. A **throwaway `/app/editor-shell`** route renders a **durable presentational
   `EditorShell`** (authored in `app/routes/app.templates_.$id/`) as a **full-bleed
   `<s-box>` card** hosting a long dummy table, with the working editor **untouched**.
3. The **control row** shows segmented **tabs** (Content / Style / Settings) + a segmented
   **device toggle** (Edit / Desktop / Tablet / Mobile); tabs switch and mark the active
   one; the toggle marks the active view (visual only); both are **keyboard-reachable +
   SR-labelled** with a visible focus ring.
4. The **300px sidebar** placeholder appears **only** on Style / Settings; Content shows
   none; the stage/grid stays present across tabs.
5. Built **Polaris-first** (`<s-box>` / `<s-stack>`); scoped CSS only where Polaris can't
   express the segmented look; **no hardcoded hex** (Polaris tokens / captured `--appx-*` /
   `currentColor` / `color-mix`); **a11y holds**.
6. `route.tsx` and `SpecTableEditor.tsx` are **byte-unchanged**; the **219-test suite stays
   green**; **no console errors** in the embedded admin top frame.
7. `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:run`, and
   `npm run build` all pass; **browser-verified** in the real embedded app.
8. `progress-tracker.md` updated to mark **A2 complete** and record the locked decisions
   (full-bleed Polaris card, slot-based `EditorShell`, throwaway sandbox); point at the
   next step — **A3 (bounded inner-scroll)**, then **A1 (engine extraction + integration)**.
