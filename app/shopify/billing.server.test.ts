import { describe, it, expect, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import {
  storeHandleFromShop,
  planSelectionUrl,
  parseActiveSubscriptions,
  resolveBillingState,
  getBillingState,
  BillingResponseError,
  type ActiveSubscription,
} from "./billing.server";

// The URL builder, response narrower, and plan resolver are pure and tested directly; the
// live `admin.graphql` runner is exercised with a mock at the boundary (testing strategy).

// --- storeHandleFromShop / planSelectionUrl --------------------------------

describe("storeHandleFromShop", () => {
  it("strips the .myshopify.com suffix", () => {
    expect(storeHandleFromShop("cool-shop.myshopify.com")).toBe("cool-shop");
  });

  it("is case-insensitive on the suffix and leaves a bare handle untouched", () => {
    expect(storeHandleFromShop("Cool-Shop.MyShopify.Com")).toBe("Cool-Shop");
    expect(storeHandleFromShop("cool-shop")).toBe("cool-shop");
  });
});

describe("planSelectionUrl", () => {
  it("builds the hosted plan-selection URL from store handle + app handle", () => {
    expect(planSelectionUrl("cool-shop.myshopify.com", "appx-specs")).toBe(
      "https://admin.shopify.com/store/cool-shop/charges/appx-specs/pricing_plans",
    );
  });
});

// --- parseActiveSubscriptions ----------------------------------------------

describe("parseActiveSubscriptions", () => {
  it("narrows a well-formed response", () => {
    const subs = parseActiveSubscriptions({
      data: {
        currentAppInstallation: {
          activeSubscriptions: [
            {
              id: "gid://shopify/AppSubscription/1",
              name: "Go",
              status: "ACTIVE",
              test: false,
            },
          ],
        },
      },
    });
    expect(subs).toEqual([
      {
        id: "gid://shopify/AppSubscription/1",
        name: "Go",
        status: "ACTIVE",
        test: false,
      },
    ]);
  });

  it("returns [] for a valid response with an empty subscription list", () => {
    expect(
      parseActiveSubscriptions({
        data: { currentAppInstallation: { activeSubscriptions: [] } },
      }),
    ).toEqual([]);
  });

  it("throws on a structurally malformed body (distinct from a valid empty list)", () => {
    // A malformed 200 is a FAILURE to determine state, not a successful "no subscription".
    expect(() => parseActiveSubscriptions({ data: {} })).toThrow();
    expect(() =>
      parseActiveSubscriptions({ data: { currentAppInstallation: {} } }),
    ).toThrow();
    expect(() =>
      parseActiveSubscriptions({
        data: { currentAppInstallation: { activeSubscriptions: null } },
      }),
    ).toThrow();
    expect(() => parseActiveSubscriptions(null)).toThrow();
    expect(() => parseActiveSubscriptions("nonsense")).toThrow();
  });

  it("throws on an entry missing an id or name (fail closed, not dropped)", () => {
    // Dropping a malformed entry could collapse an only-malformed response to [], which reads as
    // a genuine "no subscription" and would eject a PAYING merchant. It must fail to
    // determined:false instead (CodeRabbit PR #28, Major).
    expect(() =>
      parseActiveSubscriptions({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [{ name: "Go" }], // no id
          },
        },
      }),
    ).toThrow(BillingResponseError);
    expect(() =>
      parseActiveSubscriptions({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [{ id: "gid://shopify/AppSubscription/2" }], // no name
          },
        },
      }),
    ).toThrow(BillingResponseError);
    // A malformed entry throws even when a valid one is also present — the whole response is
    // untrustworthy, so we fail to determine rather than partially parse.
    expect(() =>
      parseActiveSubscriptions({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [
              { id: "gid://shopify/AppSubscription/3", name: "Plus" },
              { name: "Go" }, // no id
            ],
          },
        },
      }),
    ).toThrow(BillingResponseError);
  });
});

// --- resolveBillingState ----------------------------------------------------

const sub = (name: string): ActiveSubscription => ({
  id: `gid://shopify/AppSubscription/${name}`,
  name,
  status: "ACTIVE",
  test: false,
});

