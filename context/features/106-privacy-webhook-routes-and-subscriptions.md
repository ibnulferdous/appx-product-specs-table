# Step 106 — the three route files, the subscriptions, the deploy

**Status:** ✅ **code complete and FULLY LIVE-VERIFIED 2026-08-02. Gate 9 of 10 —
the only open item is the deploy, which is the merchant's by agreement.** Full
local gate green (typecheck · lint · format · **1353** tests / **51** files ·
build); baseline **1338 / 50**, so **+15 tests and one new file** — exactly the
planned count. Six mutations run (five planned + one added), all caught. Nine live
checks against the dev server and real Neon plus a dev-server log inspection, all
passing, with `appx-dev` **unchanged at 21 templates / 1 session**.
🚫 **`shopify app deploy` NOT run**, so nothing has reached Shopify and the App
Store blocker is not yet cleared.

**Baseline, measured on a clean tree at `018e0ac` immediately before planning:**
**1338 tests / 50 files**, `git status --porcelain` empty. ⚠️ Step 105's baseline
was wrong by 39 tests because it was read from a session-start run rather than
from the tree the diff would be measured against; this one was measured for that
reason, at that moment, and is the number every delta in this file is against.

**Parent feature:** mandatory privacy webhooks — the App Store submission
blocker. `customers/data_request`, `customers/redact`, `shop/redact` are required
of every public app; missing URLs or a wrong response is an **automatic
rejection**, not a note on the review.

**Position:** step 2 of 2. Step 105
(`105-privacy-webhook-domain-and-erase.md`) landed the payload parser and the
erase path with **nothing importing either**, precisely so that this step is a
pure wiring diff: if something breaks here, it is the wiring.

**Depends on:** step 105 only. `parseComplianceSummary`, `formatComplianceLog`
and `eraseShopData` all exist, tested, unimported.

**Migration:** **none.** No schema change, so
[[prisma-migration-stale-dev-server]] does not apply.

**Merchant-visible:** **no admin UI at all.** Three webhook endpoints and three
subscriptions. A merchant sees exactly what they see today; a Shopify reviewer
sees the difference between a rejection and a pass.

---

## What this step is, and why it is the dangerous half

Step 105 was pure local code behind a green gate — revertible by `git revert`.
This step is not:

- 🔴 **`shopify.app.toml` is a protected file** (`ai-workflow-rules.md:29`). The
  merchant approved the edit 2026-08-02 **and asked to be shown the exact diff
  before it is made.**
- 🔴 **`shopify app deploy` cannot be undone by a revert.** The subscriptions
  live on Shopify's side once deployed. The merchant will run it themselves or
  explicitly greenlight it — ⚠️ **do not run it unprompted**, and read
  [[shopify-metaobject-deploy-clean-lifecycle]] before it happens.
- 🔴 **`shop/redact` deletes data across five tables.** Its live verification is
  the only place in this project where a wrong line costs real rows, so the
  verification plan below is built around never pointing it at anything that
  matters.

---

## Decisions locked before writing code

### D1 · The erase takes the **authenticated** shop, never `payload.shop_domain`

`authenticate.webhook` returns `shop` derived from the HMAC-verified request.
`payload.shop_domain` is body content — attacker-controlled, and it *selects
which shop gets deleted*. `parseComplianceSummary().shopDomain` exists to be
**cross-checked and logged on mismatch** (`formatComplianceLog` already emits
`payload_shop_domain_mismatch=` only when the two disagree), never to be passed
to `eraseShopData`.

This is the priority-#1 boundary from `CLAUDE.md` at the one call site in the app
that can delete a whole shop, so it gets a test of its own with a payload whose
`shop_domain` is a **different** store.

### D2 · `authenticate.webhook` is never wrapped in `try`/`catch`

It throws a `Response` — `405` on non-POST, **`401` on invalid HMAC**, `400` on
other validation failures — before a line of handler code runs
(`@shopify/shopify-app-react-router/dist/cjs/server/authenticate/webhooks/authenticate.js:14–36`,
read in step 105). The 401 a reviewer probes for is therefore **free**, and the
only way to lose it is to catch the throw and return a 200.

