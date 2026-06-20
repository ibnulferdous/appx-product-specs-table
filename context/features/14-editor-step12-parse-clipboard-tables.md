# Editor Step 12 — Parse pasted clipboard tables

## Goal in one sentence

When a merchant pastes a multi-cell table copied from Excel, Google Sheets, or any web
page into the editor, **capture that paste and parse the clipboard's HTML `<table>` (or
tab-separated plain-text) into a 2-D string grid (`string[][]`) using a new pure, unit-tested
helper** — and for this step **log the grid only, insert nothing** — so Step 13 has a proven,
testable parser to feed its `PASTE_ROWS` action, with **no reducer change**, **no new
dependency**, **no change to the in-cell value paste (Step 4)**, and **no change to the
Step 9.5 persistence contract**.

## Why this is now (and why it's a separate step)

- **Bulk paste is a committed MVP feature, listed in the editor plan.** `admin-screen-plan.md`:
  *"Paste a multi-cell table copied from any website, Excel, or Google Sheets to bulk-create
  rows — first pasted column → label, remaining columns → manual TEXT value; 200-row cap
  enforced on paste."* That is two distinct concerns — **parsing** the clipboard into a grid,
  and **inserting** that grid as rows — so per `ai-workflow-rules.md` ("split if a change cannot
  be verified end to end quickly") it is split: Step 12 lands and verifies the **parser** in
  isolation (parse + log), Step 13 adds the **`PASTE_ROWS`** reducer action + cap-enforced
  insertion on top of it. This mirrors how Step 10 landed the `MOVE_ROW` mechanics before
  Step 11 layered keyboard/a11y on the *same* pipeline.
- **Parsing clipboard tables is the risky, browser-quirky half — isolating it makes it
  testable.** Excel, Google Sheets, and arbitrary web tables each put **both** a rich
  `text/html` table **and** a `text/plain` tab-separated fallback on the clipboard, with their
  own quirks (quoted multiline cells, `<th>` headers, ragged rows, `colspan`, trailing
  newlines, `\r\n`). Getting that mapping right is pure string/DOM logic that deserves unit
  tests **before** it is wired to a destructive bulk insert. Step 12 proves the parser against
  real clipboards (parse + `console.log`), so Step 13's only new risk is the **insertion +
  cap** logic, not the parse.
- **The current paste path was explicitly scoped to defer this.** The value cell's
  `handlePaste` (Step 4) already prevents default and pastes **plain text at a collapsed caret
  only**, with the inline comment *"multi-cell table paste is Steps 12–13"*; `handleInput`'s
  structure-drift branch likewise re-syncs the surface on a rich/multiline paste with
  *"Full clipboard support is Steps 12–13."* Step 12 is the first half of that deferred work —
  it adds a **separate, table-level** capture for the bulk gesture and **leaves the in-cell
  single-value paste untouched** (see [[editor-value-surface-architecture]]).

A bug in Step 12 is therefore a **parser / clipboard-reading** bug — not a row or persistence
bug. The reducer (`rows.ts`), the value surface (Steps 4–9), the smart-pill modal (Steps 5–9),
the reorder (Steps 10–11), and the persistence boundary (Step 9.5) are all frozen.

## Foundation carried from Steps 1–11

- **The reducer is a pure array of actions; the rows array is the single source of truth.**
  Step 12 adds **no action** — it neither reads nor writes `rows`. `PASTE_ROWS` is Step 13.
- **The in-cell value paste is a value-cell concern and stays one.** `ValueCell.handlePaste`
  reads `text/plain`, collapses `\r?\n` → spaces, and inserts at the caret via `SET_VALUE_TEXT`
  (only when the caret is collapsed and the target part is `TEXT`); it calls
  `event.preventDefault()` but **not** `stopPropagation()`, so the paste event still bubbles to
  the container. Step 12's table-level capture **must not** disturb this: an in-cell value
  paste keeps the Step 4 behaviour (newlines → spaces, single value), and the new capture
  recognises it (via `event.defaultPrevented`) and **skips** it.
- **`handleInput`'s drift fallback is the safety net, unchanged.** If a rich paste ever injects
  nodes the cell does not model, `handleInput` already re-renders the surface from known-good
  state rather than persisting garbage. Step 12 does not rely on or change it.
- **The pure-logic / DOM-glue split is an established convention.** `app/utils/valueParts.ts`
  is pure, DOM-free, and unit-tested in Node; `app/utils/valueDom.ts` is framework-free but
  DOM-touching and **browser-verified** (jsdom can't model contenteditable selection — see
  [[testing-strategy]]). Step 12 follows the same split for clipboard parsing: the pure grid
  logic is Node-unit-tested; the one unavoidable DOM read (`DOMParser` over the HTML table) is
  isolated in a thin glue module that is browser-verified.
- **`MAX_TEMPLATE_ROWS` is the single shared cap.** Step 12 does not enforce it (nothing is
  inserted). Step 13 enforces it on paste (truncate + tell the merchant what was dropped) using
  this same constant — never a literal.
- **Polaris-only admin UI, tokens not hex, a11y non-negotiable.** Step 12 adds **no new visible
  UI** (no button, no banner) — it is capture + parse + log. Any merchant-facing paste UI
  (e.g. a toast/summary of "N rows pasted") lands in **Step 13** with the actual insertion.

## What changes (architecture)

Two new files plus one capture hook in the editor component. **No reducer change, no new
dependency, no CSS, no new Polaris UI.**

### 1. Pure parser — `app/utils/clipboardTable.ts` (Node-unit-tested)

The testable core. Framework-free and pure (string → `string[][]`), like `valueParts.ts`.
Exports:

- **`parseDelimitedText(text: string): string[][]`** — the **TSV** parser. Splits rows on
  `\r\n` | `\r` | `\n` and cells on `\t`. **Quote-aware** (Excel and Google Sheets wrap a cell
  that itself contains a newline or tab in double quotes, doubling any internal `"`): a cell
  beginning with `"` consumes through the matching close-quote, un-escaping `""` → `"` and
  preserving the embedded newlines/tabs inside the quotes. Returns a raw, un-normalised grid.
- **`normalizeGrid(grid: string[][]): string[][]`** — the shaping policy (the testable
  decisions): **trim each cell's leading/trailing whitespace only** (an *embedded* `\n` inside a
  cell — from a `<br>` in an HTML cell or a quoted multiline TSV cell — is preserved, since
  Step 13 needs it to model an intra-value line break); **drop wholly-empty rows** (every cell
  empty after trim — this absorbs the trailing newline Excel/Sheets append and any blank
  separator rows); a grid that reduces to nothing → `[]`. **Does not pad ragged rows** — rows of
  differing length are kept as-is (Step 13 owns how a missing or extra column maps). (Locked:
  see "Locked decisions".)
