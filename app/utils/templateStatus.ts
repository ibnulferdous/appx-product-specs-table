import type { TemplateStatus } from "@prisma/client";

// The Polaris <s-badge> tone for each template status, shared by the templates
// list page (`app.templates.tsx`) and the editor header (`TemplateHeaderActions`)
// so the two surfaces can never tone the same status differently. The map is
// unchanged from its original home on the list page: ACTIVE→success,
// DRAFT→warning, ARCHIVED→neutral (the storefront-visibility semantics in
// data-model.md §8). `import type` keeps the TemplateStatus enum out of the client
// bundle (it is erased) while still proving every status is covered via
// `satisfies`.
export const BADGE_TONES = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
} as const satisfies Record<TemplateStatus, "success" | "warning" | "neutral">;
