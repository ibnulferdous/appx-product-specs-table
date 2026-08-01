# Step 104 — metafield byte budgets (`data-model.md` §14)

**Status:** ✅ **COMPLETE 2026-08-01.** Written and built the same day.
Deliverables: `app/utils/routingBudget.ts` (pure), budget instrumentation in
`app/shopify/routing.server.ts`, the API-version tripwire
`app/shopify.server.test.ts`, and `context/data-model.md` **§14 · Byte Budgets**.
Gate green (typecheck · lint · format · **1309** tests · build); 1284 → 1309 (+25),
47 → 49 files. Four mutations, all caught as predicted.

🔴 **One spec prediction was falsified and the doc carries the true number.** §The
numbers predicted **3,445** `excludedProductGids` entries; the real answer is
**3,446**. `floor((limit − envelope) / perEntry)` is off by one for the array maps —
the first element carries no leading comma — so the tests binary-search the real
serializer rather than restating the division. `byProduct` (1,745) and `byCollection`
(1,769) were predicted correctly. Recorded as a spec bug per the completion gate,
not silently corrected.

📌 **Both §C corrections landed**, in `data-model.md` §13 F1 and in
`progress-tracker.md`'s step-103 entry.

**Parent feature:** none — hardening unit, step 2 of the scale/verification series
(103–110).
**Position:** step 2. Consumes 103's findings **F1** (the 128KB ceiling is real,
unenforced, and this app is not grandfathered) and **F2** (`excludedProductGids` is
bounded by nothing). Produces the numbers 105 needs to write an overflow *policy*.
**Depends on:** 103 (complete). No blockers.
**Migration:** **none.** No schema change.
**Merchant-visible:** **nothing.** No route, no UI, no Liquid, no TOML. The one
runtime behaviour change is a server-side `console.warn`.

---

## 🔴 Two corrections this step must carry

Found while scoping, both load-bearing. Recording them here so the diff that fixes
them is traceable to a reason.

### C1 · `Metafield.sizeInBytes` does not exist in any version we can ship on

`data-model.md` §13 **F1** ends with the parenthetical
"(`Metafield.sizeInBytes` exists and would measure headroom.)" **That is wrong.**
Validated against the real schema via `validate_graphql_codeblocks`:

| API version | `Metafield.sizeInBytes` |
| --- | --- |
| 2025-10 (the runtime client) | ❌ `Cannot query field "sizeInBytes" on type "Metafield"` |
| 2026-04 | ❌ same |
| 2026-07 | ❌ same |
| `unstable` | ✅ valid |

The field is **unstable-only**. The shopify.dev `product` query page shows it in a
"Get the size of a metafield value in bytes" example under *latest*, which is what
misled the previous session — the example does not run on any stable version.

**This makes the step better, not worse.** `sizeInBytes` would have been a
**post-write read**: an extra round-trip that tells you the size of a write that
already succeeded or already failed. What we actually need is a **pre-write
measurement of the exact bytes we are about to send**, which is free, needs no API
at all, and is the same number Shopify will measure. 104 measures app-side.

§13's F1 cell must be corrected as part of this step.

### C2 · `shopify.app.toml:12` is the **webhook** API version, not the Admin client's

§13 F1 says the ceiling "is masked only because the runtime client is `October25`
(`app/shopify.server.ts:13`) while `shopify.app.toml:12` declares
`api_version = "2026-07"`." Line 12 is true, but it sits under `[webhooks]` — it
governs webhook **payload** version and has no bearing on the Admin GraphQL client.

The mismatch is real and still worth recording, but the *only* thing that arms the
128KB ceiling is `ApiVersion.October25` in `app/shopify.server.ts:13`. A reader who
thinks the TOML governs it will "fix" the wrong line. Correct the wording.

---

## Why this exists

103 found the ceiling. It deliberately fixed nothing and, per its own §D6, put no
number on anything — "Bounded by" cells say *what* bounds a read, not *how much*
fits. So the repo currently states that `excludedProductGids` is "bounded by
NOTHING" and that R1a has a "128KB hard ceiling", and a reader cannot tell whether
those two facts collide at 50 carve-outs or 50,000.

They collide at **3,445**. That number is the deliverable.

Without it, 105 cannot be written: an overflow policy needs to know whether overflow
is a pathological edge case or a Tuesday. And the ceiling is **dormant but armed** —
nothing in the repo stops someone bumping `ApiVersion.October25` to a 2026-04+
constant as a routine dependency chore, which silently converts a 2MB limit into a
128KB one under a live storefront delivery path.

---

## Decisions locked before writing code

### D1 · 104 **measures and warns**. It does not block a write.

The 103/104/105 split is: 103 finds the ceiling, 104 puts a number on it, **105
decides what happens at it**. Refusing a write, truncating a map, or surfacing a
merchant-facing error are all *policy*, all reversible-with-argument, and all
belong to a unit whose review is about policy.

If 104 blocks a write it becomes a change that alters merchant outcomes, and the
number — the actual deliverable — stops being separately reviewable.

**Concretely:** at any size, `rebuildShopRouting` performs the same
`metafieldsSet` it performs today. The only new behaviour is a `console.warn`.

