import { describe, it, expect, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { resolveScopeValueLabels } from "./scopeResourceLabel.server";

// The batched resolver (feature 47) is exercised with a mocked `admin.graphql` at
// the boundary (per the testing strategy). It is display-only + fail-soft, so every
// path must yield a map that is TOTAL over the input GIDs (never a blank/missing
// chip) — that totality is what these tests pin.

const P = (id: string) => `gid://shopify/Product/${id}`;
const C = (id: string) => `gid://shopify/Collection/${id}`;

function mockAdmin(
  handler: (ids: string[]) => { ok?: boolean; body: unknown } | never,
): { admin: AdminApiContext; graphql: ReturnType<typeof vi.fn> } {
  const graphql = vi.fn(
    async (_op: string, opts: { variables: { ids: string[] } }) => {
      const { ok = true, body } = handler(opts.variables.ids);
      return { ok, json: async () => body };
    },
  );
  return { admin: { graphql } as unknown as AdminApiContext, graphql };
}

describe("resolveScopeValueLabels (feature 47 batched resolver)", () => {
  it("resolves N product GIDs to their titles in one query", async () => {
    const { admin, graphql } = mockAdmin(() => ({
      body: {
        data: {
          nodes: [
            { id: P("1"), title: "Alpha" },
            { id: P("2"), title: "Beta" },
          ],
        },
      },
    }));

    const labels = await resolveScopeValueLabels(admin, "PRODUCT", [
      P("1"),
      P("2"),
    ]);

    expect(labels.get(P("1"))).toBe("Alpha");
    expect(labels.get(P("2"))).toBe("Beta");
    // One batched round-trip for the whole set, not N.
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("falls back to the raw GID for an unresolved (null) node — map stays total", async () => {
    // A deleted / mismatched id comes back as `null` in the nodes array.
    const { admin } = mockAdmin(() => ({
      body: { data: { nodes: [{ id: P("1"), title: "Alpha" }, null] } },
    }));

    const labels = await resolveScopeValueLabels(admin, "PRODUCT", [
      P("1"),
      P("2"),
    ]);

    expect(labels.get(P("1"))).toBe("Alpha");
    // The deleted one degrades to its GID (identity), never blank.
    expect(labels.get(P("2"))).toBe(P("2"));
  });

  it("returns an identity map on a non-ok response (fail-soft)", async () => {
    const { admin } = mockAdmin(() => ({ ok: false, body: {} }));
    const labels = await resolveScopeValueLabels(admin, "COLLECTION", [
      C("1"),
      C("2"),
    ]);
    expect(labels.get(C("1"))).toBe(C("1"));
    expect(labels.get(C("2"))).toBe(C("2"));
  });

  it("returns an identity map when the query throws (fail-soft)", async () => {
    const graphql = vi.fn(async () => {
      throw new Error("network down");
    });
    const admin = { graphql } as unknown as AdminApiContext;
    const labels = await resolveScopeValueLabels(admin, "PRODUCT", [P("1")]);
    expect(labels.get(P("1"))).toBe(P("1"));
  });

  it("returns an identity map on a malformed payload", async () => {
    const { admin } = mockAdmin(() => ({ body: { data: { nodes: "nope" } } }));
    const labels = await resolveScopeValueLabels(admin, "PRODUCT", [P("1")]);
    expect(labels.get(P("1"))).toBe(P("1"));
  });

  it("does not query for a non-resource kind (value is its own label)", async () => {
    const { admin, graphql } = mockAdmin(() => ({ body: {} }));
    const labels = await resolveScopeValueLabels(admin, "VENDOR", ["Acme"]);
    expect(labels.get("Acme")).toBe("Acme");
    expect(graphql).not.toHaveBeenCalled();
  });

  it("does not query for an empty GID set", async () => {
    const { admin, graphql } = mockAdmin(() => ({ body: {} }));
    const labels = await resolveScopeValueLabels(admin, "PRODUCT", []);
    expect(labels.size).toBe(0);
    expect(graphql).not.toHaveBeenCalled();
  });
});
