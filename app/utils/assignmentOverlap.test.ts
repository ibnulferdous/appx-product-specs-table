import { describe, it, expect } from "vitest";
import {
  classifyScopePair,
  partitionOverlaps,
  type ScopeSelector,
} from "./assignmentOverlap";

// Terse constructors for the matrix.
const all: ScopeSelector = { scope: "ALL_PRODUCTS", scopeValue: null };
const product = (gid: string): ScopeSelector => ({
  scope: "PRODUCT",
  scopeValue: gid,
});
const type = (t: string): ScopeSelector => ({
  scope: "PRODUCT_TYPE",
  scopeValue: t,
});
const vendor = (v: string): ScopeSelector => ({
  scope: "VENDOR",
  scopeValue: v,
});
const collection = (gid: string): ScopeSelector => ({
  scope: "COLLECTION",
  scopeValue: gid,
});

const kind = (a: ScopeSelector, b: ScopeSelector) =>
  classifyScopePair(a, b).kind;

describe("classifyScopePair — the matrix", () => {
  it("ALL_PRODUCTS overlaps every scope, including a second ALL_PRODUCTS", () => {
    expect(kind(all, all)).toBe("OVERLAP");
    expect(kind(all, product("gid://shopify/Product/1"))).toBe("OVERLAP");
    expect(kind(all, type("Phone"))).toBe("OVERLAP");
    expect(kind(all, vendor("Apple"))).toBe("OVERLAP");
    expect(kind(all, collection("gid://shopify/Collection/1"))).toBe("OVERLAP");
    // …and from the other side (rule 1 checks both operands).
    expect(kind(type("Phone"), all)).toBe("OVERLAP");
  });

  it("single-valued same scope: same value OVERLAP, different value DISJOINT", () => {
    expect(
      kind(
        product("gid://shopify/Product/1"),
        product("gid://shopify/Product/1"),
      ),
    ).toBe("OVERLAP");
    expect(
      kind(
        product("gid://shopify/Product/1"),
        product("gid://shopify/Product/2"),
      ),
    ).toBe("DISJOINT");

    expect(kind(type("Phone"), type("Phone"))).toBe("OVERLAP");
    expect(kind(type("Phone"), type("Tablet"))).toBe("DISJOINT");

    expect(kind(vendor("Apple"), vendor("Apple"))).toBe("OVERLAP");
    expect(kind(vendor("Apple"), vendor("Samsung"))).toBe("DISJOINT");
  });

  it("COLLECTION same scope: same GID OVERLAP, different GID NEEDS_CHECK (multi-valued)", () => {
    expect(
      kind(
        collection("gid://shopify/Collection/1"),
        collection("gid://shopify/Collection/1"),
      ),
    ).toBe("OVERLAP");
    expect(
      kind(
        collection("gid://shopify/Collection/1"),
        collection("gid://shopify/Collection/2"),
      ),
    ).toBe("NEEDS_CHECK");
  });

  it("every cross-dimension pair is NEEDS_CHECK", () => {
    const p = product("gid://shopify/Product/1");
    const t = type("Phone");
    const v = vendor("Apple");
    const c = collection("gid://shopify/Collection/1");

    expect(kind(p, t)).toBe("NEEDS_CHECK");
    expect(kind(p, v)).toBe("NEEDS_CHECK");
    expect(kind(p, c)).toBe("NEEDS_CHECK");
    expect(kind(t, v)).toBe("NEEDS_CHECK");
    expect(kind(t, c)).toBe("NEEDS_CHECK");
    expect(kind(v, c)).toBe("NEEDS_CHECK");
  });
});

describe("classifyScopePair — invariants", () => {
  // A representative selector for every scope, with a couple of distinct values
  // where value matters, so the sweep hits same-value and different-value branches.
  const universe: ScopeSelector[] = [
    all,
    product("gid://shopify/Product/1"),
    product("gid://shopify/Product/2"),
    type("Phone"),
    type("Tablet"),
    vendor("Apple"),
    vendor("Samsung"),
    collection("gid://shopify/Collection/1"),
    collection("gid://shopify/Collection/2"),
  ];

  it("is symmetric in kind across the whole universe", () => {
    for (const a of universe) {
      for (const b of universe) {
        expect(classifyScopePair(a, b).kind).toBe(classifyScopePair(b, a).kind);
      }
    }
  });

  it("never emits a NEEDS_CHECK selector containing ALL_PRODUCTS", () => {
    for (const a of universe) {
      for (const b of universe) {
        const verdict = classifyScopePair(a, b);
        if (verdict.kind === "NEEDS_CHECK") {
          for (const selector of verdict.selectors) {
            expect(selector.scope).not.toBe("ALL_PRODUCTS");
          }
        }
      }
    }
  });

  it("carries both selectors (in candidate,other order) on NEEDS_CHECK", () => {
    const verdict = classifyScopePair(type("Phone"), vendor("Apple"));
    expect(verdict).toEqual({
      kind: "NEEDS_CHECK",
      selectors: [type("Phone"), vendor("Apple")],
    });
  });
});

describe("partitionOverlaps", () => {
  // The `other` entries extend ScopeSelector with a template identity so the
  // caller (feature 42) can name a collision.
  type OtherTemplate = ScopeSelector & { id: string; name: string };
  const candidate: ScopeSelector = {
    scope: "PRODUCT_TYPE",
    scopeValue: "Phone",
  };

  const others: OtherTemplate[] = [
    {
      id: "t_overlap",
      name: "Same type",
      scope: "PRODUCT_TYPE",
      scopeValue: "Phone",
    }, // OVERLAP
    {
      id: "t_disjoint",
      name: "Other type",
      scope: "PRODUCT_TYPE",
      scopeValue: "Tablet",
    }, // DISJOINT
    { id: "t_all", name: "Default", scope: "ALL_PRODUCTS", scopeValue: null }, // OVERLAP
    { id: "t_check", name: "A vendor", scope: "VENDOR", scopeValue: "Apple" }, // NEEDS_CHECK
  ];

  it("buckets OVERLAP → blocking, NEEDS_CHECK → needsCheck, drops DISJOINT", () => {
    const { blocking, needsCheck } = partitionOverlaps(candidate, others);

    expect(blocking.map((o) => o.id)).toEqual(["t_overlap", "t_all"]);
    expect(needsCheck.map((n) => n.other.id)).toEqual(["t_check"]);
    // The disjoint template appears in neither bucket.
    expect(
      [...blocking, ...needsCheck.map((n) => n.other)].map((o) => o.id),
    ).not.toContain("t_disjoint");
  });

  it("preserves the other template + selectors for messaging / probing", () => {
    const { blocking, needsCheck } = partitionOverlaps(candidate, others);

    // Blocking keeps the full template object (name available for the conflict copy).
    expect(blocking[0]).toMatchObject({ id: "t_overlap", name: "Same type" });
    // NeedsCheck carries the other template AND the two selectors to AND together.
    expect(needsCheck[0].other).toMatchObject({ id: "t_check" });
    expect(needsCheck[0].selectors).toEqual([
      candidate,
      { id: "t_check", name: "A vendor", scope: "VENDOR", scopeValue: "Apple" },
    ]);
  });

  it("returns empty buckets for an empty others list", () => {
    expect(partitionOverlaps(candidate, [])).toEqual({
      blocking: [],
      needsCheck: [],
    });
  });
});
