import { AssignmentMode } from "@prisma/client";
import prisma from "../db.server";
import { validateScope } from "../utils/assignmentScope";
import { getTemplateByIdForShop } from "./template.server";

// Persistence for a template's ONE assignment scope rule (feature 37). This slice
// owns only the primary INCLUDE rule (data-model.md §9 "one scope per template");
// EXCLUDE carve-outs, per-product overrides, and any ProductAssignmentIndex
// population are deferred to feature 45. No Shopify side effects here — rules live
// only in Postgres while a template is DRAFT; projection to the storefront routing
// metafield happens at activation (feature 42), never on a bare rule write.
//
// Shop isolation (priority #1) is enforced on every path: reads/deletes are scoped
// by `shopId`, and `setTemplateScope` proves template ownership via
// `getTemplateByIdForShop` before creating a rule, so a rule can never bind to
// another shop's template.

/**
 * The template's single INCLUDE scope rule, or `null` if it has none. Read
 * shop-scoped — a foreign `templateId` (or one owned by another shop) matches no
 * row and returns `null`, never another shop's rule.
 */
export async function getAssignmentForTemplate(
  shopId: string,
  templateId: string,
) {
  return prisma.productAssignment.findFirst({
    where: { shopId, templateId, mode: AssignmentMode.INCLUDE },
  });
}

/**
 * Set (create-or-replace) a template's single INCLUDE scope. Validates the
 * `(scope, scopeValue)` pair first (`validateScope` — rejects unknown scopes, the
 * ALL_PRODUCTS-with-value / valued-scope-without-value mismatches, malformed
 * GIDs), then proves the template belongs to the shop, then replaces the rule
 * atomically.
 *
 * "Exactly one INCLUDE rule per template" is guaranteed here, not left to callers:
 * a `$transaction` deletes the template's existing INCLUDE row(s) and creates the
 * new one, so a scope change (e.g. VENDOR → PRODUCT_TYPE) can't leave a stale rule
 * behind — and because we only touch `mode: INCLUDE`, future EXCLUDE carve-outs
 * (feature 45) are left intact. The `@@unique(shopId, templateId, scope,
 * scopeValue, mode)` still backstops literal duplicates.
 */
export async function setTemplateScope(
  shopId: string,
  templateId: string,
  { scope, scopeValue }: { scope: unknown; scopeValue: unknown },
) {
  const scopeResult = validateScope(scope, scopeValue);
  if (!scopeResult.ok) {
    return { ok: false as const, error: scopeResult.error };
  }

  // Ownership gate (priority #1): a foreign/unknown template writes nothing.
  const template = await getTemplateByIdForShop(shopId, templateId);
  if (!template) {
    return { ok: false as const, error: "Template not found" };
  }

  try {
    const assignment = await prisma.$transaction(async (tx) => {
      await tx.productAssignment.deleteMany({
        where: { shopId, templateId, mode: AssignmentMode.INCLUDE },
      });
      return tx.productAssignment.create({
        data: {
          shopId,
          templateId,
          scope: scopeResult.scope,
          scopeValue: scopeResult.scopeValue,
          mode: AssignmentMode.INCLUDE,
        },
      });
    });
    return { ok: true as const, data: assignment };
  } catch {
    return { ok: false as const, error: "Could not save assignment" };
  }
}

/**
 * Remove a template's INCLUDE scope rule (it then matches nothing). Shop-scoped
 * `deleteMany` — a foreign id matches nothing and is a no-op (`count === 0`),
 * never a cross-shop delete. Leaves EXCLUDE rows untouched (feature 45). Returns
 * the affected `count` so a caller can tell a real removal from a no-op.
 */
export async function clearTemplateScope(shopId: string, templateId: string) {
  const result = await prisma.productAssignment.deleteMany({
    where: { shopId, templateId, mode: AssignmentMode.INCLUDE },
  });
  return { ok: true as const, count: result.count };
}
