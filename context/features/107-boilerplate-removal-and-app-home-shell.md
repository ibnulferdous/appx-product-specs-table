# Step 107 — boilerplate removal + the app-home shell

**Status:** ✅ **COMPLETE 2026-08-03. Gate 10 of 10.** Code, tests, config and
docs are done, the full gate (typecheck · lint · format:check · test · build) is
green, and all seven live checks ran on `appx-dev` with **Postgres identical
before and after**. One finding: **L1**, `/app/additional` renders a bare 404
rather than the app's error boundary — the spec anticipated this possibility and
it is recorded, not fixed (see §Live verification).

**Result vs prediction:** tests **1353 / 51 → 1361 / 52**. The delta is **+8, +1,
exactly as predicted** — the "→ 1360" written below is an arithmetic slip in this
doc (1353 + 8 = 1361), not an overshoot in the build. **6 of 6 mutations matched
their predicted guards.**

**Baseline, measured on a clean tree at `1109e32` immediately before planning:**
**1353 tests / 51 files**, `git status --porcelain` empty. This is the number
every delta in this file is against. (It matches step 106's exit count, which is
the confirmation that nothing has landed since.)

**Parent feature:** pre-submission cleanup. The Shopify React Router template
ships four demo surfaces that were never removed; one of them writes to the
merchant's live catalog.

**Position:** **Unit A of two.** Unit A is subtraction plus the smallest honest
`/app`. **Unit B is the onboarding dashboard** (`admin-screen-plan.md` §Screen 1)
and is where `/app` gets its real content. The cut is deliberate — see D2.

**Depends on:** nothing. This step removes code; it adds no capability.

**Migration:** **none.** 📌 And the notable part is that Unit B needs none
either — `Shop.onboardingStatus`, `Shop.isAppBlockActive` and
`appBlockLastCheckedAt` have existed since the **init** migration
(`20260609052534_init/migration.sql:43–45`) and have **zero references in
application code**. Screen 1 is specced *and* schema-backed; it has simply never
been built. So [[prisma-migration-stale-dev-server]] does not apply to either
unit.

**Merchant-visible:** **yes, three surfaces.** `/app` changes completely,
`/app/additional` disappears, and the public (non-embedded) splash at `/` loses
its `[your app]` placeholder copy.

---

## Why this is not just tidying

🔴 **`app/routes/app._index.tsx` writes to the merchant's live catalog from a
button on the app's home page.** Its `action` runs `productCreate` (a
`{Red|Orange|Yellow|Green} Snowboard` carrying an `$app:demo_info` metafield),
then `productVariantsBulkUpdate` to price it at `100.00`, then `metaobjectUpsert`
to plant a `demo-entry` metaobject. On a development store that is noise. On a
live store it is **merchant data pollution triggered by the first button a
merchant sees**, which puts it under `CLAUDE.md` priority #1, not priority #4.

Everything else in this step is genuine tidying. That one item is not, and it is
why the unit is worth running before Billing rather than after.

---

## Decisions locked before writing code

### D1 · Home stays. `/app` is not a redirect to `/app/templates`

**Merchant decision 2026-08-03**, after the alternative (drop Home from the nav,
let onboarding live as an empty state on the templates list) was put beside it.

The reason it is the right call is in the extension's own schema.
`extensions/product-specs-table/blocks/spec_table.liquid` declares
`"target": "section"` — an app **block**, not an app **embed**. A merchant must
open the theme editor and add it to the product template by hand. Until they do,
a perfectly authored, ACTIVE, assigned template renders **nothing**, and it does
so **silently**. That is the app's single worst failure mode and it needs a
permanent surface.

🚫 **An empty state on the templates list cannot be that surface** — it vanishes
the moment one template exists, which is *before* the merchant has any reason to
have touched the theme editor. The warning has to outlive the empty state.

📌 This is also what `admin-screen-plan.md` §Screen 1 has specified all along:
`/app` is the Dashboard, with three states and a four-step checklist whose step 4
is "Add the app block to your theme".

