import { describe, it, expect } from "vitest";
import {
  readDefinitionByTypeId,
  readDefinitionCreateId,
  readMetaobjectRows,
  readUpsertResult,
  readUserErrors,
  specTableHandle,
} from "./metaobjects.server";

describe("specTableHandle", () => {
  it("builds the template-{id} handle (data-model §10)", () => {
    expect(specTableHandle("clx2def456")).toBe("template-clx2def456");
  });
});

describe("readUserErrors", () => {
  it("returns the non-empty messages from a payload's userErrors", () => {
    expect(
      readUserErrors({
        userErrors: [
          { message: "Type has already been taken", code: "TAKEN" },
          { message: "", code: "X" },
        ],
      }),
    ).toEqual(["Type has already been taken"]);
  });

  it("returns [] for missing / malformed userErrors", () => {
    expect(readUserErrors(null)).toEqual([]);
    expect(readUserErrors({})).toEqual([]);
    expect(readUserErrors({ userErrors: "nope" })).toEqual([]);
  });
});

describe("readDefinitionByTypeId", () => {
  it("reads the definition GID when present", () => {
    expect(
      readDefinitionByTypeId({
        data: {
          metaobjectDefinitionByType: {
            id: "gid://shopify/MetaobjectDefinition/1",
            type: "app--1--appx_spec_table",
          },
        },
      }),
    ).toBe("gid://shopify/MetaobjectDefinition/1");
  });

  it("returns null when the definition is absent", () => {
    expect(
      readDefinitionByTypeId({ data: { metaobjectDefinitionByType: null } }),
    ).toBeNull();
    expect(readDefinitionByTypeId({})).toBeNull();
    expect(readDefinitionByTypeId("nope")).toBeNull();
  });
});

describe("readDefinitionCreateId", () => {
  it("reads the created definition GID", () => {
    expect(
      readDefinitionCreateId({
        data: {
          metaobjectDefinitionCreate: {
            metaobjectDefinition: {
              id: "gid://shopify/MetaobjectDefinition/9",
            },
            userErrors: [],
          },
        },
      }),
    ).toBe("gid://shopify/MetaobjectDefinition/9");
  });

  it("returns null when create reported errors and minted no definition", () => {
    expect(
      readDefinitionCreateId({
        data: {
          metaobjectDefinitionCreate: {
            metaobjectDefinition: null,
            userErrors: [{ message: "taken", code: "TAKEN" }],
          },
        },
      }),
    ).toBeNull();
  });
});

describe("readUpsertResult", () => {
  it("reads the metaobject GID + handle", () => {
    expect(
      readUpsertResult({
        data: {
          metaobjectUpsert: {
            metaobject: {
              id: "gid://shopify/Metaobject/55",
              handle: "template-clx",
            },
            userErrors: [],
          },
        },
      }),
    ).toEqual({ gid: "gid://shopify/Metaobject/55", handle: "template-clx" });
  });

  it("returns null when the metaobject is missing (e.g. user errors)", () => {
    expect(
      readUpsertResult({
        data: { metaobjectUpsert: { metaobject: null, userErrors: [{}] } },
      }),
    ).toBeNull();
    expect(readUpsertResult({})).toBeNull();
  });
});

describe("readMetaobjectRows", () => {
  it("parses the rows JSON string field back into the row array", () => {
    const rows = [
      {
        id: "r1",
        key: "battery_life",
        rowType: "DATA",
        label: "Battery Life",
        hideWhenEmpty: true,
        valueParts: [
          { type: "TEXT", text: "Up to " },
          { type: "METAFIELD", namespace: "custom", key: "battery_life" },
          { type: "LINE_BREAK" },
          { type: "TEXT", text: " hours" },
        ],
      },
    ];
    expect(
      readMetaobjectRows({
        data: {
          metaobjectByHandle: {
            id: "gid://shopify/Metaobject/1",
            handle: "template-clx",
            rows: { value: JSON.stringify(rows) },
          },
        },
      }),
    ).toEqual(rows);
  });

  it("returns null when the metaobject, field, or JSON is missing/broken", () => {
    expect(
      readMetaobjectRows({ data: { metaobjectByHandle: null } }),
    ).toBeNull();
    expect(
      readMetaobjectRows({
        data: { metaobjectByHandle: { rows: null } },
      }),
    ).toBeNull();
    expect(
      readMetaobjectRows({
        data: { metaobjectByHandle: { rows: { value: "{not json" } } },
      }),
    ).toBeNull();
    expect(
      readMetaobjectRows({
        data: { metaobjectByHandle: { rows: { value: '{"not":"array"}' } } },
      }),
    ).toBeNull();
  });
});
