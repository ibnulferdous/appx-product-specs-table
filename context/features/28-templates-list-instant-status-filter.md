# Templates list — instant (client-side) status filter

## Goal in one sentence

Switching the Status filter (**All / Active / Draft / Archived**) on `/app/templates`
becomes **instant** — the loader returns the shop's templates **once** and the table
filters in the browser, instead of every tab click triggering a full server
navigation (auth + shop read + two DB queries) just to show a subset of rows that
were already on the page.

## Why this is now

**Merchant-reported (2026-06-28):** clicking a status tab takes a visible beat before
the filtered list appears. The diagnosis is structural, not a slow query — each tab
is an `<s-link href="/app/templates?status=…">`, so every click is a **full React
Router navigation that re-runs the entire loader**:

```
loader → authenticate.admin(request)     // session-token validation (can round-trip to Shopify)
       → upsertShop(session)              // a shop read (fast-path returns early; still a DB hit + round trip)
       → listTemplatesForShop(shop.id, { status })   // DB query
       → countTemplatesForShop(shop.id)              // 2nd DB query
```

The `WHERE shopId = … AND status = …` query itself is already **indexed**
(`@@index([shopId, status])` in `schema.prisma`) and fast — the latency is the
**client → server → DB round trip + auth**, paid on every tab click, to re-fetch data
the page already holds. For a single shop's template list (a handful to maybe dozens
of rows, hard-capped well below any pagination threshold) there is no reason to go to
the server to switch tabs. Load all of the shop's templates once; filter client-side.

This is the natural follow-on to the templates-list polish slices (25 clamp → 26
row-actions → 27 rename); it is the first **performance** item on that surface.

## What changes (architecture)

**Scope: two files** — `app/routes/app.templates.tsx` (loader + component) and one new
pure helper in `app/utils/` (unit-tested). No schema, no dependency, no metaobject,
no CSS-module change.

### 1. Loader returns ALL the shop's templates (one query) — `app.templates.tsx`

- Stop reading `?status=` in the loader. Call `listTemplatesForShop(shop.id)` with
  **no status** — return every template for the shop (still shop-scoped via `shopId`;
  priority #1 unchanged — the loader is the only place the rows are fetched and it is
  still scoped to the authenticated shop).
- **Drop the second query.** `hasTemplates` now derives from `templates.length > 0`
  (all-templates list), so `countTemplatesForShop` is no longer needed in this loader.
- **Drop `selectedStatus` from the loader payload** — the selected status now comes
  from the URL on the client (see §3), not the loader.
- Net loader: `authenticate.admin` → `upsertShop` → **one** `findMany`. Runs on the
  initial page load and on row-action revalidation (duplicate/delete/rename) — **not**
  on tab clicks.

Delete the now-unused `getStatusFromRequest` helper and the `countTemplatesForShop` /
`TEMPLATE_STATUSES` imports if they become unreferenced.

> **Server-fn cleanup (in `template.server.ts`).** After this change the list route is
> the only caller of both `countTemplatesForShop` and the `{ status }` option of
> `listTemplatesForShop`, and neither is used elsewhere (verified by grep — only the
> route + their own tests reference them). Per `code-standards.md` (single-purpose, no
> dead code): **simplify `listTemplatesForShop` to drop the `status` option** (it
> becomes `listTemplatesForShop(shopId)` — always all-of-shop, ordered `updatedAt
> desc`) and **remove `countTemplatesForShop`**. Update the model test accordingly
> (drop the "adds a status filter…" and `countTemplatesForShop` cases; **keep** the
> shop-scoping + `orderBy` + `rowCount` cases — those still assert the load-bearing
> invariant). _Alternative if we want to keep the door open for future server-side
> filtering/pagination: leave both functions in place as-is and just stop calling them
> from the loader. **Recommendation: remove them** — YAGNI; re-add when a real
> pagination slice needs server filtering._

### 2. New pure filter helper (unit-tested) — `app/utils/templateFilter.ts`

Extract the filter decision into a pure, testable function (the codebase pattern:
every slice pulls pure logic out of the React/web-component layer so it can be
unit-tested — `[[testing-strategy]]`):

```ts
// Known UI statuses + the synthetic "ALL". Reuse TemplateStatus values, do not
// re-hardcode the strings.
export type StatusFilter = "ALL" | "ACTIVE" | "DRAFT" | "ARCHIVED";

// Normalize an untrusted URL value (?status=…) to a known filter; anything
// unrecognized (or absent) falls back to "ALL" — mirrors the old
// getStatusFromRequest server guard, now on the client.
export function normalizeStatusFilter(raw: string | null | undefined): StatusFilter { … }

// Pure subset: "ALL" returns the list unchanged; otherwise the rows whose
// status === the filter. Generic over { status } so it needs no route types.
export function filterTemplatesByStatus<T extends { status: string }>(
  templates: T[],
  filter: StatusFilter,
): T[] { … }
```

