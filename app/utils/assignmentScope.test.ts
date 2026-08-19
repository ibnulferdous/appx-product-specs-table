import { describe, it, expect } from "vitest";
import {
  ASSIGNMENT_SCOPES,
  SCOPE_NONE,
  SCOPE_OPTIONS,
  VISIBLE_SCOPE_OPTIONS,
  isScopeSetComplete,
  validateScope,
} from "./assignmentScope";

describe("validateScope", () => {
  it("accepts ALL_PRODUCTS with no value and normalizes the value to null", () => {
    expect(validateScope("ALL_PRODUCTS", undefined)).toEqual({
      ok: true,
      scope: "ALL_PRODUCTS",
      scopeValue: null,
    });
    expect(validateScope("ALL_PRODUCTS", "")).toEqual({
      ok: true,
      scope: "ALL_PRODUCTS",
      scopeValue: null,
    });
    // Whitespace-only collapses to empty -> still valid, still null.
    expect(validateScope("ALL_PRODUCTS", "   ")).toEqual({
      ok: true,
      scope: "ALL_PRODUCTS",
      scopeValue: null,
    });
  });

  it("rejects ALL_PRODUCTS carrying a value", () => {
    expect(validateScope("ALL_PRODUCTS", "anything")).toEqual({
      ok: false,
      error: "All products scope takes no value",
    });
  });

  it("accepts PRODUCT_TYPE / VENDOR free-form strings and trims them", () => {
    expect(validateScope("PRODUCT_TYPE", "  Smartphone  ")).toEqual({
      ok: true,
      scope: "PRODUCT_TYPE",
      scopeValue: "Smartphone",
    });
    expect(validateScope("VENDOR", "Apple")).toEqual({
      ok: true,
      scope: "VENDOR",
      scopeValue: "Apple",
    });
  });

  it("requires a non-empty value for the valued scopes", () => {
    for (const scope of ["PRODUCT", "PRODUCT_TYPE", "VENDOR", "COLLECTION"]) {
      expect(validateScope(scope, "")).toEqual({
        ok: false,
        error: "This scope requires a value",
      });
      expect(validateScope(scope, "   ")).toEqual({
        ok: false,
        error: "This scope requires a value",
      });
      expect(validateScope(scope, undefined).ok).toBe(false);
    }
  });

  it("accepts well-formed PRODUCT / COLLECTION GIDs", () => {
    expect(validateScope("PRODUCT", "gid://shopify/Product/123")).toEqual({
      ok: true,
      scope: "PRODUCT",
      scopeValue: "gid://shopify/Product/123",
    });
    expect(validateScope("COLLECTION", "gid://shopify/Collection/456")).toEqual(
      {
        ok: true,
        scope: "COLLECTION",
        scopeValue: "gid://shopify/Collection/456",
      },
    );
  });

  it("rejects a PRODUCT / COLLECTION value that is not the right GID shape", () => {
    expect(validateScope("PRODUCT", "123")).toEqual({
      ok: false,
      error: "Product scope requires a product ID",
    });
    // A collection GID is not a valid product value (wrong resource).
    expect(validateScope("PRODUCT", "gid://shopify/Collection/456")).toEqual({
      ok: false,
      error: "Product scope requires a product ID",
    });
    expect(validateScope("COLLECTION", "gid://shopify/Product/123")).toEqual({
      ok: false,
      error: "Collection scope requires a collection ID",
    });
  });

  it("rejects a prefix-only GID that carries no identifier", () => {
    // `startsWith` alone would accept these — a bare prefix has no resource id
    // and must not become a persisted routing key.
    expect(validateScope("PRODUCT", "gid://shopify/Product/")).toEqual({
      ok: false,
      error: "Product scope requires a product ID",
    });
    expect(validateScope("COLLECTION", "gid://shopify/Collection/")).toEqual({
      ok: false,
      error: "Collection scope requires a collection ID",
    });
  });

  it("rejects TAG (post-MVP) and any unknown scope", () => {
    expect(validateScope("TAG", "sale")).toEqual({
      ok: false,
      error: "Invalid scope",
    });
    expect(validateScope("all_products", "")).toEqual({
      ok: false,
      error: "Invalid scope",
    });
    expect(validateScope("", "").ok).toBe(false);
  });

  it("rejects a non-string scope", () => {
    expect(validateScope(undefined, "").ok).toBe(false);
    expect(validateScope(null, "").ok).toBe(false);
    expect(validateScope(1, "").ok).toBe(false);
  });
});

