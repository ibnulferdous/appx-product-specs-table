import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import type { Session } from "@shopify/shopify-app-react-router/server";
import { upsertShop, markShopUninstalled, eraseShopData } from "./shop.server";

// Same mocking approach as template.server.test.ts: swap the real Prisma client
// for spies so we can test the install/uninstall logic — including the P2002
// race recovery — without a database.
//
// 🔴 `shop.delete` IS OMITTED ON PURPOSE (step 105). `eraseShopData` must use
// `deleteMany`, which returns `{ count: 0 }` on an absent row where `delete`
// throws P2025 — and Shopify retries every non-200, so a throwing handler is an
// infinite redelivery loop. If a future edit swaps the two, the call lands on
// `undefined` and the whole describe block dies with a TypeError: louder than a
// failed assertion, and not satisfiable by updating an expectation.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    shop: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
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

// Step 105 — `context/features/105-privacy-webhook-domain-and-erase.md`.
// The `shop/redact` erase path: one guarded delete that cascades across five
// tables, plus the session sweep no cascade reaches.
describe("eraseShopData", () => {
  const OTHER_DOMAIN = "someone-else.myshopify.com";

  it("erases an uninstalled shop and sweeps its sessions", async () => {
    prismaMock.shop.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.session.deleteMany.mockResolvedValue({ count: 2 });

    const result = await eraseShopData(DOMAIN);

    expect(prismaMock.shop.deleteMany).toHaveBeenCalledWith({
      where: { myshopifyDomain: DOMAIN, isInstalled: false },
    });
    expect(prismaMock.session.deleteMany).toHaveBeenCalledWith({
      where: { shop: DOMAIN },
    });
    expect(result).toEqual({ erased: true, sessionsDeleted: 2 });
  });

  it("names only the target shop in every where clause", async () => {
    // 🔴 Priority-#1 boundary from CLAUDE.md, at the one place in the app that
    // deletes across five tables at once. A `where` that widened here would take
    // another merchant's entire catalogue of templates with it.
    prismaMock.shop.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });

    await eraseShopData(DOMAIN);

    const shopWhere = prismaMock.shop.deleteMany.mock.calls[0][0].where;
    const sessionWhere = prismaMock.session.deleteMany.mock.calls[0][0].where;

    expect(shopWhere.myshopifyDomain).toBe(DOMAIN);
    expect(shopWhere.myshopifyDomain).not.toBe(OTHER_DOMAIN);
    expect(sessionWhere.shop).toBe(DOMAIN);
    // Serialized so this catches a stray `OR` / `in` / `contains` clause too,
    // not just a swapped top-level field.
    expect(JSON.stringify(shopWhere)).not.toContain(OTHER_DOMAIN);
    expect(JSON.stringify(sessionWhere)).not.toContain(OTHER_DOMAIN);
  });

  it("declines to erase a shop that has been reinstalled", async () => {
    // 🔴 A MOCKED PRISMA CANNOT ENFORCE A WHERE CLAUSE — mutation M2 proved it.
    // `deleteMany` returns whatever the mock says no matter what it was asked,
    // so dropping `isInstalled: false` from the query leaves this test's
    // count-0 → "still-installed" branch passing untouched. Postgres is the only
    // thing that can actually apply the guard, and it is not in this test.
    //
    // So this test asserts BOTH halves separately: that the guard was written
    // into the query (structural — the only coverage available here), and that
    // a zero count is classified correctly (behavioural). Without the first
    // assertion the test's name would be a claim it does not check.
    prismaMock.shop.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.shop.findUnique.mockResolvedValue({ id: "shop_1" });

    const result = await eraseShopData(DOMAIN);

    expect(prismaMock.shop.deleteMany).toHaveBeenCalledWith({
      where: { myshopifyDomain: DOMAIN, isInstalled: false },
    });
    expect(result).toEqual({ erased: false, reason: "still-installed" });
  });

  it("classifies the outcome with an UNFILTERED read", async () => {
    // 🔴 Found by an accident during mutation testing, not by design: a careless
    // sed added `isInstalled: false` to this read too, and nothing failed. The
    // guard belongs on the DELETE only. On the read it inverts the log line — a
    // still-installed shop would match nothing and be reported as `not-found`,
    // which is the exact opposite of what happened.
    prismaMock.shop.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.shop.findUnique.mockResolvedValue({ id: "shop_1" });

    await eraseShopData(DOMAIN);

    const where = prismaMock.shop.findUnique.mock.calls[0][0].where;
    expect(where).toEqual({ myshopifyDomain: DOMAIN });
    expect(where).not.toHaveProperty("isInstalled");
  });

  it("does not touch sessions when it declines to erase", async () => {
    // 🔴 The assertion that stops a reinstalled merchant being logged out by a
    // redaction we just decided not to perform.
    prismaMock.shop.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.shop.findUnique.mockResolvedValue({ id: "shop_1" });

    await eraseShopData(DOMAIN);

    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
  });

  it("reports an unknown shop without throwing", async () => {
    prismaMock.shop.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.shop.findUnique.mockResolvedValue(null);

    const result = await eraseShopData(DOMAIN);

    expect(result).toEqual({ erased: false, reason: "not-found" });
    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
  });

  it("is idempotent — a redelivery erases once and then reports not-found", async () => {
    prismaMock.shop.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prismaMock.session.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.shop.findUnique.mockResolvedValue(null);

    const first = await eraseShopData(DOMAIN);
    const second = await eraseShopData(DOMAIN);

    expect(first).toEqual({ erased: true, sessionsDeleted: 1 });
    expect(second).toEqual({ erased: false, reason: "not-found" });
  });

  it("does not read the shop back on the happy path", async () => {
    // The guard lives in the where clause, so the successful case is exactly one
    // statement. A findUnique here would mean the read-then-delete shape came
    // back, and with it the reinstall race it opens.
    prismaMock.shop.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });

    await eraseShopData(DOMAIN);

    expect(prismaMock.shop.findUnique).not.toHaveBeenCalled();
  });
});
