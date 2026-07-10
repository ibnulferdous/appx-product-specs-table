import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAssignmentForTemplate,
  setTemplateScope,
  clearTemplateScope,
  getActiveIncludeScopesExcept,
  setTemplateExcludes,
  getExcludesForTemplate,
  getActiveExcludesByTemplate,
} from "./assignment.server";

// In-memory Prisma spies (same pattern as template.server.test.ts). These tests
// assert the *query our code builds* — every read/write is scoped by shopId (the
// data model's #1 invariant) — and that the create-or-replace runs inside one
// transaction. `$transaction` is mocked to invoke its callback with a `tx` whose
// productAssignment delegates to the same spies, so the delete+create it runs are
// observable. `template.findFirst` backs the ownership gate (getTemplateByIdForShop).
const { prismaMock } = vi.hoisted(() => {
  const productAssignment = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
  };
  return {
    prismaMock: {
      template: { findFirst: vi.fn() },
      productAssignment,
      $transaction: vi.fn(
        async (
          cb: (tx: { productAssignment: typeof productAssignment }) => unknown,
        ) => cb({ productAssignment }),
      ),
    },
  };
});

vi.mock("../db.server", () => ({ default: prismaMock }));

beforeEach(() => {
  vi.resetAllMocks();
  // resetAllMocks clears the $transaction implementation too — restore it.
  prismaMock.$transaction.mockImplementation(
    async (
      cb: (tx: {
        productAssignment: typeof prismaMock.productAssignment;
      }) => unknown,
    ) => cb({ productAssignment: prismaMock.productAssignment }),
  );
});

describe("getAssignmentForTemplate — shop isolation (priority #1)", () => {
  it("reads the template's INCLUDE rule scoped by shopId", async () => {
    prismaMock.productAssignment.findFirst.mockResolvedValue(null);

    await getAssignmentForTemplate("shop_A", "t1");

    expect(prismaMock.productAssignment.findFirst).toHaveBeenCalledWith({
      where: { shopId: "shop_A", templateId: "t1", mode: "INCLUDE" },
    });
  });

  it("returns the rule when one exists", async () => {
    const rule = { id: "a1", scope: "VENDOR", scopeValue: "Apple" };
    prismaMock.productAssignment.findFirst.mockResolvedValue(rule);

    const result = await getAssignmentForTemplate("shop_A", "t1");

    expect(result).toBe(rule);
  });
});

describe("setTemplateScope", () => {
  it("rejects an invalid scope before any DB call", async () => {
    const result = await setTemplateScope("shop_A", "t1", {
      scope: "TAG", // post-MVP → invalid
      scopeValue: "sale",
    });

    expect(result).toEqual({ ok: false, error: "Invalid scope" });
    expect(prismaMock.template.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.productAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects ALL_PRODUCTS carrying a value before any DB call", async () => {
    const result = await setTemplateScope("shop_A", "t1", {
      scope: "ALL_PRODUCTS",
      scopeValue: "oops",
    });

    expect(result).toEqual({
      ok: false,
      error: "All products scope takes no value",
    });
    expect(prismaMock.productAssignment.create).not.toHaveBeenCalled();
  });

  it("blocks a cross-shop write: a foreign template reads nothing and creates nothing", async () => {
    // The template belongs to shop_A; shop_B tries to attach a rule. The
    // ownership read is shop-scoped → null → no transaction, no create.
    prismaMock.template.findFirst.mockResolvedValue(null);

    const result = await setTemplateScope("shop_B", "tmpl_owned_by_A", {
      scope: "VENDOR",
      scopeValue: "Apple",
    });

    expect(prismaMock.template.findFirst).toHaveBeenCalledWith({
      where: { id: "tmpl_owned_by_A", shopId: "shop_B" },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.productAssignment.create).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Template not found" });
  });

  it("replaces atomically: deletes existing INCLUDE rows then creates the new one, shop-scoped", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
    });
    prismaMock.productAssignment.deleteMany.mockResolvedValue({ count: 1 });
    const created = {
      id: "a2",
      scope: "PRODUCT_TYPE",
      scopeValue: "Smartphone",
    };
    prismaMock.productAssignment.create.mockResolvedValue(created);

    const result = await setTemplateScope("shop_A", "t1", {
      scope: "PRODUCT_TYPE",
      scopeValue: "  Smartphone  ", // trimmed by validateScope
    });

    // The whole replace ran inside one transaction.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Old INCLUDE rows for this template are cleared first (shop-scoped).
    expect(prismaMock.productAssignment.deleteMany).toHaveBeenCalledWith({
      where: { shopId: "shop_A", templateId: "t1", mode: "INCLUDE" },
    });
    // The new rule carries shopId + templateId + mode INCLUDE and the trimmed value.
    expect(prismaMock.productAssignment.create).toHaveBeenCalledWith({
      data: {
        shopId: "shop_A",
        templateId: "t1",
        scope: "PRODUCT_TYPE",
        scopeValue: "Smartphone",
        mode: "INCLUDE",
      },
    });
    expect(result).toEqual({ ok: true, data: created });
  });

  it("normalizes ALL_PRODUCTS to a null scopeValue", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
    });
    prismaMock.productAssignment.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.productAssignment.create.mockResolvedValue({ id: "a3" });

    await setTemplateScope("shop_A", "t1", {
      scope: "ALL_PRODUCTS",
      scopeValue: undefined,
    });

    const createArg = prismaMock.productAssignment.create.mock.calls[0][0];
    expect(createArg.data.scope).toBe("ALL_PRODUCTS");
    expect(createArg.data.scopeValue).toBeNull();
  });

  it("returns ok:false (not a throw) when the transaction fails", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
    });
    prismaMock.$transaction.mockRejectedValue(new Error("db down"));

    const result = await setTemplateScope("shop_A", "t1", {
      scope: "VENDOR",
      scopeValue: "Apple",
    });

    expect(result).toEqual({ ok: false, error: "Could not save assignment" });
  });
});

