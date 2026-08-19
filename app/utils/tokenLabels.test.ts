import { describe, it, expect } from "vitest";
import { tokenLabels } from "./tokenLabels";

describe("tokenLabels", () => {
  it("labels a native product field", () => {
    expect(tokenLabels({ type: "SHOPIFY_FIELD", field: "weight" })).toEqual({
      text: "Field · weight",
      title: "Product field · weight",
      aria: "Product field, weight",
    });
  });

  it("labels a metafield by namespace and key", () => {
    expect(
      tokenLabels({ type: "METAFIELD", namespace: "custom", key: "colour" }),
    ).toEqual({
      text: "Metafield · colour",
      title: "custom · colour",
      aria: "Metafield, custom, colour",
    });
  });

  it("falls back to a dash when a metafield is half-filled", () => {
    const labels = tokenLabels({ type: "METAFIELD", namespace: "", key: "" });
    expect(labels.text).toBe("Metafield · —");
    expect(labels.title).toBe("— · —");
    expect(labels.aria).toBe("Metafield, no namespace, no key");
  });
});
