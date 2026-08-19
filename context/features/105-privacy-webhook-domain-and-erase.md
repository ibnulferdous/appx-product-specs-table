# Step 105 — compliance payload domain + the shop erase path

**Status:** ✅ **completed 2026-08-02.** Full gate green (typecheck · lint ·
format · **1338** tests / **50** files · build). Baseline **1309 / 49**, so
**+29** tests and one new file. Five mutations run — four predicted, one
discovered mid-step — and **two of the five predictions were wrong**; the
corrections are the findings, recorded in the mutation table below.

⚠️ **The baseline written into this file when it was planned (1270 / 47) was
WRONG.** The real pre-change state was **1309 tests / 49 files**, measured three
ways and finally settled by stashing the step's two tracked edits and re-running
with the new test file excluded. The wrong figure came from a session-start
`test:run` whose output said 47 / 1270; I have no explanation for that reading
and am not inventing one. 🔬 **The lesson is procedural: a baseline is only a
baseline if it was measured on the tree the diff is measured against.** Every
number in this file is now from the stash-verified run. Had the wrong figure been
kept, this step would have claimed +68 tests for 29 tests of work — and the
inflated delta would have looked like thorough coverage rather than a
measurement error.

**Parent feature:** mandatory privacy webhooks — the App Store submission
blocker. `customers/data_request`, `customers/redact`, `shop/redact` are required
of every public app; missing URLs or a wrong response is an **automatic
rejection**, not a note on the review.

**Position:** step 1 of 2. Next is **step 106** — the three route files, the
`shopify.app.toml` subscriptions, `shopify app deploy`, and live verification.

**Depends on:** nothing unbuilt. `Shop` and its cascade have existed since the
init migration.

**Migration:** **none.** No schema change, so the stale-Prisma-client trap
([[prisma-migration-stale-dev-server]]) does not apply to this step.

**Merchant-visible:** **no.** Nothing imports either new module when this step
lands — no route, no loader, no action. A merchant sees exactly what they see
today.

---

## What this step is

Everything that can be decided and tested **without a webhook arriving**: the
payload parser and the erase path, both pure enough to run under
`environment: "node"`.

**Scope in one line:** given a shop domain, erase that shop and nothing else —
and given an arbitrary compliance payload, produce a summary that is safe to
write to a log.

🚫 **Not in this step:** the three route files, `shopify.app.toml`, the deploy,
and every live check. All step 106. This split exists because step 106 touches a
**protected file** (`ai-workflow-rules.md:29`) and cannot be undone by a revert
— the subscriptions live on Shopify's side once deployed — while this step is
pure local code behind a green gate.

---

## The research this rests on

Verified against shopify.dev 2026-08-02, not recalled:

| Topic                   | Trigger                              | Payload fields                                                             |
| ----------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| `customers/data_request` | Customer asks the merchant for data  | `shop_id`, `shop_domain`, `customer{id,email,phone}`, `orders_requested[]`, `data_request{id}` |
| `customers/redact`      | Merchant requests deletion (delayed) | `shop_id`, `shop_domain`, `customer{id,email,phone}`, `orders_to_redact[]`  |
| `shop/redact`           | **48 hours after uninstall**         | `shop_id`, `shop_domain`                                                    |

Rules that shape the code: respond **200-series**; accept **POST** with a JSON
body; an **invalid HMAC must return 401**; complete the action within 30 days.

✅ **The 401 comes free and must stay free.** `authenticate.webhook` throws a
`Response` — `405` on non-POST, **`401` on invalid HMAC**, `400` on any other
validation failure — before a single line of handler code runs
(`@shopify/shopify-app-react-router/dist/cjs/server/authenticate/webhooks/authenticate.js:14–36`,
read, not assumed). 🔴 **This is a constraint on step 106, recorded here because
it is the thing a reviewer actually probes:** the call must never be wrapped in
`try/catch`, which would swallow the throw and turn a 401 into a 200.

⚠️ **`session` is `undefined` for these handlers and that is normal.** The same
factory returns the bare webhook context when no offline session exists, and
`shop/redact` arrives 48 hours after uninstall — by which time
`webhooks.app.uninstalled.tsx` has already deleted the session rows. **Nothing
in either step may touch `session` or `admin`.**

---

## What this app actually stores — the finding that sizes the work

Audited every model in `prisma/schema.prisma` and every write path:

