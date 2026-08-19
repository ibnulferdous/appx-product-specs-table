# Feature 49 · Step 6 — Device previews: content-driven iframe auto-height

## Goal in one sentence

Make the preview iframe **grow to exactly its content's height** — so a short table shows no dead
space below it and a long table shows **no inner scrollbar** (the admin page scrolls instead), and the
frame **re-heights when the device toggle reflows the text** — by having the framed document **measure
itself and postMessage its height to the parent**, which sizes the iframe; **no width, styling, pill,
or a11y changes here**.

## Where this sits (feature 49 map)

Feature 49 makes the editor's **Desktop / Tablet / Mobile** toggle render read-only storefront
previews (Reshell **Phase D**). Locked design: a **sandboxed `<iframe>`** sized to each device width,
rendering **the storefront markup + the shared `spec-table.css`**; dynamic fields as **labeled pills**;
`TableStyling` + the mobile row-layout option deferred to the Style tab. The 8 steps:

1. ✅ Toggle swaps the stage (plumbing only) — `49-…`, shipped 2026-07-12.
2. ✅ Pure storefront-markup renderer (`renderSpecTableHtml`) — `50-…`, shipped 2026-07-12.
3. ✅ Render the markup in a sandboxed iframe (`SpecTablePreview.tsx`) — `51-…`, shipped 2026-07-12.
4. ✅ Load the shared storefront stylesheet into the iframe — `52-…`, shipped 2026-07-12.
5. ✅ Device width sizing (`previewDeviceWidth(view)`) — `53-…`, shipped 2026-07-12.
6. **Content-driven iframe auto-height ← THIS DOC.**
7. a11y + read-only hardening + empty state (**incl. the dynamic-pill affordance styling**).
8. Docs + full gate + live sign-off.

## Why this is its own step

- **The fixed `32rem` height has been a lie since Step 3.** It clips a long table (an inner scrollbar
  appears — a scrollbar *inside* the preview *inside* the admin, the exact nested-scroll pain the
  editor's bounded scroller was built to avoid) and pads a short table with empty space. Step 6 is
  where the frame finally matches its content.
- **It is the one step that must break a Step 3 security lock, and that trade deserves its own
  review.** Step 3 chose `sandbox=""` (opaque origin, **no scripts**) as defense-in-depth. That was
  deliberate — and it severs **both** channels a parent normally uses to learn an iframe's height
  (see below). Auto-height is therefore not a CSS tweak; it forces a **sandbox capability decision**
  with a real security dimension. Isolating it here keeps that decision visible instead of buried in
  a "make it fit" diff.
- **It leans on a Step 5 property that isn't obvious.** Because the preview document is **byte-identical
  across the three device views** (Step 5 changes only the iframe's *outer* width, via inline style,
  never the `srcDoc`), a view switch does **not** reload the frame — so a `load`-event-only height
  signal would never re-fire on Desktop→Mobile. The height mechanism must react to **reflow**, not
  just load. That subtlety is the crux of getting the toggle to re-height, and it deserves to be
  reasoned about on its own.

## The hard constraint (why this isn't trivial)

An iframe does not size to its content; it defaults to ~150px and needs an explicit height. To set a
correct height the parent must *learn* the content height. There are exactly two normal channels, and
**Step 3's `sandbox=""` closes both**:

1. **Parent reads `iframe.contentDocument…scrollHeight`.** Requires the frame to be **same-origin**.
   Our frame is a **unique opaque origin** (no `allow-same-origin`), so this **throws** a SecurityError.
2. **The framed document runs a script that `postMessage`s its height out.** Requires **`allow-scripts`**.
   `sandbox=""` has none, so nothing in the frame can run.

So auto-height **requires relaxing exactly one** sandbox restriction. This is unavoidable; the whole
design question is *which one*, and Step 3 already pointed the way:

> `sandbox=""` … a defense-in-depth layer beneath the renderer's HTML escaping. **(Step 6's auto-height
> must therefore avoid same-origin DOM access into the frame.)** — `SpecTablePreview.tsx`, Step 3.

## The decision (as designed)

**Switch the sandbox to `sandbox="allow-scripts"` (still no `allow-same-origin`), inject a tiny trusted
measurement shim into the document that observes its own size and `postMessage`s the content height to
the parent, and have the parent listen and size the iframe. Keep the frame a unique opaque origin, and
add a strict CSP `<meta>` so the *only* code that can run is our own shim and the frame can make **no
network requests**.**

