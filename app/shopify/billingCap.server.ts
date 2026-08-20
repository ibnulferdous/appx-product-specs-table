// Assigned-product cap enforcement for Shopify App Pricing (billing blocker #2, slice 2).
//
// Each plan caps the products a shop may assign to ACTIVE templates (Free 25 / Go 250 /
// Plus 1,000 / Max unlimited — `app/utils/billingPlans.ts`). Shopify does NOT enforce this; the
// app does, at assignment SAVE time. This module answers one question for the assignment action:
// "would this save push the shop's ACTIVE assigned-product total past the active plan's cap?"
//
// COUNTING MODEL (data-model.md §11.2): the shop total is the SUM, over ACTIVE templates, of each
// template's assigned-product count from `resolveAssignedProductCounts` (feature 48). A product in
// two templates counts twice — the same number the templates list shows the merchant. The gate
// runs only when the edited template will be ACTIVE and its membership changed (mirrors the
// activation-conflict gate), so DRAFT scope edits are never capped.
//
// FAIL BIAS (data-model.md §11.2): block ONLY on a DETERMINED overage. If the plan is undetermined
// (billing query failed) or any needed count is UNKNOWN (Admin API failure), the gate returns
// `determined: false` and the caller does NOT block — a transient outage must never wedge a
// merchant out of saving. Unlimited (Max, null cap) short-circuits with zero Admin work. And a
// change that keeps the total the same or reduces it is never blocked, so a merchant who downgrades
// while over-cap keeps existing assignments and can still prune them.

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import type { AssignmentScopeValue } from "../utils/assignmentScope";
import type { ScopeSelector } from "../utils/assignmentOverlap";
import { planCap, type Plan } from "../utils/billingPlans";
import { getBillingState } from "./billing.server";
import {
  buildAssignedCountQuery,
  parseAssignedCountResponse,
  resolveAssignedProductCounts,
} from "./assignedProductCounts.server";

// --- Types ------------------------------------------------------------------

/** The inputs the pure gate needs. A `null` count means "unknown" (Admin failure). */
export type CapProjectionInput = {
  /** The active plan's cap; `null` = unlimited (Max). */
  cap: number | null;
  /** Sum of assigned counts over OTHER currently-ACTIVE templates; `null` if any is unknown. */
  otherActiveTotal: number | null;
  /** The edited template's assigned count under the PROPOSED scope; `null` if unknown. */
  proposedEditedCount: number | null;
  /** The edited template's assigned count under its STORED scope; `null` if unknown. */
  storedEditedCount: number | null;
  /** Whether the edited template is ALREADY active (its stored count already in the total). */
  wasActive: boolean;
};

export type CapGate =
  | { determined: false }
  | { determined: true; blocked: false }
  | { determined: true; blocked: true; cap: number; projectedTotal: number };

// --- Pure: the gate ---------------------------------------------------------

/**
 * Decide whether a save would exceed the plan cap. Blocks only on a DETERMINED overage that the
 * change INCREASES into — never on unknown counts, never on a same-or-smaller total. Pure.
 */
export function evaluateCapGate(input: CapProjectionInput): CapGate {
  // Unlimited plan — nothing to enforce, and the caller can skip all Admin work.
  if (input.cap === null) return { determined: true, blocked: false };

  // Any unknown input for the projected side makes the outcome undeterminable → fail open.
  if (input.otherActiveTotal === null || input.proposedEditedCount === null) {
    return { determined: false };
  }
  const projectedTotal = input.otherActiveTotal + input.proposedEditedCount;

  // The total BEFORE this save: the edited template contributed its stored count only if it was
  // already active. If that prior contribution is unknown, we can't prove the change is an increase.
  const previousContribution = input.wasActive ? input.storedEditedCount : 0;
  if (previousContribution === null) return { determined: false };
  const previousTotal = input.otherActiveTotal + previousContribution;

  const isIncrease = projectedTotal > previousTotal;
  if (projectedTotal > input.cap && isIncrease) {
    return { determined: true, blocked: true, cap: input.cap, projectedTotal };
  }
  return { determined: true, blocked: false };
}

/** The merchant-facing block message. Names the plan + cap and points to the upgrade path. */
export function capBlockedMessage(
  plan: Plan | null,
  cap: number,
  projectedTotal: number,
): string {
  const planName = plan ? plan.name : "current";
  return (
    `Your ${planName} plan covers ${cap} assigned products, and this change would bring you to ` +
    `${projectedTotal}. Upgrade your plan from Manage plan to assign more.`
  );
}

// --- Pure: proposed-scope shape --------------------------------------------

/** The scope KIND a pending selector set represents (INCLUDE rows are homogeneous, feature 46). */
export function scopeOfSelectors(
  selectors: ScopeSelector[],
): AssignmentScopeValue | null {
  return selectors.length === 0 ? null : selectors[0].scope;
}

