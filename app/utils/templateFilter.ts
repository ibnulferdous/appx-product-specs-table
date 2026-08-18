// The templates-list status filter: the three real statuses plus a synthetic
// "ALL". ⚠️ Filtering is SERVER-SIDE — once the list is paginated a client filter
// would only filter the current page — so these helpers just normalize the
// `?status=` param the loader reads. The type still admits ARCHIVED even though
// it has no tab.
export type StatusFilter = "ALL" | "ACTIVE" | "DRAFT" | "ARCHIVED";

// The rendered tabs, in order — the source of truth for both the tabs themselves
// and the URL allow-list below. ARCHIVED is omitted because a merchant can no
// longer set it; already-ARCHIVED templates still appear under "All".
export const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Draft", value: "DRAFT" },
];

// Derived from the tabs above so the two can never drift.
const SELECTABLE_FILTERS = new Set<string>(
  STATUS_FILTER_OPTIONS.map((option) => option.value),
);

// Normalize an untrusted `?status=` value. Anything unrecognized — including a
// stale `?status=ARCHIVED` bookmark — falls back to "ALL", so the list never
// shows a filtered view with no matching active tab.
export function normalizeStatusFilter(
  raw: string | null | undefined,
): StatusFilter {
  return raw && SELECTABLE_FILTERS.has(raw) ? (raw as StatusFilter) : "ALL";
}