🔬 **Made executable behaviourally, not by grepping for the word `try`.** Each
route gets a test that mocks `authenticate.webhook` to throw a 401 `Response` and
asserts the action **rejects with that same Response**. A source guard would ban
a keyword; this bans the failure. It also stays honest if a future edit adds a
legitimate `try` somewhere harmless.

🚫 **And nothing else gets a `try`/`catch` either.** If `eraseShopData` fails, we
*want* the non-200: Shopify retries, and the operation is idempotent. Swallowing
a database error to return 200 would turn a failed erase into a permanently
acknowledged one.

### D3 · The two `customers/*` handlers acknowledge and touch **no database**

This app stores zero customer PII — audited model by model in step 105 and
written up in `data-model.md` §"Data retention & erasure". So there is nothing to
disclose for `customers/data_request` and nothing to delete for
`customers/redact`. They parse the payload for a log line and return 200.

⚠️ **"No-op" is a claim about the database, not about the code.** They still
`authenticate.webhook` (the 401), still log through `formatComplianceLog` (so the
no-PII guarantee holds at all three endpoints, not two), and still cross-check
the payload domain. A test asserts neither handler reaches Prisma.

### D4 · The `shop/redact` erase runs **inline**, not on a queue

Two queries on the happy path, one extra in the zero case. This app has no job
infrastructure and building some for a webhook that fires once per uninstalled
shop would be the definition of premature.

⚠️ **The accepted risk, stated rather than discovered later:** a Neon cold start
can exceed Shopify's response window — this project already needed
`connect_timeout=30` for exactly that reason ([[neon-cold-start-prisma-connect-timeout]]).
A timed-out delivery is a **retry**, not a lost erase, because `eraseShopData` is
idempotent by construction (`deleteMany` returns `{ count: 0 }` where `delete`
would throw `P2025`). Related: **OQ-103-A**, the unanswered question about what a
retry burst does to the connection pool. This step does not close it.

### D5 · One `[[webhooks.subscriptions]]` block **per uri**, three blocks

A subscription block carries a single `uri`, and each topic has its own handler
route, so the three cannot share a block. This also matches the CLI template's
own commented example verbatim.

📌 **`compliance_topics`, not `topics`** — a compliance topic listed under
`topics` fails CLI validation. Confirmed against shopify.dev 2026-08-02
(`/docs/apps/build/compliance/privacy-law-compliance` and the
`shopify-app-react-router` webhooks guide).

🚫 **`api_version = "2026-07"` is NOT touched.** It disagrees with the runtime
Admin client's `October25` ([[admin-api-version-mismatch]]), which is a real and
separately-tracked discrepancy — but changing a webhook API version is its own
migration-shaped decision about payload shapes, and bundling it into the diff
that must be reviewed line by line would be the wrong place to have that
argument.

### D6 · Route paths are **confirmed from the router**, not assumed

`flatRoutes` treats a leading `_` as pathless and a trailing `_` as a layout
escape; a mid-word underscore should be literal. Strong existing evidence:
`webhooks.app.scopes_update.tsx` is subscribed at `/webhooks/app/scopes_update`
and works in this app today.

⚠️ **Evidence is not the same as a check.** The TOML `uri` must match whatever
the router actually produces, and a mismatch is silent — Shopify posts to a URL
that 404s and the app looks compliant in the config while failing every delivery.
So: create the three files, run `npm run typecheck` (which runs
`react-router typegen`), and read the generated path out of `.react-router/types/`
**before** the TOML `uri` values are written. Fallback if the underscore is eaten:
a hyphenated route filename with the TOML matched to it.

### D7 · One test file for all three routes, not three co-located ones

All three routes import `../shopify.server`, whose module body calls
`shopifyApp({...})`. That needs mocking once, not three times. Precedent:
`createFlowContract.test.ts` already sits at the top of `app/routes/` for the
same reason — it is a guard that spans route files and belongs to none of them.

📌 Safe there since feature 88 step 92: `app/routes.ts` passes
`ignoredRouteFiles: ["**/*.test.{ts,tsx}"]`, so a `.test.ts` beside a route is not
bundled as one. Without that, `npm run build` dies while the suite stays green.