🔴 **Customer PII: none, anywhere.** No customer, order or buyer data is stored.
`Shop.email` and `Shop.name` are columns that **nothing ever writes** —
`upsertShop` creates with `myshopifyDomain` alone (`shop.server.ts:26`). The
`Session` model carries `firstName` / `lastName` / `email`, but the app uses
offline tokens only, so they stay null — and they would be merchant-staff data,
not customer data, if they were populated.

**Shop-scoped data: substantial.** `Shop` → `Template` → `TableStyling`, plus
`ProductAssignment`, `ProductAssignmentIndex`, `ShopStorefrontRouting`. Every one
of those FKs is `ON DELETE CASCADE` **in the emitted SQL**, not only in the
Prisma schema (checked across four migration files), so a single `Shop` delete
takes the whole tree at the database level.

⚠️ **`Session` is the exception and the trap.** It has no foreign key — it is
keyed by a plain `shop` **string** — so **no cascade reaches it**. It must be
deleted explicitly or it survives the erase.

**Consequence, and it corrects a line in our own checklist:** the two
`customers/*` topics are genuine acknowledged no-ops, but `shop/redact` is real
work. `context/app-store-review-checklist.md:48` currently says all three "may be
acknowledged no-ops". That is **false for `shop/redact`** and is corrected in
step 106, where the handlers it describes will exist.

---

## Decisions locked before writing code

### D1 · `shop/redact` deletes the `Shop` row, **guarded on `isInstalled`**

Merchant decision 2026-08-02, taken from three costed options.

Delete the `Shop` row (cascading to templates, styling, assignments, the index
and the routing projection) plus its sessions — **but skip and log if the shop is
currently installed.**

🔬 **Why the guard is not optional.** Shopify sends `shop/redact` 48 hours after
uninstall and the docs never say a reinstall cancels it (the changelog says
Shopify will *"attempt to send"* it). A merchant who uninstalls on Friday and
reinstalls on Monday would otherwise have every template deleted out from under
them, silently, by a webhook that arrived on schedule. An installed shop is an
active relationship with its own basis for retention — and since we hold **zero
customer PII**, the guard costs no compliance ground whatsoever.

🚫 **Rejected — erase unconditionally.** Simplest, and the only option that can
destroy live merchant work.
🚫 **Rejected — log and acknowledge only.** Defensible on the letter of the rule
(the requirement is to erase *customers'* personal information, of which we store
none) but it leaves dead shops in Neon forever and invites the exact reviewer
question this feature exists to pre-empt.

### D2 · The guard is a **`WHERE` clause**, not a read-then-write

```ts
prisma.shop.deleteMany({ where: { myshopifyDomain: domain, isInstalled: false } });
```

One atomic statement. A read-then-delete has a window in which a reinstall lands
between the two, and the delete then fires on a shop that is live again — the
precise failure D1 exists to prevent, reintroduced by the shape of the code.

This also makes the operation **idempotent for free**: `deleteMany` on an absent
row returns `{ count: 0 }`, where `delete` throws `P2025`. Shopify retries on any
non-200, so a handler that throws on the second delivery is a handler that gets
retried forever.

⚠️ **`count === 0` is ambiguous** — the shop is absent, or it is installed. The
distinction matters only to the log line, so it is resolved by a **second query
in the zero case only**, never on the happy path.

### D3 · Sessions are deleted **only when the shop was actually erased**

Gated on `count === 1`. Deleting sessions first, or unconditionally, would log a
**live reinstalled merchant** out of an app we just decided not to erase — a
guard that protects the data and breaks the person using it.

By construction the sweep should find nothing: `webhooks.app.uninstalled.tsx`
already deletes sessions on uninstall. It stays as the belt-and-braces path for a
missed or failed uninstall delivery, which is exactly the case where an
orphaned access token would otherwise outlive the shop record.

### D4 · The parser's output shape is decided by **what is safe to log**

🔴 **The compliance payloads carry the customer's email and phone.** Writing
those into an application log, in response to a webhook whose entire purpose is
privacy, would be its own violation — and it would be invisible, because logs are
not reviewed.

So the parser does **not** narrow "the payload"; it extracts a fixed summary of
non-identifying fields and drops the rest on the floor:

```ts
interface ComplianceSummary {
  shopDomain: string | null;    // shop_domain, only if a non-empty string
  shopId: number | null;        // shop_id, only if a finite number
  customerId: number | null;    // customer.id
  orderCount: number | null;    // orders_requested[] | orders_to_redact[] length
  dataRequestId: number | null; // data_request.id
}
```

