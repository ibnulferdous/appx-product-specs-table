# Editor keyboard cell navigation — Step 3: manual-advance editor tips footer

## Goal in one sentence

Give the editor page a small **tips strip below the editor card** (outside it) that shows **one tip
at a time** with **‹ › manual prev/next controls** (no auto-rotation) and a position indicator — seeded
with the existing mockup tips **plus the new `Ctrl/⌘ + ↑ ↓` cell-navigation tip** (with a
platform-correct ⌘/Ctrl glyph) — so merchants actually discover the keyboard navigation (and the rest
of the editor's affordances) without re-adding clutter inside the editor card.

## Why this is now (Step 3 of the keyboard-nav feature)

Steps 1–2 made `Ctrl/⌘ + Arrow Up/Down` cell navigation work and browser-verified it. But a modifier
shortcut is **invisible** — the one real cost we accepted when choosing the modifier approach over bare
arrows. Step 3 pays that down with a **discoverability surface**. Rather than a dedicated help icon, we
use the **tips footer the mockup already calls for** (`design/spec-editor-mockup-v2.jpg` shows a
bottom strip of editor tips), so the keyboard tip becomes one entry in a **general, reusable** editor
tips component — the right long-term home for *all* the editor's discoverability copy (device toggle,
drag/delete, Insert field, smart pills, Add row, bulk delete, paste).

**Why a footer, and why outside the card.** The reshell deliberately **removed the in-card Label/Value
hint to reclaim vertical space** (progress-tracker, 2026-06-22). A persistent in-editor hint would
undo that. A strip **below** the card costs the editor zero space and matches the mockup.

**Why manual-advance, not an auto-slideshow (locked).** Auto-advancing text that moves on its own and
runs > 5s triggers **WCAG 2.2.2 (Pause, Stop, Hide)** — it would need a pause control to be compliant,
and accessibility is a non-negotiable priority for this app. Auto-rotation also scrolls the tip away
before it can be read and complicates screen-reader handling. **Manual advance (advance only on user
click) sidesteps all of that** while keeping the one-tip-at-a-time compactness the merchant wanted.

This step adds **no** change to the reducer, the caret engine, the value surface, the row engine, or
the Step 1–2 navigation — it is a presentational footer plus a pure tip-list builder.

## Foundation carried

- **The editor body is `SpecTableEditor.tsx`** — a fragment of a freeze `<div>` (wraps `EditorShell`,
  set `inert` during a save) + the App Bridge `<SaveBar>`. The footer mounts here as a sibling **after**
  the freeze `<div>`, so it sits **below the card**, **outside** the editor card, and **outside the
  save-freeze** (tips stay readable/usable during a save — harmless, and simpler than freezing them).
- **Pure-logic / DOM-glue split** convention: the **tip list** (given a platform flag) is pure and
  Node-unit-tested; the lone browser read (am I on a Mac?) is isolated glue, like `valueDom.ts`
  ([[testing-strategy]]).
- **Polaris web components + hex-free CSS module** styling, a11y non-negotiable — same standards as the
  rest of the editor ([[polaris-web-component-gotchas]]).

## What changes (architecture)

**One pure helper (+ test), one presentational component, one mount line, and CSS. No reducer / engine
/ dependency change.**

### 1. `app/utils/editorTips.ts` (new, pure, Node-unit-tested)

The tip list is the testable core. Framework-free and pure:

```ts
export interface EditorTip {
  id: string; // stable React key + test anchor
  text: string;
}

// Build the ordered tip list. The only platform-dependent entry is the keyboard
// tip, which shows the Mac Command glyph vs. "Ctrl". Everything else is constant.
export function buildEditorTips(isMac: boolean): EditorTip[] {
  const mod = isMac ? "⌘" : "Ctrl";
  return [
    {
      id: "keyboard-nav",
      text: `Move between cells with ${mod} + ↑ ↓. Tab / Shift+Tab move across Label and Value.`,
    },
    {
      id: "device-views",
      text: "Switch Edit → Desktop / Tablet / Mobile with the toggle — Edit is editable; the device views are view-only previews.",
    },
    {
      id: "gutter",
      text: "Each row's gutter pairs a ⠿ drag handle with a ✕ delete; tick the checkbox to select rows for a bulk delete.",
    },
    {
      id: "insert-field",
      text: "Insert field (toolbar) opens a modal — pick a field, then Insert; Cancel / Esc / click-outside inserts nothing.",
    },
    {
      id: "smart-pills",
      text: "Dynamic-field tokens are smart pills — click one to edit it, Backspace / Delete to remove it (no ✕).",
    },
    {
      id: "add-row",
      text: "Add row inserts below the active row; the bottom + Add row appends at the end.",
    },
    {
      id: "paste",
      text: "Paste a table from Google Sheets or Excel to bulk-create rows — first column → Label, the rest → Value.",
    },
  ];
}
```

