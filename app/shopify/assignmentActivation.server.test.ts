import { describe, it, expect, vi, beforeEach } from "vitest";

// The two Postgres reads and the Shopify probe are mocked at the module boundary;
// the PURE resolver (`partitionOverlaps`, feature 38) is left REAL so the gate's
// actual set-algebra runs. `admin` is an opaque stub — `checkCrossDimensionConflicts`
// is mocked, so the gate never touches a real Admin client here.
vi.mock("../models/assignment.server", () => ({
  getAssignmentForTemplate: vi.fn(),
  getActiveIncludeScopesExcept: vi.fn(),
  getActiveExcludesByTemplate: vi.fn(),
  getExcludesForTemplate: vi.fn(),
}));
vi.mock("./assignmentConflict.server", () => ({
  checkCrossDimensionConflicts: vi.fn(),
}));

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  getAssignmentForTemplate,
  getActiveIncludeScopesExcept,
  getActiveExcludesByTemplate,
  getExcludesForTemplate,
} from "../models/assignment.server";
import { checkCrossDimensionConflicts } from "./assignmentConflict.server";
import {
  shouldRebuildRouting,
  shouldRebuildRoutingForScopeSave,
  evaluateActivationConflicts,
  activationBlockedMessage,
  type ActivationConflict,
} from "./assignmentActivation.server";

const getAssignmentMock = vi.mocked(getAssignmentForTemplate);
const getOthersMock = vi.mocked(getActiveIncludeScopesExcept);
const getOthersExcludesMock = vi.mocked(getActiveExcludesByTemplate);
const getCandidateExcludesMock = vi.mocked(getExcludesForTemplate);
const checkProbeMock = vi.mocked(checkCrossDimensionConflicts);

// The gate never calls admin directly (the probe is mocked), so an empty stub is
// sufficient — it's only threaded through to `checkCrossDimensionConflicts`.
const admin = {} as AdminApiContext;

describe("shouldRebuildRouting — pure ACTIVE-set transition test", () => {
  it("rebuilds on any transition that touches ACTIVE", () => {
    expect(shouldRebuildRouting("DRAFT", "ACTIVE")).toBe(true);
    expect(shouldRebuildRouting("ARCHIVED", "ACTIVE")).toBe(true);
    expect(shouldRebuildRouting("ACTIVE", "DRAFT")).toBe(true);
    expect(shouldRebuildRouting("ACTIVE", "ARCHIVED")).toBe(true);
  });

  it("does NOT rebuild when the ACTIVE set is unchanged", () => {
    // No-op transitions (rows-only save carries an unchanged status).
    expect(shouldRebuildRouting("ACTIVE", "ACTIVE")).toBe(false);
    expect(shouldRebuildRouting("DRAFT", "DRAFT")).toBe(false);
    // A transition that never touches ACTIVE.
    expect(shouldRebuildRouting("DRAFT", "ARCHIVED")).toBe(false);
    expect(shouldRebuildRouting("ARCHIVED", "DRAFT")).toBe(false);
  });
});

describe("shouldRebuildRoutingForScopeSave — editor-Save rebuild decision", () => {
  it("rebuilds on an ACTIVE-set membership change (to/from ACTIVE)", () => {
    // was DRAFT → will be ACTIVE
    expect(shouldRebuildRoutingForScopeSave(false, true, false)).toBe(true);
    // was ACTIVE → will be DRAFT
    expect(shouldRebuildRoutingForScopeSave(true, false, false)).toBe(true);
  });

  it("rebuilds when an ACTIVE template's scope changes (status unchanged)", () => {
    expect(shouldRebuildRoutingForScopeSave(true, true, true)).toBe(true);
  });

  it("does NOT rebuild when ACTIVE and the scope is unchanged", () => {
    expect(shouldRebuildRoutingForScopeSave(true, true, false)).toBe(false);
  });

  it("does NOT rebuild for a DRAFT scope edit (never in the routing map)", () => {
    // was DRAFT, will be DRAFT, scope changed → routing untouched
    expect(shouldRebuildRoutingForScopeSave(false, false, true)).toBe(false);
  });
});

