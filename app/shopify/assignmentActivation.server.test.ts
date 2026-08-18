import { describe, it, expect, vi, beforeEach } from "vitest";

// The two Postgres reads and the Shopify probe are mocked at the module boundary;
// the PURE resolver (`partitionOverlaps`, feature 38) is left REAL so the gate's
// actual set-algebra runs. `admin` is an opaque stub — `checkCrossDimensionConflicts`
// is mocked, so the gate never touches a real Admin client here.
vi.mock("../models/assignment.server", () => ({
  getTemplateIncludeSelectors: vi.fn(),
  getActiveIncludeScopesExcept: vi.fn(),
  getActiveExcludesByTemplate: vi.fn(),
  getExcludesForTemplate: vi.fn(),
}));
vi.mock("./assignmentConflict.server", () => ({
  checkCrossDimensionConflicts: vi.fn(),
}));

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  getTemplateIncludeSelectors,
  getActiveIncludeScopesExcept,
  getActiveExcludesByTemplate,
  getExcludesForTemplate,
} from "../models/assignment.server";
import { checkCrossDimensionConflicts } from "./assignmentConflict.server";
import {
  shouldRebuildRouting,
  shouldRebuildRoutingForScopeSave,
  evaluateActivationConflicts,
  resolvedByExclude,
  activationBlockedMessage,
  type ActivationConflict,
} from "./assignmentActivation.server";

const getSelectorsMock = vi.mocked(getTemplateIncludeSelectors);
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

