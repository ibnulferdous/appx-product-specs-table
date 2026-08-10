import { SCOPE_NONE, validateScope } from "../../utils/assignmentScope";
import type { ScopeSelector } from "../../utils/assignmentOverlap";

// Pure parsing / diffing helpers for the editor Save action's assignment handling (features 44–46),
// extracted from `route.tsx` so they're unit-testable without the route's server + React imports. No
// DB, no Admin API. The client mirrors the same `validateScope` rule, so both accept the same shapes.

/**
 * A stable, collision-free, order-independent key for comparing two INCLUDE selector SETS (feature
 * 46). Distinct selectors never collide (scope and value joined with a space that can't appear in a
 * scope name), and sorting makes a reorder a no-op. An empty set (NONE) is the empty string.
 */
export function selectorSetKey(selectors: ScopeSelector[]): string {
  return selectors
    .map((s) => `${s.scope} ${s.scopeValue ?? ""}`)
    .sort()
    .join("");
}

/**
 * Parse the pending assignment scope out of a Save payload into a homogeneous INCLUDE selector SET
 * (feature 46). Accepts BOTH the multi-value `scopeValues` array (feature 47's picker) and the legacy
 * single `scopeValue`, normalizing to `ScopeSelector[]`.
 *  - scope absent / not a string -> `provided:false` (leave the persisted set untouched).
 *  - scope === "NONE" -> `provided:true, selectors:[]` (clear the rule).
 *  - ALL_PRODUCTS -> exactly one null-valued selector.
 *  - a valued kind -> each value validated via `validateScope` + deduped; an invalid value rejects
 *    the whole Save; an EMPTY valued set is rejected (incomplete — defense in depth).
 */
export function parsePendingScope(payload: {
  scope?: unknown;
  scopeValue?: unknown;
  scopeValues?: unknown;
}):
  | { ok: true; provided: boolean; selectors: ScopeSelector[] }
  | { ok: false; error: string } {
  if (typeof payload.scope !== "string") {
    return { ok: true, provided: false, selectors: [] };
  }
  if (payload.scope === SCOPE_NONE) {
    return { ok: true, provided: true, selectors: [] };
  }
  const kind = payload.scope;

  // ALL_PRODUCTS carries no value -> a single null-valued selector.
  if (kind === "ALL_PRODUCTS") {
    const validated = validateScope(kind, null);
    if (!validated.ok) return { ok: false, error: validated.error };
    return {
      ok: true,
      provided: true,
      selectors: [{ scope: validated.scope, scopeValue: validated.scopeValue }],
    };
  }

  // A valued kind: prefer `scopeValues`, else the legacy single `scopeValue`. Empty -> reject.
  const rawValues: unknown[] = Array.isArray(payload.scopeValues)
    ? payload.scopeValues
    : payload.scopeValue !== undefined
      ? [payload.scopeValue]
      : [];
  if (rawValues.length === 0) {
    return { ok: false, error: "This scope requires a value" };
  }

  const selectors: ScopeSelector[] = [];
  const seen = new Set<string>();
  for (const value of rawValues) {
    const validated = validateScope(kind, value);
    if (!validated.ok) return { ok: false, error: validated.error };
    const v = validated.scopeValue as string; // non-null for a valued kind
    if (!seen.has(v)) {
      seen.add(v);
      selectors.push({
        scope: validated.scope,
        scopeValue: validated.scopeValue,
      });
    }
  }
  return { ok: true, provided: true, selectors };
}

/**
 * Parse the pending EXCLUDE carve-outs out of a Save payload (feature 45).
 *  - excludes absent / not an array -> `provided:false` (leave the persisted carve-outs untouched).
 *  - an array -> each entry validated as a PRODUCT GID via `validateScope` (defense in depth) and
 *    de-duplicated. An invalid GID rejects the whole Save.
 */
export function parsePendingExcludes(payload: {
  excludes?: unknown;
}):
  | { ok: true; provided: boolean; gids: string[] }
  | { ok: false; error: string } {
  if (!Array.isArray(payload.excludes)) {
    return { ok: true, provided: false, gids: [] };
  }
  const gids: string[] = [];
  for (const gid of payload.excludes) {
    const validated = validateScope("PRODUCT", gid);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }
    const value = validated.scopeValue as string;
    if (!gids.includes(value)) gids.push(value);
  }
  return { ok: true, provided: true, gids };
}

/**
 * Drop any exclude GID also in the pending INCLUDE PRODUCT set (Decision C — a product can't be both
 * INCLUDE'd and EXCLUDE'd; `byProduct` beats the exclude gate, so a lingering exclude is inert AND
 * would fool the activation gate's exclude-subtraction).
 */
export function reconcileExcludes(
  excludeGids: string[],
  selectors: ScopeSelector[],
): string[] {
  const included = new Set(
    selectors
      .filter((s) => s.scope === "PRODUCT" && s.scopeValue)
      .map((s) => s.scopeValue as string),
  );
  return excludeGids.filter((gid) => !included.has(gid));
}

/** Set equality over two GID lists (order-independent) — drives the
 *  excludes-changed diff for the gate + rebuild triggers. */
export function sameGidSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((gid) => set.has(gid));
}
