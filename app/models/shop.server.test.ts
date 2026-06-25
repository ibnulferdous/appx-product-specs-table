import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import type { Session } from "@shopify/shopify-app-react-router/server";
import {
  upsertShop,
  markShopUninstalled,
  setShopMetaobjectDefinitionGid,
} from "./shop.server";

// Same mocking approach as template.server.test.ts: swap the real Prisma client
// for spies so we can test the install/uninstall logic — including the P2002
// race recovery — without a database.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    shop: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../db.server", () => ({ default: prismaMock }));

beforeEach(() => {
  vi.resetAllMocks();
});

// upsertShop only reads session.shop, so a minimal session is all we need.
function fakeSession(shop: string): Session {
  return { shop } as unknown as Session;
}

const DOMAIN = "demo.myshopify.com";

describe("upsertShop", () => {
  it("returns the existing record without writing when the shop is already installed", async () => {
    const existing = {
      myshopifyDomain: DOMAIN,
      isInstalled: true,
      uninstalledAt: null,
    };
    prismaMock.shop.findUnique.mockResolvedValue(existing);

    const result = await upsertShop(fakeSession(DOMAIN));

    expect(result).toBe(existing);
    // No needless write on every authenticated request.
    expect(prismaMock.shop.upsert).not.toHaveBeenCalled();
    expect(prismaMock.shop.update).not.toHaveBeenCalled();
  });

  it("creates the shop on first install", async () => {
    prismaMock.shop.findUnique.mockResolvedValue(null);
    const created = { myshopifyDomain: DOMAIN, isInstalled: true };
    prismaMock.shop.upsert.mockResolvedValue(created);

    const result = await upsertShop(fakeSession(DOMAIN));

    expect(prismaMock.shop.upsert).toHaveBeenCalledWith({
      where: { myshopifyDomain: DOMAIN },
      update: { isInstalled: true, uninstalledAt: null },
      create: { myshopifyDomain: DOMAIN },
    });
    expect(result).toBe(created);
  });

  it("flips isInstalled back on when a previously uninstalled shop reinstalls", async () => {
    prismaMock.shop.findUnique.mockResolvedValue({
      myshopifyDomain: DOMAIN,
      isInstalled: false,
      uninstalledAt: new Date(),
    });
    const reinstalled = { myshopifyDomain: DOMAIN, isInstalled: true };
    prismaMock.shop.upsert.mockResolvedValue(reinstalled);

    const result = await upsertShop(fakeSession(DOMAIN));

    expect(prismaMock.shop.upsert).toHaveBeenCalledWith({
      where: { myshopifyDomain: DOMAIN },
      update: { isInstalled: true, uninstalledAt: null },
      create: { myshopifyDomain: DOMAIN },
    });
    expect(result).toBe(reinstalled);
  });

  it("recovers from a P2002 unique-constraint race by updating the existing row", async () => {
    prismaMock.shop.findUnique.mockResolvedValue(null);
    prismaMock.shop.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const updated = { myshopifyDomain: DOMAIN, isInstalled: true };
    prismaMock.shop.update.mockResolvedValue(updated);

    const result = await upsertShop(fakeSession(DOMAIN));

    expect(prismaMock.shop.update).toHaveBeenCalledWith({
      where: { myshopifyDomain: DOMAIN },
      data: { isInstalled: true, uninstalledAt: null },
    });
    expect(result).toBe(updated);
  });

  it("rethrows errors that are not a P2002 race", async () => {
    prismaMock.shop.findUnique.mockResolvedValue(null);
    prismaMock.shop.upsert.mockRejectedValue(new Error("connection lost"));

    await expect(upsertShop(fakeSession(DOMAIN))).rejects.toThrow(
      "connection lost",
    );
    expect(prismaMock.shop.update).not.toHaveBeenCalled();
  });
});

describe("markShopUninstalled", () => {
  it("marks only the installed record for that domain as uninstalled", async () => {
    prismaMock.shop.updateMany.mockResolvedValue({ count: 1 });

    const result = await markShopUninstalled(DOMAIN);

    expect(prismaMock.shop.updateMany).toHaveBeenCalledWith({
      where: { myshopifyDomain: DOMAIN, isInstalled: true },
      data: { isInstalled: false, uninstalledAt: expect.any(Date) },
    });
    expect(result).toEqual({ count: 1 });
  });

  it("is idempotent — a repeat webhook delivery updates nothing", async () => {
    // The `isInstalled: true` filter is what makes a second delivery a safe
    // no-op: the row is already uninstalled, so updateMany matches 0 rows.
    prismaMock.shop.updateMany.mockResolvedValue({ count: 0 });

    const result = await markShopUninstalled(DOMAIN);

    expect(prismaMock.shop.updateMany).toHaveBeenCalledWith({
      where: { myshopifyDomain: DOMAIN, isInstalled: true },
      data: { isInstalled: false, uninstalledAt: expect.any(Date) },
    });
    expect(result).toEqual({ count: 0 });
  });
});

describe("setShopMetaobjectDefinitionGid", () => {
  it("writes the definition GID scoped to the shop's own row", async () => {
    prismaMock.shop.update.mockResolvedValue({ id: "shop_A" });

    await setShopMetaobjectDefinitionGid("shop_A", "gid://shopify/Metaobject/1");

    // `update` (not `updateMany`): a vanished shop row surfaces as P2025 rather
    // than a silent no-op, since shopId came from a row loaded this request.
    expect(prismaMock.shop.update).toHaveBeenCalledWith({
      where: { id: "shop_A" },
      data: { metaobjectDefinitionGid: "gid://shopify/Metaobject/1" },
    });
  });

  it("propagates the throw when the shop row no longer exists", async () => {
    prismaMock.shop.update.mockRejectedValue(new Error("P2025"));

    await expect(
      setShopMetaobjectDefinitionGid("shop_A", "gid://x"),
    ).rejects.toThrow();
  });
});
