import { describe, it, expect, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  deleteSpecTableMetaobject,
  readDefinitionByTypeId,
  readDefinitionCreateId,
  readMetaobjectDeleteId,
  readMetaobjectIdByHandle,
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

  it("returns null for a JSON array that is not a clean EditorRow[]", () => {
    // A well-formed array whose elements do not narrow must not be cast through
    // as EditorRow[] (CodeRabbit) — parseRows drops them, the length mismatch
    // reports the payload as "did not survive" rather than silently cleaning it.
    expect(
      readMetaobjectRows({
        data: { metaobjectByHandle: { rows: { value: "[42]" } } },
      }),
    ).toBeNull();
    expect(
      readMetaobjectRows({
        data: {
          metaobjectByHandle: { rows: { value: '[{"rowType":"NOPE"}]' } },
        },
      }),
    ).toBeNull();
    // A mix of one good row + one junk element is rejected whole, so a corrupted
    // metaobject can never falsely pass the round-trip check.
    expect(
      readMetaobjectRows({
        data: {
          metaobjectByHandle: {
            rows: {
              value: JSON.stringify([
                {
                  id: "r1",
                  key: "k",
                  rowType: "DATA",
                  label: "L",
                  hideWhenEmpty: true,
                  valueParts: [{ type: "TEXT", text: "" }],
                },
                42,
              ]),
            },
          },
        },
      }),
    ).toBeNull();
  });

  it("treats an empty rows array as a valid (empty) round-trip", () => {
    expect(
      readMetaobjectRows({
        data: { metaobjectByHandle: { rows: { value: "[]" } } },
      }),
    ).toEqual([]);
  });
});

describe("readMetaobjectIdByHandle", () => {
  it("reads the metaobject GID when present", () => {
    expect(
      readMetaobjectIdByHandle({
        data: { metaobjectByHandle: { id: "gid://shopify/Metaobject/7" } },
      }),
    ).toBe("gid://shopify/Metaobject/7");
  });

  it("returns null when the metaobject is absent", () => {
    expect(
      readMetaobjectIdByHandle({ data: { metaobjectByHandle: null } }),
    ).toBeNull();
    expect(readMetaobjectIdByHandle({})).toBeNull();
    expect(readMetaobjectIdByHandle("nope")).toBeNull();
  });
});

describe("readMetaobjectDeleteId", () => {
  it("reads the deletedId from a metaobjectDelete payload", () => {
    expect(
      readMetaobjectDeleteId({
        data: {
          metaobjectDelete: {
            deletedId: "gid://shopify/Metaobject/7",
            userErrors: [],
          },
        },
      }),
    ).toBe("gid://shopify/Metaobject/7");
  });

  it("returns null when nothing was deleted (e.g. user errors, no deletedId)", () => {
    expect(
      readMetaobjectDeleteId({
        data: {
          metaobjectDelete: {
            deletedId: null,
            userErrors: [{ message: "nope" }],
          },
        },
      }),
    ).toBeNull();
    expect(readMetaobjectDeleteId({})).toBeNull();
  });
});

// A fake AdminApiContext whose `graphql` returns a queued JSON payload per call
// (each wrapped in the `{ json() }` Response shape the real client returns).
function mockAdmin(payloads: unknown[]) {
  const graphql = vi.fn();
  for (const payload of payloads) {
    graphql.mockResolvedValueOnce({ json: async () => payload });
  }
  return { admin: { graphql } as unknown as AdminApiContext, graphql };
}

describe("deleteSpecTableMetaobject — best-effort", () => {
  it("deletes by the provided GID without a handle lookup", async () => {
    const { admin, graphql } = mockAdmin([
      {
        data: { metaobjectDelete: { deletedId: "gid://x/9", userErrors: [] } },
      },
    ]);

    await expect(
      deleteSpecTableMetaobject(admin, { gid: "gid://x/9", templateId: "t1" }),
    ).resolves.toBeUndefined();

    // One call only: the delete mutation, with the provided id.
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(graphql.mock.calls[0][1]).toEqual({
      variables: { id: "gid://x/9" },
    });
  });

  it("looks the GID up by handle when none is provided, then deletes it", async () => {
    const { admin, graphql } = mockAdmin([
      { data: { metaobjectByHandle: { id: "gid://x/looked-up" } } },
      {
        data: {
          metaobjectDelete: { deletedId: "gid://x/looked-up", userErrors: [] },
        },
      },
    ]);

    await deleteSpecTableMetaobject(admin, { gid: null, templateId: "t1" });

    expect(graphql).toHaveBeenCalledTimes(2);
    // The lookup uses the template's handle…
    expect(graphql.mock.calls[0][1]).toEqual({
      variables: {
        handle: { type: "$app:appx_spec_table", handle: "template-t1" },
      },
    });
    // …and the delete uses the looked-up id.
    expect(graphql.mock.calls[1][1]).toEqual({
      variables: { id: "gid://x/looked-up" },
    });
  });

  it("is a clean no-op when there is no GID and no metaobject to look up", async () => {
    const { admin, graphql } = mockAdmin([
      { data: { metaobjectByHandle: null } },
    ]);

    await expect(
      deleteSpecTableMetaobject(admin, { gid: null, templateId: "t1" }),
    ).resolves.toBeUndefined();

    // Only the lookup ran; no delete attempted.
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("swallows + logs a thrown request (never bubbles)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const graphql = vi.fn().mockRejectedValue(new Error("network down"));
    const admin = { graphql } as unknown as AdminApiContext;

    await expect(
      deleteSpecTableMetaobject(admin, { gid: "gid://x/9", templateId: "t1" }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("swallows + logs a userErrors response (never bubbles)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin } = mockAdmin([
      {
        data: {
          metaobjectDelete: {
            deletedId: null,
            userErrors: [{ message: "Cannot delete" }],
          },
        },
      },
    ]);

    await expect(
      deleteSpecTableMetaobject(admin, { gid: "gid://x/9", templateId: "t1" }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
