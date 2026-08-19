# Feature 38 — Scope-overlap resolver (pure set-algebra)

## Goal in one sentence

A **pure, dependency-free** `app/utils/assignmentOverlap.ts` that classifies a
candidate template's scope against another template's scope as **OVERLAP**
(definitely conflicts), **DISJOINT** (definitely safe), or **NEEDS_CHECK**
(can't be decided without one Shopify existence query) — the decision core the
DRAFT→ACTIVE dry-run is built on, with **no DB and no Admin API**.

## Why this is next

The activation gate (feature 42) must answer "does this template's scope overlap
any **other ACTIVE** template's scope?" cheaply and correctly (data-model §9). The
answer splits in two: most pairs are decidable by pure string set-algebra
(O(1), no network); only genuinely cross-dimension / multi-valued pairs need a
`products(first:1, query:…)` probe (feature 39). This slice is that pure split —
fully unit-testable in isolation, exactly like `gridNav.ts` sits under
`useGridKeyboardNav.ts`. It writes nothing and calls nothing.

## Scope of THIS slice

- **INCLUDE scopes only.** Every ACTIVE template has one INCLUDE rule (feature
  37). `EXCLUDE` carve-outs *narrow* a scope and change the algebra; handling them
  is deferred to feature 45. This resolver assumes each side is a single INCLUDE
  selector.
- **Pure module only.** No Prisma, no Admin API, no GraphQL strings. Emitting the
  actual `products(query,…)` and running it is feature 39; wiring the verdicts
  into the status change is feature 42.
- **TAG is absent** (post-MVP) — the scope set is the five from
  `assignmentScope.ts`.

## The classification matrix (the spec)

A scope is `{ scope, scopeValue }`. Two facts drive everything:

- **`ALL_PRODUCTS` is universal** — it matches every product, so it overlaps
  *any* other scope (including a second `ALL_PRODUCTS` — "a shop default already
  exists", data-model §9).
- **`PRODUCT` / `PRODUCT_TYPE` / `VENDOR` are single-valued per product** — a
  product has exactly one id, one product_type, one vendor. So **same scope +
  different value ⇒ DISJOINT** (no product can match both). **`COLLECTION` is
  multi-valued** — a product can belong to many collections, so two *different*
  collection rules *might* share a product ⇒ must ask Shopify.

Unordered-pair truth table (symmetric — `classify(a,b) === classify(b,a)`):

| a \ b        | ALL_PRODUCTS | PRODUCT            | PRODUCT_TYPE | VENDOR     | COLLECTION         |
| ------------ | ------------ | ------------------ | ------------ | ---------- | ------------------ |
| ALL_PRODUCTS | OVERLAP      | OVERLAP            | OVERLAP      | OVERLAP    | OVERLAP            |
| PRODUCT      | —            | same→OVERLAP / diff→DISJOINT | NEEDS_CHECK  | NEEDS_CHECK | NEEDS_CHECK        |
| PRODUCT_TYPE | —            | —                  | same→OVERLAP / diff→DISJOINT | NEEDS_CHECK | NEEDS_CHECK        |
| VENDOR       | —            | —                  | —            | same→OVERLAP / diff→DISJOINT | NEEDS_CHECK        |
| COLLECTION   | —            | —                  | —            | —          | same→OVERLAP / diff→**NEEDS_CHECK** |

Rules, in evaluation order:

1. **Either side `ALL_PRODUCTS`** → `OVERLAP`.
2. **Same scope, single-valued** (`PRODUCT` / `PRODUCT_TYPE` / `VENDOR`):
   value-equal → `OVERLAP`; else `DISJOINT`.
3. **Same scope `COLLECTION`:** value-equal → `OVERLAP`; else `NEEDS_CHECK`.
4. **Different scopes** (neither `ALL_PRODUCTS`) → `NEEDS_CHECK`.

A `NEEDS_CHECK` verdict carries the two **selectors** to AND together into the
existence probe (feature 39): `{ selectors: [candidateScope, otherScope] }`.
Because `ALL_PRODUCTS` always short-circuits to `OVERLAP` (rule 1), a selector
list **never** contains `ALL_PRODUCTS` — feature 39 only ever renders
`PRODUCT` / `PRODUCT_TYPE` / `VENDOR` / `COLLECTION` query fragments.

## Correctness invariants (must hold)

- **Symmetric:** `classifyScopePair(a, b)` and `classifyScopePair(b, a)` return the
  same *kind* (selector order may differ; feature 39 ANDs them, so order is
  irrelevant). A unit test asserts symmetry across the whole matrix.
- **Conservative toward safety of the merchant's live storefront:** the resolver
  must **never** emit `DISJOINT` for a pair that could share a product. When
  unsure, it emits `NEEDS_CHECK` (feature 39 confirms), never `DISJOINT`. Only the
  three provable-disjoint cases (rule 2, different single value) return
  `DISJOINT`.
- **Pure:** no imports beyond the `AssignmentScopeValue` type from
  `assignmentScope.ts`; deterministic; no side effects.

---

## Steps (each independently verifiable)

### Step 1 — `classifyScopePair` + types

- New `app/utils/assignmentOverlap.ts`:
  - `ScopeSelector = { scope: AssignmentScopeValue; scopeValue: string | null }`.
  - `PairVerdict = { kind: "OVERLAP" } | { kind: "DISJOINT" }
    | { kind: "NEEDS_CHECK"; selectors: [ScopeSelector, ScopeSelector] }`.
  - `classifyScopePair(candidate, other): PairVerdict` — implements rules 1–4
    above.
- **Test:** `assignmentOverlap.test.ts` — one assertion per matrix cell (both the
  same-value and different-value branches), plus a symmetry sweep
  (`classify(a,b).kind === classify(b,a).kind` over every pair), plus the
  selector-never-contains-ALL_PRODUCTS guarantee.

### Step 2 — `partitionOverlaps` convenience

- Add `partitionOverlaps<T extends ScopeSelector>(candidate, others: T[])` that
  maps `classifyScopePair` over `others` and buckets them:
  `{ blocking: T[]; needsCheck: { other: T; selectors: [ScopeSelector,
  ScopeSelector] }[] }` — `OVERLAP`s go to `blocking`, `NEEDS_CHECK`s to
  `needsCheck` (carrying the other template so feature 42 can name the collision),
  `DISJOINT`s dropped. This is the exact shape feature 39 consumes (run the probes
  for `needsCheck`, merge any hit into `blocking`).
- The caller (feature 42) is responsible for passing **only other ACTIVE
  templates** (never the candidate itself) and for the "candidate has no scope →
  no conflicts" short-circuit; document that here — this module assumes a real
  candidate scope.
- **Test:** a mixed `others` list buckets correctly; an empty list yields empty
  buckets; `blocking` preserves the `other` reference for messaging.

### Step 3 — Docs

- Update `context/progress-tracker.md`: feature 38 done (one line + pointer);
  advance the assignment "Next" to feature 39.
- No `data-model.md` change (this only *implements* the §9 overlap algebra; if the
  matrix ever needs to deviate from §9, reconcile §9 first).

---

## Out of scope (this file)

- Rendering / running the `products(first:1, query:…)` existence probe (feature
  39 owns the GraphQL + response narrowing).
- Wiring verdicts into DRAFT→ACTIVE (feature 42).
- `EXCLUDE` carve-out algebra (feature 45).
- Any DB read/write or Admin API call.

## Open / optional

- **Selector ordering in `NEEDS_CHECK`.** Emitted as `[candidate, other]` for
  predictability; semantically order-free (feature 39 ANDs them). Not surfaced.
- **`priority` stays dormant** — the resolver never reads it; disjointness is the
  only guarantee (data-model §9).