- **Pure + deterministic**, returns a fresh array; unit-tested (below). The list is the single source of
  truth — adding/retiring a tip is a one-line edit here, not spread across markup.
- **Plain-text tips with inline glyphs** (`↑ ↓ ⠿ ✕ ⌘`) for v1 — matches the mockup's plain footer. Rich
  per-token styling (keycaps, link-coloured pills) is a possible later polish, not v1 (see Open
  questions).

### 2. `app/utils/platform.ts` (new, tiny glue — browser-verified, not Node-tested)

```ts
// True on macOS. navigator.platform is deprecated but still the most reliable
// cross-browser signal; fall back to the UA string. SSR-safe (returns false when
// navigator is absent — the keyboard tip then shows "Ctrl", corrected on hydrate).
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const p = navigator.platform || navigator.userAgent || "";
  return /mac/i.test(p);
}
```

- Isolated exactly like `valueDom.ts`'s DOM reads; **not** Node-unit-tested (jsdom's `navigator` is
  synthetic). The **pure** `buildEditorTips(isMac)` is what carries the testable logic.

### 3. `app/routes/app.templates_.$id/EditorTips.tsx` (new, presentational)

A small manual-advance carousel. No props (self-contained); reads the platform once and renders:

- The tips from `buildEditorTips(isMacPlatform())`, memoized once per mount.
- `const [index, setIndex] = useState(0)`, with `prev`/`next` that **wrap** (`(index + n ± 1) % n`).
- A **‹ Previous tip** and **Next tip ›** control pair (Polaris `<s-button variant="tertiary"
  icon="chevron-left|chevron-right">` with `accessibilityLabel`), the current tip text between them as
  subdued small text, and a **"Tip {index+1} of {n}"** position indicator (dots optional; the count is
  the screen-reader-friendly form).
- **A11y:** wrap in a `<section aria-label="Editor tips">`; put `aria-live="polite"` on the **tip text**
  region so a manual advance is announced (manual-only changes → not noisy). Prev/next are real buttons
  (Tab + Enter/Space). **No `setInterval`, no auto-advance.** Any optional fade transition is gated on
  `prefers-reduced-motion: no-preference`; v1 can simply swap text (no motion) for the simplest
  compliant result.

### 4. Mount — `app/routes/app.templates_.$id/SpecTableEditor.tsx`

Render `<EditorTips />` as a **sibling after the freeze `<div>`** (before/after the `<SaveBar>` is
immaterial — the SaveBar portals to the admin top bar). It therefore sits **below `EditorShell`**,
outside the card, and is **not** frozen during a save.

### 5. Styles — `app/routes/app.templates_.$id/SpecTableEditor.module.css`

A `.tipsFooter` row: subdued small text, centered (or left-aligned to the card), comfortable
`padding-block`, the controls and text in a single inline row that wraps gracefully on narrow widths.
**Hex-free** (subdued via Polaris text color / low-alpha `currentColor`), consistent with the existing
module.

## Reducer actions

| Interaction | Mechanism |
| --- | --- |
| Click ‹ / › to change tip | local `useState` index (wrap) — **no reducer, no dispatch** |
| Show the keyboard / device / paste / etc. tip | pure `buildEditorTips(isMac)` — static copy |

**No reducer action; no engine change.** The footer is fully presentational + a pure list.

## Locked decisions

- **Manual advance only — no auto-rotation.** Advance happens on ‹ / › click; no timer. (Sidesteps WCAG
  2.2.2, reduced-motion, and the read-before-it-scrolls problem.)
- **Below the editor card, outside it, outside the save-freeze.** Zero in-editor vertical cost; matches
  `spec-editor-mockup-v2.jpg`; never re-adds the in-card hint the reshell removed.
- **One general, reusable tips component** seeded with the full editor tip set — the keyboard-nav tip is
  the *reason* it ships now, but it is entry #1 of several, not a one-off.
- **Platform-correct keyboard glyph** — `⌘` on macOS, `Ctrl` elsewhere — via the pure
  `buildEditorTips(isMac)` + the isolated `isMacPlatform()` read.
