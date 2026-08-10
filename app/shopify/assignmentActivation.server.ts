// Activation decision core (feature 42) — the orchestration slice that turns the isolated pieces
// from 37–41 into a live, gated activation path (data-model.md §9). It answers the two questions
// the status-change surfaces ask:
//   1. `shouldRebuildRouting(current, target)` — pure: does this transition change the ACTIVE set,
//      so the shop routing map must be rebuilt+published?
//   2. `evaluateActivationConflicts(...)` — the DRAFT→ACTIVE dry-run GATE: may this template go
//      ACTIVE, or does its scope overlap another ACTIVE template's scope (block, write nothing)?
//
// Composes `getTemplateIncludeSelectors` (46), `partitionOverlaps` (38), and
// `checkCrossDimensionConflicts` (39). Lives in `app/shopify/` (not `app/utils/`) because the gate
// calls the Admin API through feature 39. The pure helpers are unit-tested; the surfaces do their
// own status write and call the core around it.
//
// FAIL CLOSED (priority #2, the live storefront): feature 39 THROWS on a Shopify error. This module
// catches that and returns a BLOCK, never a silent pass — an activation that can't be PROVEN
// conflict-free must not reach ACTIVE and break the disjoint-ACTIVE-set invariant.

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { TemplateStatus } from "@prisma/client";
import {
  getTemplateIncludeSelectors,
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
 * One reason a DRAFT→ACTIVE transition was blocked. Carries the conflicting template's identity
 * when known; the fail-closed "couldn't verify" case has no specific other template. `reason` is a
 * truthful string; the rich merchant-facing conflict UI is feature 44, which consumes this payload.
 */
export type ActivationConflict = {
  templateId?: string;
  templateName?: string;
  reason: string;
};

/**
 * Pure transition test: does changing status from `current` to `target` change the shop's ACTIVE
 * set — and therefore require a routing rebuild (feature 41)?
 *
 * True iff the status changes AND at least one side is ACTIVE. A no-op or a DRAFT↔ARCHIVED
 * transition leaves the ACTIVE set (and the routing map) untouched. A rows-only editor save (status
 * unchanged) short-circuits to false: routing maps scope→handle, not rows, so the metaobject sync
 * alone carries row edits.
 */
export function shouldRebuildRouting(
  current: TemplateStatus,
  target: TemplateStatus,
): boolean {
  return current !== target && (current === "ACTIVE" || target === "ACTIVE");
}

/**
 * The editor-Save rebuild decision (feature 44), a superset of `shouldRebuildRouting` that also
 * covers a scope edit which keeps the template ACTIVE. Rebuild when ACTIVE-set MEMBERSHIP changes
 * (`wasActive !== willBeActive`) OR when the template stays ACTIVE but its scope CONTENT changed —
 * either alters the routing map. Pure; the surface owns the writes around it.
 */
export function shouldRebuildRoutingForScopeSave(
  wasActive: boolean,
  willBeActive: boolean,
  scopeChanged: boolean,
): boolean {
  return wasActive !== willBeActive || (willBeActive && scopeChanged);
}

/** One (candidateSelector, otherSelector-with-template) collision the gate found — the unit the
 *  EXCLUDE subtraction reasons over (feature 46). Keeps the specific candidate selector `cs` so a
 *  PRODUCT-attributable carve-out is judged against the RIGHT product, and the tagged `other` so
 *  survivors aggregate to templates. */
type CollidingPair = { cs: ScopeSelector; other: ActiveIncludeScope };

/**
 * Does an EXCLUDE carve-out resolve this specific colliding pair (Decision A, lifted to pair-scope
 * for feature 46)? Pure + exported so the gate's subtraction is unit-testable in isolation.
 *
 * Only a PRODUCT-attributable collision is resolvable — the two decidable cases:
 *  1. the candidate selector is `PRODUCT: X` and the OTHER (covering) template excludes X, or
 *  2. the OTHER selector is `PRODUCT: X` and the CANDIDATE (covering) template excludes X.
 * Every broad×broad overlap stays unresolved (a finite exclude list can't prove two broad scopes
 * disjoint; the probe returns existence, not which product).
 *
 * Soundness rests on Decision C (a covering side that excludes X never ALSO explicitly INCLUDEs X)
 * — enforced at the write boundary and the action's pending reconciliation.
 */
export function resolvedByExclude(
  pair: CollidingPair,
  candidateExcludes: Set<string>,
  othersExcludesByTemplate: Map<string, string[]>,
): boolean {
  const { cs, other } = pair;
  if (
    cs.scope === "PRODUCT" &&
    cs.scopeValue &&
    (othersExcludesByTemplate.get(other.templateId) ?? []).includes(
      cs.scopeValue,
    )
  ) {
    return true; // Decision A case 1
  }
  if (
    other.scope === "PRODUCT" &&
    other.scopeValue &&
    candidateExcludes.has(other.scopeValue)
  ) {
    return true; // Decision A case 2
  }
  return false;
}

/**
 * The DRAFT→ACTIVE dry-run gate (data-model.md §9), generalized to MULTI-VALUE candidates (feature
 * 46). Called BEFORE any status write; a block means the caller writes NOTHING (atomic).
 *
 * The candidate is a SET of INCLUDE selectors. Two templates collide iff ANY (candidateSelector,
 * otherSelector) pair overlaps; the gate reasons PER PAIR, subtracts EXCLUDE carve-outs per pair,
 * then dedupes survivors to distinct templates LAST (subtract before dedupe — a multi-value OTHER
 * template partially covered by the candidate's excludes must still block via its un-excluded
 * members).
 *
 * Flow:
 *   1. Candidate selectors: explicit `candidateScopes` (the PENDING set on a Save) or the persisted
 *      set. Empty ⇒ no scope ⇒ `{ ok: true }`.
 *   2. `getActiveIncludeScopesExcept` → OTHER ACTIVE templates' INCLUDE rows (candidate excluded,
 *      shop-scoped — priority #1).
 *   3. Per candidate selector: `partitionOverlaps` (38) → definite overlaps + needs-check pairs;
 *      `checkCrossDimensionConflicts` (39) resolves needs-check via Shopify probes in a try/catch —
 *      a THROW in ANY iteration ⇒ BLOCK (fail closed, priority #2).
 *   4. Subtract EXCLUDE carve-outs per pair (`resolvedByExclude`), then dedupe survivors by
 *      `templateId` → conflicts.
 *
 * `candidateScopes` / `candidateExcludes`: `undefined` ⇒ read the persisted set; a passed array
 * (incl. []) is used verbatim.
 */
export async function evaluateActivationConflicts(
  admin: AdminApiContext,
  shopId: string,
  templateId: string,
  candidateScopes?: ScopeSelector[],
  candidateExcludes?: string[],
): Promise<{ ok: true } | { ok: false; conflicts: ActivationConflict[] }> {
  // 1. The candidate selector SET — the PENDING set when provided, else persisted. Empty ⇒ passes.
  const candidateSelectors =
    candidateScopes === undefined
      ? await getTemplateIncludeSelectors(shopId, templateId)
      : candidateScopes;
  if (candidateSelectors.length === 0) {
    return { ok: true };
  }

  // 2. The other ACTIVE templates' INCLUDE rows (candidate excluded), one tagged row per value.
  const others = await getActiveIncludeScopesExcept(shopId, templateId);
  if (others.length === 0) {
    return { ok: true };
  }

  // 3. Per candidate selector: pure set-algebra split, then resolve needs-check pairs against
  //    Shopify. Fail closed on ANY probe error, in ANY iteration.
  const collidingPairs: CollidingPair[] = [];
  for (const cs of candidateSelectors) {
    const { blocking, needsCheck } = partitionOverlaps<ActiveIncludeScope>(
      cs,
      others,
    );
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
    for (const other of blocking) collidingPairs.push({ cs, other });
    for (const { other } of confirmed) collidingPairs.push({ cs, other });
  }

  if (collidingPairs.length === 0) {
    return { ok: true };
  }

  // 4. Subtract EXCLUDE carve-outs PER PAIR (Decision A), then dedupe survivors to distinct
  //    templates LAST. Read both sides' carve-outs only now that a real collision exists. The
  //    candidate's are the PENDING set when supplied, else persisted; the others' are read per
  //    ACTIVE template.
  const othersExcludes = await getActiveExcludesByTemplate(shopId, templateId);
  // Decision C (defense in depth): a product the candidate itself INCLUDEs cannot be a carve-out
  // that resolves a collision — `byProduct` beats the exclude gate on the storefront (Decision B),
  // so the candidate still covers it. Strip any such contradiction before the subtraction. (The
  // editor action reconciles the PENDING set upstream too; this keeps the gate sound for any direct
  // caller. The OTHER side stays clean by the `setTemplateScope` write invariant.)
  const candidateIncludedProducts = new Set(
    candidateSelectors
      .filter((s) => s.scope === "PRODUCT" && s.scopeValue)
      .map((s) => s.scopeValue as string),
  );
  const rawCandidateExcludes =
    candidateExcludes === undefined
      ? await getExcludesForTemplate(shopId, templateId)
      : candidateExcludes;
  const candidateExcludeSet = new Set(
    rawCandidateExcludes.filter((gid) => !candidateIncludedProducts.has(gid)),
  );

  const seenTemplateIds = new Set<string>();
  const conflicts: ActivationConflict[] = [];
  for (const pair of collidingPairs) {
    if (resolvedByExclude(pair, candidateExcludeSet, othersExcludes)) continue;
    const { templateId: otherId, templateName } = pair.other;
    if (seenTemplateIds.has(otherId)) continue; // dedupe by template (last step)
    seenTemplateIds.add(otherId);
    conflicts.push({
      templateId: otherId,
      templateName,
      reason: `Its assignment overlaps the active template “${templateName}”.`,
    });
  }

  return conflicts.length > 0 ? { ok: false, conflicts } : { ok: true };
}

/**
 * Fold a blocked gate's `conflicts` into one concise, merchant-facing error string for the
 * surfaces' error toasts. The rich per-conflict UI is feature 44; this slice only needs the block
 * visible and truthful.
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
