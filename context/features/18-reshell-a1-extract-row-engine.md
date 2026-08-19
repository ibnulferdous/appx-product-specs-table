# Reshell A1 — Extract `useRowEngine` + presentational components, integrate the shell

## Goal in one sentence

Turn the working **1,521-line `SpecTableEditor.tsx`** into a **thin wrapper** —
`const engine = useRowEngine(...)` feeding a **presentational `<ContentTab engine={engine} />}`**
hosted inside the **A2 `EditorShell`** card and the **A3 `.rowsScroller`** — by extracting
**all** reducer state / caret refs / dnd sensors / save+dirty / metafield fetch / modal state /
container paste into a new durable **`useRowEngine.ts`** hook and splitting the JSX into
`ContentTab` / `RowActionsToolbar` / `RowGrid` / `InsertFieldModal` plus the byte-identical
`EditorRowItem` / `RowGutter` / `ValueCell` leaf files — **changing no behavior**, replacing the
old `<s-section heading="Rows">` layout with the mockup shell, wiring the real engine so the
existing `scrollIntoView` now scrolls the **internal list** (the A3 win, finally verified on the
real engine), and **deleting the throwaway `/app/editor-shell` sandbox** — gated by the **219-test
suite** plus a **complete in-browser editing matrix** before any frozen-engine code moves.

## Why this is now (and why it's the riskiest step)

- **It is the integration that makes the reshell real.** A2 built the chrome and A3 built the
  bounded scroller, both **in a throwaway sandbox over dummy data** so the working editor stayed
  frozen. A1 is where the **real, browser-verified editing engine** moves into that shell. Per
  `plan-reshell-spec-table-editor.md` → A1: *"Extract `useRowEngine` + presentational components
  (behavior freeze). Pure refactor, layout unchanged: move all state/refs/handlers/effects from the
  container into `useRowEngine.ts`; split the JSX into `RowActionsToolbar`, `RowGrid`,
  `InsertFieldModal`, and move `EditorRowItem`/`RowGutter`/`ValueCell` to their own files
  byte-identical (import paths only). `SpecTableEditor` becomes `const engine = useRowEngine(...)`
  wiring the same on-screen result as today."*
- **The real-engine-parity gate lives here (it was deferred from A2/A3).** A2/A3 verified *"the
  chrome renders / only the rows scroll, with dummy rows."* They explicitly did **not** verify
  *"the real editing engine is unchanged"* — that gate is A1's. The project's hardest code — the
  contenteditable linear-caret model, the smart-pill modal, `@dnd-kit` reorder, the
  Save → Postgres → metaobject round-trip — is touched here for the first time since the reshell
  began, so A1 carries the **219-test suite as a tripwire** and a **full in-browser matrix** as the
  acceptance bar.
- **It is a pure refactor, sequenced so risk is contained.** Nothing about *what the editor does*
  changes. The work is moving code across file boundaries and lifting state into a hook. The danger
  is purely **regression** — a dropped dependency, a lost memoization, a caret ref that no longer
  bridges. A1 is therefore split into four sub-steps (below) so each move is independently gated,
  and the **highest-risk pieces are listed explicitly to preserve verbatim**.

A1 is the **last Phase-A step**. Its durable output is `useRowEngine.ts` + the presentational
component tree + the integrated route; its cleanup is the **deletion of the `/app/editor-shell`
sandbox, its `DummyGrid`, and `DUMMY_ROWS`**. After A1 the editor matches the mockup's structure,
the scroll pain is fixed on the real engine, and Content is at full parity.

## Carry-over from the just-made shell change (hint + Label/Value header removed)