describe("evaluateActivationConflicts — the DRAFT→ACTIVE gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the probe confirms nothing (overridden per test).
    checkProbeMock.mockResolvedValue([]);
    // Default: no carve-outs on either side (overridden by the EXCLUDE tests).
    getOthersExcludesMock.mockResolvedValue(new Map());
    getCandidateExcludesMock.mockResolvedValue([]);
  });

  it("passes trivially when the candidate has no INCLUDE scope (common case today)", async () => {
    getAssignmentMock.mockResolvedValue(null);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result).toEqual({ ok: true });
    // Short-circuits before reading the comparison set or probing.
    expect(getOthersMock).not.toHaveBeenCalled();
    expect(checkProbeMock).not.toHaveBeenCalled();
  });

  it("passes when there are no other scoped ACTIVE templates", async () => {
    getAssignmentMock.mockResolvedValue({
      scope: "VENDOR",
      scopeValue: "Acme",
    } as never);
    getOthersMock.mockResolvedValue([]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result).toEqual({ ok: true });
    expect(checkProbeMock).not.toHaveBeenCalled();
  });

  it("blocks on a definite same-scope OVERLAP, naming the other template", async () => {
    getAssignmentMock.mockResolvedValue({
      scope: "VENDOR",
      scopeValue: "Acme",
    } as never);
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Vendor table",
        scope: "VENDOR",
        scopeValue: "Acme",
      },
    ]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].templateId).toBe("t2");
      expect(result.conflicts[0].templateName).toBe("Vendor table");
    }
    // A definite overlap needs no probe.
    expect(checkProbeMock).toHaveBeenCalledWith(admin, []);
  });

  it("blocks when the candidate is ALL_PRODUCTS (universal overlap)", async () => {
    getAssignmentMock.mockResolvedValue({
      scope: "ALL_PRODUCTS",
      scopeValue: null,
    } as never);
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Vendor table",
        scope: "VENDOR",
        scopeValue: "Acme",
      },
    ]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.conflicts[0].templateName).toBe("Vendor table");
  });

  it("blocks when a NEEDS_CHECK pair is CONFIRMED by the Shopify probe", async () => {
    getAssignmentMock.mockResolvedValue({
      scope: "PRODUCT_TYPE",
      scopeValue: "Phones",
    } as never);
    const other = {
      templateId: "t2",
      templateName: "Acme vendor",
      scope: "VENDOR" as const,
      scopeValue: "Acme",
    };
    getOthersMock.mockResolvedValue([other]);
    // Cross-dimension → NEEDS_CHECK → the probe confirms a shared product.
    checkProbeMock.mockResolvedValue([
      { other, reason: "product_type AND vendor" },
    ]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.conflicts[0].templateName).toBe("Acme vendor");
  });

  it("passes when a NEEDS_CHECK pair is CLEARED by the probe (no shared product)", async () => {
    getAssignmentMock.mockResolvedValue({
      scope: "PRODUCT_TYPE",
      scopeValue: "Phones",
    } as never);
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Acme vendor",
        scope: "VENDOR",
        scopeValue: "Acme",
      },
    ]);
    checkProbeMock.mockResolvedValue([]); // probe finds no overlap

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result).toEqual({ ok: true });
  });

  it("drops a provably DISJOINT same-single-valued-scope pair without a probe verdict", async () => {
    getAssignmentMock.mockResolvedValue({
      scope: "PRODUCT_TYPE",
      scopeValue: "Phones",
    } as never);
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Tablets table",
        scope: "PRODUCT_TYPE",
        scopeValue: "Tablets",
      },
    ]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result).toEqual({ ok: true });
    // Same single-valued scope, different value → DISJOINT → no probe pair.
    expect(checkProbeMock).toHaveBeenCalledWith(admin, []);
  });

  it("FAILS CLOSED: a thrown probe blocks activation (never a silent pass)", async () => {
    getAssignmentMock.mockResolvedValue({
      scope: "PRODUCT_TYPE",
      scopeValue: "Phones",
    } as never);
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Acme vendor",
        scope: "VENDOR",
        scopeValue: "Acme",
      },
    ]);
    checkProbeMock.mockRejectedValue(new Error("Shopify 500"));

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The fail-closed conflict has no specific other template.
      expect(result.conflicts[0].templateName).toBeUndefined();
      expect(result.conflicts[0].reason).toMatch(/verify/i);
    }
  });

  it("uses the PENDING candidate scope when passed, NOT the persisted rule (feature 44)", async () => {
    // Persisted rule is DISJOINT (Tablets); the pending scope is the conflicting
    // one (Phones). The gate must read the pending scope, so it BLOCKS — and must
    // not call getAssignmentForTemplate at all.
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Phones table",
        scope: "PRODUCT_TYPE",
        scopeValue: "Phones",
      },
    ]);

    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      { scope: "PRODUCT_TYPE", scopeValue: "Phones" }, // pending scope
    );

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.conflicts[0].templateName).toBe("Phones table");
    // The pending scope was supplied, so the persisted rule is never read.
    expect(getAssignmentMock).not.toHaveBeenCalled();
  });

  it("passes without reading the comparison set when the pending scope is explicitly null", async () => {
    // A to-be-scope-less activation: candidateScope passed as null → matches no
    // products → trivially passes, and short-circuits before any read.
    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      null,
    );

    expect(result).toEqual({ ok: true });
    expect(getAssignmentMock).not.toHaveBeenCalled();
    expect(getOthersMock).not.toHaveBeenCalled();
  });

  it("excludes the candidate from the comparison read (self can't conflict)", async () => {
    getAssignmentMock.mockResolvedValue({
      scope: "VENDOR",
      scopeValue: "Acme",
    } as never);
    getOthersMock.mockResolvedValue([]);

    await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(getOthersMock).toHaveBeenCalledWith("shop_A", "cand");
  });

  // --- EXCLUDE carve-out subtraction (feature 45, Decision A) ---------------

  it("resolves a conflict when the candidate is PRODUCT:X and the covering ACTIVE template excludes X", async () => {
    // Candidate = PRODUCT:1. Other = ALL_PRODUCTS (definite overlap) that carves
    // out product 1 → the collision is resolved (case 1).
    getAssignmentMock.mockResolvedValue({
      scope: "PRODUCT",
      scopeValue: "gid://shopify/Product/1",
    } as never);
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Catch-all",
        scope: "ALL_PRODUCTS",
        scopeValue: null,
      },
    ]);
    getOthersExcludesMock.mockResolvedValue(
      new Map([["t2", ["gid://shopify/Product/1"]]]),
    );

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result).toEqual({ ok: true });
  });

  it("resolves a conflict when a PRODUCT:X ACTIVE template is excluded by the broad candidate's pending carve-outs", async () => {
    // Candidate = ALL_PRODUCTS with a PENDING carve-out for product 9. Other =
    // PRODUCT:9 (definite overlap) → resolved (case 2). The persisted carve-outs
    // are never read because the pending set is supplied.
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Falcon table",
        scope: "PRODUCT",
        scopeValue: "gid://shopify/Product/9",
      },
    ]);

    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      { scope: "ALL_PRODUCTS", scopeValue: null },
      ["gid://shopify/Product/9"],
    );

    expect(result).toEqual({ ok: true });
    expect(getCandidateExcludesMock).not.toHaveBeenCalled();
  });

  it("still blocks when the carve-out does not cover the colliding product", async () => {
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Falcon table",
        scope: "PRODUCT",
        scopeValue: "gid://shopify/Product/9",
      },
    ]);

    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      { scope: "ALL_PRODUCTS", scopeValue: null },
      ["gid://shopify/Product/8"], // a DIFFERENT product
    );

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.conflicts[0].templateName).toBe("Falcon table");
  });

  it("never resolves a broad×broad overlap, even with carve-outs present", async () => {
    // VENDOR × PRODUCT_TYPE → NEEDS_CHECK → probe confirms a shared product. Neither
    // side is PRODUCT-scoped, so no carve-out can subtract it — it stays blocked.
    const other = {
      templateId: "t2",
      templateName: "Drone type",
      scope: "PRODUCT_TYPE" as const,
      scopeValue: "Drone",
    };
    getOthersMock.mockResolvedValue([other]);
    checkProbeMock.mockResolvedValue([
      { other, reason: "vendor AND product_type" },
    ]);
    getOthersExcludesMock.mockResolvedValue(
      new Map([["t2", ["gid://shopify/Product/1"]]]),
    );

    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      { scope: "VENDOR", scopeValue: "Acme" },
      ["gid://shopify/Product/1"],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts[0].templateName).toBe("Drone type");
  });

  it("reads the persisted candidate carve-outs when none are passed (list-surface path)", async () => {
    getAssignmentMock.mockResolvedValue({
      scope: "ALL_PRODUCTS",
      scopeValue: null,
    } as never);
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Falcon table",
        scope: "PRODUCT",
        scopeValue: "gid://shopify/Product/9",
      },
    ]);
    getCandidateExcludesMock.mockResolvedValue(["gid://shopify/Product/9"]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result).toEqual({ ok: true });
    expect(getCandidateExcludesMock).toHaveBeenCalledWith("shop_A", "cand");
  });
});

describe("activationBlockedMessage", () => {
  it("names a single conflicting template", () => {
    const conflicts: ActivationConflict[] = [
      { templateId: "t2", templateName: "Vendor table", reason: "overlap" },
    ];
    expect(activationBlockedMessage(conflicts)).toMatch(/“Vendor table”/);
  });

  it("lists and de-dupes multiple named templates", () => {
    const conflicts: ActivationConflict[] = [
      { templateId: "t2", templateName: "A", reason: "overlap" },
      { templateId: "t3", templateName: "B", reason: "overlap" },
      { templateId: "t2", templateName: "A", reason: "overlap" },
    ];
    const msg = activationBlockedMessage(conflicts);
    expect(msg).toMatch(/“A”/);
    expect(msg).toMatch(/“B”/);
    // "A" appears once (de-duped), so only two curly-quote pairs total.
    expect(msg.match(/“/g)).toHaveLength(2);
  });

  it("falls back to the raw reason for the fail-closed (unnamed) case", () => {
    const conflicts: ActivationConflict[] = [
      { reason: "Couldn't verify this template." },
    ];
    expect(activationBlockedMessage(conflicts)).toBe(
      "Couldn't verify this template.",
    );
  });
});
