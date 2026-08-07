import { describe, it, expect } from "vitest";
import {
  formatFieldToken,
  formatMetafieldToken,
  partsToText,
  textToParts,
} from "./valueText";
import type { ValuePart } from "./rows";

// The canonical multi-part value used across the caret tests too: "Up to <mf>
// hours". Its string form is `"Up to {% mf custom.battery_life %} hours"`.
const mf: ValuePart = {
  type: "METAFIELD",
  namespace: "custom",
  key: "battery_life",
};
const field: ValuePart = { type: "SHOPIFY_FIELD", field: "vendor" };

describe("formatFieldToken / formatMetafieldToken", () => {
  it("serializes a native field token", () => {
    expect(formatFieldToken("vendor")).toBe("{% field vendor %}");
    expect(formatFieldToken("compare_at_price")).toBe(
      "{% field compare_at_price %}",
    );
  });

  it("serializes a metafield token as namespace.key", () => {
    expect(formatMetafieldToken("custom", "battery_life")).toBe(
      "{% mf custom.battery_life %}",
    );
  });
});

describe("partsToText", () => {
  it("emits TEXT verbatim, tokens via the formatters, LINE_BREAK as \\n", () => {
    expect(
      partsToText([{ type: "TEXT", text: "Up to " }, mf, { type: "TEXT", text: " hours" }]),
    ).toBe("Up to {% mf custom.battery_life %} hours");
    expect(partsToText([field])).toBe("{% field vendor %}");
    expect(
      partsToText([
        { type: "TEXT", text: "a" },
        { type: "LINE_BREAK" },
        { type: "TEXT", text: "b" },
      ]),
    ).toBe("a\nb");
  });

  it("preserves author-meaningful edge whitespace around a token", () => {
    expect(
      partsToText([
        { type: "TEXT", text: "Up to " },
        mf,
        { type: "TEXT", text: " hours" },
      ]),
    ).toBe("Up to {% mf custom.battery_life %} hours");
  });

  it("serializes an empty value to the empty string", () => {
    expect(partsToText([{ type: "TEXT", text: "" }])).toBe("");
  });
});

describe("textToParts", () => {
  it("splits text, tokens, and breaks into canonical parts", () => {
    expect(textToParts("Up to {% mf custom.battery_life %} hours")).toEqual([
      { type: "TEXT", text: "Up to " },
      mf,
      { type: "TEXT", text: " hours" },
    ]);
  });

  it("parses a native field token", () => {
    expect(textToParts("{% field vendor %}")).toEqual([
      field,
      { type: "TEXT", text: "" },
    ]);
  });

  it("tolerates flexible whitespace inside the braces", () => {
    expect(textToParts("{%field vendor%}")).toEqual([
      field,
      { type: "TEXT", text: "" },
    ]);
    expect(textToParts("{%   mf   custom.battery_life   %}")).toEqual([
      mf,
      { type: "TEXT", text: "" },
    ]);
  });

  it("maps an empty string to the always-editable TEXT seed", () => {
    expect(textToParts("")).toEqual([{ type: "TEXT", text: "" }]);
  });
});

describe("textToParts — malformed tokens stay literal", () => {
  it("keeps a token with a missing argument as literal TEXT", () => {
    expect(textToParts("{% mf %}")).toEqual([{ type: "TEXT", text: "{% mf %}" }]);
    expect(textToParts("{% field %}")).toEqual([
      { type: "TEXT", text: "{% field %}" },
    ]);
  });

  it("keeps an over-dotted mf argument literal (key has no dots)", () => {
    expect(textToParts("{% mf a.b.c %}")).toEqual([
      { type: "TEXT", text: "{% mf a.b.c %}" },
    ]);
  });

  it("keeps an unclosed or unknown token literal", () => {
    expect(textToParts("a {% b")).toEqual([{ type: "TEXT", text: "a {% b" }]);
    expect(textToParts("{% liquid echo %}")).toEqual([
      { type: "TEXT", text: "{% liquid echo %}" },
    ]);
  });

  it("still parses a well-formed token that follows a malformed one", () => {
    expect(textToParts("{% mf %} and {% field vendor %}")).toEqual([
      { type: "TEXT", text: "{% mf %} and " },
      field,
    ]);
  });
});

describe("textToParts — \\n ↔ LINE_BREAK", () => {
  it("turns each newline into a LINE_BREAK", () => {
    expect(textToParts("a\nb")).toEqual([
      { type: "TEXT", text: "a" },
      { type: "LINE_BREAK" },
      { type: "TEXT", text: "b" },
    ]);
  });

  it("preserves consecutive newlines as consecutive breaks", () => {
    expect(textToParts("a\n\nb")).toEqual([
      { type: "TEXT", text: "a" },
      { type: "LINE_BREAK" },
      { type: "LINE_BREAK" },
      { type: "TEXT", text: "b" },
    ]);
  });

  it("handles a lone newline", () => {
    expect(textToParts("\n")).toEqual([
      { type: "LINE_BREAK" },
      { type: "TEXT", text: "" },
    ]);
  });
});

describe("round-trip invariants", () => {
  // The string is the source of truth for the textarea surface. For a canonical
  // string (well-formed tokens, no redundant whitespace inside the braces), the
  // parts→text→parts loop reproduces it exactly.
  const canonicalStrings = [
    "",
    "plain text only",
    "Up to {% mf custom.battery_life %} hours",
    "{% field vendor %}",
    "{% field vendor %} / {% field product_type %}",
    "line one\nline two\nline three",
    "leading {% field sku %}",
    "{% mf custom.a %}{% mf custom.b %}",
    "trailing space kept ",
  ];

  it("string → parts → string is identity for canonical strings", () => {
    for (const s of canonicalStrings) {
      expect(partsToText(textToParts(s))).toBe(s);
    }
  });

  it("parts → text → parts is idempotent (string form is stable)", () => {
    for (const s of canonicalStrings) {
      const once = textToParts(s);
      const twice = textToParts(partsToText(once));
      expect(twice).toEqual(once);
    }
  });

  // The string form is lossy ONLY w.r.t. empty TEXT slots (an empty string
  // encodes nothing), which the storefront renders as nothing anyway. So a
  // parts→text→parts round-trip canonicalizes empty TEXT away while preserving
  // every token, break, and non-empty TEXT run.
  it("preserves all content, dropping only empty TEXT slots", () => {
    const withEmpties: ValuePart[] = [
      { type: "TEXT", text: "" },
      field,
      { type: "TEXT", text: "" },
      mf,
      { type: "TEXT", text: " end" },
    ];
    expect(textToParts(partsToText(withEmpties))).toEqual([
      field,
      mf,
      { type: "TEXT", text: " end" },
    ]);
  });
});
