# Progress Tracker

Update this file after every meaningful implementation change.

> **Forward-looking status doc, kept compact.** Per-step detail (verification logs, file
> lists, decisions, findings) lives in `context/features/NN-*.md` and in git history — link
> there, don't re-narrate.
>
> 🔴 **The rule that keeps this file small: a shipped or completed unit gets ONE line.** If a
> finding is load-bearing for future work it belongs in **Binding rules**, **Key Decisions**
> or **Open Questions** — not in an entry. Compacted 2026-08-03 (features 74–106) and
> 2026-08-08 (Recently Shipped); nothing was lost, git holds the originals.

---

## Current Phase

**Building the MVP — feature work is at the App Store pre-submission gate.**

Test suite **1418 tests / 57 files**; full gate (typecheck · lint · format · test · build)
green as of 2026-08-08. Last unit shipped: **value-cell multiline paste** (feature 115 —
pasting plain multi-line text into a value cell makes one multiline value, not N rows;
live-verified on `appx-dev`). Before it: the **activation-conflict banner** (a shared
`AdminAppLink` so the conflicting-template link survives "open in new tab").
Before it: the **value-cell → `<textarea>` migration** (features 109–114) — `contenteditable`
retired, broken Ctrl+Z fixed, `ValuePart[]` unchanged; live-verified on `appx-dev`.

---

## Current Goal

**Clear the two hard App Store blockers, then finish the reshell.**

1. 🔴 **`application_url` is still the scaffold placeholder `https://example.com`** — so the
   three registered compliance webhook endpoints resolve to a domain we do not own.
   `redirect_urls` carries the same placeholder, so OAuth shares the latent problem. Fix =
   stand up the production host, put it in **both**, re-deploy. ⚠️ This passes every local
   and dev-store check, because `shopify app dev` rewrites the URLs while it runs — and
   compliance webhooks are the one class Shopify delivers with **no dev session running**
   (`shop/redact` arrives 48 h after uninstall). See `app-store-review-checklist.md` §3 and
   `context/features/106-privacy-webhook-routes-and-subscriptions.md`.
2. 🔴 **Billing (Shopify App Pricing) — slice 1 (gate) built 2026-08-20; slice 2 + Dashboard pending.**
   The root-loader gate is coded + gate-green (Recently Shipped). Remaining: (a) operator creates the
   4 plans in the Partner Dashboard + sets `SHOPIFY_APP_HANDLE`; (b) **slice 2** — assigned-product
   cap enforcement at assignment time + an in-app "Manage plan" link (App Store req 1.2.3). See
   Current Goal item 2 and `prd.md` §Pricing.

> 🟢 **Blocker 1 progress.** `hiappx.com` + `support@hiappx.com` live (Zoho free), landing
> page + privacy policy published, demo store ready. Done 2026-08-18: **Phase 1 dev/prod
> config split** (new dev app `appx-product-specs-table-dev` `b9369cb1…`; prod `11731a3d…`
> has `automatically_update_urls_on_dev = false`); **Phase 2.2 prod Neon DB** (project
> `tiny-snow-77500604`, `us-east-2`/Ohio, all 11 migrations applied); **Dockerfile
> multi-stage fix** (prevents a first-deploy `vite: not found`); **dependency security pass**
> (react-router 7.17→7.18.2, deepmerge-ts override →8.0.1; `npm audit` = 0). Repo made
> **public** for CodeRabbit; secrets-scanned clean. **All merged to `main` via PR #11** after
> CodeRabbit review. **Phase 2.4 DONE 2026-08-19: Render Web Service is LIVE** at
> `https://appx-product-specs-table.onrender.com` (Docker · `main` · Ohio · Starter · 7 env
> vars, no `PORT`; boot-time `prisma migrate deploy` reached prod Neon and applied the pending
> `20260819022834_add_all_products_unique`; server bound to injected port 10000). **Phase 2.5
> DONE: custom domain `specs-app.hiappx.com`** (Render custom domain, Cloudflare CNAME DNS-only,
> TLS cert issued; Render env `SHOPIFY_APP_URL` updated to match). **Phase 3 DONE 2026-08-19 —
> BLOCKER 1 CLEARED:** prod `shopify.app.toml` `application_url` + `redirect_urls` rewritten to
> `https://specs-app.hiappx.com`, `shopify app deploy` on the prod config released version
> `appx-product-specs-table-12` (application_url + auth + webhooks all updated) — the 3 compliance
> webhook URIs no longer point at `example.com`. Config switched back to dev after. **VERIFIED
> 2026-08-19:** clean install of the prod app on `specs-demo-5jyf2f2v` (dev server OFF) completed
> OAuth via `specs-app.hiappx.com` and loaded the embedded app home + Templates empty state — prod
> server + prod Neon + OAuth confirmed working end-to-end. **FULL STOREFRONT PATH VERIFIED ON PROD
> 2026-08-19:** rebuilt template `XO G28` (Active, 13 rows, 30 assigned products) through the prod
> app; it renders live on the demo storefront product page ("Multi-column template – Blue") — the
> complete chain app write → metaobject sync → routing map → theme extension → Liquid render all
> confirmed on production. Demo-store rebuild underway (more style demos optional content work).
> 🟢 **App renamed 2026-08-19** — prod `11731a3d…` → **"AppX Product Specs Table"** (`shopify.app.toml`
> `name`, version `-13`); dev `b9369cb1…` → **"AppX Product Specs Table -dev"** (version `dev-2`; its
> first full `deploy` also registered metaobjects/shop/extension on the dev app to match prod). CLI
> stripped the deprecated `include_config_on_deploy` from the dev TOML (neither TOML carries it now).
> The App Store **listing name** is a separate field set later at "Choose distribution".
> **Blocker 2 — Billing / Shopify App Pricing: IN PROGRESS (slice 1 of 2 built 2026-08-20).**
> The App Pricing **gate** is coded + gate-green (root loader redirects a no-subscription shop to
> Shopify's hosted plan page; plan model + `activeSubscriptions` read done — see Recently Shipped).
> 🔴 **Two operator actions unblock live-verify:** (a) create the 4 plans in **Partner Dashboard →
> Distribution → Manage listing → Pricing content** with Display names exactly `Free`/`Go`/`Plus`/`Max`
> (Free $0/25, Go $4.99/250, Plus $9.99/1000, Max $14.99/∞; 60-day trial on the three paid);
> (b) set **`SHOPIFY_APP_HANDLE`** in the Render env to the app handle (the slug in
> `admin.shopify.com/store/<store>/apps/<handle>`). Then **slice 2**: assigned-product cap enforcement
> + in-app "Manage plan" link. Optional: signed compliance-webhook 200 check.
> Full ordered path: [`launch-support-checklist.md`](launch-support-checklist.md). ⚠️ That
> checklist does **not** cover billing — blocker 2 stays independent.

Everything upstream is done and live-verified on the dev store:

- **Custom spec-table editor** — 13-step build + Step 9.5 (features 02–15).
- **Reshell Phase A** — editor reshelled to the mockup (features 16–18).
- **Editor / templates-list slices** — paste refinements, list polish, bulk delete + Undo,
  keyboard cell navigation, lifecycle / create-on-save (features 19–33).
- **Storefront pipeline** — Theme App Extension renders a product's assigned spec table
  live; dynamic `SHOPIFY_FIELD` / `METAFIELD` parts resolve (features 34–35).
- **Product assignment engine (37–48)** — merchant-complete end to end.
- **Reshell Phase D — device previews (49–56)** (tablet removed 2026-07-22).
- **Reshell Phase B1 — Style rail (57–69, steps 1–12)**, complete 2026-07-20.
- **Reshell Phase B2 — preset gallery (88–92)** + **accent themes (93, 97–102)**, complete
  2026-07-30. Create template → six-card gallery + seven-swatch accent row → a scaffold
  already styled and stamped, through to `styling_css` on the rendered storefront.
- **Scale / verification series (103–106)** — read-pattern catalog, metafield byte budgets,
  privacy webhook domain + routes.

**Remaining reshell:** Phase C (Settings display rules) → E (assignment folded into the
reshell) → F (top-bar status/save model + cleanup). 14-step Style-tab plan:
`~/.claude/plans/style-tab-phase-b-implementation-plan.md` (1–12 = B1, 13–14 = B2, 15+ = B3
saved presets, cuttable).

### Binding rules (do not violate)

- 🚫 **The Edit grid never reflects merchant styling.** It is a fixed editing surface; the
  Desktop / Mobile previews are the _only_ place Style / Settings changes appear (they are
  storefront-faithful). Step 11 as originally planned ("live styling on the editing grid")
  was built, rejected on review, and fully reverted — see `context/features/67-…`.
  `SpecTableEditor.module.css` + `RowGrid.tsx` are tripwired byte-clean against sign-off
  `a7b304c`.
- **No contrast checking ships** (decided 2026-07-20): the app can't compute contrast (null
  colours inherit unknown theme values; alpha is enabled on background knobs), so any signal
  would be a guess. Don't reintroduce without a new decision.
- **Server precomputes styling; Liquid only prints** — the sync writes derived
  `styling_css {classes, vars}`; the Liquid block carries no styling logic, so a new knob
  needs no storefront work (the pipe is total over `StylingValues`).
- **Nullable ⇒ CSS custom property; non-null keyword ⇒ modifier class.** The Step 2 rule.
  It is why most Style-tab features cost no migration, no presence flag and no Liquid edit.
- 🔴 **The default IS the storage format.** The wire is overrides-only, so a template storing
  the default stores **nothing** — there is no "unset" state and no way to scope a default
  change to new templates only. Changing any default repaints every stored table that never
  set the field. Free while the only data is the dev store's; a silent storefront change for
  every merchant afterwards. (Same window closed the `simple` → `classic` preset-id rename
  and the `ALL_OPEN` → `FIRST_OPEN` initial-state change, both 2026-07-30.)
