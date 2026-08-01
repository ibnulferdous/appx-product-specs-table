import { describe, it, expect, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  resolveScopeResourceDetails,
  chunkIds,
  NODES_MAX_IDS,
} from "./scopeResourceLabel.server";

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

// --- Chunking (OQ-103-B / data-model.md §13 F4) -----------------------------
// Shopify rejects ANY GraphQL input array over 250, and rejects the WHOLE request
// rather than truncating. Because this resolver is fail-soft, an unsplit over-limit
// set used to degrade EVERY chip to a raw GID with no message. The arithmetic is
// pure so it is testable without a mocked Admin client at all.

describe("chunkIds (pure batching arithmetic)", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => P(String(i)));

  it("returns NO chunks for an empty input (so the caller issues no request)", () => {
    expect(chunkIds([])).toEqual([]);
  });

  it("returns one chunk when the input is under the cap", () => {
    expect(chunkIds(ids(3))).toEqual([[P("0"), P("1"), P("2")]]);
  });

  it("returns ONE chunk at exactly the cap — the off-by-one that decides the fix", () => {
    const chunks = chunkIds(ids(NODES_MAX_IDS));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(NODES_MAX_IDS);
  });

  it("splits at cap + 1 into a full chunk and a remainder of one", () => {
    const chunks = chunkIds(ids(NODES_MAX_IDS + 1));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(NODES_MAX_IDS);
    expect(chunks[1]).toHaveLength(1);
  });

  it("splits an exact multiple into equal chunks with no trailing empty chunk", () => {
    const chunks = chunkIds(ids(NODES_MAX_IDS * 3));
    expect(chunks).toHaveLength(3);
    expect(chunks.every((c) => c.length === NODES_MAX_IDS)).toBe(true);
  });

  it("preserves order and loses nothing — the flattened chunks equal the input", () => {
    const input = ids(NODES_MAX_IDS * 2 + 7);
    expect(chunkIds(input).flat()).toEqual(input);
  });

  it("honours an explicit size (so the tests above aren't hostage to the default)", () => {
    expect(chunkIds([P("0"), P("1"), P("2")], 2)).toEqual([
      [P("0"), P("1")],
      [P("2")],
    ]);
  });

  it("throws on a size below 1 rather than looping forever", () => {
    expect(() => chunkIds([P("0")], 0)).toThrow(/at least 1/);
  });

  it("pins the cap at Shopify's documented 250", () => {
    // Admin AND Storefront reject any input array over 250 (API 2020-01+); the
    // `nodes` reference states it explicitly. Raising this constant re-opens F4.
    expect(NODES_MAX_IDS).toBe(250);
  });
});

describe("resolveScopeResourceDetails — chunked requests (OQ-103-B)", () => {
  const gids = (n: number) => Array.from({ length: n }, (_, i) => P(String(i)));
  // Every requested id resolves, so a title proves the id reached a request.
  const resolveAll = (ids: string[]) => ({
    body: {
      data: {
        nodes: ids.map((id) => ({
          id,
          title: `T${id.split("/").pop()}`,
          featuredImage: null,
        })),
      },
    },
  });

  it("still issues exactly ONE request at the cap (the common path is unchanged)", async () => {
    const { admin, graphql } = mockAdmin(resolveAll);
    await resolveScopeResourceDetails(admin, "PRODUCT", gids(NODES_MAX_IDS));
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("splits an over-cap set across requests, none exceeding the cap", async () => {
    const { admin, graphql } = mockAdmin(resolveAll);
    await resolveScopeResourceDetails(admin, "PRODUCT", gids(501));

    expect(graphql).toHaveBeenCalledTimes(3);
    for (const call of graphql.mock.calls) {
      expect(call[1].variables.ids.length).toBeLessThanOrEqual(NODES_MAX_IDS);
    }
  });

  it("resolves EVERY id across the chunks — the map is total and none are skipped", async () => {
    const all = gids(NODES_MAX_IDS + 1);
    const { admin } = mockAdmin(resolveAll);
    const details = await resolveScopeResourceDetails(admin, "PRODUCT", all);

    expect(details.size).toBe(all.length);
    // Including the lone id in the remainder chunk, which the pre-fix code never sent.
    expect(details.get(P("250"))?.label).toBe("T250");
    expect([...details.values()].every((d) => d.label.startsWith("T"))).toBe(
      true,
    );
  });

  it("🔴 isolates a FAILING chunk — the successful chunk keeps its real titles", async () => {
    // The whole point of the fix. Pre-fix, one failure blanked the entire list;
    // per-chunk isolation means a merchant sees 250 real chips, not 251 GIDs.
    const { admin } = mockAdmin((ids) =>
      ids.includes(P("250")) ? { ok: false, body: {} } : resolveAll(ids),
    );

    const details = await resolveScopeResourceDetails(
      admin,
      "PRODUCT",
      gids(NODES_MAX_IDS + 1),
    );

    expect(details.get(P("0"))?.label).toBe("T0"); // first chunk survived
    expect(details.get(P("249"))?.label).toBe("T249");
    expect(details.get(P("250"))).toEqual({ label: P("250"), image: null }); // failed chunk degrades alone
  });

  it("keeps earlier chunks when a later one THROWS (fail-soft is per chunk)", async () => {
    const graphql = vi.fn(
      async (_op: string, opts: { variables: { ids: string[] } }) => {
        if (opts.variables.ids.includes(P("250"))) {
          throw new Error("network down");
        }
        return {
          ok: true,
          json: async () => resolveAll(opts.variables.ids).body,
        };
      },
    );
    const admin = { graphql } as unknown as AdminApiContext;

    const details = await resolveScopeResourceDetails(
      admin,
      "PRODUCT",
      gids(NODES_MAX_IDS + 1),
    );

    expect(details.get(P("0"))?.label).toBe("T0");
    expect(details.get(P("250"))).toEqual({ label: P("250"), image: null });
  });
});
