import type { TemplateStatus } from "@prisma/client";

// The Polaris <s-badge> tone for each template status, shared by the templates
// list page (`app.templates.tsx`) and the editor header (`TemplateHeaderActions`)
// so the two surfaces can never tone the same status differently. The map is
// unchanged from its original home on the list page: ACTIVE→success,
// DRAFT→warning, ARCHIVED→neutral (the storefront-visibility semantics in
// data-model.md §8). `import type { TemplateStatus }` keeps the enum out of the
// client bundle (it is erased) while still proving every status is covered via
// `satisfies`.
export const BADGE_TONES = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
} as const satisfies Record<TemplateStatus, "success" | "warning" | "neutral">;

// The three real template statuses as string literals, in the order shown to
// merchants (feature 36). Declared here (client-safe, no runtime `@prisma/client`
// enum import) so both the editor Settings control and the list "Change status"
// modal — and the server validator below — share ONE source of truth. The
// `satisfies` check proves every listed value is a valid TemplateStatus; the
// completeness of the set (all three present) is anchored by BADGE_TONES.
export const TEMPLATE_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

// The status union derived from the list above — assignable to Prisma's
// `TemplateStatus` (whose enum values ARE these literals), so it can be written
// straight to the DB without a cast.
export type TemplateStatusValue = (typeof TEMPLATE_STATUSES)[number];

// Every listed literal must be a real TemplateStatus (compile-time guard against a
// typo drifting from the Prisma enum).
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

/**
 * Validate an untrusted status into a known `TemplateStatusValue`. Unlike the
 * tolerant `resolveStatus` (which defaults anything unknown to DRAFT for the
 * create/save paths), an explicit status-change is a deliberate action, so an
 * unknown/empty/wrong-case value is REJECTED — never silently coerced. Returns
 * the standard `{ ok }` shape; the error message is part of the contract (tests +
 * toast copy depend on it), so keep it stable. Pure + client-safe.
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