- **A preset bundle OMITS any field equal to its domain default** — an explicit default
  serializes away to nothing and fails the fixed-point guard. Four cards have hit this
  (Multi-column's header, Classic's `LINES`, Accordion's `BANDED` and `FIRST_OPEN`).
- **A preset bundle sets STRUCTURE ONLY** — no colour, no typography, no density, no width.
  🔴 **Colours never join `PRESET_SCOPED_FIELDS`** (feature 93 D7, reversing a
  forward-reference stated in three places): appending one makes every seeded template read
  "Customized" the instant it is created, and an accent has no provenance column, so the
  repair is undefined rather than merely wrong. `PRESET_SCOPED_FIELDS` and
  `ACCENT_SCOPED_FIELDS` are **asserted disjoint**, and that disjointness is what lets the
  seeding invariant be stated per-scope.
- **A rail group whose swatches can ALL vanish must still hold a non-swatch control that
  always renders.** (Replaces feature 95's "every group keeps one unconditional swatch",
  which feature 96's `tableFrame` gate broke.) A control earns a hide only when its field
  feeds **exactly one live CSS rule** — a fact about the stylesheet, not a tidiness call.
  🚫 `borderColor` is a three-place permanent no: it dresses row rules, the column divider,
  the feature-80 separator, and the outline whenever `outerBorderColor` is unset.
- **Number boxes commit on a keystroke only when the parse is LOSSLESS** —
  `format(parse(raw)) === raw` (`liveCommitValue`, `stylingControls.ts`). 🔴 The naive fix is
  worse than the bug: these fields are controlled and every converter clamps, so a blind
  `onInput` commits the `1` of a `1000` as the 240 floor and rewrites the box under the
  caret. `liveCommitValue` returns three things — `undefined` (still typing), `null` (a real
  empty/off value), a number — so only `!== undefined` is a correct test.
- 🔴 **On a NATIVE element, a boolean value for an attribute React does not recognise is
  dropped from the DOM entirely** (React 18, dev-console warning only). App Bridge's
  `<SaveBar>` takes a native `<button>`, so it needs `loading="true"` as a **string**.
  ⚠️ Dashed `<s-*>` tags are custom elements and DO receive booleans stringified — 🚫 do not
  "fix" the four working `<s-button loading={flag}>` call sites.
- **`aria-describedby` concatenates the referenced element's TEXT CONTENT with no
  separator** — `<span>A</span><span>B</span>` announces `"AB"`. Any multi-phrase
  description must be one text node with real DOM separators.
- 🚫 **There is no per-product override metafield, and the routing map has no unbounded
  overflow escape hatch.** `[product.metafields.app.spec_table]` was deleted 2026-08-04. Two
  things follow and neither is obvious from the code: **(1)** reinstating the Liquid read
  without also reinstating the TOML definition is **silently dead** — an undefined metafield
  resolves to nil, so the branch never fires and reads as a routing bug. **(2)** The old
  answer to "what if one template's `byProduct` set nears the 128KB json cap" was *materialize
  those products as per-product metafields via `bulkOperationRunMutation`*. That answer died
  with the definition. 🟢 **Option 1 (2026-08-05) bought ~2–4×:** the delivery wire is now
  compacted (bare-id keys, interned handle indices, `excluded` as an object), pushing the
  ceiling from **3,446** excludes / 1,745 per-product picks to **~7,276 / ~7,274** (§14). This
  was a **down-payment, not a fix** — under Option 1 `byProduct` and `excluded` still shared one
  128KB budget. 🟢 **Option 2 (metaobject sharding) is now DESIGNED + BUILT (feature 108,
  Units A–E complete, 2026-08-05):** those two maps are sharded across N = 1024
  `$app:appx_routing_shard` metaobjects keyed `product.id mod 1024`, each with its own 128KB budget
  (total per-product capacity `N × 128KB`), and the shop `$app:routing` metafield (wire **v3**) now
  carries only the broad tiers. Plan + decisions: [`108-…`](features/108-routing-metaobject-sharding.md).
  🔴 **N (=1024) can never change after launch** — it is the storage format; a change re-buckets every
  product (same law as the styling defaults). ✅ **Fully shipped + live-verified on appx-dev after the
  version-11 deploy** (Units A–F complete, 2026-08-05) — see Recently Shipped.
- **Every GraphQL input array is capped at 250** (Admin and Storefront, since API 2020-01)
  and Shopify rejects the **whole request**, not the overflow. `nodes(ids:)` chunks at
  `NODES_MAX_IDS = 250`; failure is per-chunk by construction.
- **Instrument before code.** When a live check says "nothing changed" or "the control is
  dead", suspect the instrument first, and capture the baseline through the same instrument
  at the same settings in the same session. This has produced a false negative about working
  code at least five times. Environment specifics live in the
  [[embedded-admin-iframe-automation]], [[testing-strategy]] and
  [[browser-verify-embedded-app]] memories.

---

## Recently Shipped

> Rolling window, newest first — **one line per unit**. Detail lives in the linked
> `context/features/` doc and in git. If a finding is load-bearing for future work it belongs
> in Binding rules, Key Decisions or Open Questions, not in an entry here.

- **Billing (blocker #2) — App Pricing gate, slice 1 of 2** — 🛠️ 2026-08-20, gate green
  (test **1448 / 59**, typecheck · lint · format · build). ⚠️ **NOT live-verified** — needs the
  Dashboard plans + `SHOPIFY_APP_HANDLE` (see Current Goal item 2). Built: pure plan model
  `app/utils/billingPlans.ts` (4 tiers Free/Go/Plus/Max → assigned-product caps 25/250/1000/∞;
  🔴 unknown/absent plan falls back to the **Free** cap, never unlimited); `app/shopify/billing.server.ts`
  reads `currentAppInstallation.activeSubscriptions` (chosen over `billing.check` because the $0 Free
  plan counts as active AND it yields the plan name for cap enforcement — one query, both jobs;
  validated vs API 2026-01); root loader `app/routes/app.tsx` redirects to the hosted plan page
  (`…/charges/<app_handle>/pricing_plans`, `target:"_top"`) when a shop has no active subscription.
  🔴 **FAIL BIAS:** redirect ONLY on a *determined* absence — a transient Admin failure
  (`determined:false`) never ejects a paying merchant; on failure the plan resolves null → Free cap.
  PRD §Pricing reconciled to the 4-tier decision (retired the Early-Bird concept). **Slice 2
  (next): assigned-product cap enforcement at assignment time + an in-app "Manage plan" link**
  (App Store req 1.2.3 — upgrade/downgrade without support).
- **CodeRabbit review pass (7 slices) applied → `dev` merged to `main`** — ✅ 2026-08-19.
  PR #11 (`dev → main`) merged as a merge commit (`main` @ `41c734a`) after the CodeRabbit
  findings from review vehicles #14–#20 were triaged (real fixes applied, lint-only noise
  skipped) and consolidated onto `dev`; full gate green (typecheck · lint · **1444 tests** ·
  build). Notable code fix: malformed-body guard on the templates action. Notable schema
  change: **partial unique index blocking duplicate `ALL_PRODUCTS` assignment rules**
  (migration `20260819022834_add_all_products_unique`, documented in `data-model.md` §9).
  Review PRs #14–#20 closed (not merged); needs `prisma migrate deploy` at release.
- **Templates-list: inline Draft⇄Active status toggle on each row** — ✅ 2026-08-15, build
  green, **fully live-verified on `appx-dev`**. An `s-switch` in the Status cell flips status
  in one click (the ⋯ menu's "Change status" modal stays as the fallback, and remains the only
  path for ARCHIVED rows, where the two-state toggle is hidden). Reuses the existing `status`
  action verbatim — same conflict gate, metaobject re-sync, routing rebuild. UI-only, no
  server/schema change. **Directional optimism ("confirm before flipping", merchant decision):**
  ACTIVE→DRAFT (never refused) flips optimistically/instantly; DRAFT→ACTIVE (can be blocked by
  the conflict gate) shows an `s-spinner` in the toggle's place and does NOT flip until the
  server confirms — so a blocked activation never flashes Active-then-reverts. Driven by
  `pendingStatusSubmit` off the shared fetcher. **Whole table goes inert during any row
  mutation** (`loading={listLoading || busy}` on `<s-table>`) — dims + blocks interaction so a
  merchant can't click a template-name link and navigate away mid-write. Live checks: instant
  off-flip (no spinner); blocked activation → spinner → settles back to Draft (`updatedAt`
  unchanged, toast "Can't activate: …overlaps the active template …"); allowed activation →
  spinner → settles Active (`updatedAt` bumped); table dims during the write and a name-link
  click mid-write does NOT navigate. ⚠️ Cloudflare tunnel
  flaked mid-test once (known — [[ngrok-tunnel-for-app-dev]]); a status write was interrupted
  and simply didn't persist (fail-safe, no partial state).
- **Editor: multi-line paste into a value cell makes ONE multiline value, not N rows** — ✅
  2026-08-08, gate green (test **1418 / 57**), live-verified on `appx-dev`.
  [`115-…`](features/115-value-cell-multiline-paste.md) · rule → `data-model.md` §7
  "where you paste decides".
- **Editor: rail-toggle button gained a hover/focus tooltip** — ✅ 2026-08-08, build green,
  live-verified. Reuses `railToggleLabel` via the `interestFor` invoker pattern; no new string.
- **Fix: hyphenated metafield tokens printed raw `{% mf … %}` source on the storefront** — ✅
  2026-08-07, gate green (test **1412 / 57**). `TOKEN_RE` excluded the hyphen; widened to
  `[A-Za-z0-9_-]+`. ⚠️ Already-degraded data is **not** auto-repaired (one row in one template
  on `appx-dev`; one edit + Save re-tokenizes). Rule → `data-model.md` §7.
- **Activation-conflict banner: conflicting-template link opens correctly in a new tab** — ✅
  2026-08-07, gate green (test **1409 / 57**), merchant-verified both click paths. Extracted
  the shared `AdminAppLink` + `adminAppLink.ts`; `app.templates.tsx` refactored onto both so
  the two call sites can't drift. See [[appbridge-cross-origin-link-newtab]].
- **Fix: value textarea clipped its content (`autoSize` pinned a zero height)** — ✅
  2026-08-07, build green, live-measured on `appx-dev`. Never pin a degenerate measurement;
  a `ResizeObserver` re-measures on gaining layout. ⚠️ A web-font-race hypothesis was
  disproven by measurement and that code was removed, not shipped.
- **Value cell → `<textarea>` migration — features 109–114, 🎉 COMPLETE** — ✅ 2026-08-07, all
  live checks passed on `appx-dev`. Step 1 codec `valueText.ts`
  ([`109-…`](features/109-value-textarea-step1-codec.md)) · Step 2 `SET_VALUE_PARTS`
  ([`110-…`](features/110-value-textarea-step2-reducer-action.md)) · Step 3 surface swap
  ([`111-…`](features/111-value-textarea-step3-surface-swap.md)) · Step 4 prune edit-pill
  wiring ([`112-…`](features/112-value-textarea-step4-prune-editpill-plumbing.md)) · Step 5
  delete dead code ([`113-…`](features/113-value-textarea-step5-remove-dead-code.md)) · Step 6
  docs + sign-off ([`114-…`](features/114-value-textarea-step6-docs-and-verification.md)).
  **`contenteditable` and its broken Ctrl+Z are gone; `ValuePart[]` unchanged end to end** —
  no data migration, storefront untouched. Architecture → `data-model.md` §7.
- **Routing metaobject sharding (Option 2) — feature 108, Units A–F COMPLETE** — ✅ 2026-08-05,
  gate green (test **1443 / 56**), **live-verified on `appx-dev`** after the version-11 deploy
  (two products → two distinct shards → their own tables; D5 empty-on-remove confirmed).
  `byProduct`/`excluded` sharded across N = 1024 `$app:appx_routing_shard` metaobjects; shop
  wire bumped to **v3** (broad tiers only).
  [`108-…`](features/108-routing-metaobject-sharding.md) · §9/§10/§14. 🔴 N can never change
  after launch (Binding rules). ⚠️ The v11 deploy re-anchored step 106's compliance URIs onto
  `example.com` — refreshes when the production host is set.
- **Routing delivery wire compacted (Option 1)** — ✅ 2026-08-05, gate green (test
  **1408 / 54**), live-verified on `appx-dev`. Bare-id keys + handle interning + `excluded` as
  an O(1) membership object; ~4.2× headroom. `spec-table-resolve.liquid` ↔
  `compactRoutingForDelivery` is a **private wire contract** guarded by
  `routingWireContract.test.ts`. §9/§14.
- **Per-product `$app:spec_table` override metafield REMOVED — resolution is two tiers** — 🛠️
  2026-08-04, gate green (test **1397 / 53**). ⚠️ **NOT DEPLOYED** — the `shopify app deploy`
  is what deletes the definition; it rides the production-host deploy. 🔴 Declarative
  definitions are read-only through the Admin API — deleting the TOML block **is** the delete,
  and it takes every stored value with it. §9.
- **Storefront: METAFIELD parts backed by metaobjects rendered EMPTY** — ✅ 2026-08-04, gate
  green, live-verified. `metafield_text` has **no default field** for a metaobject reference;
  fixed by branching on `type contains "metaobject_reference"` and trying
  `label` → `name` → `title`. Not an edge case — the whole `shopify.*` taxonomy is
  metaobject-backed. `context/features/35-…` §Correction.
- **Storefront: every OTHER list metafield type rendered empty too** — ✅ 2026-08-04, gate
  green, live-verified. Rendered item-by-item, joined `", "`. 🔴 The per-item shape is
  **duck-typed** (`.unit` → `.rating` → `.title` → `.name` → `.url` → `.src` → `{{ item }}`),
  never switched on type name — Shopify's measurement family is open and still growing.
  ⚠️ Accepted divergence: `", "` join vs Shopify's localized sentence format.
  `context/features/35-…` §Follow-up.
- **jsdom carve-out + `valueDom.test.ts` (33 tests)** — ✅ 2026-08-04, gate green (test
  **1397 / 53**). One file opts in with `// @vitest-environment jsdom`; runner default stays
  `node`, no second project. 🚫 Not an opening for component tests — rule in Key Decisions
  and `code-standards.md` → Testing.
- **Value cell: fix "last character won't delete" + dead Ctrl+Z** — ✅ 2026-08-04, gate green
  (test **1364 / 52**), live-verified. 🔴 Root cause: Chrome authors a placeholder `<br>` when
  a `contenteditable` host empties. (Superseded by the 109–114 textarea migration.)
- **Templates-list: server-side pagination (Phase 2, first slice)** — ✅ 2026-08-04, gate green
  (test **1364 / 52**), live-verified against Neon. Page size 25 via `?page=`; order is
  `updatedAt DESC, id DESC` (the `id` tiebreaker makes paging stable); page clamped
  server-side. ⚠️ **Reverses feature 28** — the client status filter moved back onto the
  WHERE + COUNT. Next Up item 9 carries what remains.
- **Templates-list name links open-in-new-tab fix** — ✅ 2026-08-04, live-verified. Superseded
  by the shared `AdminAppLink` on 2026-08-07 (see above).
- **Template Save latency: removed wasted Admin round-trips + parallelized reads** — ✅
  2026-08-03, test **1363 / 52**. Dropped the metaobject read-back verification, cached
  `Shop.shopGid`, and `Promise.all`'d three shop-scoped reads. ⚠️ Not live-verified.
- **Editor Save: `saveTemplateForShop` dropped ~5 DB round-trips to 2** — ✅ 2026-08-03, test
  **1365**. The styling upsert + `include` (which forces an interactive transaction) now runs
  only when styling actually changed. Measurement trail → [[save-action-latency-breakdown]].
- **Templates-list loader: read-path perf** — ✅ 2026-08-03, test **1361**. `$queryRaw` selects
  four columns + `jsonb_array_length(rows)` instead of every template's full `rows` blob;
  keyed off `myshopifyDomain`; `upsertShop` moved off the critical path; assigned-product
  counts deferred/streamed. Closes step 103 finding F3's first half.
- **Step 107 Unit A — boilerplate removal + app-home shell** — ✅ 2026-08-03, gate 10/10, test
  **1361 / 52**, 7/7 live checks with Postgres identical before and after.
  🔴 The load-bearing removal: `app._index.tsx`'s `action` ran `productCreate` against the
  merchant's live catalog. Guarded as a whole-tree absence
  (`boilerplateRemovalContract.test.ts`). ⚠️ Finding **L1** → Next Up item 3; TOML edits
  staged, not deployed. [`107-…`](features/107-boilerplate-removal-and-app-home-shell.md)
- **Step 106 — privacy webhook routes + subscriptions** — ✅ 2026-08-02, gate 10/10, deployed
  and confirmed registered. 🔴 Not submission-ready — see Current Goal item 1.
  [`106-…`](features/106-privacy-webhook-routes-and-subscriptions.md)
- **Step 105 — compliance payload domain + shop erase path** — ✅ 2026-08-02, test **1338**.
  🔴 `shop/redact` is not a no-op (six tables); the erase is guarded on `isInstalled` **inside
  the `WHERE`**; `Session` is outside the FK cascade.
  [`105-…`](features/105-privacy-webhook-domain-and-erase.md) · `data-model.md` §15.
- **Step 104 — metafield byte budgets** — ✅ 2026-08-01, test **1309**. Ships an API-version
  tripwire in `app/shopify.server.test.ts`.
  [`104-…`](features/104-metafield-byte-budgets.md) · `data-model.md` §14.
- **Scope/exclude chips turned into raw GIDs past 250 products** — ✅ 2026-08-01, test
  **1284**. Chunked at `NODES_MAX_IDS = 250`, per-chunk fail-soft. ⚠️ Not live-verified (no
  >250-product dev-store data). Record → `data-model.md` §13 F4.
- **Step 103 — read-pattern catalog** — ✅ 2026-08-01, `data-model.md` §13. No code; 20 reads
  catalogued, six findings routed out.
  [`103-…`](features/103-read-pattern-catalog.md)

---

## Completed

> One line per unit. Detail → the linked `context/features/` doc + git history.

### Templates-list — name links open-in-new-tab fix (2026-08-04)

- **Template-name links open in the same tab on a normal click AND in a working new tab on
  "Open in new tab"** — ✅ 2026-08-04, typecheck · lint · build green, live-verified on the
  dev store. Bug: the row's `s-link href={`/app/templates/${id}`}` was app-origin-relative;
  the browser's "Open in new tab" (a context-menu action App Bridge can't intercept) resolved
  it against the app's **own** origin (the tunnel), loading the app standalone with no Shopify
  session — the broken page. Fix, all in `app.templates.tsx`:
  (1) the loader builds `adminAppBase = https://admin.shopify.com/store/<store>/apps/<CLIENT_ID>`
  from `session.shop` (stripped of `.myshopify.com`) + `SHOPIFY_API_KEY`; the name link's
  **href** is now `${adminAppBase}/app/templates/${id}`, so the context-menu "Open in new tab"
  (which uses the raw href) lands in the admin, which re-embeds the app. Client id (not the
  derived handle) keeps it environment-independent — verified live: admin resolves
  `apps/<client_id>` → the handle URL and loads the embedded editor.
  ⚠️ (2) **A cross-origin admin href makes App Bridge open EVERY click in a new tab** — the
  first cut shipped that regression. So the link now carries an `onClick`: App Bridge
  preventDefaults the cross-origin link in a capture-phase listener (killing the unwanted new
  tab) but doesn't stopPropagation, so our bubble handler still runs — a plain primary click
  `navigate()`s in place (same-tab SPA), a ⌘/Ctrl/Shift/middle click `window.open`s the
  absolute href in a new tab. Do NOT bail the handler on `event.defaultPrevented` (it's
  already true from App Bridge) — that skips the in-place nav and the click does nothing.
  Added `useNavigate`; no schema/route/test change.

### Editor Save — `saveTemplateForShop` round-trip cut (2026-08-03)

- **The editor Save write dropped from ~5 DB round-trips to 2 on the common path** —
  ✅ 2026-08-03, tests → 1365, gate green (typecheck · build). Root cause (measured, not
  guessed): the write is just `findFirst` + one `update`; server-side both are ~1ms
  (EXPLAIN ANALYZE of the read = 1.1ms PK scan; `rows` JSON avg 5.5KB / max 23KB). The
  multi-second Save is **round-trips × the dev link's ~0.5–1.6s/RT cost**, NOT DB work —
  and it's near-zero in prod (co-located host). The editor resends styling on **every**
  save (`useRowEngine.ts` sends `serializeStylingOverrides`), so the nested `styling.upsert`
  + `include` — which forces an interactive transaction — ran on every save even when
  styling was unchanged. Fix, all in `app/models/template.server.ts`: (1) the ownership
  `findFirst` now `select`s **`{ rows, styling }`** (styling fetched in the read we already
  do); (2) new `stylingColumnsMatch` compares the payload's would-be columns to the stored
  row; (3) when styling is a no-op (absent, or byte-for-byte equal), the write is a plain
  single-statement `update` with **no nested write and no `include`**, and the already-read
  styling is reattached to the returned shape the metaobject sync consumes; (4) the nested
  upsert + `include` runs **only** when styling actually changed (first save / real edit).
  Shop isolation unchanged — `{ id, shopId }` where-unique on both read and write, both
  paths. No schema change, no migration, no `route.tsx` change (return shape preserved).
  Tests: `findFirst`-args updated for the `select`, `styling: null` added to the save-block
  mocks, +2 tests pinning the fast path (no styling/include) and the changed path (upsert +
  include). Measurement trail recorded in agent memory (`save-action-latency-breakdown`).

### Templates-list loader — read-path perf (2026-08-03)

- **The list loader stopped shipping the `rows` blob, took Shopify + the shop.id
  lookup off the critical path** — ✅ 2026-08-03, tests → 1361, gate green (typecheck
  · lint · format · build). Addresses **step 103 finding F3** and the R2 read pattern.
  Four changes, all contained to `app/models/template.server.ts` + the
  `app.templates.tsx` loader: (1) `listTemplatesForShop` → **`listTemplateSummariesForDomain`**,
  a `$queryRaw` that selects only `id/name/status/updatedAt` and computes the row
  **count** in Postgres via `jsonb_array_length` (guarded by `jsonb_typeof` for the
  non-array case) — the old `findMany` read every template's full `rows` JSON (~230KB
  for ~34 templates) just to render one integer per row; (2) the read is keyed off
  the session **`myshopifyDomain`** via a `Shop` JOIN, so it no longer waits on
  `upsertShop`; (3) `upsertShop` runs as a background side effect (install-flip),
  off the critical path; (4) **`resolveAssignedProductCounts` is now deferred** — the
  loader returns the promise UNAWAITED and each "Assigned Products" cell streams in
  under `<Suspense>`/`<Await>` (placeholder → number, "—" on failure), taking a live
  Admin round trip off first paint. Shop isolation intact (WHERE pins the unique
  domain; domain is a bound param). No migration. No feature doc. 🚫 Did **not**
  denormalize the counts into stored columns — row count is already free via
  `jsonb_array_length`, and the product count is partly Shopify-owned so a cache
  would go stale silently without webhook invalidation (considered + rejected).

