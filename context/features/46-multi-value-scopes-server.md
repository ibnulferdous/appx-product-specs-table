# Feature 46 — Multi-value scopes (server relaxation)

## Goal in one sentence

Relax the engine's "exactly one INCLUDE rule per template" rule to **1..N INCLUDE
rows for the PRODUCT and COLLECTION scope kinds** (so a template can target
*several* selected products or *several* selected collections), teaching the write
path, the read path, and the DRAFT→ACTIVE conflict gate to reason over a **set** of
scope selectors instead of a single one — **server + route-action only, no UI
change** (the multi-select picker is feature 47).

## Why this is next (and why it is the invariant-sensitive slice)

Feature 45 warmed up the gate for EXCLUDE carve-outs in a bounded way. Feature 46 is
the structural relaxation the handoff flagged as "the invariant-sensitive part —
plan it carefully": it generalizes the **candidate** the gate evaluates from a
single selector to a set, and generalizes each **other** ACTIVE template from a
single selector to a set. Get this wrong and two ACTIVE templates can cover the same
product — a direct violation of the disjoint-ACTIVE-set invariant that the whole
storefront-without-precedence design rests on (priority #1/#2).

Doing the **server** first (46), then the **UI** (47), keeps each slice verifiable:
46 is provable by unit tests + the *existing single-select UI still working end to
end* (a single product/collection is just an N=1 set); 47 is then a pure
presentational swap (single-select → multi-select picker + chip list).

**No migration.** Everything needed is already in the schema:
`@@unique([shopId, templateId, scope, scopeValue, mode])` already lets a template
hold several INCLUDE rows that differ only by `scopeValue`, and feature 40's
`buildRoutingProjection` / feature 41's `flattenActiveRulesToRoutingRules` already
fold **N** rows per template into the routing map (each PRODUCT/COLLECTION row →
one `byProduct`/`byCollection` entry pointing at the same handle). This slice is
application code only.

> **This spec was adversarially stress-tested (2026-07-10) before implementation.**
> The review surfaced one real correctness hole (Decision C below — a latent
> feature-45 bug the multi-value gate would inherit), one naming trap (the
> `MULTI_VALUE_SCOPES` vs `SINGLE_VALUED` collision), and a set of test-plan gaps —
> all folded into the steps below.

## The model this locks in (read this before the steps)

- **Multi-value applies to `PRODUCT` and `COLLECTION` only.** `ALL_PRODUCTS`,
  `PRODUCT_TYPE`, and `VENDOR` stay single-valued (a product has exactly one type
  and one vendor; "all products" carries no value). Locked 2026-07-09.
- **One scope *kind* per template; the *values* may be plural for the multi-valued
  kinds.** A template's INCLUDE rows are **homogeneous in `scope`**: either
  - 0 rows (NONE — unassigned), or
  - exactly 1 row for `ALL_PRODUCTS` / `PRODUCT_TYPE` / `VENDOR`, or
  - 1..N rows for `PRODUCT` (a set of product GIDs) or `COLLECTION` (a set of
    collection GIDs).

  A template is **never** a mix of kinds (no "PRODUCT:X + COLLECTION:Y" on one
  template) — `setTemplateScope` replaces the whole INCLUDE set with one homogeneous
  kind, so homogeneity is guaranteed at the write boundary, not left to callers.
  ("Show on these products **and** these collections" is a strictly more general
  feature; explicitly out of scope — see below.)
- **This is the new load-bearing invariant** the gate and the write path must both
  uphold. State it in every review of this slice.
- **Arity predicate — DO NOT reuse `assignmentOverlap.ts`'s `SINGLE_VALUED`.** The
  write path's "may this kind carry >1 value?" test is a **new, distinct** predicate:

  ```
  const MULTI_VALUE_SCOPES = new Set(["PRODUCT", "COLLECTION"]);  // 1..N values per template
  ```

  `assignmentOverlap.ts` has a module-private `SINGLE_VALUED = {PRODUCT,
  PRODUCT_TYPE, VENDOR}` meaning "single-valued **per product**" (drives the DISJOINT
  set-algebra). That is the **opposite** membership for `PRODUCT` and includes it,
  and omits `ALL_PRODUCTS`. Reusing it in the write path would make
  `setTemplateScope([PRODUCT:X, PRODUCT:Y])` reject (killing the whole feature) and
  `setTemplateScope([ALL_PRODUCTS, ALL_PRODUCTS])` pass. The two predicates answer
  different questions ("single per product" ≠ "single per template"); keep them
  separate and name the new one unambiguously.

## The invariant-sensitive core — how the gate generalizes to sets

Today `evaluateActivationConflicts` compares **one** `candidateSelector` against a
list of **one-selector-per-template** others (feature 42/44). Multi-value makes
*both* sides sets. The design keeps the pure resolver (feature 38) and the Shopify
probe (feature 39) **completely unchanged** and puts all the new orchestration in
the gate.

### Two collision facts

1. Two templates **collide** iff **∃** a pair `(candidateSelector cs, otherSelector
   os)` that overlaps — i.e. collision is the existence of *any* overlapping pair
   across the full cross-product of the two selector sets. Reasoning must be
   **per-pair**, then aggregated to templates (dedupe by `templateId`).
2. The EXCLUDE subtraction (feature 45 Decision A) is **also per-pair** — and must
   run **before** the dedupe-to-template step (see the CRITICAL note below): an
   overlapping pair is *resolved* only when it is product-attributable and the
   covering side excludes that product —
   - `cs` is `PRODUCT:X` **and** the *other* template excludes `X`, or
   - `os` is `PRODUCT:X` **and** the *candidate* excludes `X`.

   A template-level subtraction (feature 45's current shape, correct only because
   each template had one selector) is **wrong** for multi-value: candidate
   `{PRODUCT:X, PRODUCT:Y}` vs other `ALL_PRODUCTS EXCLUDE X` must still collide via
   the un-excluded `Y`.

> **CRITICAL — subtract per pair, THEN dedupe to templates (never the reverse).**
> A multi-value *other* template `t2 = {PRODUCT:A, PRODUCT:B}` arrives from
> `getActiveIncludeScopesExcept` as **two** rows both tagged `templateId=t2`. If the
> implementation dedupes colliding rows to one `t2` entry *first* and then applies
> the exclude filter *once* against a candidate that excludes only `A`, it would
> resolve `t2` entirely and let `t2` + the candidate both cover `B` — a silent
> disjoint-set violation. Subtraction is a filter over *pairs*; dedupe is the *last*
> step over the survivors. (Test in Step 2.)

### The gate algorithm (feature 46)

`getActiveIncludeScopesExcept` **already** returns one `ActiveIncludeScope`
(`{ templateId, templateName, scope, scopeValue }`) per INCLUDE row — so a
multi-value *other* template already arrives as several tagged rows. No change to
that read; it is exactly the "flattened, template-tagged other-selector list" the
gate wants.

The candidate becomes a **`ScopeSelector[]`**. Then, keeping feature 38's
`partitionOverlaps` and feature 39's `checkCrossDimensionConflicts` untouched, the
gate loops the candidate's selectors:

```
collidingPairs = []                       // { cs, other: ActiveIncludeScope }
for cs in candidateSelectors:
    { blocking, needsCheck } = partitionOverlaps(cs, others)   // feature 38, unchanged
    try:
        confirmed = checkCrossDimensionConflicts(admin, needsCheck)  // feature 39, unchanged
    catch:
        return { ok:false, conflicts:[<fail-closed "couldn't verify">] }   // priority #2
    for other in blocking:            collidingPairs.push({ cs, other })
    for c in confirmed:               collidingPairs.push({ cs, other: c.other })

# per-pair EXCLUDE subtraction (Decision A) applies to BOTH blocking and confirmed pairs,
# THEN dedupe survivors to distinct templates
remaining   = collidingPairs.filter(p => not resolvedByExclude(p, candidateExcludes, othersExcludesByTemplate))
conflicts   = dedupeByTemplateId(remaining).map(-> ActivationConflict)
return conflicts.length ? { ok:false, conflicts } : { ok:true }
```

Probing **per candidate selector** means each `confirmed` pair keeps its `cs` in
scope (the loop variable), so feature 39's generic `T = ActiveIncludeScope` return
shape is enough — **no signature change to feature 39** (it stays
`<T extends ScopeSelector>`; `ActiveIncludeScope` still satisfies it). Fail-closed
is preserved: any thrown probe in any iteration returns a block immediately.

`resolvedByExclude(p, candExcludes, othersExcludesByTemplate)` is a small **pure,
exported** helper (unit-tested in isolation, mirroring `shouldRebuildRouting`):

```
resolvedByExclude({cs, other}, candExcludes, othersExcludesByTemplate):
    if cs.scope == "PRODUCT" and cs.scopeValue and
       othersExcludesByTemplate.get(other.templateId)?.includes(cs.scopeValue):
        return true                              # Decision A case 1
    if other.scope == "PRODUCT" and other.scopeValue and
       candExcludes.has(other.scopeValue):
        return true                              # Decision A case 2
    return false
```

This is feature 45's exact subtraction, lifted from template-scope to pair-scope.
`getActiveExcludesByTemplate` (45) and `getExcludesForTemplate` (45) are the reads,
unchanged. **Its soundness depends on Decision C** (a covering side that excludes X
must not *also* explicitly INCLUDE X).

### Decision C — a template must never both INCLUDE and EXCLUDE the same product (fixes a latent feature-45 bug)

`resolvedByExclude`'s premise is *"the covering side excludes X ⟹ it does not cover
X."* That premise is **false** when X is also an explicit `INCLUDE PRODUCT:X` row on
that side, because on the storefront `byProduct` is resolved **before** the exclude
gate (feature 45 Decision B) — so the side still covers X. Concretely (reachable
**today, through the shipped feature-45 UI**):

1. Template `A = INCLUDE ALL_PRODUCTS`; add product `X` to "Except these products"
   (the exclude control shows under ALL_PRODUCTS) → `A` has `INCLUDE ALL_PRODUCTS` +
   `EXCLUDE X`.
2. Re-scope `A` to `PRODUCT:X`. `setTemplateScope` touches only INCLUDE, so
   `EXCLUDE X` **survives**; the engine still submits `excludes:[X]` and
   `excludesChanged = !sameGidSet([X],[X]) = false`, so `setTemplateExcludes` is
   never called → `A` now holds `INCLUDE PRODUCT:X` **+** `EXCLUDE PRODUCT:X`.
3. `B = INCLUDE PRODUCT:X` is already ACTIVE. Activate `A`: candidate `[PRODUCT:X]`,
   `candidateExcludes {X}`. Pair `(PRODUCT:X, B/PRODUCT:X)` → OVERLAP →
   `resolvedByExclude` case 2 fires (`candExcludes.has(X)`) → dropped → `{ok:true}`.
   `A` goes ACTIVE. Routing writes `byProduct[X] = A` **and** `= B` (last-write-wins)
   → **two ACTIVE templates cover X.** Disjoint-set violation.

**Fix (two cheap, complementary touchpoints, both inside 46's remit):**

- **Action-level pending reconciliation (the gate fix):** in `route.tsx`, after
  parsing the pending INCLUDE selectors and pending excludes, **drop any pending
  exclude GID that is in the pending INCLUDE PRODUCT set** *before* feeding either to
  the gate or to `setTemplateExcludes`. In the scenario above the pending
  `excludes:[X]` is dropped to `[]`, so the gate sees `candidateExcludes {}`, case 2
  does not fire, and `A` is correctly **BLOCKED**.
- **Write-level reconciliation (persisted-data + storefront fix):** in
  `setTemplateScope`, within the same `$transaction`, after writing an `INCLUDE
  PRODUCT` set, **delete any `EXCLUDE PRODUCT` row whose `scopeValue` is in the new
  INCLUDE set** — so persisted rows are never self-contradictory and the routing
  projection never emits `byProduct[X]` + `excludedProductGids:[X]` from one
  template (which is meaningless given Decision B). This also covers non-action
  writers (scratch routes, future callers).

**New invariant:** *a template's `INCLUDE PRODUCT` set and its `EXCLUDE PRODUCT` set
are disjoint.* State it in `data-model.md` §9. (This is a latent feature-45 defect;
46 is the natural place to close it because 46 rewrites both `setTemplateScope` and
the gate. Alternatively surfaceable as a standalone feature-45 patch if we want it
sooner — flag to the merchant/owner.)

## Scope of THIS slice

- **Write path** (`assignment.server.ts`) — `setTemplateScope` takes a **homogeneous
  `ScopeSelector[]`** (create-or-replace the whole INCLUDE set in one
  `$transaction`: `deleteMany` INCLUDE → *reconcile EXCLUDE per Decision C* →
  `createMany`). Validates arity (via the new `MULTI_VALUE_SCOPES` predicate) + kind
  homogeneity + each value; dedupes by value; touches EXCLUDE rows **only** to delete
  contradictions (Decision C) — otherwise the EXCLUDE carve-outs from 45 survive
  unchanged. `clearTemplateScope` unchanged (already deletes all INCLUDE). New read
  `getTemplateIncludeSelectors(shopId, templateId): ScopeSelector[]` (all INCLUDE
  rows as selectors, INCLUDE-only; `[]` = no scope) for the gate + the action's diff.
- **Pure resolver** (`assignmentOverlap.ts`) — **no change** to `classifyScopePair`
  / `partitionOverlaps` / their tests. (The gate loops `partitionOverlaps` per
  candidate selector.)
- **Cross-dimension probe** (`assignmentConflict.server.ts`) — **no change** (still
  generic over `T extends ScopeSelector`; called once per candidate selector).
- **Gate** (`assignmentActivation.server.ts`) — `evaluateActivationConflicts`'
  `candidateScope?: ScopeSelector | null` becomes `candidateScopes?: ScopeSelector[]`
  (`undefined` ⇒ read persisted via `getTemplateIncludeSelectors`; `[]` ⇒ no scope
  ⇒ trivially passes). Per-pair collision + per-pair EXCLUDE subtraction (over
  blocking **and** confirmed pairs) + dedupe-to-distinct-templates as the last step.
  New pure exported `resolvedByExclude` helper. The default-read path switches from
  `getAssignmentForTemplate` to `getTemplateIncludeSelectors`.
- **Editor Save action** (`route.tsx`) — parse a **`scopeValues` array** (accept the
  legacy single `scopeValue` for backward compatibility so the still-single-select
  UI keeps working), build a homogeneous `ScopeSelector[]`, reconcile pending
  excludes per Decision C, thread the set through the gate → `setTemplateScope`
  (multi) / `clearTemplateScope` (empty). The `scopeChanged` diff becomes a
  **selector-set** comparison (order-independent) via `getTemplateIncludeSelectors`.
  Both create + edit branches forward the **full array** (never `selectors[0]`).
- **List-page action** (`app.templates.tsx`) — **no change** (it calls the gate with
  no candidate scope, so it reads the persisted selector *set* through the same
  default-read path — now `getTemplateIncludeSelectors`).
- **Routing rebuild** (`routing.server.ts`) — **no change**; a new projection test
  (Step 4) proves it already writes N `byProduct`/`byCollection` entries (all → the
  one handle) once N INCLUDE rows exist.
- **Loader + engine + UI** — **not touched in 46**, with one documented hazard (see
  the boundary note in Step 5). The loader keeps `getAssignmentForTemplate` (single,
  `findFirst`) and the engine keeps its scalar `scope`/`scopeValue`; the single-select
  picker writes an N=1 set. Reshaping the loader to return the full set and the picker
  to multi-select is **feature 47**.

## Decisions (settled)

- **Multi-value = PRODUCT + COLLECTION only** (2026-07-09). Enforced by the new
  `MULTI_VALUE_SCOPES` predicate (see "The model", above) — **not** by reusing
  `assignmentOverlap.ts`'s `SINGLE_VALUED`.
- **One scope kind per template** — the homogeneous-INCLUDE-set invariant above.
  Mixing kinds is out of scope.
- **INCLUDE ∩ EXCLUDE disjoint per template** (Decision C) — the gate's exclude
  subtraction is only sound if a covering side never both INCLUDEs and EXCLUDEs the
  same product; enforced by the action reconciliation + the `setTemplateScope`
  in-transaction cleanup.
- **`setTemplateScope` takes the full selector set** (not a single value), because
  the atomic create-or-replace must write all values in one transaction — a partial
  set would break the disjoint invariant mid-write. Keep the name; change the arg to
  `ScopeSelector[]`. (Its unit tests are rewritten to the array shape.)
- **Server-only slice; UI stays single-select.** 46 is done and verifiable without
  a multi-select picker. The action accepts `scopeValues` (array) now so 47 is a
  pure UI swap; until then the engine sends a single `scopeValue`, which the parser
  normalizes to a 1-element set.
- **Per-pair, not per-template, EXCLUDE subtraction** — the substance of the gate
  change. Feature 38's pure matrix stays INCLUDE-only and untouched.
- **Empty valued set = incomplete, not clear.** A `PRODUCT`/`COLLECTION` kind with
  zero values is an *incomplete* scope (like feature 44's incomplete state), not
  "NONE". In 46 the parser/write reject an empty valued set; the UI Save-disable is
  feature 47's job. `NONE` (kind = the sentinel) remains the only "clear" path.

## What already exists (so we don't rebuild it)

- `@@unique([shopId, templateId, scope, scopeValue, mode])` — N distinct-value
  INCLUDE rows coexist; literal dupes are blocked **for non-null-valued kinds
  only** (Postgres treats NULLs as distinct with no `NULLS NOT DISTINCT`, so it does
  **not** block two `ALL_PRODUCTS/null` rows — the arity check is the sole guard for
  ALL_PRODUCTS; consider a single `create` for that path so it never leans on the
  index).
- `flattenActiveRulesToRoutingRules` (41) + `buildRoutingProjection` (40) already
  fold N rows/template into the map; disjointness across templates is gate-enforced,
  so no two templates ever share a `byProduct`/`byCollection` key.
- `getActiveIncludeScopesExcept` (37/42) already returns one tagged row per INCLUDE
  row — the pre-flattened, template-tagged other-selector list the multi-value gate
  consumes. **No change.**
- `classifyScopePair` / `partitionOverlaps` (38) — pure per-pair resolver, reused
  unchanged by the candidate-selector loop.
- `checkCrossDimensionConflicts` (39) — generic per-pair Shopify probe, reused
  unchanged (called per candidate selector).
- `getActiveExcludesByTemplate` / `getExcludesForTemplate` (45) — the EXCLUDE reads
  the per-pair subtraction uses, unchanged.
- `validateScope("PRODUCT"|"COLLECTION", value)` (37) — validates each set member.

## Correctness invariants (must hold)

- **Disjoint ACTIVE set (priority #1/#2).** After the multi-value gate, no two ACTIVE
  templates cover the same product. The gate checks the **full cross-product** of
  selector pairs, subtracts only genuinely product-attributable carve-out-resolved
  pairs, subtracts **before** deduping to templates, and (Decision C) never treats a
  side that also explicitly INCLUDEs X as "excluding" X.
- **Homogeneous INCLUDE set (new).** Every INCLUDE row of a template shares one
  `scope`; single-valued kinds carry ≤1 row, PRODUCT/COLLECTION carry 1..N. Enforced
  by `setTemplateScope` via `MULTI_VALUE_SCOPES`.
- **INCLUDE ∩ EXCLUDE disjoint per template (new, Decision C).**
- **Atomic block.** A blocked activation writes nothing.
- **Fail closed.** Any unverifiable probe (in any candidate-selector iteration)
  blocks; never a silent pass.
- **Atomic replace.** `setTemplateScope` replaces the whole INCLUDE set (+ Decision-C
  cleanup) in one `$transaction`; a failure leaves the prior state intact
  (`ok:false`, no partial write).
- **Shop isolation (priority #1).** The new read, the write, the gate reads, and the
  probe stay `where { shopId }` / ownership-gated / session-bound.
- **EXCLUDE carve-outs otherwise survive an INCLUDE change** — `setTemplateScope`
  touches EXCLUDE rows *only* to remove a Decision-C contradiction; unrelated
  carve-outs are untouched.

## Steps (each independently verifiable)

### Step 1 — Multi-value write + read (`assignment.server.ts`)
- `setTemplateScope(shopId, templateId, selectors: ScopeSelector[])`:
  reject empty; reject mixed kinds; reject >1 value unless `MULTI_VALUE_SCOPES.has(kind)`;
  `validateScope` each value; dedupe by value; ownership-gate; `$transaction`:
  `deleteMany({ mode: INCLUDE })` → **delete `EXCLUDE PRODUCT` rows whose value ∈ the
  new INCLUDE set (Decision C)** → `createMany`. Returns `{ ok, count }` /
  `{ ok:false, error }`.
- `getTemplateIncludeSelectors(shopId, templateId): Promise<ScopeSelector[]>` —
  `findMany({ mode: INCLUDE })` → `{ scope, scopeValue }[]`, shop-scoped.
- **Tests (rewrite the existing `setTemplateScope` block to the array shape):**
  - single-value still writes one row; multi-value writes N `createMany` rows,
    shop-scoped, INCLUDE-only.
  - **arity pins:** PRODUCT and COLLECTION accept N>1; ALL_PRODUCTS / PRODUCT_TYPE /
    VENDOR reject N>1 (include the ALL_PRODUCTS null-value single-row case).
  - dedupe repeated values; reject mixed-kind; reject empty; ownership block writes
    nothing; transaction failure → `ok:false`.
  - **Decision C:** writing `INCLUDE [PRODUCT:X]` when an `EXCLUDE PRODUCT:X` row
    exists deletes that EXCLUDE row in-transaction; an `EXCLUDE PRODUCT:Z` (Z not
    included) survives.
  - **`getTemplateIncludeSelectors`:** seed a template with `INCLUDE PRODUCT:A`,
    `INCLUDE PRODUCT:B`, **and** an `EXCLUDE PRODUCT:C` row → assert it returns
    exactly `[{PRODUCT,A},{PRODUCT,B}]` (all N, INCLUDE-only, no C) via a
    `where.mode === "INCLUDE"`, shop-scoped `findMany`.

### Step 2 — Gate over selector sets (`assignmentActivation.server.ts`)
- `evaluateActivationConflicts(admin, shopId, templateId, candidateScopes?:
  ScopeSelector[], candidateExcludes?)`. `undefined` ⇒ read persisted via
  `getTemplateIncludeSelectors`; `[]` ⇒ `{ ok:true }`. Per-candidate-selector loop;
  collect colliding pairs; per-pair `resolvedByExclude` over **blocking + confirmed**;
  dedupe to distinct templates **last**. Export pure `resolvedByExclude`.
- **Test MIGRATION (not just "extend"):** the default-read path now calls
  `getTemplateIncludeSelectors`, so every existing no-candidate-arg test (the
  trivial-pass, definite-OVERLAP, fail-closed, and the two feature-45 persisted-
  carve-out tests) must **mock `getTemplateIncludeSelectors`** (returning a 1-element
  array) and assert the default path calls it (not `getAssignmentForTemplate`). Every
  existing explicit-candidate test that passed a bare `{scope,scopeValue}` or `null`
  as the 4th arg migrates to `[{...}]` / `[]` (the former `null` = "explicitly
  scope-less" → `[]`).
- **New tests:**
  - **Multi-value candidate:** `{PRODUCT:X, PRODUCT:Y}` vs `ALL_PRODUCTS EXCLUDE X` →
    **still blocks** (via Y); add `EXCLUDE Y` → passes (Decision A case 2, per-pair).
  - **Multi-value OTHER, partial resolve (the dedupe-before-subtract trap):**
    candidate `ALL_PRODUCTS` + excludes `[A]`, other `t2 = {PRODUCT:A, PRODUCT:B}`
    (two rows, same `templateId`) → **ok:false, exactly one conflict naming t2**
    (blocked via B). Then excludes `[A,B]` → ok:true. *Fails under any
    dedupe-before-subtract implementation.*
  - **Probe-confirmed pair resolved by EXCLUDE:** candidate `PRODUCT:X` vs other
    `PRODUCT_TYPE:Phones`, probe confirms X∈Phones, `othersExcludes {t2:[X]}` →
    ok:true; drop the exclude → ok:false. Plus the multi-value variant (`{PRODUCT:X,
    PRODUCT:Y}` vs `PRODUCT_TYPE:Phones`, both probes confirm, exclude X only → still
    blocks via Y).
  - **Decision C:** candidate `[PRODUCT:X]` with pending `candidateExcludes {X}` vs
    other `PRODUCT:X` → **must BLOCK** (the exclude does not resolve a self-included
    product). (This is the pending-state form; the action drops X from the pending
    excludes, and this test pins the gate's behavior if a contradictory set ever
    reaches it.)
  - **dedupe-by-templateId:** `{PRODUCT:X, PRODUCT:Y}` vs single other
    `ALL_PRODUCTS t2` → ok:false, `conflicts.length === 1` (t2 once). `{PRODUCT:X,
    PRODUCT:Y}` vs `[PRODUCT:X t2, PRODUCT:Y t3]` → ok:false, conflicts map to exactly
    `{t2, t3}`.
  - **fail-closed:** any per-selector probe throw → block (unchanged).
  - **probe-free block example (correct wording):** use `PRODUCT` multi-value —
    candidate `{PRODUCT:X, PRODUCT:Z}` vs other `PRODUCT:X` blocks with **no probe**
    (cs=X → OVERLAP no probe; cs=Z → same-scope-diff-value PRODUCT → DISJOINT no
    probe). *(Do NOT use a COLLECTION multi-value example for "no probe": a
    non-matching COLLECTION pair is NEEDS_CHECK and DOES fire a probe — mock it.)*

### Step 3 — Save action threads selector sets (`route.tsx`)
- Extract `parsePendingScope` as a **pure, exported** helper returning
  `{ provided, selectors: ScopeSelector[] }`: read `payload.scopeValues` (array) when
  present, else fall back to the legacy single `payload.scopeValue`; `NONE` ⇒
  `selectors: []`; validate + dedupe + homogeneity; reject an empty valued set.
  Reconcile pending excludes per Decision C (drop excludes ∈ pending INCLUDE PRODUCT
  set) before the gate + `setTemplateExcludes`. `scopeChanged` = order-independent
  set compare of pending vs `getTemplateIncludeSelectors`. **Both create + edit
  branches forward the full `selectors` array** to `evaluateActivationConflicts` and
  `setTemplateScope`.
- **Tests (pure bits):**
  - `parsePendingScope`: `scopeValues:[A,B]` → 2 selectors; legacy `scopeValue:A` → 1
    selector; `NONE` → `[]`; invalid GID → reject; empty valued kind → reject.
  - set-diff key: `{A,B}` vs `{A,C}` → **changed** (member swap, same cardinality);
    `{A,B}` vs `{B,A}` → **unchanged** (reorder); `{A}` vs `{A,B}` → changed; kind
    change `PRODUCT:A` vs `COLLECTION:A` → changed.
  - Decision-C reconciliation: pending INCLUDE `[PRODUCT:X]` + pending excludes `[X]`
    → reconciled excludes `[]`.
  - a focused assertion that both branches pass the full array (guarding against a
    `selectors[0]` regression that only surfaces in feature 47).

### Step 4 — Confirm routing carries N rows (add the missing test)
- **New projection test** (the "confirm, don't change" claim needs a backing test):
  `flattenActiveRulesToRoutingRules([{ shopifyMetaobjectHandle: "template-a",
  assignments: [PRODUCT:A, PRODUCT:B] }])` → two rules both `templateHandle:
  "template-a"`; `buildRoutingProjection` → `byProduct { A: "template-a", B:
  "template-a" }`. Repeat for `COLLECTION` → `byCollection`. No writer change.

### Step 5 — Manual verification (dev store)
- **Boundary (do NOT round-trip multi-value through the single-select editor in 46).**
  The loader's `getAssignmentForTemplate` (`findFirst`, no `orderBy`) returns one
  arbitrary row of an N>1 set, and the still-single-select editor Save would then
  **collapse the set to that one value** (the `scopeChanged` set-diff sees `{X}` vs
  `{X,Y}` and `setTemplateScope([PRODUCT:X])` drops Y). So verify multi-value **only**
  via the scratch route + the routing map (Neon + `$app:routing`) + the storefront,
  and tear the seed **down via the scratch route** — never by opening it in the
  editor. (Feature 47's loader/picker reshape is the prerequisite before any N>1
  template is exposed to the editor.)
- **Single-select regression:** through the existing UI, a single product/collection
  still activates, gates, routes, and renders (N=1 unbroken).
- **Multi-value (scratch seed):** seed `T1 = ACTIVE, INCLUDE [PRODUCT:X, PRODUCT:Y]`
  via a scratch route calling `setTemplateScope` (mirrors the feature-41/43 pattern;
  remove after). Confirm the routing map shows `byProduct {X→T1, Y→T1}` and both X's
  and Y's storefront pages render T1. Seed `T2 = ACTIVE, INCLUDE [PRODUCT:Z]`
  (disjoint) → both activate. Make `T2` include `Y` (overlap) → its activation
  **blocks** with the conflict banner naming T1. Restore the store to its pre-test
  state.

### Step 6 — Docs
- Update `data-model.md` §9 (one scope kind per template; PRODUCT/COLLECTION are
  1..N; the gate reasons per selector-pair with per-pair EXCLUDE subtraction before
  deduping to templates; **INCLUDE ∩ EXCLUDE disjoint per template — Decision C**) and
  `progress-tracker.md`. Advance "Next" to feature 47 (multi-value scopes — UI).

## Out of scope (this file)
- **The multi-select UI** (picker + chip list + engine array state + loader array
  shape) — feature 47.
- **Mixed-kind scopes** ("these products **and** these collections **and** this
  vendor" on one template) — a strictly more general model; not an MVP need.
- **Multi-value TYPE/VENDOR** ("vendor Acme **or** Bose") — single-valued by
  decision; would change same-scope-diff-value from DISJOINT to NEEDS_CHECK.
- **Per-product overflow materialization** + the list "Assigned Products" count —
  still deferred (the scaling valve behind a threshold).
- Any change to the pure resolver (38), the probe (39), or the routing writer (41)
  beyond the added N-row projection test.

## Open / optional
- **Probe count.** A candidate with M multi-values costs up to
  `M × (NEEDS_CHECK-eligible other rows)` `products(first:1)` probes — where
  NEEDS_CHECK-eligible = cross-dimension other rows **plus same-`COLLECTION`-
  different-value other rows** (a same-`COLLECTION`-diff-value pair is multi-valued →
  NEEDS_CHECK → probes; it is *not* cross-dimension, so the earlier "M×K
  cross-dimension" framing undercounts). Each probe is tiny, never a catalog scan.
  Acceptable for MVP bounded sets (the same ceiling feature 45 noted for the 128 KB
  routing-metafield cap frames very large sets as deferred-materialization
  territory). Optional optimizations, deferred: short-circuit probing an *other*
  template already confirmed colliding; or batch a candidate's PRODUCT ids into one
  `(id:X1 OR id:X2 …) AND <fragment>` probe. Neither changes correctness.
- **Loader determinism.** Optionally add an `orderBy` to `getAssignmentForTemplate`'s
  `findFirst` so the single-select editor's view of an (illegitimate-in-46) N>1
  template is at least deterministic. Fully resolved by feature 47's full-set loader.
- **Two-write atomicity.** `setTemplateScope` + `setTemplateExcludes` +
  `saveTemplateForShop` remain separate post-gate writes (same posture as 44/45); a
  partial failure is surfaced, not transactional. Fold into one `$transaction` only
  if it ever matters.
- **Empty-set UX** is feature 47's (Save-disable on a valued kind with 0 values).