- **One tip visible at a time** with a **"Tip {i} of {n}"** indicator; wrap-around prev/next.
- **Pure tip list / DOM-glue split** — `editorTips.ts` (pure, tested) vs. `platform.ts` (glue,
  browser-verified).
- **Hex-free, Polaris-consistent, a11y-first** — real buttons, `aria-label`s, polite live region on the
  tip text, reduced-motion-safe.

## What Step 3 does *not* own (boundary)

- **The navigation behaviour itself** (Steps 1–2) — unchanged; Step 3 only advertises it.
- **Auto-rotation / timed slideshow** — explicitly rejected (Option C).
- **Per-token rich styling inside a tip** (keycaps, link-coloured pill glyphs) — possible later polish;
  v1 is plain subdued text with inline unicode glyphs.
- **Tab-specific tip filtering** (showing only Content tips on the Content tab, etc.) — out of scope; the
  footer shows the general set under the whole editor.
- **A dismiss / "don't show again" preference** — not in v1 (no per-merchant settings surface yet).
- **No change to** the reducer, row engine, caret engine, value surface, or dnd reorder.

## File placement (per `code-standards.md`)

- Pure tip list → **`app/utils/editorTips.ts`** (+ tests **`app/utils/editorTips.test.ts`**).
- Platform read → **`app/utils/platform.ts`** (browser-verified glue, not Node-tested).
- Carousel component → **`app/routes/app.templates_.$id/EditorTips.tsx`** (presentational).
- Mount → **`app/routes/app.templates_.$id/SpecTableEditor.tsx`** (sibling after the freeze `<div>`).
- Styles → **`app/routes/app.templates_.$id/SpecTableEditor.module.css`** (`.tipsFooter`, hex-free).
- **No change to** `rows.ts`, the engine, `ValueCell`/`EditorRowItem`, or `package.json`.

## Testing

Per [[testing-strategy]] — pure logic Node-tested, DOM/web-component UI browser-verified.

- **`buildEditorTips` unit tests** (`editorTips.test.ts`): returns a stable, non-empty ordered list;
  the **keyboard tip contains `⌘` when `isMac` is true and `Ctrl` when false** (and the `↑ ↓` glyphs in
  both); ids are unique + stable; the platform flag changes **only** the keyboard tip's text (all other
  entries identical across platforms); returns a fresh array (no shared mutable state).
- **Browser-verified in the embedded app:** the footer renders **below** the editor card; one tip shows
  at a time with a **"Tip i of n"** indicator; ‹ / › advance and **wrap**; the keyboard tip shows the
  **correct ⌘/Ctrl glyph** for the platform; the controls are **keyboard-reachable** (Tab + Enter) and a
  screen reader announces the new tip on change; the footer does **not** scroll/affect the editor and is
  **not** frozen oddly during a save; **no admin top-frame console errors**.

Suite grows by the `editorTips` cases; everything else stays green.

## Open questions

- **Indicator style** — a "Tip i of n" text is the baseline; dots are a nice-to-have. Decide in-browser
  which reads better at the footer's width.
- **Rich tip rendering** — whether the keyboard tip should render `⌘`/`Ctrl`/`↑`/`↓` as subtle keycaps
  (and pill references as link-coloured) is a later polish; v1 is plain text.
- **Starting tip** — v1 opens on the keyboard-nav tip (entry #0) since it's the reason this ships;
  revisit if the footer outlives this feature.

## Done when

1. `app/utils/editorTips.ts` exports `buildEditorTips(isMac)` (pure) and `app/utils/platform.ts` exports
   `isMacPlatform()`; `EditorTips.tsx` renders a manual-advance, wrap-around, one-tip carousel with a
   position indicator and accessible ‹ / › controls; it is mounted below the editor card in
   `SpecTableEditor.tsx`.
2. The keyboard-nav tip appears with the platform-correct `⌘`/`Ctrl` glyph; the other mockup tips are
   present; advancing is **manual only** (no timer).
3. `buildEditorTips` is unit-tested (glyph-by-platform, stable ids, fresh array); `npm run test:run`
   green and above baseline.
4. `npm run typecheck`, `lint`, `format:check`, and `build` all pass; no reducer / engine / dependency
   change.
5. **Browser-verified** below the editor card (renders, ‹ / › wrap, correct glyph, keyboard + SR
   accessible, no console errors), not frozen wrongly during a save.
6. `context/progress-tracker.md` reflects Step 3 complete — **closing the keyboard cell-navigation
   feature (Steps 1–3)** — and notes the tips footer is now the home for future editor tips.