### Style tab — presets, accents & polish (2026-07-26 → 2026-07-31)

- **Gallery cards gained a derived "what's different" line** — ✅ 2026-07-31, tests → 1270.
  `presetHighlights()` derived from the resolved bundle, never stored; goes INTO
  `aria-describedby`. `StylePreset.description` removed the same day (merchant decision) —
  it had already gone stale once. Live pass found two wrap defects invisible to all 1268
  tests. No feature doc.
- **Style-tab number boxes did not dirty the editor while typing** — ✅ fixed + live-verified
  2026-07-31, tests → 1256. The `liveCommitValue` lossless round-trip rule (see Binding
  rules). No feature doc.
- **`sectionsInitialState` default `ALL_OPEN` → `FIRST_OPEN`** — ✅ 2026-07-30, tests → 1245,
  storefront live-verified. Done then because the default IS the storage format (Binding
  rules). 🚫 Defaulting it from the Enable-collapsing toggle was rejected — it breaks the
  pure-read law. Added `specTableLiquidDefaultsContract.test.ts` (the Liquid `| default:`
  literal was an unguarded second copy). No feature doc.
- **Accordion card → BANDED section headers** — ✅ 2026-07-30, live-verified, tests unmoved
  at 1237. [`88-…` §revision 3](features/88-style-preset-gallery.md)
