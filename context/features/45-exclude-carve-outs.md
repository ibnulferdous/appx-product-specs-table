# Feature 45 — EXCLUDE carve-outs (write path + gate awareness + storefront + UI)

## Goal in one sentence

Let a merchant exclude specific products from a template's broad assignment (e.g.
"all Vendor:Acme **except** product X"), so the excluded products fall through to
another template (or render nothing) — teaching the conflict gate and the
storefront resolver to honor those carve-outs, and giving the Settings tab a UI to
manage them.

## Why this is next (and first of the 45-series)

The data + projection layer for EXCLUDE **already exists and is inert**:
`ProductAssignment.mode = EXCLUDE` is in the schema, `setTemplateScope` only ever
touches `mode: INCLUDE` (so EXCLUDE rows survive a scope change), and feature 40's
`buildRoutingProjection` already folds `EXCLUDE PRODUCT` rows into
`excludedProductGids`, which feature 43's Liquid already reads. **What is missing
is the three things that make it real:** a write path, gate awareness, and a UI —
plus one storefront-resolver bug this surfaces (below). It is the smaller, more
contained of feature 45's three capabilities, and doing it first warms up the
conflict gate in a bounded way before the bigger multi-value relaxation (feature
46/47) generalizes the candidate from one selector to N.

**No migration.** Everything is in the schema already (`mode: EXCLUDE`,
`excludedProductGids`, the `@@unique(shopId, templateId, scope, scopeValue, mode)`
that already permits an INCLUDE row and an EXCLUDE row to coexist). This slice is
application code only.

## The two invariant-sensitive decisions (the substance of this slice)

### A. EXCLUDE resolves a conflict — the gate must subtract it

Today `evaluateActivationConflicts` + `partitionOverlaps` reason over INCLUDE
scopes only, and the disjoint-ACTIVE-set invariant means every product matches ≤1
ACTIVE template. The **entire point** of EXCLUDE is to *resolve* an overlap: with
`A = INCLUDE Vendor:Acme, EXCLUDE product X`, template `B = INCLUDE product X`
should be allowed to go ACTIVE, because A no longer covers X.

So the gate must subtract each side's EXCLUDE product GIDs before declaring a
collision. **MVP rule (keeps the gate O(rules) and fail-closed):**

- An overlap between a candidate and another ACTIVE template is **resolved by
  EXCLUDE only when the collision is a specific `PRODUCT` GID that the broad side
  excludes** — i.e. one side is `PRODUCT: X` (or the probe/set-algebra collision is
  attributable to product X) and the other side excludes X.
- **Broad × broad overlaps stay blocked.** `Vendor:Acme × Type:Drone` overlap on an
  unknown, possibly unbounded set of shared products; a finite EXCLUDE list can't
  prove they're disjoint cheaply, and the existence probe returns *existence*, not
  *which* products. The merchant resolves those by narrowing scope, exactly as
  today. EXCLUDE is a **product-level** carve-out, not a general set-difference.
- Concretely: the two decidable cases EXCLUDE resolves are
  1. **candidate is `PRODUCT: X`**, another ACTIVE template is broad and **excludes
     X** → no conflict; and
  2. **candidate is broad and excludes X**, another ACTIVE template is `PRODUCT: X`
     → no conflict.
  Every other overlap is unchanged (still blocks).

