# Step 103 — the read-pattern catalog (`data-model.md` §Read patterns)

**Status:** ✅ **COMPLETE 2026-08-01.** Written 2026-08-01, built the same day.
Deliverable: `context/data-model.md` **§13 · Read Patterns** (20 reads + the index →
read mapping), four Open Questions (**OQ-103-A/B/C/D**) in `progress-tracker.md`, and
the §Completed entry. No code changed; gate green (typecheck · lint · format ·
**1270** tests, unmoved · build). Verdicts: **P1 confirmed** (and the app is *not*
grandfathered), **P2 confirmed**, **P3 partly falsified**, **P4 confirmed ×6**,
**P5 half-falsified**. One recorded deviation: the section ships as **§13**, not
after §9 — see §D1's note in the section itself.
📌 **Owed:** the row-by-row review by a session that did not write the catalog.

**Parent feature:** none — this is a standalone hardening unit, the first of the
scale/verification series (103–110) proposed 2026-08-01.
**Position:** step 1 of the series. It is the unit that *finds* the ceilings the
rest of the series acts on; nothing downstream should be built before it.
**Depends on:** nothing. No blockers.
**Migration:** **none.**
**Merchant-visible:** **nothing.** No route, no UI, no Liquid, no TOML.

---

## 🔴 What makes this step different: it writes no code

Precedent is `102-accent-live-verification.md`, which also shipped without a code
change. This one is narrower still — 102 *watched* a live path; 103 only
**writes down what the reads are**. The deliverable is one new section in
`context/data-model.md` plus, where a read turns out to be unbounded, an entry in
`progress-tracker.md` §Open Questions.

> **This step fixes nothing it finds.** That separation is the whole point. A
> catalog that also carries fixes becomes a change nobody can review, and the
> fixes land before the ceiling that justifies them has been measured. Findings
> route to 104 (byte budgets), 105 (overflow policy), Next-Up item 6 (list
> pagination), or a new Open Question — never into this step's diff.

**Scope in one line:** enumerate every read the app performs, record where each
is served from and what bounds it, and stop.

---

## Why this exists

`data-model.md` is 975 lines and documents the **write** side thoroughly — schema,
row JSON, assignment logic, metaobject strategy, architecture invariants. It has
no section that answers "what reads this, how often, and how large can it get?"

The indexes on `ProductAssignment` (`[shopId, scope]`, `[shopId, scope, scopeValue]`,
`[shopId, templateId]`) are clearly deliberate, but **no file records which read each
one serves**. That is recoverable knowledge today because the author is still on the
project; it is not recoverable in six months, and it is not reviewable by a fresh
session at all.

The concrete trigger: the storefront read — by far the highest-volume read in the
system, on every product page view for every shopper — is delivered through a
`json` metafield with a **128KB API ceiling**, and nothing in the repo states that
ceiling, measures headroom against it, or defines what happens at it.

---

## Decisions locked before writing code

### D1 · It lives in `data-model.md`, as a new top-level section

Not a new context file. Per `ai-workflow-rules.md` §Keeping Docs in Sync, "system
architecture or boundaries → `data-model.md`", and a read pattern is a boundary
statement: it says which store answers which question. A separate file would drift
from the schema it describes within one feature.

Placement: **after** the assignment/routing sections (§9-ish), because the catalog
references their vocabulary and would be unreadable before them.

### D2 · Every row carries a **ceiling**, and the ceiling column may not be blank

The five columns are fixed:

| Column | Meaning |
| --- | --- |
| **Read** | `R<n>` + one-line name |
| **Trigger** | what causes it (page view, loader, activation, webhook) |
| **Volume** | relative order of magnitude, not a guess at absolute traffic |
| **Served from** | Postgres · shop metafield · metaobject · Admin API — **exactly one primary** |
| **Bounded by** | the quantity that makes it grow, and the hard ceiling if one exists |

"Bounded by" is the load-bearing column. `—`, `unknown`, or `should be fine` are
**not** acceptable values. If the bound genuinely cannot be determined in this step,
the correct output is an Open Question in `progress-tracker.md` and a pointer to it
from the cell — never an empty cell.

