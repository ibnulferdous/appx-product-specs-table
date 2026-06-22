import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listTemplatesForShop,
  countTemplatesForShop,
  createTemplateForShop,
  getTemplateByIdForShop,
  saveTemplateForShop,
  setTemplateMetaobjectRef,
} from "./template.server";

// Replace the Prisma client (app/db.server.ts default export) with in-memory
// spies. `vi.hoisted` defines the mock before `vi.mock`'s factory runs, and
// Vitest hoists `vi.mock` above the imports so template.server picks up the mock
// instead of opening a real database connection. These tests assert the *query
// our code builds* — every read/write is scoped by shopId — which is the data
// model's #1 invariant; whether Postgres then enforces it is the DB's job.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    template: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../db.server", () => ({ default: prismaMock }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("listTemplatesForShop", () => {
  it("scopes the query to the shop and orders by most recently updated", async () => {
    prismaMock.template.findMany.mockResolvedValue([]);

    await listTemplatesForShop("shop_A");

    expect(prismaMock.template.findMany).toHaveBeenCalledWith({
      where: { shopId: "shop_A" },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("adds a status filter only when the status is a known value", async () => {
    prismaMock.template.findMany.mockResolvedValue([]);

    await listTemplatesForShop("shop_A", { status: "ACTIVE" });
    expect(prismaMock.template.findMany).toHaveBeenLastCalledWith({
      where: { shopId: "shop_A", status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    });

    // An unrecognized status is ignored — the query stays shop-scoped only.
    await listTemplatesForShop("shop_A", { status: "BOGUS" });
    expect(prismaMock.template.findMany).toHaveBeenLastCalledWith({
      where: { shopId: "shop_A" },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("derives rowCount from the rows array (non-arrays count as 0)", async () => {
    prismaMock.template.findMany.mockResolvedValue([
      { id: "t1", rows: [{}, {}, {}] },
      { id: "t2", rows: "not-an-array" },
    ]);

    const result = await listTemplatesForShop("shop_A");

    expect(result.map((t) => t.rowCount)).toEqual([3, 0]);
    expect(result.every((t) => t.assignedProductCount === 0)).toBe(true);
  });
});

describe("countTemplatesForShop", () => {
  it("counts only the shop's templates", async () => {
    prismaMock.template.count.mockResolvedValue(2);

    const count = await countTemplatesForShop("shop_A");

    expect(prismaMock.template.count).toHaveBeenCalledWith({
      where: { shopId: "shop_A" },
    });
    expect(count).toBe(2);
  });
});

describe("createTemplateForShop", () => {
  it("rejects an empty or whitespace-only name without touching the database", async () => {
    const result = await createTemplateForShop("shop_A", { name: "   " });

    expect(result).toEqual({ ok: false, error: "Name is required" });
    expect(prismaMock.template.create).not.toHaveBeenCalled();
  });

  it("treats a missing (non-string) name as required", async () => {
    const result = await createTemplateForShop("shop_A", {});

    expect(result).toEqual({ ok: false, error: "Name is required" });
    expect(prismaMock.template.create).not.toHaveBeenCalled();
  });

  it("rejects a name longer than 100 characters", async () => {
    const result = await createTemplateForShop("shop_A", {
      name: "a".repeat(101),
    });

    expect(result).toEqual({
      ok: false,
      error: "Name must be 100 characters or fewer",
    });
    expect(prismaMock.template.create).not.toHaveBeenCalled();
  });

  it("trims the name, defaults an unknown status to DRAFT, and scopes the write to the shop", async () => {
    prismaMock.template.create.mockResolvedValue({ id: "t1" });

    await createTemplateForShop("shop_A", {
      name: "  Specs  ",
      status: "NONSENSE",
    });

    expect(prismaMock.template.create).toHaveBeenCalledWith({
      data: { shopId: "shop_A", name: "Specs", status: "DRAFT", rows: [] },
    });
  });

  it("passes a valid status through to the write", async () => {
    prismaMock.template.create.mockResolvedValue({ id: "t1" });

    await createTemplateForShop("shop_A", { name: "Specs", status: "ACTIVE" });

    expect(prismaMock.template.create).toHaveBeenCalledWith({
      data: { shopId: "shop_A", name: "Specs", status: "ACTIVE", rows: [] },
    });
  });

  it("returns ok:true with the created template on success", async () => {
    const created = { id: "t1", name: "Specs" };
    prismaMock.template.create.mockResolvedValue(created);

    const result = await createTemplateForShop("shop_A", { name: "Specs" });

    expect(result).toEqual({ ok: true, data: created });
  });

  it("returns ok:false (not a thrown error) when the database write fails", async () => {
    prismaMock.template.create.mockRejectedValue(new Error("db down"));

    const result = await createTemplateForShop("shop_A", { name: "Specs" });

    expect(result).toEqual({ ok: false, error: "Could not create template" });
  });
});

describe("getTemplateByIdForShop — shop isolation (priority #1)", () => {
  it("returns null without querying when no id is provided", async () => {
    const result = await getTemplateByIdForShop("shop_A");

    expect(result).toBeNull();
    expect(prismaMock.template.findFirst).not.toHaveBeenCalled();
  });

  it("always scopes the lookup by shopId, so one shop cannot read another shop's template", async () => {
    // The template belongs to shop_A; shop_B asks for it. Because the query
    // includes shopId, the DB has no matching row for shop_B and returns null.
    prismaMock.template.findFirst.mockResolvedValue(null);

    const result = await getTemplateByIdForShop("shop_B", "tmpl_owned_by_A");

    expect(prismaMock.template.findFirst).toHaveBeenCalledWith({
      where: { id: "tmpl_owned_by_A", shopId: "shop_B" },
    });
    expect(result).toBeNull();
  });

  it("returns the template when it belongs to the requesting shop", async () => {
    const owned = { id: "t1", shopId: "shop_A", name: "Specs" };
    prismaMock.template.findFirst.mockResolvedValue(owned);

    const result = await getTemplateByIdForShop("shop_A", "t1");

    expect(prismaMock.template.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", shopId: "shop_A" },
    });
    expect(result).toBe(owned);
  });
});

describe("saveTemplateForShop", () => {
  const aRow = {
    id: "r1",
    key: "row",
    rowType: "DATA",
    label: "Battery Life",
    valueParts: [{ type: "TEXT", text: "Up to " }],
    hideWhenEmpty: true,
  };

  it("reads the template shop-scoped first (shop isolation, priority #1) and does not write when unowned", async () => {
    prismaMock.template.findFirst.mockResolvedValue(null);

    const result = await saveTemplateForShop("shop_B", "tmpl_owned_by_A", {
      rows: [aRow],
    });

    expect(prismaMock.template.findFirst).toHaveBeenCalledWith({
      where: { id: "tmpl_owned_by_A", shopId: "shop_B" },
    });
    expect(prismaMock.template.update).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Template not found" });
  });

  it("rejects an over-cap payload server-side without reading or writing", async () => {
    const tooMany = Array.from({ length: 201 }, (_, i) => ({
      ...aRow,
      id: `r${i}`,
      key: `row_${i}`,
    }));

    const result = await saveTemplateForShop("shop_A", "t1", { rows: tooMany });

    expect(result.ok).toBe(false);
    expect(prismaMock.template.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.template.update).not.toHaveBeenCalled();
  });

  it("finalizes a brand-new row's provisional key from its label and updates by id", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      rows: [], // nothing persisted yet -> r1 is provisional
    });
    prismaMock.template.update.mockResolvedValue({ id: "t1" });

    const result = await saveTemplateForShop("shop_A", "t1", { rows: [aRow] });

    expect(result.ok).toBe(true);
    const updateArg = prismaMock.template.update.mock.calls[0][0];
    // The write is shop-scoped itself (defense in depth, priority #1), not only
    // the ownership read above — `shopId` rides along as an extended where filter.
    expect(updateArg.where).toEqual({ id: "t1", shopId: "shop_A" });
    // `row` provisional key was finalized to a slug of the label.
    expect(updateArg.data.rows[0].key).toBe("battery_life");
    // name/status omitted from the payload are not written.
    expect(updateArg.data.name).toBeUndefined();
    expect(updateArg.data.status).toBeUndefined();
  });

  it("never re-derives a key already persisted, even if the label changed", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      // r1 was already finalized to `battery_life` on a prior save.
      rows: [{ ...aRow, key: "battery_life" }],
    });
    prismaMock.template.update.mockResolvedValue({ id: "t1" });

    // Client sends a stale provisional key AND a relabel.
    await saveTemplateForShop("shop_A", "t1", {
      rows: [{ ...aRow, key: "row", label: "Cell Life" }],
    });

    const updateArg = prismaMock.template.update.mock.calls[0][0];
    expect(updateArg.data.rows[0].key).toBe("battery_life");
  });

  it("validates and writes name + status when provided", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      rows: [],
    });
    prismaMock.template.update.mockResolvedValue({ id: "t1" });

    await saveTemplateForShop("shop_A", "t1", {
      rows: [],
      name: "  Renamed  ",
      status: "ACTIVE",
    });

    const updateArg = prismaMock.template.update.mock.calls[0][0];
    expect(updateArg.data.name).toBe("Renamed");
    expect(updateArg.data.status).toBe("ACTIVE");
  });

  it("rejects an invalid name without writing", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      rows: [],
    });

    const result = await saveTemplateForShop("shop_A", "t1", {
      rows: [],
      name: "   ",
    });

    expect(result).toEqual({ ok: false, error: "Name is required" });
    expect(prismaMock.template.update).not.toHaveBeenCalled();
  });

  it("returns ok:false (not a throw) when the write fails", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      rows: [],
    });
    prismaMock.template.update.mockRejectedValue(new Error("db down"));

    const result = await saveTemplateForShop("shop_A", "t1", { rows: [] });

    expect(result).toEqual({ ok: false, error: "Could not save template" });
  });
});

describe("setTemplateMetaobjectRef", () => {
  it("writes the GID + handle scoped to the shop's own template", async () => {
    prismaMock.template.updateMany.mockResolvedValue({ count: 1 });

    await setTemplateMetaobjectRef(
      "shop_A",
      "t1",
      "gid://shopify/Metaobject/9",
      "template-t1",
    );

    expect(prismaMock.template.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", shopId: "shop_A" },
      data: {
        shopifyMetaobjectGid: "gid://shopify/Metaobject/9",
        shopifyMetaobjectHandle: "template-t1",
      },
    });
  });
});
