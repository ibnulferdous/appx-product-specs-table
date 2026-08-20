import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { ScopeSelector } from "../utils/assignmentOverlap";
import { PLANS } from "../utils/billingPlans";

// The pure gate + proposed-scope shape carry all the decision logic and are tested directly. The
// live pieces (shop-total fetch, orchestrator) are exercised with mocks at the boundary, per the
// testing strategy. `getBillingState`, `resolveAssignedProductCounts`, and Prisma are mocked;
// `buildAssignedCountQuery` / `parseAssignedCountResponse` are kept real (the shop-total fetch reuses
// them), so the ./assignedProductCounts.server mock preserves the originals.

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { template: { findMany: vi.fn() } },
}));
vi.mock("../db.server", () => ({ default: prismaMock }));

const { getBillingStateMock, resolveCountsMock } = vi.hoisted(() => ({
  getBillingStateMock: vi.fn(),
  resolveCountsMock: vi.fn(),
}));
vi.mock("./billing.server", () => ({ getBillingState: getBillingStateMock }));
vi.mock("./assignedProductCounts.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./assignedProductCounts.server")>();
  return { ...actual, resolveAssignedProductCounts: resolveCountsMock };
});

import {
  evaluateCapGate,
  scopeOfSelectors,
  capBlockedMessage,
  resolveProposedScopeCount,
  evaluateAssignmentCap,
} from "./billingCap.server";

beforeEach(() => {
  vi.resetAllMocks();
});

const productSel = (gid: string): ScopeSelector => ({
  scope: "PRODUCT",
  scopeValue: gid,
});
const ALL_PRODUCTS: ScopeSelector[] = [
  { scope: "ALL_PRODUCTS", scopeValue: null },
];

// --- evaluateCapGate (pure) -------------------------------------------------

describe("evaluateCapGate", () => {
  const base = {
    cap: 25,
    otherActiveTotal: 10,
    proposedEditedCount: 5,
    storedEditedCount: 0,
    wasActive: false,
  };

  it("allows unlimited (null cap) without needing any counts", () => {
    expect(
      evaluateCapGate({
        cap: null,
        otherActiveTotal: null,
        proposedEditedCount: null,
        storedEditedCount: null,
        wasActive: true,
      }),
    ).toEqual({ determined: true, blocked: false });
  });

  it("is undetermined when the other-active total is unknown", () => {
    expect(evaluateCapGate({ ...base, otherActiveTotal: null })).toEqual({
      determined: false,
    });
  });

  it("is undetermined when the proposed count is unknown", () => {
    expect(evaluateCapGate({ ...base, proposedEditedCount: null })).toEqual({
      determined: false,
    });
  });

  it("is undetermined when an already-active template's stored count is unknown", () => {
    expect(
      evaluateCapGate({
        ...base,
        wasActive: true,
        storedEditedCount: null,
        proposedEditedCount: 100,
      }),
    ).toEqual({ determined: false });
  });

  it("allows a projected total within the cap", () => {
    expect(evaluateCapGate({ ...base, proposedEditedCount: 15 })).toEqual({
      determined: true,
      blocked: false,
    });
  });

  it("allows the exact-cap boundary (total === cap)", () => {
    // 10 other + 15 proposed = 25 == cap → allowed.
    expect(evaluateCapGate({ ...base, proposedEditedCount: 15 })).toMatchObject(
      {
        blocked: false,
      },
    );
  });

  it("blocks an increase that pushes the total past the cap", () => {
    // 10 other + 20 proposed = 30 > 25, and 30 > previous (10 + 0) → blocked.
    expect(evaluateCapGate({ ...base, proposedEditedCount: 20 })).toEqual({
      determined: true,
      blocked: true,
      cap: 25,
      projectedTotal: 30,
    });
  });

  it("does NOT block a non-increasing save even while over cap (re-save at same size)", () => {
    // Already active at 20; re-saving the same 20 → projected 30 == previous 30, not an increase.
    expect(
      evaluateCapGate({
        cap: 25,
        otherActiveTotal: 10,
        proposedEditedCount: 20,
        storedEditedCount: 20,
        wasActive: true,
      }),
    ).toEqual({ determined: true, blocked: false });
  });

  it("does NOT block a reduction while over cap (downgraded merchant pruning)", () => {
    // Already active at 20 (total 30, over cap 25); reducing to 12 → projected 22, a decrease.
    expect(
      evaluateCapGate({
        cap: 25,
        otherActiveTotal: 10,
        proposedEditedCount: 12,
        storedEditedCount: 20,
        wasActive: true,
      }),
    ).toEqual({ determined: true, blocked: false });
  });

  it("blocks growing an already-active template further past the cap", () => {
    // Active at 20 (total 30); growing to 40 → projected 50 > 30 previous and > 25 cap → blocked.
    expect(
      evaluateCapGate({
        cap: 25,
        otherActiveTotal: 10,
        proposedEditedCount: 40,
        storedEditedCount: 20,
        wasActive: true,
      }),
    ).toMatchObject({ blocked: true, projectedTotal: 50 });
  });
});

// --- scopeOfSelectors / capBlockedMessage (pure) ---------------------------

describe("scopeOfSelectors", () => {
  it("is null for an empty set (NONE), else the homogeneous kind", () => {
    expect(scopeOfSelectors([])).toBeNull();
    expect(scopeOfSelectors([productSel("gid://p/1")])).toBe("PRODUCT");
    expect(scopeOfSelectors(ALL_PRODUCTS)).toBe("ALL_PRODUCTS");
  });
});

