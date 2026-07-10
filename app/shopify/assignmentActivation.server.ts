// Activation decision core (feature 42) — the orchestration slice that turns the
// isolated pieces from 37–41 into a live, gated activation path (data-model.md §9).
// It answers two questions the two status-change surfaces ask:
//
//   1. `shouldRebuildRouting(current, target)` — pure: does this status transition
//      change the ACTIVE set, so the shop routing map must be rebuilt+published?
//   2. `evaluateActivationConflicts(admin, shopId, templateId)` — the DRAFT→ACTIVE
//      dry-run GATE: may this template go ACTIVE, or does its scope overlap another
//      ACTIVE template's scope (block, write nothing)?
//
// This module composes `getAssignmentForTemplate` (37), `partitionOverlaps` (38),
// and `checkCrossDimensionConflicts` (39). It lives in `app/shopify/` (not
// `app/utils/`) because the gate calls the Admin API through feature 39, exactly
// like `routing.server.ts`. The pure helper (`shouldRebuildRouting`) and the
// conflict-combining are unit-tested; the surfaces do their own status write and
// call the core around it (see the route actions).
//
// FAIL CLOSED (priority #2, the live storefront): feature 39 THROWS on a Shopify
// error. This module catches that and returns a BLOCK, never a silent pass — an
// activation that cannot be PROVEN conflict-free must not reach ACTIVE and break
// the disjoint-ACTIVE-set invariant on the storefront.

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { TemplateStatus } from "@prisma/client";
import {
  getAssignmentForTemplate,
  getActiveIncludeScopesExcept,
  getActiveExcludesByTemplate,
  getExcludesForTemplate,
  type ActiveIncludeScope,
} from "../models/assignment.server";
import {
  partitionOverlaps,
  type ScopeSelector,
} from "../utils/assignmentOverlap";
import { checkCrossDimensionConflicts } from "./assignmentConflict.server";

/**
 * One reason a DRAFT→ACTIVE transition was blocked. Carries the conflicting
 * template's identity when known (a definite OVERLAP or a probe-confirmed
 * collision names it) — the fail-closed "couldn't verify" case has no specific
 * other template. `reason` is a truthful, diagnosable string; the rich
 * merchant-facing conflict UI (which dimension, resolution picker) is feature 44,
 * which will consume this same payload.
 */
export type ActivationConflict = {
  templateId?: string;
  templateName?: string;
  reason: string;
};

/**
 * Pure transition test: does changing status from `current` to `target` change
 * the shop's ACTIVE set — and therefore require a routing rebuild (feature 41)?
 *
 * True iff the status actually changes AND at least one side is ACTIVE (a
 * to-ACTIVE activation or a from-ACTIVE deactivation). A no-op (`current ===
 * target`) or a transition that never touches ACTIVE (DRAFT↔ARCHIVED) leaves the
 * ACTIVE set — and thus the routing map — untouched, so it does NOT rebuild. A
 * rows-only editor save (status unchanged) short-circuits to false here: routing
 * maps scope→handle, not rows, so the metaobject sync alone carries row edits.
 */
export function shouldRebuildRouting(
  current: TemplateStatus,
  target: TemplateStatus,
): boolean {
  return current !== target && (current === "ACTIVE" || target === "ACTIVE");
}

/**
 * The editor-Save rebuild decision (feature 44), a superset of
 * `shouldRebuildRouting` that also covers a scope edit which keeps the template
 * ACTIVE. Rebuild when the ACTIVE-set MEMBERSHIP changes (`wasActive !==
 * willBeActive`) OR when the template stays ACTIVE but its scope CONTENT changed
 * (`willBeActive && scopeChanged`) — either alters the routing map. A pure,
 * unit-testable decision; the surface owns the writes around it.
 */
export function shouldRebuildRoutingForScopeSave(
  wasActive: boolean,
  willBeActive: boolean,
  scopeChanged: boolean,
): boolean {
  return wasActive !== willBeActive || (willBeActive && scopeChanged);
}

/**
 * The DRAFT→ACTIVE dry-run gate (data-model.md §9). Called BEFORE any status
 * write; a block means the caller writes NOTHING (atomic block — no status, no
 * rows, no metaobject, no routing).
 *
 * Flow:
 *   1. The candidate scope: either the explicit `candidateScope` argument (feature
 *      44 — the PENDING scope on an editor Save, so an ACTIVE-scope-edit is gated
 *      BEFORE any write, no persist-then-rollback) or, when omitted, the persisted
 *      rule via `getAssignmentForTemplate` (feature 42's callers, unchanged). A
 *      `null` candidate ⇒ no INCLUDE scope ⇒ matches no products ⇒ `{ ok: true }`.
 *   2. `getActiveIncludeScopesExcept` → the OTHER ACTIVE templates with a scope
 *      (candidate excluded, shop-scoped — priority #1).
 *   3. `partitionOverlaps` → `{ blocking, needsCheck }` by pure set-algebra (38).
 *   4. `checkCrossDimensionConflicts` resolves `needsCheck` via Shopify existence
 *      probes (39) — in a try/catch: a THROW ⇒ a BLOCK (fail closed).
 *   5. Combine definite OVERLAPs + probe-confirmed collisions → non-empty ⇒
 *      `{ ok: false, conflicts }`, else `{ ok: true }`.
 *
 * Shop isolation (priority #1): the candidate read, the comparison read, and the
 * probe are all bound to this shop (the first two by `where { shopId }`, the probe
 * structurally by the session-bound `admin` client), so the candidate and every
 * "other" belong to the same shop.
 *
 * `candidateScope` semantics: `undefined` (arg omitted) ⇒ read the persisted rule;
 * a passed value (a `ScopeSelector` or `null`) is used verbatim — passing `null`
 * explicitly gates a to-be-scope-less activation (trivially passes).
 *
 * EXCLUDE carve-outs (feature 45 Decision A): after the pure/probe collisions are
 * found, a PRODUCT-attributable collision is SUBTRACTED when the specific product
 * is excluded on the covering side — the two decidable cases being (1) the
 * candidate is `PRODUCT: X` and the OTHER (broad) side excludes X, or (2) the OTHER
 * side is `PRODUCT: X` and the CANDIDATE (broad) side excludes X. Broad×broad
 * overlaps are never resolved (a finite exclude list can't prove them disjoint, and
 * the probe returns existence, not which product). `candidateExcludes` mirrors
 * `candidateScope`: `undefined` ⇒ read the persisted carve-outs; a passed array
 * (incl. `[]`) is used verbatim (the editor Save's PENDING carve-outs).
 */