**One function for all three topics**, not three. The shape follows the safety
rule rather than the topic list, and the three topics differ only in which fields
are absent — which `null` already expresses.

⚠️ **Counts, never contents.** `orderCount` exists so a log line can say *how
much* was requested without naming a single order.

### D5 · Nothing imports either module when this step lands

Same posture as steps 89 / 90 / 97 / 100. The value is that step 106 is a pure
wiring diff: if something breaks there, it is the wiring.

📌 `git grep` is useless for this gate on files that are new and unstaged — it
returns nothing and reads like a pass (step 100's finding). Use a plain content
search across `app/`.

---

## Build instructions

Two new files, one modified file, one modified test file. **No route file. No
`shopify.app.toml`. No schema change.**

### 1 · `app/utils/complianceWebhook.ts` — new, pure

Per `code-standards.md:15`, external input is narrowed at the entry point. This
module is framework-free and side-effect-free, so it runs under the existing
node-environment Vitest project with no config change.

Exports:

- `interface ComplianceSummary` — exactly the five fields in D4.
- `parseComplianceSummary(payload: unknown): ComplianceSummary` — total. Every
  field independently falls to `null`; nothing throws, for any input. A webhook
  handler that throws on a malformed body returns non-200 and gets retried.
- `formatComplianceLog(topic: string, shop: string, summary: ComplianceSummary): string`
  — the single place a compliance log line is constructed, so D4's guarantee has
  one place to hold rather than three.

🚫 **Do not add** an `email`, `phone`, `customerEmail`, or `raw` field, and do not
export a passthrough of the original payload. The tests below are written to fail
if any of that appears.

### 2 · `app/utils/complianceWebhook.test.ts` — new

See Tests.

### 3 · `app/models/shop.server.ts` — modified

Add one exported function beside `markShopUninstalled`, and nothing else. 🚫
`upsertShop` and `markShopUninstalled` are **not** touched — in particular
`app/uninstalled` keeps marking-and-retaining, because that retention is what
makes reinstall-with-your-work-intact possible and `upsertShop`'s reinstall
branch depends on it.

```ts
export type ShopEraseResult =
  | { erased: true; sessionsDeleted: number }
  | { erased: false; reason: "not-found" | "still-installed" };

export async function eraseShopData(shopDomain: string): Promise<ShopEraseResult>;
```

Body, in this order:

1. `shop.deleteMany` with the D2 two-condition `where`.
2. On `count === 0`: one `shop.findUnique` on the domain **purely to classify the
   log line** — present ⇒ `"still-installed"`, absent ⇒ `"not-found"`. Return
   without deleting anything.
3. On `count === 1`: `session.deleteMany({ where: { shop: shopDomain } })` (D3),
   return `{ erased: true, sessionsDeleted }`.

A structured result, not a boolean and not a logged string — the route in step
106 has to say which of the three things happened, and re-querying to find out
would defeat the atomicity D2 just bought.

⚠️ **The doc comment must state the two things a reader cannot see from the
code:** that the cascade is enforced by real FKs in Postgres (so this one delete
really does take five tables), and that `Session` has **no** FK, which is why
line 3 exists at all and must not be "tidied away" as redundant.

### 4 · `app/models/shop.server.test.ts` — modified

The hoisted `prismaMock` gains `shop.deleteMany`, `shop.findUnique` (already
present) and a new `session: { deleteMany }`.

🔴 **Deliberately omit `shop.delete` from the mock.** If a future edit swaps
`deleteMany` for `delete`, the call lands on `undefined` and every test in the
describe block dies with a `TypeError` — a louder failure than an assertion, and
one that cannot be satisfied by updating an expectation.

---

## Tests

### `complianceWebhook.test.ts`

**The PII guarantee — the reason this module exists (D4):**

1. 🔴 Given a **real-shaped `customers/redact` payload** containing
   `john@example.com` and `555-625-1199`, `JSON.stringify(parseComplianceSummary(p))`
   contains **neither string**, case-insensitively. Behavioural, not structural —
   it fails for a passthrough field whatever that field is named.
2. The same claim for `formatComplianceLog`'s output string, with the same
   payload. Two surfaces, because a summary that is clean and a formatter that
   reaches back into the payload is a plausible future bug.
3. A `customers/data_request` payload: `orderCount` is `3` and no order id
   appears anywhere in the serialized summary.

**Totality (never throw, whatever arrives):**

4. `null`, `undefined`, `42`, `"string"`, `[]`, `{}`, and a deeply nested object
   each return an all-`null` summary and do not throw. One assertion, seven
   inputs.
5. Wrong-typed fields degrade to `null` individually: `shop_domain: 12345`,
   `shop_id: "954889"` (a numeric **string** is not a number), `customer: null`,
   `orders_to_redact: "three"`, `data_request: []`.
6. `shop_domain: ""` → `null`, not `""` — an empty domain must never reach a
   `where` clause as if it were a value.

**The happy path, per topic:**

7. Each of the three documented payloads, verbatim from shopify.dev, parses to
   its expected summary. These are the fixtures the other tests reuse.

### `shop.server.test.ts` — new `eraseShopData` describe block

8. **Erases an uninstalled shop:** `deleteMany` called with **both** conditions —
   `{ myshopifyDomain, isInstalled: false }` — and sessions deleted with
   `{ shop: myshopifyDomain }`. Returns `{ erased: true, sessionsDeleted }`.
9. 🔴 **Shop isolation:** the `where` on both deletes names **only** the target
   domain. This is the priority-#1 boundary from `CLAUDE.md` at the one place in
   the app that deletes across five tables at once.
10. **Reinstall guard (D1):** `count: 0` + `findUnique` returns a row ⇒
    `{ erased: false, reason: "still-installed" }`.
11. 🔴 **…and no sessions are deleted in that case (D3).** The assertion that
    stops a reinstalled merchant being logged out by a redaction we declined to
    perform.
12. **Unknown shop:** `count: 0` + `findUnique` returns `null` ⇒
    `{ erased: false, reason: "not-found" }`, no session delete, no throw.
13. **Idempotent on redelivery:** calling twice with `count: 1` then `count: 0`
    returns `erased: true` then `erased: false` and throws neither time.
14. **No `findUnique` on the happy path** (D2) — the classifying read is the
    zero-case cost only.

### Mutation tests — ✅ all five run 2026-08-02

A guard that cannot fail is not a guard. Each was applied to the real module, the
suite run, and the module restored.

| #  | Mutation                                                  | Predicted                                          | Observed                                                     |
| -- | --------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| 1  | `parseComplianceSummary` returns `{ ...summary, payload }` | Tests 1–3 fail on the email/phone assertions       | ⚠️ **7 fail** — over-delivered; see the note on test 2        |
| 2  | Drop `isInstalled: false` from the delete's `where`        | The reinstall test fails (D1's whole point)        | 🔴 **WRONG — the reinstall test passed.** See below           |
| 3  | Delete sessions unconditionally, before the guard          | Test 11 fails; 14 may also fire                    | ⚠️ **3 fail** — over-delivered, benignly                      |
| 4  | `deleteMany` → `delete`                                    | The block dies with `TypeError`                    | ✅ **All 7 die** with `shop.delete is not a function`          |
| 5  | Leak `isInstalled: false` onto the classifying **read**    | *(not predicted — this mutation was an accident)*  | ✅ **1 fails**, precisely, once the guard for it was written   |