- **Save-bar spinner bug** — ✅ fixed 2026-07-30, tests → 1237, live-verified by DOM capture.
  The React 18 native-attribute trap (Binding rules); `saveBarSaveAttrs()` in
  `editorShared.ts`. No feature doc.
- **Gallery polish pass** — ✅ 2026-07-30, tests unmoved at 1237. Classic's row rules were
  silently off (`PLAIN` + `STRIPES`) → `TEXT_ONLY` + LINES, stripes moved to Accordion;
  accent double-ring fixed by suppressing the **selected** ring, not the focus ring;
  "Colour theme" → "Color theme"; the default swatch's tooltip → "Your theme's colors".
  [`88-…`](features/88-style-preset-gallery.md)
- **Feature 93 — accent themes** (six steps, 97–102) — ✅ COMPLETE 2026-07-30, tests → 1227,
  live-verified admin → Postgres → metaobject → storefront. 🔴 An accent cannot be one field
  (three of five cards hardcode `background: transparent`); five fields, `headerTextColor`
  is what makes the set total. 🔴 **One open merchant decision:** step 102 measured §D3's
  dark-theme risk and it is real on two surfaces — doc 93 §Open question 2.
  [`93-…`](features/93-style-accent-themes.md) ·
  [`97-…`](features/97-accent-vocabulary.md) ·
  [`98-…`](features/98-accent-render-harness.md) ·
  [`99-…`](features/99-accent-seed-path.md) ·
  [`100-…`](features/100-accent-swatch-row.md) ·
  [`101-…`](features/101-accent-gallery-wiring.md) ·
  [`102-…`](features/102-accent-live-verification.md)
- **Outline thickness relabel + Outline color hides itself** — ✅ 2026-07-29, tests → 1164,
  live-verified 7/7 including preserve-on-hide. 🚫 `Corner radius` must NOT be gated (its
  `overflow: hidden` clips the band and stripes with no frame drawn). Replaced feature 95's
  swatch law — see Binding rules. No feature doc.
- **Feature 96 — section-header underline color** — ✅ 2026-07-28, tests → 1158,
  live-verified rail → Postgres → metaobject → real storefront. The tenth colour; a nested
  `var()` chain ending in `currentColor`, so null repaints nothing. ⚠️ Two legs still owed
  (the Banded/Plain hide transitions, and the collapsible `<summary>` shape). ⚠️ Left with
  `#E47272` on `Motorola Moto G45 5G` — the merchant's own choice, deliberately not
  reverted. [`96-…`](features/96-style-section-underline-color.md)
- **Feature 95 — two dead colour swatches hide themselves** — ✅ 2026-07-28, tests → 1147,
  live-verified 10/10. Predicates 7 → 9, riding a new `ColorKnob.visibleWhen`; JSX guards
  still 7. Reverses feature 86 decision 4. [`95-…`](features/95-style-stripe-background-conditional.md)
- **Feature 94 — section gap in the flat block layouts** — ✅ 2026-07-28, tests → 1120,
  live-verified across all three row layouts. 🔴 Root cause: "a `<tr>` takes no margin" was
  true only under `TWO_COLUMN`, and was repeated in three files.
  [`94-…`](features/94-style-section-gap-in-flat-layouts.md)
- **Feature 88 — built-in style preset gallery (Reshell Phase B2)**, four steps 89–92 —
  ✅ COMPLETE 2026-07-27, tests → 1097, live 10/10 + storefront. Six cards at
  `/app/templates/choose-style`, unskippable, create-time only. **No colour column written
  by any card** — the zero-config theme-inherit promise survived a preset pick on real data.
  Follow-up 2026-07-28: each card gained an in-anchor action line (`Use this style →`);
  🚫 a per-card `<button>` was rejected (it would shrink the target ~36×).
  [`88-…`](features/88-style-preset-gallery.md) ·
  [`89-…`](features/89-style-preset-engine-persistence.md) ·
  [`90-…`](features/90-style-preset-card-preview.md) ·
  [`91-…`](features/91-style-preset-gallery-route.md) ·
  [`92-…`](features/92-style-preset-create-flow.md)
- **Feature 87 — plain section header** — ✅ 2026-07-27, tests → 1021, all three live legs
  closed same day. A third `SECTION_HEADER_STYLES` member + a relabel (`TEXT_ONLY`'s label →
  `Underlined`). The cheapest Style-tab unit: no migration, no field, no predicate, no
  Liquid, no `StyleTab.tsx` edit. [`87-…`](features/87-style-plain-section-header.md)