### D3 · "Served from" distinguishes three stores that are usually conflated

The app reads from three places with completely different failure modes, and the
catalog must never blur them:

- **Postgres (Neon)** — source of truth. Fails loudly, per-request, recoverable.
- **Shopify metafield / metaobject** — the *delivery copy*. Has hard size ceilings,
  fails at **write** time, and the failure surfaces much later as a stale read.
- **Admin API** — live, rate-limited, and a latency dependency of the admin UI.

A read served from the delivery copy is not "a database read that happens to be
cached." Recording it as one is the mistake this column exists to prevent.

### D4 · Volume is recorded **relative**, not absolute

No invented traffic numbers. The catalog says "highest — every product page view,
every shopper" or "one per editor open", never "~10k/day". Absolute figures would be
fabricated, would be quoted back as fact, and are not needed to rank the reads.

### D5 · 🔴 The storefront read is catalogued as **four distinct costs**, not one row

The tempting simplification is one row: "storefront product page → metafield → fast."
That hides every real risk. `snippets/spec-table-resolve.liquid` and
`blocks/spec_table.liquid` between them carry at least four separately-bounded costs,
and each gets its own row:

1. **Routing blob transfer + parse** — `shop.metafields["$app"].routing.value`,
   fetched and parsed on every product page. Bounded by total entries across
   `byType` / `byVendor` / `byCollection` / `byProduct` / `excludedProductGids`.
   **Hard ceiling: 128KB** (json metafield, API 2026-04+).
2. **The exclude gate** — `routing.excludedProductGids contains pgid` is a **linear
   scan of an array**, executed per page view. Bounded by the number of EXCLUDE
   carve-outs, which is the one map bounded by *nothing* in the current design.
3. **The collection scan** — `product.collections` walked in 50-item chunks
   (Liquid's `for` cap) with a `byCollection` lookup per collection, breaking on
   first hit. Bounded by the product's collection membership, not the shop's
   collection count.
4. **The rows render** — `spec.rows.value` walked in 50-item chunks, each DATA row
   rendering `spec-table-value`. Bounded by `MAX_TEMPLATE_ROWS = 200`.

Cost 1 is the one with a hard external ceiling. Cost 2 is the one with no bound at
all. Both are expected to become Open Questions or 104/105 inputs.

### D6 · The catalog records what **is**, not what should be

Where a read is unbounded, the catalog says so and stops. It does not propose
pagination, caching, or a schema change inline — those are other units with their
own review. This keeps the diff to one section of one file and keeps the finding
separable from the opinion about it.

---

## What must be catalogued

Minimum set. The step is not complete until each has a row and a non-empty
"Bounded by".

**Storefront (no app server involved at all):**

- **R1a–R1d** — the four costs of the product-page read, per D5.

**Admin — React Router loaders/actions:**

- **R2 · Templates list** (`app/routes/app.templates.tsx:276`). Two reads in one
  loader, and they must be separate rows: `listTemplatesForShop(shop.id)` returns
  **all** of a shop's templates with no pagination (the comment says so — status
  filtering moved to the client), and `resolveAssignedProductCounts(admin, shop.id)`
  resolves broad scopes **live from the Admin API**. The second makes the admin's
  most-visited list page depend on Admin API latency and rate limits. This row is
  the evidence base for Next-Up item 6.
- **R3 · Editor load** (`app/routes/app.templates_.$id/route.tsx:115`) — template +
  `TableStyling` + assignments + whatever scope-resource detail the loader resolves
  against Shopify. Record which parts are Postgres and which are live Admin API.
- **R4 · Metafield definitions** (`app/routes/app.metafield-definitions.tsx:27`).
- **R5 · App index / auth shell** (`app/routes/app._index.tsx`, `app/routes/app.tsx`).

**Admin — write paths whose *reads* are the cost:**

- **R6 · Activation dry-run** — the conflict resolver. Key Decisions already claims
  the shape: "O(rules) Postgres set-algebra + `products(query,first:1)` existence
  tests, never a catalog scan." **Verify that claim against
  `app/shopify/assignmentConflict.server.ts` and record it, or record the
  discrepancy.** A claim in Key Decisions is not a measurement.
