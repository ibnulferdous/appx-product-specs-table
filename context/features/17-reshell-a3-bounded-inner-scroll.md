# Reshell A3 — Bounded inner-scroll

## Goal in one sentence

Make **only the rows list scroll** — wrap the Label/Value column header + the rows + the
bottom Add-row in a single bounded scroller whose height is JS-measured to fill the
remaining iframe viewport (`window.innerHeight − scrollerTop − pad`, with a `min-height`
floor so a measurement race never collapses it) via a new durable
**`useScrollRegionHeight`** hook, with the **column header `position: sticky`** at the top of
that scroller while the **control row (tabs + device toggle), toolbar, and hint stay
fixed** — fixing the core UX pain (today the whole admin iframe scrolls, so on a long table
the merchant must scroll back to the top to reach Add row / Insert field) — **proven in the
A2 `/app/editor-shell` sandbox over dummy data**, with **no reducer/schema/dependency/
persistence change** and **the working editor and `EditorShell` both untouched**.

## Why this is now (and why it's a separate step)

- **It is the committed near-term win of the reshell.** Per
  `plan-reshell-spec-table-editor.md` → A3: *"New `useScrollRegionHeight` (ResizeObserver:
  rows-list height = `innerHeight − rowsListTop − pad`, with a `min-height` floor so a
  measurement race never collapses the list) applied **only** to the rows list; make the
  Label/Value header `position: sticky`; keep toolbars + sidebar + header fixed. Replace the
  document-level `scrollIntoView` (currently scrolls the iframe) with a scroll inside the
  internal scroller."* And the plan's framing: *"bounded inner-scroll where only the rows
  list scrolls. Today the whole admin iframe scrolls, so on a long table the merchant must
  scroll to the top to reach Add row / Insert field — the core UX pain."*
- **A2 built exactly the structure A3 needs.** A2 landed the full-bleed `EditorShell` card +
  the static `DummyGrid` stage with a toolbar, a hint, a Label/Value header, a long rows
  list, and a bottom Add-row — all currently in one document-scrolling column. A3 only
  changes *what scrolls*: it bounds the rows region and pins the header. Nothing about the
  chrome (A2) or the engine (A1) moves.
- **It is built in the sandbox, so the working editor stays frozen.** Like A2, A3 is proven
  in the throwaway `/app/editor-shell` route over dummy data. The real editor
  (`SpecTableEditor.tsx`, `route.tsx`) is **byte-untouched**; the engine's
  `scrollTargetRef` → `scrollIntoView` swap is an **A1 integration task** (the code is frozen
  until then — see *What A3 does not own*). A bug in A3 is therefore a **CSS-layout /
  height-measurement** bug, fully contained in the durable hook + CSS + the throwaway
  `DummyGrid` — never an engine or persistence bug.

A3 is an **internal scaffolding increment** (its only merchant-facing route is the dev
sandbox). Its **durable output** is `useScrollRegionHeight.ts` + the `.rowsScroller` /
`.stickyHeader` CSS; the sandbox `DummyGrid` restructure is throwaway, deleted at A1.

## The mechanism (and its single biggest unknown)

The mockup's structure is the target: the toolbar + hint sit **above** a `.grid` scroller
(`overflow: auto`); inside the scroller the `.grid-head` is `position: sticky; top: 0` and
the rows + bottom Add-row scroll under it. We reproduce that:

- **Fixed (outside the scroller):** the `EditorShell` control row (tabs + device toggle),
  the toolbar (Add row / Add section / Duplicate / Insert field + the Rows counter), and the
  hint line.
- **Scroller (`.rowsScroller`, height bounded by `useScrollRegionHeight`):** the **sticky**
  Label/Value column header + the rows + the bottom Add-row.

**Why the header lives *inside* the scroller (sticky), not above it (fixed sibling):**
horizontal column alignment. When the scroller shows a vertical scrollbar it narrows its
content; a header inside the scroller is narrowed by the **same** amount as the rows, so the
Label/Value columns always line up. A header placed outside the scroller would not account
for the scrollbar gutter and would drift out of alignment.