These two functions are the only new **logic**; everything else is wiring.

### 3. Component reads the status from the URL, filters client-side — `app.templates.tsx`

- `const [searchParams, setSearchParams] = useSearchParams();`
  `const selectedStatus = normalizeStatusFilter(searchParams.get("status"));`
- `const visibleTemplates = filterTemplatesByStatus(templates, selectedStatus);`
  (cheap; can be wrapped in `useMemo` keyed on `templates`/`selectedStatus`, optional
  for a list this size.)
- The filter row becomes **buttons, not navigations.** Each filter calls
  `onSelectStatus(value)`:
  - `"ALL"` → `setSearchParams({})` (drop the param → URL is `/app/templates`).
  - others → `setSearchParams({ status: value })`.
  - Keep the param in the URL so the filter stays **bookmarkable / shareable /
    survives reload** — i.e. **no behavior regression** vs. the current links — but
    without a loader round trip (see §4).
- The selected tab stays visually distinct (today: selected = `<s-badge tone="info">`,
  unselected = `<s-link>`). Re-render as a clickable control set: selected tab keeps
  the `<s-badge>` look, unselected tabs become **`<s-button>`** (e.g.
  `variant="tertiary"`) wired to `onSelectStatus`. _Polaris-web-component caution
  (`[[polaris-web-component-gotchas]]`): verify the chosen control renders + clicks
  inside the section in the embedded app; **fallback** = plain `<s-button>`s for every
  tab with the active one `variant="primary"`. Record which shipped in the tracker._
