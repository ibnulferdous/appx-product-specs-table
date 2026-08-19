import { describe, it, expect, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  deleteSpecTableMetaobject,
  readMetaobjectDeleteId,
  readMetaobjectIdByHandle,
  readMetaobjectRows,
  readUpsertResult,
  readUserErrors,
  specTableHandle,
  stylingCssPayload,
  upsertSpecTableMetaobject,
} from "./metaobjects.server";
import {
  DEFAULT_STYLING_VALUES,
  parseStylingValues,
  serializeStylingOverrides,
  type StylingValues,
} from "../utils/tableStyling";
import {
  formatCssVarDeclarations,
  stylingToCssVars,
  stylingToModifierClasses,
} from "../utils/tableStylingCss";

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

// --- Styling serialization (feature 57 · Step 7) -----------------------------
//
// The storefront half of the pipe: what the sync WRITES onto the metaobject.
// Every expectation is derived from the Step 2 mapping functions rather than
// hand-typed strings — a hand-typed class list would pass while the storefront
// and the preview drifted apart, which is exactly the failure this step exists
// to prevent. The mapping's own output is exhaustively covered in
// `app/utils/tableStylingCss.test.ts`.

const OK_UPSERT = {
  data: {
    metaobjectUpsert: {
      metaobject: { id: "gid://x/1", handle: "template-t1" },
      userErrors: [],
    },
  },
};

/** The `fields` array the upsert sent, as a key -> value lookup. */
async function upsertFields(styling: StylingValues) {
  const { admin, graphql } = mockAdmin([OK_UPSERT]);
  await upsertSpecTableMetaobject(admin, {
    templateId: "t1",
    status: "ACTIVE",
    rows: [],
    styling,
    updatedAt: "2026-07-19T00:00:00.000Z",
  });
  const variables = graphql.mock.calls[0][1] as {
    variables: { metaobject: { fields: { key: string; value: string }[] } };
  };
  return Object.fromEntries(
    variables.variables.metaobject.fields.map((f) => [f.key, f.value]),
  ) as Record<string, string>;
}

describe("stylingCssPayload — precomputed presentation (feature 57 · Step 7)", () => {
  it("joins the Step 2 mapping's classes and vars, so Liquid needs no logic", () => {
    const styling = parseStylingValues({
      rowDividerStyle: "STRIPES",
      borderColor: "#ff0000",
    });

    expect(stylingCssPayload(styling)).toEqual({
      classes: stylingToModifierClasses(styling).join(" "),
      vars: formatCssVarDeclarations(stylingToCssVars(styling)),
    });
  });

  it("emits every default modifier class but NO vars for all-default styling", () => {
    const payload = stylingCssPayload(DEFAULT_STYLING_VALUES);

    // Defaults are emitted as real classes (the Step 2 lock: every knob always
    // emits, so "default" never means "whatever the base rule happens to do").
    expect(payload.classes.split(" ")).toEqual(
      stylingToModifierClasses(DEFAULT_STYLING_VALUES),
    );
    // …while all-inherit yields no custom properties at all, so the merchant's
    // theme still wins. This is the case that must render as it did pre-Step-7.
    expect(payload.vars).toBe("");
  });
});

describe("upsertSpecTableMetaobject — styling fields (feature 57 · Step 7)", () => {
  it("writes styling as the overrides-only wire shape, not the resolved value", async () => {
    const styling = parseStylingValues({ rowDividerStyle: "STRIPES" });
    const fields = await upsertFields(styling);

    expect(JSON.parse(fields.styling)).toEqual({ rowDividerStyle: "STRIPES" });
    // The SAME shape the Save payload carries (Step 1's one wire shape).
    expect(JSON.parse(fields.styling)).toEqual(
      serializeStylingOverrides(styling),
    );
  });

  it("writes styling_css as the precomputed {classes, vars} pair", async () => {
    const styling = parseStylingValues({
      rowDividerStyle: "STRIPES",
      density: "COMPACT",
      labelWidthPct: 40,
    });
    const fields = await upsertFields(styling);

    expect(JSON.parse(fields.styling_css)).toEqual(stylingCssPayload(styling));
    // Spot-check the merchant-visible effect rather than only self-consistency.
    expect(JSON.parse(fields.styling_css).classes).toContain(
      "appx-spec-table--dividers-stripes",
    );
    expect(JSON.parse(fields.styling_css).vars).toContain(
      "--appx-spec-label-width: 40%;",
    );
  });

  it("writes {} + empty vars for an all-default template (renders as before)", async () => {
    const fields = await upsertFields(DEFAULT_STYLING_VALUES);

    expect(fields.styling).toBe("{}");
    expect(JSON.parse(fields.styling_css).vars).toBe("");
  });

  it("never emits null/undefined into either field", async () => {
    for (const styling of [
      DEFAULT_STYLING_VALUES,
      parseStylingValues({ rowDividerStyle: "NONE" }),
    ]) {
      const fields = await upsertFields(styling);
      for (const key of ["styling", "styling_css"]) {
        expect(fields[key]).toBeTypeOf("string");
        expect(fields[key]).not.toContain("undefined");
        expect(fields[key]).not.toContain("null");
      }
    }
  });

  it("leaves the rows/status/updated_at fields untouched", async () => {
    const fields = await upsertFields(DEFAULT_STYLING_VALUES);

    expect(fields.template_id).toBe("t1");
    expect(fields.status).toBe("ACTIVE");
    expect(fields.rows).toBe("[]");
    expect(fields.updated_at).toBe("2026-07-19T00:00:00.000Z");
  });
});

describe("upsertSpecTableMetaobject — failure path (the sync's only failure signal)", () => {
  const upsertArgs = {
    templateId: "t1",
    status: "ACTIVE",
    rows: [],
    styling: DEFAULT_STYLING_VALUES,
    updatedAt: "2026-07-19T00:00:00.000Z",
  };

  it("throws with the user-error text when the upsert returns no metaobject", async () => {
    const { admin } = mockAdmin([
      {
        data: {
          metaobjectUpsert: {
            metaobject: null,
            userErrors: [
              {
                field: ["handle"],
                message: "Handle is invalid",
                code: "INVALID",
              },
            ],
          },
        },
      },
    ]);

    await expect(upsertSpecTableMetaobject(admin, upsertArgs)).rejects.toThrow(
      "Handle is invalid",
    );
  });

  it("falls back to top-level GraphQL errors when there are no nested userErrors", async () => {
    // A throttled / query-validation failure returns `{ errors: [...] }` with no `data` — the cause
    // must still reach the thrown message so the caller's log isn't blank.
    const { admin } = mockAdmin([{ errors: [{ message: "Throttled" }] }]);

    await expect(upsertSpecTableMetaobject(admin, upsertArgs)).rejects.toThrow(
      "Throttled",
    );
  });
});
