# Feature 39 — Cross-dimension conflict check (Shopify existence probe)

## Goal in one sentence

A shop-scoped `app/shopify/assignmentConflict.server.ts` that takes feature 38's
`NEEDS_CHECK` pairs, renders each into a `products(first: 1, query: A AND B)`
existence probe, runs it against the Admin API, and narrows a non-empty result
into a **concrete conflict** (which ACTIVE template collides + why) — the second
half of the DRAFT→ACTIVE dry-run (data-model §9), where the pure set-algebra
can't decide.

## Why this is next

Feature 38 (`assignmentOverlap.ts`) splits a candidate's overlaps into two
buckets: `blocking` (provable `OVERLAP`s) and `needsCheck` (genuinely
cross-dimension / multi-valued pairs it can't settle without asking Shopify).
This slice resolves that second bucket. Per data-model §9, a cross-dimension or
multi-valued pair is tested with **one Shopify existence query per pair** —
`products(first: 1, query: "product_type:'X' AND vendor:'Y'")` — where a
non-empty result means at least one product matches both scopes, i.e. a real
overlap. Cost is O(needsCheck) tiny queries, never a catalog scan. With 39 in
place, feature 42 can merge `blocking` + confirmed-`needsCheck` into the single
"does this template collide with any ACTIVE template?" answer that gates
activation.

## Scope of THIS slice

- **Resolve `NEEDS_CHECK` pairs only.** Input is the `needsCheck: NeedsCheck<T>[]`
  bucket from `partitionOverlaps` (feature 38). The `blocking` bucket is already
  decided; this slice never re-examines it.
- **Existence probe only.** `first: 1` — we ask "does *any* product match both
  selectors?", never enumerate. No pagination, no product data read beyond the
  presence of one edge.
- **INCLUDE scopes only** — every selector is one INCLUDE rule (feature 37).
  `EXCLUDE` carve-outs change which products a scope covers and are deferred to
  feature 45; a probe here treats each side as its raw INCLUDE selector.
- **No wiring into activation.** Emitting the verdict list is this slice; feeding
  it into DRAFT→ACTIVE (block vs allow, error surfacing, projection rebuild) is
  feature 42.
- **`ALL_PRODUCTS` never reaches here** — feature 38 short-circuits it to
  `OVERLAP` (`blocking`), so a probe's selectors are always one of
  `PRODUCT` / `PRODUCT_TYPE` / `VENDOR` / `COLLECTION`. The query builder
  defensively rejects `ALL_PRODUCTS` (it should be unreachable).

## Decisions (settled)

- **Lives in `app/shopify/`, split pure-vs-live** — same shape as
  `metafieldDefinitions.server.ts` (code-standards → File Organization: "all
  Shopify API calls" live in `app/shopify/`). The **live `admin.graphql` call**
  is the thin runner; the **pure query builder** and the **pure response
  narrower** are exported alongside it and are the unit-tested parts (the live
  call is mocked at the boundary, not exercised — matching the testing strategy
  in the metafieldDefinitions test).
- **Shop isolation is structural, not a Prisma `where`.** The `admin` client is
  bound to the current shop's session token (`authenticate.admin(request)`), so a
  `products(...)` probe can only ever see THIS shop's catalog (priority #1). The
  caller passes the session-bound `admin`; this module never constructs one.
- **Query-fragment mapping per scope** (data-model §9):
  - `PRODUCT_TYPE` → `product_type:'<value>'`
  - `VENDOR` → `vendor:'<value>'`
  - `COLLECTION` → `collection_id:<numericId>` (extract the numeric id from the
    `gid://shopify/Collection/<id>` selector value)
  - `PRODUCT` → `id:<numericId>` (extract from `gid://shopify/Product/<id>`)

  The two fragments are joined with ` AND `; the pair is fed to
  `products(first: 1, query: $query)`.
- **Injection-safe rendering.** `product_type` / `vendor` values are arbitrary
  merchant strings — they are wrapped in single quotes with any embedded
  backslash and single-quote escaped, so a value like `O'Neil` or a stray quote
  can't break or widen the search query. `PRODUCT` / `COLLECTION` values are
  reduced to their numeric id and asserted numeric (defence-in-depth over the
  feature 37 `gid://` shape check), so they need no quoting.
- **Fail closed on error.** A network / GraphQL error (or a throttle we can't
  complete) must **never** be narrowed to "no conflict" — that would let a
  conflicting template go ACTIVE and corrupt the disjoint invariant on the live
  storefront (priority #2). The runner **throws**; feature 42 turns a thrown probe
  into "couldn't verify — activation blocked", not a silent all-clear.
- **GraphQL validated** with the shopify-dev MCP `validate_graphql_codeblocks`
  (target the app's API version, as `metaobjects.server.ts` did @ 2025-10) before
  the query string is trusted.
- **Output carries the `other` template + a reason.** Each confirmed collision is
  `{ other: T; reason }`, where `reason` names the overlapping dimensions (e.g.
  the rendered probe query) so feature 42/44 can tell the merchant *which* ACTIVE
  template collides and *why*. Shopper/merchant-facing copy polish is feature 44;
  this slice emits a truthful structured reason, not final UI text.

## What already exists (so we don't rebuild it)

- `partitionOverlaps` / `NeedsCheck<T>` / `ScopeSelector` (feature 38,
  `app/utils/assignmentOverlap.ts`) — this slice consumes `needsCheck` verbatim
  and its `selectors: [ScopeSelector, ScopeSelector]`.
- `fetchProductMetafieldDefinitions` in `metafieldDefinitions.server.ts` — the
  live-call + pure-narrower split and `isRecord` / `asString` narrowing helpers
  this module mirrors.
- `metafieldDefinitions.test.ts` — the boundary-mock test style (build a
  well-formed response literal, assert the pure transform; the live
  `admin.graphql` is not exercised) the new test mirrors.
- The `AssignmentScopeValue` type + `gid://shopify/` shape guarantee from
  `assignmentScope.ts` (feature 37).

## Correctness invariants (must hold)

- **Never a false all-clear.** The only path that reports "no conflict" for a
  pair is a probe that **successfully returned zero edges**. Any error → throw,
  never `[]`. (Fail-closed; priority #2.)
- **Never a probe on `ALL_PRODUCTS`.** The builder rejects it; upstream guarantees
  it never appears. A selector list is always two of
  `PRODUCT`/`PRODUCT_TYPE`/`VENDOR`/`COLLECTION`.
- **Query-injection safe.** No merchant string reaches the query unescaped; a
  value containing `'`, `\`, or `AND`/`OR`/`:` cannot alter the query's structure
  or match products outside its scope.
- **Existence, not enumeration.** `first: 1` always; the narrower reads only
  *whether* an edge exists, never product fields.
- **Pure parts are pure.** The query builder and response narrower import only
  types, are deterministic, and have no side effects; only the runner touches
  `admin`.
- **Shop-scoped by construction** — the probe uses the passed session-bound
  `admin`; no `shopId` is threaded because the token already is the isolation.

---

## Steps (each independently verifiable)

### Step 1 — Pure query builder

- New `app/shopify/assignmentConflict.server.ts`:
  - `buildScopeFragment(selector: ScopeSelector): string` — renders one selector
    to its Shopify product-search fragment per the mapping above; escapes
    merchant strings; extracts + asserts numeric ids for `PRODUCT`/`COLLECTION`;
    throws on `ALL_PRODUCTS` (unreachable guard).
  - `buildExistenceQuery(a: ScopeSelector, b: ScopeSelector): string` — ` AND `s
    the two fragments (order-free; feature 38 already guarantees both are
    non-`ALL_PRODUCTS`).
- **Validate** the `products(first: 1, query: …)` operation with
  `validate_graphql_codeblocks` before wiring it in.
- **Test:** `assignmentConflict.test.ts` — one assertion per scope→fragment
  (`product_type`/`vendor`/`collection_id`/`id`), the AND join for a
  representative cross-dimension pair (type×vendor, product×collection,
  collection×collection), an escaping case (`O'Neil` / embedded quote), a
  gid→numeric extraction case, and the `ALL_PRODUCTS`-throws guard.

### Step 2 — Pure response narrower

- Add `hasMatchingProduct(json: unknown): boolean` — narrows the Admin response
  (`data.products.edges`) with the `isRecord` pattern; returns `true` iff at least
  one edge is present. Malformed / missing shape → `false` **only** when the call
  itself succeeded (errors are handled by the runner, Step 3), never as an error
  swallow.
- **Test:** a one-edge response → `true`; an empty-edges response → `false`; a
  malformed/absent `products` shape → `false`; a response carrying a top-level
  `errors` array is *not* narrowed here (the runner rejects it first).

### Step 3 — Live runner

- Add `checkCrossDimensionConflicts<T extends ScopeSelector>(admin,
  needsCheck: NeedsCheck<T>[]): Promise<ConfirmedConflict<T>[]>`:
  - For each `needsCheck` entry: build the query from its two `selectors`, run
    `admin.graphql(EXISTENCE_QUERY, { variables: { query } })`, reject on a
    GraphQL `errors` array / non-ok response (**throw** — fail closed), narrow
    with `hasMatchingProduct`; a match pushes `{ other, reason }` (reason = the
    rendered query so the collision is legible), a non-match is dropped.
  - Returns only the **confirmed** collisions — the shape feature 42 merges into
    the `blocking` bucket.
- Runs probes sequentially (count is O(active rules), tiny); a parallel fan-out is
  a possible later optimization, noted below, not built here.
- **Test:** the runner is exercised with a **mocked `admin.graphql`** (boundary
  mock, per the testing strategy): a match → confirmed conflict carrying `other`;
  a no-match → dropped; a GraphQL-`errors` response → the promise **rejects**
  (fail-closed assertion); an empty `needsCheck` → `[]` with no call made.

### Step 4 — Docs

- Update `context/progress-tracker.md`: feature 39 done (one line + this pointer);
  advance the assignment "Next" to feature 40 (routing-projection builder +
  `add-routing` migration).
- No `data-model.md` change (this implements the §9 existence-probe already
  specified there; reconcile §9 first if the query shape ever needs to deviate).

---

## Out of scope (this file)

- Wiring verdicts into DRAFT→ACTIVE — block/allow decision, error→"blocked"
  surfacing, projection rebuild (feature 42).
- `EXCLUDE` carve-out algebra affecting which products a scope covers (feature 45).
- Routing projection + shop metafield (features 40–41).
- Storefront Liquid (43) and the assignment UI + conflict copy (44).
- Any DB read/write (this slice is Admin-API-only; the candidate/other scopes are
  handed in by feature 42, which reads Postgres).

## Open / optional

- **Sequential vs parallel probes.** Built sequentially for simplicity; the count
  is small (O(active rules)). If a shop with many ACTIVE rules ever makes this
  slow, a bounded `Promise.all` fan-out is a drop-in later — but keep the
  fail-closed rule (any rejection fails the whole check).
- **Reason richness.** MVP `reason` is the rendered probe query (truthful,
  diagnosable). Feature 44 decides the merchant-facing phrasing ("collides with
  *Phones — Acme* on product type + vendor") and the resolution affordance.
- **Throttle handling.** `first: 1` probes are cheap; if the Admin API ever
  throttles a batch, treat it as an error (fail closed) rather than partial
  results — do not report a conflict-free verdict from an incomplete run.