- **`parseClipboardTable(input: { htmlGrid: string[][] | null; text: string | null }):
  string[][]`** — the source-selection policy + normalise, the single entry point the component
  calls. **Prefer the HTML-extracted grid only when it is *usable*** = more than one cell total
  (more than one row **or** more than one column); HTML models multiline / complex cells
  faithfully, but a degenerate 1×1 table (layout tables, single-cell rich copies) must **not**
  win over the structured TSV that Excel/Sheets always also put on the clipboard. Otherwise (no
  grid, or a 1×1 grid) parse `text` as TSV via `parseDelimitedText`; then run `normalizeGrid`.
  Pure: the HTML is already extracted to a grid upstream (see §2), so this module touches no DOM
  and is fully Node-testable.

### 2. DOM glue — `app/utils/clipboardTableDom.ts` (browser-verified)

The one piece that must touch the DOM, isolated exactly like `valueDom.ts`. Exports:

- **`extractHtmlTableGrid(html: string): string[][] | null`** — parse the clipboard HTML with
  **`DOMParser`**, find the **first `<table>`**, and read each `<tr>`'s `<td> | <th>` cells into
  a row of cell strings (cell text = `textContent`, with `<br>` treated as a newline so a
  multiline cell survives as `\n` in the grid string). Returns `null` when there is no usable
  `<table>` (so `parseClipboardTable` falls back to TSV). Guards `typeof DOMParser ===
  "undefined"` → returns `null` (so importing the module under Node/SSR never throws; the HTML
  path only ever runs client-side, where a paste happens). **Not Node-unit-tested** (DOMParser
  is unavailable in the Node test env and jsdom is not a project dependency — see
  [[testing-strategy]]); verified in the browser in 12.2, with its grid output flowing through
  the **tested** `normalizeGrid`.

*Rejected: one combined module using `DOMParser` and unit-testing the HTML path under a per-file
`@vitest-environment jsdom` docblock. That would add `jsdom` as a new dev dependency for one
module and split the test env, against the standalone-Node-config convention. The split keeps
the new dependency count at **zero** and matches the `valueParts.ts` / `valueDom.ts` precedent.*