This lives in the gate (`assignmentActivation.server.ts`) — it reads the
candidate's pending EXCLUDE set and each other ACTIVE template's EXCLUDE set, and
drops a `PRODUCT`-attributable collision when the product is excluded on the side
that would otherwise cover it. The pure `partitionOverlaps` / `classifyScopePair`
stay INCLUDE-only; the EXCLUDE subtraction is a filter the gate applies **around**
them (so the pure resolver's matrix + tests are untouched).

### B. Storefront-resolver order bug this surfaces (priority #2)

`snippets/spec-table-resolve.liquid` currently wraps **the whole map lookup —
including `byProduct` — inside** `unless routing.excludedProductGids contains
pgid` (lines 37–40). So once product X is excluded, X renders **nothing from the
entire map, including its own explicit `byProduct` assignment** — the "exclude
from A so B can claim X" story silently breaks on the live storefront.

**Fix:** the per-product override (tier 1) and `byProduct` (an explicit
single-product assignment) must be checked **before** the exclude gate; the exclude
gate then only carves products out of the **broad** tiers (`byType` / `byVendor` /
`byCollection` / `defaultTemplateHandle`). New order:

```
override metafield  ->  byProduct[<GID>]  ->  (excluded? -> nothing)
  ->  byType -> byVendor -> byCollection(scan) -> defaultTemplateHandle
```

Both stories then hold: `A=ALL_PRODUCTS EXCLUDE X` with no B → X hits the exclude
gate → renders nothing; `A=Vendor:Acme EXCLUDE X` + `B=PRODUCT X` → X hits
`byProduct[X]` first → renders B. This is a real storefront-correctness change and,
like feature 43's `strip_html` bug, **only a real storefront surfaces it** — it
must be live-verified. (Safe against the disjoint set: `ALL_PRODUCTS` vs any broad
scope always OVERLAP and can't both be ACTIVE, so `byProduct`-before-exclude never
lets a broad rule leak past a legitimate exclude.)

## Scope of THIS slice

- **Write path** — `setTemplateExcludes(shopId, templateId, productGids[])` in
  `assignment.server.ts`: create-or-replace the template's `mode: EXCLUDE`,
  `scope: PRODUCT` rows, touching **only** EXCLUDE rows (mirrors how
  `setTemplateScope` touches only INCLUDE). Shop-scoped, ownership-gated, validates
  each GID via `validateScope("PRODUCT", gid)`. A `getExcludesForTemplate` read for
  the loader.
- **Gate awareness** — `evaluateActivationConflicts` subtracts EXCLUDE carve-outs
  per Decision A (candidate's pending excludes + each other ACTIVE template's
  excludes). New read: the other ACTIVE templates' EXCLUDE product GIDs
  (`getActiveExcludesByTemplate` or extend the existing comparison read).
- **Storefront resolver fix** — reorder `spec-table-resolve.liquid` per Decision B.
  Theme Check green; live-verify.
- **Routing rebuild already works** — `rebuildShopRouting` already flattens EXCLUDE
  rows through feature 40 into `excludedProductGids`; once EXCLUDE rows exist, the
  map populates with no writer change. Confirm, don't rebuild.
- **EXCLUDE UI** in `SettingsTab.tsx` — an "Except these products" list shown
  **only under the `ALL_PRODUCTS` scope** (App Bridge `resourcePicker({
  type:"product", multiple:true })` → chips with remove). Rides the SaveBar via the
  engine (parallel to `scope`). Hidden for every other scope (`PRODUCT_TYPE` /
  `VENDOR` / `COLLECTION` / `PRODUCT` / `NONE`) — see the settled decision below for
  why `ALL_PRODUCTS` is the only scope that surfaces the control.
- **Save action** — persist excludes alongside the scope (before status, same
  ordering rationale), inside the gate/atomic-block flow. Rebuild routing when the
  exclude set changed on an ACTIVE template (extend the scope-change trigger).

## Decisions (settled)

- **EXCLUDE is PRODUCT-scoped only in MVP.** The carve-out granularity is a
  specific product GID (matches feature 40's projection, which only folds
  `EXCLUDE PRODUCT` into `excludedProductGids`; non-PRODUCT EXCLUDE modes are
  undefined and ignored). "Exclude a whole type/vendor" is not an MVP need and
  would complicate the storefront gate (a set, not a GID list).
- **Excludes ride the SaveBar, not immediate-persist** — same reasoning as scope
  (feature 44): one atomic Save persists scope + excludes + status together; the
  gate runs pre-write; Discard reverts them. Add `excludes` (a `string[]` of GIDs)
  + `excludeLabels` to the engine, into the meta-JSON snapshot and Save payload.
- **The exclude UI is shown only under `ALL_PRODUCTS`** (not every broad scope).
  Rationale: `ALL_PRODUCTS` overlaps *every* other scope, so the only template that
  can ever be ACTIVE alongside `ALL_PRODUCTS EXCLUDE X` is a `PRODUCT: X` template —
  which is exactly the one collision Decision A resolves. Surfacing the control only
  here means the exclude box never appears in a configuration where it can't do what
  the merchant expects, which removes the broad×broad "excludes should de-conflict
  this" dead-end at the source (a `VENDOR`/`TYPE`/`COLLECTION` rule simply shows no
  exclude control and the conflict banner tells the merchant to narrow scope). The
  single coherent story becomes "carve specific products out of my catch-all so a
  dedicated table can take them over." Cost: "show on `Vendor:Acme` **except** X"
  is no longer expressible in MVP (only "show on all products except X"); the gate
  still *supports* a `VENDOR`-scoped exclude per Decision A, we just don't expose the
  UI for it. Server still tolerates stray excludes on any scope (they never match),
  but the UI only ever creates them under `ALL_PRODUCTS`.