**The single biggest unknown — the embedded iframe's sizing model (verify FIRST in A3.1).**
The measurement `window.innerHeight − scrollerTop − pad` is only correct if `innerHeight`
reports a **fixed** viewport (the iframe is the admin's content viewport and the *document*
scrolls inside it). If App Bridge instead **auto-grows the iframe to content height**, then
`innerHeight` grows with the table and the bound never engages. The plan's gate — *"verify in
the REAL fixed-height iframe"* — exists for exactly this. **A3.1 confirms which model is
live before productionizing**, and records the fallback (a fixed/`100dvh`-derived bound, or
measuring a fixed ancestor) if `innerHeight` tracks content rather than the viewport.

## What changes (architecture)

One new durable hook, two new durable CSS classes, and a throwaway restructure of the
sandbox `DummyGrid`. **No reducer, no schema, no dependency, no Polaris-component change, no
change to `EditorShell`, no change to the frozen editor.**

### 1. `useScrollRegionHeight.ts` (NEW, durable) — `app/routes/app.templates_.$id/`

A small hook that measures and maintains the scroller's available height.

- **Signature (sketch):** `useScrollRegionHeight(scrollerRef): number` (or sets a CSS
  variable / inline style on the scroller). Returns the measured **max** height in px; the
  component applies it as `style={{ maxHeight }}` and the `.rowsScroller` class supplies
  `overflow-y: auto`.
- **Measure:** `available = window.innerHeight − scrollerRef.current.getBoundingClientRect().top
  − BOTTOM_PAD`, then `Math.max(MIN_SCROLLER_HEIGHT, available)`.
- **`maxHeight`, not `height` (locked):** a short table stays short (no empty gap below the
  last row); a long table is bounded and scrolls. `height` was rejected — it would leave a
  large empty area under short tables.
- **Recompute on every input that moves `scrollerTop` or the viewport:**
  - a `window` **`resize`** listener (iframe viewport changes / admin window resize);
  - a **`ResizeObserver`** on a stable ancestor (the `EditorShell` card or the stage) so any
    height change *above* the list — control-row wrap, toolbar wrap, hint reflow, the
    Style/Settings sidebar appearing — re-measures `scrollerTop`. The observer **converges**
    (changing only the scroller's own `maxHeight` does not move `scrollerTop`, which is fixed
    by the content above it, so it re-measures the same value and stops); guard the read in a
    `requestAnimationFrame` so it runs after layout settles.
  - a React effect dep on **row count** (a render-time recompute when rows are added/removed).
- **`MIN_SCROLLER_HEIGHT` floor (rem):** if an early/raced measurement yields a tiny or
  negative `available` (e.g. `scrollerTop` read before layout settles), the floor keeps the
  list usable; the next settled measure corrects it. This is the plan's *"min-height floor so
  a measurement race never collapses the list."*
- **`BOTTOM_PAD` (rem):** small breathing room so the card doesn't butt against the iframe
  bottom edge.
- SSR-safe: no `window`/observer access during render (effect-only, like the editor's other
  browser-only effects).

### 2. CSS additions (NEW, durable) — `SpecTableEditor.module.css`

- **`.rowsScroller`** — `overflow-y: auto; min-height: <floor>;` (the measured `max-height`
  comes from the hook). Add `overscroll-behavior: contain` so reaching the list's top/bottom
  does not chain-scroll the admin behind it.
- **`.stickyHeader`** — `position: sticky; top: 0; z-index: 1;` on the column-header wrapper.
  The header needs an **opaque surface** so rows don't show through as they scroll under it —
  supplied by wrapping the header grid in a Polaris **`<s-box background="base">`** (the same
  surface token the card uses), *not* a CSS color (no hex; consistent with A2).

Layout/sizing only; the lone color is the Polaris `base` surface on the header box. No hex.

### 3. Sandbox `DummyGrid` restructure (THROWAWAY) — `app/routes/app.editor-shell.tsx`

Re-nest the existing static stage so the scroller wraps the right children (the toolbar +
hint move out of the scroller; the header + rows + bottom Add-row move into it):

```
<s-box padding="base">
  <s-stack direction="block" gap="base">
    {toolbar}            {/* fixed */}
    {hint}               {/* fixed */}
    <s-divider/>
    <div ref={scrollerRef} className={styles.rowsScroller} style={{ maxHeight }}>
      <div className={styles.stickyHeader}>
        <s-box background="base"> {columnHeader grid} </s-box>
      </div>
      <s-stack direction="block" gap="small-300">{rows}</s-stack>
      {bottom Add-row}
    </div>
  </s-stack>
</s-box>
```

