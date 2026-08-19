# Feature 37 — Assignment model + rule persistence (data foundation)

## Goal in one sentence

Land the Postgres foundation for the assignment engine — the `add-assignment`
migration (`ProductAssignment`, `ProductAssignmentIndex` + 3 enums) and a
shop-scoped `assignment.server.ts` that reads / sets / clears a template's
**single INCLUDE scope rule** — with **no** Shopify calls, **no** UI, and **no**
activation/conflict logic yet.

## Why this is first

The whole engine (overlap resolver, routing projection, activation gate,
storefront, UI) reads and writes `ProductAssignment`. Nothing can be built until
the table exists and a template can durably store its one scope. This slice is
the equivalent of "editor Step 1" for assignment: pure persistence, fully
unit-testable, invisible to the storefront (data-model §9: *nothing is projected
to Shopify while the template is DRAFT*).

## Scope of THIS slice (deliberately narrow)

- **One `INCLUDE` rule per template.** A template's scope is a single
  `ProductAssignment` row: `(scope, scopeValue, mode = INCLUDE)`.
- **`EXCLUDE` carve-outs, per-product overrides, and any
  `ProductAssignmentIndex` population are deferred to feature 45.** We still
  **create** the `ProductAssignmentIndex` table now (it ships in the same
  `add-assignment` migration per the data-model §3 schedule), but **write no code
  that touches it** this slice.
- **No Admin API, no metaobject, no metafield.** Rules live only in Postgres
  here. Projection to Shopify is feature 41; it is triggered at activation
  (feature 42), never while merely storing a rule.

## Decisions (settled)

- **`add-assignment` adds exactly:** models `ProductAssignment` +
  `ProductAssignmentIndex`; enums `AssignmentScope`, `AssignmentMode`,
  `AssignmentIndexStatus`; and the **back-relation fields these two models
  require** on `Shop` (`assignments`, `assignmentIndexes`) and `Template`
  (`assignments`, `assignmentIndexes`). It does **not** add
  `ShopStorefrontRouting` (feature 40 / `add-routing`), `TableStyling`, or the
  billing models — those are their own scheduled migrations. Copy the model/enum
  bodies **verbatim from data-model §5** (they are already authored there); do not
  re-derive shapes.
- **`TAG` is post-MVP.** The `AssignmentScope` enum ships **without** `TAG` (it is
  a comment in data-model §5). The MVP scope set is `ALL_PRODUCTS`, `PRODUCT`,
  `PRODUCT_TYPE`, `VENDOR`, `COLLECTION`.
- **Client-safe scope validation lives in a util, not the server model** —
  mirrors `utils/templateStatus.ts`: a string-literal `ASSIGNMENT_SCOPES` list
  (no `@prisma/client` enum import, so step 44's picker can import it into the
  client bundle) + a `validateScope` that the server re-runs.
- **"Set scope" replaces, transactionally.** Because the DB `@@unique` is on the
  full `(shopId, templateId, scope, scopeValue, mode)` tuple, changing a scope
  can't be a single upsert-by-unique. `setTemplateScope` runs a transaction:
  delete the template's existing `INCLUDE` row(s), then create the new one — so a
  template always has **exactly one** INCLUDE rule, and future `EXCLUDE` rows
  (feature 45) are left untouched.

## What already exists (so we don't rebuild it)

- `getTemplateByIdForShop(shopId, id)` — the shop-scoped ownership read we reuse
  to prove a template belongs to the shop before attaching a rule.
- The `validateTemplateStatus` / `TEMPLATE_STATUSES` pattern in
  `app/utils/templateStatus.ts` — the exact shape `assignmentScope.ts` copies.
- `template.server.test.ts` — the mocked-Prisma shop-isolation test style the new
  `assignment.server.test.ts` mirrors.

## Correctness invariants (must hold)