describe("getActiveIncludeScopesExcept — the dry-run comparison set", () => {
  it("reads OTHER ACTIVE templates' INCLUDE scopes, shop-scoped, excluding the candidate", async () => {
    prismaMock.productAssignment.findMany.mockResolvedValue([]);

    await getActiveIncludeScopesExcept("shop_A", "candidate");

    expect(prismaMock.productAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          shopId: "shop_A",
          mode: "INCLUDE",
          templateId: { not: "candidate" },
          template: { status: "ACTIVE" },
        },
      }),
    );
  });

  it("shapes each row as { templateId, templateName, scope, scopeValue }", async () => {
    prismaMock.productAssignment.findMany.mockResolvedValue([
      {
        templateId: "t2",
        scope: "VENDOR",
        scopeValue: "Acme",
        template: { name: "Vendor table" },
      },
      {
        templateId: "t3",
        scope: "ALL_PRODUCTS",
        scopeValue: null,
        template: { name: "Shop default" },
      },
    ]);

    const result = await getActiveIncludeScopesExcept("shop_A", "candidate");

    expect(result).toEqual([
      {
        templateId: "t2",
        templateName: "Vendor table",
        scope: "VENDOR",
        scopeValue: "Acme",
      },
      {
        templateId: "t3",
        templateName: "Shop default",
        scope: "ALL_PRODUCTS",
        scopeValue: null,
      },
    ]);
  });
});

describe("clearTemplateScope — shop isolation (priority #1)", () => {
  it("deletes only this template's INCLUDE rows, scoped by shopId", async () => {
    prismaMock.productAssignment.deleteMany.mockResolvedValue({ count: 1 });

    const result = await clearTemplateScope("shop_A", "t1");

    expect(prismaMock.productAssignment.deleteMany).toHaveBeenCalledWith({
      where: { shopId: "shop_A", templateId: "t1", mode: "INCLUDE" },
    });
    expect(result).toEqual({ ok: true, count: 1 });
  });

  it("is a no-op for a cross-shop id (count 0)", async () => {
    prismaMock.productAssignment.deleteMany.mockResolvedValue({ count: 0 });

    const result = await clearTemplateScope("shop_B", "tmpl_owned_by_A");

    expect(prismaMock.productAssignment.deleteMany).toHaveBeenCalledWith({
      where: {
        shopId: "shop_B",
        templateId: "tmpl_owned_by_A",
        mode: "INCLUDE",
      },
    });
    expect(result).toEqual({ ok: true, count: 0 });
  });
});