/** Distinct INCLUDE values in a selector set (PRODUCT/COLLECTION GIDs). */
function distinctIncludeValues(selectors: ScopeSelector[]): number {
  const seen = new Set<string>();
  for (const s of selectors) {
    if (s.scopeValue !== null) seen.add(s.scopeValue);
  }
  return seen.size;
}

// --- Live: proposed-count resolution ---------------------------------------

/**
 * The number of products the PROPOSED scope resolves to, or `null` when it can't be determined
 * live. NONE → 0; PRODUCT → distinct selected products; ALL_PRODUCTS → shop product total minus
 * carve-outs (one Admin lookup, `null` if that fails). Broad legacy kinds (COLLECTION / PRODUCT_TYPE
 * / VENDOR) aren't pickable in the MVP editor, so a proposed scope of those returns `null` (fail
 * open) rather than growing this module — stored data of those kinds is still counted for OTHER
 * templates by `resolveAssignedProductCounts`.
 */
export async function resolveProposedScopeCount(
  admin: AdminApiContext,
  selectors: ScopeSelector[],
  excludeCount: number,
): Promise<number | null> {
  const scope = scopeOfSelectors(selectors);
  if (scope === null) return 0;
  if (scope === "PRODUCT") return distinctIncludeValues(selectors);
  if (scope === "ALL_PRODUCTS") {
    const shopTotal = await fetchShopProductTotal(admin);
    if (shopTotal === null) return null;
    return Math.max(0, shopTotal - excludeCount);
  }
  // COLLECTION / PRODUCT_TYPE / VENDOR — not producible by the MVP picker.
  return null;
}

/** The shop's live product total (for a proposed ALL_PRODUCTS scope), or null on failure. Reuses
 *  the assigned-count query builder/narrower so escaping + fail-soft behave identically. */
async function fetchShopProductTotal(
  admin: AdminApiContext,
): Promise<number | null> {
  const built = buildAssignedCountQuery({
    needShopTotal: true,
    collectionGids: [],
    productTypes: [],
    vendors: [],
  });
  if (!built) return null;
  try {
    const response = await admin.graphql(built.query, {
      variables: built.variables,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json: unknown = await response.json();
    if (
      typeof json === "object" &&
      json !== null &&
      Array.isArray((json as { errors?: unknown }).errors) &&
      (json as { errors: unknown[] }).errors.length > 0
    ) {
      throw new Error("GraphQL errors");
    }
    return parseAssignedCountResponse(json, built.aliases).shopTotal;
  } catch (error) {
    console.error("[billingCap] shop product total lookup failed", error);
    return null;
  }
}

// --- Live orchestrator ------------------------------------------------------

/**
 * Evaluate the assigned-product cap for a pending assignment save. The caller (the assignment
 * action) invokes this only when the post-save template will be ACTIVE and its membership changed,
 * and must NOT block unless the result is `{ determined: true, blocked: true }`.
 *
 * Shop isolation (priority #1): both reads are `where { shopId }` and the admin client is
 * session-bound.
 */
export async function evaluateAssignmentCap(params: {
  admin: AdminApiContext;
  shopId: string;
  templateId: string;
  pendingSelectors: ScopeSelector[];
  pendingExcludeCount: number;
  wasActive: boolean;
}): Promise<CapGate & { plan?: Plan | null }> {
  const { admin, shopId, templateId, pendingSelectors, pendingExcludeCount } =
    params;

  // 1) Active plan. An undetermined billing state fails OPEN — never block a save on a billing
  //    outage. A determined-but-unknown plan resolves to the Free cap via planCap (never unlimited).
  const billing = await getBillingState(admin);
  if (!billing.determined) return { determined: false };
  const cap = planCap(billing.plan);
  if (cap === null) return { determined: true, blocked: false }; // unlimited — no Admin work

  // 2) Proposed count for the edited template + the current per-template counts (feature 48) and
  //    the set of ACTIVE template ids, in parallel.
  const [proposedEditedCount, currentCounts, activeTemplates] =
    await Promise.all([
      resolveProposedScopeCount(admin, pendingSelectors, pendingExcludeCount),
      resolveAssignedProductCounts(admin, shopId),
      prisma.template.findMany({
        where: { shopId, status: "ACTIVE" },
        select: { id: true },
      }),
    ]);

  // 3) Sum OTHER active templates' counts; an unknown count makes the total undeterminable.
  let otherActiveTotal: number | null = 0;
  for (const t of activeTemplates) {
    if (t.id === templateId) continue;
    const c = currentCounts.get(t.id);
    if (c === null) {
      otherActiveTotal = null;
      break;
    }
    otherActiveTotal += c ?? 0; // absent from the map → no rows → 0
  }

  const storedEditedCount = currentCounts.has(templateId)
    ? (currentCounts.get(templateId) ?? null)
    : 0;

  const gate = evaluateCapGate({
    cap,
    otherActiveTotal,
    proposedEditedCount,
    storedEditedCount,
    wasActive: params.wasActive,
  });
  return { ...gate, plan: billing.plan };
}
