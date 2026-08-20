import { describe, expect, it } from "vitest";

import {
  PLANS,
  PLAN_LIST,
  isWithinCap,
  planCap,
  planFromSubscriptionName,
  remainingCapacity,
} from "./billingPlans";

describe("billingPlans — plan table", () => {
  it("carries the four decided launch tiers, cheapest first", () => {
    expect(PLAN_LIST.map((p) => p.id)).toEqual(["free", "go", "plus", "max"]);
  });

  it("prices and caps match the pricing decision", () => {
    expect(PLANS.free).toMatchObject({
      priceUsd: 0,
      productCap: 25,
      trialDays: 0,
    });
    expect(PLANS.go).toMatchObject({
      priceUsd: 4.99,
      productCap: 250,
      trialDays: 60,
    });
    expect(PLANS.plus).toMatchObject({
      priceUsd: 9.99,
      productCap: 1000,
      trialDays: 60,
    });
    expect(PLANS.max).toMatchObject({
      priceUsd: 14.99,
      productCap: null,
      trialDays: 60,
    });
  });

  it("only the permanent Free tier has a zero-day trial", () => {
    expect(PLANS.free.trialDays).toBe(0);
    for (const p of [PLANS.go, PLANS.plus, PLANS.max]) {
      expect(p.trialDays).toBe(60);
    }
  });
});

describe("planFromSubscriptionName", () => {
  it("matches the exact Display name", () => {
    expect(planFromSubscriptionName("Go")?.id).toBe("go");
    expect(planFromSubscriptionName("Max")?.id).toBe("max");
  });

  it("is case-insensitive and trims surrounding whitespace", () => {
    expect(planFromSubscriptionName("  free ")?.id).toBe("free");
    expect(planFromSubscriptionName("PLUS")?.id).toBe("plus");
  });

  it("returns null for an unknown name, empty string, null, or undefined", () => {
    expect(planFromSubscriptionName("Enterprise")).toBeNull();
    expect(planFromSubscriptionName("")).toBeNull();
    expect(planFromSubscriptionName(null)).toBeNull();
    expect(planFromSubscriptionName(undefined)).toBeNull();
  });
});

describe("planCap — fail-safe fallback", () => {
  it("returns each plan's own cap", () => {
    expect(planCap(PLANS.free)).toBe(25);
    expect(planCap(PLANS.go)).toBe(250);
    expect(planCap(PLANS.plus)).toBe(1000);
    expect(planCap(PLANS.max)).toBeNull();
  });

  it("falls back to the Free cap — never unlimited — for an absent/unknown plan", () => {
    expect(planCap(null)).toBe(25);
    expect(planCap(planFromSubscriptionName("Enterprise"))).toBe(25);
  });
});

describe("isWithinCap", () => {
  it("allows counts up to and including the cap", () => {
    expect(isWithinCap(PLANS.free, 24)).toBe(true);
    expect(isWithinCap(PLANS.free, 25)).toBe(true);
  });

  it("rejects counts over the cap", () => {
    expect(isWithinCap(PLANS.free, 26)).toBe(false);
    expect(isWithinCap(PLANS.go, 251)).toBe(false);
  });

  it("treats a null (unlimited) cap as always within", () => {
    expect(isWithinCap(PLANS.max, 1)).toBe(true);
    expect(isWithinCap(PLANS.max, 10_000_000)).toBe(true);
  });

  it("applies the Free fallback cap to an unknown plan", () => {
    const unknown = planFromSubscriptionName("Enterprise");
    expect(isWithinCap(unknown, 25)).toBe(true);
    expect(isWithinCap(unknown, 26)).toBe(false);
  });
});

describe("remainingCapacity", () => {
  it("returns the gap between cap and current count", () => {
    expect(remainingCapacity(PLANS.go, 200)).toBe(50);
    expect(remainingCapacity(PLANS.free, 0)).toBe(25);
  });

  it("clamps to zero when usage meets or exceeds the cap (e.g. after a downgrade)", () => {
    expect(remainingCapacity(PLANS.free, 25)).toBe(0);
    expect(remainingCapacity(PLANS.free, 40)).toBe(0);
  });

  it("returns null for an unlimited plan", () => {
    expect(remainingCapacity(PLANS.max, 5000)).toBeNull();
  });
});
