// Template-name validation shared by the server (create / save / duplicate) AND
// the client (the Rename modal), so the two can never drift.

// A single shared constant so the UI guard and the server re-validation enforce
// the same number.
export const NAME_MAX_LENGTH = 255;

/**
 * Validate an untrusted template name, returning the trimmed name on success.
 * ⚠️ The error messages are part of the contract — model tests and toast copy
 * depend on them.
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

// A UX courtesy — uniqueness is not enforced on names.
const COPY_SUFFIX = " (copy)";

/**
 * Build a duplicated template's name, truncating the source so the result always
 * fits `NAME_MAX_LENGTH` — a long source name must not make duplication fail
 * validation.
 */
export function copyName(sourceName: string): string {
  const candidate = `${sourceName}${COPY_SUFFIX}`;
  if (candidate.length <= NAME_MAX_LENGTH) {
    return candidate;
  }
  return `${sourceName.slice(0, NAME_MAX_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
}