### D2 · This step builds the **shell**, not the dashboard

Screen 1's three states, the four-step checklist, the completion signals and the
stat-card row are **all Unit B**. This step ships the smallest `/app` that is
honest: no demo mutation, no 404, one real path forward.

Two reasons, and the second is the load-bearing one:

1. Designing home now and again in Unit B is designing it twice.
2. 🔴 **Screen 1's completion signals need decisions this step must not make.**
   Signal 3 keys off `ProductAssignmentIndex` rows with `status = APPLIED` — and
   **OQ-103-D** records that `ProductAssignmentIndex` has *zero references in
   application code* and proposes deleting the model outright. The spec and the
   schema-cleanup proposal contradict each other. Unit B cannot build checklist
   step 3 until that is resolved; Unit A must not resolve it by accident. Raised
   as **OQ-107-B** below.

### D3 · No `Shop.onboardingStatus` read or write in this step

The three columns stay at their defaults. Writing `IN_PROGRESS` from the shell
would half-implement a four-state machine whose other transitions
(`COMPLETED`, `DISMISSED`) live in Unit B, and a half-written state machine in
the database is worse than an unwritten one — the defaults are recoverable, a
wrong `DISMISSED` is not.

### D4 · `access_scopes` is **NOT** edited in this step

The finding is recorded, not acted on. With `app._index.tsx`'s action gone, the
app's **entire** Admin API surface is:

| Operation | File | Kind |
| --- | --- | --- |
| `metafieldDefinitions(ownerType: PRODUCT)` | `metafieldDefinitions.server.ts:45` | read |
| `products(first: 1, query:)` probe | `assignmentConflict.server.ts:152` | read |
| `AssignedProductCounts` | `assignedProductCounts.server.ts:257` | read |
| `ScopeResourceDetails` (`nodes(ids:)`) | `scopeResourceLabel.server.ts:82` | read |
| `ShopId` | `routing.server.ts:190` | read |
| `metafieldsSet` (shop `$app:routing`) | `routing.server.ts:197` | write |
| `metaobjectUpsert` / `metaobjectDelete` | `metaobjects.server.ts:46,79` | write |

**No product write remains.** So `write_products` is plausibly wider than needed
and `write_metaobject_definitions` is plausibly dead (definitions moved to
declarative TOML; the runtime `metaobjectDefinitionCreate` was removed — see
§Key Decisions "App-owned definitions are declarative TOML").

⚠️ **Plausibly is not verified, and two things could make the wider scopes
correct:** what `metafieldsSet` requires for a **Shop**-owner metafield, and
whether deploying the declarative `[product.metafields.app.spec_table]`
definition requires `write_products` at deploy time. Neither was checked here.

🚫 So the scope stays as-is. Precedent: step 106 **D5** refused to touch
`api_version` in a diff that had to be read line by line, for the same reason —
a config change with its own blast radius does not belong in a unit whose value
is being obviously safe. Raised as **OQ-107-A**.

### D5 · The `shopify.app.toml` deletions are **staged, never deployed**

🔴 **`shopify.app.toml` is a protected file** (`ai-workflow-rules.md:29`). The
merchant approved this edit 2026-08-03 and, per the step-106 precedent, the exact
diff is shown below before it is made.

🚫 **`shopify app deploy` is NOT run in this step.** The reason is specific, not
caution-in-general: a subscription `uri` beginning with `/` resolves against
`application_url` **at deploy time**, `application_url` is still
`https://example.com`, and `automatically_update_urls_on_dev = true` means
`shopify app dev` rewrites it to the current tunnel. So a deploy from this step
would re-anchor the three compliance URLs step 106 just registered onto either a
domain we do not own or a dead tunnel. The TOML edit is committed and rides the
**production-host deploy**, together with `application_url` and `redirect_urls`.

⚠️ **Consequence, stated so it is not mistaken for a gap:** the two demo
definitions remain live on the dev store at the end of this step. They are not
observable as removed until that deploy. The gate below says so.