🔴 **M2 falsified the central claim of this step's test plan, and the mechanism
is worth carrying: A MOCKED PRISMA CANNOT ENFORCE A `WHERE` CLAUSE.**
`deleteMany` returns whatever the mock was told to return, no matter what it was
asked — so removing `isInstalled: false` from the query left
`declines to erase a shop that has been reinstalled` passing, green and
meaningless. Only Postgres can actually apply that guard, and Postgres is not in
this test file.

What caught the mutation instead was the exact-`where` assertion in a *different*
test, one whose name says nothing about reinstalls. 🔬 **A behavioural test whose
subject is enforced by the database is structural whether or not it looks it.**
The repair was not to weaken the claim but to make the test earn its name: it now
asserts the guard was **written into the query** (the only coverage available at
this layer) *and* that a zero count is classified correctly. Its comment states
plainly which half is which, so the next reader does not inherit the belief I
started with. Re-run after the change: **M2 now fails 2 tests, including the one
named for it.**

🔴 **M5 exists because I broke the code with a careless `sed` and NOTHING
FAILED.** Restoring M2 with a global substitution also rewrote the classifying
`findUnique`'s `where`, adding `isInstalled: false` to a read that must not be
filtered — which inverts the log line, reporting a still-installed shop as
`not-found`, the exact opposite of what happened. The suite stayed green, because
the read's `where` was asserted nowhere. 🔬 **Two lessons.** A blind global
substitution over a file with a repeated expression is a mutation you did not
intend to run — prefer a targeted edit. And **the accident was more informative
than the four planned mutations**: it found a real gap none of them covered. The
gap is now closed by a test asserting the read carries the domain **and no
`isInstalled` key**, and M5 is that test's own mutation.

