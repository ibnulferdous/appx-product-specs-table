# App Store Pre-Submission Review Checklist

The "what can break" gate for **Appx — Product Specs Table**. This is not a
substitute for Shopify's own review — it is the internal pass that should be
**green before** the app is submitted, and a reference for the human review of
every PR.

Run the per-PR gate (§0) on every change. Run the full gate (§1–§9) before a
submission, after any change to auth/session/billing/webhooks, and after any
dependency bump that touches the Shopify SDK, Prisma, or React Router.

Ordered by the priority ranking in `CLAUDE.md`: **data safety → storefront →
compliance → maintainability.**

---

## 0. Per-PR quick gate (every change)

- [ ] **CI is green** — `typecheck`, `lint`, `format:check`, `test:run`, `build` all pass (`.github/workflows/ci.yml`).
- [ ] **AI review pass** on the diff, with this prompt: *"Find bugs, missing tests, security issues, Shopify OAuth/session/billing/privacy mistakes, and over-engineering. Ignore formatting."* No unresolved serious finding.
- [ ] **You understand every line** of the diff — not skimmed.
- [ ] **Tests cover the changed behavior** (new branch / edge case has a test).
- [ ] **"What can break?" answered** for this diff: what data moves where? what on reinstall? on failed billing? on a webhook retry? if this API returns null? if it runs for 10,000 products?
- [ ] **Works in the dev store** — the exact merchant action the diff affects was exercised in the embedded app.
- [ ] **No new** scope, secret, billing, privacy, webhook, or OAuth risk introduced.

---

## 1. Merchant data safety (priority #1)

- [ ] **Shop isolation on every read/write** — every Prisma query carries `shopId` / shop scope (`app/models/*.server.ts`). No query can return another shop's data.
- [ ] **No cross-shop query path** — new loaders/actions resolve the shop from the authenticated session, never from a client-supplied id.
- [ ] **Admin GraphQL is shop-bound** — calls go through `authenticate.admin(request)`; the client is bound to the current shop's token (structural isolation, not a `where` clause).
- [ ] **Server never trusts the client payload** — submitted rows are re-validated server-side (`parseRows`) and the 200-row cap is re-checked server-side, not just in the UI.
- [ ] **Metaobject ownership** — app-reserved type (`$app:appx_spec_table`); one shop cannot read/write another's metaobject entries.
- [ ] **Secrets never in the repo** — `DATABASE_URL`, `DIRECT_URL`, Shopify API secret only in env / `.env` (git-ignored). Secret scanning + push protection enabled (Settings → Code security).

## 2. OAuth / session / install lifecycle

- [ ] **Install** — fresh install on a clean dev store completes OAuth and lands in the embedded app with no console errors.
- [ ] **Reinstall after uninstall** — `Shop.isInstalled` flips back on, session is re-created, prior templates are still owned correctly (covered by `shop.server.test.ts`; re-verify live).
- [ ] **Session token (embedded)** — App Bridge session-token auth works; no cookie-only assumptions; the app loads inside the Admin iframe.
- [ ] **Scope changes** — `webhooks.app.scopes_update` updates the stored scope; a scope change does not break existing sessions.
- [ ] **Token expiry / refresh** — an expired/invalid token re-triggers auth rather than 500-ing.

## 3. Webhooks (App Store mandatory)

- [ ] **Mandatory privacy webhooks registered and return 200** — `customers/data_request`, `customers/redact`, `shop/redact`. This app stores no customer PII, so handlers may be acknowledged no-ops, **but they must exist and respond** or review fails.
- [ ] **`app/uninstalled` cleanup** — marks the shop uninstalled + deletes sessions; **idempotent** so a duplicate delivery is a safe no-op (covered by `shop.server.test.ts`; the route itself is the Phase-3 test gap — verify live).
- [ ] **HMAC verified** — every webhook validates the Shopify signature before acting (handled by the template's `authenticate.webhook`; confirm new topics use it).
- [ ] **Retry-safe** — Shopify retries on non-200; every handler is idempotent and returns 200 quickly (no long work inline).

## 4. Billing (before submission, if charging)

- [ ] **Billing not yet built** — `prd.md` defines a pricing strategy; the Billing API flow is not implemented. If the listing is paid, this is a **blocker**.
- [ ] **Declined / failed payment** — the app degrades gracefully (read-only or gated), not a crash.
- [ ] **Subscription state on reinstall / uninstall** — a re-install does not double-charge; an active charge is handled on uninstall.
- [ ] **Test charges** — exercised on a dev store with the test flag before going live.

## 5. Admin GraphQL / API robustness

- [ ] **Null / empty handled** — a query returning `null`, `[]`, or a missing edge degrades the UI (loading / empty / error states), never throws into the route (see the metafield-definitions fetch states).
- [ ] **Throttling / cost** — bulk or paged calls respect rate limits; failures retry/back off rather than hammering.
- [ ] **Pagination bounded** — paged fetches have a hard cap and **log** what was dropped on cap-hit (`MAX_PAGES`), never silently truncate.
- [ ] **API version pinned** — queries validated against the pinned Admin API version; a version bump re-runs `validate_graphql_codeblocks`.

## 6. Storefront correctness & accessibility (priority #2)

- [ ] **Renders without the app embed running** — the Theme App Extension reads the metaobject; the storefront table does not depend on the admin app being open.
- [ ] **Missing / deleted data** — a metafield or metaobject that no longer exists renders a sensible fallback, not broken markup.
- [ ] **Accessibility** — the rendered table is semantic and screen-reader navigable; the editor's reorder handle is keyboard-operable with announcements (`reorderAnnouncements.ts`); contrast and focus states hold.
- [ ] **Performance** — the storefront block adds minimal weight; no layout shift; no blocking JS.
- [ ] **No console errors** — storefront and admin top frame both clean.

## 7. Scale

- [ ] **200-row cap** — enforced in the reducer **and** server-side (`MAX_TEMPLATE_ROWS`); paste truncates and tells the merchant what was dropped.
- [ ] **Large catalogs** — a shop with ~10,000 products and many metafield definitions still loads the picker (paged, capped) without timeout.
- [ ] **Large value cells** — long multiline values / many pills render and persist without degrading the editor.

## 8. App Store compliance & listing

- [ ] **Embedded app requirements** — App Bridge present, session-token auth, no top-level redirects that break the iframe.
- [ ] **Privacy policy** — published and linked; data handling matches what the app actually stores.
- [ ] **Listing accuracy** — screenshots, description, and scopes requested match real behavior; only scopes actually used are requested.
- [ ] **Error UX** — every failure path shows a human message, not a stack trace or blank screen.
- [ ] **Lighthouse / performance** — admin and storefront meet Shopify's performance bar.

## 9. Full dev-store dry run (before submission)

Run the exact merchant workflow end to end on a clean dev store:

- [ ] Install the app.
- [ ] Create a template, author rows (text + native field pill + metafield pill + section), reorder by mouse and keyboard, paste a table.
- [ ] Save — confirm Postgres + metaobject round-trip.
- [ ] Assign a template to a product and confirm the storefront table renders.
- [ ] Uninstall — confirm cleanup (sessions deleted, shop marked uninstalled).
- [ ] Reinstall — confirm data ownership and a clean re-entry.
- [ ] Repeat once more; confirm no duplicate-state or orphaned-record bugs.
