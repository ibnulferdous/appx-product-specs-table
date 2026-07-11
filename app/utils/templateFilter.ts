// The status filter shown on the templates list: the three real statuses plus
// the synthetic "ALL" (no filter). Kept on the client side — filtering now
// happens in the browser, not via a server round trip (feature 28). The type
// still admits ARCHIVED (it is a real status, and `filterTemplatesByStatus` keeps
// supporting it) even though ARCHIVED has no tab — see `STATUS_FILTER_OPTIONS`.
export type StatusFilter = "ALL" | "ACTIVE" | "DRAFT" | "ARCHIVED";

// The status filter tabs rendered on the templates list, in tab order — the single
// source of truth for both the rendered tabs (`app.templates.tsx`) and the URL
// allow-list below. ARCHIVED is intentionally omitted: a merchant can no longer set
// a template to Archived (see `VISIBLE_TEMPLATE_STATUS_OPTIONS`), so there is no
// Archived tab. Any template that is already ARCHIVED still appears under "All"
// (`filterTemplatesByStatus` keeps supporting the value); it just has no dedicated
// tab. Re-adding the tab is a one-line restore here.
export const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Draft", value: "DRAFT" },
];

// The filter values reachable through the UI, derived from the tabs above so the two
// can never drift. Used to normalize the ?status= URL param.
const SELECTABLE_FILTERS = new Set<string>(
  STATUS_FILTER_OPTIONS.map((option) => option.value),
);

// Normalize an untrusted URL value (?status=…) into a selectable filter. Anything
// unrecognized — absent, empty, "ALL", a bogus value, or a value with no tab (e.g. a
// stale `?status=ARCHIVED` bookmark) — falls back to "ALL", so the list never shows a
// filtered view with no matching active tab. Mirrors the old server-side
// getStatusFromRequest guard, now on the client.
export function normalizeStatusFilter(
  raw: string | null | undefined,
): StatusFilter {
  return raw && SELECTABLE_FILTERS.has(raw) ? (raw as StatusFilter) : "ALL";
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