### D6 · The public `/` page keeps its login form; only the copy changes

`app/routes/_index/route.tsx` is what renders when the app URL is hit **without**
a `shop` param, and its `showForm` branch is the shop-domain login path. Deleting
it would remove a working entry point to fix placeholder prose. The structure and
the form stay; `A short heading about [your app]`, the tagline and the three
`Product feature` bullets are replaced with real copy.

### D7 · Home's create action goes to `/app/templates/choose-style`

🔴 **Not `/app/templates/new`.** Feature 92 made the style gallery **unskippable**
and repointed both existing Create buttons at it; a third Create button that
jumps straight to `new` would silently reintroduce the skip path the feature was
built to close.

📌 **This makes `admin-screen-plan.md:34 stale** — Screen 1's checklist step 1
still reads "opens the editor at `/app/templates/new`", which predates feature 88.
Corrected as part of this step's doc edits, because Unit B will otherwise build
from it.

---

## Build instructions

Four deletions/rewrites, one protected-file edit, one new test file, doc
corrections. **No schema change. No new dependency. No new route.**

### 1 · `app/routes/app.additional.tsx` — **delete**

Not in `<s-app-nav>`; reachable only from the demo page's link and by typed URL.

⚠️ **It is cited in four places as the loaderless-route precedent** and deleting
it dangles all four:

- `app/routes/app.templates_.choose-style/route.tsx:20` — a **live code
  comment**. This one must be corrected: repoint it to state the property
  directly ("this route has no loader; auth comes from the `app.tsx` parent
  loader") rather than naming a sibling file. After this step there is no other
  loaderless route to cite, so the comment should stop citing one.
- `context/features/91-style-preset-gallery-route.md:60` and `:438`,
  `context/features/90-style-preset-card-preview.md:295`,
  `context/progress-tracker.md:151` — **historical records.** 🚫 Do not rewrite
  them; they were true when written. The tracker gains one line noting the file
  was deleted in step 107, which is what a reader following the citation needs.

### 2 · `app/routes/app._index.tsx` — **rewrite as the shell**

Delete: the entire `action` (all three mutations), the `useFetcher` /
`useAppBridge` / `useEffect` toast wiring, the JSON `<pre>` dumps, the
`Generate a product` and `Edit product` buttons, and both `slot="aside"` sections
(App template specs, Next steps).

Keep **exactly** the existing loader:

```ts
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};
```

📌 **Deliberately unchanged**, so `data-model.md` §13 **R5b** ("O(1), no data
read") stays accurate with no edit. A loader that started counting templates
would move a catalogued read pattern in a step whose whole claim is that it
removes things. Counts arrive with Unit B, which is where R5b gets revised.

Keep the `headers` export (`boundary.headers`).

The body is one `<s-page heading="Product specs table">` with a single
`<s-section>`: a sentence on what the app does, a primary action **Create
template** → `/app/templates/choose-style` (D7), and a secondary link **View
templates** → `/app/templates`.

📌 `<s-button slot="primary-action">` is fine — step 101's finding was that a
**`<div>`** in that slot is silently discarded, not a `<s-button>`
([[polaris-web-component-gotchas]]).

🚫 **No mention of the theme app block.** It is the most important thing home
will eventually say (D1), and saying it *without* the deep link — the one thing
that makes it actionable — would be worse than silence. It arrives whole, in
Unit B.

### 3 · `app/routes/_index/route.tsx` — **replace the copy** (D6)

Real heading, real tagline, three real feature bullets. Structure, `loader`,
`showForm` branch and `styles.module.css` untouched.

### 4 · `shopify.app.toml` — 🔴 PROTECTED, exact diff, **staged not deployed** (D5)

Two blocks removed, nothing else:

```toml
# --- REMOVE (lines 47–53): the template's demo product metafield ---
[product.metafields.app.demo_info]
type = "single_line_text_field"
name = "Demo Source Info"
description = "Tracks products created by the Shopify app template for development"

  [product.metafields.app.demo_info.access]
  admin = "merchant_read_write"

