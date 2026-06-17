import { describe, it, expect } from "vitest";
import {
  mapDefinitionsResponse,
  type MetafieldDefinitionSummary,
} from "./metafieldDefinitions.server";

// Only the pure `mapDefinitionsResponse` transform is unit-tested; the live
// `admin.graphql` call is mocked at the boundary, not exercised here (per the
// testing strategy — test the pure transform, mock at the boundary).

// A well-formed Admin GraphQL response shaped exactly like the validated query's
// output (data.metafieldDefinitions.edges[].node).
function responseWith(
  nodes: Array<Record<string, unknown>>,
  pageInfo: Record<string, unknown> = { hasNextPage: false, endCursor: null },
) {
  return {
    data: {
      metafieldDefinitions: {
        edges: nodes.map((node) => ({ node })),
        pageInfo,
      },
    },
  };
}

const node = (
  namespace: string,
  key: string,
  name: string,
  type: string,
  id = `gid://shopify/MetafieldDefinition/${key}`,
) => ({ id, namespace, key, name, type: { name: type } });

describe("mapDefinitionsResponse", () => {
  it("maps a normal multi-edge response to flat summaries in order", () => {
    const json = responseWith([
      node("custom", "battery_life", "Battery life", "single_line_text_field"),
      node("custom", "chipset", "Chipset", "single_line_text_field"),
      node("specs", "weight_grams", "Weight (g)", "number_integer"),
    ]);

    expect(mapDefinitionsResponse(json)).toEqual<MetafieldDefinitionSummary[]>([
      {
        id: "gid://shopify/MetafieldDefinition/battery_life",
        namespace: "custom",
        key: "battery_life",
        name: "Battery life",
        type: "single_line_text_field",
      },
      {
        id: "gid://shopify/MetafieldDefinition/chipset",
        namespace: "custom",
        key: "chipset",
        name: "Chipset",
        type: "single_line_text_field",
      },
      {
        id: "gid://shopify/MetafieldDefinition/weight_grams",
        namespace: "specs",
        key: "weight_grams",
        name: "Weight (g)",
        type: "number_integer",
      },
    ]);
  });

  it("returns [] for empty edges", () => {
    expect(mapDefinitionsResponse(responseWith([]))).toEqual([]);
  });

  it("returns [] when metafieldDefinitions / edges are missing", () => {
    expect(mapDefinitionsResponse({ data: {} })).toEqual([]);
    expect(mapDefinitionsResponse({ data: { metafieldDefinitions: {} } })).toEqual(
      [],
    );
  });

  it("returns [] for non-object input (null, string, array, undefined)", () => {
    expect(mapDefinitionsResponse(null)).toEqual([]);
    expect(mapDefinitionsResponse("nope")).toEqual([]);
    expect(mapDefinitionsResponse([])).toEqual([]);
    expect(mapDefinitionsResponse(undefined)).toEqual([]);
  });

  it("drops a node missing namespace or key (the value-part contract fields)", () => {
    const json = responseWith([
      node("custom", "ok", "Ok", "single_line_text_field"),
      { id: "x", key: "no_namespace", name: "No namespace", type: { name: "t" } },
      { id: "y", namespace: "custom", name: "No key", type: { name: "t" } },
      { id: "z", namespace: "", key: "", name: "Empty", type: { name: "t" } },
    ]);

    expect(mapDefinitionsResponse(json).map((d) => d.key)).toEqual(["ok"]);
  });

  it("falls back name to `namespace.key` when name is missing or empty", () => {
    const json = responseWith([
      { id: "a", namespace: "custom", key: "ram", type: { name: "t" } },
      { id: "b", namespace: "custom", key: "rom", name: "", type: { name: "t" } },
    ]);

    expect(mapDefinitionsResponse(json).map((d) => d.name)).toEqual([
      "custom.ram",
      "custom.rom",
    ]);
  });

  it("defaults type to '' and id to '' when those display fields are absent", () => {
    const json = responseWith([{ namespace: "custom", key: "ports" }]);

    expect(mapDefinitionsResponse(json)).toEqual([
      {
        id: "",
        namespace: "custom",
        key: "ports",
        name: "custom.ports",
        type: "",
      },
    ]);
  });

  it("skips malformed edges / nodes without throwing", () => {
    const json = {
      data: {
        metafieldDefinitions: {
          edges: [
            null,
            "bad",
            { node: null },
            { node: node("custom", "good", "Good", "t") },
          ],
        },
      },
    };

    expect(mapDefinitionsResponse(json).map((d) => d.key)).toEqual(["good"]);
  });

  it("does not mutate the source JSON", () => {
    const json = responseWith([
      node("custom", "battery_life", "Battery life", "single_line_text_field"),
    ]);
    const snapshot = JSON.parse(JSON.stringify(json));

    mapDefinitionsResponse(json);

    expect(json).toEqual(snapshot);
  });
});