- **Settings-tab copy pass** — ✅ 2026-07-30. `"A specific product"` → `"Selected
  products"`; the "say it twice" pattern swept out of four more surfaces. No feature doc.
- **Feature 86 — Style tab reorganization** (six steps) — ✅ COMPLETE 2026-07-26, tests →
  1012. Six groups → **eight on one axis** (the object being styled), Colors and Typography
  dissolved, every group ending with its own colors. Zero storefront diff by construction.
  Landed before B2 by merchant decision. [`86-…`](features/86-style-tab-reorganization.md)
- **Feature 85 — multi-column row flow** — 🛠️ BUILT & live-verified 2026-07-26, tests → 981,
  ⚠️ **NOT SIGNED OFF** — the feature-70 screen-reader pass it was gated on is still owed
  (Next Up 3–4). `GRID` + `gridMinColumnWidthPx`. Height win measured at −28% on the 44-row
  DJI table, ~half the plan's claim; going below 240 makes it worse.
  [`85-…`](features/85-style-multi-column-row-flow.md)
- **Feature 81 — section header typography & spacing** — ✅ 2026-07-26, tests → 943, fully
  live-verified. Five nullable columns. `headerFontSizePx` is absolute px, not an em keyword
  — the `<summary>` is a **sibling** of the table carrying the font-size var.
  [`81-…`](features/81-style-section-header-typography.md)
- **Feature 80 — section separation + section gap** — ✅ 2026-07-26, tests → 914, fully
  live-verified. `border-block-START`, not `-end`, so the two rules never contest a
  property. ⚠️ The `:not([open])` scope's second justification (the ALL_OPEN default) expired
  on 2026-07-30. [`80-…`](features/80-style-section-separation-and-gap.md)
- **Feature 79 — column divider** — ✅ 2026-07-26, tests → 887, fully live-verified. ⚠️ Its
  one hazard is SOURCE ORDER, not specificity — all three selectors are two classes, so file
  order alone decides. [`79-…`](features/79-style-column-divider.md)
- **Features 77–78 — table width + outer border** — ✅ 2026-07-25, tests → 892 (incl. the
  zero-means-off follow-up). 77 is CSS-only: `align-self: stretch`, not `width: 100%`.
  78 adds five knobs and two presence flags; every integer minimum is 1, never 0.
  [`77-…`](features/77-storefront-container-stretch.md) ·
  [`78-…`](features/78-style-table-width-and-outer-border.md)

### Editor shell & previews (2026-07-22 → 2026-07-25)

- **Feature 76 — collapsible Style / Settings rail** — ✅ 2026-07-25. Collapses to **zero**
  width, never an icon stub. The ONE answer to the Style tab's width problem.
  [`76-…`](features/76-editor-collapsible-style-rail.md)
- **Feature 75 — full-size preview modal** — 🗑️ REMOVED 2026-07-25 (shipped & verified
  earlier the same day), tests 883 → 870. Kept: `SegmentedControl.tsx`. Doc retained as the
  record — feature 76 is built on its root-cause analysis.
  [`75-…`](features/75-editor-preview-fullscreen-modal.md)
- **Feature 74 — content-free tables render nothing** — ✅ 2026-07-23. Two render-time gates,
  hand-mirrored in Liquid and the preview renderer. Rows JSON untouched.
  [`74-…`](features/74-storefront-suppress-contentless-tables.md)
- **Feature 73 — desktop preview inner scroll** — ✅ 2026-07-23.
  [`73-…`](features/73-editor-desktop-preview-inner-scroll.md)
- **Feature 72 — editor device-preview mockups** — ✅ 2026-07-22.
  [`72-…`](features/72-editor-device-preview-mockups.md)
- **Feature 71 — editor sidebar inner-scroll** — ✅ 2026-07-22 (+ scrollbar-gutter follow-up
  2026-07-23). [`71-…`](features/71-editor-sidebar-inner-scroll.md)

### Style tab — Reshell Phase B1 (feature 57, steps 1–12; docs `57-…`–`69-…`)

- **Phase B1 complete 2026-07-20.** The 12 steps built the styling pipe end to end: pure
  domain (`tableStyling.ts`) → pure presentation mapping (`tableStylingCss.ts`) →
  `var(--appx-spec-*, <literal>)` storefront CSS with a byte-exact drift guard →
  `add_table_styling` migration → engine state + Save round-trip → live device previews →
  metaobject `styling_css` emission → the remaining keyword knobs → collapsible sections
  (the only step to change markup) → Colors + Typography → preview-on-open
  (`tabViewMemory.ts`) → Reset-to-theme-defaults + rail a11y.
  ⚠️ Step 11 here is `68-…`; `67-…` is the **withdrawn** "style the grid" step (Binding rules).

### Device previews — Reshell Phase D (feature 49, steps 1–8; docs `49-…`–`56-…`)

- Read-only Desktop / Mobile storefront previews in the editor: toggle swaps the stage (1),
  pure storefront-markup renderer (2), sandboxed iframe (3), shared `spec-table.css` via a
  drift-guarded string copy (4), device-width sizing (5), content-driven auto-height via
  `allow-scripts` + `postMessage` (6), a11y / read-only / empty-state / dynamic-pill (7),
  docs + sign-off (8). **Tablet removed 2026-07-22.**

### Product assignment engine — features 37–48 (merchant-complete)

- Built in order: data foundation + `add-assignment` migration (37) → pure overlap resolver
  (38) → cross-dimension existence probe, fails closed, injection-safe (39) → routing
  projection + `add-routing` migration (40) → shop routing metafield writer + TOML (41) →
  activation pipeline + DRAFT→ACTIVE dry-run gate on both status surfaces (42) → storefront
  resolution in `spec-table-resolve.liquid` (43) → scope-picker UI + conflict banner (44) →
  EXCLUDE carve-outs (45) → multi-value scopes, server (46) then UI (47) → templates-list
  assigned-product count, batched + fail-soft (48). Docs `37-…`–`48-…`.
  ⚠️ 48's live-render on the dev store is still pending.

Design lock (2026-07-07, `data-model.md` §9): **rigid block-on-conflict**, one scope KIND per
template, no `priority`; broad rules via one shop-level routing metafield resolved in Liquid
by handle. Multi-value applies to PRODUCT + COLLECTION only. No migrations needed for 45–48.
⚠️ 43's resolution order was 3-tier at the time; the per-product override tier was removed
2026-08-04 and per-product entries moved to shards 2026-08-05 — `data-model.md` §9 is current.

### Storefront (features 34–35)

- 34 (`34-…`): Theme App Extension first pixel — `extensions/product-specs-table/`,
  declarative TOML metaobject + `metaobject_reference` product metafield (both
  `public_read`), semantic `<table>`.
- 35 (`35-…`): value-part resolution — `spec-table-value.liquid` resolves
  `SHOPIFY_FIELD` / `METAFIELD` / `TEXT` / `LINE_BREAK`; whole-cell `hideWhenEmpty`;
  50-row chunking.

### Editor build — 13-step order + Step 9.5 (features 02–15)

- Built in order (docs `02-…`–`15-…`): rows reducer + 200-row cap (1) → segmented value cell
  + toolbar (2) → harden 1–2 (3) → contenteditable value surface + linear caret (4) →
  Insert-field modal shell + caret save/restore (5) → native Shopify fields list (6) → modal
  search/filter (7) → product metafield definitions, shop-isolated (8) → selectable metafield
  section (9) → **Save → Postgres → metaobject sync → read-back, with server-authoritative
  key finalization** (9.5) → mouse drag reorder via `@dnd-kit` (10) → keyboard reorder + a11y
  (11) → parse pasted clipboard tables (12) → bulk-insert rows from paste (13).
  ⚠️ Steps 4/6's contenteditable + pill machinery was **retired** by features 109–114.

### Reshell to the mockup — Phase A (features 16–18)

- A2 (`16-…`): presentational `EditorShell` chrome (segmented tabs + device toggle + sidebar
  slots).
- A3 (`17-…`): bounded inner-scroll — only the rows list scrolls (`useScrollRegionHeight` +
  sticky header).
- A1 (`18-…`): extracted `useRowEngine` + presentational
  `ContentTab`/`RowGrid`/`RowActionsToolbar`/`InsertFieldModal`; `SpecTableEditor` now a thin
  wrapper. Behavior-preserving. **Closes Phase A.**

### Template lifecycle + templates-list (features 19–28 + trims)

- Create-on-first-save (`19-…`): "Create template" opens the editor seeded with a starter
  scaffold; Postgres row created on first Save.
- Lifecycle actions (`20-…`): header ⋯ Rename/Duplicate/Delete + status badge;
  `duplicate`/`delete` server fns; metaobject deleted before Postgres.
- Paste refinements 1–4 (`21-…`–`24-…`): content-first intent, insert-after-active,
  replace-pristine-scaffold, confirm-before-cap.
- List polish (`25-…`–`28-…`): 2-line name clamp, per-row ⋯ menu, immediate Rename,
  client-side status filter (`templateFilter.ts` + `shouldRevalidate`).
- Name cap raised 100 → 255 (internal-only, not synced to storefront).
- Duplicate in-flight feedback (App Bridge global loading), shared-fetcher `busy` race gate,
  SaveBar-hide before Delete redirect.

### Editor bulk delete (`29-…`, `33-…`)

- Per-row select checkbox + contextual bulk bar + count-gated confirm modal; pure
  `DELETE_ROWS`; tristate "select all" header checkbox; selected-row highlight.
- Undo toast (`33-…`): pure `RESTORE_ROWS` restores the exact pre-delete snapshot; 10s
  "Undo"; `savingRef` guard so Undo can't mutate during a save.

### Keyboard cell navigation (`30-…`–`32-…`)

