# Feature 47 — Multi-value scopes (UI)

## Goal in one sentence

Expose feature 46's already-shipped multi-value server to the merchant: turn the
editor's single-resource scope picker into a **multi-select picker + chip list**
for the `PRODUCT` and `COLLECTION` kinds (pick *several* products / collections
for one template), reshaping the **loader → engine state → Settings-tab picker →
Save payload** to carry a value **set** instead of a single value — a **pure
presentational + client-state slice** that adds no new server capability and
touches no invariant.

## Why this is next (and why it is the low-risk counterpart to 46)

Feature 46 relaxed the write path, the read path, and the DRAFT→ACTIVE gate to
reason over a set of selectors — server + route-action only — and left the UI
single-select. It ships behind a **documented hazard**: 46's Step 5 says *do NOT
round-trip a multi-value template through the single-select editor* — the loader's
`getAssignmentForTemplate` (`findFirst`, no `orderBy`) returns one arbitrary row of
an N>1 set, and the single-select editor Save would then **collapse the set to that
one value**. Feature 47 is the slice that closes that hazard: after it, the loader
returns the *full* INCLUDE set, the engine carries it, and Save round-trips it
without loss. **47 is the prerequisite before any N>1 template is safe to open in
the editor.**

Because the server already speaks the array shape end to end, 47 is the *cheapest*
correctness-neutral way to finish the multi-value story:

- The Save action already parses `payload.scopeValues` (array) via
  `parsePendingScope` and already threads the full `ScopeSelector[]` through the
  gate + `setTemplateScope` (feature 46). **No action change** beyond the payload
  now *carrying* the array (it already accepts it).
- `getTemplateIncludeSelectors(shopId, templateId)` already returns the full set,
  shop-scoped, INCLUDE-only. The loader just switches to it.
- The gate, the writer, the routing projection, the pure resolvers, and Decision C
  are **untouched** — 47 changes what the *browser* sends and shows, not what the
  server *decides*.

**No migration.** Application + UI code only.

> **This slice is presentational, not invariant-sensitive.** It does not need
> feature 46's adversarial correctness gate. The real hazards are narrow and named
> in the steps below (loader batch-resolve, set-aware completeness, kind-change
> reset, the EXCLUDE-hidden-but-seeded interaction, and the boundary 46 flagged) —
> none of them can create two ACTIVE templates that cover the same product, because
> the server gate is unchanged and still the sole authority.

## The model this locks in (read this before the steps)

- **Multi-select applies to `PRODUCT` and `COLLECTION` only** — the same
  `MULTI_VALUE_SCOPES` membership feature 46 locked. `ALL_PRODUCTS` carries no
  value; `PRODUCT_TYPE` / `VENDOR` carry exactly one free-text value; `NONE`
  clears. The picker renders a **chip list** only for the two multi-valued kinds;
  the other kinds keep their existing single controls (nothing / one text field).
