import { AssignmentMode, AssignmentScope } from "@prisma/client";
import prisma from "../db.server";
import {
  validateScope,
  type AssignmentScopeValue,
} from "../utils/assignmentScope";
import type { ScopeSelector } from "../utils/assignmentOverlap";
import { getTemplateByIdForShop } from "./template.server";

// Scope kinds that may carry MORE THAN ONE value on one template (feature 46): "selected
// products" / "selected collections". Every other kind is single-valued per template.
// ⚠️ DIFFERENT predicate from assignmentOverlap.ts's private `SINGLE_VALUED` ({PRODUCT,
// PRODUCT_TYPE, VENDOR} — "single-valued PER PRODUCT", which drives the DISJOINT set-algebra).
// They answer different questions and disagree on PRODUCT/ALL_PRODUCTS; do NOT conflate them.
const MULTI_VALUE_SCOPES: ReadonlySet<AssignmentScopeValue> = new Set([
  "PRODUCT",
  "COLLECTION",
]);

// Persistence for a template's assignment rules: the primary INCLUDE scope rule (feature 37,
// "one scope per template", data-model.md §9) AND its EXCLUDE carve-outs (feature 45). The two
// modes are written by SEPARATE functions that each touch ONLY their own `mode`, so a scope
// change never disturbs the carve-outs and vice versa (the @@unique lets an INCLUDE row and an
// EXCLUDE row coexist per template). No Shopify side effects — rules live only in Postgres while
// DRAFT; projection to the routing metafield happens at activation (feature 42).
//
// Shop isolation (priority #1) on every path: reads/deletes are scoped by `shopId`, and the write
// paths prove template ownership via `getTemplateByIdForShop` before creating a rule.

/**
 * The template's single INCLUDE scope rule, or null. Read shop-scoped — a foreign templateId
 * matches no row and returns null, never another shop's rule.
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
 * All of a template's INCLUDE rows as scope selectors (feature 46) — [] when none. INCLUDE-only
 * and shop-scoped, so EXCLUDE carve-out rows (feature 45) are never returned as candidates. Feeds
 * the activation gate's candidate set and the editor's scope-change diff. A template may hold 1..N
 * PRODUCT/COLLECTION rows, so this returns the whole set (unlike single-row getAssignmentForTemplate).
 */
export async function getTemplateIncludeSelectors(
  shopId: string,
  templateId: string,
): Promise<ScopeSelector[]> {
  const rows = await prisma.productAssignment.findMany({
    where: { shopId, templateId, mode: AssignmentMode.INCLUDE },
    select: { scope: true, scopeValue: true },
  });
  return rows.map((row) => ({
    scope: row.scope as AssignmentScopeValue,
    scopeValue: row.scopeValue,
  }));
}

/**
 * Set (create-or-replace) a template's INCLUDE scope from a homogeneous SET of selectors (feature
 * 46). A template's INCLUDE rows all share one scope KIND: exactly one row for ALL_PRODUCTS /
 * PRODUCT_TYPE / VENDOR, or 1..N rows for PRODUCT / COLLECTION (MULTI_VALUE_SCOPES). Validates every
 * pair (`validateScope`) BEFORE any DB call, enforces kind homogeneity + arity, dedupes by value,
 * proves shop ownership, then replaces the whole INCLUDE set atomically.
 *
 * "One scope kind per template" is guaranteed here: a `$transaction` deletes the existing INCLUDE
 * row(s) and creates the new set. Only INCLUDE rows are replaced — EXCLUDE carve-outs survive —
 * EXCEPT the Decision-C cleanup: any `EXCLUDE PRODUCT` row whose GID is now in the new INCLUDE
 * PRODUCT set is deleted in the same transaction. A template that both INCLUDEs and EXCLUDEs the
 * same product is self-contradictory (byProduct beats the exclude gate on the storefront, Decision
 * B) AND, left in place, would fool the activation gate's exclude-subtraction (Decision C).
 * Invariant: a template's INCLUDE PRODUCT set and EXCLUDE PRODUCT set are disjoint.
 *
 * An empty set is rejected — callers CLEAR via `clearTemplateScope`, not [] here.
 */