---

## Build instructions

Three new route files, one new test file, one protected-file edit, three doc
edits. **No schema change. No new dependency.**

### 1 · `app/routes/webhooks.customers.data_request.tsx` — new

```ts
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(formatComplianceLog(topic, shop, parseComplianceSummary(payload)));
  return new Response();
};
```

🚫 No `db` import. No `session` / `admin` use — `session` is `undefined` for
compliance handlers and that is normal (step 105 §research).

### 2 · `app/routes/webhooks.customers.redact.tsx` — new

Identical body. ⚠️ **Deliberately a second copy rather than a shared handler
factory.** Two four-line files that will diverge the moment either topic ever
does real work, versus an abstraction over two call sites — and a factory would
put a layer between `authenticate.webhook` and the route, which is exactly where
D2's throw would get lost.

### 3 · `app/routes/webhooks.shop.redact.tsx` — new

Same first two lines, then:

```ts
const result = await eraseShopData(shop); // D1: `shop`, never summary.shopDomain
console.log(/* the outcome: erased+sessionsDeleted | still-installed | not-found */);
return new Response();
```

⚠️ **The doc comment must state the one thing a reader cannot see here:** that
`eraseShopData` declines to erase a *reinstalled* shop, so a 200 from this route
does not mean data was deleted — and that this is deliberate (merchant decision
D1, 2026-08-02), not a bug to be "fixed" by dropping the guard.

### 4 · `app/routes/complianceWebhookRoutes.test.ts` — new

See Tests. Mocks `../shopify.server` (for `authenticate.webhook`),
`../models/shop.server` (for `eraseShopData`), and `../db.server` — the last one
so that a handler which starts touching Prisma is **visible**, not merely
untested.

### 5 · `shopify.app.toml` — 🔴 PROTECTED, exact diff below

Appended inside `[webhooks]`, after the `app/scopes_update` block. Indentation
and the spaced array brackets match the CLI's own formatting so a later `dev` or
`deploy` does not reformat the file underneath us.

```toml
  # Mandatory compliance webhooks — required of every public app (step 106).
  # `compliance_topics`, NOT `topics`: a compliance topic under `topics` fails
  # CLI validation. One block per uri, because a subscription carries a single
  # uri and each topic has its own handler route.
  [[webhooks.subscriptions]]
  uri = "/webhooks/customers/data_request"
  compliance_topics = [ "customers/data_request" ]

  [[webhooks.subscriptions]]
  uri = "/webhooks/customers/redact"
  compliance_topics = [ "customers/redact" ]

  [[webhooks.subscriptions]]
  uri = "/webhooks/shop/redact"
  compliance_topics = [ "shop/redact" ]
```

🔴 **Nothing else in the file changes.** If `git diff shopify.app.toml` shows a
touched line under `[metaobjects.*]`, `[product.metafields.*]`,
`[shop.metafields.*]`, `[access_scopes]` or `application_url`, **stop** — those
are definition migrations with live data behind them
([[shopify-metaobject-deploy-clean-lifecycle]]), and none of them belong to this
step.

### 6 · Doc corrections

- `context/app-store-review-checklist.md:48` — currently says all three "may be
  acknowledged no-ops". 🔴 **That is false for `shop/redact`**, which now does
  real work. Correct it and point at the three route files.
- `context/data-model.md` — the §"Data retention & erasure" section already
  describes the behaviour; add the route paths so the section names its
  entry points.
- `context/progress-tracker.md` — per the standing rule.

---

## Tests — planned, against the 1338 baseline

Behavioural throughout. The plan is ~15 tests; a final count that overshoots for
a *stated* reason is fine, one that overshoots silently is not (step 105).

**The 401 must stay free (D2) — one per route, 3 tests:**

1–3. `authenticate.webhook` mocked to **throw** a `Response(null, {status: 401})`;
each action rejects with that exact Response. Fails the moment anyone wraps the
call.

**`shop/redact` — the shop-isolation boundary:**