### Why the scripts route, not the same-origin route

- **It honors the Step 3 lock.** Step 3 explicitly reserved "avoid same-origin DOM access." The
  `postMessage` route never touches `contentDocument`; the frame stays opaque-origin and the parent
  never reaches *into* it — data flows *out*, one number at a time.
- **It reacts to reflow, not just load — which the toggle needs.** A `ResizeObserver` *inside* the
  frame fires on **every** reason the content height can change: the initial render, a device-width
  change (Step 5 resizes the iframe element → the inner layout viewport reflows → the observer fires),
  a late web-font swap, and any rows edit. One mechanism covers all of them. The same-origin route
  would need the parent to juggle a `load` listener (rows changes) **plus** a `ResizeObserver` on the
  element **plus** guard against reading a transient `about:blank` mid-reload — more moving parts, and
  it still reads `contentDocument`.
- **The security delta is small and bounded.** The frame remains a **unique opaque origin** — it has
  **no** access to the admin's DOM, cookies, storage, or same-origin network. The shim is **our own
  fixed, tiny code**, not merchant content; merchant text is still `escape`d (Step 2, tested) so it
  can't inject script in the first place. **The two dangerous tokens are never combined:**
  `allow-scripts allow-same-origin` together would let a frame clear its own sandbox — we ship
  `allow-scripts` **alone**. As a belt-and-suspenders bound on "we now allow scripts," a strict CSP
  meta (`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'`) means that even if
  escaping ever failed, injected markup could **not** load/exec anything or make **any** network
  request — only our inline `<style>` (Step 4) and inline shim are permitted, nothing else.

> **Rejected alternative — `sandbox="allow-same-origin"` (no scripts) + parent-measure.** Tempting
> because it keeps the frame script-*inert* (arguably a stronger statement about merchant content) and
> reads `documentElement.scrollHeight` directly. Rejected because it **contradicts the Step 3 lock**
> ("avoid same-origin DOM access"), makes the frame same-origin to the admin (the parent can reach in —
> acceptable only because no script runs, but a weaker isolation posture), and needs strictly more
> parent-side plumbing to catch the reflow-on-toggle case. Documented here so the reviewer sees the
> real fork, not a foregone conclusion.

### The measurement shim (trusted, fixed)

A minimal inline `<script>` in the document that:

- reports `document.documentElement.scrollHeight` (the full content box, **including** the ambient
  `body` margin from Step 4) via `parent.postMessage({ type: <constant>, height }, "*")`;
- fires the report from a `ResizeObserver` on `document.documentElement`, coalesced with
  `requestAnimationFrame`, plus once on `load` and once immediately;
- **dedupes** — only posts when the value changed — so there is no message churn.

`"*"` as the target origin is safe: the payload is a single height integer, no secret. The **parent**
does the trust check.

**No resize loop:** the content height is **width-driven** (the device width is fixed per view) and is
independent of the iframe *element's* outer height, so setting the outer height to the measured value
does not change the measurement → the observer does not re-fire from our own write. (The dedupe is a
second guard.)

### The parent side (`SpecTablePreview.tsx`)

- A `ref` on the iframe and a `window` `message` listener (in an effect, cleaned up on unmount).
- **Trust check:** accept a message only when `event.source === iframeRef.current?.contentWindow`
  **and** `event.data?.type === <constant>`. **Do not check `event.origin`** — an opaque-origin frame
  posts with `origin === "null"`; identity is established by `source`, not origin.
- Run the height through a pure `clampPreviewHeight(raw)` (finite? positive? floor to a small minimum;
  **no maximum** — see below) and set it as the iframe's inline `height`.
- Width stays from Step 5 (`previewDeviceWidth(view)`); Step 6 only adds the dynamic `height`.

### No max height (deliberate)

The frame grows to the **full** content height and the **admin page** scrolls — never an inner
scrollbar. That is the honest "how tall is this table on a real product page" preview, and it removes
the nested-scroll trap. (A future product decision to cap the preview and scroll *within* it is a
possible follow-up, explicitly not taken here.)

## What changes (architecture)

**One new tiny pure module (message-type constant + shim string + `clampPreviewHeight`) + inject the
CSP meta and shim into the document builder + the sandbox/height/listener edit in the component + a
`.previewFrame` CSS tweak. No renderer row-logic change, no reducer / schema / dependency / server /
persistence / config change, and no change to the storefront extension.**