- Pure vertical-nav resolver `gridNav.ts` → keyboard/DOM wiring `useGridKeyboardNav.ts`
  (`Ctrl/Cmd + Arrow`) → manual-advance editor tips footer (WCAG-safe, no auto-rotate).

### Template status change (`36-…`)

- Status (DRAFT/ACTIVE/ARCHIVED) changeable from two surfaces (list ⋯ modal + editor Settings
  tab); both re-sync the storefront metaobject. Shared `validateTemplateStatus`,
  `setTemplateStatusForShop`, extracted `templateSync.server.ts`.

### MVP UI trims (2026-07-11/12, UI-only projections)

- Scope picker offers only No products / All products / A specific product
  (`HIDDEN_SCOPE_KINDS` + `VISIBLE_SCOPE_OPTIONS`; full source of truth unchanged).
- Status picker + list filter offer only Draft / Active (`HIDDEN_STATUS_VALUES`,
  `STATUS_FILTER_OPTIONS`); `ARCHIVED` re-enable is a one-line removal; badge tone kept.
- Editor page width → `inlineSize="large"` to match the templates list.

### Foundation

- Shopify app template (React Router / TS) + PostgreSQL (Neon) + Prisma; app installed on
  the dev store; session + shop record in Neon.
- Shop-scoped `app/models/template.server.ts` (`shopId` in every where/data);
  `/app/templates` read-only list; single dynamic editor route `app.templates_.$id`.

### Testing & tooling

- Phase 1 unit tests (Vitest, standalone `vitest.config.ts`); Phase 2 shop-isolation tests
  (mocked Prisma).
- CI gate (`.github/workflows/ci.yml`: typecheck → lint → format:check → test → build),
  Dependabot, `context/app-store-review-checklist.md`.
- Dependency security pass (`npm audit` → 0); CodeRabbit review fixes (shop-scoped writes,
  `:focus-visible` ring, `updateMany`→`update`).

---

## Next Up

1. 🔴 **Production `application_url` + `redirect_urls`, then re-deploy** — the App Store
   blocker. See Current Goal item 1 and `app-store-review-checklist.md` §3.
2. 🔴 **Billing (Shopify App Pricing) — slice 1 (gate) built 2026-08-20; slice 2 + Dashboard pending.**
   The root-loader gate is coded + gate-green (Recently Shipped). Remaining: (a) operator creates the
   4 plans in the Partner Dashboard + sets `SHOPIFY_APP_HANDLE`; (b) **slice 2** — assigned-product
   cap enforcement at assignment time + an in-app "Manage plan" link (App Store req 1.2.3). See
   Current Goal item 2 and `prd.md` §Pricing.
3. **Step 107 Unit B — the onboarding dashboard** (`admin-screen-plan.md` §Screen 1). Where
   `/app` gets its real content: three states, the four-step checklist, and — the one that
   matters for the App Store theme-extension requirement — **the theme-editor deep link**.
   The extension is an app **block**, so an ACTIVE, assigned, perfectly authored template
   renders **nothing, silently** until the merchant adds it by hand; that is the app's worst
   failure mode and Unit A deliberately left it unsaid rather than say it without the link.
   **No migration needed** — `Shop.onboardingStatus`, `isAppBlockActive` and
   `appBlockLastCheckedAt` have existed since the init migration and have zero references in
   application code. 🔴 **Checklist step 3 is blocked on OQ-107-B**; the other three are not.
   📌 Also carries step 107 **Finding L1**: `/app/additional` (and any stale `/app/*` URL)
   renders a bare, unstyled 404 with no app nav, because an unmatched URL never reaches
   `app.tsx`'s `ErrorBoundary`. The fix is an `/app/*` splat rendering inside the app shell —
   an addition, which is why Unit A left it.
4. **Storefront table semantics in stacked layouts (feature 70)** — code shipped
   2026-07-20 (`f6ac4aa`); the **screen-reader pass is still owed** (see Open Questions).
   ⚠️ Blocking feature 85 sign-off — GRID is the third `display`-departure riding on the same
   unverified ARIA chain. Run the pass before building a fourth.
5. **Feature 85 sign-off — one blocker left.** Built and fully live-verified, deliberately
   NOT marked shipped: its stated blocker is item 4, skipped at the merchant's instruction.
   ⚠️ If the roles are wrong, feature 70's own instruction is **revert, do not patch**, which
   now costs three consumers. Also decide whether to clear the DJI template's saved minimum
   of 400 — **240 measured 511px shorter** on that table.
6. **Feature 93 §Open question 2 — the dark-theme decision.** Step 102 measured it: the
   accent title fails at **1.21–2.35** and the stripe at **1.02–1.07** (text vanishes) on a
   dark ground. Banded presets are safe (6.98–13.15). The response is a palette-or-scope
   call that belongs to the merchant; 🚫 not contrast-checking code (Binding rules).
   🔴 **It must not be closed by silence.**
7. **Section band radius / chevron position / animated open-close (proposed 82 / 83 / 84).**
   The rest of the merchant report feature 81 answered; each is its own unit for a recorded
   reason (see "Deliberately out of scope" in `81-…`). 🚫 Not the JS `grid-template-rows`
   trick — that breaks the zero-JS `<details>` invariant.
