import { describe, it, expect, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { ScopeSelector, NeedsCheck } from "../utils/assignmentOverlap";
import {
  buildScopeFragment,
  buildExistenceQuery,
  hasMatchingProduct,
  checkCrossDimensionConflicts,
  type ConfirmedConflict,
} from "./assignmentConflict.server";

// The pure query builder + response narrower are unit-tested directly; the live
// `admin.graphql` runner is exercised with a mocked client at the boundary (per
// the testing strategy — test the pure parts, mock at the boundary).

const sel = (
  scope: ScopeSelector["scope"],
  scopeValue: string | null,
): ScopeSelector => ({ scope, scopeValue });

describe("buildScopeFragment", () => {
  it("renders single-valued string scopes as quoted search terms", () => {
    expect(buildScopeFragment(sel("PRODUCT_TYPE", "Phones"))).toBe(
      "product_type:'Phones'",
    );
    expect(buildScopeFragment(sel("VENDOR", "Acme"))).toBe("vendor:'Acme'");
  });

  it("renders COLLECTION / PRODUCT as numeric ids extracted from the GID", () => {
    expect(
      buildScopeFragment(sel("COLLECTION", "gid://shopify/Collection/123")),
    ).toBe("collection_id:123");
    expect(
      buildScopeFragment(sel("PRODUCT", "gid://shopify/Product/456")),
    ).toBe("id:456");
  });

  it("escapes single quotes and backslashes in merchant strings (injection-safe)", () => {
    expect(buildScopeFragment(sel("VENDOR", "O'Neil"))).toBe(
      "vendor:'O\\'Neil'",
    );
    expect(buildScopeFragment(sel("PRODUCT_TYPE", "a\\b"))).toBe(
      "product_type:'a\\\\b'",
    );
    // A stray boolean operator stays inside the quotes — it can't widen the query.
    expect(buildScopeFragment(sel("VENDOR", "x' OR vendor:'y"))).toBe(
      "vendor:'x\\' OR vendor:\\'y'",
    );
  });

  it("throws on ALL_PRODUCTS (unreachable guard)", () => {
    expect(() => buildScopeFragment(sel("ALL_PRODUCTS", null))).toThrow(
      /ALL_PRODUCTS/,
    );
  });

  it("throws on a missing value for a valued scope", () => {
    expect(() => buildScopeFragment(sel("VENDOR", null))).toThrow(
      /requires a value/,
    );
    expect(() => buildScopeFragment(sel("VENDOR", ""))).toThrow(
      /requires a value/,
    );
  });

  it("throws on a malformed GID (wrong type or non-numeric id)", () => {
    expect(() =>
      buildScopeFragment(sel("PRODUCT", "gid://shopify/Collection/1")),
    ).toThrow(/Expected a Product GID/);
    expect(() =>
      buildScopeFragment(sel("COLLECTION", "gid://shopify/Collection/abc")),
    ).toThrow(/non-numeric/);
  });
});

describe("buildExistenceQuery", () => {
  it("ANDs a cross-dimension pair (type × vendor)", () => {
    expect(
      buildExistenceQuery(sel("PRODUCT_TYPE", "Phones"), sel("VENDOR", "Acme")),
    ).toBe("product_type:'Phones' AND vendor:'Acme'");
  });

  it("ANDs a product × collection pair", () => {
    expect(
      buildExistenceQuery(
        sel("PRODUCT", "gid://shopify/Product/456"),
        sel("COLLECTION", "gid://shopify/Collection/123"),
      ),
    ).toBe("id:456 AND collection_id:123");
  });

  it("ANDs two different collection rules (multi-valued same-scope)", () => {
    expect(
      buildExistenceQuery(
        sel("COLLECTION", "gid://shopify/Collection/1"),
        sel("COLLECTION", "gid://shopify/Collection/2"),
      ),
    ).toBe("collection_id:1 AND collection_id:2");
  });
});

describe("hasMatchingProduct", () => {
  const productsResponse = (edges: unknown[]) => ({
    data: { products: { edges } },
  });

  it("is true when at least one edge is present", () => {
    expect(
      hasMatchingProduct(
        productsResponse([{ node: { id: "gid://shopify/Product/1" } }]),
      ),
    ).toBe(true);
  });

  it("is false for a successful empty response", () => {
    expect(hasMatchingProduct(productsResponse([]))).toBe(false);
  });

  it("is false for a malformed / absent shape", () => {
    expect(hasMatchingProduct(null)).toBe(false);
    expect(hasMatchingProduct({})).toBe(false);
    expect(hasMatchingProduct({ data: {} })).toBe(false);
    expect(hasMatchingProduct({ data: { products: {} } })).toBe(false);
  });
});

describe("checkCrossDimensionConflicts", () => {
  // A minimal mock of the admin client: only `graphql` is used. Each call
  // resolves to a fetch-like Response with `ok` / `status` / `json`.
  function mockAdmin(
    handler: (query: string) => {
      ok?: boolean;
      status?: number;
      body: unknown;
    },
  ): { admin: AdminApiContext; graphql: ReturnType<typeof vi.fn> } {
    const graphql = vi.fn(
      async (_op: string, opts: { variables: { query: string } }) => {
        const { ok = true, status = 200, body } = handler(opts.variables.query);
        return {
          ok,
          status,
          json: async () => body,
        };
      },
    );
    return { admin: { graphql } as unknown as AdminApiContext, graphql };
  }

  // Tag `other` with an id so we can assert which pair was confirmed.
  type Tagged = ScopeSelector & { id: string };
  const needs = (
    id: string,
    a: ScopeSelector,
    b: ScopeSelector,
  ): NeedsCheck<Tagged> => ({
    other: { ...b, id },
    selectors: [a, b],
  });

  it("confirms a pair whose probe returns a product edge", async () => {
    const { admin, graphql } = mockAdmin(() => ({
      body: { data: { products: { edges: [{ node: { id: "x" } }] } } },
    }));

    const result = await checkCrossDimensionConflicts(admin, [
      needs("t1", sel("PRODUCT_TYPE", "Phones"), sel("VENDOR", "Acme")),
    ]);

    expect(result).toEqual<ConfirmedConflict<Tagged>[]>([
      {
        other: { scope: "VENDOR", scopeValue: "Acme", id: "t1" },
        reason: "product_type:'Phones' AND vendor:'Acme'",
      },
    ]);
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("drops a pair whose probe returns no edges", async () => {
    const { admin } = mockAdmin(() => ({
      body: { data: { products: { edges: [] } } },
    }));

    const result = await checkCrossDimensionConflicts(admin, [
      needs("t1", sel("PRODUCT_TYPE", "Phones"), sel("VENDOR", "Acme")),
    ]);

    expect(result).toEqual([]);
  });

  it("only confirms the matching pairs in a mixed batch", async () => {
    const { admin, graphql } = mockAdmin((query) => ({
      // Only the Acme probe finds a product.
      body: {
        data: {
          products: {
            edges: query.includes("Acme") ? [{ node: { id: "x" } }] : [],
          },
        },
      },
    }));

    const result = await checkCrossDimensionConflicts(admin, [
      needs("t1", sel("PRODUCT_TYPE", "Phones"), sel("VENDOR", "Acme")),
      needs("t2", sel("PRODUCT_TYPE", "Phones"), sel("VENDOR", "Other")),
    ]);

    expect(result.map((c) => c.other.id)).toEqual(["t1"]);
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("FAILS CLOSED: throws on a GraphQL errors array (never a false all-clear)", async () => {
    const { admin } = mockAdmin(() => ({
      body: { errors: [{ message: "Throttled" }] },
    }));

    await expect(
      checkCrossDimensionConflicts(admin, [
        needs("t1", sel("PRODUCT_TYPE", "Phones"), sel("VENDOR", "Acme")),
      ]),
    ).rejects.toThrow(/GraphQL errors/);
  });

  it("FAILS CLOSED: throws on a non-ok HTTP response", async () => {
    const { admin } = mockAdmin(() => ({
      ok: false,
      status: 500,
      body: {},
    }));

    await expect(
      checkCrossDimensionConflicts(admin, [
        needs("t1", sel("PRODUCT_TYPE", "Phones"), sel("VENDOR", "Acme")),
      ]),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("makes no call and returns [] for an empty needsCheck list", async () => {
    const { admin, graphql } = mockAdmin(() => ({ body: {} }));

    const result = await checkCrossDimensionConflicts(admin, []);

    expect(result).toEqual([]);
    expect(graphql).not.toHaveBeenCalled();
  });
});