### `app/routes/app.templates_.$id/previewBridge.ts` (NEW — the parent⇄frame contract)

- `export const PREVIEW_HEIGHT_MESSAGE_TYPE = "appx-preview-height";` — the single source of truth for
  the message `type`, imported by **both** the injected shim (via the document builder) and the parent
  listener, so they can never drift.
- The inline **shim string** (a builder or constant that embeds the constant above).
- `export function clampPreviewHeight(raw: unknown): number | null` — pure: non-finite / non-positive →
  `null` (fall back to the CSS floor); otherwise `Math.ceil` with a small minimum. Node-unit-testable.
- Framework-free (no React, no CSS import), like `deviceView.ts` / `previewStyles.ts`.

### `app/routes/app.templates_.$id/specTablePreviewHtml.ts` — inject CSP + shim

- Add the strict CSP `<meta http-equiv="Content-Security-Policy" …>` to the `<head>` (before the
  `<style>`), and the shim `<script>` (end of `<body>` is fine). Still pure (string in, string out);
  the row/markup logic is untouched. The document remains byte-identical across the three device views
  (the shim/CSP do not depend on `view`) — preserving the Step 5 "no reload on toggle" property.

### `app/routes/app.templates_.$id/SpecTablePreview.tsx` — sandbox, listener, height

- `sandbox="allow-scripts"` (revise the Step 3 `sandbox=""`; **update that comment** to explain the
  scripts+postMessage decision and the opaque-origin/CSP bound).
- Add the iframe `ref`, the `message` effect (trust-check + `clampPreviewHeight` + `setHeight`), and
  apply `height` inline alongside the Step 5 `width`. Read-only is preserved — the parent still only
  *reads* a number; it never sends anything into the frame or mutates the model.

### `app/routes/app.templates_.$id/SpecTableEditor.module.css` — `.previewFrame`

- Remove `height: 32rem`; add a small `min-height` floor (e.g. `~6rem`) so the pre-first-message state
  and an empty/short table are not a collapsed sliver. Keep `max-width`/`margin-inline`/border/radius/
  background. Update the block comment: height is now JS-measured (Step 6); no fixed height remains.

## Locked decisions

- **`sandbox="allow-scripts"`, opaque origin preserved, `allow-same-origin` NEVER added** — the
  measurement runs *inside* the frame and reports *out* via `postMessage`; the parent never reads
  `contentDocument`. Honors the Step 3 reservation.
- **Strict CSP meta** (`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'`) so
  the only executable/loadable content is our own inline style + shim and the frame can make no network
  requests — bounding the newly-granted `allow-scripts`.
- **Height reported by a `ResizeObserver`-driven shim** (rAF-coalesced, deduped), not just on `load`,
  so a device-toggle reflow (same `srcDoc`, new width — Step 5) re-heights the frame.
- **Parent trusts by `event.source` identity, not `event.origin`** (opaque frame → `origin === "null"`);
  height run through a pure `clampPreviewHeight` (finite/positive/min; **no max**).
- **No maximum height** — full content height, the admin page scrolls; no inner scrollbar. Capping is a
  possible later product call, not taken here.
- **Message contract in one module** (`previewBridge.ts`), shared by shim and listener — no drift.
- **Renderer row-logic, Step 5 width, Step 4 styling, the extension CSS all untouched**; the document
  stays byte-identical across views.

## What this step does *not* own (boundary with later steps)

- **Dynamic-pill affordance styling** + **richer a11y + read-only hardening + the empty-rows state** →
  **Step 7**. (Step 6 adds the security-scoped CSP because it is the direct counterweight to enabling
  scripts *here*; broader a11y/read-only polish still lands in Step 7.)
- **Merchant theme fonts/colors, `TableStyling`, the mobile row-layout option, live dynamic-value
  resolution, any preview max-height cap** → out of / later than feature 49.

## Testing

### Unit (Node, pure)

Add `previewBridge.test.ts` and extend `specTablePreviewHtml.test.ts`:

1. **`clampPreviewHeight`** — exhaustive: a normal positive number → `Math.ceil`; below the floor →
   the floor; `0` / negative / `NaN` / `Infinity` / non-number → `null`. (Guards the parent against a
   hostile/garbage message.)
