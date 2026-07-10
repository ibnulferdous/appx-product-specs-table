# Feature 44 — Assignment scope picker UI + rich conflict warnings

## Goal in one sentence

Give merchants a control in the editor's **Settings tab** to set a template's one
assignment scope (none / all products / a product / product type / vendor / a
collection), riding the existing SaveBar; and when activating a scoped template
collides with another ACTIVE template, surface the structured `conflicts` payload
(already returned by features 42/43) as a **rich, actionable warning** instead of
the placeholder toast — making the whole rigid assignment engine merchant-driven
end to end.

## Why this is next

Everything under the UI already exists and is proven: rule persistence
(`setTemplateScope`/`clearTemplateScope`, 37), the DRAFT→ACTIVE dry-run gate
(`evaluateActivationConflicts`, 42, wired into both status surfaces), routing
projection + publish (40/41), and storefront resolution (43, live-verified). But
**no merchant can set a scope yet** — every template is scope-less, so the gate
passes trivially and the routing map is always empty. Feature 44 is the surface
that turns all of that on: a merchant picks a scope, activates, and (if disjoint)
the table goes live on every matching product. It also delivers the conflict UX
the gate was built to feed, and it's where features 42's block and 43's routing
tier get their non-scratch, merchant-driven verification.

## Scope of THIS slice

- **Scope picker in the Settings tab** (`SettingsTab.tsx`), below the status
  control: a scope-kind `<s-select>` + a conditional value input per kind
  (App Bridge resource picker for product/collection; text for type/vendor;
  nothing for none/all).
- **Scope rides the SaveBar** — the engine carries `scope`/`scopeValue` in its
  dirty snapshot + save payload (exactly as `status` does, feature 36); the editor
  Save action persists it via `setTemplateScope`/`clearTemplateScope` alongside
  `saveTemplateForShop`.
- **Generalize the gate to the PENDING scope** so an ACTIVE template's scope edit
  re-verifies disjointness pre-write (feature 42 left "ACTIVE-scope-edit" for
  here), and **rebuild routing when an ACTIVE template's scope changes** (not just
  on status transitions).
- **Rich conflict warning** — a persistent banner in the Settings tab driven by
  the save response's `conflicts`, naming the colliding template(s) with links +
  resolution guidance. Replaces feature 42's concise toast.
- **Scope-less-ACTIVE guidance** — warn that a template with no scope renders on no
  products (it contributes nothing to routing).
- **Out:** multi-value scopes (several products/collections per template — needs
  relaxing the one-INCLUDE-rule model, feature 45); EXCLUDE carve-out UI (45);
  live pre-check of conflicts before Save (optional, below); the list "Assigned
  Products" count (broad-rule count is non-trivial — stays a later slice).

## Decisions (settled)

- **Location: the editor Settings tab — no standalone `/assign`.** Resolves the
  open question. Assignment sits with status in `SettingsTab.tsx` (both are
  template-level settings that gate storefront visibility), rides the same
  SaveBar, and needs no new route. A deep "assignment summary" screen can come
  later if ever needed; MVP does not split it out.
- **Scope rides the SaveBar (not immediate-persist).** The engine gains
  `scope`/`scopeValue` state + `setScope`, added to the meta-JSON snapshot
  (`{ rows, name, status, scope, scopeValue }`) and the Save payload — the exact
  pattern `status` follows (feature 36). One Save persists rows, name, status, and
  scope together; Discard reverts the picker with everything else. Rejected:
  immediate-persist on pick (inconsistent with status; an immediate write on an
  ACTIVE template would need a synchronous gate + UI rollback on block).