- **Gate subtraction is a filter around the pure resolver** (Decision A) — the pure
  `assignmentOverlap.ts` matrix stays INCLUDE-only and untouched; the gate applies
  the PRODUCT-exclude drop. Keeps feature 38's tests + guarantees intact.
- **Resolver reorder, not a rewrite** (Decision B) — move `byProduct` (and the
  override, already tier 1 in the block) ahead of the exclude gate; the broad tiers
  stay inside it. Minimal Liquid diff, maximal review clarity.
- **Labels resolved for display** — like feature 44's scope chip, resolve excluded
  PRODUCT GIDs to titles in the loader (batch with the existing
  `resolveScopeValueLabel`) so the chips are readable; miss → GID.

## What already exists (so we don't rebuild it)

- `ProductAssignment.mode = EXCLUDE` + `@@unique(...scope, scopeValue, mode)` — an
  INCLUDE and an EXCLUDE row coexist per template.
- `buildRoutingProjection` (40) already buckets `EXCLUDE PRODUCT` →
  `excludedProductGids`; `flattenActiveRulesToRoutingRules` + `rebuildShopRouting`
  (41) already carry `mode` through, so EXCLUDE rows populate the map with no
  writer change.
- `setTemplateScope` / `clearTemplateScope` (37) already scope their writes to
  `mode: INCLUDE`, so a new EXCLUDE writer is symmetric and non-interfering.
- `validateScope("PRODUCT", gid)` (37) validates an exclude GID.
- `resolveScopeValueLabel` (44) + the batched loader resolve GID → title.
- `SettingsTab.tsx` scope picker + SaveBar plumbing (44) — the exclude list sits
  beside it and rides the same engine snapshot.
- `evaluateActivationConflicts` + the atomic-block Save flow (42/44) — the frame the
  exclude subtraction slots into.

## Correctness invariants (must hold)

- **Disjoint ACTIVE set.** After the exclude subtraction, no two ACTIVE templates
  may cover the same product. The subtraction only ever *removes* a collision that
  a carve-out genuinely resolves (a specific excluded PRODUCT GID) — never a
  broad×broad overlap it can't prove disjoint.
- **Fail closed.** Unchanged — an unverifiable probe still blocks. The exclude
  subtraction runs on the *decided* collisions; it never turns a fail-closed block
  into a pass.
- **Storefront: an explicit assignment beats an exclude** (Decision B) — the per-
  product override and `byProduct` win over `excludedProductGids`; the exclude gate
  only suppresses broad-tier matches.