`useScrollRegionHeight(scrollerRef)` drives `maxHeight`. The dummy grid already mirrors the
real grid's DOM (A2), so this scroller structure is exactly what A1's real `RowGrid` adopts.

### 4. What A3 establishes for A1 (no frozen-file edits now)

Once the rows live inside an `overflow-y: auto` scroller, the **nearest scrollable ancestor**
of any row *is that scroller*. So the engine's existing
`scrollTargetRef.current?.scrollIntoView({ block: "nearest" })` (which today scrolls the
iframe document) will scroll the **internal list** instead — automatically — the moment the
real grid is placed inside `.rowsScroller` at **A1**. A3 builds the scroller that makes this
true and verifies the structure with dummy data; **A1 wires the real engine into it and
verifies "Add row at the bottom scrolls the list, not the iframe"** (that behavior cannot be
exercised by the static dummy grid). A3 writes **no** engine code.

## Sub-steps (build and verify one at a time)

Per-step gate = `npm run typecheck && npm run lint && npm run format:check && npm run
test:run && npm run build` all green, **then** browser-verify in the embedded admin
(Claude-in-Chrome on the `shopify app dev` preview; the embedded app is a cross-origin
iframe, so verify **functionally/visually** via screenshots — see [[browser-verify-embedded-app]]).
A3 adds **no pure logic**, so the **219-test suite stays green** as the frozen-engine
tripwire (no new unit tests expected; the hook is browser-verified).

### A3.1 — Confirm the iframe model + bound the scroller (provisional fixed height)

First, in the sandbox, **determine the iframe sizing model**: log/inspect `window.innerHeight`
vs the document/content height in the embedded admin and confirm whether `innerHeight` is a
fixed viewport (document scrolls inside the iframe) or grows with content. Record the result
and the height-source decision. Then wrap [sticky header + rows + bottom Add-row] in
`.rowsScroller` with a **provisional fixed `maxHeight`** (e.g. a hardcoded value) to prove the
*structure* independent of the measurement.

**Verify (real embedded iframe):** only the rows list scrolls; the control row (tabs +
device toggle), toolbar, hint, and the **sticky** column header all stay in view while the
rows scroll under the header; reaching the list bottom/top does not scroll the admin behind
it (`overscroll-behavior`). No console errors.

### A3.2 — `useScrollRegionHeight` (measured + robust)

Replace the provisional `maxHeight` with the hook: measure `innerHeight − scrollerTop − pad`
(clamped to the floor), recomputed on `window` resize + the `ResizeObserver` + row-count.

**Verify (real embedded iframe):** the rows region fills the remaining viewport at a **long**
dummy table (scrolls) and a **short** one (no scroll, no empty gap); the bound **re-measures
on window resize** (the list grows/shrinks, the header stays pinned, nothing else scrolls);
switching to **Style/Settings** (the 300px sidebar appears, changing layout) re-measures
correctly; the **floor** holds (no collapse) during initial paint. No console errors; A2's
tabs / device toggle / sidebar reveal still behave exactly as before.

## Locked decisions

- **Only the rows list scrolls; control row + toolbar + hint stay fixed; the column header is
  `position: sticky` inside the scroller.** Mockup-faithful and the fix for the core UX pain.
- **Header inside the scroller (sticky), not a fixed sibling above it** — so the Label/Value
  columns stay aligned with the rows even when a scrollbar gutter appears.
- **`maxHeight` (measured), not `height`** — short tables stay short (no empty gap), long
  tables bound and scroll.
- **Measure `window.innerHeight − scrollerTop − pad`, clamped to a `min-height` floor**,
  recomputed on viewport resize + a stable-ancestor `ResizeObserver` + row-count change. The
  observer converges (sizing the scroller does not move `scrollerTop`).
- **The bottom Add-row lives inside the scroller** (scrolls with the rows, mockup-faithful);
  the toolbar's primary **Add row** stays fixed and always reachable — which is the whole
  point of the bounded scroll.
- **Opaque sticky-header background via Polaris `<s-box background="base">`**, not a CSS
  color — no hardcoded hex (A2 convention).
- **`EditorShell` and the frozen editor are untouched.** A3 changes only the stage's inner
  structure (sandbox now; the real `RowGrid` at A1) + adds the durable hook/CSS.
- **The `scrollIntoView` → internal-scroller swap is verified at A1**, not A3 — A3 builds the
  scroller that makes it automatic; the static dummy grid can't exercise "Add row scrolls the
  list."