8. **Editor page should not scroll at the document level** — the app document overflows the
   iframe by roughly the `.tipsFooter` height (it renders BELOW the card, outside
   `useScrollRegionHeight`'s flat `BOTTOM_PAD_REM = 3` budget), producing a stray outer
   scrollbar beside admin's reserved 16px gutter. Fix = measure the actual footer/card
   bottom. Touches the measurer both scrollers share, so it is its own unit.
9. **Templates-list Phase 2** — ✅ **server-side pagination shipped 2026-08-04** (see
   Recently Shipped). What remains here is **search / sort** (server-side, same loader +
   URL-param plumbing) and **multi-select bulk actions**. The read is no longer unbounded.
   🔴 Note the pagination change **reversed feature 28** (client status filter → server
   WHERE): a client filter over a paginated read only filters the current page, so status
   filtering had to move back onto the query. `filterTemplatesByStatus` + its tests were
   deleted; `normalizeStatusFilter`/`STATUS_FILTER_OPTIONS` stay (they normalize the
   `?status=` URL param the loader reads). Search/sort should extend the same
   `listTemplateSummariesForDomain({status, page, pageSize})` options object, not add a
   parallel read path.
10. **Reshell Phase C** (Settings display rules) → **E** (assignment into the reshell) →
   **F** (top-bar status/save + cleanup).

**Deferred:** editor bulk-delete range-select (Shift+click) + Delete/Backspace shortcut;
per-product overflow materialization + a bulk apply-to-all styling route.

---

## Step 3 Follow-ups (tracked)

- **[Later, low priority] `insertActive` optimism at the cap.** `insertActive` sets
  `scrollTargetRef`/`activeRowId` before the reducer runs; at the cap the reducer no-ops, so
  they can point at a never-added row. Unreachable today (buttons disabled at cap); guard on
  `!atCap` if a future keyboard/programmatic add bypasses the disabled button.

---

## Open Questions

- 🆕 **OQ-109-E — does the app get a separate dev config, or stay one app?** (raised
  2026-08-08.) `automatically_update_urls_on_dev = true` means every `shopify app dev` run
  rewrites `application_url` — which will clobber the production URL the moment it is set.
  Shopify's documented practice is two apps / two TOMLs (`config use`). **Blocks the
  production deploy**; full framing + recommendation in
  [`launch-support-checklist.md`](launch-support-checklist.md) Phase 1.
- 🆕 **OQ-109-F — demo store: wait for the production DB, or build now and rebuild?**
  (raised 2026-08-08.) 🔴 A spec table lives in **two** places — the template row in Postgres
  (source of truth) and the `$app:appx_spec_table` metaobject (delivery, owned by `client_id`
  and durable). Building demo templates against the **dev** database before a separate
  production DB exists (checklist Phase 2.2) orphans them: the storefront keeps rendering
  tables the app can no longer edit. Trade-off is dogfooding-feedback-now vs. rebuild-by-hand.
  Checklist **D5**.
- 🆕 **OQ-109-G — demo store niche and brand.** (raised 2026-08-08.) 🔴 The demo store is
  **publicly linked from the App Store listing**, so it must use a **fictional** brand and
  imagery held under licence — `appx-dev`'s real DJI products and photography cannot be
  reused there. Checklist **D1**.
- **OQ-109-B — where do the help docs live?** Proposed: static site in-repo at
  `hiappx.com/docs`. Confirm before Phase 4.
- **OQ-109-C — pursue Built for Shopify?** The badge carries a 30-minute first-response SLA
  for critical requests (outages + security reports only) and a p95 < 500 ms bar. Not a
  launch blocker; decide consciously. Checklist Phase 7.4.
- **OQ-109-D — does the early-bird free window need a support-volume cap?** Free-for-3-months
  generates support load at zero revenue. Checklist Phase 6 (in-app deflection) is the
  mitigation; revisit if the install rate outpaces reply capacity.
- ✅ **OQ-109-A — support domain + inbox — RESOLVED 2026-08-08.** `hiappx.com` +
  `support@hiappx.com` (Zoho free). 🔴 The one durable constraint: Zoho free is **web/mobile
  only — no IMAP/SMTP**, so app-generated transactional email needs a separate sender, whose
  SPF `include:` must be **merged into** the single existing SPF record.
- 🔴 **OQ-107-A — which access scopes does the app actually need?** (raised 2026-08-03 by
  step 107.) With `app._index.tsx`'s demo action deleted, **no product write remains
  anywhere in the app** — the entire Admin API surface is five reads
  (`metafieldDefinitions`, the `products(first:1, query:)` conflict probe,
  `AssignedProductCounts`, `ScopeResourceDetails` `nodes(ids:)`, `ShopId`) plus two writes
  (`metafieldsSet` for the shop `$app:routing` metafield, and
  `metaobjectUpsert`/`metaobjectDelete`). So `write_products` is **plausibly** wider than
  needed, and `write_metaobject_definitions` **plausibly** dead now that definitions are
  declarative TOML and the runtime `metaobjectDefinitionCreate` is gone (§Key Decisions
  "App-owned definitions are declarative TOML"). ⚠️ **Plausibly is not verified**, and two
  unchecked things could make the wider scopes correct: what `metafieldsSet` requires for a
  **Shop**-owner metafield, and ~~whether deploying the declarative
  `[product.metafields.app.spec_table]` definition needs `write_products` at deploy time~~
  — ✅ **the second is MOOT since 2026-08-04**: that definition was deleted, so no product-
  owner definition is deployed at all and `write_products` has one fewer possible
  justification. The Shop-metafield question is the only one left standing.
  🚫 **Not changed in step 107** (D4) — a config change with its own blast radius does not
  belong in a unit whose value is being obviously safe; same precedent as step 106 D5
  refusing to touch `api_version`. Why it matters now: `app-store-review-checklist.md` §8
  requires that only scopes actually used are requested, and **narrowing a scope after
  launch is a re-consent event across every installed shop** — cheap now, expensive later.
  Settle it before the production-host deploy, since that deploy is already carrying the
  step-107 TOML edit.
- 🔴 **OQ-107-B — Screen 1's checklist step 3 points at a model proposed for deletion.**
  (raised 2026-08-03 by step 107; blocks Unit B.) `admin-screen-plan.md` §Screen 1 marks
  "Assign the template to a product" complete when a `ProductAssignmentIndex` row has
  `status = APPLIED`. **OQ-103-D** records that `ProductAssignmentIndex` has **zero
  references in application code** — the 2026-07-07 shop-level routing redesign removed the
  need to materialize per-product overrides — and proposes dropping the table and its four
  indexes. Both cannot be right. The likely resolution is that the signal should key off
  `ProductAssignment` (the live model) instead, but that is a decision about the onboarding
  spec, not a rename: it also decides whether OQ-103-D's migration is free to proceed.
  🔴 **Unit B is blocked on this for checklist step 3 only** — the other three steps
  (`onboardingStatus` advance, `Template` count ≥ 1, `Shop.isAppBlockActive`) are
  unaffected and are all schema-backed since the init migration. The `admin-screen-plan.md`
  row now carries a blocked marker so Unit B cannot build from it by accident.
- ✅ **OQ-103-A — webhook retry burst vs. the Neon connection pool — RESOLVED 2026-08-03 (low risk).** Three compounding grounds: the runtime string is the **transaction-mode pooler**, the webhook handlers are tiny idempotent 1–2-query writes, and 🔴 **hosting is a single long-running server** (merchant decision), so Prisma keeps ONE bounded pool — the serverless per-instance fan-out that would have needed `connection_limit=1` does not apply. See [[hosting-single-long-running-server]] and [[neon-cold-start-prisma-connect-timeout]].
  📌 **One before-production follow-up, low urgency:** `pooler_mode` is *transaction* and the app uses plain Prisma-over-TCP, which can hit `prepared statement "s0" already exists` under concurrency. Not observed. Before real traffic, add **`pgbouncer=true`** to the pooled `DATABASE_URL` or move to the **`@prisma/adapter-neon`** driver adapter. Folds into the production-host deploy (Next Up item 1).
- ✅ **OQ-103-B — unchunked `nodes(ids:)` past the 250-id cap — CLOSED 2026-08-01** by chunking (`NODES_MAX_IDS = 250`, per-chunk fail-soft). Stub kept because `data-model.md` §13 F4 points here.
- **OQ-103-C — the activation gate's probe count is O(pairs) and sequential, not O(rules).**
  (raised 2026-08-01 by step 103, finding F5; `data-model.md` §13 R6.) §Key Decisions
  "Assignment model" claims "O(rules) Postgres set-algebra + `products(query,first:1)`
  existence tests, never a catalog scan". Two of three parts hold — the Postgres side is
  ≤4 queries and no probe ever scans the catalog. But `assignmentActivation.server.ts:191`
  loops candidate selectors and `assignmentConflict.server.ts:178` `await`s one probe per
  NEEDS_CHECK pair **inside** it, so a 200-product candidate against one VENDOR template
  issues **200 sequential** Admin round-trips before the merchant learns whether Activate
  worked. ⚠️ **The Key Decisions line has not been edited** — 103 records discrepancies,
  it does not fix them, and whether the right response is to correct the claim or to
  parallelize the probes is the open part. Note the fail-closed bias (`:199`) makes any
  timeout a **block**, so this is a correctness-adjacent latency question, not only a
  speed one.
- **OQ-103-D — six indexes and one whole model serve no catalogued read.**
  (raised 2026-08-01 by step 103, finding F6; `data-model.md` §13 §Index → read mapping.)
  `ProductAssignmentIndex` has **zero references in application code** — the 2026-07-07
  shop-routing redesign removed the need to materialize per-product overrides — so its
  four indexes and the table itself are dead weight. Plus `Shop @@index([isInstalled])`
  (no query selects shops by install state), the `scopeValue` component of
  `ProductAssignment @@index([shopId, scope, scopeValue])`, and `Template @@index([shopId])`
  (redundant with the `@@unique` whose leading column is the same). ⚠️ Dropping any of
  them is a **migration**. ✅ **The §9 half of the blocker cleared 2026-08-04**: §9 and
  `schema.prisma` now both mark `ProductAssignmentIndex` **dormant** — its one populated
  case was the per-product override metafield, which no longer exists, so the design
  question "is this model live?" is answered *no*. What remains is purely the migration
  call (and note `shop/redact` still deletes from the table, step 105, so a drop touches
  that path too). Still blocked on **OQ-107-B**, which has onboarding checklist step 3
  keying off an `APPLIED` row that can now never be written. See
  also the vestigial `Shop.metaobjectDefinitionGid` (§10), already deferred as "a later
  cleanup" — these want to land as one migration, not four.
- **Can `TWO_COLUMN` express a section gap via `border-collapse: separate`?** (raised
  2026-07-28 while speccing feature 94 — the one option nobody has costed.) The existing
  in-repo rejection at `stylingControls.ts:463` rules out a transparent
  `border-block-start` on the section `th` because collapsed-border width resolution eats
  the previous row's 1px divider — sound, but it assumes `border-collapse: collapse`, which
  `spec-table.css:151` sets unconditionally. Under `separate` there is no shared edge to
  contest, so a transparent top border plus `background-clip: padding-box` would open a
  real gap with the band intact; scoping it to
  `.appx-spec-table--section-gap.appx-spec-table--layout-two-column` means **no existing
  table changes border model**, so the no-repaint law survives. Deliberately NOT in
  feature 94: switching border models re-resolves every row divider, the column rule and
  feature 78's outer border at once (a different system boundary, and feature 86's lesson
  was not to bundle them), and it needs a real `.harness/` matrix first —
  `border-spacing: 0`, the `LINES` rule on a section's last row, the label/value seam, and
  the outer border, across all three header styles. Feature 94 ships `STACKED` + `GRID`
  without it; this decides whether the default layout ever gets the knob.
- **Collapsible section titles do not inherit the table's typography** (found 2026-07-26
  while speccing feature 81; pre-existing since Step 9a). `--appx-spec-font-size` /
  `-font-style` / `-line-height` are declared on `.appx-spec-table__table`
  (`spec-table.css:141–143`), and the collapsible shape is
  `<details><summary>…</summary><table>…</table></details>` — the summary is a **sibling** of
  the table, not a descendant. So Text size = Large grows flat section titles and leaves
  collapsible ones untouched. Closing it means adding the three vars to the summary rule,
  which repaints every live collapsible table with a non-null `fontSize` — a no-repaint-law
  decision of its own, not a rider on 81. (Feature 81 is unaffected either way:
  `headerFontSizePx` is absolute px on the summary's own rule, which is precisely _why_ it is
  px and not an em-scale keyword.)
- 🔴 **Stacked-mode `<table>` semantics — screen-reader pass NOT run (feature 70).**
  `rowLayout=STACKED` and the mobile stacked layout apply `display: block`, dropping implicit
  table semantics. Code shipped 2026-07-20 (`f6ac4aa`): a static unconditional ARIA role chain
  (`role="table"/"row"/"cell"`) in both hand-mirrored markup sites, plus
  `specTableAriaContract.test.ts` which parses `spec-table.css` for `display: block` rules and
  fails if any such class lacks a role. Attributes are present and inert live (zero visual
  change by construction). **Done-when #4 of `70-…` is unmet:** no assistive tech has confirmed
  the pairs are announced, and the spec's **falsifier** is unchecked — explicit ARIA can
  _suppress_ native table affordances, so the two-column control case must be compared
  before/after. Needs NVDA or VoiceOver at desktop **and** ≤749px. **If it regresses, revert
  (`<dl>` back on the table) — do not patch.** One data point in its favour: Chrome's
  accessibility tree under `display: grid` still exposes table/rowgroup/row/rowheader/cell on
  the live storefront — not the same as a screen reader ANNOUNCING the pairs.
