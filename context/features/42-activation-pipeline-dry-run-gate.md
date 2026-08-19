# Feature 42 — Activation pipeline + DRAFT→ACTIVE dry-run gate

## Goal in one sentence

Wire the pieces built in 37–41 into the two existing status-change surfaces: a
`DRAFT→ACTIVE` transition first runs the **dry-run conflict check** (block the
activation, write nothing, if the template's scope overlaps another ACTIVE
template) and otherwise writes the status, re-syncs the metaobject, and
**rebuilds + publishes the shop routing** (feature 41); a transition **away from**
ACTIVE just rebuilds. This is the orchestration slice — the assignment engine
becomes real for the merchant here.

## Why this is next

Everything the gate needs now exists and is unit-tested in isolation:
`getAssignmentForTemplate` (37), `partitionOverlaps` (38),
`checkCrossDimensionConflicts` (39), `buildRoutingProjection` (40),
`rebuildShopRouting` (41). Nothing calls them yet. Feature 42 is the wiring that
turns "a template can hold a scope" into "activating a template enforces the
disjoint invariant and publishes the routing map" — the behaviour data-model §9
specifies. After this, the storefront Liquid (43) and the scope-picker UI (44)
have a live, gated pipeline to build on.

## Scope of THIS slice

- **Gate + rebuild wired into the two EXISTING status surfaces** (feature 36):
  the templates-list `intent: "status"` action (`app/routes/app.templates.tsx`)
  and the editor Save action that carries `status`
  (`app/routes/app.templates_.$id/route.tsx` → `saveTemplateForShop`).
- **A reusable decision core** (`evaluateActivationConflicts`) both surfaces call,
  plus the pure `shouldRebuildRouting` transition test.
- **Minimal conflict surfacing** — block returns a structured `conflicts` payload +
  a concise `error` string shown via the surfaces' existing error toasts. The rich
  conflict UI (which template, which dimension, resolution picker) is **feature
  44**; this slice only needs the block to be visible and correct.
- **Out:** the scope-picker UI + rich conflict warnings (44); storefront Liquid
  resolution (43); EXCLUDE persistence + per-product overflow (45); create-as-ACTIVE
  and ACTIVE-scope-edit wiring (see Open / optional — the pipeline is ready for
  both, but neither has a surface yet).

## Decisions (settled)

- **Block is atomic — on conflict, write NOTHING.** The gate runs **before** any
  status write. A blocked activation returns `{ ok: false, blocked: true,
  conflicts, error }` and neither writes the status nor (in the editor) saves the
  rows. This is safe because a rejected editor save leaves the merchant's unsaved
  edits **intact in client state** (the SaveBar stays up) — no data loss, no
  partial write. The merchant resolves the conflict or sets the status back to
  DRAFT and saves again. (Moon-Bundles rigidity, data-model §9.)
