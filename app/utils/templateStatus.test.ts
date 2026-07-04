import { describe, it, expect } from "vitest";
import {
  TEMPLATE_STATUSES,
  TEMPLATE_STATUS_OPTIONS,
  validateTemplateStatus,
} from "./templateStatus";

describe("validateTemplateStatus", () => {
  it("accepts each of the three real statuses verbatim", () => {
    for (const status of TEMPLATE_STATUSES) {
      expect(validateTemplateStatus(status)).toEqual({ ok: true, status });
    }
  });

  it("rejects an unknown status", () => {
    expect(validateTemplateStatus("PUBLISHED")).toEqual({
      ok: false,
      error: "Invalid status",
    });
  });

  it("rejects the empty string", () => {
    expect(validateTemplateStatus("")).toEqual({
      ok: false,
      error: "Invalid status",
    });
  });

  it("is case-sensitive (does not coerce lowercase)", () => {
    expect(validateTemplateStatus("draft")).toEqual({
      ok: false,
      error: "Invalid status",
    });
  });

  it("does not trim surrounding whitespace", () => {
    expect(validateTemplateStatus(" ACTIVE ")).toEqual({
      ok: false,
      error: "Invalid status",
    });
  });

  it("rejects non-string values", () => {
    expect(validateTemplateStatus(undefined).ok).toBe(false);
    expect(validateTemplateStatus(null).ok).toBe(false);
    expect(validateTemplateStatus(1).ok).toBe(false);
    expect(validateTemplateStatus({ status: "ACTIVE" }).ok).toBe(false);
  });
});

describe("TEMPLATE_STATUS_OPTIONS", () => {
  it("covers every real status exactly once, in Draft/Active/Archived order", () => {
    expect(TEMPLATE_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      "DRAFT",
      "ACTIVE",
      "ARCHIVED",
    ]);
    // Every option value is itself a valid status (no drift between the picker
    // list and the validator).
    for (const option of TEMPLATE_STATUS_OPTIONS) {
      expect(validateTemplateStatus(option.value).ok).toBe(true);
    }
  });
});
