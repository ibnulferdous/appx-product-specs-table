# Feature 49 · Step 8 — Device previews: docs + full gate + live sign-off (feature close)

## Goal in one sentence

Close feature 49 as a **whole**: run the complete quality gate one final time, do a **single
end-to-end live sign-off** that exercises everything Steps 1–7 built (toggle → renderer → sandboxed
iframe → shared CSS → per-device width → auto-height → a11y/pills/empty-state) across **real
templates in all three device views**, and land the **documentation** — so the Desktop / Tablet /
Mobile preview is provably shippable and the project's source-of-truth files record it as done.

## Where this sits (feature 49 map)

Feature 49 makes the editor's **Desktop / Tablet / Mobile** toggle render read-only storefront
previews (Reshell **Phase D**). Locked design: a **sandboxed `<iframe>`** sized to each device width,
rendering **the storefront markup + the shared `spec-table.css`**; dynamic fields as **labeled
pills**; `TableStyling` + the mobile row-layout option deferred to the Style tab. The 8 steps:

1. ✅ Toggle swaps the stage (plumbing only) — `49-…`, shipped 2026-07-12.
2. ✅ Pure storefront-markup renderer (`renderSpecTableHtml`) — `50-…`, shipped 2026-07-12.
3. ✅ Render the markup in a sandboxed iframe (`SpecTablePreview.tsx`) — `51-…`, shipped 2026-07-12.
4. ✅ Load the shared storefront stylesheet into the iframe — `52-…`, shipped 2026-07-12.
5. ✅ Device width sizing (`previewDeviceWidth(view)`) — `53-…`, shipped 2026-07-12.
6. ✅ Content-driven iframe auto-height — `54-…`, shipped 2026-07-12.
7. ✅ a11y + read-only hardening + empty state + dynamic-pill affordance — `55-…`, shipped 2026-07-13.
8. **Docs + full gate + live sign-off (feature close) ← THIS DOC.**

## Why this is its own step

- **Steps 1–7 each verified their own slice; nobody has yet verified the whole feature as one
  coherent surface.** Each step's browser pass was scoped to what that step changed (Step 5 = widths,
  Step 6 = heights, Step 7 = pills/empty). Step 8 is the one pass that drives the **complete** preview
  the way a merchant will: open a real template, flip Content ↔ Desktop ↔ Tablet ↔ Mobile ↔ Edit
  repeatedly, on a **long** table, a **short** one, a **dynamic-field** one, and an **empty** one —
  confirming the accumulated behavior holds together, not just each part in isolation. This is the
  App-Store-review-grade sign-off (CLAUDE.md priorities #2 storefront correctness & accessibility, #3
  review compliance).
- **The docs must land as the last act, not mid-flight.** Marking feature 49 **complete** in the
  phase-status tracker (`progress-tracker.md` — verified 2026-07-13 to be the only in-project file that
  carries phase state) is only truthful once the final gate + live sign-off pass. Doing it as its own
  step keeps the "done" claim honest, records the Phase-D-vs-plan deltas, and gives the feature a
  single closing record that points at all 8 step docs.

## Foundation carried (nothing new is built)

- **All behavior already ships (Steps 1–7).** Step 8 adds **no** runtime code — no renderer, iframe,
  CSS, width, height, a11y, reducer, schema, dependency, server, persistence, or config change. If
  the sign-off surfaces a defect, it is fixed as a **scoped amendment to the owning step's file** (and
  noted here), not as new Step-8 behavior.
- **The gate is already green** at Step 7 (581 tests). Step 8 re-runs it as the release checkpoint and
  records the final count.
- **The verification playbook exists** — [[browser-verify-embedded-app]] (embedded-app auth via
  Claude-in-Chrome on the dev-console URL) and its **cross-origin preview-iframe** note (the nested
  preview frame can't be measured from the top frame; verify auto-height by the **inner-scrollbar
  tell**, and the accessible-name string is code-verified, not automatable). Step 8 follows it.

## What changes