2. **Document carries the shim + CSP** — `renderSpecTablePreviewDocument([...])` contains the CSP meta,
   a `<script>`, and the `PREVIEW_HEIGHT_MESSAGE_TYPE` constant; the shim references
   `postMessage`/`ResizeObserver`. Assert the constant is the **same** value the parent listener uses
   (import it from `previewBridge`), proving no drift.
3. **Byte-identical-across-views invariant intact** — the document does not depend on `view` (the
   Step 5 property the toggle-reflow relies on).
4. **Empty rows still valid** — an empty `rows` still yields a complete document with the shim + CSP,
   no crash.

(The actual `postMessage` round-trip, the `ResizeObserver` reflow, and the applied pixel height are
**browser-verified** — iframe messaging can't run in the Node env, per the project's testing strategy.)

### Browser (embedded app, per [[browser-verify-embedded-app]])

On the live dev store editor, using **both** a **long** template (e.g. Motorola Moto G35 5G, ~19 rows)
and a **short** one (e.g. Portable Handheld Fan, ~7 rows):

1. **Auto-height, no dead space** — the short template's frame hugs its content (no ~32rem empty gap
   below it); the long template's frame is **tall enough to show every row with no inner scrollbar**
   (the **admin page** scrolls).
2. **Re-heights on toggle** — switch Desktop → Tablet → Mobile: as the text wraps to more lines at
   narrower widths, the frame **grows taller** to fit (mobile tallest). This is the ResizeObserver /
   reflow path — a `load`-only signal would fail this check.
3. **No oscillation / thrash** — the frame settles to a stable height (no flicker, no growing loop);
   the browser console shows **no errors** (no SecurityError, no CSP violation for our own style/shim).
4. **Read-only + Edit intact** — the preview still never mutates; **Edit** restores the fully
   interactive grid; the Settings-tab-with-preview invariant holds.
5. **Fidelity carried** — Step 4 storefront styling and Step 5 device widths/centering are unchanged;
   dynamic fields still show plain pill text (Step 7).

Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run && npm run build`
all green, **plus** the browser pass above.

## File placement (per `code-standards.md`)

- Message contract + shim + clamp → **`app/routes/app.templates_.$id/previewBridge.ts`** (new).
- CSP + shim injection → **`app/routes/app.templates_.$id/specTablePreviewHtml.ts`**.
- Sandbox + listener + applied height → **`app/routes/app.templates_.$id/SpecTablePreview.tsx`**.
- Frame chrome → **`app/routes/app.templates_.$id/SpecTableEditor.module.css`** (`.previewFrame`).
- Unit tests → **`previewBridge.test.ts`** (new) + **`specTablePreviewHtml.test.ts`** (extend).
- **Unchanged:** `deviceView.ts` + `.test.ts`, `previewStyles.ts`, `SpecTableEditor.tsx`,
  `EditorShell.tsx`, `useRowEngine.ts`, `route.tsx`, `vite.config.ts`, `vitest.config.ts`,
  `app/globals.d.ts`, every `app/utils/*`, `app/models/*`, `app/shopify/*`, `prisma/schema.prisma`,
  `package.json`, and the `extensions/` theme app extension (including `spec-table.css`).

## Done when

1. `previewBridge.ts` exports `PREVIEW_HEIGHT_MESSAGE_TYPE`, the inline shim, and a pure
   `clampPreviewHeight`; the document builder injects the strict CSP meta + the shim, referencing that
   constant; the document stays pure and byte-identical across views.
2. `SpecTablePreview.tsx` uses `sandbox="allow-scripts"` (opaque origin; **never** `allow-same-origin`),
   listens for the height message (trusting by `event.source`, not origin), clamps it, and applies it
   as the iframe's inline height beside the Step 5 width; the Step 3 sandbox comment is updated.
3. `.previewFrame` drops the fixed `32rem` for a small `min-height` floor; no fixed height remains.
4. Unit tests pass: `clampPreviewHeight` exhaustive, shim + CSP + shared constant present, view-
   independence + empty-rows invariants intact; no config change ships.
5. Full gate passes (typecheck, lint, format, test, build).
6. Browser-verified on the dev store: short table hugs, long table shows every row with no inner
   scrollbar (page scrolls), frame re-heights on the device toggle, no console/CSP errors, no
   oscillation; Edit/Settings/read-only + Step 4/5 fidelity all intact.
7. `progress-tracker.md` updated — Step 6 complete; point at **Step 7 (a11y + read-only hardening +
   empty state + dynamic-pill affordance styling)**.