describe("evaluateActivationConflicts — the DRAFT→ACTIVE gate (feature 46 multi-value)", () => {
  const PT = (id: string) => `gid://shopify/Product/${id}`;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the probe confirms nothing (overridden per test).
    checkProbeMock.mockResolvedValue([]);
    // Default: no carve-outs on either side (overridden by the EXCLUDE tests).
    getOthersExcludesMock.mockResolvedValue(new Map());
    getCandidateExcludesMock.mockResolvedValue([]);
  });

  it("passes trivially when the candidate has no INCLUDE scope (default read → [])", async () => {
    getSelectorsMock.mockResolvedValue([]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result).toEqual({ ok: true });
    // Short-circuits before reading the comparison set or probing.
    expect(getOthersMock).not.toHaveBeenCalled();
    expect(checkProbeMock).not.toHaveBeenCalled();
  });

  it("default read uses getTemplateIncludeSelectors (NOT getAssignmentForTemplate)", async () => {
    getSelectorsMock.mockResolvedValue([
      { scope: "VENDOR", scopeValue: "Acme" },
    ]);
    getOthersMock.mockResolvedValue([]);

    await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(getSelectorsMock).toHaveBeenCalledWith("shop_A", "cand");
  });

  it("passes when there are no other scoped ACTIVE templates", async () => {
    getSelectorsMock.mockResolvedValue([
      { scope: "VENDOR", scopeValue: "Acme" },
    ]);
    getOthersMock.mockResolvedValue([]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result).toEqual({ ok: true });
    expect(checkProbeMock).not.toHaveBeenCalled();
  });

  it("blocks on a definite same-scope OVERLAP, naming the other template", async () => {
    getSelectorsMock.mockResolvedValue([
      { scope: "VENDOR", scopeValue: "Acme" },
    ]);
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
  });

  it("blocks when the candidate is ALL_PRODUCTS (universal overlap)", async () => {
    getSelectorsMock.mockResolvedValue([
      { scope: "ALL_PRODUCTS", scopeValue: null },
    ]);
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
    getSelectorsMock.mockResolvedValue([
      { scope: "PRODUCT_TYPE", scopeValue: "Phones" },
    ]);
    const other = {
      templateId: "t2",
      templateName: "Acme vendor",
      scope: "VENDOR" as const,
      scopeValue: "Acme",
    };
    getOthersMock.mockResolvedValue([other]);
    checkProbeMock.mockResolvedValue([
      { other, reason: "product_type AND vendor" },
    ]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.conflicts[0].templateName).toBe("Acme vendor");
  });

  it("passes when a NEEDS_CHECK pair is CLEARED by the probe (no shared product)", async () => {
    getSelectorsMock.mockResolvedValue([
      { scope: "PRODUCT_TYPE", scopeValue: "Phones" },
    ]);
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Acme vendor",
        scope: "VENDOR",
        scopeValue: "Acme",
      },
    ]);
    checkProbeMock.mockResolvedValue([]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result).toEqual({ ok: true });
  });

  it("drops a provably DISJOINT same-single-valued-scope pair without a probe verdict", async () => {
    getSelectorsMock.mockResolvedValue([
      { scope: "PRODUCT_TYPE", scopeValue: "Phones" },
    ]);
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
    expect(checkProbeMock).toHaveBeenCalledWith(admin, []);
  });

  it("FAILS CLOSED: a thrown probe blocks activation (never a silent pass)", async () => {
    getSelectorsMock.mockResolvedValue([
      { scope: "PRODUCT_TYPE", scopeValue: "Phones" },
    ]);
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
      expect(result.conflicts[0].templateName).toBeUndefined();
      expect(result.conflicts[0].reason).toMatch(/verify/i);
    }
  });

  it("uses the PENDING candidate set when passed, NOT the persisted rule", async () => {
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Phones table",
        scope: "PRODUCT_TYPE",
        scopeValue: "Phones",
      },
    ]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand", [
      { scope: "PRODUCT_TYPE", scopeValue: "Phones" },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.conflicts[0].templateName).toBe("Phones table");
    // The pending set was supplied, so the persisted set is never read.
    expect(getSelectorsMock).not.toHaveBeenCalled();
  });

  it("passes without reading the comparison set when the pending set is explicitly empty", async () => {
    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      [],
    );

    expect(result).toEqual({ ok: true });
    expect(getSelectorsMock).not.toHaveBeenCalled();
    expect(getOthersMock).not.toHaveBeenCalled();
  });

  it("excludes the candidate from the comparison read (self can't conflict)", async () => {
    getSelectorsMock.mockResolvedValue([
      { scope: "VENDOR", scopeValue: "Acme" },
    ]);
    getOthersMock.mockResolvedValue([]);

    await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(getOthersMock).toHaveBeenCalledWith("shop_A", "cand");
  });

  // --- Multi-value candidate (feature 46) ----------------------------------

  it("multi-value candidate blocks via an un-excluded member ({X,Y} vs ALL EXCLUDE X)", async () => {
    // Pair (X, ALL) resolves (case 1); pair (Y, ALL) does NOT → still blocks.
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Catch-all",
        scope: "ALL_PRODUCTS",
        scopeValue: null,
      },
    ]);
    getOthersExcludesMock.mockResolvedValue(new Map([["t2", [PT("X")]]]));

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand", [
      { scope: "PRODUCT", scopeValue: PT("X") },
      { scope: "PRODUCT", scopeValue: PT("Y") },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].templateName).toBe("Catch-all");
    }
  });

  it("multi-value candidate passes when EVERY member is carved out ({X,Y} vs ALL EXCLUDE X,Y)", async () => {
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Catch-all",
        scope: "ALL_PRODUCTS",
        scopeValue: null,
      },
    ]);
    getOthersExcludesMock.mockResolvedValue(
      new Map([["t2", [PT("X"), PT("Y")]]]),
    );

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand", [
      { scope: "PRODUCT", scopeValue: PT("X") },
      { scope: "PRODUCT", scopeValue: PT("Y") },
    ]);

    expect(result).toEqual({ ok: true });
  });

  it("multi-value OTHER, partial resolve: subtract-before-dedupe (must block via B)", async () => {
    // Candidate ALL_PRODUCTS + pending excludes [A]. Other t2 = {PRODUCT:A, PRODUCT:B}
    // (two rows, same templateId). Pair (ALL, A) resolves (case 2); pair (ALL, B) does
    // NOT → block, ONE conflict naming t2. Fails under any dedupe-before-subtract impl.
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Pair table",
        scope: "PRODUCT",
        scopeValue: PT("A"),
      },
      {
        templateId: "t2",
        templateName: "Pair table",
        scope: "PRODUCT",
        scopeValue: PT("B"),
      },
    ]);

    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      [{ scope: "ALL_PRODUCTS", scopeValue: null }],
      [PT("A")],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].templateId).toBe("t2");
    }
  });

  it("multi-value OTHER fully carved out passes ({A,B} both excluded)", async () => {
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Pair table",
        scope: "PRODUCT",
        scopeValue: PT("A"),
      },
      {
        templateId: "t2",
        templateName: "Pair table",
        scope: "PRODUCT",
        scopeValue: PT("B"),
      },
    ]);

    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      [{ scope: "ALL_PRODUCTS", scopeValue: null }],
      [PT("A"), PT("B")],
    );

    expect(result).toEqual({ ok: true });
  });

  it("probe-free block for a multi-value PRODUCT candidate ({X,Z} vs PRODUCT:X)", async () => {
    // cs=X → OVERLAP (no probe); cs=Z → same-scope-diff-value PRODUCT → DISJOINT (no probe).
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Just X",
        scope: "PRODUCT",
        scopeValue: PT("X"),
      },
    ]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand", [
      { scope: "PRODUCT", scopeValue: PT("X") },
      { scope: "PRODUCT", scopeValue: PT("Z") },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts[0].templateName).toBe("Just X");
    // Every probe invocation was with an empty needs-check list (no NEEDS_CHECK pair).
    for (const call of checkProbeMock.mock.calls) {
      expect(call[1]).toEqual([]);
    }
  });

  it("dedupes to ONE conflict when a candidate collides with the same other via multiple pairs", async () => {
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Catch-all",
        scope: "ALL_PRODUCTS",
        scopeValue: null,
      },
    ]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand", [
      { scope: "PRODUCT", scopeValue: PT("X") },
      { scope: "PRODUCT", scopeValue: PT("Y") },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].templateId).toBe("t2");
    }
  });

  it("names one conflict PER distinct colliding template", async () => {
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "X table",
        scope: "PRODUCT",
        scopeValue: PT("X"),
      },
      {
        templateId: "t3",
        templateName: "Y table",
        scope: "PRODUCT",
        scopeValue: PT("Y"),
      },
    ]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand", [
      { scope: "PRODUCT", scopeValue: PT("X") },
      { scope: "PRODUCT", scopeValue: PT("Y") },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(new Set(result.conflicts.map((c) => c.templateId))).toEqual(
        new Set(["t2", "t3"]),
      );
  });

  // --- EXCLUDE carve-out subtraction (feature 45 Decision A, per-pair) ------

  it("resolves a conflict when the candidate is PRODUCT:X and the covering ACTIVE template excludes X", async () => {
    getSelectorsMock.mockResolvedValue([
      { scope: "PRODUCT", scopeValue: PT("1") },
    ]);
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Catch-all",
        scope: "ALL_PRODUCTS",
        scopeValue: null,
      },
    ]);
    getOthersExcludesMock.mockResolvedValue(new Map([["t2", [PT("1")]]]));

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result).toEqual({ ok: true });
  });

  it("resolves a conflict when a PRODUCT:X ACTIVE template is excluded by the broad candidate's pending carve-outs", async () => {
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Falcon table",
        scope: "PRODUCT",
        scopeValue: PT("9"),
      },
    ]);

    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      [{ scope: "ALL_PRODUCTS", scopeValue: null }],
      [PT("9")],
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
        scopeValue: PT("9"),
      },
    ]);

    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      [{ scope: "ALL_PRODUCTS", scopeValue: null }],
      [PT("8")], // a DIFFERENT product
    );

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.conflicts[0].templateName).toBe("Falcon table");
  });

  it("never resolves a broad×broad overlap, even with carve-outs present", async () => {
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
    getOthersExcludesMock.mockResolvedValue(new Map([["t2", [PT("1")]]]));

    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      [{ scope: "VENDOR", scopeValue: "Acme" }],
      [PT("1")],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts[0].templateName).toBe("Drone type");
  });

  it("resolves a PROBE-CONFIRMED cross-dimension pair via an EXCLUDE (case 1); drop it → blocks", async () => {
    const other = {
      templateId: "t2",
      templateName: "Phones type",
      scope: "PRODUCT_TYPE" as const,
      scopeValue: "Phones",
    };
    getOthersMock.mockResolvedValue([other]);
    checkProbeMock.mockResolvedValue([
      { other, reason: "id AND product_type" },
    ]);
    getOthersExcludesMock.mockResolvedValue(new Map([["t2", [PT("X")]]]));

    const resolved = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      [{ scope: "PRODUCT", scopeValue: PT("X") }],
    );
    expect(resolved).toEqual({ ok: true });

    getOthersExcludesMock.mockResolvedValue(new Map());
    const blocked = await evaluateActivationConflicts(admin, "shop_A", "cand", [
      { scope: "PRODUCT", scopeValue: PT("X") },
    ]);
    expect(blocked.ok).toBe(false);
  });

  it("multi-value probe-confirmed: exclude X only still blocks via Y", async () => {
    const other = {
      templateId: "t2",
      templateName: "Phones type",
      scope: "PRODUCT_TYPE" as const,
      scopeValue: "Phones",
    };
    getOthersMock.mockResolvedValue([other]);
    checkProbeMock.mockResolvedValue([
      { other, reason: "id AND product_type" },
    ]);
    getOthersExcludesMock.mockResolvedValue(new Map([["t2", [PT("X")]]]));

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand", [
      { scope: "PRODUCT", scopeValue: PT("X") },
      { scope: "PRODUCT", scopeValue: PT("Y") },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.conflicts[0].templateName).toBe("Phones type");
  });

  it("Decision C: an exclude does NOT resolve a self-included product (PRODUCT:X + excludes X vs PRODUCT:X)", async () => {
    // Candidate INCLUDE PRODUCT:X but also (contradictorily) excludes X. Other = PRODUCT:X.
    // The gate strips the self-included product from the carve-out set, so the pending
    // exclude must NOT resolve the overlap → block. (The action also strips it upstream.)
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Also X",
        scope: "PRODUCT",
        scopeValue: PT("X"),
      },
    ]);

    const result = await evaluateActivationConflicts(
      admin,
      "shop_A",
      "cand",
      [{ scope: "PRODUCT", scopeValue: PT("X") }],
      [PT("X")],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts[0].templateName).toBe("Also X");
  });

  it("reads the persisted candidate carve-outs when none are passed (list-surface path)", async () => {
    getSelectorsMock.mockResolvedValue([
      { scope: "ALL_PRODUCTS", scopeValue: null },
    ]);
    getOthersMock.mockResolvedValue([
      {
        templateId: "t2",
        templateName: "Falcon table",
        scope: "PRODUCT",
        scopeValue: PT("9"),
      },
    ]);
    getCandidateExcludesMock.mockResolvedValue([PT("9")]);

    const result = await evaluateActivationConflicts(admin, "shop_A", "cand");

    expect(result).toEqual({ ok: true });
    expect(getCandidateExcludesMock).toHaveBeenCalledWith("shop_A", "cand");
  });
});