describe("setTemplateExcludes (feature 45)", () => {
  const P1 = "gid://shopify/Product/1";
  const P2 = "gid://shopify/Product/2";

  it("rejects a non-array before any DB call", async () => {
    const result = await setTemplateExcludes("shop_A", "t1", "nope");

    expect(result).toEqual({ ok: false, error: "Invalid excludes" });
    expect(prismaMock.template.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid (non-product) GID before any DB call", async () => {
    const result = await setTemplateExcludes("shop_A", "t1", [
      "gid://shopify/Collection/9",
    ]);

    expect(result).toEqual({
      ok: false,
      error: "Product scope requires a product ID",
    });
    expect(prismaMock.template.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("blocks a cross-shop write: a foreign template reads nothing and creates nothing", async () => {
    prismaMock.template.findFirst.mockResolvedValue(null);

    const result = await setTemplateExcludes("shop_B", "tmpl_owned_by_A", [P1]);

    expect(prismaMock.template.findFirst).toHaveBeenCalledWith({
      where: { id: "tmpl_owned_by_A", shopId: "shop_B" },
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.productAssignment.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Template not found" });
  });

  it("replaces atomically: deletes existing EXCLUDE rows then createMany the new set, shop-scoped", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
    });
    prismaMock.productAssignment.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.productAssignment.createMany.mockResolvedValue({ count: 2 });

    const result = await setTemplateExcludes("shop_A", "t1", [P1, P2]);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Only EXCLUDE rows are cleared (the INCLUDE scope survives).
    expect(prismaMock.productAssignment.deleteMany).toHaveBeenCalledWith({
      where: { shopId: "shop_A", templateId: "t1", mode: "EXCLUDE" },
    });
    expect(prismaMock.productAssignment.createMany).toHaveBeenCalledWith({
      data: [
        {
          shopId: "shop_A",
          templateId: "t1",
          scope: "PRODUCT",
          scopeValue: P1,
          mode: "EXCLUDE",
        },
        {
          shopId: "shop_A",
          templateId: "t1",
          scope: "PRODUCT",
          scopeValue: P2,
          mode: "EXCLUDE",
        },
      ],
    });
    expect(result).toEqual({ ok: true, count: 2 });
  });

  it("de-duplicates repeated GIDs", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
    });
    prismaMock.productAssignment.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.productAssignment.createMany.mockResolvedValue({ count: 1 });

    const result = await setTemplateExcludes("shop_A", "t1", [P1, P1]);

    const createArg = prismaMock.productAssignment.createMany.mock.calls[0][0];
    expect(createArg.data).toHaveLength(1);
    expect(result).toEqual({ ok: true, count: 1 });
  });

  it("clears carve-outs (empty array): deletes EXCLUDE rows, no createMany", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
    });
    prismaMock.productAssignment.deleteMany.mockResolvedValue({ count: 3 });

    const result = await setTemplateExcludes("shop_A", "t1", []);

    expect(prismaMock.productAssignment.deleteMany).toHaveBeenCalledWith({
      where: { shopId: "shop_A", templateId: "t1", mode: "EXCLUDE" },
    });
    expect(prismaMock.productAssignment.createMany).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, count: 0 });
  });

  it("returns ok:false (not a throw) when the transaction fails", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
    });
    prismaMock.$transaction.mockRejectedValue(new Error("db down"));

    const result = await setTemplateExcludes("shop_A", "t1", [P1]);

    expect(result).toEqual({ ok: false, error: "Could not save excludes" });
  });
});

describe("getExcludesForTemplate (feature 45) — shop isolation", () => {
  it("reads only this template's EXCLUDE PRODUCT rows, scoped by shopId", async () => {
    prismaMock.productAssignment.findMany.mockResolvedValue([]);

    await getExcludesForTemplate("shop_A", "t1");

    expect(prismaMock.productAssignment.findMany).toHaveBeenCalledWith({
      where: {
        shopId: "shop_A",
        templateId: "t1",
        mode: "EXCLUDE",
        scope: "PRODUCT",
      },
      select: { scopeValue: true },
    });
  });

  it("returns the GID list, filtering null scopeValues defensively", async () => {
    prismaMock.productAssignment.findMany.mockResolvedValue([
      { scopeValue: "gid://shopify/Product/1" },
      { scopeValue: null },
      { scopeValue: "gid://shopify/Product/2" },
    ]);

    const result = await getExcludesForTemplate("shop_A", "t1");

    expect(result).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/Product/2",
    ]);
  });
});

describe("getActiveExcludesByTemplate (feature 45)", () => {
  it("reads OTHER ACTIVE templates' EXCLUDE PRODUCT rows, shop-scoped, excluding the candidate", async () => {
    prismaMock.productAssignment.findMany.mockResolvedValue([]);

    await getActiveExcludesByTemplate("shop_A", "cand");

    expect(prismaMock.productAssignment.findMany).toHaveBeenCalledWith({
      where: {
        shopId: "shop_A",
        mode: "EXCLUDE",
        scope: "PRODUCT",
        templateId: { not: "cand" },
        template: { status: "ACTIVE" },
      },
      select: { templateId: true, scopeValue: true },
    });
  });

  it("groups the carve-out GIDs by templateId", async () => {
    prismaMock.productAssignment.findMany.mockResolvedValue([
      { templateId: "t2", scopeValue: "gid://shopify/Product/1" },
      { templateId: "t2", scopeValue: "gid://shopify/Product/2" },
      { templateId: "t3", scopeValue: "gid://shopify/Product/9" },
    ]);

    const result = await getActiveExcludesByTemplate("shop_A", "cand");

    expect(result).toEqual(
      new Map([
        ["t2", ["gid://shopify/Product/1", "gid://shopify/Product/2"]],
        ["t3", ["gid://shopify/Product/9"]],
      ]),
    );
  });
});
