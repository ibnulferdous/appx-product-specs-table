import type { TemplateStatus } from "@prisma/client";

// The <s-badge> tone per status, shared by the list page and the editor header so
// the two surfaces can never tone the same status differently. The type-only
// import keeps the Prisma enum out of the client bundle while `satisfies` still
// proves every status is covered.
export const BADGE_TONES = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
} as const satisfies Record<TemplateStatus, "success" | "warning" | "neutral">;

// The three statuses in merchant-facing order, so the editor control, the list
// modal and the server validator share ONE source of truth. Set completeness is
// anchored by `BADGE_TONES`.
export const TEMPLATE_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

// Assignable to Prisma's `TemplateStatus`, so a validated status writes to the DB
// without a cast.
export type TemplateStatusValue = (typeof TEMPLATE_STATUSES)[number];

// Compile-time guard against a typo drifting from the Prisma enum.
const _statusesAreValid = TEMPLATE_STATUSES satisfies readonly TemplateStatus[];
void _statusesAreValid;

// Status options for the pickers (editor Settings <s-select> + the list modal),
// so the two surfaces render the same labels in the same order.
export const TEMPLATE_STATUS_OPTIONS: {
  value: TemplateStatusValue;
  label: string;
}[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

// Hidden from the merchant-facing pickers for now. ARCHIVED stays fully valid
// server-side, so an already-ARCHIVED template still persists, badges and filters
// — it is just not offered as a choice. Mirrors `HIDDEN_SCOPE_KINDS`.
export const HIDDEN_STATUS_VALUES: ReadonlySet<TemplateStatusValue> = new Set([
  "ARCHIVED",
]);

// The UI-only projection; `TEMPLATE_STATUS_OPTIONS` remains the source of truth.
export const VISIBLE_TEMPLATE_STATUS_OPTIONS = TEMPLATE_STATUS_OPTIONS.filter(
  (option) => !HIDDEN_STATUS_VALUES.has(option.value),
);

/**
 * Validate an untrusted status. Unlike the tolerant `resolveStatus`, which
 * defaults unknown values to DRAFT on the create/save paths, an explicit
 * status-change is deliberate, so anything unrecognized is REJECTED rather than
 * silently coerced. ⚠️ The error message is part of the contract — tests and toast
 * copy depend on it.
 */
export function validateTemplateStatus(
  status: unknown,
): { ok: true; status: TemplateStatusValue } | { ok: false; error: string } {
  if (
    typeof status === "string" &&
    (TEMPLATE_STATUSES as readonly string[]).includes(status)
  ) {
    return { ok: true, status: status as TemplateStatusValue };
  }
  return { ok: false, error: "Invalid status" };
}