- **One scope *kind* per template** (46's homogeneity invariant) — the picker binds
  one kind at a time; changing the kind **resets the value set** (a product GID is
  meaningless for a `VENDOR` scope). The set is homogeneous by construction because
  the whole set shares the picker's single active kind.
- **The engine carries a value *set*, not a scalar.** `scopeValue: string | null`
  becomes `scopeValues: { value: string; label: string }[]` (0..N). Single-valued
  kinds hold ≤1 entry; `PRODUCT`/`COLLECTION` hold 1..N; `NONE`/`ALL_PRODUCTS` hold
  0. Only the **kind + the value set** ride the dirty snapshot / Save payload; the
  labels are presentation (as `scopeValueLabel` was in 44).
- **The payload sends `scopeValues: string[]`** (values only, order-independent).
  The server's `parsePendingScope` already prefers this array over the legacy
  single `scopeValue`. For `PRODUCT`/`COLLECTION` it's the N GIDs; for
  `PRODUCT_TYPE`/`VENDOR` it's a 1-element array of the typed text; for
  `ALL_PRODUCTS`/`NONE` it's empty. One uniform shape for every kind. (The legacy
  `scopeValue` field may stop being sent; keep the server's fallback for safety.)
- **An empty valued set on a valued kind is *incomplete*, not *clear*** (46's
  settled decision). A `PRODUCT`/`COLLECTION` kind with zero chosen resources
  disables Save (the incomplete state, mirroring 44); only `NONE` clears. **This
  slice ships the Save-disable that 46 deferred here.**

## Scope of THIS slice

- **Loader (`route.tsx`)** — replace `getAssignmentForTemplate` (single
  `findFirst`) with `getTemplateIncludeSelectors` (the full INCLUDE set, feature
  46). Reshape the returned `assignment` from `{ scope, scopeValue, scopeValueLabel
  }` to `{ scope, values: { value, label }[] }` where `scope` is the homogeneous
  kind (or `NONE` when the set is empty) and `values` are the set members with
  resolved labels. Resolve labels for the whole set with a **single batched Admin
  query** (see Step 1) rather than N round-trips. The `/new` branch returns an
  empty set.
- **Resource-label resolver (`scopeResourceLabel.server.ts`)** — add a **batched**
  `resolveScopeValueLabels(admin, scope, gids: string[]): Promise<Map<string,
  string>>` using `nodes(ids: [...])`, fail-soft per GID (a miss → the raw GID).
  Keep the single `resolveScopeValueLabel` for the `EXCLUDE` loader path (or switch
  it too — optional, below). PRODUCT/COLLECTION only; other kinds' value *is* the
  label.
- **Engine (`useRowEngine.ts`)** — `scopeValue`/`scopeValueLabel` →
  `scopeValues: { value: string; label: string }[]`, seeded from a new
  `initialScopeValues`. `setScope` splits into: `setScopeKind(kind)` (resets the set
  to `[]`) and `setScopeValues(next)` (replace the set from a picker/text result).
  The dirty snapshot carries `scope` + an order-independent key of the value set
  (sort the values); the Save payload sends `scope` + `scopeValues: string[]`.
  `scopeComplete` becomes **set-aware** (see `isScopeSetComplete`), driving
  `canSave`. The block-clearing effect keys off the value set (not the scalar).
- **Scope helpers (`assignmentScope.ts`)** — add
  `isScopeSetComplete(scope, values: string[]): boolean` (NONE/ALL_PRODUCTS always
  complete; TYPE/VENDOR complete iff the one value validates; PRODUCT/COLLECTION
  complete iff ≥1 value and every value validates). Keep the existing scalar
  `isScopeComplete` only if still referenced; otherwise retire it.
- **Picker UI (`SettingsTab.tsx`)** — for `PRODUCT`/`COLLECTION`: a **multi-select
  App Bridge picker** (`resourcePicker({ type, multiple: true, selectionIds })`) →
  a **chip list with per-chip remove + "Add more"**, MERGE-on-add (dedupe by GID,
  keep labels) — i.e. **the exact pattern the EXCLUDE carve-out control already
  uses in this same file** (a strong reuse signal; consider extracting a shared
  `ResourceChipList` presentational component used by both INCLUDE-scope and
  EXCLUDE). Preselect the current set via `selectionIds` so reopening shows the
  chosen resources checked. `PRODUCT_TYPE`/`VENDOR` keep the single text field;
  `ALL_PRODUCTS`/`NONE` unchanged. Incomplete (a valued multi-kind with 0 chips)
  shows the inline error + disables Save.
- **Save action, gate, writer, projection, resolvers, Decision C** — **no change.**
  The action already forwards the full `pending.selectors` array to the gate and
  `setTemplateScope`; the `scopeChanged` diff is already the order-independent
  `selectorSetKey` set-compare. 47 only makes the browser *send* the set.

## Decisions (settled — inherited from 46, restated for the UI)

- **Multi-select = PRODUCT + COLLECTION only.** Same membership as 46's
  `MULTI_VALUE_SCOPES`. The chip-list UI renders for exactly these two kinds.
- **One kind per template; kind change resets the set.** The picker never mixes
  kinds; `setScopeKind` empties the values.
- **Payload carries `scopeValues: string[]` for every kind** (empty for
  NONE/ALL_PRODUCTS). Uniform; the server already prefers it. Keep the legacy
  `scopeValue` server fallback as defense in depth, but the picker stops relying on
  it.
- **Empty valued set = incomplete → Save disabled** (the UX 46 deferred to 47).
  Only `NONE` clears.
- **Reuse the EXCLUDE chip-list pattern for the INCLUDE picker.** Same
  merge-on-add + per-chip-remove + preselect flow that feature 45 shipped for
  carve-outs; ideally one shared component so INCLUDE (product/collection) and
  EXCLUDE (product) can't drift.
- **Labels are presentation, fail-soft.** A deleted/unresolvable resource degrades
  to its GID (never blank, never blocks the load) — same posture as 44/45.

## What already exists (so we don't rebuild it)

- `getTemplateIncludeSelectors(shopId, templateId): ScopeSelector[]` (46) — the
  full INCLUDE set, shop-scoped, INCLUDE-only. The loader's new read.
- `parsePendingScope` (46, `pendingAssignment.ts`) — already parses
  `payload.scopeValues` (array) → homogeneous `ScopeSelector[]`, validates +
  dedupes + rejects an empty valued set. **No change.**
- `selectorSetKey` (46) — order-independent set key already used for the
  `scopeChanged` diff. **No change.**
- The Save action's create + edit branches (46) — already thread the full array
  through the gate + `setTemplateScope`/`clearTemplateScope`. **No change.**
- `setTemplateScope` (46) — atomic create-or-replace of the whole INCLUDE set +
  Decision-C EXCLUDE cleanup. **No change.**
- The EXCLUDE carve-out control in `SettingsTab.tsx` + `excludes`/`setExcludes`
  engine state (45) — the multi-select-picker → chip-list pattern the INCLUDE
  picker copies.
- `resolveScopeValueLabel` (44, `scopeResourceLabel.server.ts`) — the single-GID
  fail-soft title resolver; 47 adds a batched sibling.
- App Bridge `shopify.resourcePicker({ type, multiple: true, selectionIds })`.

## Correctness invariants (must hold — all UPHELD, none re-implemented)

- **Disjoint ACTIVE set (priority #1/#2).** Unchanged — the server gate is the sole
  authority and is untouched. 47 cannot introduce an overlap the gate wouldn't
  catch, because every activation still runs the same `evaluateActivationConflicts`
  over the same persisted set.
- **Homogeneous INCLUDE set (46).** Upheld structurally: the picker binds one kind;
  a kind change resets the set, so the browser can only ever submit a homogeneous
  `scopeValues`. `setTemplateScope` re-checks it server-side regardless.
- **INCLUDE ∩ EXCLUDE disjoint (Decision C, 46).** Upheld: the action's
  `reconcileExcludes` + `setTemplateScope`'s in-transaction cleanup are unchanged.
  UI note — the EXCLUDE control is only shown under `ALL_PRODUCTS`, but persisted
  excludes still seed the engine under any kind (so Discard/dirty round-trips work);
  the server reconciles them. 47 does not surface excludes under PRODUCT/COLLECTION.
- **Atomic block.** Unchanged (server).
- **Shop isolation (priority #1).** The new batched label query is on the
  session-bound `admin` client (this shop's resources only), like the single
  resolver; the loader read is `where { shopId }`.
- **Save-disable on incomplete.** A valued multi-kind with 0 chips is not
  submittable — `canSave` false via `isScopeSetComplete` (client UX; the server
  re-rejects an empty valued set anyway).

## Steps (each independently verifiable)

### Step 1 — Batched label resolver + loader reshape
- Add `resolveScopeValueLabels(admin, scope, gids): Promise<Map<string,string>>`
  to `scopeResourceLabel.server.ts` — one `nodes(ids: [...])` query, `... on
  Product { title } ... on Collection { title }`, fail-soft per id (miss → the raw
  GID; a thrown/`!ok` response → every id maps to itself). Validate the `#graphql`
  block with `validate_graphql_codeblocks` @ 2025-10.
- Loader (`route.tsx`): read `getTemplateIncludeSelectors(shop.id, template.id)`;
  derive the homogeneous `scope` (the set's shared kind, or `SCOPE_NONE` when
  empty); for PRODUCT/COLLECTION batch-resolve labels once, else value-is-label;
  return `assignment: { scope, values: { value, label }[] }`. `/new` → `{ scope:
  SCOPE_NONE, values: [] }` (or `null`, matching the engine seed).
- **Tests:** loader returns the full set for an N>1 PRODUCT template (both values,
  labels resolved); a 1-value scope returns one; an empty set → `NONE`/`[]`; a
  label miss degrades to the GID. `resolveScopeValueLabels`: N ids → N labels; a
  `!ok`/throw → identity map (fail-soft); non-resource kind → value-is-label.

### Step 2 — Engine value-set state (`useRowEngine.ts`)
- Replace `scopeValue`/`scopeValueLabel` state with `scopeValues: { value, label
  }[]`, seeded from `initialScopeValues`. Provide `setScopeKind(kind)` (reset set to
  `[]`) and `setScopeValues(next)`. Snapshot: `scope` + `[...values].sort()` key;
  payload: `scope` + `scopeValues: values.map(v => v.value)`. `scopeComplete =
  isScopeSetComplete(scope, values)`. Point the conflict-banner-clearing effect at
  the value set.
- **Tests (pure engine bits):** a value added/removed flips `isDirty`; a reorder
  does NOT (set key); the payload carries `scopeValues` (array of the GIDs / the one
  text); a kind change empties the set + flips dirty; `canSave` is false for a
  valued multi-kind with 0 values, true at ≥1.

### Step 3 — Set-aware completeness (`assignmentScope.ts`)
- Add `isScopeSetComplete(scope, values: string[])`: `NONE`/`ALL_PRODUCTS` → true;
  `PRODUCT_TYPE`/`VENDOR` → `values.length === 1 && validateScope(scope,
  values[0]).ok`; `PRODUCT`/`COLLECTION` → `values.length >= 1 &&
  values.every(v => validateScope(scope, v).ok)`. Client-safe, pure.
- **Tests:** each kind's complete/incomplete boundaries, incl. multi-value PRODUCT
  (0 → false, 1 → true, N valid → true, N with one bad GID → false) and the
  single-valued kinds rejecting N>1 at the UX layer (defense in depth; the server's
  `MULTI_VALUE_SCOPES` arity check is the real guard).

### Step 4 — Multi-select picker + chip list (`SettingsTab.tsx`)
- For `PRODUCT`/`COLLECTION`: `resourcePicker({ type, multiple: true, selectionIds:
  scopeValues.map(v => ({ id: v.value })) })` → merge into the set (dedupe by GID,
  keep labels) via `setScopeValues`; render a chip list with per-chip **Remove** +
  an **"Add / Add more products|collections"** button — mirroring the EXCLUDE
  control already in this file (extract a shared `ResourceChipList` if clean). The
  incomplete state (0 chips on a valued kind) shows the inline critical text.
  `PRODUCT_TYPE`/`VENDOR`: single `<s-text-field>` writing a 1-element set via
  `setScopeValues([{ value, label: value }])`. `ALL_PRODUCTS`/`NONE`: unchanged. A
  kind change (`<s-select>`) calls `setScopeKind`.
- **Verify (browser):** per [[browser-verify-embedded-app]] — Claude-in-Chrome on
  the embedded admin (the picker is an iframe; coordinate clicks, screenshots).
  Picking two products shows two chips + opens the SaveBar; removing one updates the
  set; an empty valued kind disables Save; reopening the picker shows the current
  set checked.

### Step 5 — Manual verification (dev store) — closes 46's Step-5 boundary
- **This is the slice that makes a multi-value template safe in the editor.** Seed
  (or reuse the 46 pattern) an ACTIVE `PRODUCT`-set template with **two** products
  via the real UI now: pick both in the multi-select, Save → gate passes (disjoint)
  → routing writes `byProduct {X→T, Y→T}` → **both** product pages render the table.
  Reload the editor and confirm **both chips reload** (loader full-set + batch
  labels) and **Save does NOT collapse the set** (the 46 hazard is gone). Then add a
  third product that overlaps another ACTIVE template → **blocked** with the rich
  banner naming it. Remove it, Save → activates. Confirm `ShopStorefrontRouting` +
  the `$app:routing` metafield via Neon. **Restore the store to baseline.**
- **Single-select regression:** a 1-product / 1-collection template, a
  `PRODUCT_TYPE`/`VENDOR`, `ALL_PRODUCTS` (with an EXCLUDE carve-out), and `NONE`
  all still activate/gate/route/render as before.

### Step 6 — Docs
- Update `data-model.md` §9 (the picker now carries a PRODUCT/COLLECTION value set;
  the editor round-trips N>1 templates — the 46 loader hazard is closed) and
  `progress-tracker.md` (feature 47 complete; the multi-value story is
  merchant-complete end to end). Advance "Next" past the 45-series to the next
  roadmap item (materialization stays deferred behind its threshold; Reshell
  Phases B–F / Templates-list Phase 2 as the tracker orders them).

## Out of scope (this file)

- **Any server / gate / writer / projection / resolver / Decision-C change** — all
  shipped in 46 and untouched here.
- **Mixed-kind scopes** ("these products **and** these collections **and** this
  vendor" on one template) — a strictly more general model; not an MVP need.
- **Multi-value `PRODUCT_TYPE` / `VENDOR`** — single-valued by decision.
- **EXCLUDE carve-outs under PRODUCT/COLLECTION** — excludes remain an
  `ALL_PRODUCTS`-only control (feature 45's settled decision); 47 does not surface
  them elsewhere.
- **Per-product overflow materialization** + the list "Assigned Products" count —
  still deferred (the scaling valve behind a threshold).
- **Type/vendor autocomplete**, live pre-check on pick, WYSIWYG styling — unchanged
  from 44's deferrals.

## Open / optional

- **Share one `ResourceChipList` between INCLUDE and EXCLUDE.** Both are
  merge-on-add multi-select product/collection chip lists; extracting one
  presentational component removes the duplication (and the risk they drift). Do it
  in Step 4 if the extraction stays small; otherwise leave a `// mirrors the EXCLUDE
  control` note and defer.
- **Switch the EXCLUDE loader path to the batched resolver too.** The excludes
  loader currently does `Promise.all` of single `resolveScopeValueLabel` calls;
  once `resolveScopeValueLabels` exists, one batched `nodes` query serves both. A
  small, optional consolidation.
- **Chip-count ceiling / UX for large sets.** MVP bounded sets are fine; if a
  merchant picks dozens, revisit the 128 KB routing-metafield cap framing (the same
  deferred-materialization territory 45/46 noted). Optional: soft-cap the chip list
  with a "+N more" affordance. Not needed for MVP.
- **Loader determinism note retired.** 46's "optionally add `orderBy` to
  `getAssignmentForTemplate`'s `findFirst`" is moot once the loader reads the full
  set via `getTemplateIncludeSelectors` — the single-row `findFirst` is no longer on
  the editor path. Drop `getAssignmentForTemplate` if nothing else uses it (check
  callers before removing).