🔍 **On M1's over-delivery, one nuance worth keeping:** test 2
(`formatComplianceLog` emits no PII) did **not** fail. Correct, and not a weak
guard — the formatter reads only named summary fields, so extra keys cannot reach
it. Test 2 guards a *different* failure: a future formatter that takes the raw
payload as a parameter. That is precisely why `formatComplianceLog`'s signature
does not accept one.

---

## Completion gate — ✅ 8 of 8

1. ✅ `eraseShopData` deletes shop + sessions, honours the reinstall guard, and
   is idempotent; all 8 model tests pass.
2. ✅ `parseComplianceSummary` never throws and never emits an email, a phone, or
   an order id; all 21 parser tests pass.
3. ✅ **Nothing imports either module.** Content search over `app/` + `extensions/`
   for `eraseShopData` / `complianceWebhook` / `parseComplianceSummary` /
   `formatComplianceLog` returns exactly four paths — the two modules and their
   two test files. No route, no loader, no action (📌 plain search, not
   `git grep`, per D5).
4. ✅ Working tree is exactly five paths: the two new `app/utils/` files,
   `app/models/shop.server.ts`, `app/models/shop.server.test.ts`, and this doc.
   **No route file, no `shopify.app.toml`, no `schema.prisma`.**
5. ✅ Five mutations run and recorded — including M2, which failed to fail, and
   M5, which exists only because an accident found a gap the plan missed.
6. ✅ Full gate green: typecheck · lint · `format:check` ("All matched files use
   Prettier code style!") · **1338** tests / 50 files · build. Baseline
   **1309 / 49** — ⚠️ **not** the 1270 / 47 this file was planned against; see
   the Status note.
7. ✅ `context/progress-tracker.md` updated.
8. ✅ `context/data-model.md` gained a **data retention & erasure** section.

⚠️ **One test more than planned.** The plan listed 14 items and 13 landed as
written; the extra is `classifies the outcome with an UNFILTERED read`, which
exists because of M5. A test count that overshoots its plan for a *stated* reason
is fine; one that overshoots silently is the thing to distrust.

⚠️ **Explicitly owed to step 106, not to this one:** the correction of
`app-store-review-checklist.md:48` (it describes handlers that do not exist yet),
the `try/catch` prohibition made executable, and every live check.

---

## Notes carried into step 106

📌 **Use the authenticated `shop`, never `payload.shop_domain`, for the erase.**
The former is derived from the HMAC-verified request; the latter is
attacker-controlled body content, and it selects which shop gets deleted.
`parseComplianceSummary().shopDomain` exists to be **cross-checked and logged on
mismatch**, not to be passed to `eraseShopData`.

📌 **Confirm the generated route paths before trusting them.** `flatRoutes`
treats a leading `_` as pathless and a trailing `_` as a layout escape; a
mid-word underscore should be literal, so `webhooks.customers.data_request.tsx`
should resolve to `/webhooks/customers/data_request` — but the TOML `uri` must
match whatever the router actually produces, so check rather than assume. Fallback
is a hyphenated path with the TOML matched to it.

📌 **`compliance_topics`, not `topics`,** in the `shopify.app.toml` subscription
blocks — a compliance topic listed under `topics` fails CLI validation.

📌 **Compliance subscriptions only exist after `shopify app deploy`.** `dev` does
not register them. ⚠️ And a deploy is the operation
[[shopify-metaobject-deploy-clean-lifecycle]] is about — read that memory before
running it.

📌 **Co-located route tests are safe now.** `app/routes.ts` passes
`ignoredRouteFiles: ["**/*.test.{ts,tsx}"]` (feature 88 step 92), so
`webhooks.shop.redact.test.ts` beside its route will not be bundled as a route.

📌 **Shopify-side data is out of reach, by design.** The metaobject entries, the
shop routing metafield and the per-product metafields all live in the merchant's
store; after uninstall there is no access token, and Shopify removes app-owned
metaobjects and reserved-namespace metafields itself. Document it in step 106 —
do not write code that tries.
