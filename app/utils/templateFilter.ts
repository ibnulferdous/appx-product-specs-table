import { BADGE_TONES } from "./templateStatus";

// The status filter shown on the templates list: the three real statuses plus
// the synthetic "ALL" (no filter). Kept on the client side — filtering now
// happens in the browser, not via a server round trip (feature 28).
export type StatusFilter = "ALL" | "ACTIVE" | "DRAFT" | "ARCHIVED";

// The known real statuses, derived from BADGE_TONES so the two surfaces can't
// drift (BADGE_TONES is a runtime value, so this stays out of the type layer and
// is client-safe — no Prisma import). "ALL" is intentionally excluded.
const KNOWN_STATUSES = new Set<string>(Object.keys(BADGE_TONES));

// Normalize an untrusted URL value (?status=…) into a known filter. Anything
// unrecognized — absent, empty, "ALL", or a bogus value — falls back to "ALL".
// Mirrors the old server-side getStatusFromRequest guard, now on the client.
export function normalizeStatusFilter(
  raw: string | null | undefined,
): StatusFilter {
  return raw && KNOWN_STATUSES.has(raw) ? (raw as StatusFilter) : "ALL";
}

// Pure subset of the templates for a given filter. "ALL" returns the list
// unchanged; otherwise the rows whose status matches, order preserved. Generic
// over `{ status }` so it needs no route/loader types and never mutates input.
export function filterTemplatesByStatus<T extends { status: string }>(
  templates: T[],
  filter: StatusFilter,
): T[] {
  if (filter === "ALL") {
    return templates;
  }
  return templates.filter((template) => template.status === filter);
}