describe("capBlockedMessage", () => {
  it("names the plan, cap, and projected total", () => {
    const msg = capBlockedMessage(PLANS.free, 25, 30);
    expect(msg).toContain("Free");
    expect(msg).toContain("25");
    expect(msg).toContain("30");
    expect(msg).toContain("Manage plan");
  });

  it("falls back to 'current' when the plan is unknown", () => {
    expect(capBlockedMessage(null, 25, 30)).toContain("current");
  });
});

// --- resolveProposedScopeCount (live, mocked admin) ------------------------

function mockAdmin(json: unknown, ok = true): AdminApiContext {
  return {
    graphql: vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: async () => json,
    }),
  } as unknown as AdminApiContext;
}

describe("resolveProposedScopeCount", () => {
  it("returns 0 for NONE (no admin call)", async () => {
    const admin = mockAdmin({});
    expect(await resolveProposedScopeCount(admin, [], 0)).toBe(0);
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("counts distinct PRODUCT selectors (no admin call)", async () => {
    const admin = mockAdmin({});
    const sels = [
      productSel("gid://p/1"),
      productSel("gid://p/2"),
      productSel("gid://p/1"), // dup
    ];
    expect(await resolveProposedScopeCount(admin, sels, 0)).toBe(2);
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("resolves ALL_PRODUCTS to shop total minus carve-outs", async () => {
    const admin = mockAdmin({ data: { shopTotal: { count: 40 } } });
    expect(await resolveProposedScopeCount(admin, ALL_PRODUCTS, 3)).toBe(37);
  });

  it("clamps ALL_PRODUCTS at zero when carve-outs exceed the total", async () => {
    const admin = mockAdmin({ data: { shopTotal: { count: 2 } } });
    expect(await resolveProposedScopeCount(admin, ALL_PRODUCTS, 5)).toBe(0);
  });

  it("returns null (unknown) when the shop-total lookup fails", async () => {
    const admin = mockAdmin({}, false);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resolveProposedScopeCount(admin, ALL_PRODUCTS, 0)).toBeNull();
    spy.mockRestore();
  });
});

// --- evaluateAssignmentCap (orchestrator, mocked deps) ---------------------

describe("evaluateAssignmentCap", () => {
  const params = (over: boolean) => ({
    admin: mockAdmin({}),
    shopId: "shop_1",
    templateId: "t_edit",
    pendingSelectors: [
      productSel("gid://p/1"),
      productSel("gid://p/2"),
      ...(over ? [productSel("gid://p/3")] : []),
    ],
    pendingExcludeCount: 0,
    wasActive: false,
  });

  it("fails open (determined:false) when billing is undetermined", async () => {
    getBillingStateMock.mockResolvedValue({
      determined: false,
      hasActiveSubscription: false,
      plan: null,
      subscriptionName: null,
    });
    const result = await evaluateAssignmentCap(params(true));
    expect(result.determined).toBe(false);
    expect(resolveCountsMock).not.toHaveBeenCalled();
  });

  it("allows unlimited (Max) with no count work", async () => {
    getBillingStateMock.mockResolvedValue({
      determined: true,
      hasActiveSubscription: true,
      plan: PLANS.max,
      subscriptionName: "Max",
    });
    const result = await evaluateAssignmentCap(params(true));
    expect(result).toMatchObject({ determined: true, blocked: false });
    expect(resolveCountsMock).not.toHaveBeenCalled();
  });

  it("blocks a determined overage on the Free cap", async () => {
    getBillingStateMock.mockResolvedValue({
      determined: true,
      hasActiveSubscription: true,
      plan: PLANS.free,
      subscriptionName: "Free",
    });
    // 24 already active on another template + 3 proposed = 27 > 25.
    resolveCountsMock.mockResolvedValue(new Map([["t_other", 24]]));
    prismaMock.template.findMany.mockResolvedValue([
      { id: "t_other" },
      { id: "t_edit" },
    ]);
    const result = await evaluateAssignmentCap(params(true));
    expect(result).toMatchObject({
      determined: true,
      blocked: true,
      cap: 25,
      projectedTotal: 27,
    });
    expect(result.plan?.id).toBe("free");
  });

  it("allows when the projected total stays within the cap", async () => {
    getBillingStateMock.mockResolvedValue({
      determined: true,
      hasActiveSubscription: true,
      plan: PLANS.free,
      subscriptionName: "Free",
    });
    resolveCountsMock.mockResolvedValue(new Map([["t_other", 10]]));
    prismaMock.template.findMany.mockResolvedValue([
      { id: "t_other" },
      { id: "t_edit" },
    ]);
    const result = await evaluateAssignmentCap(params(false)); // 10 + 2 = 12 <= 25
    expect(result).toMatchObject({ determined: true, blocked: false });
  });

  it("fails open when another active template's count is unknown", async () => {
    getBillingStateMock.mockResolvedValue({
      determined: true,
      hasActiveSubscription: true,
      plan: PLANS.free,
      subscriptionName: "Free",
    });
    resolveCountsMock.mockResolvedValue(new Map([["t_other", null]])); // Admin count failed
    prismaMock.template.findMany.mockResolvedValue([
      { id: "t_other" },
      { id: "t_edit" },
    ]);
    const result = await evaluateAssignmentCap(params(true));
    expect(result.determined).toBe(false);
  });
});