- **R3 — orphan titled sections (feature 74, deferred).** A section header with a REAL label
  whose rows are all hidden still renders as a lone titled band. Authored content, so it was
  deliberately left alone: suppressing it would contradict the locked Step 9a decision
  (`spec_table.liquid`: "a section whose rows are all hidden renders as an empty
  collapsible — no new emptiness logic"). Belongs with the Phase C display rules below.
  A test in `specTablePreviewHtml.test.ts` currently pins the render-it behavior.
- **Should activation warn on a content-free template?** Since feature 74 a merchant can set
  an empty template ACTIVE and assign it, and it renders nothing, silently. A DRAFT→ACTIVE
  advisory would be friendlier, but today's activation gate is a hard _block_ mechanism for
  conflicts; adding a soft warning lane is its own unit.
- **Settings-tab "Display rules"** (mockup's `hide rows with empty values` / `show section
  dividers` / `show on mobile`) are dummy — each needs a real definition + reconciliation with
  the per-row `hideWhenEmpty` flag before building (Phase C).
- **Style tab B3 build-time details to lock:** save-as-preset overwrite UX + copy; whether the
  creation gallery ever gets a "don't show again" escape (today it is deliberately
  unskippable); the `density` padding-scale values.
- **Top-bar name-edit affordance:** inline title edit vs a Rename ⋯ item — settle when the top
  bar (Phase F) is built.
- Best storefront event strategy for selected-variant changes across themes.
- **Owed from step 103:** the read-pattern catalog's row-by-row review must be run by a
  session that did not write the catalog.

---

## Key Decisions (still load-bearing)

> Decisions that still constrain future work. Historical/superseded logs were removed in
> compaction — see git history for the originals.

- **Custom React editor — no AG Grid** (2-column, ≤200 rows, `valueParts` token editor). DnD via `@dnd-kit`. Value surface is a native `<textarea>` editing a `{% … %}` text string via the `valueText.ts` codec (features 109–114); Insert-field is **pick-then-insert, create-only** (modal splices a token at the caret). Row cap is the single shared `MAX_TEMPLATE_ROWS` (UI + server). ⟨Superseded 2026-08-07: the former `contenteditable` + inline-pill + edit-pill + linear-caret model is retired — see `data-model.md` §7 "Editor value surface".⟩
- **Value model:** `LINE_BREAK` value part for hard breaks (no inline rich formatting/links in MVP). `hideWhenEmpty` is whole-row, never per-line.
- **View toggle:** Edit is the only editable segment; Desktop/Mobile are **read-only storefront previews** (Phase D), no separate WYSIWYG panel. **Tablet removed 2026-07-22.** **Shared preview device (2026-07-22):** the chosen device (Desktop/Mobile) is one value shared across all three tabs; edit-vs-preview is per-tab (`tabViewMemory.ts` `ViewMemory = { device, modes }`) — Content opens on the grid, Style/Settings auto-open a preview, picking a device on any tab moves every _previewing_ tab to it; dropping a tab to Edit affects only that tab and retains the shared device. **Collapsible rail (2026-07-25, feature 76) is the ONE answer to the width problem:** because the inline Desktop preview is narrower than the storefront's 749px breakpoint on a laptop, a toggle beside the tab group collapses the Style/Settings rail to zero width, handing the stage the full card (never an icon stub: the tight case clears 749 by only 18px). ONE boolean shared by Style and Settings, in-memory, resets on reload; hidden not unmounted so the rail's scroll position survives; absent on Content. A **full-size preview modal** (feature 75) shipped as a second answer the same day and was **REMOVED 2026-07-25**. Under ~1420px the Style tab still cannot show a truthful desktop table and the knobs simultaneously; the only fix for that is a fixed-1100px `transform: scale()` preview, which is deliberately NOT built and is NOT a re-added modal (see `76-…`).
- **Color policy:** the app _uses_ color via CSS variables as one source of truth (admin mirrors Polaris; storefront inherits theme but is merchant-overridable). The "no hardcoded hex literal" rule is CSS hygiene — use Polaris tokens / `currentColor` / custom properties (e.g. runtime-captured `--appx-token-color` for the pill blue). This rule does **not** encode the Edit-grid-never-styled binding rule (see Binding rules above).
- **Save/status model (mockup):** App Bridge contextual SaveBar (Save/Discard) + header status dropdown + ⋯ menu; no separate "Save as draft". Save freezes the editor (`inert`) in-flight; baseline reset uses the **submitted** snapshot (data-safety race fix). ⚠️ The Save button is a **native** `<button>` — see the React 18 boolean-attribute rule in Binding rules.
- **Persistence/keys:** key finalization is **server-authoritative** ("is this row id already persisted?"), never re-derived. Metaobject is **app-reserved** (`$app:appx_spec_table`); deleted _before_ Postgres on delete so a storefront-readable entry can't outlive its template.
- **App-owned definitions are declarative TOML** (slice 1): the `$app:appx_spec_table` metaobject and the `$app:spec_table` product `metaobject_reference` are declared in `shopify.app.toml`, distributed on deploy/install. Runtime `metaobjectDefinitionCreate` removed; `Shop.metaobjectDefinitionGid` vestigial. Metaobject _entries_ are still written at runtime via `metaobjectUpsert`.
- **Assignment model — rigid block-on-conflict + shop-level routing (2026-07-07, `data-model.md` §5/§9).** One scope per template (`scope`+`scopeValue`+`mode`); overlaps between ACTIVE templates are **blocked at DRAFT→ACTIVE** (merchant decides — no silent precedence, no priority knob; `priority` column dormant). Overlap check is O(rules) Postgres set-algebra + `products(query,first:1)` existence tests, never a catalog scan. ⚠️ **The probe half of that claim is half-falsified — see OQ-103-C.** Broad rules deliver as O(1) entries in one `[shop.metafields.app.routing]` json metafield (wire v3), resolved in Liquid via `metaobjects["$app:appx_spec_table"][handle]`; per-product entries and EXCLUDE carve-outs live in 1024 `$app:appx_routing_shard` metaobjects (feature 108). 🚫 The per-product override metafield was deleted 2026-08-04. `ProductAssignmentIndex` is dormant and, per OQ-103-D, unreferenced.
- **Style tab design (2026-07-18 — `admin-screen-plan.md` §Tab 2, `data-model.md` §5/§10, PRD, code-standards).** One spec-table primitive with **orthogonal style knobs** (row layout, mobile behavior, section headers, collapsible sections via native `<details>` zero-JS, row dividers incl. zebra `stripeBgColor`, density). Modal/drawer containers rejected. **Presets = COPY semantics** (built-ins as code constants; phase-2 merchant-saved `StylePreset`) copy values into per-template `TableStyling` **real columns**, not `extraStyles`; `basedOnPreset` is provenance only. **No shop-level default styling record** (copy keeps edits side-effect-free on live storefronts). Storefront delivery via the metaobject `styling` json field: layout knobs → wrapper modifier classes, colors/typography → CSS variables. **Typography:** `fontSize` = S/M/L theme-relative presets or bounded Custom px (10–184, clamped; JSON number on the wire, digit-string in the DB); `lineHeight` (TIGHT/NORMAL/LOOSE) + `labelCase` (DEFAULT/UPPERCASE, labels only) + `fontStyle` kept; font-family/letter-spacing/wrap/per-side padding rejected.
- **Scale ceilings (steps 103–104, `data-model.md` §13/§14).** The 128KB `json` metafield **write** limit applies — the app is **NOT grandfathered** (first commit 2026-06-09, first `type = "json"` 2026-07-02, both after the 2026-04-01 cutoff). It is dormant **only** because the runtime Admin client is pinned to `ApiVersion.January26` (2026-01, pre-2026-04); `app/shopify.server.test.ts` is a tripwire that fails on a bump to 2026-04+. Capacity (current, after Option 1 compaction + Option 2 sharding): the shop wire is broad-only — **9,354** `byCollection` entries, `byType`/`byVendor` count-bounded; `byProduct`/`excluded` moved to 1024 shards, each with its own 128KB budget, so per-product capacity is `N × 128KB`. (Pre-Option-1 figures were 3,446 excludes / 1,745 `byProduct` / 1,769 `byCollection` in one shared budget.) 🚫 Step 104 measures and warns — it does **not** block; refusing / truncating / surfacing a merchant error is a future decision. ⚠️ `Metafield.sizeInBytes` is unstable-only; measurement is app-side and pre-write.
- **Testing strategy:** Vitest; Phases 1–2 done (unit + shop-isolation, mocked Prisma); reach Phase 4 (route loaders/actions + GDPR webhooks) before App Store submission, E2E (Playwright) fast-follow. Polaris web components don't render in jsdom → editor UI is browser-verified, pure logic unit-tested. ⚠️ **One narrow jsdom carve-out (2026-08-04):** framework-free DOM *glue* (`app/utils/valueDom.ts`) IS jsdom-tested — the file opts in with `// @vitest-environment jsdom` on line 1; the runner default stays `node`, so there is no second project. Component tests remain excluded, as does contenteditable *editing behaviour* — encode that as a fixture and assert our reading of it (`code-standards.md` → Testing). 🔴 **A mocked Prisma cannot enforce a `WHERE` clause** (step 105 M2) — it returns what it was told regardless of the query, so a test named for a query condition can pass while the condition is deleted. Assert the exact `where`, and say which half is which. ⚠️ **The pointer to a fuller doc was DROPPED 2026-08-01:** it cited a plans file that no longer exists and could not be restored. This entry is the whole record of the testing strategy; if the phases need more detail, write it here or in a `context/` file, not in an untracked plans directory outside the repo.
- **Embedded-app verification:** the editor is a cross-origin iframe (top frame can't read its DOM/AOM/console); verify via Claude-in-Chrome on the `shopify app dev` preview + direct Postgres/Neon checks. Polaris CDN-build gotchas → `polaris-web-component-gotchas` memory. Admin GraphQL runtime is **2026-01** (`ApiVersion.January26`) — validate against that. The TOML `webhooks.api_version` (`shopify.app.toml:12`) now also reads **2026-01**, reconciling the old 2026-07/2025-10 split (2026-08-15); the runtime is held one release below the 2026-04 json-write ceiling on purpose ([[admin-api-version-mismatch]]).