- **Gate evaluates the PENDING scope; scope editable in any status.** Generalize
  `evaluateActivationConflicts(admin, shopId, templateId, candidateScope?)` to
  take an optional candidate scope (default: the persisted rule, preserving
  feature 42's callers). The editor Save passes the **pending** scope, so the gate
  runs **before** any write — no persist-then-rollback. Rejected: DRAFT-only scope
  editing (forcing a merchant to deactivate to re-scope pulls the live table off
  the storefront and is clunky). The gate runs on Save when the post-save template
  **will be ACTIVE** AND (**wasn't ACTIVE** OR **the scope changed**); a scope-less
  or unchanged-scope save of a DRAFT never gates.
- **Atomic block still holds.** A blocked Save writes NOTHING (no rows, name,
  status, scope, metaobject, or routing) — the editor keeps its unsaved edits and
  shows the conflict banner. Same guarantee as feature 42, now covering the scope.
- **Rebuild routing on ACTIVE-set membership OR content change.** `shouldRebuildRouting`
  (status-only) is insufficient for a scope edit that keeps the template ACTIVE.
  Rebuild when `wasActive !== willBeActive` OR (`willBeActive && scopeChanged`).
  Keep the pure decision testable.
- **Rich conflict banner, driven by the Save response.** The block is discovered
  server-side on Save (feature 42's model), so the banner renders from
  `fetcher.data.conflicts` (`{ templateId?, templateName?, reason }[]`): "Can't
  activate — this template's scope overlaps **{name}**" with a link to each
  colliding template and the three resolutions (narrow the scope / clear it / set
  the other to Draft). Persistent (not a toast) until the merchant resolves it or
  changes the pending state. A live pre-check as the merchant picks is **optional**
  (below) — the save-time block is the correctness gate.
- **Single value per scope (matches the one-INCLUDE-rule model).** PRODUCT and
  COLLECTION pick exactly one resource (one GID); PRODUCT_TYPE/VENDOR one string;
  ALL_PRODUCTS none; "None" clears the rule. Multi-select ("selected products",
  plural) needs several INCLUDE rules per template — deferred (feature 45 territory,
  requires relaxing feature 37's "exactly one INCLUDE rule").
- **Resource labels resolved for display.** The picker returns GID + title; keep
  the title in engine state for immediate display. For an existing PRODUCT/COLLECTION
  scope loaded from the DB (GID only), resolve the title in the editor loader via a
  small Admin query (batched with the existing load) so the picker shows a readable
  chip, not a raw GID. A resolution miss degrades to the GID (never blank).
- **Client-safe scope options live with the model.** Add a `SCOPE_OPTIONS`
  (value+label, picker order) to `app/utils/assignmentScope.ts` next to
  `ASSIGNMENT_SCOPES` (mirrors `TEMPLATE_STATUS_OPTIONS`), so the picker and any
  server copy share one source of truth. Include a client mirror of `validateScope`
  driving the inline error + Save-disable (the server re-validates — this is UX).

## What already exists (so we don't rebuild it)

- `getAssignmentForTemplate` / `setTemplateScope` / `clearTemplateScope` (37) —
  shop-scoped rule read + create-or-replace + clear; `validateScope` +
  `ASSIGNMENT_SCOPES` (client-safe).
- `evaluateActivationConflicts` / `shouldRebuildRouting` / `activationBlockedMessage`
  (42) — the gate + transition test + toast folder, wired into both status
  surfaces; returns `{ ok:false, conflicts }` on block.
- `rebuildShopRouting` (41) — idempotent full rebuild from the ACTIVE set.
- The editor Save action (`app.templates_.$id/route.tsx`) already runs the gate on
  DRAFT→ACTIVE and returns `{ ok:false, blocked, conflicts, error }`; `useRowEngine`
  already threads `status`/`setStatus` through the dirty snapshot + payload +
  save-settle toast — the scope is a parallel field.
- App Bridge `shopify.resourcePicker({ type, multiple:false })` (via `useAppBridge`)
  for the product/collection GID pickers.
- `SettingsTab.tsx` — the panel to extend; renders inside the editor's inert freeze
  (no separate `saving` guard needed).

## Correctness invariants (must hold)

- **Disjoint ACTIVE set (still the whole point).** No scope edit or activation may
  leave two ACTIVE templates overlapping — enforced pre-write against the PENDING
  scope on Save; the candidate is excluded from its own comparison set (42).
- **Atomic block.** A blocked Save persists nothing (rows, name, status, scope,
  metaobject, routing all untouched).
- **Fail closed.** An unverifiable probe (39 throws) blocks — unchanged (42).
- **Shop isolation (priority #1).** The scope write, the gate reads, and the
  resource-label/`productTypes` queries are all shop-scoped / session-bound; the
  picker returns this shop's resources only.
- **Rebuild is idempotent + full.** Always derived from the current ACTIVE set;
  running it on every membership/content change converges (41).
- **Scope value invariant (§5).** `ALL_PRODUCTS` ⇒ null value; every other scope ⇒
  non-empty; PRODUCT/COLLECTION ⇒ a `gid://shopify/...` — enforced by `validateScope`
  server-side (the client mirror is UX only).
- **No storefront surprise.** A scope-less ACTIVE template renders nowhere (empty
  routing contribution) — surfaced to the merchant, never a silent no-op.

## Steps (each independently verifiable)

### Step 1 — Scope options + engine state

- Add `SCOPE_OPTIONS` (value+label, picker order) + a client mirror of
  `validateScope`'s value-required rule to `app/utils/assignmentScope.ts`.
- Extend `useRowEngine`: `scope`/`scopeValue` state + `setScope`, seeded from new
  `initialScope`/`initialScopeValue` args; add both to the meta-JSON snapshot and
  the Save payload (parallel to `status`). Update the save-settle handler to read
  the block/conflicts shape.
- **Test:** the meta snapshot includes scope (a scope change flips `isDirty`); the
  payload carries `scope`/`scopeValue`. (Pure engine bits unit-testable; UI is
  browser-verified per the testing strategy.)

### Step 2 — Loader: current scope + resource label

- Editor loader returns `{ template, assignment }` where `assignment` is
  `getAssignmentForTemplate` (or null); for a PRODUCT/COLLECTION scope, resolve the
  resource **title** via a small Admin query (batched) so the picker shows a chip.
  Seed the engine from it in `route.tsx`.
- **Test:** loader returns the persisted scope; a null assignment seeds "None".

### Step 3 — Scope picker UI (`SettingsTab.tsx`)

- Below status: a scope-kind `<s-select>` (`SCOPE_OPTIONS`) + conditional value
  control — product/collection App Bridge picker (button → `resourcePicker` → chip
  with title + change/clear), text field for type/vendor, nothing for none/all.
  Client-mirror `validateScope` for the inline error + Save-disable. Show the
  scope-less-ACTIVE warning text.
- **Verify:** browser — picking each scope kind opens the SaveBar; the picker chip
  shows the resource title; an incomplete scope disables Save.

### Step 4 — Save action: persist scope + generalized gate + rebuild

- Generalize `evaluateActivationConflicts` to accept an optional `candidateScope`
  (default: persisted). In the editor Save action: compute pending scope/status,
  `wasActive`, `scopeChanged`; run the gate with the pending scope when
  `willBeActive && (!wasActive || scopeChanged)` → atomic block on conflict.
  On pass: `setTemplateScope`/`clearTemplateScope`, `saveTemplateForShop`,
  metaobject sync, then `rebuildShopRouting` when `wasActive !== willBeActive ||
  (willBeActive && scopeChanged)`. Wire the same generalized gate into the create
  path (`params.id === "new"`) so create-as-ACTIVE-with-scope is covered (42 left
  it a no-op; now reachable).
- **Test:** the gate uses the pending (not persisted) scope; the rebuild fires on
  an ACTIVE scope edit with unchanged status; a blocked save writes nothing
  (mocked deps). Extend `assignmentActivation.server.test.ts` for the
  candidate-scope override + the generalized rebuild trigger.

### Step 5 — Rich conflict banner

- In `SettingsTab.tsx` (or the editor body), render a persistent `s-banner`
  (tone="critical") from `saveFetcher.data.conflicts` on a block: name each
  colliding template with a link (`/app/templates/{templateId}`) + the three
  resolutions. Clear it when the pending state changes or a save succeeds. Keep
  `activationBlockedMessage` as the toast fallback.
- **Verify:** browser — activating a conflicting scope shows the banner (not just a
  toast); resolving (narrow/clear/other-to-draft) + Save clears it and activates.

### Step 6 — Manual verification (dev store) + close 42/43's deferred passes

- Set two overlapping scopes on two templates via the UI; activate the first
  (gate passes, routing rebuilds, storefront lights up on matching products —
  closes **feature 43's** merchant-driven routing verification). Activate the
  second → **blocked** with the rich banner naming the first (closes **feature
  42's** block verification). Resolve → activates. Edit an ACTIVE template's scope
  → re-gated + routing rebuilt + storefront updates. Confirm `ShopStorefrontRouting`
  + the `$app:routing` metafield via Neon (as in 41/43).

### Step 7 — Docs

- Update `context/progress-tracker.md`: scope picker + rich conflict UI shipped;
  the assignment engine is merchant-complete; advance "Next" to feature 45 (EXCLUDE
  carve-outs + per-product overflow materialization). Resolve the "assignment
  location" and "conflict copy/resolution" open questions.

---

## Out of scope (this file)

- Multi-value scopes (several products/collections per template) — needs relaxing
  feature 37's one-INCLUDE-rule; feature 45 territory.
- EXCLUDE carve-out UI + per-product overflow materialization (45).
- The list "Assigned Products" count (broad-rule count is non-trivial).
- Any change to the pure resolvers (38/39/40), the writer (41), or the storefront
  Liquid (43) — this slice only drives them from the UI.
- WYSIWYG storefront styling / device previews (later Reshell phases).

## Open / optional

- **Live conflict pre-check.** A debounced fetcher that runs the gate as the
  merchant picks a scope (before Save) would warn earlier, but costs Admin API
  probes per change and duplicates the save-time gate. The save-time block is the
  correctness gate; add the pre-check only if the UX demands it.
- **Type/vendor autocomplete.** A resource route fetching the shop's distinct
  product types / vendors (like the metafield-definitions route, feature 8) would
  make PRODUCT_TYPE/VENDOR a datalist instead of free text. Nice-to-have; free text
  is the baseline (the existence probe validates against the real catalog anyway).
- **Two-write atomicity.** `setTemplateScope` (ProductAssignment) and
  `saveTemplateForShop` (Template) are separate writes after the gate passes; a
  partial failure is surfaced, not transactional. Fold into one `$transaction` if
  it ever matters (both are Postgres, source of truth).
- **Scope-change while a metaobject sync is pending.** Ordering (status/scope →
  metaobject sync → rebuild) matches feature 42; no new ordering risk, but re-check
  during implementation that the rebuild always reads post-write ACTIVE scopes.
- **Create-as-ACTIVE-with-scope.** Now reachable (Step 4). A brand-new template has
  no other-template comparison surprises (it's excluded from its own set), but
  verify the create path's redirect + toast still flow when the gate blocks a new
  ACTIVE template (it should return the block instead of redirecting).