export async function setTemplateScope(
  shopId: string,
  templateId: string,
  selectors: ScopeSelector[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    return {
      ok: false as const,
      error: "Assignment requires at least one value",
    };
  }

  // Validate every pair first — a single invalid selector rejects the whole write, before any DB
  // call. validateScope trims + normalizes each value.
  const validated: {
    scope: AssignmentScopeValue;
    scopeValue: string | null;
  }[] = [];
  for (const selector of selectors) {
    // Untrusted input (the Array.isArray guard above proves it): a null/non-object element would
    // throw a TypeError on the .scope read below, and that throw is OUTSIDE the caller's try — a
    // client posting `[null]` would get a 500 instead of a clean validation rejection.
    if (selector === null || typeof selector !== "object") {
      return { ok: false as const, error: "Invalid scope" };
    }
    const result = validateScope(selector.scope, selector.scopeValue);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }
    validated.push({ scope: result.scope, scopeValue: result.scopeValue });
  }

  // Homogeneity: all INCLUDE rows of a template share ONE scope kind.
  const kind = validated[0].scope;
  if (validated.some((v) => v.scope !== kind)) {
    return {
      ok: false as const,
      error: "Assignment values must share one scope",
    };
  }

  // Arity: only PRODUCT / COLLECTION may carry more than one value (MULTI_VALUE_SCOPES — NOT
  // assignmentOverlap's per-product SINGLE_VALUED).
  if (!MULTI_VALUE_SCOPES.has(kind) && validated.length > 1) {
    return { ok: false as const, error: "This scope takes a single value" };
  }

  // Dedupe by value (ALL_PRODUCTS's null collapses to one; arity already caps it).
  const seen = new Set<string | null>();
  const rows = validated.filter((v) => {
    if (seen.has(v.scopeValue)) return false;
    seen.add(v.scopeValue);
    return true;
  });

  // Ownership gate (priority #1): a foreign/unknown template writes nothing.
  const template = await getTemplateByIdForShop(shopId, templateId);
  if (!template) {
    return { ok: false as const, error: "Template not found" };
  }

  // The new INCLUDE set's PRODUCT GIDs — drive the Decision-C EXCLUDE cleanup below (only a PRODUCT
  // INCLUDE can collide with a PRODUCT-scoped EXCLUDE carve-out).
  const includedProductGids =
    kind === "PRODUCT"
      ? rows.map((r) => r.scopeValue).filter((v): v is string => v !== null)
      : [];

  try {
    await prisma.$transaction(async (tx) => {
      await tx.productAssignment.deleteMany({
        where: { shopId, templateId, mode: AssignmentMode.INCLUDE },
      });
      // Decision C: a product is never both INCLUDE'd and EXCLUDE'd on one template.
      if (includedProductGids.length > 0) {
        await tx.productAssignment.deleteMany({
          where: {
            shopId,
            templateId,
            mode: AssignmentMode.EXCLUDE,
            scope: AssignmentScope.PRODUCT,
            scopeValue: { in: includedProductGids },
          },
        });
      }
      await tx.productAssignment.createMany({
        data: rows.map((r) => ({
          shopId,
          templateId,
          scope: r.scope,
          scopeValue: r.scopeValue,
          mode: AssignmentMode.INCLUDE,
        })),
      });
    });
    return { ok: true as const, count: rows.length };
  } catch {
    return { ok: false as const, error: "Could not save assignment" };
  }
}

/**
 * Remove a template's INCLUDE scope rule (it then matches nothing). Shop-scoped `deleteMany` — a
 * foreign id is a no-op (`count === 0`), never a cross-shop delete. Leaves EXCLUDE rows untouched
 * (feature 45). Returns `count` so a caller can tell a real removal from a no-op.
 */
export async function clearTemplateScope(shopId: string, templateId: string) {
  const result = await prisma.productAssignment.deleteMany({
    where: { shopId, templateId, mode: AssignmentMode.INCLUDE },
  });
  return { ok: true as const, count: result.count };
}

/** The other-ACTIVE-template comparison row the dry-run gate (feature 42) partitions the candidate
 *  against — the template's identity (for messaging) plus its INCLUDE selector. */
export type ActiveIncludeScope = {
  templateId: string;
  templateName: string;
  scope: AssignmentScopeValue;
  scopeValue: string | null;
};

/**
 * The comparison set for the DRAFT→ACTIVE dry-run gate (feature 42): every OTHER ACTIVE template in
 * this shop that carries an INCLUDE scope.
 *
 * Shop isolation (priority #1): filtered `where { shopId }`. `templateId: { not: excludeTemplateId }`
 * drops the candidate itself so an already-ACTIVE template being scope-edited can't "conflict" with
 * its own rule. `template: { status: ACTIVE }` means a scope-less ACTIVE template (no INCLUDE row) is
 * naturally absent — it matches no products, so it can't collide. One INCLUDE rule per template, so
 * at most one row per ACTIVE template.
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
// A carve-out is a `mode: EXCLUDE`, `scope: PRODUCT` row whose scopeValue is the excluded product's
// GID, carving specific products out of a broad INCLUDE rule ("all products EXCEPT X"): the
// storefront renders nothing for an excluded product's broad tiers, and the activation gate
// subtracts them (Decision A). Written as a set (create-or-replace), touching ONLY EXCLUDE rows —
// the mirror of setTemplateScope.

/**
 * Replace a template's EXCLUDE carve-out set with `gids` (each a product GID). Validates every GID
 * via `validateScope("PRODUCT", ...)` BEFORE any DB call, proves shop ownership (priority #1), then
 * in ONE `$transaction` deletes the existing EXCLUDE rows and creates the new set. Only EXCLUDE rows
 * are touched, so the INCLUDE scope survives. Duplicates collapse. Empty `gids` clears (delete only).
 */
export async function setTemplateExcludes(
  shopId: string,
  templateId: string,
  gids: unknown,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!Array.isArray(gids)) {
    return { ok: false as const, error: "Invalid excludes" };
  }

  // Validate each GID with the shared PRODUCT validator and dedupe. A single invalid GID rejects
  // the whole write (atomic — no partial carve-out set).
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
 * The template's EXCLUDE carve-out GIDs (shop-scoped) for the editor loader. A foreign/unknown
 * template returns []. Null scopeValues are defensively filtered (an EXCLUDE PRODUCT row always
 * carries a GID).
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
 * The other ACTIVE templates' EXCLUDE carve-out GIDs, keyed by templateId, for the activation gate
 * (Decision A — subtracting a carve-out that resolves a PRODUCT-level overlap). Shop-scoped
 * (priority #1), excludes the candidate itself. Only ACTIVE templates matter — a DRAFT/ARCHIVED
 * template covers no product, so its carve-outs can't resolve a live overlap.
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