### 3. Table-level paste capture — `app/routes/app.templates_.$id/SpecTableEditor.tsx`

A new `onPaste` on the editor's **outer container** (the top-level `<s-stack>` wrapper), reading
`event.clipboardData`. For Step 12 it **parses and logs only**:

- **Guard (skip the in-cell single-value paste and in-tree field edits):** null-guard
  `event.clipboardData` first (`const data = event.clipboardData; if (!data) return;` —
  mirroring the `?.` guard `ValueCell.handlePaste` already uses, so a programmatic paste with no
  clipboard data can't throw a console error). Then return early when `event.defaultPrevented`
  is already true: `ValueCell.handlePaste` calls `preventDefault()` **unconditionally at the
  top** (before any early return), so the flag is set for **every** paste that landed in a value
  cell — whether it inserted a value or no-op'd (ranged selection, caret on a token). That is
  exactly what the container wants: treat **any** in-cell paste as "not a bulk gesture" and skip
  it. (`defaultPrevented` thus signals "the paste landed in a value cell," **not** "a value was
  inserted" — Step 13 must not read it as the latter. On React 18 the innermost `onPaste` runs
  before the bubbling container `onPaste` on one shared synthetic event, and nothing in `app/`
  calls `stopPropagation`, so the flag is reliably visible at the container.) Also skip when the
  paste target sits inside an **in-tree** editable text control (a Label / Section
  `<s-text-field>`); whether a paste into the App Bridge modal's `<s-search-field>` even reaches
  this handler is an open question (see below).
- **Parse + log:** read `data.getData("text/html")` and `data.getData("text/plain")`, call
  `extractHtmlTableGrid(html)` (glue) → `parseClipboardTable({ htmlGrid, text })` (pure), then
  `console.info` the resulting grid plus its dimensions (`rows × cols`). **Do not**
  `preventDefault`, **do not** dispatch, **do not** insert. (Step 13 replaces the log with the
  `PASTE_ROWS` dispatch + cap + a merchant-facing summary.)

*Capture point — locked to the container `onPaste` for Step 12* (React-idiomatic, scoped to the
editor subtree, fires for any paste while focus is anywhere in the editor). Whether Step 13
should promote this to a **document-level** listener (so a bulk paste is captured even when no
editor element is focused) is an open question for Step 13 — it does not affect the parser.

## Sub-steps (build and verify one at a time)

Chain: **pure parser + DOM glue (Node-tested + builds) → capture + log (browser-verified against
real clipboards)**. Each builds clean (`npm run typecheck` + `lint` + `build` + `test:run`).

### 12.1 — Pure parser + DOM-glue extractor (+ tests)

Add `app/utils/clipboardTable.ts` (pure) and `app/utils/clipboardTableDom.ts` (DOM glue), plus
`app/utils/clipboardTable.test.ts`. No component change yet.

**Verify (unit tests, Node):** `parseDelimitedText` — single cell; one row many columns; many
rows; `\r\n` vs `\n` vs `\r`; a quoted multiline cell (`"a\nb"` stays one cell); a quoted cell
containing a tab; doubled-quote un-escape (`""` → `"`); a trailing newline. `normalizeGrid` —
per-cell leading/trailing trim **with an embedded `\n` preserved** (not collapsed); wholly-empty
rows dropped; all-empty grid → `[]`; ragged rows preserved (not padded); fresh array, source not
mutated. `parseClipboardTable` — prefers a **usable** (>1-cell) `htmlGrid` over `text`; **falls
back to TSV when the `htmlGrid` is `null`, empty, or a degenerate 1×1** even though `text` holds
a real multi-cell table; both sources empty → `[]`. All gates pass; `npm run test:run` stays
green and the new `clipboardTable.test.ts` cases lift the suite above its pre-change baseline.

### 12.2 — Wire the capture + log (browser)

Add the container `onPaste` with its guard; parse via the 12.1 helpers; `console.info` the grid +
dimensions.

**Verify (browser, real embedded app):** copy a multi-cell range from **Excel**, from **Google
Sheets**, and from a **web page `<table>`**, click into the editor (not into a value/label
field), and paste — the console logs the **correct 2-D grid** for each source (right row/column
counts; multiline and header cells intact; no `\r\n` artefacts), and **no rows are inserted**
(the `Rows: N / 200` counter is unchanged, the editor is **not** dirty, the save bar does **not**
appear). Confirm the **in-cell value paste is unregressed**: pasting plain/multiline text into a
value cell still inserts at the caret with newlines collapsed to spaces (Step 4) and the
container handler **skips** it (no bulk log). Confirm pasting into a **Label / Section
`<s-text-field>`** behaves natively and is skipped (no bulk log), and **record whether a paste
into the modal `<s-search-field>` reaches the container handler at all** (it may be hoisted out
of the React subtree — see Open questions). A paste with empty/absent clipboard data does not
throw (the `event.clipboardData` null-guard). **No console errors** (admin top frame — watch for
the App Bridge view-transition / `InvalidStateError` family seen in Step 7).

## Reducer actions

| Interaction                                   | Mechanism                                             |
| --------------------------------------------- | ----------------------------------------------------- |
| Paste a multi-cell table into the editor      | **none in Step 12** — capture → parse → `console.info` |
| In-cell single-value paste (Step 4)           | unchanged — `SET_VALUE_TEXT` at the caret (frozen)    |
| Insert pasted rows / enforce the 200-row cap  | **Step 13** — new `PASTE_ROWS` action (not this step) |

**No new reducer action; no existing action changed.** Step 12 is capture + parse + log only.

## Locked decisions

- **No reducer change and no new dependency.** The parser is pure utils; `DOMParser` is a
  browser global (no install). `package.json` is unchanged. `PASTE_ROWS` is Step 13.
- **Pure / DOM-glue split (two modules), mirroring `valueParts.ts` / `valueDom.ts`.** Pure grid
  logic in `clipboardTable.ts` (Node-tested); the lone `DOMParser` read in
  `clipboardTableDom.ts` (browser-verified). No `jsdom` dependency, no split test env.
- **Prefer HTML over TSV — but only a *usable* HTML grid.** A multi-cell HTML `<table>` wins
  (faithful multiline/complex cells); a degenerate **1×1** HTML grid (layout tables, single-cell
  rich copies) does **not** — it falls through to the TSV that Excel/Sheets always also provide.
  "Usable" = more than one cell total. The TSV fallback is **quote-aware** for Excel/Sheets
  multiline-cell escaping.
- **Grid shaping:** trim each cell's leading/trailing whitespace (embedded `\n` preserved);
  drop wholly-empty rows (absorbs the trailing-newline row); all-empty → `[]`; **do not pad
  ragged rows**. The grid is `string[][]` — column→label/value mapping (and how ragged/extra
  columns and intra-cell `\n` are handled) is **not** Step 12's job; see the Step 13 boundary.
- **In-cell value paste is frozen.** The Step 4 single-value behaviour is untouched; the
  table-level capture skips it via `event.defaultPrevented` (set because `handlePaste`
  preventDefaults unconditionally) plus an in-tree editable-target check.
- **Parse + log only — nothing is inserted, no UI is added.** No dispatch, no `preventDefault`,
  no toast/banner; the editor never goes dirty from a Step 12 paste. Because a bulk paste is
  therefore silent to a merchant until Step 13, Step 12 is an **internal verification
  increment**: it must not reach a production merchant build on its own — it ships together with
  Step 13's insertion + summary UI.

## What Step 12 does *not* own (boundary with Step 13+)

- **`PASTE_ROWS` and bulk row insertion (Step 13)** — the action that maps **first column →
  Label, remaining columns → Value**, inserts the rows, and **enforces the 200-row cap** via the
  shared `MAX_TEMPLATE_ROWS`. Step 13 also **reuses the Step 9.5 key-finalization path**
  (`reconcileRowKeys` / `finalizeRowKeys`) for pasted rows — it does **not** fork a second
  keying path. Any merchant-facing paste UI (summary toast, "N of M rows added") is Step 13.
  **Step 13 must decide (none of these are settled in the context files yet — record them in the
  Step 13 feature doc / `progress-tracker.md` open questions before implementing):** how multiple
  remaining columns **join** into one value (separator vs space vs `LINE_BREAK`); how an
  **intra-cell `\n`** (preserved by Step 12 from a `<br>` / quoted TSV cell) maps — to a
  `LINE_BREAK` part per `data-model.md` §"Multiline values" vs a space; how **ragged extra
  columns** join when rows differ in width; and whether the cap **truncates at 200 + warns** (as
  `admin-screen-plan.md` implies) or **rejects the whole paste** — the existing reducer cap is a
  *hard block that refuses the row* (`rows.ts`), so paste-time truncation would be a new cap-UX
  variant to confirm against that model.
- **The insertion position** (append vs insert below the active row) and the **document-level vs
  container capture** decision — Step 13, when there is an actual insert to place.
- **CSV import/export** — post-MVP (`feature-roadmap.md`), a separate feature, not clipboard
  paste.
- **The in-cell value paste, the caret model, the smart-pill modal, the reducer, reorder, and
  the persistence / metaobject boundary** — all frozen.

## File placement (per `code-standards.md` File Organization)

- Pure parser (TSV + normalize + source-selection) → **`app/utils/clipboardTable.ts`**
  (+ tests **`app/utils/clipboardTable.test.ts`**). Pure utilities, no side effects.
- DOM-glue HTML-table extractor (`DOMParser`) → **`app/utils/clipboardTableDom.ts`**
  (browser-verified, not Node-unit-tested — same status as `valueDom.ts`).
- Container `onPaste` capture + `console.info` log →
  **`app/routes/app.templates_.$id/SpecTableEditor.tsx`**.
- `app/utils/rows.ts` — **no change** (no `PASTE_ROWS` until Step 13).
- `package.json` — **no change** (no new dependency, no `jsdom`).
- No CSS / no new Polaris component (Step 12 adds no visible UI).

## Open questions

- **Does a paste into the App Bridge modal's `<s-search-field>` even reach the container
  `onPaste`?** `<s-modal>` is shown via the imperative App Bridge API and may hoist its content
  into a top-layer/overlay **outside** the editor's React subtree (see
  [[polaris-web-component-gotchas]]). If so, React's bubble-phase delegation never delivers that
  paste to the container handler, so the "skip the search field" guard clause is dead (harmless)
  code; if the modal stays in-tree, the clause is load-bearing. Confirm in 12.2 by pasting into
  the search field and checking whether the `console.info` fires at all — then either drop the
  clause or keep it. (Pastes into the in-tree Label / Section `<s-text-field>` definitely bubble;
  also confirm the editable-control check matches their light-DOM target — host vs internal
  shadow `<input>`.)