describe("resolvedByExclude — pure per-pair carve-out subtraction (feature 46)", () => {
  const PT = (id: string) => `gid://shopify/Product/${id}`;
  const cs = (scope: "PRODUCT" | "VENDOR", value: string | null) => ({
    scope: scope as never,
    scopeValue: value,
  });
  const other = (
    templateId: string,
    scope: "PRODUCT" | "ALL_PRODUCTS",
    value: string | null,
  ) => ({
    templateId,
    templateName: templateId,
    scope: scope as never,
    scopeValue: value,
  });

  it("case 1: candidate PRODUCT:X and the OTHER template excludes X → resolved", () => {
    const pair = {
      cs: cs("PRODUCT", PT("X")),
      other: other("t2", "ALL_PRODUCTS", null),
    };
    expect(
      resolvedByExclude(pair, new Set(), new Map([["t2", [PT("X")]]])),
    ).toBe(true);
  });

  it("case 2: OTHER is PRODUCT:X and the candidate excludes X → resolved", () => {
    const pair = {
      cs: cs("VENDOR", "Acme"),
      other: other("t2", "PRODUCT", PT("X")),
    };
    expect(resolvedByExclude(pair, new Set([PT("X")]), new Map())).toBe(true);
  });

  it("wrong product is not resolved", () => {
    const pair = {
      cs: cs("VENDOR", "Acme"),
      other: other("t2", "PRODUCT", PT("X")),
    };
    expect(resolvedByExclude(pair, new Set([PT("Y")]), new Map())).toBe(false);
  });

  it("a broad×broad pair (neither side PRODUCT) is never resolved", () => {
    const pair = {
      cs: cs("VENDOR", "Acme"),
      other: other("t2", "ALL_PRODUCTS", null),
    };
    expect(
      resolvedByExclude(pair, new Set([PT("X")]), new Map([["t2", [PT("X")]]])),
    ).toBe(false);
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