export async function evaluateActivationConflicts(
  admin: AdminApiContext,
  shopId: string,
  templateId: string,
  candidateScope?: ScopeSelector | null,
  candidateExcludes?: string[],
): Promise<{ ok: true } | { ok: false; conflicts: ActivationConflict[] }> {
  // 1. The candidate scope — the PENDING scope (feature 44) when provided, else the
  //    persisted rule (feature 42). No scope ⇒ nothing to overlap → passes.
  const candidate =
    candidateScope === undefined
      ? await getAssignmentForTemplate(shopId, templateId)
      : candidateScope;
  if (!candidate) {
    return { ok: true };
  }

  // 2. The other ACTIVE templates that carry a scope (candidate excluded).
  const others = await getActiveIncludeScopesExcept(shopId, templateId);
  if (others.length === 0) {
    return { ok: true };
  }

  // 3. Pure set-algebra split: definite overlaps vs. pairs needing a probe.
  const candidateSelector: ScopeSelector = {
    scope: candidate.scope,
    scopeValue: candidate.scopeValue,
  };
  const { blocking, needsCheck } = partitionOverlaps<ActiveIncludeScope>(
    candidateSelector,
    others,
  );

  // 4. Resolve the undecidable pairs against Shopify — fail closed on any error.
  let confirmed: { other: ActiveIncludeScope; reason: string }[];
  try {
    confirmed = await checkCrossDimensionConflicts(admin, needsCheck);
  } catch {
    // An unverifiable probe must NOT let the template go ACTIVE (priority #2).
    return {
      ok: false,
      conflicts: [
        {
          reason:
            "Couldn't verify this template's assignment against your other " +
            "active templates. Please try again.",
        },
      ],
    };
  }

  // 5. Combine definite overlaps + probe-confirmed collisions into the set of
  //    other ACTIVE templates the candidate collides with.
  const collidingOthers: ActiveIncludeScope[] = [
    ...blocking,
    ...confirmed.map(({ other }) => other),
  ];
  if (collidingOthers.length === 0) {
    return { ok: true };
  }

  // 6. Subtract EXCLUDE carve-outs (Decision A). Read both sides' carve-outs only
  //    now that a real collision exists to potentially resolve. The candidate's
  //    carve-outs are the PENDING set when supplied (editor Save), else the
  //    persisted set (feature 42 callers). The others' carve-outs are read per
  //    ACTIVE template so a collision with `other` is judged against `other`'s set.
  const othersExcludes = await getActiveExcludesByTemplate(shopId, templateId);
  const candidateExcludeSet = new Set(
    candidateExcludes === undefined
      ? await getExcludesForTemplate(shopId, templateId)
      : candidateExcludes,
  );

  const remaining = collidingOthers.filter((other) => {
    // Case 1: candidate is PRODUCT:X and the OTHER (covering) side excludes X.
    if (
      candidate.scope === "PRODUCT" &&
      candidate.scopeValue &&
      (othersExcludes.get(other.templateId) ?? []).includes(
        candidate.scopeValue,
      )
    ) {
      return false; // carve-out resolves this overlap
    }
    // Case 2: the OTHER side is PRODUCT:X and the CANDIDATE (covering) excludes X.
    if (
      other.scope === "PRODUCT" &&
      other.scopeValue &&
      candidateExcludeSet.has(other.scopeValue)
    ) {
      return false; // carve-out resolves this overlap
    }
    return true; // a broad×broad (or un-excluded) overlap still blocks
  });

  const conflicts: ActivationConflict[] = remaining.map((other) => ({
    templateId: other.templateId,
    templateName: other.templateName,
    reason: `Its assignment overlaps the active template “${other.templateName}”.`,
  }));

  return conflicts.length > 0 ? { ok: false, conflicts } : { ok: true };
}

/**
 * Fold a blocked gate's `conflicts` into one concise, merchant-facing error
 * string for the surfaces' existing error toasts. The rich per-conflict UI is
 * feature 44; this slice only needs the block to be visible and truthful.
 */
export function activationBlockedMessage(
  conflicts: ActivationConflict[],
): string {
  const named = conflicts
    .map((c) => c.templateName)
    .filter((name): name is string => Boolean(name));

  if (named.length === 0) {
    // Fail-closed case (or an unnamed overlap): no specific other template.
    return (
      conflicts[0]?.reason ??
      "This template can't be activated because of an assignment conflict."
    );
  }

  const unique = Array.from(new Set(named));
  const list =
    unique.length === 1
      ? `“${unique[0]}”`
      : unique.map((n) => `“${n}”`).join(", ");
  return `Can't activate: its assignment overlaps the active template ${list}. Narrow the scope or set it back to draft.`;
}
