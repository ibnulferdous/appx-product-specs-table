import { describe, it, expect } from "vitest";
import { normalizeStatusFilter, STATUS_FILTER_OPTIONS } from "./templateFilter";

describe("STATUS_FILTER_OPTIONS (rendered tabs)", () => {
  it("offers exactly All, Active, Draft — no Archived tab, in order", () => {
    expect(STATUS_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      "ALL",
      "ACTIVE",
      "DRAFT",
    ]);
  });

  it("omits the ARCHIVED tab", () => {
    expect(STATUS_FILTER_OPTIONS.map((option) => option.value)).not.toContain(
      "ARCHIVED",
    );
  });
});

describe("normalizeStatusFilter", () => {
  it("maps each selectable status to itself", () => {
    expect(normalizeStatusFilter("ACTIVE")).toBe("ACTIVE");
    expect(normalizeStatusFilter("DRAFT")).toBe("DRAFT");
  });

  it("falls back to ALL for absent, empty, ALL, or unknown values", () => {
    expect(normalizeStatusFilter(null)).toBe("ALL");
    expect(normalizeStatusFilter(undefined)).toBe("ALL");
    expect(normalizeStatusFilter("")).toBe("ALL");
    expect(normalizeStatusFilter("ALL")).toBe("ALL");
    expect(normalizeStatusFilter("BOGUS")).toBe("ALL");
    // Case-sensitive: a lowercase status is not a known value.
    expect(normalizeStatusFilter("active")).toBe("ALL");
  });

  it("falls back to ALL for ARCHIVED — it has no tab (e.g. a stale bookmark)", () => {
    expect(normalizeStatusFilter("ARCHIVED")).toBe("ALL");
  });
});