- **Shop isolation (priority #1).** The exclude write, the other-templates exclude
  read, and the label query are all `where { shopId }` / session-bound.
- **EXCLUDE rows survive an INCLUDE scope change and vice versa** — the two writers
  each touch only their own `mode`, so re-scoping a template keeps its carve-outs
  and clearing carve-outs keeps its scope.
- **Atomic block.** A blocked Save persists nothing — including the pending
  excludes.

## Steps (each independently verifiable)

### Step 1 — EXCLUDE write + read (`assignment.server.ts`)
- `setTemplateExcludes(shopId, templateId, gids[])` — ownership-gated, validates
  each GID, `$transaction` delete-all-EXCLUDE-then-create-set (touches only
  `mode: EXCLUDE`). `getExcludesForTemplate(shopId, templateId)` → GID[].
  `getActiveExcludesByTemplate(shopId, excludeTemplateId)` for the gate.
- **Test:** shop isolation (foreign template writes/reads nothing); INCLUDE rows
  untouched by an exclude write (and vice versa); invalid GID rejected; the
  delete-then-create replace is exact.

### Step 2 — Gate subtraction (`assignmentActivation.server.ts`)
- Extend `evaluateActivationConflicts` to read the candidate's pending excludes +
  the other ACTIVE templates' excludes, and drop a `PRODUCT`-attributable collision
  when that product is excluded on the covering side (Decision A). Thread the
  pending excludes through from the Save action (like `candidateScope`).
- **Test:** `A=Vendor:Acme EXCLUDE X` + `B=PRODUCT X` → no conflict; remove the
  exclude → blocks; broad×broad overlap still blocks regardless of excludes;
  fail-closed unchanged.

### Step 3 — Storefront resolver reorder (`spec-table-resolve.liquid`)
- Move `byProduct` (and rely on the block's tier-1 override) ahead of the
  `excludedProductGids` gate; keep the broad tiers inside it. Update the header
  comment's resolution-order block.
- **Verify:** Theme Check green; live-verify both stories on the dev store (Step 7).

### Step 4 — Engine + Save payload (`useRowEngine.ts`, `route.tsx`)
- Engine: `excludes: string[]` + `excludeLabels` + `setExcludes`, into the meta-JSON
  snapshot + Save payload (parallel to `scope`/`scopeValue`). Loader returns the
  persisted excludes + resolved labels; seed the engine.
- Save action: parse pending excludes, feed them to the gate (Step 2), persist via
  `setTemplateExcludes` (before status, with the scope write), rebuild routing when
  the ACTIVE template's excludes changed.
- **Test:** an exclude change flips `isDirty`; the payload carries `excludes`; the
  rebuild trigger fires on an ACTIVE exclude edit (pure bits unit-tested).

### Step 5 — EXCLUDE UI (`SettingsTab.tsx`)
- **Only under `scope === "ALL_PRODUCTS"`**, an "Except these products" section:
  `resourcePicker({ type:"product", multiple:true })` → a chip list with per-chip
  remove + an add-more button. Hidden for every other scope (`PRODUCT_TYPE` /
  `VENDOR` / `COLLECTION` / `PRODUCT` / `NONE`). Subdued helper text ("These
  products won't show this table, even though they match the assignment above").
  (PRODUCT-only excludes — no "Collections" option in the picker, unlike Kaching.)
- **Verify:** browser — the section appears only when "All products" is selected;
  add/remove excludes opens the SaveBar; chips show titles; switching the scope away
  from `ALL_PRODUCTS` hides the section.

### Step 6 — Confirm routing rebuild carries excludes
- No writer change expected; assert `rebuildShopRouting` writes the excluded GIDs
  into `excludedProductGids` once EXCLUDE rows exist (Neon + the `$app:routing`
  metafield).

### Step 7 — Manual verification (dev store)
- `A = ACTIVE, INCLUDE ALL_PRODUCTS, EXCLUDE product X`; confirm X's storefront page
  renders **nothing** (catch-all carved out) while a sibling product still renders
  A. Then `B = ACTIVE, INCLUDE PRODUCT X`; confirm the gate **allows** B (no
  conflict), routing rebuilds, and X's page renders **B** (byProduct beats the
  exclude — Decision B). Remove the exclude and re-activate B → **blocked** with the
  conflict banner. Restore the store to its pre-test state.

### Step 8 — Docs
- Update `data-model.md` §9 (EXCLUDE resolves PRODUCT-level conflicts; resolver
  order: override → byProduct → exclude gate → broad tiers) and
  `progress-tracker.md`. Advance "Next" to feature 46 (multi-value scopes — server).

---

## Out of scope (this file)
- **Multi-value scopes** (several products/collections per template) — feature 46
  (server) + 47 (UI).
- **Per-product overflow materialization** + the list "Assigned Products" count —
  deferred post-45 (a scaling valve behind a threshold; only if large selected-
  product sets become real).
- **Non-PRODUCT EXCLUDE** (exclude a whole type/vendor/collection) — not an MVP
  need; would change the storefront gate from a GID list to a set test.
- Any change to the pure INCLUDE resolver (38/39/40) beyond the gate's exclude
  filter; the routing writer (41) beyond confirming it carries excludes.

## Open / optional
- **Exclude a product that isn't covered by the scope.** Harmless (it never
  matches), but the UI could warn. MVP: allow silently.
- **Two-write atomicity.** `setTemplateScope` + `setTemplateExcludes` +
  `saveTemplateForShop` are separate post-gate writes; a partial failure is
  surfaced, not transactional (same posture as feature 44). Fold into one
  `$transaction` only if it ever matters.
- **Exclude-set size.** A large exclude list inflates the shared `excludedProductGids`
  array toward the 128KB shop-metafield cap — the same ceiling that motivates the
  deferred materialization slice; note it, don't solve it here.