describe("resolveBillingState", () => {
  it("reports no active subscription for an empty list", () => {
    expect(resolveBillingState([])).toEqual({
      hasActiveSubscription: false,
      plan: null,
      subscriptionName: null,
      determined: true,
    });
  });

  it("resolves a known plan by name (Free counts as active)", () => {
    const state = resolveBillingState([sub("Free")]);
    expect(state.hasActiveSubscription).toBe(true);
    expect(state.plan?.id).toBe("free");
    expect(state.subscriptionName).toBe("Free");
    expect(state.determined).toBe(true);
  });

  it("is active but plan null for an unrecognized subscription name", () => {
    const state = resolveBillingState([sub("Legacy Enterprise")]);
    expect(state.hasActiveSubscription).toBe(true);
    expect(state.plan).toBeNull();
    expect(state.subscriptionName).toBe("Legacy Enterprise");
  });

  it("prefers a name-matching subscription over an unrecognized one", () => {
    const state = resolveBillingState([sub("Legacy"), sub("Max")]);
    expect(state.plan?.id).toBe("max");
    expect(state.subscriptionName).toBe("Max");
  });
});

// --- getBillingState (live runner, mocked admin) ---------------------------

function mockAdmin(json: unknown, ok = true): AdminApiContext {
  return {
    graphql: vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: async () => json,
    }),
  } as unknown as AdminApiContext;
}

describe("getBillingState", () => {
  it("resolves the active plan from a successful query", async () => {
    const admin = mockAdmin({
      data: {
        currentAppInstallation: {
          activeSubscriptions: [
            {
              id: "gid://shopify/AppSubscription/9",
              name: "Plus",
              status: "ACTIVE",
            },
          ],
        },
      },
    });
    const state = await getBillingState(admin);
    expect(state).toMatchObject({
      hasActiveSubscription: true,
      determined: true,
    });
    expect(state.plan?.id).toBe("plus");
  });

  it("reports a determined absence when there are no active subscriptions", async () => {
    const admin = mockAdmin({
      data: { currentAppInstallation: { activeSubscriptions: [] } },
    });
    const state = await getBillingState(admin);
    expect(state).toEqual({
      hasActiveSubscription: false,
      plan: null,
      subscriptionName: null,
      determined: true,
    });
  });

  it("reports determined:false on a malformed HTTP 200 body (loader must not redirect)", async () => {
    // Structurally-invalid success body: must fail open, NOT redirect as if unsubscribed.
    const admin = mockAdmin({ data: {} });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await getBillingState(admin);
    expect(state.determined).toBe(false);
    expect(state.hasActiveSubscription).toBe(false);
    spy.mockRestore();
  });

  it("reports determined:false on a valid envelope with an invalid subscription record", async () => {
    // A 200 whose activeSubscriptions array holds only a malformed entry (no id/name) must NOT
    // collapse to "unsubscribed" and redirect a paying merchant — it fails open (CodeRabbit #28).
    const admin = mockAdmin({
      data: {
        currentAppInstallation: {
          activeSubscriptions: [{ status: "ACTIVE", test: false }], // no id, no name
        },
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await getBillingState(admin);
    expect(state.determined).toBe(false);
    expect(state.hasActiveSubscription).toBe(false);
    spy.mockRestore();
  });

  it("reports determined:false on an HTTP error (loader must not redirect)", async () => {
    const admin = mockAdmin({}, false);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await getBillingState(admin);
    expect(state.determined).toBe(false);
    expect(state.hasActiveSubscription).toBe(false);
    spy.mockRestore();
  });

  it("reports determined:false on GraphQL errors in the body", async () => {
    const admin = mockAdmin({ errors: [{ message: "boom" }] });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await getBillingState(admin);
    expect(state.determined).toBe(false);
    spy.mockRestore();
  });

  it("reports determined:false when the request throws", async () => {
    const admin = {
      graphql: vi.fn().mockRejectedValue(new Error("network down")),
    } as unknown as AdminApiContext;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await getBillingState(admin);
    expect(state.determined).toBe(false);
    spy.mockRestore();
  });
});
