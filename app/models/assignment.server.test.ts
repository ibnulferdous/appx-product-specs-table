import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAssignmentForTemplate,
  setTemplateScope,
  clearTemplateScope,
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
    deleteMany: vi.fn(),
    create: vi.fn(),
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