- **Shop isolation (priority #1).** Every read/write is scoped by `shopId`.
  `setTemplateScope` first proves ownership via `getTemplateByIdForShop`; a
  foreign/unknown `templateId` returns `{ ok: false, error: "Template not found" }`
  and writes nothing. The created `ProductAssignment` carries both `shopId` and
  `templateId` from the owned template — a rule can never bind to another shop's
  template.
- **`scopeValue` shape:** `NULL` **iff** `ALL_PRODUCTS`; a non-empty value is
  **required** for every other scope. `PRODUCT` / `COLLECTION` values are Shopify
  GIDs (`gid://shopify/Product/…` / `…/Collection/…`); `PRODUCT_TYPE` / `VENDOR`
  are exact strings. Validation rejects the mismatches (empty value on a valued
  scope, a value on `ALL_PRODUCTS`, unknown scope, `TAG`).
- **Exactly one INCLUDE rule per template** — guaranteed by the transactional
  replace, not left to callers.
- **No Shopify side effects.** This slice must not import or call the Admin API,
  `metaobjects.server.ts`, or `templateSync.server.ts`.
- `ProductAssignmentIndex` gets a table but **no writer** — asserted by the
  absence of any code path that inserts into it.

---

## Steps (each independently verifiable)

### Step 1 — `add-assignment` migration

- Paste the `ProductAssignment`, `ProductAssignmentIndex` models and the
  `AssignmentScope` (no `TAG`), `AssignmentMode`, `AssignmentIndexStatus` enums
  from **data-model §5** into `prisma/schema.prisma`. Add the back-relation
  fields to `Shop` (`assignments ProductAssignment[]`,
  `assignmentIndexes ProductAssignmentIndex[]`) and `Template`
  (`assignments ProductAssignment[]`, `assignmentIndexes ProductAssignmentIndex[]`).
  Do **not** add `storefrontRouting` / styling / billing relations yet.
- Run `npx prisma migrate dev --name add-assignment`.
- **Verify:** confirm `ProductAssignment` + `ProductAssignmentIndex` tables and
  the enums exist in Neon (Neon MCP `get_database_tables` / `describe_table_schema`
  or a `SELECT`), the `@@unique` / indexes are present, and `npm run build`
  passes. **Do not** write app code that depends on the tables until this check
  passes (data-model §3 rule).

### Step 2 — Client-safe scope validation util

- New `app/utils/assignmentScope.ts` (client-safe, no `@prisma/client` import):
  - `ASSIGNMENT_SCOPES` — the string-literal list
    `["ALL_PRODUCTS","PRODUCT","PRODUCT_TYPE","VENDOR","COLLECTION"]`.
  - `validateScope(scope, scopeValue): { ok: true; scope; scopeValue: string | null }
    | { ok: false; error }` — trims; checks scope membership; enforces the
    `scopeValue` shape invariant above (NULL iff `ALL_PRODUCTS`; non-empty
    otherwise; light `gid://shopify/` structural check for `PRODUCT` /
    `COLLECTION`). Mirrors `validateTemplateStatus`.
- **Test:** `assignmentScope.test.ts` — each valid scope+value passes;
  `ALL_PRODUCTS` + a value rejected; `PRODUCT`/`PRODUCT_TYPE`/`VENDOR`/`COLLECTION`
  with `""` rejected; `"tag"` / unknown rejected; a `PRODUCT` value without the
  `gid://` prefix rejected. Build + suite green.

### Step 3 — `assignment.server.ts` (shop-scoped CRUD)

- New `app/models/assignment.server.ts`:
  - `getAssignmentForTemplate(shopId, templateId)` → the template's INCLUDE rule
    or `null`, read shop-scoped (`findFirst where { shopId, templateId, mode:
    INCLUDE }`).
  - `setTemplateScope(shopId, templateId, { scope, scopeValue })` →
    `validateScope` first; `getTemplateByIdForShop` ownership gate; then a
    `prisma.$transaction` that `deleteMany`s the template's INCLUDE rows and
    `create`s the new one (both shop-scoped). Returns `{ ok, data }` /
    `{ ok: false, error }`.
  - `clearTemplateScope(shopId, templateId)` → shop-scoped `deleteMany` of the
    template's INCLUDE rows; returns `{ ok, count }`.
- **Test:** `assignment.server.test.ts` (mocked Prisma, mirrors
  `template.server.test.ts`): a foreign `templateId` blocks the create (ownership
  gate), the transaction replaces (deleteMany → create), the created row carries
  `shopId` + `templateId` + `mode: INCLUDE`, an invalid scope is rejected before
  any DB call, and every `where` carries `shopId`. Build + suite green.

### Step 4 — Docs

- Update `context/progress-tracker.md`: mark the `add-assignment` migration +
  rule persistence done (one line + this file pointer); note
  `ProductAssignmentIndex` exists but is unpopulated until feature 45.
- No `data-model.md` change expected (schema copied verbatim from it); if the
  live schema needed any deviation, reconcile §5 **before** finishing.

---

## Out of scope (this file)

- `EXCLUDE` carve-outs, per-product overrides, `ProductAssignmentIndex`
  population + its Shopify sync (feature 45).
- Overlap / conflict detection (features 38–39) and activation gating (42).
- Routing projection + shop metafield (features 40–41).
- Storefront Liquid (43) and the assignment UI (44).
- Any Admin API / metaobject / metafield call.

## Open / optional

- **`scopeValue` GID strictness:** MVP uses a light structural check
  (non-empty; `gid://shopify/Product/` · `gid://shopify/Collection/` prefixes).
  A stricter regex or an existence check against Shopify is deferred — the UI
  (step 44) supplies these values from Shopify pickers, so malformed input is
  unlikely. Full existence validation belongs to the dry-run (feature 39), not
  here.