The merchant decision recorded while finishing A2/A3: the **hint line** (*"Click a value to edit …
drag the handle to reorder."*) and the **sticky Label/Value column header** were **removed** from
the shell to free vertical space for viewing/editing the table. A1 honours this in the real port:

- **`RowActionsToolbar` carries no hint line.** (The real editor never had one; only the dummy did
  — there is nothing to drop, just nothing to add.)
- **`RowGrid` renders no Label/Value header.** The existing header grid in `SpecTableEditor.tsx`
  (the `<s-grid gridTemplateColumns={DATA_COLUMNS}>` with `Label` / `Value` `<s-text type="strong">`,
  currently around lines 1339–1343) is **dropped during the port**. Column alignment is unaffected —
  it comes from the shared `DATA_COLUMNS` / `SECTION_COLUMNS` grid templates on every row, not from
  the header. The header was a visual label only.
- The now-unused `.stickyHeader` CSS class (and its A3 sticky-header rules) is **dead after A1**;
  remove it from `SpecTableEditor.module.css` as part of A1.4 cleanup (it is referenced only by the
  sandbox, which A1 deletes, and the A3 feature doc).

## Foundation carried (reused unchanged)

- **The server/data contract is frozen.** `route.tsx` loader (`{ template: null | { id, name,
  status, rows } }`) and action (JSON edit path → `{ ok, status, syncError, roundTripOk }`),
  `template.server.ts`, `metaobjects.server.ts`, `metafieldDefinitions.server.ts`, and the
  `/app/metafield-definitions` resource route are **untouched**. The only `route.tsx` JSX change is
  swapping the `<s-section heading="Rows">` wrapper for the full-bleed shell (A1.4) while keeping the
  **`editorNonce` discard-remount key** and the loader/action exactly as they are.
- **The engine logic is reused verbatim** (the plan's "do not rewrite" list): `rows.ts`,
  `valueParts.ts`, `valueDom.ts`, `shopifyFields.ts`, `clipboardTable.ts` + `clipboardTableDom.ts`,
  `reorderAnnouncements.ts`, `rowsSerialize.ts`. A1 imports them from their current homes; **no util
  changes**. The reducer, the linear-caret model, and the smart-pill rules do not move.
- **A2's shell + A3's scroller are the host.** `EditorShell.tsx` already takes a `stage: ReactNode`
  slot; A1 passes `stage={<ContentTab engine={engine} />}`. `useScrollRegionHeight.ts` already
  measures the `.rowsScroller`; `RowGrid` adopts the same scroller + hook the `DummyGrid` proved.
- **CSS conventions hold.** `SpecTableEditor.module.css` is the single module; A1 adds no new color
  — **no hardcoded hex** (Polaris tokens / captured `--appx-token-color` / `currentColor` /
  `color-mix()` only), per `code-standards.md` → Color & Theming.
- **Standards** (`code-standards.md`): Polaris `<s-…>` first; route-co-located components; a11y
  non-negotiable (the keyboard reorder + SR announcements + the labelled contenteditable surface all
  survive the move intact).

## What changes (architecture)

All files live in `app/routes/app.templates_.$id/`. The split mirrors the **clean internal seams
already in `SpecTableEditor.tsx`**: `RowGutter` (currently 169–224), `ValueCell` (239–547),
`EditorRowItem` (566–691), `useCapturedTokenColor` (702–732), and the container body (739–1521).

### 1. `editorShared.ts` (NEW, durable) — leaf module of shared types + constants

A dependency-free leaf both the engine and the components import (so there is **no cycle**: the
engine imports no components; components import only this leaf + utils). Move here, byte-identical:

- Grid constants `GUTTER` / `DATA_COLUMNS` / `SECTION_COLUMNS`.
- `INSERT_FIELD_MODAL_ID`, `SAVE_BAR_ID`, `REORDER_INSTRUCTIONS`.
- The `useBrowserLayoutEffect` SSR-safe layout-effect shim (consumed by `ValueCell`).
- `readValue(event)`, `metafieldChoiceValue(part)`, `partToSelection(part)`.
- The `EditTarget`, `SavedCaret`, `FieldSelection` types.

### 2. `RowGutter.tsx`, `ValueCell.tsx`, `EditorRowItem.tsx` (MOVED, durable) — byte-identical

Move the three memoized leaf components to their own files **changing only import paths** (pull
shared constants/types from `editorShared.ts`, styles from `SpecTableEditor.module.css`, utils from
their current homes). **`useSortable` stays INSIDE `EditorRowItem`** — never lifted to a parent
(lifting it re-renders every row together and loses the per-row memoization that makes a single cell
edit cheap). `EditorRowItem` keeps `memo(...)`; `RowGutter` and `ValueCell` keep `memo(...)` /
their current shape. No JSX, no effect, no handler inside these changes.

### 3. `useRowEngine.ts` (NEW, durable) — the entire container brain

A hook taking the same inputs as today's container (`initialRows`, `initialName`, `initialStatus`,
`onDiscard`) and returning **state + handlers**, owning the App Bridge / fetcher / revalidator
couplings so every component downstream is presentational. It absorbs, unchanged in behavior:

- **Reducer + selection state:** `useReducer(rowsReducer, initialRows)`, `activeRowId`, `atCap`,
  `useCapturedTokenColor()` (moved in so the token color is captured once per engine mount),
  `useAppBridge()`.
- **Drag reorder (Steps 10–11):** `sensors`, `handleDragEnd`, `rowsRef`, `dndAnnouncements`.
- **Save (Step 9.5):** `saveFetcher`, `revalidator`, `saving`, the dirty-tracking trio
  (`currentRowsJson` / `rowsJsonRef` / `savedRowsJson`, `isDirty`), `handleSave`, `handleDiscard`,
  and the once-per-save `handledSaveRef` effect (dirty reset + revalidate + toast).
- **Metafield definitions fetch (Step 8):** `metafieldsFetcher`, `metafieldsRequested`,
  `loadMetafieldDefinitions`, `ensureMetafieldDefinitions`, and the derived
  `metafieldsLoading` / `metafieldDefinitions` / `metafieldCount` / `visibleMetafields` /
  `showCombinedEmpty` / `visibleFields`.
- **Modal caret bridge (Steps 5–9):** `activeCaretRef`, `savedCaretRef`, `hasActiveCaret`,
  `selection`, `editTarget`, `searchQuery`, `searchFieldRef`, `pendingCaretByRowRef`,
  `onCaretChange`, plus `focusSearchField`, `handleOpenInsertField`, `handleEditPart`,
  `handleSearchInput`, `handleSelectNative`, `handleSelectMetafield`, `handleCommit`,
  `handleCancelInsertField`.
- **Row ops + scroll:** `scrollTargetRef` + its `scrollIntoView` effect, `onActivate`, `onDelete`,
  `insertActive`, `handleAddRow`, `handleAddSection`, `handleDuplicate`, `handleAppendRow`,
  `canDuplicate`.
- **Bulk table paste (Steps 12–13):** `handleContainerPaste`.

All handlers stay wrapped in `useCallback` with the **same dependency arrays** so referential
stability holds and `EditorRowItem` memoization is not defeated. The hook returns one object;
destructure it in `ContentTab`.

### 4. `ContentTab.tsx` (NEW, durable) — the Content stage

`function ContentTab({ engine }: { engine: ReturnType<typeof useRowEngine> })`. Renders, from engine
props: the bulk-paste capture wrapper (`<div onPaste={engine.handleContainerPaste}>`), the
`RowActionsToolbar`, the at-cap `<s-banner>`, the empty state (`rows.length === 0`) or the
`RowGrid`, and the `InsertFieldModal`. Presentational — it reads engine state and forwards engine
handlers; it holds **no state of its own**.

### 5. `RowActionsToolbar.tsx` (NEW, durable)

The toolbar `<s-grid>`: Add row / Add section / Duplicate / Insert field (the `<s-stack
direction="inline">` of `<s-button>`s — **not** `<s-button-group>`, the known no-slot gotcha) + the
`Rows: N / 200` counter. Disabled gates (`atCap`, `canDuplicate`, `hasActiveCaret`) come from
engine. **No hint line** (carry-over decision above). This is the **fixed** toolbar that stays in
view above the bounded scroller (the whole point of A3).

### 6. `RowGrid.tsx` (NEW, durable) — the bounded rows scroller hosting the real rows

Wraps the real rows in the **A3 `.rowsScroller`** (`useScrollRegionHeight(scrollerRef,
rows.length)` → `style={{ maxHeight }}`), containing the `DndContext` / `SortableContext` over
`EditorRowItem`s and the bottom dashed **Add row** (which scrolls with the rows). **No Label/Value
sticky header** (carry-over decision). Because the rows now live inside an `overflow-y: auto`
scroller, the engine's existing `scrollTargetRef.current?.scrollIntoView({ block: "nearest" })`
scrolls **that scroller** automatically — A3 built this; A1 is where it is finally **verified on
the real engine** ("Add row at the bottom scrolls the list, not the iframe"). No engine edit is
needed for the swap; the scroller being the nearest scrollable ancestor makes it automatic.

### 7. `InsertFieldModal.tsx` (NEW, durable)

Extract the existing `<s-modal id={INSERT_FIELD_MODAL_ID}>` subtree verbatim, driven by engine
props (`editTarget`, `searchQuery`, `selection`, the metafield status fields, and the
`handleSearchInput` / `handleSelectNative` / `handleSelectMetafield` / `handleCommit` /
`handleCancelInsertField` handlers + `searchFieldRef`). Behavior identical; only the JSX home moves.

### 8. `SpecTableEditor.tsx` (REWRITTEN to a thin wrapper, durable)

```tsx
export function SpecTableEditor(props: SpecTableEditorProps) {
  const engine = useRowEngine(props);
  return (
    <>
      <EditorShell stage={<ContentTab engine={engine} />} />
      <SaveBar id={SAVE_BAR_ID} open={engine.isDirty}>
        <button variant="primary" onClick={engine.handleSave} loading={engine.saving}>Save</button>
        <button onClick={engine.handleDiscard}>Discard</button>
      </SaveBar>
    </>
  );
}
```

`<SaveBar>` renders at the **wrapper level (outside `EditorShell`)** so unsaved-changes state
persists across tab switches (it portals to the admin top bar regardless of the active tab). The
`stylePanel` / `settingsPanel` slots stay undefined (Phases B / C).

### 9. `route.tsx` (minimal JSX change, durable)

In `TemplateOverview`, replace `<s-section heading="Rows"><SpecTableEditor .../></s-section>` with
the **full-bleed editor** (`<SpecTableEditor .../>` rendering the `EditorShell` card directly) —
the A2-locked "not inside `<s-section heading="Rows">`" decision. **Keep** the `editorNonce` key and
the `onDiscard` remount. The "Overview" status section above it stays as-is until Phase F. **Loader
and action are byte-unchanged.**

### 10. Deletions (cleanup) — `app/routes/app.editor-shell.tsx`

Delete the throwaway sandbox route, its `DummyGrid`, `DUMMY_ROWS`, and the sandbox copy of
`useCapturedTokenColor`. Remove the now-dead `.stickyHeader` CSS rules.

## Highest-risk pieces — preserve EXACTLY (the plan's named tripwires)

- **The two-ref caret bridge.** `activeCaretRef` is the live caret in whichever value cell last
  reported one; it is **not** cleared on value-cell blur (so Tabbing/clicking to the Insert-field
  button keeps a committable selection) and **is** cleared when a Label/Section field focuses.
  `savedCaretRef` snapshots it on modal open. `pendingCaretByRowRef` is a **stable ref-held Map**
  consumed **once per row** by `ValueCell`'s reconcile effect to refocus + restore the caret after a
  modal insert. Keep all three as refs on the engine; never convert to state, never recreate the Map.
- **`EditorRowItem` memoization with `useSortable` inside it.** Keep `memo` + the hook in the row;
  keep `dispatch` / `onActivate` / `onDelete` / `onCaretChange` / `onEditPart` referentially stable
  and `pendingCaret` a stable Map, so non-edited rows skip re-render entirely.
- **`handleDiscard` reads `rowsJsonRef.current`**, not `JSON.stringify(rows)` (the ref is the
  current-rows snapshot independent of render timing).
- **`handleCommit` does a fresh per-commit row lookup** (`rows.find(...)` at commit time) so it
  never closes over a stale row; keep `rows` in its dependency array.
- **The container paste skip-guards** (`event.defaultPrevented`, the `closest("s-text-field, …")`
  target check, `cellCount(grid) <= 1`) and the cap-truncation toast wording stay verbatim.

## Sub-steps (build and verify one at a time)

Per-step gate = `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
npm run build` all green, **then** browser-verify in the embedded admin (Claude-in-Chrome on the
`shopify app dev` preview — jsdom can't render Polaris web components or contenteditable selection;
see [[browser-verify-embedded-app]]). The **219-test suite stays green at every sub-step** as the
frozen-engine tripwire (A1 adds no pure logic, so no new unit tests are expected; the editing
behavior is browser-verified). A1.2 and A1.4 are the risk peaks and each get the **full matrix**.

### A1.1 — Move the leaf components + shared module (byte-identical)

Create `editorShared.ts`; move `RowGutter`, `ValueCell`, `EditorRowItem` to their own files with
import-path-only changes. `SpecTableEditor.tsx` imports them; its container body and JSX are
otherwise unchanged (still the old `<s-section>` layout).

**Verify:** the editor renders and behaves exactly as before in the embedded admin (spot-check: type
a value, insert a pill, drag a row). 219 green. No console errors. Pure file move.

### A1.2 — Extract `useRowEngine` (state lift, layout unchanged)

Move **all** container state/refs/handlers/effects into `useRowEngine.ts`; `SpecTableEditor` becomes
`const engine = useRowEngine(props)` and renders the **same old JSX** wired to `engine.*`. **No
shell, no scroller yet** — this isolates the state lift from the re-skin so a regression here is
unambiguously a wiring bug.

**Verify (FULL matrix):** type a value; insert + edit a pill (native + metafield); mouse drag +
keyboard drag-reorder (Space/arrows/Enter, Escape cancels, SR announcements fire); paste a web
table (cap-truncation toast correct); Save → round-trip toast; Discard → remount to saved rows; cap
banner + disabled buttons at 200. **Zero behavior change.** 219 green.

### A1.3 — Split the JSX into presentational components

Extract `RowActionsToolbar`, `RowGrid` (still **without** the shell card/scroller — keep it in the
old container layout for this step), `InsertFieldModal`, and `ContentTab`. Drop the Label/Value
header grid here (carry-over decision). Still rendered inside the old `<s-section heading="Rows">`.

**Verify:** every Content handler still fires; the modal opens/commits/cancels; the toolbar gates
behave; rows render and reorder. Identical to A1.2 minus the Label/Value header. 219 green.

### A1.4 — Integrate the shell + bounded scroller; delete the sandbox

Wrap `ContentTab` in `EditorShell` (`stage={<ContentTab engine={engine} />}`); put `RowGrid` inside
the A3 `.rowsScroller` with `useScrollRegionHeight`; render `<SaveBar>` at the wrapper level; swap
`route.tsx`'s `<s-section heading="Rows">` for the full-bleed card. **Delete `app.editor-shell.tsx`
+ dummy data**; remove the dead `.stickyHeader` CSS.

**Verify (FULL matrix + scroll fix, in the REAL fixed-height iframe):** the editor renders as the
mockup card with tabs + device toggle; **only the rows list scrolls** at any row count and on window
resize, with the toolbar always in view; **Add row at the bottom scrolls the internal list, not the
iframe** (the A3 promise, now on the real engine); the full editing matrix from A1.2 passes
unchanged; tab switches to Style/Settings reveal the empty sidebar and re-measure the scroller; the
`/app/editor-shell` route is gone (404). 219 green; no console errors.

## Locked decisions

- **Thin-wrapper + hook + presentational tree.** `SpecTableEditor` = `useRowEngine(...)` +
  `<EditorShell stage={<ContentTab engine={engine} />}>`; the engine owns every coupling, the
  components are presentational. (Refines the plan's `engine={engine}` sketch into the A2 slot.)
- **`useRowEngine` is component-free; shared types/constants live in a leaf `editorShared.ts`** so
  there is no import cycle.
- **Leaf components move byte-identical; `useSortable` stays inside `EditorRowItem`.**
- **`<SaveBar>` renders at the wrapper level**, driven by `engine.isDirty` / `engine.saving`, so it
  persists across tabs.
- **Bulk paste capture wraps `ContentTab`** (`onPaste={engine.handleContainerPaste}`) — a Content
  gesture; the skip-guards already ignore field/modal targets.
- **No Label/Value header, no hint line** (carry-over from the shell change) — column alignment is
  carried by the shared grid templates.
- **`route.tsx` loader/action byte-unchanged; only the Rows-section wrapper is swapped for the
  full-bleed card; `editorNonce` remount preserved.**
- **`scrollIntoView` → internal scroller is automatic** once `RowGrid` is inside `.rowsScroller`; no
  engine edit, verified live at A1.4.
- **The `/app/editor-shell` sandbox + `DummyGrid` + `DUMMY_ROWS` + dead `.stickyHeader` CSS are
  deleted at A1.4.**

## What A1 does *not* own (boundary with later phases)

- **Style sidebar contents** → Phase B (the `stylePanel` slot stays undefined).
- **Settings sidebar contents** → Phase C (the `settingsPanel` slot stays undefined).
- **Device-preview WYSIWYG** (the toggle is still visual-only) → Phase D.
- **Product assignment** → Phase E.
- **Header status dropdown / ⋯ / rename + the "Save as draft" split** → Phase F; the admin topbar +
  left nav are Shopify's and are never built.
- **No reducer / schema / dependency / server / persistence change.** A1 is a pure refactor +
  integration over the frozen engine and data contract.

## File placement (per `code-standards.md` File Organization)

- New durable: `editorShared.ts`, `useRowEngine.ts`, `ContentTab.tsx`, `RowActionsToolbar.tsx`,
  `RowGrid.tsx`, `InsertFieldModal.tsx` — all in `app/routes/app.templates_.$id/`.
- Moved durable: `RowGutter.tsx`, `ValueCell.tsx`, `EditorRowItem.tsx` (same directory).
- Rewritten: `SpecTableEditor.tsx` (thin wrapper); minimal JSX edit in `route.tsx`.
- Extended: `SpecTableEditor.module.css` (remove dead `.stickyHeader`; no new color).
- **Deleted:** `app/routes/app.editor-shell.tsx` (+ its dummy data/grid).
- **Unchanged:** every `app/utils/*`, `app/models/*`, `app/shopify/*`, the
  `/app/metafield-definitions` resource route, `prisma/schema.prisma`, `package.json`,
  `EditorShell.tsx`, `useScrollRegionHeight.ts`, and `route.tsx`'s loader/action.

## Open questions (resolve while building A1)

- **Engine return-object shape** — one flat object vs. grouped namespaces (`engine.modal.*`,
  `engine.dnd.*`). Flat is simplest and matches the current container; group only if a component's
  prop list reads poorly. Decide at A1.2.
- **`useCapturedTokenColor` home** — inside `useRowEngine` (runs once per engine mount, proposed) vs.
  a tiny shared hook called by the wrapper. Either is fine; pick the one with no double-capture.
- **Container-paste wrapper scope** — wrap only `ContentTab` (proposed) vs. the whole shell. Content
  is the only place a bulk paste is meaningful; confirm a paste while on Style/Settings is a no-op
  (it should be — no value cells mounted).
- **Empty-state placement** — keep the `rows.length === 0` empty box inside `RowGrid` (so it sits in
  the scroller) vs. in `ContentTab` above it. Decide for least layout jump at A1.3.
- **Does dropping `<s-section heading="Rows">` affect `useScrollRegionHeight`'s `scrollerTop`
  measurement?** The card framing changes the offset above the scroller; re-confirm the measured
  height in the real iframe at A1.4 (A3's hook recomputes on resize + ancestor `ResizeObserver`, so
  it should self-correct, but verify the floor never engages on first paint).

## Done when

1. Sub-steps **A1.1–A1.4** each pass their gate + browser-verify; **A1.2 and A1.4 pass the full
   editing matrix** in the real embedded app.
2. `SpecTableEditor.tsx` is a **thin wrapper** (`useRowEngine` + `EditorShell` + `SaveBar`); all
   container state/handlers live in **`useRowEngine.ts`**; the JSX is split into `ContentTab` /
   `RowActionsToolbar` / `RowGrid` / `InsertFieldModal`; `RowGutter` / `ValueCell` / `EditorRowItem`
   are their own byte-identical files; shared types/constants live in `editorShared.ts`.
3. The editor renders as the **mockup card** (tabs + device toggle), with **no Label/Value header
   and no hint line**, and Content is at **full parity** with the pre-reshell editor.
4. **Only the rows list scrolls**, the toolbar stays fixed, and **Add row at the bottom scrolls the
   internal list, not the iframe** — verified on the real engine in the fixed-height iframe.
5. The **219-test suite stays green**; the **highest-risk pieces are preserved verbatim** (caret
   bridge, row memoization, `handleDiscard`/`handleCommit` snapshots, paste guards); **no console
   errors** in the embedded admin top frame.
6. The **`/app/editor-shell` sandbox + `DummyGrid` + `DUMMY_ROWS` are deleted**, and the dead
   `.stickyHeader` CSS is removed.
7. `route.tsx` loader/action are **byte-unchanged**; `npm run typecheck`, `npm run lint`, `npm run
   format:check`, `npm run test:run`, and `npm run build` all pass; **browser-verified** in the real
   embedded app.
8. `progress-tracker.md` updated to mark **A1 complete** and **Phase A done** (reshell: Content at
   parity, scroll fixed, engine reused); record the locked decisions; point at **Phase B (Style
   tab)** as next.
