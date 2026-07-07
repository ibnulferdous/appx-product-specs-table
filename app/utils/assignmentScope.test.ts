import { describe, it, expect } from "vitest";
import { ASSIGNMENT_SCOPES, validateScope } from "./assignmentScope";

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