# --- REMOVE (lines 68–82): the template's demo metaobject ---
[metaobjects.app.example]
name = "Example"
description = "An example metaobject definition created by this template"

  [metaobjects.app.example.access]
  admin = "merchant_read_write"

[metaobjects.app.example.fields.title]
name = "Title"
type = "single_line_text_field"
required = true

[metaobjects.app.example.fields.description]
name = "Description"
type = "multi_line_text_field"
```

🔴 **Nothing else in the file changes.** If `git diff shopify.app.toml` touches
`[webhooks]`, `[access_scopes]`, `application_url`, `redirect_urls`,
`[shop.metafields.*]` or **`[metaobjects.app.appx_spec_table]`**, **stop.** The
last one is the live storefront-delivery definition with real entries behind it,
and deleting-then-recreating a definition poisons existing handles with
`UNDEFINED_OBJECT_TYPE` ([[shopify-metaobject-deploy-clean-lifecycle]]).

✅ Run `shopify app config validate --json` after the edit — it caught D5's
`compliance_topics` key in step 106 and it is the cheap check that the file still
parses.

### 5 · `README.md`

Still the Shopify template's, still pointing at `Shopify/shopify-app-template-react-router`
for "querying data" and "using metafields" (lines 66–68) — files this step
deletes. Replace with this app's own description and setup.

### 6 · Context doc corrections

- `admin-screen-plan.md:34` — the stale `/app/templates/new` (D7).
- `admin-screen-plan.md` §Screen 1 — note that signal 3 is blocked on OQ-107-B.
- `progress-tracker.md` — the standing rule, plus the `app.additional.tsx`
  deletion note and the two new open questions.

---

## Tests — planned, against the 1353 baseline

⚠️ **Everything here is a source-text guard, and that is a real limitation, not
a formality.** `vitest.config.ts` is `environment: "node"` with no jsdom, so a
route component cannot be rendered
(§Key Decisions "Testing strategy"). The house pattern for exactly this is the
contract test — `createFlowContract.test.ts`, `galleryRouteContract.test.ts`,
`StylePresetCardContract.test.ts`.

**New file: `app/routes/boilerplateRemovalContract.test.ts`** (top of
`app/routes/`, spanning several route files and belonging to none — step 106 D7's
reasoning). 📌 Safe there since feature 88 step 92: `app/routes.ts` passes
`ignoredRouteFiles: ["**/*.test.{ts,tsx}"]`, without which a `.test.ts` beside a
route is bundled **as a route** and kills `npm run build` while the suite stays
green.

🔴 **The catalog guard is written as a whole-tree absence, not a per-file
pattern.** Step 100's lesson: *a pattern guard enumerates the spellings someone
thought of; a count covers the ones they did not.* So:

1. **No file under `app/` contains `productCreate`.** The merchant-data-safety
   guard, and the one that must never come back silently.
2. Same for `productVariantsBulkUpdate`.
3. `app/routes/app.additional.tsx` does not exist.
4. `app/routes/app._index.tsx` exports no `action`.
5. `shopify.app.toml` contains neither `metaobjects.app.example` nor
   `demo_info`.
6. `shopify.app.toml` **still** contains `metaobjects.app.appx_spec_table`,
   `[access_scopes]` and all three `compliance_topics` — the inverse guard, so
   an over-broad deletion fails loudly rather than being noticed at deploy time.
7. `_index/route.tsx` contains none of `[your app]`, `A short heading`,
   `Some detail about your feature`.
8. `app._index.tsx` links to `/app/templates/choose-style` and **not** to
   `/app/templates/new` (D7).

**Predicted: +8 tests, +1 file → 1360 / 52.** A final count that overshoots for
a *stated* reason is fine; a silent overshoot is not (step 105/106).

### Mutation tests — planned, all to be run and recorded

✅ **Run 2026-08-03. 6 of 6 matched.** Each mutation was applied, the suite run,
and the mutation reverted from a scratchpad copy of the file.

| # | Mutation | Predicted | Actual |
| - | --- | --- | --- |
| 1 | Restore the demo `action` in `app._index.tsx` | Guards 1, 2, 4 fail | ✅ 1, 2, 4 failed |
| 2 | Re-create `app.additional.tsx` | Guard 3 fails | ✅ 3 failed |
| 3 | Restore `[metaobjects.app.example]` in the TOML | Guard 5 fails | ✅ 5 failed |
| 4 | Delete `[metaobjects.app.appx_spec_table]` from the TOML | Guard 6 fails — the guard that protects the live definition | ✅ 6 failed |
| 5 | Point home's button at `/app/templates/new` | Guard 8 fails | ✅ 8 failed |
| 6 | Restore one placeholder string in `_index/route.tsx` | Guard 7 fails | ✅ 7 failed |

⚠️ **One process finding worth keeping.** M1 was reverted with
`git checkout -- app/routes/app._index.tsx`, which restored the file from **HEAD**
— i.e. the original template demo page — because the rewrite was uncommitted. The
mutation was undone and so was the step's own work. Mutations 2–6 were run against
scratchpad copies instead. 🔴 **Never revert a mutation with `git checkout` while
the step is uncommitted.**

📌 **Guard 6 failed once for real, on first run, before any mutation.** It counted
the bare substring `compliance_topics` and got **4**, because the TOML's own
comment block explains in prose why those keys are `compliance_topics` and not
`topics`. Fixed by counting the *assignment* (`/^\s*compliance_topics\s*=/gm`).
Same trap the `strip()` helper exists for, in a file format the helper does not
cover — worth noting because it is the second time in this repo a guard has
matched its own documentation.

⚠️ **Predictions are per-instance, not per-pattern** — step 106's M3/M4 both
over-predicted by naming a *range* of test numbers when the mutation touched one
file. Each row above names the guards that can actually fire.

---

## Live verification — ✅ RUN 2026-08-03, 7 of 7 checks done, 1 finding

Run against `shopify app dev` on `appx-dev`, verified through Claude-in-Chrome on
the embedded admin ([[browser-verify-embedded-app]]).

| # | Check | Result |
| - | --- | --- |
| 1 | `/app` renders the shell; no "Generate a product", no JSON dump, no asides | ✅ |
| 2 | **Create template** → `/app/templates/choose-style`, six-card gallery | ✅ Modern · Classic · Minimal · Multi-column · Accordion · Blank, accent row above |
| 3 | **View templates** → `/app/templates`, list intact | ✅ list, status filter, per-row ⋯ all intact |
| 4 | Nav shows **Home \| Templates**, both navigate, Home is not dead | ✅ both legs |
| 5 | `/app/additional` → the app's error boundary, not a crash or blank iframe | ⚠️ **Finding L1 — see below** |
| 6 | Public `/` without a `shop` param → real copy, login form still submits | ✅ real copy, 0 of 3 placeholders, `POST /auth/login` → `302` to Shopify OAuth |
| 7 | `appx-dev` Postgres unchanged | ✅ **identical before/after**: Template 34, Session 1, Shop 1, ProductAssignment 123, TableStyling 34 |

### ⚠️ Finding L1 · `/app/additional` renders a bare 404, not the app's error boundary

The spec predicted `app.tsx`'s `ErrorBoundary` would catch this and said plainly
that if it did not, that is a finding. **It does not.** The URL renders an
unstyled `404 Not Found` heading with **the app nav absent** and no way back.

📌 **Why, and why it is not a bug in `app.tsx`.** An `ErrorBoundary` catches
errors thrown *inside its own subtree*. With `app.additional.tsx` deleted,
`/app/additional` matches **no route at all**, so the request never enters
`app.tsx`'s subtree — the root catch-all handles it. Nothing `app.tsx` could
export would change that.

✅ **The check's actual requirement is met**: not a crash, not a blank iframe.
🚫 **Deliberately not fixed here.** A root-level 404 route (or a `/app/*` splat
that renders inside the app shell) is an addition, and this unit's whole claim is
that it only removes things. A merchant reaches this URL only from a bookmark of
a page that was never in the nav. Logged for whoever builds Unit B, which is the
step that owns what `/app` looks like.

### ⚠️ Two environment notes, so neither is mistaken for an app defect

- The first live attempt died mid-pass with a **Server error** toast and a
  failed-to-load iframe. Cause was the **Cloudflare tunnel**, not the app: the
  local server answered `/`, `/app` and `/auth/login` correctly on
  `localhost` throughout. Resolved by the merchant switching to **ngrok**
  ([[ngrok-tunnel-for-app-dev]] — this is now the second time Cloudflare has
  failed on this project).
- ⚠️ **The embedded iframe repaints AFTER the URL and tab title change**, by
  several seconds. A screenshot taken immediately after a click shows the
  *previous* page and reads as "the button did nothing" — it did that twice in
  this pass, and the second time a "failed" click had in fact already navigated.
  Confirm against the tab URL before concluding a control is dead. This is the
  [[embedded-admin-iframe-automation]] instrument caveat, in its costliest form.

---

## Live verification — the plan, including what will NOT be done

Run against `shopify app dev` on `appx-dev`
(`ai-workflow-rules.md` §Running the App Locally — foreground, merchant's
terminal). Embedded-app rules from [[browser-verify-embedded-app]] apply: the app
is a cross-origin iframe, so verify via Claude-in-Chrome on the preview URL.

1. `/app` renders the shell. **No "Generate a product" button anywhere**, no JSON
   dump, no aside sections.
2. **Create template** → lands on `/app/templates/choose-style`, the six-card
   gallery (D7 proven at the destination, not in the source).
3. **View templates** → `/app/templates`; the list is intact.
4. Nav shows **Home | Templates**, both navigate, Home is not a dead entry.
5. `/app/additional` → the app's error boundary, **not** a crash or a blank
   iframe. (`app.tsx`'s `ErrorBoundary` should catch it; if it does not, that is
   a finding.)
6. The public `/` at the tunnel root **without** a `shop` param → real copy, and
   the shop-domain login form still submits (D6).
7. **Postgres unchanged** — template and session counts read before and after.
   Nothing in this step writes.

**🚫 What will NOT be done, and why:**

- **No `shopify app deploy`** (D5). ⚠️ So the two demo definitions are **still
  live on the dev store** at the end of this step. Anyone checking Custom data in
  the admin will still find "Example" and "Demo Source Info" — that is expected,
  not a failed verification.
- **No cleanup of demo data already in the dev store.** If the Generate button
  was ever pressed, `{Color} Snowboard` products exist. Deleting merchant-store
  products is not something this step does unprompted; it is listed for the
  merchant instead.
- **No screen-reader pass.** No AT in this environment (the standing limitation
  since step 91), and the shell adds one heading and two links.

---

## Completion gate — 10 of 10

1. ✅ `app.additional.tsx` deleted; the **code comment** in
   `choose-style/route.tsx` repointed to state the property directly. Historical
   citations left intact — 📌 note that only **two** survive, not three:
   `91-…:60`/`:438` and `90-…:295`. The tracker's own citation was already
   removed by the 2026-08-03 compaction (`1109e32`), so there was nothing at
   `progress-tracker.md:151` to preserve; the deletion note went into the
   step's Recently Shipped entry instead, which is what a reader following the
   two doc citations needs.
2. ✅ `app._index.tsx` has no `action`, no product mutation, no JSON dump; its
   **loader is byte-unchanged**, so `data-model.md` §13 R5b needs no edit.
   📌 **One deviation from §2, stated:** Create appears **once**, in
   `slot="primary-action"`, and the section holds the sentence + the **View
   templates** secondary. §2 read as though the section carried both. Reason:
   `app.templates.tsx` carries two Create buttons only because one lives in an
   empty state that vanishes once a template exists; home has no empty state, so
   a second identical button one line below the first is redundancy, not
   coverage. Both required destinations are present and guard 8 is unaffected.
3. ✅ `_index/route.tsx` carries real copy; structure, `loader`, `showForm`
   branch and `styles.module.css` untouched. ⚠️ The login form is **asserted by
   inspection, not exercised** — that is live check 6.
4. ✅ `shopify.app.toml` diff is **two removed blocks and nothing else**
   (confirmed by `git diff`: 24 deletions, 0 insertions, no other hunk), with
   `shopify app config validate --json` → `{"valid": true, "issues": []}`.
5. ✅ **1353 / 51 → 1361 / 52.** The delta is **+8, +1 exactly as predicted**;
   the "1360" in this doc was arithmetic (1353 + 8 = 1361), not an overshoot.
6. ✅ Six mutations run and recorded — see §Mutation tests. All six matched.
7. ✅ Full gate green: typecheck · lint · `format:check` · tests · **build**.
   (`format:check` failed once on `_index/route.tsx` and was fixed with
   `prettier --write`; the rerun is clean.)
8. ✅ **Live: all seven checks run, `appx-dev` counts unchanged** (Template 34,
   Session 1, Shop 1, ProductAssignment 123, TableStyling 34 — identical before
   and after). ⚠️ Check 5 produced **Finding L1**: `/app/additional` renders a
   bare 404, not the app's error boundary. The check's stated requirement (not a
   crash, not a blank iframe) is met; the predicted mechanism is not. Recorded,
   deliberately not fixed — see §Live verification.
9. ✅ README rewritten for this app; `admin-screen-plan.md` step 1 corrected to
   `/app/templates/choose-style`; `progress-tracker.md` updated (Current Phase
   counts, Recently Shipped entry, Unit B added to Next Up).
10. ✅ **OQ-107-A and OQ-107-B written into `progress-tracker.md`** in full, and
    `admin-screen-plan.md`'s Screen 1 signal-3 row now carries a 🔴 blocked
    marker pointing at OQ-107-B, so Unit B cannot build from it by accident.

---

## New open questions this step raises

### OQ-107-A · Which scopes does the app actually need?

`write_products` has **no remaining writer** once the demo action is deleted, and
`write_metaobject_definitions` looks dead now that definitions are declarative
TOML (D4 has the full API surface). Two unchecked things could still justify
them: what `metafieldsSet` requires for a **Shop**-owner metafield, and whether
deploying `[product.metafields.app.spec_table]` needs `write_products`.

Why it matters now: `app-store-review-checklist.md` §8 requires "only scopes
actually used are requested", and narrowing a scope after launch is a re-consent
event across every installed shop. Cheap now, expensive later. 🚫 Not changed in
this step (D4).

### OQ-107-B · Screen 1's checklist step 3 points at a model proposed for deletion

`admin-screen-plan.md:49` marks "Assign the template to a product" complete when
a `ProductAssignmentIndex` row has `status = APPLIED`. **OQ-103-D** records that
`ProductAssignmentIndex` has zero application-code references — the 2026-07-07
shop-level routing redesign removed the need for it — and proposes dropping the
table and its four indexes.

Both cannot be right. The likely resolution is that the signal should key off
`ProductAssignment` (the live model) instead, but that is a decision about the
onboarding spec, not a rename. 🔴 **Unit B is blocked on this** for checklist
step 3 only; the other three steps are unaffected.

---

## What this step does NOT close

- **The dashboard** — Screen 1's three states, the checklist, the theme-editor
  deep link, the stat cards. All Unit B, and the deep link is the one that
  matters for the App Store theme-extension requirement.
- **`application_url`** — still `https://example.com`, still the #1 submission
  blocker (step 106 §"The blocker this step uncovered"). This step *adds* to the
  payload of that deploy; it does not resolve it.
- **Billing** — the other hard blocker for a paid listing.
- **OQ-103-A / C / D** — untouched.
- **Phase 4 testing** — this step's guards are source-text, not route-action
  tests. `webhooks.app.uninstalled.tsx` and `webhooks.app.scopes_update.tsx`
  remain untested at the route layer.
