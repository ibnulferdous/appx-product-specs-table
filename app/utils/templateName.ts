// Template-name validation + helpers shared by the server (create / save /
// duplicate in `template.server.ts`) AND the client (the editor's Rename modal),
// so the two can never drift. Pure + side-effect-free + framework-free, like the
// other `app/utils/*` modules — it imports nothing app-specific, so it is safe to
// pull into the client bundle (unlike `template.server.ts`, which carries Prisma).

// The MVP cap on a template name's length. A single shared constant so the UI
// guard and the server re-validation enforce the same number (mirrors why
// MAX_TEMPLATE_ROWS is shared).
export const NAME_MAX_LENGTH = 100;

/**
 * Validate an untrusted template name. Returns the trimmed name on success, or an
 * error string for the caller to surface in the standard `{ ok: false, error }`
 * shape. The error messages are part of the contract (the model tests + the toast
 * copy depend on them), so keep them stable.
 */
export function validateTemplateName(
  name: unknown,
): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed.length === 0) {
    return { ok: false, error: "Name is required" };
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Name must be ${NAME_MAX_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, name: trimmed };
}

// The suffix appended to a duplicated template's name. " (copy)" is a UX courtesy
// (uniqueness is not enforced on names), not a constraint.
const COPY_SUFFIX = " (copy)";

/**
 * Build the name for a duplicated template: `"{source} (copy)"`, truncating the
 * source so the result always fits within NAME_MAX_LENGTH (a long source name
 * must not make duplication fail validation). The source name is already valid
 * (non-empty, trimmed) when it comes from a persisted template, so the result is
 * always a valid name. Pure.
 */
export function copyName(sourceName: string): string {
  const candidate = `${sourceName}${COPY_SUFFIX}`;
  if (candidate.length <= NAME_MAX_LENGTH) {
    return candidate;
  }
  return `${sourceName.slice(0, NAME_MAX_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
}