- The table renders `visibleTemplates`. The **per-status empty message** ("No
  templates match this status.") now shows when `visibleTemplates.length === 0` **and**
  the shop has templates (`hasTemplates`) — a pure client check on the filtered subset;
  the **first-run empty state** (`EmptyTemplatesState`) still shows when the shop has
  **no** templates at all (`!hasTemplates`). Both branches are behavior-identical to
  today (see the empty-state matrix in Locked decisions).
- The row-action handlers (duplicate / delete, and rename once file 27 lands) and the
  shared fetcher are **unchanged** — they still POST to the list `action` and rely on
  the loader revalidating after the fetcher settles (§4 preserves that).

### 4. `shouldRevalidate` — skip the loader on a status-only change — `app.templates.tsx`

`setSearchParams` is a client navigation, which by default **re-runs the loader**
(the very round trip we're removing). Add a route-level `shouldRevalidate` that
short-circuits **only** a status-only GET navigation, while letting every real
revalidation through:

```ts
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  // A status-tab click is a GET nav (no formMethod) that only flips ?status=.
  // The loader ignores ?status entirely now (filtering is client-side), so skip
  // the round trip. Anything else — initial load, a row-action fetcher submission
  // (carries formMethod: "POST"), a path change — still revalidates.
  if (!formMethod && currentUrl.pathname === nextUrl.pathname) {
    const a = new URLSearchParams(currentUrl.search); a.delete("status");
    const b = new URLSearchParams(nextUrl.search);    b.delete("status");
    if (a.toString() === b.toString()) return false;
  }
  return defaultShouldRevalidate;
}
```

**Why the `formMethod` guard matters (the key correctness point):** after a
Duplicate / Delete / Rename fetcher settles, React Router auto-revalidates the list
loader so the table refreshes in place (this is how features 26/27 work). That
revalidation carries the fetcher's `formMethod: "POST"`, so it falls through to
`defaultShouldRevalidate` and **still runs** — the table still refreshes after a row
action. Only the no-`formMethod`, status-only GET navigation is skipped. The initial
document load always runs the loader (not subject to `shouldRevalidate`), so a
bookmarked `/app/templates?status=ACTIVE` still loads all rows then filters to Active.

## Locked decisions

- **Client-side filtering; load the shop's templates once.** The dataset is tiny and
  hard-capped far below any pagination need, so a per-click server round trip to
  subset rows already in memory is pure latency. (Trade-off: if a single shop ever
  holds hundreds+ of templates, server-side filtering **with pagination** becomes the
  right model — out of scope here and would be added together with pagination, not
  before.)
- **Keep `?status=` in the URL (shareable/bookmarkable), but skip the loader via
  `shouldRevalidate`.** No behavior regression vs. the current links; the URL still
  reflects the active filter and survives reload — it just no longer costs a round
  trip. (Rejected: pure `useState` with no URL — simpler, but silently drops the
  bookmarkable/reload-stable filter the current links provide.)
- **One loader query; derive `hasTemplates` from the returned list.** Drop the second
  `count` query and the loader's `selectedStatus`. The selected status is a client/URL
  concern now.
- **Extract a pure `filterTemplatesByStatus` + `normalizeStatusFilter`** and unit-test
  them — keep the logic out of the web-component layer (testing strategy).
- **Remove the now-dead server surface** (`countTemplatesForShop` + the `status`
  option on `listTemplatesForShop`) rather than leaving unused branches.
- **Filter tabs become buttons, not links** — selected tab visually distinct; verify
  the Polaris control in-browser with a plain-`<s-button>` fallback.

### Empty-state matrix (must stay identical to today)

| Shop has templates? | Filtered subset | Renders |
|---|---|---|
| No (`!hasTemplates`) | — | `EmptyTemplatesState` ("Create your first…"), page `base` width |
| Yes | non-empty | the table (page `large` width) |
| Yes | empty (e.g. Archived, none archived) | filter tabs + "No templates match this status." box (page `large` width) |

## What this step does *not* own (boundary)

- **Search / sort / pagination / multi-select bulk actions** — later Phase-2 items.
  (If/when pagination lands, server-side filtering returns *with* it.)
- **The row-actions menu / Duplicate / Delete / Rename** — files 26–27; this step only
  changes how the filter is applied, and must not disturb the fetcher-revalidation
  those rely on (§4 preserves it).
- **Any change to the editor route, metaobjects, schema, or `templateStatus.ts`.**

## Coordination note

`app.templates.tsx` is also touched by file 27 (Rename) — both edit the same route.
This slice changes the **loader + filter tabs + adds `shouldRevalidate`**; it leaves
the `action`, the fetcher, and the row modals alone. If 27 lands first, just confirm
its rename fetcher revalidation still flows through `shouldRevalidate` (it will — it
carries `formMethod`).

## File placement (per `code-standards.md`)

- `normalizeStatusFilter` + `filterTemplatesByStatus` → **new `app/utils/templateFilter.ts`**
  (pure, route-agnostic) + **`app/utils/templateFilter.test.ts`**.
- Loader simplification, `useSearchParams` wiring, filter buttons, `shouldRevalidate`
  → **`app/routes/app.templates.tsx`**.
- `listTemplatesForShop` simplification + `countTemplatesForShop` removal →
  **`app/models/template.server.ts`** (+ update `template.server.test.ts`).
- **No change** to `metaobjects.server.ts`, `templateStatus.ts`, `templateName.ts`,
  the editor route, or the schema.

## Testing

Per `[[testing-strategy]]` (jsdom can't render Polaris web components; no route-action
integration harness) the UI + loader wiring are browser-verified, but the **new pure
logic is unit-tested**:

- **`normalizeStatusFilter`** — maps `"ACTIVE"/"DRAFT"/"ARCHIVED"` to themselves;
  `null` / `undefined` / `""` / `"ALL"` / an unknown value (`"BOGUS"`) → `"ALL"`.
- **`filterTemplatesByStatus`** — `"ALL"` returns the list unchanged (same ref or
  equal contents); a specific status returns only matching rows and preserves order;
  empty input → empty; no input mutation.
- **`template.server.test.ts`** — update for the simplified `listTemplatesForShop`
  (drop the status-filter + count cases; keep shop-scoping, `orderBy updatedAt desc`,
  and `rowCount`/`assignedProductCount` derivation). Net suite count: roughly flat
  (≈ +new filter cases, − removed model cases) — record the exact number in the tracker.

**Browser verification (embedded app, `[[browser-verify-embedded-app]]`):**

- Clicking each tab filters **instantly** with **no network request** (confirm in the
  Network panel that a tab click fires **no** `?status` document/data fetch — only the
  initial load + any row action hit the server).
- The URL still updates to `?status=…` (and `/app/templates` for All); a **reload** of
  `?status=DRAFT` lands on Draft; the tab is **shareable** (open the URL fresh → Draft
  preselected).
- The active tab is visually distinct; the empty-subset case shows "No templates match
  this status."; a shop with zero templates still shows the create-first empty state.
- **Row actions still revalidate:** Duplicate adds the "(copy)" row at the top and
  Delete removes a row **with the table refreshing in place** — i.e. `shouldRevalidate`
  did not break the fetcher revalidation. Switching tabs after a row action shows the
  fresh data.
- No top-frame console errors.

## Done when

1. Switching status tabs is instant and fires **no server round trip** (verified in the
   Network panel); the filter is still reflected in the URL and survives reload/share.
2. The loader runs a **single** templates query; `count` query and the loader
   `selectedStatus` are gone; `hasTemplates` derives from the returned list and the
   empty-state matrix above is unchanged.
3. Row actions (Duplicate/Delete, + Rename if 27 has landed) still revalidate the list
   in place — `shouldRevalidate` only skips status-only GET navigations.
4. `normalizeStatusFilter` + `filterTemplatesByStatus` unit tests pass; the
   `template.server.ts` simplification + its updated tests pass.
5. `npm run build`, `typecheck`, `lint`, `format:check`, and `test:run` all pass.
6. `context/progress-tracker.md` updated; browser-verified in the embedded app, noting
   which filter-control variant shipped (segmented/badge vs. plain-button fallback) and
   the final suite count.