### D2 · Measure the **exact string the mutation sends**, not a re-serialization

`buildRoutingMetafieldInput` already produces `JSON.stringify(projection)`. The
budget must measure **that** string, not a fresh `JSON.stringify` of the projection.
A second serialization is a second chance to diverge — different key order, a
`replacer`, a future `space` argument — and a budget that measures a *different
string* than the one that gets written is worse than no budget, because it reads as
authoritative.

The measurement therefore hangs off the built input, and the writer passes what it
is about to send.

### D3 · Bytes, via `TextEncoder` — never `String.length`

Shopify's limit is **bytes**. `String.length` is UTF-16 code units. They agree only
for ASCII, and the two maps most likely to carry non-ASCII are exactly the two whose
keys are merchant-authored free text: `byType` (product type) and `byVendor`. A
vendor named `Ünïcödé Çø` is 10 code units and 15 bytes; an emoji in a product type
is 2 code units and 4 bytes.

`new TextEncoder().encode(s).length` is isomorphic (Node ≥11 and every browser), so
the module stays client-safe and needs no `Buffer`.

### D4 · The ceiling is `128 * 1024`, not `128_000`

Shopify's metafield-limits page pins the sibling limit as "64KB (65,536 bytes)",
i.e. KB = 1024. So the json ceiling is **131,072 bytes**. Recording the derivation
matters — a 72-byte error is one whole `byProduct` entry, and if someone later
"corrects" it to 128,000 the budgets silently shrink by 2.3%.

### D5 · 🔴 A **tripwire test** is the gate on the API version bump, not a doc line

This is the part of the step with actual teeth. A comment saying "don't bump this"
is not a gate; it loses to a dependency-update PR every time.

The gate is a test that asserts the runtime Admin API version is pre-2026-04, and
fails with a message naming the consequence. Bumping the client is then not
forbidden — it is *allowed, but it turns a green suite red until someone reads why*.

The failure message must state: the 128KB json write ceiling is now live, the app is
not grandfathered (first `type = "json"` landed 2026-07-02, after the 2026-04-01
cutoff), the current budgets, and that **105 must land first**.

### D6 · Warn at **80%**, and justify the number rather than picking it

At 80% of 131,072 = **104,857 bytes**, an exclude-dominated map holds ~2,756 entries
and still has ~689 additions of headroom. That is the justification: the threshold
exists to give lead time measured in *merchant actions*, not in bytes. ~689 further
carve-outs before the ceiling is enough that a warning is actionable and not a
false alarm at the moment it fires.

Named constant, so 105 can retune it in one place.

### D7 · The metaobject `rows` field is measured too, but only **documented**

R1f's `rows` / `styling` / `styling_css` are also `json` and share the same ceiling.
The 200-row cap makes `rows` bounded, but *not* obviously under 128KB — there is no
per-label or per-value length cap anywhere in the repo (`parseRowsWithinCap` in
`app/models/template.server.ts:36` enforces only `MAX_TEMPLATE_ROWS`).

Scoping measured the break-even: **~508 characters of value text per row**, at the
full 200 rows. Realistic tables sit at 31–37KB (~25% of budget).

104 **records** this and adds no instrumentation to the metaobject writer. Wiring a
second call site doubles the diff to restate a bound the row cap already mostly
holds. If 105 decides the row payload needs a policy too, the module is already
there and takes one call.

---

## The numbers (measured while scoping; the tests re-derive them)

Against the real `RoutingProjection` shape, real GID formats, and the real handle
format `template-{cuid}` (`specTableHandle`, `app/shopify/metaobjects.server.ts:39`
— 34 chars: `template-` + a 25-char cuid).

| Component | Bytes each | Fills 128KB at |
| --- | --- | --- |
| Empty projection envelope | 125 (fixed) | — |
| `excludedProductGids` entry (a bare product GID) | **38** | **3,445** carve-outs |
| `byProduct` entry (GID key → handle) | **75** | **1,745** products |
| `byCollection` entry (GID key → handle) | **74** | **1,769** collections |
| `byType` / `byVendor` entry | merchant string + handle + 6 | per-entry **unbounded** |

`byType` / `byVendor` are the one row without a per-entry number, and honestly so:
the key is a merchant-authored product type or vendor name with no length limit.
Their *count* is bounded by the shop's distinct types/vendors; their *size* is not.

⚠️ **These are predictions until the tests confirm them.** They are stated here so
the step can be wrong in public. Each is asserted against the real serializer in
`routingBudget.test.ts`; a mismatch is a spec bug to record, not a test to adjust.

---

## What must be built

### 1 · `app/utils/routingBudget.ts` — pure, isomorphic, no imports beyond a type

Same shape as `routingProjection.ts` sits under `routing.server.ts`: pure module,
deterministic, no DB, no Admin API, client-safe.