- **Fail closed end to end (priority #2).** `checkCrossDimensionConflicts` (39)
  **throws** on a Shopify error. `evaluateActivationConflicts` catches that and
  returns a **block** (`conflicts: [{ reason: "couldn't verify…" }]`), never a
  silent pass — an unverifiable activation must not go ACTIVE and break the
  disjoint invariant on the live storefront.
- **Rebuild only when the ACTIVE set changes.** Pure `shouldRebuildRouting(current,
  target)` = `current !== target && (current === "ACTIVE" || target === "ACTIVE")`.
  A rows-only editor save (status unchanged) does **not** rebuild routing — routing
  maps scope→handle, not rows; the metaobject sync already carries row/status
  changes. Only ACTIVE-set transitions (to- or from-ACTIVE) rebuild.
- **Comparison set = OTHER ACTIVE templates that HAVE an INCLUDE scope.** A new
  shop-scoped read `getActiveIncludeScopesExcept(shopId, excludeTemplateId)`
  returns `{ templateId, templateName, scope, scopeValue }[]`. The candidate is
  always excluded (so an already-ACTIVE template being scope-edited can't conflict
  with itself). A scope-less ACTIVE template matches no products, so it is not in
  the set (can't collide).
- **Scope-less candidate ⇒ trivially passes.** If `getAssignmentForTemplate`
  returns `null` (no INCLUDE rule), the gate returns `{ ok: true }` immediately —
  no scope, no possible overlap. This is the **common case today** (the scope
  picker is feature 44; most templates have no rule yet), so activation currently
  passes and just rebuilds (contributing nothing to the map). The gate becomes
  load-bearing once 44 lets merchants set scopes.
- **Post-write order: status → metaobject sync → routing rebuild.** Status to
  Postgres (source of truth) first; then `syncTemplateToMetaobject` (36) so the
  template's metaobject exists + is ACTIVE; then `rebuildShopRouting` (41) so the
  map only ever points at a handle whose metaobject is already live. Both delivery
  writes are best-effort and surfaced (`syncError`, `routingError`) — neither
  blocks the durable status write; only the **pre-write conflict** blocks.
- **Decision core lives in `app/shopify/assignmentActivation.server.ts`** — it
  calls `checkCrossDimensionConflicts` (Admin API), so `app/shopify/` is its home,
  like `routing.server.ts`. Pure helpers (`shouldRebuildRouting`, the
  conflict-combining) are exported + unit-tested; the surfaces do the status write
  their own way and call the core around it.

## What already exists (so we don't rebuild it)

- `getAssignmentForTemplate(shopId, templateId)` (37) — the candidate's INCLUDE
  rule or `null`.
- `partitionOverlaps<T>(candidate, others)` (38) → `{ blocking: T[]; needsCheck:
  NeedsCheck<T>[] }`, with `T` carrying the other template's identity for
  messaging.
- `checkCrossDimensionConflicts<T>(admin, needsCheck)` (39) → `ConfirmedConflict<T>[]`
  (`{ other, reason }`); **throws** on a Shopify error (fail-closed contract).
- `rebuildShopRouting(admin, shopId)` (41) → `{ ok, metafieldGid } | { ok:false,
  error }`; reads the ACTIVE rules, projects, upserts the row, writes the metafield.
- `setTemplateStatusForShop` (list) / `saveTemplateForShop` (editor) +
  `syncTemplateToMetaobject` (36) — the current status-write + metaobject-sync paths
  this slice brackets with the gate and the rebuild.
- The feature-36 surfaces already thread `admin`, `shop`, and surface `syncError`
  via toast — the same channel this slice adds `error` (conflict) + `routingError`
  to.

## Correctness invariants (must hold)

- **Disjoint ACTIVE set (the whole point).** No template can reach ACTIVE while its
  scope overlaps another ACTIVE template's scope — enforced pre-write on both
  surfaces. After activation the ACTIVE rule set is disjoint, so the storefront
  never resolves precedence (data-model §9).
- **Fail closed.** Any path that cannot *prove* no-conflict (probe throws) blocks,
  never activates.
- **Atomic block.** A blocked activation writes nothing (no status, no rows, no
  metaobject, no routing).
- **Shop isolation (priority #1).** Every read/write is `where { shopId }`; the
  comparison set, the gate, and the rebuild all scope by shop; `admin` is
  session-bound. The candidate and all "others" belong to the same shop.
- **Rebuild is idempotent + full.** `rebuildShopRouting` always derives from the
  current ACTIVE set; running it on every ACTIVE-set transition converges — no
  incremental drift.
- **Delivery failures don't lose data.** `syncError` / `routingError` are surfaced
  but never roll back the durable status write (Postgres is the source of truth).

---

## Steps (each independently verifiable)

### Step 1 — Comparison-set read + pure transition test

- Add `getActiveIncludeScopesExcept(shopId, excludeTemplateId)` to
  `app/models/assignment.server.ts`: ACTIVE templates (≠ candidate) that have an
  INCLUDE rule → `{ templateId, templateName, scope, scopeValue }[]` (shop-scoped;
  one INCLUDE rule per template, feature 37).
- Add pure `shouldRebuildRouting(current, target)` to
  `app/shopify/assignmentActivation.server.ts`.
- **Test:** shop-isolation on the read (mocked Prisma — `where` carries `shopId`,
  excludes the candidate, filters to ACTIVE + INCLUDE); `shouldRebuildRouting`
  truth table (to-ACTIVE / from-ACTIVE → true; ACTIVE→ACTIVE, DRAFT↔ARCHIVED,
  no-change → false).

### Step 2 — `evaluateActivationConflicts` (the gate) + tests

- `evaluateActivationConflicts(admin, shopId, templateId): Promise<{ ok: true } |
  { ok: false; conflicts: ActivationConflict[] }>`:
  1. `getAssignmentForTemplate` → `null` ⇒ `{ ok: true }` (scope-less).
  2. `getActiveIncludeScopesExcept` → others (each tagged with templateId/name).
  3. `partitionOverlaps(candidateSelector, others)` → `{ blocking, needsCheck }`.
  4. `checkCrossDimensionConflicts(admin, needsCheck)` (in a try/catch — **a throw
     ⇒ a block**, fail closed).
  5. Combine `blocking` (map to conflicts) + confirmed (`{ other, reason }`) →
     non-empty ⇒ `{ ok: false, conflicts }`, else `{ ok: true }`.
  - `ActivationConflict = { templateId?: string; templateName?: string; reason:
    string }`.
- **Test:** (mocked deps) scope-less → ok; a same-scope/ALL_PRODUCTS overlap →
  blocked naming the other template; a `needsCheck` confirmed by the probe →
  blocked; a `needsCheck` the probe clears → ok; **probe throws → blocked**
  (fail-closed); the candidate is excluded from the comparison set.

### Step 3 — Wire the templates-list `intent: "status"` action

- In `app/routes/app.templates.tsx` `intent === "status"`: read the current status
  (`getTemplateByIdForShop`); if `target === ACTIVE && current !== ACTIVE`, run the
  gate — on block, return `{ ok: false, blocked: true, conflicts, error }` and
  **write nothing**. Otherwise `setTemplateStatusForShop` → `syncTemplateToMetaobject`
  → if `shouldRebuildRouting(current, target)` call `rebuildShopRouting` (surface
  `routingError`). Return the existing `{ ok, intent, syncError }` shape + the new
  fields.
- **Verify:** build + existing suite green; the list toast shows the block `error`.

### Step 4 — Wire the editor Save action

- In `app/routes/app.templates_.$id/route.tsx` (existing-template save branch):
  read the current status; if the payload status is `ACTIVE` and current isn't, run
  the gate **before** `saveTemplateForShop` — on block, return `{ ok: false,
  blocked: true, conflicts, error }` (rows NOT saved; the editor keeps its unsaved
  edits + toasts `error`). Otherwise `saveTemplateForShop` → `syncTemplateToMetaobject`
  → rebuild when `shouldRebuildRouting`. Add `routingError` to the returned data.
- **Verify:** build + suite green; a rows-only save (no status change) does **not**
  rebuild routing (unchanged fast path).

### Step 5 — Manual verification (dev store)

- Seed two overlapping INCLUDE rules via feature 37's `setTemplateScope` (e.g. both
  `ALL_PRODUCTS`, or `PRODUCT_TYPE:'X'` on one and `ALL_PRODUCTS` on another) on two
  templates; make the first ACTIVE (gate passes, routing rebuilds). Attempt to
  activate the second from **both** surfaces → **blocked**, naming the first;
  nothing written. Resolve (narrow/clear the scope) → activation succeeds, routing
  rebuilds. Confirm the `ShopStorefrontRouting` row + `$app:routing` metafield via
  Neon / Admin GraphQL (as in feature 41). Use a temporary scratch trigger for the
  seeding (removed after), mirroring feature 41's Step 4.

### Step 6 — Docs

- Update `context/progress-tracker.md`: gate + rebuild wired into both surfaces
  (one line + this pointer); advance "Next" to feature 43 (storefront Liquid
  routing resolution). Note the conflict UI is minimal (error toast) pending
  feature 44.
- Reconcile `data-model.md` §9 only if a detail deviates (§9 already describes the
  block-on-conflict + rebuild-on-activate flow).

---

## Out of scope (this file)

- The rich conflict UI — which template, which dimension, and the resolution
  picker (narrow scope / add EXCLUDE / keep draft) — **feature 44**. This slice
  returns the structured `conflicts` payload but surfaces only a concise error
  toast.
- The scope-picker UI itself (44) — seeding scopes here is manual (feature 37).
- Storefront Liquid resolution against the routing map (43).
- EXCLUDE persistence/UI + per-product overflow materialization (45).
- Any change to the pure resolvers (38/39/40) or the writer (41) — this slice only
  orchestrates them.

## Open / optional

- **Create-as-ACTIVE** (`params.id === "new"` with `status: ACTIVE`). A brand-new
  template has no scope, so the gate would pass trivially and there is nothing to
  route — a genuine no-op today. Left unwired to keep this slice to the two named
  surfaces; wire it (gate + rebuild) alongside feature 44 when new templates can
  carry a scope, or add a one-line guard here if desired. Documented, not silently
  skipped.
- **ACTIVE-scope-edit rebuild.** Editing an ACTIVE template's scope must re-run the
  gate + rebuild. The pipeline (`evaluateActivationConflicts` excludes the
  candidate; `rebuildShopRouting` is idempotent) is **ready**, but the scope-edit
  surface is feature 44 — it will call the same core. No storefront risk until 44.
- **Transient Settings/badge desync on a blocked editor activation.** The Settings
  `<s-select>` shows ACTIVE (client state) though the DB stayed DRAFT; resolved on
  the next revalidation/discard. Acceptable for MVP; feature 44 (rich conflict UI)
  can reset the control on block.
- **Double status read.** The action reads the template's current status for the
  gate decision, and `saveTemplateForShop`/`setTemplateStatusForShop` read again.
  A minor redundancy left for clarity; fold into one read if it ever matters.