- **`<br>` / nested markup inside an HTML table cell.** Decide in 12.2 whether `<br>` → `\n`
  (kept) is enough, or a web cell with rich inline markup needs further flattening; the grid is
  plain strings, so anything beyond `textContent` + `<br>`→`\n` is out of scope unless a real
  paste shows otherwise.
- **Document-level capture for Step 13.** Re-evaluate, with a real insert to place, whether the
  capture should move from the container `onPaste` to a document listener so a bulk paste is
  caught even when no editor element is focused. Parser is unaffected either way.

## Done when

1. Sub-steps 12.1–12.2 each pass their verify check.
2. A new **pure** `app/utils/clipboardTable.ts` parses **TSV (quote-aware)** and shapes a grid
   (`normalizeGrid`), and a thin **`app/utils/clipboardTableDom.ts`** extracts the first HTML
   `<table>` into a grid via `DOMParser`; `parseClipboardTable` prefers a **usable** HTML grid
   and falls back to TSV. The parsing logic is **unit-tested** (new `clipboardTable.test.ts`
   cases lift the suite above its pre-change baseline); the DOM read is browser-verified.
3. Pasting a multi-cell table from **Excel, Google Sheets, and a web `<table>`** into the editor
   **logs the correct 2-D grid** (right dimensions, multiline/header cells intact) and
   **inserts nothing** — `Rows: N / 200` unchanged, editor **not** dirty, no save bar.
4. The **in-cell value paste (Step 4) is unregressed**, and pasting into a Label / Section field
   or the modal search field behaves natively — the table-level capture **skips** all of these.
5. **No reducer action added or changed**; `rows.ts`, the value surface, the modal, reorder, and
   the Step 9.5 persistence contract are all untouched. `package.json` unchanged (no `jsdom`).
6. **No hardcoded hex** (no CSS added); **no console errors** (admin console included — only the
   intentional Step 12 `console.info` grid logs, which Step 13 removes).
7. `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:run` all pass;
   **browser-verified** in the real embedded app against real Excel / Sheets / web-table pastes.
8. `progress-tracker.md` updated to mark Step 12 complete and point at Step 13 (bulk-insert rows
   from paste via `PASTE_ROWS`, reusing the Step 9.5 key-finalization path).