```
JSON_METAFIELD_MAX_BYTES = 128 * 1024   // D4
BUDGET_WARN_RATIO        = 0.8          // D6

byteLength(value: string): number                    // D3 — TextEncoder
measurePayload(serialized: string): PayloadBudget    // D2 — takes the sent string

type PayloadBudget = {
  bytes:     number
  limit:     number
  ratio:     number                    // bytes / limit
  level:     "ok" | "warn" | "over"
  remaining: number                    // limit - bytes, floored at 0
}
```

`level` is derived, never passed in. `over` is `bytes > limit` (strictly — a payload
exactly at the limit is accepted by Shopify).

### 2 · Wire the measurement into `routing.server.ts`

`buildRoutingMetafieldInput` already builds the value; the writer measures that
exact string before `metafieldsSet` (D2) and logs at `warn` / `over`. The log line
must carry `bytes`, `limit`, `ratio`, and the entry counts per map — a warning that
says "too big" without saying *which map is big* costs a debugging session.

**The write proceeds regardless** (D1).

### 3 · The API-version tripwire (D5)

A test asserting the runtime client is pre-2026-04. It reads the same exported
`apiVersion` the app uses (`app/shopify.server.ts:29`) rather than re-declaring the
constant — a tripwire that can drift from the thing it guards is not a tripwire.

### 4 · Doc updates

- **`data-model.md` §14 · Byte Budgets** — new top-level section. Appended, like
  §13 was, so nothing renumbers (§13's own header records why that matters).
  Carries the numbers table, the derivation, the `rows` finding, and the tripwire.
- **`data-model.md` §13 F1** — corrected per C1 and C2.
- **`progress-tracker.md`** — §Completed entry; F2 moves from "bounded by nothing"
  to "bounded by nothing, and that means 3,445".

---

## Tests

Following the project convention: pure arithmetic unit-tested directly, live calls
mocked at the boundary, guards mutation-tested.

**`app/utils/routingBudget.test.ts`**
- `byteLength` counts **bytes not code units** — ASCII, accented, CJK, emoji, and an
  empty string. This is D3's guard; a mutation to `.length` must fail here.
- Boundaries: `bytes === limit` is `ok`, `limit + 1` is `over`. Off-by-one at the
  ceiling is the single most likely bug in the module.
- `warn` fires at exactly the ratio, not one byte late.
- `remaining` floors at 0 rather than going negative.
- The five budget numbers above, each re-derived from the **real**
  `buildRoutingProjection` output — not a hand-written literal that could drift
  from the projection shape.
- `JSON_METAFIELD_MAX_BYTES === 131072` — pins D4 against a `128_000` "correction".

**`app/shopify/routing.test.ts`** (extend)
- An over-budget projection still calls `metafieldsSet` — **D1's guard**, and the
  one test that stops a future session quietly turning this into a blocker.
- A warning is logged at `warn` and at `over`, and **not** at `ok`.

**`app/shopify.server.test.ts`** (new — the tripwire, D5)
- Asserts the runtime `apiVersion` is pre-2026-04, failure message per D5.

**Mutation tests** (recorded in the tracker with expected/actual failure counts):
- `TextEncoder` → `.length` — must fail the non-ASCII byte tests.
- `>` → `>=` at the `over` boundary — must fail the exactly-at-limit test.
- Remove the `metafieldsSet` call on over-budget — must fail D1's guard.

---

## Deliberately out of scope

- **Any overflow policy.** Refusing, truncating, paginating, or surfacing a
  merchant-facing error. That is **105**, and D1 exists to keep it there.
- **Any cap on `excludedProductGids`.** Capping it is a policy decision (105) and a
  UI change (the picker). This step says how many fit.
- **Instrumenting the metaobject writer.** D7.
- **Bumping the API version.** 104 builds the tripwire; walking through it is a
  separate decision that requires 105.
- **Measuring a live shop's real payload.** Needs seeded data — **106**.
- **`ProductAssignmentIndex` / dead indexes** — OQ-103-D, a migration, unrelated.

---

## Completion gate

1. `app/utils/routingBudget.ts` exists, is pure, imports nothing but types, and is
   measured in **bytes** via `TextEncoder`.
2. `routing.server.ts` measures the **exact serialized string** it sends (D2) and
   logs at warn/over with per-map entry counts.
3. **An over-budget write still calls `metafieldsSet`**, proven by a test (D1).
4. The tripwire test exists, reads the app's own exported `apiVersion`, and its
   failure message names 105 as the prerequisite.
5. All five budget numbers are asserted against the real projection builder, and
   any that disagree with this spec are **recorded as spec bugs**, not silently
   changed.
6. `data-model.md` §14 exists; §13 F1 is corrected per C1 **and** C2.
7. `progress-tracker.md` §Completed has its entry pointing here.
8. Mutation results recorded with expected vs actual failure counts.
9. Full gate: typecheck · lint · format · tests · `npm run build`.

---

## Note for the implementing session

Read first: `data-model.md` §13 (R1a, R1f, F1, F2), `app/utils/routingProjection.ts`
(the shape being measured), `app/shopify/routing.server.ts:84` (the input builder —
D2's anchor point).

The trap in this step is **scope drift into 105**. Every measurement invites an
immediate "and then we should refuse the write". Write the number down and stop; D1
is the whole reason the number will be reviewable.
