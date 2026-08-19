# 108 — Routing metaobject sharding (Option 2)

> **Status: PLAN (not yet built).** Full step-by-step build plan for the structural
> fix to the shared 128KB routing budget. Decided **build-before-launch** (2026-08-05).
> Supersedes the "scoped but undesigned" note in `data-model.md` §9/§14 and the
> progress-tracker Binding rule. Option 1 (delivery-wire compaction, 2026-08-05) is
> the down-payment this replaces; read it first (`routingProjection.ts`, §14).

---

## 1. The problem, in one paragraph

`byProduct` (explicit single-product assignments) and `excluded` (EXCLUDE carve-outs)
are the only two **unbounded** per-product maps in the routing wire, and they **share
one 128KB `$app:routing` json metafield**. Option 1 compaction pushed the shared
ceiling to ~7,276 combined entries and is a ~4× down-payment, not a fix — a shop with
a few thousand per-product picks *plus* a few thousand carve-outs still overflows, and
the failure mode is a **rejected `metafieldsSet` → silently-stale storefront** (§14).
The whole per-product map is also **downloaded and parsed on every product page**, even
though only one product's entry matters — a per-page-weight cost that grows with the map.

**Sharding fixes both.** Split the two per-product maps across N per-bucket metaobjects
keyed by `product.id mod N`. Each shard has its **own** 128KB budget (Shopify allows 1M
entries/definition), so total capacity is `N × 128KB`; and a product page reads exactly
**one** small shard, not the whole map.

The broad tiers (`byType` / `byVendor` / `byCollection` / `def` / `handles[]`) are
**count-bounded** by the shop's distinct types/vendors/collections and stay in
`$app:routing`, unchanged in spirit — they were never the problem (§14).

---

## 2. Why every mechanism this needs is already proven here

Sharding introduces **no new Shopify primitive**. All four load-bearing behaviours are
live-verified on `appx-dev`:

- **Handle-constructed metaobject lookup** — `metaobjects['$app:type'][handle]` resolves
  an app-owned metaobject from a *constructed* handle string, no reference metafield
  needed ([[metaobject-by-handle-liquid]], and the existing `spec-table.liquid` already
  does exactly this for the template metaobject).
- **`json` metaobject field → parsed object in Liquid** via `.value` — the same access
  `rows.value` / `styling.value` already use (§10, `spec_table.liquid:77-79`).
- **`product.id | modulo: N`** — Ruby-backed arbitrary-precision integer modulo; the
  bucket key is `'routing-shard-' | append: k` (`append` coerces to string).
- **App-owned metaobject write lifecycle** — `metaobjectUpsert` / `metaobjectDelete`
  already in `app/shopify/metaobjects.server.ts`, validated @ 2025-10.

Existing access scopes already cover it: `write_metaobjects,write_metaobject_definitions`
(`shopify.app.toml:42`). **No new scope, no new consent screen.**

---

## 3. Locked design decisions

These are the invariants the units below implement. Any deviation is a design change,
not a code detail.

- **D1 — Only `byProduct` and `excluded` shard.** Broad tiers stay in `$app:routing`.
  Rationale: the broad maps are count-bounded (§14) and are read on every page anyway;
  moving them would add a read with no capacity benefit.
- **D2 — One shard carries BOTH maps for its bucket.** A shard metaobject has two json
  fields, `by_product` (`{"<pid>": "<handle>"}`) and `excluded` (`{"<pid>": 1}`). A
  product resolves both from one read, so the storefront's byProduct-then-exclude-gate
  order (feature 45 Decision B) is preserved with a single shard fetch.
- **D3 — Shards store handle STRINGS directly, not interned indices.** Interning's win
  is proportional to a handle repeated thousands of times in *one* blob; a shard holds
  ~`catalog/N` entries (small), so a bare `template-{cuid}` string per entry is well
  under the per-shard 128KB budget and keeps shard decode trivial and self-contained
  (no shard-local `handles[]`, no cross-reference to the shop metafield). **The broad
  tiers keep their interned `handles[]`** — that map really can repeat one handle across
  thousands of collections/types.
