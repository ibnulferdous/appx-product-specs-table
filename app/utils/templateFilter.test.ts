import { describe, it, expect } from "vitest";
import {
  normalizeStatusFilter,
  filterTemplatesByStatus,
  STATUS_FILTER_OPTIONS,
} from "./templateFilter";

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

describe("filterTemplatesByStatus", () => {
  const templates = [
    { id: "t1", status: "ACTIVE" },
    { id: "t2", status: "DRAFT" },
    { id: "t3", status: "ARCHIVED" },
    { id: "t4", status: "ACTIVE" },
  ];

  it("returns the list unchanged for ALL (same reference)", () => {
    const result = filterTemplatesByStatus(templates, "ALL");
    expect(result).toBe(templates);
  });

  it("returns only matching rows, order preserved, for a specific status", () => {
    const result = filterTemplatesByStatus(templates, "ACTIVE");
    expect(result.map((t) => t.id)).toEqual(["t1", "t4"]);
  });

  it("returns an empty array when no row matches", () => {
    const result = filterTemplatesByStatus(
      [{ id: "t1", status: "ACTIVE" }],
      "ARCHIVED",
    );
    expect(result).toEqual([]);
  });

  it("handles an empty input list", () => {
    expect(filterTemplatesByStatus([], "ACTIVE")).toEqual([]);
  });

  it("does not mutate the input list", () => {
    const input = [
      { id: "t1", status: "ACTIVE" },
      { id: "t2", status: "DRAFT" },
    ];
    const snapshot = [...input];
    filterTemplatesByStatus(input, "DRAFT");
    expect(input).toEqual(snapshot);
  });
});