**Documentation + a full verification pass. No source code changes** (unless the sign-off finds a
defect, which is then fixed in the owning step's file and re-gated). Concretely:

### 1. Final quality gate (release checkpoint)

Run the full gate and record the outcome:

```
npm run typecheck && npm run lint && npm run format:check && npm run test:run && npm run build
```

All five green; capture the final test count. No new tests are required by Step 8 itself (the feature's
pure logic is already covered by Steps 1–7); add one only if the sign-off reveals an untested gap.

### 2. End-to-end live sign-off (dev store, embedded editor)

One comprehensive pass per [[browser-verify-embedded-app]], on the live dev store
(`admin.shopify.com/store/appx-dev/apps/…?dev-console=show`). Matrix — **each row × Desktop / Tablet /
Mobile**, plus Edit and (at least once) the Settings tab:

| Template shape | What it proves (Steps exercised) |
| --- | --- |
| **Long, ACTIVE, dynamic fields** (e.g. DJI Mavic 4 Pro, ~40+ rows) | full-height with **no inner scrollbar** on Desktop (6); **re-heights taller** on Mobile as text wraps, still no inner scrollbar (6, the ResizeObserver reflow path); storefront styling — padding, hairlines, ~33% bold label column, section rule (4); per-device widths + centering (5); **dynamic pills read as neutral placeholder chips**, AA-legible, distinct from resolved text (7); markup fidelity vs. the real product page (2/3). |
| **Short** (e.g. Portable Handheld Fan, ~7 rows) | frame **hugs** content, no dead space (6); widths/centering (5); styling (4). |
| **Empty / all-hidden** (a scratch zero-row template — **discard, never save**) | centered **empty-state** message instead of a blank/collapsed frame (7); height floors at the Step 6 `min-height`. |

For every cell of the matrix confirm the **invariants**:

- **Read-only holds** — no SaveBar appears from viewing/toggling (view state is client-only, never
  mutates the model); pills + empty-state are non-interactive (`<span>` / static `<div>`); **Edit**
  restores the fully interactive grid every time.
- **Toggle is live, no reload** — flipping devices re-sizes width (5) and re-heights (6) on the
  **same** frame (the `srcDoc` is byte-identical across views); no flash/reload, no oscillation.
- **Settings-tab-with-preview** invariant — on the Settings tab a device view keeps the Settings
  sidebar in place beside the iframe.
- **Console clean** — no CSP violation, no `SecurityError`, no cross-origin warning (the
  `allow-scripts`-only sandbox + strict CSP from Step 6).
- **Cleanup** — any scratch template created for the empty-state check is **discarded / deleted**, and
  the templates list is re-confirmed clean (no stray "Untitled template"). No store data is saved by
  the sign-off.

### 3. Documentation (source-of-truth files)

- **`context/progress-tracker.md`** (the ONLY in-project phase-status tracker) — add the Step 8
  completed entry (final gate count + live sign-off summary), flip the phase counter from "steps 1–7 of
  8 shipped" to **feature 49 / Reshell Phase D complete**, and update the "Current Goal" Reshell-phase
  line (D done → **E (assignment)** is next). The Step 8 entry must also record the **Phase-D-vs-plan
  deltas** (deferred mobile stacked layout; no live `TableStyling` yet; 375px vs the plan's 390px — see
  the caveat below), so "Phase D complete" reads accurately. **Verified 2026-07-13 against the actual
  files:**
  - `admin-screen-plan.md` describes the editor *design* (it locks the device-toggle decision at its
    "View Toggle Decision" note) but holds no done/in-progress state — no status edit. The Reshell
    plan's **Phase F** assigns `admin-screen-plan.md`'s update to *cleanup*, not to a Phase-D close.
  - `feature-roadmap.md` is post-MVP scope with **no** phase/preview entry — no edit.
  - The Reshell plan (`plan-reshell-spec-table-editor.md`) **exists but was moved OUT of the project**
    to `G:\shopify-app\Miscellaneous- Appx Product Specs Table\`, so it is no longer a tracked
    `context/` file; it is a phased *plan*, not a status tracker, and it defers its own doc updates to
    **Phase F**. Step 8 does **not** edit it — but the sign-off records the Phase-D deltas below so
    Phase F can reconcile the plan text.
- **This doc** — record the final gate count, the sign-off result (per template × view), and any
  defect found + where it was fixed.
- **No other context file needs a change (verified 2026-07-13, not assumed):**
  - `data-model.md` — feature 49 touches **no** schema / row-JSON / metaobject / assignment; the
    preview is a read-only editor-side rendering, and the Step 2 renderer already mirrors §10's
    whole-cell `hideWhenEmpty` rule. No edit.
  - `prd.md` — line 33 already specifies the "single view toggle … read-only Desktop / Tablet / Mobile
    previews," which feature 49 delivers. **One honest caveat (below):** the PRD's *"mobile = stacked
    label-over-value"* is **not** delivered by feature 49 and stays deferred — a known, documented
    deferral, not a PRD divergence to rewrite.
  - `code-standards.md` — the module followed existing conventions (pure logic split from DOM glue,
    the rem/px rule per Step 5, the drift-guarded CSS mirror). No edit.
  - If, contrary to the above, the sign-off surfaces a real divergence, update the owning file
    **before** claiming done (CLAUDE.md standing rule).

## Locked decisions

- **Step 8 ships no runtime code.** It is a gate + sign-off + docs close. Any defect found is fixed in
  the **owning step's** file (Steps 1–7), re-gated, and noted here — Step 8 does not become a grab-bag
  of new behavior.
- **The sign-off is the whole-feature pass**, not a re-run of one step: real long / short / dynamic /
  empty templates, all three device views, Edit + Settings, read-only + toggle-live + console-clean
  invariants, with scratch-template cleanup.
- **Auto-height is verified by the inner-scrollbar tell and the accessible-name by code** — the nested
  preview iframe is cross-origin and can't be measured or its `title` asserted from the top frame
  ([[browser-verify-embedded-app]]).
- **Feature 49 = Phase D only.** Real merchant theme fonts/colors, `TableStyling`, the mobile
  row-layout option, and live dynamic-value resolution in the preview stay **out** (Style tab / later).
  Step 8 closes Phase D and points at **Phase E (assignment)**; it does not start E.

## What this step does *not* own (boundary with later / out of feature 49)

- **Any new preview capability** (theme-accurate colors/fonts, `TableStyling`, live dynamic
  resolution, a dark-mode surface, a pill-explaining legend, a preview max-height cap) → out of
  feature 49 (Style tab / deferred, per Steps 5–7).
- **Phase-D-as-shipped is narrower than Phase-D-as-planned — Step 8 must record the deltas.** The
  Reshell plan's Phase D (lines 86–87) reads: *"Build after Style so previews render real `TableStyling`.
  Hide editor chrome, constrain grid width (tablet 768px / mobile 390px), stack label-over-value on
  mobile, render stand-in resolved values for pills … Pure UI."* Feature 49 delivered the **preview
  mechanism** (a sandboxed, device-sized, storefront-faithful iframe with hidden chrome + pill
  stand-ins), but **three planned elements diverge** — each an already-made, defensible call, recorded
  here for an honest close, not to re-open:
  1. **No live `TableStyling`.** The plan built Phase D *after* Style (Phase B); feature 49 shipped it
     **before** B (Style tab still pending). With no `TableStyling` to render, the preview inlines the
     **shared storefront `spec-table.css`** — which *is* the current storefront styling, so the preview
     stays faithful. When Phase B lands, the preview must extend to the saved `TableStyling`.
  2. **No mobile stacked label-over-value.** The plan (and `prd.md` line 33 / `admin-screen-plan.md`
     line 142) call for a stacked mobile layout; feature 49 changes only iframe **width**, and the
     storefront CSS has **no `@media` rules** (verified Step 5), so Mobile wraps the same two-column
     table more tightly. The stacked layout is the **mobile row-layout option deferred to the Style
     tab** (out of feature 49 per Steps 5/7).
  3. **Mobile width 375px, not the plan's 390px.** Step 5 shipped **375px** (the classic iPhone CSS
     width, browser-verified) where the plan wrote 390px — a deliberate Step-5 choice, noted so the
     plan and the code agree on the record (Phase F may reconcile the plan text).

  Net: Phase D closes the preview **mechanism**; live `TableStyling` and the mobile *layout switch* are
  later work. The sign-off and tracker entry must state this so "Phase D complete" is not misread as
  "the full planned Phase D (TableStyling + mobile stacking) shipped."
- **Reshell Phase E (assignment)** and beyond → the next feature, not Step 8.
- **A separate automated test for the cross-origin visual/height/`title`** → not added; those are
  browser-/code-verified by project testing strategy ([[testing-strategy]]).

## Testing

- **Unit (Node, pure):** none added by Step 8 (the feature's logic is fully covered by Steps 1–7:
  `deviceView.test.ts`, `specTablePreviewHtml.test.ts`, `previewBridge.test.ts`). The final
  `npm run test:run` count is recorded as the release number.
- **Gate:** `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
  npm run build` — all green.
- **Browser (embedded app):** the §2 sign-off matrix above.

## File placement

- **No source files change** (barring a sign-off defect fix in an owning step's file).
- **Docs:** `context/progress-tracker.md` (the only in-project phase-status tracker) and this doc.
  `admin-screen-plan.md` / `feature-roadmap.md` and the out-of-project Reshell plan need **no** edit
  (verified — none is a Phase-D status tracker; the plan defers its own doc updates to Phase F).
- **Explicitly unchanged:** every feature-49 source file (`deviceView.ts`, `specTablePreviewHtml.ts`,
  `previewStyles.ts`, `previewBridge.ts`, `SpecTablePreview.tsx`, `SpecTableEditor.module.css`, their
  tests), `SpecTableEditor.tsx` / `EditorShell.tsx` / `useRowEngine.ts` / `route.tsx`, `vite.config.ts`
  / `vitest.config.ts` / `app/globals.d.ts`, all `app/utils/*` / `app/models/*` / `app/shopify/*`,
  `prisma/schema.prisma`, `package.json`, and the `extensions/` theme app extension (incl.
  `spec-table.css`).

## Done when

1. Full gate green (typecheck, lint, format, test, build); final test count recorded here and in the
   tracker.
2. Live sign-off complete on the dev store: long / short / dynamic / empty templates each verified
   across **Desktop / Tablet / Mobile** — auto-height (no inner scrollbar / hugs / floors), per-device
   widths + centering, storefront styling, dynamic-pill placeholders (AA), empty state; **read-only +
   toggle-live + Settings-preview + console-clean** invariants all hold; scratch template(s) cleaned
   up and the templates list re-confirmed clean.
3. Any defect found during sign-off is fixed in its **owning step's** file, re-gated, and recorded
   here — or, if none, that is stated explicitly.
4. `progress-tracker.md` updated: Step 8 entry added, phase counter → **feature 49 / Reshell Phase D
   complete**, Current-Goal Reshell line advanced to **Phase E (assignment)**, with the entry recording
   the three Phase-D-vs-plan deltas (no live `TableStyling` yet; mobile stacked-layout deferred to the
   Style tab; 375px vs the plan's 390px). (No status edit to `admin-screen-plan.md` / `feature-roadmap.md`,
   nor to the out-of-project Reshell plan — verified none is a Phase-D status tracker; the plan defers
   its own doc updates to Phase F.)
5. No other context file diverges (verified: `data-model.md` / `prd.md` / `code-standards.md` need no
   change; the mobile stacked-layout is a documented deferral, not a divergence) — or the diverging one
   is updated first; **no source/config/extension change ships** from Step 8 (unless a sign-off defect
   fix, which is scoped + noted).

## Outcome (2026-07-13)

**Gate — green.** `typecheck` + `lint` + `format:check` + `test:run` (**581 tests, 28 files**) + `build`
all pass. No source change shipped (Step 8 is docs + sign-off only); the count matches Step 7's 581, as
expected.

**Live sign-off — substantially complete; two cells DB-blocked.** The dev store's **existing-template
editor route would not load** this session — a transient Neon/tunnel flap (the same instability logged
2026-07-13): loader-bearing routes hung (screenshot CDP timeouts, spontaneous zoom drift), while
client-only interactions worked (the `?status=ACTIVE` list filter navigated fine). So the 44-row **DJI
Mavic** and the dynamic-pill **Moto G35** could not be opened. I verified the whole preview surface on a
fresh **`/app/templates/new`** scaffold instead (the create route mounts the *same* `SpecTablePreview`
and doesn't read a stored template), typing a real row (`Display | 6.7-inch AMOLED, 120Hz`):

- ✅ **Desktop** — full-width storefront-styled table (bold ~33% label column, section rule, hairlines,
  padding from `spec-table.css`), editor chrome hidden, frame **hugs** content (auto-height, no inner
  scrollbar).
- ✅ **Mobile** — narrow ~375px frame, **centered** with gutters.
- ✅ **Tablet** — ~768px frame, **centered** with smaller gutters. Widths scale proportionally
  (Desktop fill > Tablet > Mobile).
- ✅ **Toggle live** — Desktop↔Tablet↔Mobile re-size the same frame with no reload/flash.
- ✅ **Read-only** — viewing/toggling never touched the SaveBar (only the typed edit did); **Edit**
  restored the fully interactive grid.
- ✅ **Empty state** — select-all → Delete (confirm modal showed the correct feature-33 "undo
  afterward" copy) → 0 rows → the centered *"No spec rows to preview yet — rows with content appear
  here as they'd render on your storefront."* message, frame floored at the Step 6 `min-height`.
- ✅ **Console** — clean (no CSP/`SecurityError`; the previews rendering at all is itself proof the CSP
  + `allow-scripts` sandbox + height shim from Step 6 work).
- ✅ **Cleanup** — the scratch `/new` was **discarded, never saved**; the templates list re-confirmed
  clean (same 5 templates, no stray "Untitled") — zero DB footprint.

**Two matrix cells not re-run this session (DB-blocked), already verified live in prior steps on this
same store:** (a) the **dynamic-pill neutral chip** (Step 7, Moto G35 — needs the Insert-field modal on
an existing template); (b) the **genuinely-long 44-row table** no-inner-scrollbar + **mobile
re-height-on-wrap** (Step 6, DJI Mavic — my scaffold value was short enough to fit one line at 375px, so
wrap-driven re-height wasn't re-observed today). The auto-height *mechanism* was re-confirmed (Desktop
hugged; all three frames sized correctly). No defect found; **no source change needed**.