- **D4 — N = 1024, a single shared constant.** `ROUTING_SHARD_COUNT` in
  `app/utils/routingShards.ts`, never a literal. 1M products / 1024 ≈ 977 entries/shard
  worst case (a merchant who perversely assigns a per-product table to the entire
  catalog) — ~50KB/shard, comfortably under 128KB. N caps the shard-metaobject count at
  1024/shop, trivial against the 1M/definition limit. 🔴 N can **never change after
  launch** without a full re-shard migration (every product's bucket moves) — same
  class of "the wire is the storage format" law as the styling defaults.
- **D5 — Reconcile by content hash; never delete, upsert-to-empty.** Postgres tracks
  `{bucketKey: contentHash}`. A rebuild upserts only shards whose hash changed and
  upserts emptied shards to `{}` (which reads as a miss). No `metaobjectDelete` path:
  an empty shard is harmless and bounded by N, and deletion adds a failure mode with no
  correctness benefit. A status toggle on an `ALL_PRODUCTS` template therefore writes
  **zero** shards; adding one per-product pick writes **one**.
- **D6 — Postgres stays GID-faithful and un-sharded.** `ShopStorefrontRouting` still
  holds the full `byProduct` / `excludedProductGids` maps verbatim (source of truth,
  debuggable). Sharding is a **delivery-only** reshape at write time, exactly like
  Option 1's `compactRoutingForDelivery`.
- **D7 — Hard cutover, wire version 3.** `ROUTING_WIRE_VERSION` 2 → 3; `$app:routing` v3
  drops `byProduct` / `excluded` (they move to shards). No dual-read: pre-launch the only
  data is one dev store, so a single rebuild converts everything (exactly how Option 1
  cut over). The Liquid resolver reads shards for per-product and the shop metafield for
  broad — a v2 reader against v3 data (or vice-versa) is a redeploy mismatch, guarded by
  the wire-contract test.

---

## 4. Target shapes

### `$app:routing` metafield (v3 — broad tiers only)

```jsonc
{
  "v": 3,
  "handles": ["template-abc", "template-def"], // interned, broad tiers only
  "def": 0,                                     // index into handles, or null
  "byType": { "Camera": 1 },                    // raw selector -> handle index
  "byVendor": { "DJI": 0 },
  "byCollection": { "123456": 1 }               // bare collection id -> handle index
  // byProduct, excluded: GONE — now sharded
  // byTag: still omitted (post-MVP, always empty)
}
```

### `$app:appx_routing_shard` metaobject, handle `routing-shard-<k>`

```jsonc
// fields (all json except v):
"by_product":   { "8823456789012": "template-abc" }, // bare pid -> handle STRING (D3)
"excluded":     { "8823456789013": 1 },              // bare pid -> membership
"wire_version": "3"                                  // debug-only tag (text field;
                                                     // key must be >=2 chars, so not `v`)
```

Only buckets with ≥1 `by_product` or `excluded` entry are materialized (sparse).

---

## 5. Storefront resolution (target)

`spec-table-resolve.liquid`, rewritten. `product`, `routing`, and now the shard are the
inputs; the block passes the shard in (or the snippet resolves it — see Unit D):

```liquid
{%- liquid
  assign hidx = ''      # broad-tier handle INDEX
  assign handle = ''    # final resolved handle string

  if routing != blank
    assign pid = '' | append: product.id
    assign k = product.id | modulo: 1024        # MUST match ROUTING_SHARD_COUNT (D4)
    assign shard = metaobjects['$app:appx_routing_shard'][ 'routing-shard-' | append: k ]

    # 1. Explicit single-product assignment wins (checked before the exclude gate).
    assign handle = shard.by_product.value[pid]  # a STRING, or nil (D3)

    # 2. Broad tiers, carved out by the shard's excluded set.
    if handle == blank
      unless shard.excluded.value[pid] != blank
        assign hidx = routing.byType[product.type]
        if hidx == blank
          assign hidx = routing.byVendor[product.vendor]
        endif
        if hidx == blank
          # collection scan in 50-item chunks (unchanged from today)
          ...
        endif
        if hidx == blank
          assign hidx = routing.def
        endif
        if hidx != blank
          assign handle = routing.handles[hidx]
        endif
      endunless
    endif
  endif

  echo handle
-%}
```

Semantics are **identical** to today; only the per-product source moved from
`routing.byProduct/excluded` to `shard.by_product/excluded`. A sparse bucket (no shard)
→ `shard` is nil → `shard.by_product.value[pid]` is nil → falls through to broad tiers.
🔴 The `modulo: 1024` literal and the `'$app:appx_routing_shard'` type string are a
**cross-language contract** with the TS constants — guarded by a contract test (Unit D).

---

## 6. Build units

Each unit is independently verifiable and ends with the full gate
(typecheck · lint · format · test · build) per CLAUDE.md standing rules. Order respects
the dependency chain: definition + schema → pure transform → writer → storefront →
docs → live.

### Unit A — Shard metaobject definition + schema tracking column

1. **TOML**: add `[metaobjects.app.appx_routing_shard]` beside `appx_spec_table`
   (`shopify.app.toml`), fields `by_product` (json), `excluded` (json), `wire_version`
   (single_line_text_field — a metaobject field KEY must be ≥2 chars, so not `v`; text matches
   the `appx_spec_table` `status`/`updated_at` convention and the storefront never parses it),
   `access.storefront = "public_read"`, `access.admin = "merchant_read_write"`.
2. **Migration** `add-routing-shard-state`: one additive column on `ShopStorefrontRouting`
   — `shardState Json @default("{}")` (bucketKey → contentHash; D5). No new model (a
   `Json` column is enough because `metaobjectUpsert` addresses shards by handle, so no
   per-shard GID needs storing). Cascade from `Shop` already covers `shop/redact`.
3. **Deploy once to anchor** the definition ([[shopify-metaobject-deploy-clean-lifecycle]]:
   an undeployed app-owned metaobject is wiped by `shopify app dev clean`; the definition
   must be deployed to exist). ⚠️ A deploy from here re-anchors step 106's compliance
   URIs onto `example.com` — so this deploy **rides the production-host deploy** (same D5
   constraint as steps 107 / the per-product-metafield removal). Until then the writer
   and Liquid can be built and unit-tested; live verification (Unit F) waits on the host.
4. **Confirm** the definition exists in the dev store (Admin → Custom data) before Unit C
   writes to it, per the migration rules (§3 of data-model.md).

Gate: build + migration applied; `schema.prisma` matches Neon.

### Unit B — Pure sharding transform (`app/utils/routingShards.ts`, unit-tested)

Pure, no Prisma, no Admin — mirrors `routingProjection.ts`.

- `ROUTING_SHARD_COUNT = 1024`, `ROUTING_SHARD_TYPE = "$app:appx_routing_shard"`,
  `shardHandle(k)` → `routing-shard-${k}`.
- `bucketOf(gid): number` — `idTail(gid) mod N` (reuse Option 1's `idTail`; bucket the
  bare numeric id so it matches Liquid's `product.id | modulo`).
- `buildShardPayloads(projection): Map<number, ShardPayload>` — walk
  `projection.byProduct` and `projection.excludedProductGids`, bucket each by
  `bucketOf`, emit `{ by_product: {pid: handle}, excluded: {pid: 1}, v: 3 }` per occupied
  bucket. Deterministic key order for stable serialization.
- `serializeShard(payload): string` and `hashShard(string): string` (short stable hash;
  no `Date.now`/`Math.random` — see the workflow constraints).
- `diffShards(desired, storedHashes): { upsert: [...], empty: [...] }` — D5 reconciliation:
  `upsert` = buckets whose hash changed or is new; `empty` = buckets in `storedHashes`
  absent from `desired` (upsert to `{}`).
Tests: bucketing determinism (incl. an id > 2^53 to pin the BigInt path — see below),
sparse occupancy, byProduct+excluded co-location in one bucket (incl. a product in BOTH,
per feature 45 Decision B), diff upsert/empty sets, hash stability across insertion order.
Prove each guard by breaking it (the project's standing test discipline).

🔴 **`bucketOf` uses BigInt modulo, not `Number % N`.** The bucket must agree with Liquid's
`product.id | modulo: N` (Ruby, arbitrary precision) for EVERY product id. `Number` loses
precision above 2^53, so a large id would bucket differently on the two sides and route to
the wrong (or no) shard. `Number(BigInt(idTail(gid)) % BigInt(ROUTING_SHARD_COUNT))` is exact
for any 64-bit id and matches Ruby. A test pins an id > 2^53 where the `Number` path is
provably wrong.

> **⚠️ Resequenced from the original split (2026-08-05, discovered building Unit B).** The
> v3 wire flip — `ROUTING_WIRE_VERSION → 3`, removing `byProduct`/`excluded` from
> `compactRoutingForDelivery`, and re-deriving `routingBudget.ts` — was originally listed
> here. It CANNOT land in Unit B: `routingWireContract.test.ts` derives the wire key set
> from the real compactor and asserts the Liquid reads exactly those keys, so dropping the
> two maps while the snippet still reads them turns that test red. The wire and its reader
> move together (that is the whole point of the contract test). So the flip moves to
> **Unit D**, co-located with the snippet rewrite. Unit B is now purely additive.
> `routingShards.ts` ties its shard `wire_version` to `ROUTING_WIRE_VERSION` (one version
> source for the whole delivery wire), so the Unit-D bump moves the shop wire and the shards
> together automatically.

### Unit C — Writer reconciliation (`app/shopify/routing.server.ts`)

> **Transitional double-write, by design.** Through Unit C the shop `$app:routing` metafield
> is STILL the v2 shape (carries `byProduct`/`excluded`), because the wire flip is Unit D.
> So per-product data lives in BOTH the shop metafield and the new shards during C. That is
> harmless: the storefront (still v2 Liquid until D) reads the shop map and ignores the
> shards, so behavior is unchanged; the shards are written-but-unread until D flips the
> reader. Pre-launch dev-store data is tiny, so the temporary duplication costs nothing.

- After building the projection + upserting the Postgres row (unchanged), call
  `buildShardPayloads` and `diffShards(desired, row.shardState)`.
- For each `upsert` bucket: `metaobjectUpsert(handle: {type, handle}, metaobject:
  {fields})`. For each `empty` bucket: upsert to `{}`. Collect per-bucket success.
- Write the broad-only `$app:routing` metafield (existing path, now v3).
- **Stamp `shardState`** with the new hashes for **successfully written** buckets only;
  a failed shard keeps its old hash so the next rebuild retries it. Partial failure
  returns the existing honest error (*"Saved routing, but couldn't publish…"*) — Postgres
  is already correct; the storefront serves the last good shard for the affected bucket
  until retry (bounded, self-healing, mirrors §14's failure posture).
- **Rate-limit note:** incremental hash-diff keeps a typical rebuild at 0–1 shard writes.
  A large *initial* materialization (thousands of occupied buckets in one rebuild) is the
  only many-write case — if measured slow, route that batch through
  `bulkOperationRunMutation` (rate-limit-exempt, JSONL of `metaobjectUpsert`) as an
  escape hatch. Not built in the MVP path; noted so it isn't rediscovered.

Tests: diff → correct upsert/empty mutation set; partial failure leaves the failed
bucket's hash unstamped + returns the error; broad metafield still v3; an over-budget
*single shard* still reaches `metaobjectUpsert` (observe-only, mirrors 104 §D1).

### Unit D — The atomic wire flip: compactor v3 + storefront Liquid + contract tests

This is the cutover. The wire producer and reader move together in one unit (enforced by
`routingWireContract.test.ts`), so all of the following land together and the gate is green
only when they agree:

- **Compactor**: bump `ROUTING_WIRE_VERSION` → 3 and **remove `byProduct` / `excluded` from
  `compactRoutingForDelivery`** + `CompactRouting` (D7). The shop wire is now broad-only.
- **Budget**: re-derive `routingBudget.ts` / its test numbers for the broad-only shop wire
  (byProduct/excluded rows leave the shop-metafield budget table; add the per-shard budget
  note — each shard has its own 128KB). `countRoutingEntries` keeps counting the projection's
  byProduct/excluded for the *shard* budget/warning, not the shop-metafield one.
- Rewrite `spec-table-resolve.liquid` to §5. Decide the shard-resolution seam: either the
  **block** (`spec_table.liquid`) resolves the shard and passes it in (keeps the snippet
  render-scope-pure, matching how `routing` is passed today), or the snippet resolves it
  from the `metaobjects` global directly. Prefer **block resolves + passes in** for
  symmetry with the current `routing:` param and testability.
- **`routingShardWireContract.test.ts`** (new): read the snippet off disk and assert
  (a) the `modulo:` literal equals `ROUTING_SHARD_COUNT`, (b) the type string equals
  `ROUTING_SHARD_TYPE`, (c) it reads `by_product` / `excluded` (the shard field keys),
  (d) no reintroduced `gid://` token, (e) no `routing.byProduct` / `routing.excluded`
  read remains (those moved to shards). Same disk-read pattern as
  `specTableLiquidDefaultsContract.test.ts` / `routingWireContract.test.ts`; prove all
  guards by breaking them.
- Update `routingWireContract.test.ts` for the v3 broad-only shop wire.
- `validate_theme` on both edited Liquid files must stay clean (no new warnings).

### Unit E — Docs

- `data-model.md`: §9 (resolution list + delivery subsection), §10 (a new "Routing shard
  metaobject" definition entry), §14 (the shop-metafield budget table loses byProduct/
  excluded rows; add a "per-shard budget" note + the `N × 128KB` total-capacity line + the
  D4/D5 invariants), §15 (shard metaobjects are Shopify-side, removed on uninstall — the
  §15 "out of reach by design" note already covers app-owned metaobjects; no new erase
  code).
- `shopify.app.toml`: comment the new definition like `appx_spec_table` is.
- progress-tracker: flip the Binding rule "Option 2 … not yet designed" → "designed +
  built (feature 108)"; add a Recently-Shipped line; note N can never change post-launch
  (D4).

### Unit F — Live verification (rides the production-host deploy)

After the host deploy anchors the definition:
1. A per-product assignment on a DJI product renders its table via a shard (not the broad
   map); confirm the shard metaobject exists at `routing-shard-<pid mod 1024>` in Admin.
2. An `ALL_PRODUCTS EXCLUDE X` + `PRODUCT X` pair: X still reaches its own table
   (byProduct beats the exclude gate, feature 45 Decision B) — proves shard co-location.
3. A status toggle on an `ALL_PRODUCTS` template writes **zero** shards (hash-diff) — the
   broad-only metafield rewrites, `shardState` unchanged.
4. A sparse-bucket product (no shard) falls through to broad tiers correctly.
5. Byte instrumentation: `$app:routing` is now broad-only and far under budget.

---

## 7. Sequencing against the App Store blockers

Build-before-launch. The one hard coupling is **Unit A step 3 / Unit F**: deploying the
shard definition re-anchors the compliance URIs onto `example.com`, so the *deploy* must
ride the production-host deploy (Current Goal blocker 1). Units A(1–2), B, C, D, E are all
**deploy-independent** — they can land and pass the full gate before the host exists;
only the anchoring deploy + live checks wait. This is the same staging discipline steps
107 and the per-product-metafield removal already use.

The API-version interaction makes the timing right: the 128KB ceiling arms on the
`October25 → April26` bump (§14). Shipping sharding **before** that bump means the
structural fix is in place the moment the ceiling drops, with no scramble.

---

## 8. Open questions

- **OQ-108-A — shard resolution seam** (Unit D): block-passes-in vs snippet-resolves.
  Leaning block-passes-in for symmetry/testability; confirm at build time.
- **OQ-108-B — initial-materialization batch**: is `bulkOperationRunMutation` needed for
  MVP, or is incremental hash-diff sufficient given no merchant has thousands of
  per-product picks yet? Defaulting to incremental-only; revisit if a large importer
  onboards (the escape hatch is designed, not built).
