import type { AssignmentScope } from "@prisma/client";

// The MVP assignment scopes as string literals, in picker order (feature 37).
// Declared here (client-safe, no runtime `@prisma/client` enum import — the type
// import below is erased at build) so the assignment UI (feature 44) and the
// server rule writer (`assignment.server.ts`) share ONE source of truth, exactly
// like `TEMPLATE_STATUSES` in `templateStatus.ts`. `TAG` is intentionally absent
// — it is post-MVP (data-model.md §5, the enum comment), so the Prisma
// `AssignmentScope` enum omits it too and this list matches.
export const ASSIGNMENT_SCOPES = [
  "ALL_PRODUCTS",
  "PRODUCT",
  "PRODUCT_TYPE",
  "VENDOR",
  "COLLECTION",
] as const;

// The scope union derived from the list above — assignable to Prisma's
// `AssignmentScope` (whose enum values ARE these literals), so a validated scope
// can be written straight to the DB without a cast.
export type AssignmentScopeValue = (typeof ASSIGNMENT_SCOPES)[number];

// Every listed literal must be a real AssignmentScope (compile-time guard against
// a typo drifting from the Prisma enum).
const _scopesAreValid = ASSIGNMENT_SCOPES satisfies readonly AssignmentScope[];
void _scopesAreValid;

/**
 * Validate an untrusted `(scope, scopeValue)` pair into a persistable rule, or
 * reject it. Pure + client-safe so the picker and the server run the identical
 * rule. The error strings are part of the contract (tests + UI copy depend on
 * them) — keep them stable.
 *
 * Enforces the data-model §5 `scopeValue` invariant:
 *  - `ALL_PRODUCTS` matches everything → it carries **no** value (normalized to
 *    `null`); a supplied value is rejected.
 *  - every other scope **requires** a non-empty value.
 *  - `PRODUCT` / `COLLECTION` values are Shopify GIDs — a light structural prefix
 *    check only (the UI supplies real GIDs from Shopify pickers; full existence
 *    validation is the dry-run's job, feature 39). `PRODUCT_TYPE` / `VENDOR` are
 *    free-form exact strings, trimmed.
 */
export function validateScope(
  scope: unknown,
  scopeValue: unknown,
):
  | { ok: true; scope: AssignmentScopeValue; scopeValue: string | null }
  | { ok: false; error: string } {
  if (
    typeof scope !== "string" ||
    !(ASSIGNMENT_SCOPES as readonly string[]).includes(scope)
  ) {
    return { ok: false, error: "Invalid scope" };
  }
  const typedScope = scope as AssignmentScopeValue;

  // A non-string value (undefined/null) collapses to "" so the checks below are
  // uniform; free-form values are trimmed so " Apple " and "Apple" don't diverge.
  const raw = typeof scopeValue === "string" ? scopeValue.trim() : "";

  if (typedScope === "ALL_PRODUCTS") {
    if (raw !== "") {
      return { ok: false, error: "All products scope takes no value" };
    }
    return { ok: true, scope: typedScope, scopeValue: null };
  }

  if (raw === "") {
    return { ok: false, error: "This scope requires a value" };
  }

  if (typedScope === "PRODUCT" && !raw.startsWith("gid://shopify/Product/")) {
    return { ok: false, error: "Product scope requires a product ID" };
  }
  if (
    typedScope === "COLLECTION" &&
    !raw.startsWith("gid://shopify/Collection/")
  ) {
    return { ok: false, error: "Collection scope requires a collection ID" };
  }

  return { ok: true, scope: typedScope, scopeValue: raw };
}