4. 🔴 Payload carries `shop_domain: "attacker.myshopify.com"`, header-authenticated
   shop is `demo.myshopify.com`; `eraseShopData` is called with
   **`demo.myshopify.com`** and nothing else. (D1.)
5. `{ erased: true, sessionsDeleted: 2 }` → status 200.
6. `{ erased: false, reason: "still-installed" }` → status **200**, and
   `eraseShopData` called exactly once (no retry-in-handler).
7. `{ erased: false, reason: "not-found" }` → status 200.
8. `eraseShopData` rejects → the action **rejects** (no `try`/`catch`), so
   Shopify sees a non-200 and retries. The inverse of test 5, and the one that
   fails if someone "hardens" the handler.

**The two `customers/*` handlers (D3):**

9–10. Each returns status 200 on a real-shaped payload.
11–12. 🔴 Neither reaches Prisma: the mocked `db.server` records **zero** calls,
and `eraseShopData` is not called.

**The no-PII guarantee, at the route layer (step 105 D4):**

13–15. For each of the three routes, with a real-shaped payload containing
`john@example.com` and `555-625-1199`: the captured `console.log` output contains
**neither string**, case-insensitively. Step 105 proved the *parser* and the
*formatter* clean; this proves the *handler* did not log the payload beside them,
which is the actual way this guarantee gets lost.

### Mutation tests — ✅ all six run 2026-08-02

Each applied to the real route, the suite run, the route restored. 📌 Targeted
edits only — step 105's M5 was a blind global `sed` that silently mutated a
second expression, so no substitution was used here.

| #  | Mutation                                                          | Predicted                         | Observed                                              |
| -- | ----------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| 1  | Wrap `authenticate.webhook` in `try { } catch { }` in `customers/redact` | That route's 401 test fails       | ✅ **exactly 1**, the named test                       |
| 2  | `eraseShopData(summary.shopDomain ?? shop)`                       | Test 4 fails, and only it         | ✅ **exactly 1**, the named test                       |
| 3  | `customers/redact` calls `eraseShopData(shop)`                    | Tests 11–12 fail                  | ⚠️ **1 fails, not 2** — see below                      |
| 3b | `customers/redact` calls `db.session.deleteMany(...)`             | *(added — proves the trap works)* | ✅ **1 fails**, naming `session.deleteMany`             |
| 4  | Log the raw `payload` beside the summary in `customers/redact`    | Tests 13–15 fail                  | ⚠️ **1 fails, not 3** — same cause as M3               |
| 5  | Return `500` on `still-installed`                                 | Test 6 fails                      | ✅ **exactly 1**, the named test                        |

✅ **M2's prediction HELD, which is the result step 105 could not get.** There,
the equivalent mutation failed to fail: a mocked Prisma returns what it was told
no matter what it was asked, so removing `isInstalled: false` from a `where` left
the reinstall test green. Here the boundary is an *argument to a mocked function*,
not a *clause inside a query object*, and an argument is something a mock records
exactly. 🔬 **The distinction worth carrying: a mock can testify to what you
passed it, never to what the database would have done with it.** Test 4 asserts
`eraseShopData.mock.calls[0]` deep-equals `[SHOP]` — the whole argument list, so a
second parameter smuggling the payload domain in later also fails.

⚠️ **M3 and M4 both over-predicted, from one mistake of mine.** I wrote the
predictions as "tests 11–12" and "tests 13–15" — the numbers of the *paired*
guards across all three routes — but each mutation was applied to **one** route,
so exactly one of each pair fired. The guards are not weak; the prediction
confused *the pattern* with *the instance*. 🔬 **A per-route mutation can only
fail per-route tests**, and writing predictions in terms of a test-number range
hid that. Both are recorded rather than quietly renumbered, because a prediction
that was wrong in a stated way is more useful next time than a table where every
row says ✅.