describe("ASSIGNMENT_SCOPES", () => {
  it("is the five MVP scopes and excludes TAG", () => {
    expect(ASSIGNMENT_SCOPES).toEqual([
      "ALL_PRODUCTS",
      "PRODUCT",
      "PRODUCT_TYPE",
      "VENDOR",
      "COLLECTION",
    ]);
    expect((ASSIGNMENT_SCOPES as readonly string[]).includes("TAG")).toBe(
      false,
    );
  });
});

describe("SCOPE_OPTIONS (feature 44 picker)", () => {
  it("leads with None, then the five scopes in ASSIGNMENT_SCOPES order", () => {
    expect(SCOPE_OPTIONS.map((option) => option.value)).toEqual([
      SCOPE_NONE,
      ...ASSIGNMENT_SCOPES,
    ]);
  });

  it("gives every option a non-empty label", () => {
    for (const option of SCOPE_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});

describe("VISIBLE_SCOPE_OPTIONS (UI-only projection: hides type/vendor/collection)", () => {
  it("exposes only None, All products, and A specific product, in order", () => {
    expect(VISIBLE_SCOPE_OPTIONS.map((option) => option.value)).toEqual([
      SCOPE_NONE,
      "ALL_PRODUCTS",
      "PRODUCT",
    ]);
  });

  it("hides PRODUCT_TYPE, VENDOR, and COLLECTION", () => {
    const values = VISIBLE_SCOPE_OPTIONS.map((option) => option.value);
    expect(values).not.toContain("PRODUCT_TYPE");
    expect(values).not.toContain("VENDOR");
    expect(values).not.toContain("COLLECTION");
  });

  it("is a subset of SCOPE_OPTIONS (source of truth stays complete)", () => {
    expect(SCOPE_OPTIONS.length).toBeGreaterThan(VISIBLE_SCOPE_OPTIONS.length);
    for (const option of VISIBLE_SCOPE_OPTIONS) {
      expect(SCOPE_OPTIONS).toContainEqual(option);
    }
  });
});

describe("isScopeSetComplete (client mirror over a value SET; UX Save-gate)", () => {
  const P = (id: string) => `gid://shopify/Product/${id}`;
  const C = (id: string) => `gid://shopify/Collection/${id}`;

  it("treats None as always complete regardless of values (it clears the rule)", () => {
    expect(isScopeSetComplete(SCOPE_NONE, [])).toBe(true);
    // A stray value under None is ignored — still complete (the action clears it).
    expect(isScopeSetComplete(SCOPE_NONE, [P("1")])).toBe(true);
  });

  it("treats ALL_PRODUCTS as complete with no values", () => {
    expect(isScopeSetComplete("ALL_PRODUCTS", [])).toBe(true);
  });

  it("is incomplete for a valued scope with an empty set", () => {
    expect(isScopeSetComplete("PRODUCT", [])).toBe(false);
    expect(isScopeSetComplete("COLLECTION", [])).toBe(false);
    expect(isScopeSetComplete("VENDOR", [])).toBe(false);
  });

  it("PRODUCT / COLLECTION accept 1..N valid values, reject any invalid member", () => {
    expect(isScopeSetComplete("PRODUCT", [P("1")])).toBe(true);
    expect(isScopeSetComplete("PRODUCT", [P("1"), P("2"), P("3")])).toBe(true);
    // One bad GID in the set fails the whole set.
    expect(isScopeSetComplete("PRODUCT", [P("1"), "not-a-gid"])).toBe(false);
    expect(isScopeSetComplete("COLLECTION", [C("1"), C("2")])).toBe(true);
    // Wrong resource kind in the set fails it.
    expect(isScopeSetComplete("COLLECTION", [C("1"), P("2")])).toBe(false);
  });

  it("TYPE / VENDOR are single-valued: exactly one validating value", () => {
    expect(isScopeSetComplete("VENDOR", ["Acme"])).toBe(true);
    expect(isScopeSetComplete("PRODUCT_TYPE", ["Snowboard"])).toBe(true);
    // Empty or an accidental N>1 set is incomplete for a single-valued kind.
    expect(isScopeSetComplete("VENDOR", [])).toBe(false);
    expect(isScopeSetComplete("VENDOR", ["Acme", "Bose"])).toBe(false);
    // A blank value doesn't validate.
    expect(isScopeSetComplete("VENDOR", [""])).toBe(false);
  });
});
