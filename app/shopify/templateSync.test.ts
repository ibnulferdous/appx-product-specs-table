import { describe, it, expect, vi, beforeEach } from "vitest";
import { TemplateStatus } from "@prisma/client";
import { syncTemplateToMetaobject } from "./templateSync.server";
import { parseStylingValues } from "../utils/tableStyling";
import { stylingCssPayload } from "./metaobjects.server";

// The sync's only Prisma touch is stamping the GID/handle back on the template;
// mock it so these tests stay framework-free and never open a DB connection.
const { setTemplateMetaobjectRef } = vi.hoisted(() => ({
  setTemplateMetaobjectRef: vi.fn(),
}));
vi.mock("../models/template.server", () => ({ setTemplateMetaobjectRef }));

beforeEach(() => {
  vi.clearAllMocks();
});

// The sync makes a single Admin call: the metaobject upsert. (There is no
// read-back round-trip — see `syncTemplateToMetaobject`.)
function mockAdmin() {
  const graphql = vi.fn().mockResolvedValue({
    json: async () => ({
      data: {
        metaobjectUpsert: {
          metaobject: { id: "gid://x/1", handle: "template-t1" },
          userErrors: [],
        },
      },
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: { graphql } as any, graphql };
}

/** The `fields` the sync's upsert sent, as a key -> value lookup. */
function sentFields(graphql: ReturnType<typeof mockAdmin>["graphql"]) {
  const call = graphql.mock.calls[0][1] as {
    variables: { metaobject: { fields: { key: string; value: string }[] } };
  };
  return Object.fromEntries(
    call.variables.metaobject.fields.map((f) => [f.key, f.value]),
  ) as Record<string, string>;
}

// A persisted TableStyling row as Prisma returns it: overrides in their column
// form, every other knob NULL, plus the relation's own keys (which the tolerant
// parse ignores).
const STRIPED_ROW = {
  id: "sty_1",
  templateId: "t1",
  rowLayout: null,
  gridMinColumnWidthPx: null,
  mobileLayout: null,
  sectionHeaderStyle: null,
  sectionsCollapsible: false,
  sectionsInitialState: null,
  rowDividerStyle: "STRIPES",
  density: null,
  headerBgColor: null,
  labelBgColor: null,
  valueBgColor: null,
  stripeBgColor: "#f5f5f5",
  borderColor: null,
  labelTextColor: null,
  valueTextColor: null,
  fontSize: null,
  fontWeight: null,
  fontStyle: null,
  lineHeight: null,
  labelCase: null,
  labelWidthPct: null,
};

describe("syncTemplateToMetaobject — styling threading (feature 57 · Step 7)", () => {
  it("carries the template's persisted styling to the storefront", async () => {
    const { admin, graphql } = mockAdmin();

    const { syncError } = await syncTemplateToMetaobject(
      admin,
      { id: "shop_A" },
      {
        id: "t1",
        status: TemplateStatus.ACTIVE,
        rows: [],
        styling: STRIPED_ROW,
      },
    );

    expect(syncError).toBeNull();
    const fields = sentFields(graphql);
    expect(JSON.parse(fields.styling)).toEqual({
      rowDividerStyle: "STRIPES",
      stripeBgColor: "#f5f5f5",
    });
    expect(JSON.parse(fields.styling_css)).toEqual(
      stylingCssPayload(parseStylingValues(STRIPED_ROW)),
    );
  });

  // THE regression this step exists to prevent. Every sync REPLACES the
  // metaobject's styling fields, and the templates-list status action re-syncs
  // through this same function — so if a status flip were to arrive without the
  // template's styling, an ACTIVE -> DRAFT -> ACTIVE round trip would silently
  // reset a merchant's live table to the default look.
  it("does not reset styling when the sync follows a status change", async () => {
    // The row a status-only update returns: status flipped, styling untouched.
    for (const status of [TemplateStatus.DRAFT, TemplateStatus.ACTIVE]) {
      const { admin, graphql } = mockAdmin();

      await syncTemplateToMetaobject(
        admin,
        { id: "shop_A" },
        { id: "t1", status, rows: [], styling: STRIPED_ROW },
      );

      const fields = sentFields(graphql);
      expect(fields.status).toBe(status);
      // Still striped after the flip — not "{}" .
      expect(JSON.parse(fields.styling).rowDividerStyle).toBe("STRIPES");
      expect(JSON.parse(fields.styling_css).classes).toContain(
        "appx-spec-table--dividers-stripes",
      );
    }
  });

  it("treats a template with no styling row as fully-default styling", async () => {
    const { admin, graphql } = mockAdmin();

    // `null` is what Prisma returns for a template that never touched the Style
    // tab — there is no backfill, so this is the common case.
    await syncTemplateToMetaobject(
      admin,
      { id: "shop_A" },
      { id: "t1", status: TemplateStatus.ACTIVE, rows: [], styling: null },
    );

    const fields = sentFields(graphql);
    expect(fields.styling).toBe("{}");
    expect(JSON.parse(fields.styling_css).vars).toBe("");
    expect(fields.styling_css).not.toContain("undefined");
  });

  it("degrades a malformed styling blob to defaults instead of throwing", async () => {
    const { admin, graphql } = mockAdmin();

    const { syncError } = await syncTemplateToMetaobject(
      admin,
      { id: "shop_A" },
      {
        id: "t1",
        status: TemplateStatus.ACTIVE,
        rows: [],
        // Hand-edited / corrupt: unknown keyword, injection attempt in a color,
        // wrong type for the width. The Step 1 tolerance law must hold here too.
        styling: {
          rowDividerStyle: "PLAID",
          borderColor: "#fff;background:url(x)",
          labelWidthPct: "wide",
        },
      },
    );

    expect(syncError).toBeNull();
    const fields = sentFields(graphql);
    expect(fields.styling).toBe("{}");
    // The injection attempt never reaches the storefront style attribute.
    expect(fields.styling_css).not.toContain("url(");
  });
});