🔴 **M3b exists because M3 left something unproven.** M3 trips the
`eraseShopData` assertion, which says nothing about the Prisma trap sitting
beside it — so after M3 the trap was still an untested test. Adding a direct
`db.session.deleteMany` call proved it fires, and the failure message names the
exact dotted path (`expected [ 'session.deleteMany' ] to deeply equal []`), which
is a better diagnostic than a boolean. ⚠️ **Still honestly limited:** neither
`customers/*` route imports `db.server` today, so the trap is armed for a future
edit rather than describing current behaviour. The test file says so in a comment
rather than implying coverage it does not have.

---

## Live verification — the plan, including what will NOT be done

📌 **Registration and handler-correctness are separable, which is what makes this
safe.** `shopify app webhook trigger` sends a properly HMAC-signed sample payload
to any address, with no subscription involved. So the handlers can be proven
before the deploy, and the deploy then only has to prove that Shopify has the
three URLs.

**Order:**

1. `shopify app dev` running (merchant's terminal, foreground — `ai-workflow-rules.md`
   §Running the App Locally). Note the tunnel URL.
2. **Bad HMAC → 401.** `curl -X POST` at `<tunnel>/webhooks/shop/redact` with a
   garbage `X-Shopify-Hmac-Sha256`. 🔴 This is the check a reviewer actually
   probes and the one D2 exists for.
3. **Both `customers/*` topics** via `shopify app webhook trigger` →
   **200**, and the dev-server log line contains no email and no phone from the
   CLI's own sample payload. 🔬 Real Shopify-shaped PII, not a fixture we wrote.
4. **`shop/redact`, three cases, on THROWAWAY shop rows created in Neon for the
   purpose** (via the Neon MCP, then removed):
   - shop `A`, `isInstalled: false`, with one template → **erased**; the template
     is gone too, which is the cascade proven against real Postgres rather than
     against a migration file we read.
   - shop `B`, `isInstalled: **true**`, with one template → **declined**,
     `still-installed`, template **intact**. This is merchant decision D1 proven
     live.
   - a domain with no row → **not-found**, 200, no throw.
5. 🚫 **`shop/redact` is NEVER fired at the real dev-store domain.** Step 4's
   second case already proves the guard, on a row we can afford to lose. Firing
   at the live store would add no information and risks 13 real templates against
   a guard that is exactly what is under test. This is a hard rule for this step.
6. **Then the deploy** — merchant-run or explicitly greenlit. Afterwards, confirm
   in the Partner Dashboard that all three compliance URLs are registered and
   match the routes from D6. ⚠️ **Check `application_url` immediately before
   deploying**: `automatically_update_urls_on_dev = true` means `shopify app dev`
   rewrites it to the current tunnel, and whatever it says at deploy time is what
   the app's URL becomes. That is a pre-existing property of every deploy in this
   project, not something this step introduces — but this is the first deploy
   whose whole point is that Shopify can reach a URL of ours.

**Out of reach by design, and no code will try:** the metaobject entries, the
shop routing metafield and the per-product metafields all live in the merchant's
store. After uninstall there is no access token, and Shopify removes app-owned
metaobjects and reserved-namespace metafields itself (`data-model.md`
§"Shopify-side data is out of reach").

### ✅ Results — run 2026-08-02 against the local dev server + real Neon

Baseline first, and it is the number everything else is measured against:
`appx-dev.myshopify.com`, `isInstalled = true`, **21 templates, 1 session**, the
only `Shop` row in the database.

| # | Check                                                            | Result                                                                 |
| - | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1 | Bad HMAC → **401**, all three routes                             | ✅ 401 / 401 / 401                                                      |
| 2 | Signed `shop/redact`, shop absent                                | ✅ 200, no throw                                                        |
| 3 | Signed `shop/redact`, throwaway **A** (uninstalled)              | ✅ 200 — shop, template **and session** all gone                        |
| 4 | Signed `shop/redact`, throwaway **B** (installed)                | ✅ 200 — shop, template and session **all intact**                      |
| 5 | Redelivery of A (now absent)                                     | ✅ 200, idempotent                                                      |
| 6 | Signed `customers/redact` + `customers/data_request`             | ✅ 200 each, **database completely unchanged**                          |
| 7 | Forged `shop_domain: attacker…`, authenticated as B              | ✅ 200, `attacker` never touched, B intact                              |
| 8 | Same request as #4, only `isInstalled` flipped to false          | ✅ 200 — **erased.** One variable, opposite outcome                     |
| 9 | `appx-dev` before vs after everything                            | ✅ **21 templates / 1 session, unchanged**                              |

