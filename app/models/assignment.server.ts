import { AssignmentMode, AssignmentScope } from "@prisma/client";
import prisma from "../db.server";
import {
  validateScope,
  type AssignmentScopeValue,
} from "../utils/assignmentScope";
import { getTemplateByIdForShop } from "./template.server";

// Persistence for a template's assignment rules. The primary INCLUDE scope rule
// (feature 37, "one scope per template", data-model.md §9) AND its EXCLUDE
// carve-outs (feature 45 — the `mode: EXCLUDE`, `scope: PRODUCT` rows that carve
// specific products out of a broad INCLUDE rule). The two modes are written by
// SEPARATE functions that each touch ONLY their own `mode`, so a scope change never
// disturbs the carve-outs and vice versa (the `@@unique(shopId, templateId, scope,
// scopeValue, mode)` lets an INCLUDE row and an EXCLUDE row coexist per template).
// No Shopify side effects here — rules live only in Postgres while a template is
// DRAFT; projection to the storefront routing metafield happens at activation
// (feature 42), never on a bare rule write.
//
// Shop isolation (priority #1) is enforced on every path: reads/deletes are scoped
// by `shopId`, and the write paths prove template ownership via
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

/** The other-ACTIVE-template comparison row the dry-run gate (feature 42)
 *  partitions the candidate against — the template's identity (for messaging)
 *  plus its INCLUDE selector. */
export type ActiveIncludeScope = {
  templateId: string;
  templateName: string;
  scope: AssignmentScopeValue;
  scopeValue: string | null;
};

/**
 * The comparison set for the DRAFT→ACTIVE dry-run gate (feature 42): every OTHER
 * ACTIVE template in this shop that carries an INCLUDE scope, as
 * `{ templateId, templateName, scope, scopeValue }`.
 *
 * Shop isolation (priority #1): filtered `where { shopId }`, so a candidate can
 * only ever be compared against its own shop's ACTIVE rules — never another
 * shop's. `templateId: { not: excludeTemplateId }` drops the candidate itself so
 * an already-ACTIVE template being scope-edited (feature 44) can't "conflict"
 * with its own rule. Filtering on `template: { status: ACTIVE }` means a
 * scope-less ACTIVE template (no INCLUDE row) is naturally absent — it matches no
 * products, so it can't collide. One INCLUDE rule per template (feature 37), so
 * this yields at most one row per ACTIVE template.
 */
export async function getActiveIncludeScopesExcept(
  shopId: string,
  excludeTemplateId: string,
): Promise<ActiveIncludeScope[]> {
  const rows = await prisma.productAssignment.findMany({
    where: {
      shopId,
      mode: AssignmentMode.INCLUDE,
      templateId: { not: excludeTemplateId },
      template: { status: "ACTIVE" },
    },
    select: {
      templateId: true,
      scope: true,
      scopeValue: true,
      template: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    templateId: row.templateId,
    templateName: row.template.name,
    scope: row.scope as ActiveIncludeScope["scope"],
    scopeValue: row.scopeValue,
  }));
}

// --- EXCLUDE carve-outs (feature 45) ---------------------------------------
// A carve-out is a `mode: EXCLUDE`, `scope: PRODUCT` row whose `scopeValue` is the
// excluded product's GID. These carve specific products out of a broad INCLUDE
// rule (e.g. "all products EXCEPT product X"): the storefront resolver renders
// nothing for an excluded product's broad tiers, and the activation gate subtracts
// them (feature 45 Decision A). Written as a set (create-or-replace), touching ONLY
// EXCLUDE rows so the INCLUDE scope survives — the exact mirror of setTemplateScope.

/**
 * Replace a template's EXCLUDE carve-out set with `gids` (each a product GID).
 * Validates every GID via the shared `validateScope("PRODUCT", ...)` (rejecting a
 * non-GID / malformed value BEFORE any DB call), proves the template belongs to the
 * shop (priority #1 — a foreign/unknown template writes nothing), then in ONE
 * `$transaction` deletes the template's existing EXCLUDE rows and creates the new
 * set. Only `mode: EXCLUDE` rows are touched, so the INCLUDE scope is untouched.
 * Duplicate GIDs are collapsed. An empty `gids` clears the carve-outs (delete only).
 */
export async function setTemplateExcludes(
  shopId: string,
  templateId: string,
  gids: unknown,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!Array.isArray(gids)) {
    return { ok: false as const, error: "Invalid excludes" };
  }

  // Validate each GID with the shared PRODUCT validator and dedupe. A single
  // invalid GID rejects the whole write (atomic — no partial carve-out set).
  const validated: string[] = [];
  const seen = new Set<string>();
  for (const gid of gids) {
    const result = validateScope("PRODUCT", gid);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }
    // For PRODUCT, validateScope returns the trimmed GID (never null).
    const value = result.scopeValue as string;
    if (!seen.has(value)) {
      seen.add(value);
      validated.push(value);
    }
  }

  // Ownership gate (priority #1): a foreign/unknown template writes nothing.
  const template = await getTemplateByIdForShop(shopId, templateId);
  if (!template) {
    return { ok: false as const, error: "Template not found" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.productAssignment.deleteMany({
        where: { shopId, templateId, mode: AssignmentMode.EXCLUDE },
      });
      if (validated.length > 0) {
        await tx.productAssignment.createMany({
          data: validated.map((value) => ({
            shopId,
            templateId,
            scope: AssignmentScope.PRODUCT,
            scopeValue: value,
            mode: AssignmentMode.EXCLUDE,
          })),
        });
      }
    });
    return { ok: true as const, count: validated.length };
  } catch {
    return { ok: false as const, error: "Could not save excludes" };
  }
}

/**
 * The template's EXCLUDE carve-out GIDs (shop-scoped) for the editor loader. A
 * foreign/unknown template matches no row and returns `[]`. Null scopeValues are
 * defensively filtered (an EXCLUDE PRODUCT row always carries a GID).
 */
export async function getExcludesForTemplate(
  shopId: string,
  templateId: string,
): Promise<string[]> {
  const rows = await prisma.productAssignment.findMany({
    where: {
      shopId,
      templateId,
      mode: AssignmentMode.EXCLUDE,
      scope: AssignmentScope.PRODUCT,
    },
    select: { scopeValue: true },
  });
  return rows
    .map((row) => row.scopeValue)
    .filter((value): value is string => value !== null);
}

/**
 * The other ACTIVE templates' EXCLUDE carve-out GIDs, keyed by templateId, for the
 * activation gate (feature 45 Decision A — subtracting a carve-out that resolves a
 * PRODUCT-level overlap). Shop-scoped (priority #1) and excludes the candidate
 * itself. Only ACTIVE templates' carve-outs matter — a DRAFT/ARCHIVED template
 * doesn't cover any product, so its carve-outs can't resolve a live overlap.
 */
export async function getActiveExcludesByTemplate(
  shopId: string,
  excludeTemplateId: string,
): Promise<Map<string, string[]>> {
  const rows = await prisma.productAssignment.findMany({
    where: {
      shopId,
      mode: AssignmentMode.EXCLUDE,
      scope: AssignmentScope.PRODUCT,
      templateId: { not: excludeTemplateId },
      template: { status: "ACTIVE" },
    },
    select: { templateId: true, scopeValue: true },
  });

  const byTemplate = new Map<string, string[]>();
  for (const row of rows) {
    if (row.scopeValue === null) continue;
    const list = byTemplate.get(row.templateId) ?? [];
    list.push(row.scopeValue);
    byTemplate.set(row.templateId, list);
  }
  return byTemplate;
}
