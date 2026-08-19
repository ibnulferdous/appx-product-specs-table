import type { AssignmentScope } from "@prisma/client";

// The MVP assignment scopes, in picker order. Declared here (client-safe — the
// type import above is erased at build) so the assignment UI and the server rule
// writer share ONE source of truth. `TAG` is absent because it is post-MVP, and
// the Prisma `AssignmentScope` enum omits it too.
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

// The picker's "no assignment" sentinel — a UI-only value that is NOT an
// `AssignmentScope`. It means "clear the template's INCLUDE rule so it matches no
// products"; the Save action reads it as a clear.
export const SCOPE_NONE = "NONE";

// What the picker binds to. Kept distinct from `AssignmentScopeValue` so the
// persisted rule type never admits the UI-only sentinel.
export type ScopeSelectionValue = typeof SCOPE_NONE | AssignmentScopeValue;

// Picker options, in order. "None" leads because a brand-new template is
// unassigned by default.
export const SCOPE_OPTIONS: { value: ScopeSelectionValue; label: string }[] = [
  { value: SCOPE_NONE, label: "No products (not assigned)" },
  { value: "ALL_PRODUCTS", label: "All products" },
  { value: "PRODUCT", label: "Selected products" },
  { value: "PRODUCT_TYPE", label: "Product type" },
  { value: "VENDOR", label: "Vendor" },
  { value: "COLLECTION", label: "Selected collections" },
];

// Hidden from the merchant-facing picker for now. Product type / vendor /
// collection scoping stays fully implemented server-side — it is just not offered
// until a merchant asks, at which point re-enabling is a one-line removal.
export const HIDDEN_SCOPE_KINDS: ReadonlySet<ScopeSelectionValue> = new Set([
  "PRODUCT_TYPE",
  "VENDOR",
  "COLLECTION",
]);

// The UI-only projection; `SCOPE_OPTIONS` remains the full source of truth.
export const VISIBLE_SCOPE_OPTIONS = SCOPE_OPTIONS.filter(
  (option) => !HIDDEN_SCOPE_KINDS.has(option.value),
);

/**
 * Client mirror of the picker's value-required rule, driving the inline error and
 * the Save-disable. ⚠️ UX only — the server re-validates and is the real boundary.
 *
 *  - `SCOPE_NONE` / `ALL_PRODUCTS` — always complete.
 *  - `PRODUCT_TYPE` / `VENDOR` — single-valued: complete iff EXACTLY ONE valid
 *    value, mirroring the server's arity check.
 *  - `PRODUCT` / `COLLECTION` — complete iff ≥1 value and EVERY value validates.
 *
 * An empty set on a valued kind is *incomplete* (Save disabled), NOT a clear —
 * only `SCOPE_NONE` clears.
 */
export function isScopeSetComplete(scope: string, values: string[]): boolean {
  if (scope === SCOPE_NONE || scope === "ALL_PRODUCTS") return true;
  if (values.length === 0) return false;
  // TYPE / VENDOR are single-valued; more than one value is an invalid UX state.
  if ((scope === "PRODUCT_TYPE" || scope === "VENDOR") && values.length !== 1) {
    return false;
  }
  return values.every((value) => validateScope(scope, value).ok);
}

// Every listed literal must be a real AssignmentScope (compile-time guard against
// a typo drifting from the Prisma enum).
const _scopesAreValid = ASSIGNMENT_SCOPES satisfies readonly AssignmentScope[];
void _scopesAreValid;

/**
 * Validate an untrusted `(scope, scopeValue)` pair into a persistable rule.
 * Client-safe, so the picker and the server run the identical rule. ⚠️ The error
 * strings are part of the contract — tests and UI copy depend on them.
 *
 * Enforces the data-model §5 `scopeValue` invariant:
 *  - `ALL_PRODUCTS` carries **no** value (normalized to `null`); a supplied value
 *    is rejected.
 *  - every other scope **requires** a non-empty value.
 *  - `PRODUCT` / `COLLECTION` get a light structural GID prefix check only — full
 *    existence validation is the dry-run's job.
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

  // A bare prefix (`gid://shopify/Product/`) passes `startsWith` but carries no
  // id, so require at least one character after it — otherwise an unusable
  // routing key could be persisted.
  const PRODUCT_PREFIX = "gid://shopify/Product/";
  const COLLECTION_PREFIX = "gid://shopify/Collection/";
  if (
    typedScope === "PRODUCT" &&
    (!raw.startsWith(PRODUCT_PREFIX) || raw.length === PRODUCT_PREFIX.length)
  ) {
    return { ok: false, error: "Product scope requires a product ID" };
  }
  if (
    typedScope === "COLLECTION" &&
    (!raw.startsWith(COLLECTION_PREFIX) ||
      raw.length === COLLECTION_PREFIX.length)
  ) {
    return { ok: false, error: "Collection scope requires a collection ID" };
  }

  return { ok: true, scope: typedScope, scopeValue: raw };
}