🔬 **#3 proves the two claims `eraseShopData`'s doc comment makes, against real
Postgres rather than against migration SQL we read.** The template died with no
code touching `Template` — that is the FK cascade. And the session died even
though **`Session` has no FK at all**, so no cascade could have reached it; only
the explicit second delete could. Both halves observed, not inferred.

🔬 **#8 is the strongest single piece of evidence in the step, and it was free.**
It is #4's request re-sent byte-for-byte against the same shop after flipping one
boolean — declined, then erased. A controlled experiment with exactly one
variable, which no amount of mocked-Prisma testing could produce (step 105's M2
found out the hard way that a mock cannot apply a `WHERE`). It also served as the
cleanup: the throwaway rows were removed **by the feature under test**, so no
destructive SQL was written by hand.

🔴 **NEW FINDING — the library does NOT cross-check `payload.shop_domain` against
the authenticated header, so D1 is load-bearing rather than defence-in-depth.**
#7 sent a forged `shop_domain` and got a 200 with the payload domain ignored —
i.e. the forged value **reaches the handler**, and the only thing standing between
it and a `where` clause is the route using `shop`. Had the route used
`summary.shopDomain`, this request would have attempted an erase on a domain
chosen by the request body. ⚠️ It also means the `payload_shop_domain_mismatch=`
log branch is genuinely reachable in production, not dead code.

🔴 **NEW FINDING — `X-Shopify-Webhook-Id` is REQUIRED; omitting it is a 400.**
Cost real time: an early probe returned 400 and the obvious reading was "the
library rejected the shop mismatch", which would have made #7 impossible to test
and quietly falsified the finding above. A 2×2 isolation (payload B/attacker ×
header present/absent) settled it in one run: **both** 400s were the missing
header and **both** 200s came back regardless of the payload domain.
🔬 **The lesson is step 102's instrument rule again, one layer out: a non-200 from
a hand-built request is a claim about my request first, and about the code
second.** Two hypotheses, one experiment that separates them — rather than
adopting the more interesting explanation because it arrived first.

✅ **The no-PII log check is CLOSED** — merchant pasted the dev-server terminal
2026-08-02. Every delivered line carries `shop_id`, `customer_id`, `orders=<n>`
and `data_request_id`, and **no email, no phone and no order id appears
anywhere**: not `john@example.com`, not `555-625-1199`, not `299938` / `280263` /
`220458`. `orders=3` is the count doing exactly the job D4 invented it for.

🔬 **The strongest line was one nobody planned.** The first delivery of the pass
came from `shopify app webhook trigger`, and its `customer_id=191167`,
`orders=3`, `data_request_id=9999` identify it as **Shopify's own documented
sample payload** — the one carrying `john@example.com` and `555-625-1199`. So the
guarantee is verified against Shopify-generated data arriving through the real
HMAC path, not merely against a fixture we wrote to be clean.
✅ **That same line also proves `payload_shop_domain_mismatch=` is live code**,
independently of the forged-payload test: the CLI sends the literal placeholder
`{shop}.myshopify.com` as `shop_domain` against a `shop.myshopify.com` header, so
the branch fired on a genuine delivery.

📌 **`customer_id` IS logged, deliberately.** D4 classes it as an opaque id rather
than personal data; email, phone and order ids are what the summary exists to
exclude. Stated here because a reader scanning the log will see an id and should
know it is a decision, not an oversight.

🔬 **An ABSENCE in the log is evidence too.** The 2×2 isolation sent **four**
requests and produced exactly **two** lines — the two 400s (missing
`X-Shopify-Webhook-Id`) logged nothing at all. That confirms a rejected request
never reaches handler code, which is the same mechanism that makes the 401 free,
observed from the other side.

✅ **The terminal independently corroborates every Postgres reading**:
`erased=true sessions_deleted=1` on A, `reason=still-installed` on B,
`reason=not-found` on the redelivery, and `erased=true sessions_deleted=1` again
on B after the `isInstalled` flip. Two instruments, one story.