## What A3 does *not* own (boundary with later steps)

- **The editing engine** (caret, value surface, modal, reorder, reducer, Save) — frozen; A3
  scrolls dummy static content.
- **The engine's `scrollTargetRef` → `scrollIntoView` swap into the internal scroller** →
  **A1** (the engine code is frozen until integration; the scroller A3 builds makes the swap
  automatic, and A1 verifies "Add row at the bottom scrolls the list, not the iframe").
- **The Style/Settings sidebar's own scroll** (the mockup's `.leftpanel { overflow: auto }`)
  → **Phases B / C**, when that sidebar gets real, possibly-tall content; in A3 it is an empty
  placeholder needing no scroll of its own.
- **Device-preview layout** (constrained widths / mobile stacking) → **Phase D**.
- **Header status / save model** → **Phase F**; admin topbar + nav are Shopify's.

## File placement (per `code-standards.md` File Organization)

- Durable hook → **`app/routes/app.templates_.$id/useScrollRegionHeight.ts`**.
- Durable CSS → extend **`app/routes/app.templates_.$id/SpecTableEditor.module.css`**
  (`.rowsScroller`, `.stickyHeader`).
- Throwaway sandbox restructure → **`app/routes/app.editor-shell.tsx`** (`DummyGrid` re-nest;
  applies the hook).
- **Unchanged:** `EditorShell.tsx`, `route.tsx`, `SpecTableEditor.tsx`, every `app/utils/*`,
  `app/models/*`, `app/shopify/*`, `prisma/schema.prisma`, `package.json`.

## Open questions (resolve at the noted point)

- **Iframe sizing model (A3.1 — the linchpin):** is `window.innerHeight` a fixed viewport
  (document scrolls in the iframe) or does App Bridge grow the iframe to content? If the
  latter, switch the height source (a `100dvh`/fixed-ancestor bound) — confirm live before
  productionizing the hook.
- **`BOTTOM_PAD` and `MIN_SCROLLER_HEIGHT` values** — tune against the real iframe at common
  window heights; keep in rem.
- **Sidebar-taller-than-stage (Style/Settings):** in A3 the sidebar is an empty placeholder,
  so the stage's scroller defines card height. When B/C add real sidebar content taller than
  the stage, decide whether the sidebar scrolls independently (its own `overflow:auto`) or
  the card grows — out of scope for A3, noted so A3's measurement isn't retrofitted blindly.
- **Resize debounce:** whether the `resize`/observer recompute needs throttling (a single
  `requestAnimationFrame` coalesce is the starting point) — confirm it's smooth on a real
  drag-resize.

## Done when

1. Sub-steps **A3.1–A3.2** each pass their browser verify **in the real fixed-height iframe**.
2. A durable **`useScrollRegionHeight`** hook bounds the rows scroller to
   `window.innerHeight − scrollerTop − pad` (clamped to a floor), recomputed on viewport
   resize + a stable-ancestor `ResizeObserver` + row-count change; the iframe sizing model is
   confirmed (or the fallback height source is in place).
3. **Only the rows list scrolls** at any row count and on window resize; the control row
   (tabs + device toggle), toolbar, and hint never leave view, and the **column header is
   sticky** at the top of the scroller; reaching the list edges does not scroll the admin
   behind it.
4. A **short** table shows no scroll and no empty gap; a **long** table bounds and scrolls;
   switching to Style/Settings (sidebar appears) re-measures correctly; the floor prevents any
   initial-paint collapse.
5. Built with **scoped CSS for layout only** (`.rowsScroller` / `.stickyHeader`) and a Polaris
   `base` surface on the sticky header — **no hardcoded hex**; A2's chrome behavior is
   unregressed.
6. `EditorShell.tsx`, `route.tsx`, and `SpecTableEditor.tsx` are **byte-unchanged**; the
   **219-test suite stays green**; **no console errors** in the embedded admin top frame.
7. `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:run`, and
   `npm run build` all pass; **browser-verified** in the real embedded app.
8. `progress-tracker.md` updated to mark **A3 complete** and record the iframe-model finding +
   the locked scroll decisions; point at **A1 — extract `useRowEngine` + presentational
   components and integrate the shell** into the real route (where the bounded scroller hosts
   the real `RowGrid` and the engine's `scrollIntoView` is verified to scroll the list, not
   the iframe), after which the `/app/editor-shell` sandbox is deleted.