- **R7 · Routing map projection** — `app/shopify/routing.server.ts` rebuilding the
  map from ACTIVE rules on every activate/deactivate. This is the *write* that
  produces R1a's blob; its input bound is R1a's ceiling.

**Webhooks:**

- **R8 · `app/uninstalled`, `app/scopes_update`** — including what a burst does to
  the Neon connection pool. If that is not determinable by reading, it is an Open
  Question, not a blank cell.

**Index → read mapping:**

- A short subsection mapping each existing index in `schema.prisma` to the R-number
  it serves. **An index that serves no catalogued read is a finding** — record it,
  do not drop it.

---

## Expected findings (predictions, to be confirmed or falsified)

Written down in advance so the step can be wrong in public rather than
retro-fitted into agreement.

- **P1** — R1a has a 128KB ceiling that nothing in the repo mentions. → 104.
- **P2** — `excludedProductGids` (R1b) is bounded by nothing, and is the most
  reachable route to P1's ceiling. → 104/105.
- **P3** — R2 is unpaginated *and* carries a live Admin API dependency. Already
  known as Next-Up item 6; this step supplies the reason it matters.
- **P4** — at least one index maps to no catalogued read.
- **P5** — Key Decisions' O(rules) claim for R6 will hold, but the
  `products(query,first:1)` calls will turn out to be per-rule, making activation
  latency scale with rule count.

A falsified prediction is a **result**, not a failure. Record it either way.

---

## Deliberately out of scope

- **Any code change.** Including "obvious" one-liners.
- **Any fix for a finding.** 104/105/Next-Up-6 exist for that.
- **Seed data.** 106. This step reads code and schema, not a populated database.
- **Perf measurement.** 108. "Bounded by" is an analytical bound, not a benchmark —
  no `EXPLAIN`, no timings. Those need seeded data and are a different unit.
- **The Liquid render cost of `spec-table-value`** beyond noting the row cap.

---

## Tests

None. There is no code to test.

The verification is a **review pass**: for each row, the reviewer must be able to
open the cited file at the cited line and confirm the "Served from" and "Bounded by"
claims. Any row that cannot be traced to a file:line is not finished.

Per the audit rule proposed alongside this series: this review should be run by a
**session that did not write the catalog**.

---

## Completion gate

1. `data-model.md` has a §Read patterns section carrying every read in §What must
   be catalogued, each with all five columns of D2 filled.
2. **No "Bounded by" cell is empty, `—`, or hedged.** Every undeterminable bound has
   a corresponding Open Question in `progress-tracker.md` and a pointer to it.
3. The storefront read is four rows, not one (D5).
4. Every row cites a `file:line` a reviewer can open.
5. The index → read mapping subsection exists, and any index serving no read is
   recorded as a finding.
6. P1–P5 are each marked confirmed or falsified.
7. Findings are routed — 104, 105, Next-Up item 6, or a new Open Question — and
   **none of them are fixed in this step's diff**.
8. `progress-tracker.md` §Completed has its one-line entry pointing here.
9. `npm run build` passes (trivially — no code changed; run it anyway, per the
   standing checklist).

---

## Note for the implementing session

Read before starting: `data-model.md` §5 and §9 (assignment + routing vocabulary),
`extensions/product-specs-table/blocks/spec_table.liquid` and
`snippets/spec-table-resolve.liquid` (the whole of R1 lives there), and
`progress-tracker.md` §Key Decisions — the "Assignment model" entry is the claim
R6 and R7 must be checked against.

**Unrelated one-line fix, safe to fold in:** §Key Decisions "Testing strategy" cites
`~/.claude/plans/there-is-no-automated-encapsulated-yeti.md` as the full doc. **That
file no longer exists** (only `style-tab-phase-b-implementation-plan.md` remains in
that directory). Either restore it or drop the pointer — a dangling reference in the
one entry that defines the testing phases is worse than no reference.