---

## Completion gate — 9 of 10

🚫 **The one open item is item 9, `shopify app deploy`, and it is the merchant's
by agreement.** Everything verifiable without touching Shopify's side is done.

1. ✅ Three route files exist, each ending in a 200, none wrapping
   `authenticate.webhook` — and the wrapping is banned behaviourally (M1), not
   by a keyword search.
2. ✅ Route paths **read out of the generated router**, not assumed.
   `.react-router/types/+routes.ts` declares `/webhooks/customers/data_request`,
   `/webhooks/customers/redact`, `/webhooks/shop/redact` verbatim — the mid-word
   underscore is literal to `flatRoutes`, so the hyphenated fallback was not
   needed. TOML `uri` values match exactly.
3. ✅ `shopify.app.toml` diff is **18 added lines and nothing else** — three
   subscription blocks plus a comment, all inside `[webhooks]`. Confirmed by
   `git diff`: no `[metaobjects.*]`, no `[*.metafields.*]`, no `[access_scopes]`,
   no `application_url`. ✅ `shopify app config validate --json` →
   `{"valid": true, "issues": []}`, which also confirms D5's `compliance_topics`
   key against the CLI's own schema rather than against a doc page.
4. ✅ **1338 / 50 → 1353 / 51**, i.e. **+15 tests**, exactly the plan — 3 (401)
   + 5 (`shop/redact`) + 4 (`customers/*`) + 3 (no-PII). No silent overshoot.
5. ✅ Six mutations run and recorded, including the two whose predictions were
   wrong and why.
6. ✅ Full gate green: typecheck · lint · `format:check` ("All matched files use
   Prettier code style!") · 1353 tests · build.
7. ✅ Bad HMAC → **401** on all three routes (which also proves the three URLs
   resolve — a wrong path would have 404'd); all signed deliveries → **200**; and
   **no email, phone or order id in any log line**, verified against Shopify's own
   sample payload in the dev-server terminal.
8. ✅ **Live, against real Neon.** A (uninstalled) erased with the cascade **and**
   the session sweep; B (installed) declined with shop, template and session all
   intact; redelivery idempotent; a forged `payload.shop_domain` ignored; and B
   then erased by the **identical** request once `isInstalled` flipped — one
   variable, opposite outcome. Throwaway rows cleaned up **by the feature under
   test**, so no destructive SQL was hand-written. `appx-dev` **unchanged at 21
   templates / 1 session**, counted before and after.
9. ☐ **OWED, and the merchant's to run** — `shopify app deploy`, then the three
   compliance URLs confirmed registered in the Partner Dashboard. ⚠️ Check
   `application_url` immediately beforehand: it currently reads
   `https://example.com` on disk and `shopify app dev` rewrites it to the live
   tunnel, so whichever value is present at deploy time becomes the app's URL.
10. ✅ Docs: `app-store-review-checklist.md` §3 corrected (it claimed all three
    "may be acknowledged no-ops" — false for `shop/redact`) and gained a separate
    401 line; `data-model.md` §15 gained the topic → route → URL table and the
    "200 ≠ deleted" warning; `progress-tracker.md` updated.

⚠️ **Nothing has reached Shopify.** Until the deploy runs, the three
subscriptions exist only in a local file: the routes answer, but Shopify does not
yet know to call them, so the App Store blocker this feature exists to clear is
**not yet cleared**.

---

## What this step does NOT close

- **OQ-103-A** — webhook retry bursts vs. the Neon connection pool. D4 accepts
  the retry; it does not measure the pool.
- **Billing** — the other hard blocker for a paid listing (`prd.md`,
  `app-store-review-checklist.md` §4). Unrelated, and next.
- **Phase 4 testing generally** — this step adds route-action tests for three
  routes. `webhooks.app.uninstalled.tsx` and `webhooks.app.scopes_update.tsx`
  remain untested at the route layer (checklist §3, line 49's noted gap). 🚫 Not
  widened into this step; the pattern this file establishes is what makes them
  cheap later.
