import { describe, it, expect, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { resolveScopeResourceDetails } from "./scopeResourceLabel.server";

// The batched resolver (features 47) is exercised with a mocked `admin.graphql` at
// the boundary (per the testing strategy). It is display-only + fail-soft, so every
// path must yield a map that is TOTAL over the input GIDs (never a blank/missing
// chip) — that totality is what these tests pin. Each entry is a `{ label, image }`
// detail: the label falls back to the raw GID and the image to null on any miss.

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

describe("resolveScopeResourceDetails (feature 47 batched resolver)", () => {
  it("resolves N product GIDs to their titles + thumbnails in one query", async () => {
    const { admin, graphql } = mockAdmin(() => ({
      body: {
        data: {
          nodes: [
            {
              id: P("1"),
              title: "Alpha",
              featuredImage: { url: "https://cdn/a.jpg" },
            },
            {
              id: P("2"),
              title: "Beta",
              featuredImage: { url: "https://cdn/b.jpg" },
            },
          ],
        },
      },
    }));

    const details = await resolveScopeResourceDetails(admin, "PRODUCT", [
      P("1"),
      P("2"),
    ]);

    expect(details.get(P("1"))).toEqual({
      label: "Alpha",
      image: "https://cdn/a.jpg",
    });
    expect(details.get(P("2"))).toEqual({
      label: "Beta",
      image: "https://cdn/b.jpg",
    });
    // One batched round-trip for the whole set, not N.
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("resolves a collection's title + image (image { url })", async () => {
    const { admin } = mockAdmin(() => ({
      body: {
        data: {
          nodes: [
            {
              id: C("1"),
              title: "Drones",
              image: { url: "https://cdn/c.jpg" },
            },
          ],
        },
      },
    }));

    const details = await resolveScopeResourceDetails(admin, "COLLECTION", [
      C("1"),
    ]);
    expect(details.get(C("1"))).toEqual({
      label: "Drones",
      image: "https://cdn/c.jpg",
    });
  });

  it("uses a null image when the resource has no featured image", async () => {
    const { admin } = mockAdmin(() => ({
      body: {
        data: { nodes: [{ id: P("1"), title: "Alpha", featuredImage: null }] },
      },
    }));

    const details = await resolveScopeResourceDetails(admin, "PRODUCT", [
      P("1"),
    ]);
    expect(details.get(P("1"))).toEqual({ label: "Alpha", image: null });
  });

  it("falls back to the raw GID (no image) for an unresolved (null) node — map stays total", async () => {
    // A deleted / mismatched id comes back as `null` in the nodes array.
    const { admin } = mockAdmin(() => ({
      body: {
        data: {
          nodes: [
            {
              id: P("1"),
              title: "Alpha",
              featuredImage: { url: "https://cdn/a.jpg" },
            },
            null,
          ],
        },
      },
    }));

    const details = await resolveScopeResourceDetails(admin, "PRODUCT", [
      P("1"),
      P("2"),
    ]);

    expect(details.get(P("1"))?.label).toBe("Alpha");
    // The deleted one degrades to its GID (identity) with no thumbnail, never blank.
    expect(details.get(P("2"))).toEqual({ label: P("2"), image: null });
  });

  it("returns an identity map on a non-ok response (fail-soft)", async () => {
    const { admin } = mockAdmin(() => ({ ok: false, body: {} }));
    const details = await resolveScopeResourceDetails(admin, "COLLECTION", [
      C("1"),
      C("2"),
    ]);
    expect(details.get(C("1"))).toEqual({ label: C("1"), image: null });
    expect(details.get(C("2"))).toEqual({ label: C("2"), image: null });
  });

  it("returns an identity map when the query throws (fail-soft)", async () => {
    const graphql = vi.fn(async () => {
      throw new Error("network down");
    });
    const admin = { graphql } as unknown as AdminApiContext;
    const details = await resolveScopeResourceDetails(admin, "PRODUCT", [
      P("1"),
    ]);
    expect(details.get(P("1"))).toEqual({ label: P("1"), image: null });
  });

  it("returns an identity map on a malformed payload", async () => {
    const { admin } = mockAdmin(() => ({ body: { data: { nodes: "nope" } } }));
    const details = await resolveScopeResourceDetails(admin, "PRODUCT", [
      P("1"),
    ]);
    expect(details.get(P("1"))).toEqual({ label: P("1"), image: null });
  });

  it("does not query for a non-resource kind (value is its own label)", async () => {
    const { admin, graphql } = mockAdmin(() => ({ body: {} }));
    const details = await resolveScopeResourceDetails(admin, "VENDOR", [
      "Acme",
    ]);
    expect(details.get("Acme")).toEqual({ label: "Acme", image: null });
    expect(graphql).not.toHaveBeenCalled();
  });

  it("does not query for an empty GID set", async () => {
    const { admin, graphql } = mockAdmin(() => ({ body: {} }));
    const details = await resolveScopeResourceDetails(admin, "PRODUCT", []);
    expect(details.size).toBe(0);
    expect(graphql).not.toHaveBeenCalled();
  });
});
