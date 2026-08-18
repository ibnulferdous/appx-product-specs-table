import { describe, it, expect } from "vitest";
import {
  NAME_MAX_LENGTH,
  copyName,
  validateTemplateName,
} from "./templateName";

describe("validateTemplateName", () => {
  it("trims and accepts a valid name", () => {
    expect(validateTemplateName("  Specs  ")).toEqual({
      ok: true,
      name: "Specs",
    });
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(validateTemplateName("")).toEqual({
      ok: false,
      error: "Name is required",
    });
    expect(validateTemplateName("   ")).toEqual({
      ok: false,
      error: "Name is required",
    });
  });

  it("rejects a non-string (missing) name as required", () => {
    expect(validateTemplateName(undefined)).toEqual({
      ok: false,
      error: "Name is required",
    });
    expect(validateTemplateName(42)).toEqual({
      ok: false,
      error: "Name is required",
    });
  });

  it("accepts a name at exactly the length cap", () => {
    const atCap = "a".repeat(NAME_MAX_LENGTH);
    expect(validateTemplateName(atCap)).toEqual({ ok: true, name: atCap });
  });

  it("rejects a name longer than the length cap (measured after trim)", () => {
    expect(validateTemplateName("a".repeat(NAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: `Name must be ${NAME_MAX_LENGTH} characters or fewer`,
    });
  });
});

describe("copyName", () => {
  it("appends ' (copy)' to a short name", () => {
    expect(copyName("Specs")).toBe("Specs (copy)");
  });

  it("keeps the result within the length cap by truncating a long source", () => {
    const result = copyName("a".repeat(NAME_MAX_LENGTH));
    expect(result.length).toBe(NAME_MAX_LENGTH);
    expect(result.endsWith(" (copy)")).toBe(true);
    // The truncated result is still a valid name.
    expect(validateTemplateName(result).ok).toBe(true);
  });
});
