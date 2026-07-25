import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listTemplatesForShop,
  createTemplateForShop,
  deleteTemplateForShop,
  duplicateTemplateForShop,
  getTemplateByIdForShop,
  renameTemplateForShop,
  saveTemplateForShop,
  setTemplateMetaobjectRef,
  setTemplateStatusForShop,
  stylingToDbColumns,
} from "./template.server";
import { MAX_TEMPLATE_ROWS } from "../utils/rows";
import {
  DEFAULT_STYLING_VALUES,
  parseStylingValues,
  type StylingValues,
} from "../utils/tableStyling";
import { NAME_MAX_LENGTH } from "../utils/templateName";

// Every field away from its default — the totality fixture for the column
// mapping (mirrors the Step 1 test fixture of the same name).
const FULLY_OVERRIDDEN: StylingValues = {
  rowLayout: "STACKED",
  mobileLayout: "SAME_AS_DESKTOP",
  sectionHeaderStyle: "TEXT_ONLY",
  sectionsCollapsible: true,
  sectionsInitialState: "ALL_CLOSED",
  rowDividerStyle: "STRIPES",
  columnDividerStyle: "LINE",
  density: "COMPACT",
  tableMaxWidthPx: 960,
  tableAlign: "CENTER",
  outerBorderWidthPx: 2,
  outerBorderRadiusPx: 12,
  headerBgColor: "#112233",
  labelBgColor: "#445566",
  valueBgColor: "#778899",
  stripeBgColor: "#aabbcc",
  borderColor: "#ddeeff",
  outerBorderColor: "#5a5a5a",
  labelTextColor: "#123456",
  valueTextColor: "#654321",
  fontSize: "LARGE",
  fontWeight: "BOLD",
  fontStyle: "ITALIC",
  lineHeight: "LOOSE",
  labelCase: "UPPERCASE",
  labelWidthPct: 45,
};

// The full-column shape stylingToDbColumns(DEFAULT_STYLING_VALUES) must emit:
// every override column an explicit null, the boolean at its column default.
const ALL_DEFAULT_COLUMNS = {
  rowLayout: null,
  mobileLayout: null,
  sectionHeaderStyle: null,
  sectionsCollapsible: false,
  sectionsInitialState: null,
  rowDividerStyle: null,
  columnDividerStyle: null,
  density: null,
  tableMaxWidthPx: null,
  tableAlign: null,
  outerBorderWidthPx: null,
  outerBorderRadiusPx: null,
  headerBgColor: null,
  labelBgColor: null,
  valueBgColor: null,
  stripeBgColor: null,
  borderColor: null,
  outerBorderColor: null,
  labelTextColor: null,
  valueTextColor: null,
  fontSize: null,
  fontWeight: null,
  fontStyle: null,
  lineHeight: null,
  labelCase: null,
  labelWidthPct: null,
};

// Replace the Prisma client (app/db.server.ts default export) with in-memory
// spies. `vi.hoisted` defines the mock before `vi.mock`'s factory runs, and
// Vitest hoists `vi.mock` above the imports so template.server picks up the mock
// instead of opening a real database connection. These tests assert the *query
// our code builds* — every read/write is scoped by shopId — which is the data
// model's #1 invariant; whether Postgres then enforces it is the DB's job.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    template: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../db.server", () => ({ default: prismaMock }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("listTemplatesForShop", () => {
  it("scopes the query to the shop and orders by most recently updated", async () => {
    prismaMock.template.findMany.mockResolvedValue([]);

    await listTemplatesForShop("shop_A");

    expect(prismaMock.template.findMany).toHaveBeenCalledWith({
      where: { shopId: "shop_A" },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("derives rowCount from the rows array (non-arrays count as 0)", async () => {
    prismaMock.template.findMany.mockResolvedValue([
      { id: "t1", rows: [{}, {}, {}] },
      { id: "t2", rows: "not-an-array" },
    ]);

    const result = await listTemplatesForShop("shop_A");

    expect(result.map((t) => t.rowCount)).toEqual([3, 0]);
    // The "Assigned Products" count is no longer this function's concern (it needs
    // live Shopify data) — the list loader enriches it via
    // `resolveAssignedProductCounts` (feature 48), so it isn't returned here.
    expect(result[0]).not.toHaveProperty("assignedProductCount");
  });
});

describe("createTemplateForShop", () => {
  it("rejects an empty or whitespace-only name without touching the database", async () => {
    const result = await createTemplateForShop("shop_A", { name: "   " });

    expect(result).toEqual({ ok: false, error: "Name is required" });
    expect(prismaMock.template.create).not.toHaveBeenCalled();
  });

  it("treats a missing (non-string) name as required", async () => {
    const result = await createTemplateForShop("shop_A", {});

    expect(result).toEqual({ ok: false, error: "Name is required" });
    expect(prismaMock.template.create).not.toHaveBeenCalled();
  });

  it("rejects a name longer than NAME_MAX_LENGTH characters", async () => {
    const result = await createTemplateForShop("shop_A", {
      name: "a".repeat(NAME_MAX_LENGTH + 1),
    });

    expect(result).toEqual({
      ok: false,
      error: `Name must be ${NAME_MAX_LENGTH} characters or fewer`,
    });
    expect(prismaMock.template.create).not.toHaveBeenCalled();
  });

  it("trims the name, defaults an unknown status to DRAFT, and scopes the write to the shop", async () => {
    prismaMock.template.create.mockResolvedValue({ id: "t1" });

    await createTemplateForShop("shop_A", {
      name: "  Specs  ",
      status: "NONSENSE",
    });

    expect(prismaMock.template.create).toHaveBeenCalledWith({
      data: { shopId: "shop_A", name: "Specs", status: "DRAFT", rows: [] },
      include: { styling: true },
    });
  });

  it("passes a valid status through to the write", async () => {
    prismaMock.template.create.mockResolvedValue({ id: "t1" });

    await createTemplateForShop("shop_A", { name: "Specs", status: "ACTIVE" });

    expect(prismaMock.template.create).toHaveBeenCalledWith({
      data: { shopId: "shop_A", name: "Specs", status: "ACTIVE", rows: [] },
      include: { styling: true },
    });
  });

  it("returns ok:true with the created template on success", async () => {
    const created = { id: "t1", name: "Specs" };
    prismaMock.template.create.mockResolvedValue(created);

    const result = await createTemplateForShop("shop_A", { name: "Specs" });

    expect(result).toEqual({ ok: true, data: created });
  });

  it("returns ok:false (not a thrown error) when the database write fails", async () => {
    prismaMock.template.create.mockRejectedValue(new Error("db down"));

    const result = await createTemplateForShop("shop_A", { name: "Specs" });

    expect(result).toEqual({ ok: false, error: "Could not create template" });
  });

  // --- create-on-first-save: rows accepted on create ----------------------

  it("accepts seed rows, finalizes provisional keys from labels, and scopes the write to the shop", async () => {
    prismaMock.template.create.mockResolvedValue({ id: "t1" });

    await createTemplateForShop("shop_A", {
      name: "Specs",
      status: "DRAFT",
      rows: [
        {
          id: "s1",
          key: "section", // provisional
          rowType: "SECTION_HEADER",
          label: "Display",
          hideWhenEmpty: false,
        },
        {
          id: "r1",
          key: "row", // provisional
          rowType: "DATA",
          label: "Screen Size",
          valueParts: [{ type: "TEXT", text: "" }],
          hideWhenEmpty: true,
        },
      ],
    });

    const createArg = prismaMock.template.create.mock.calls[0][0];
    // Shop isolation (priority #1): the write always carries the caller's shopId,
    // so one shop can never create a template under another's id.
    expect(createArg.data.shopId).toBe("shop_A");
    // A brand-new template reconciles against [], so every provisional key is
    // finalized from its label.
    expect(createArg.data.rows.map((r: { key: string }) => r.key)).toEqual([
      "display",
      "screen_size",
    ]);
    // Ids are preserved (never reminted server-side).
    expect(createArg.data.rows.map((r: { id: string }) => r.id)).toEqual([
      "s1",
      "r1",
    ]);
  });

  it("rejects an over-cap rows payload without writing", async () => {
    const tooMany = Array.from({ length: MAX_TEMPLATE_ROWS + 1 }, (_, i) => ({
      id: `r${i}`,
      key: `row_${i}`,
      rowType: "DATA",
      label: "x",
      valueParts: [{ type: "TEXT", text: "" }],
      hideWhenEmpty: true,
    }));

    const result = await createTemplateForShop("shop_A", {
      name: "Specs",
      rows: tooMany,
    });

    expect(result.ok).toBe(false);
    expect(prismaMock.template.create).not.toHaveBeenCalled();
  });

  it("drops malformed rows from an untrusted payload before writing", async () => {
    prismaMock.template.create.mockResolvedValue({ id: "t1" });

    await createTemplateForShop("shop_A", {
      name: "Specs",
      rows: [
        {
          id: "r1",
          rowType: "DATA",
          label: "Brand",
          valueParts: [],
          hideWhenEmpty: true,
        },
        { rowType: "DATA", label: "no id" }, // dropped: no id
        "garbage", // dropped: not an object
      ],
    });

    const createArg = prismaMock.template.create.mock.calls[0][0];
    expect(createArg.data.rows).toHaveLength(1);
    expect(createArg.data.rows[0].id).toBe("r1");
  });
});

describe("getTemplateByIdForShop — shop isolation (priority #1)", () => {
  it("returns null without querying when no id is provided", async () => {
    const result = await getTemplateByIdForShop("shop_A");

    expect(result).toBeNull();
    expect(prismaMock.template.findFirst).not.toHaveBeenCalled();
  });

  it("always scopes the lookup by shopId, so one shop cannot read another shop's template", async () => {
    // The template belongs to shop_A; shop_B asks for it. Because the query
    // includes shopId, the DB has no matching row for shop_B and returns null.
    prismaMock.template.findFirst.mockResolvedValue(null);

    const result = await getTemplateByIdForShop("shop_B", "tmpl_owned_by_A");

    expect(prismaMock.template.findFirst).toHaveBeenCalledWith({
      where: { id: "tmpl_owned_by_A", shopId: "shop_B" },
      include: { styling: true },
    });
    expect(result).toBeNull();
  });

  it("returns the template (with its styling row riding along) when it belongs to the requesting shop", async () => {
    const owned = { id: "t1", shopId: "shop_A", name: "Specs", styling: null };
    prismaMock.template.findFirst.mockResolvedValue(owned);

    const result = await getTemplateByIdForShop("shop_A", "t1");

    expect(prismaMock.template.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", shopId: "shop_A" },
      include: { styling: true },
    });
    expect(result).toBe(owned);
  });
});

describe("stylingToDbColumns (feature 57 Step 4 — the DB column mapping)", () => {
  it("maps all-defaults to every override column null (sectionsCollapsible false)", () => {
    expect(stylingToDbColumns(DEFAULT_STYLING_VALUES)).toEqual(
      ALL_DEFAULT_COLUMNS,
    );
  });

  it("maps a fully-overridden value to every column populated; keyword fontSize stays a keyword, labelWidthPct stays an Int", () => {
    const columns = stylingToDbColumns(FULLY_OVERRIDDEN);

    // No null survives a full override…
    expect(Object.values(columns)).not.toContain(null);
    // …and the two non-string columns keep their column types.
    expect(columns.sectionsCollapsible).toBe(true);
    expect(columns.labelWidthPct).toBe(45);
    expect(columns.fontSize).toBe("LARGE");
    // basedOnPreset / extraStyles are NOT this mapping's to emit (Step 13 /
    // post-MVP own those columns).
    expect(columns).not.toHaveProperty("basedOnPreset");
    expect(columns).not.toHaveProperty("extraStyles");
  });

  it("converts a numeric (px) fontSize to the all-digit string column form", () => {
    const columns = stylingToDbColumns({
      ...DEFAULT_STYLING_VALUES,
      fontSize: 18,
    });

    expect(columns.fontSize).toBe("18");
  });

  it("round-trips: parseStylingValues(stylingToDbColumns(v)) deep-equals v (the DB is just another wire)", () => {
    for (const v of [
      DEFAULT_STYLING_VALUES,
      FULLY_OVERRIDDEN,
      { ...DEFAULT_STYLING_VALUES, fontSize: 18 },
    ]) {
      expect(parseStylingValues(stylingToDbColumns(v))).toEqual(v);
    }
  });

  it("decodes a realistic DB row via parseStylingValues: extra row keys ignored, NULLs -> defaults, corrupt values degrade per-field", () => {
    // An all-NULL row (the lazy-created row after a reset) + the row's own keys.
    const allNullRow = {
      id: "sty_1",
      templateId: "t1",
      ...ALL_DEFAULT_COLUMNS,
      basedOnPreset: null,
      extraStyles: {},
    };
    expect(parseStylingValues(allNullRow)).toEqual(DEFAULT_STYLING_VALUES);

    // A corrupt legacy column value degrades to THAT field's default only.
    const corrupt = { ...allNullRow, rowLayout: "LEGACY", density: "COMPACT" };
    expect(parseStylingValues(corrupt)).toEqual({
      ...DEFAULT_STYLING_VALUES,
      density: "COMPACT",
    });
  });
});

describe("saveTemplateForShop", () => {
  const aRow = {
    id: "r1",
    key: "row",
    rowType: "DATA",
    label: "Battery Life",
    valueParts: [{ type: "TEXT", text: "Up to " }],
    hideWhenEmpty: true,
  };

  it("reads the template shop-scoped first (shop isolation, priority #1) and does not write when unowned", async () => {
    prismaMock.template.findFirst.mockResolvedValue(null);

    const result = await saveTemplateForShop("shop_B", "tmpl_owned_by_A", {
      rows: [aRow],
    });

    expect(prismaMock.template.findFirst).toHaveBeenCalledWith({
      where: { id: "tmpl_owned_by_A", shopId: "shop_B" },
    });
    expect(prismaMock.template.update).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Template not found" });
  });

  it("rejects an over-cap payload server-side without reading or writing", async () => {
    const tooMany = Array.from({ length: 201 }, (_, i) => ({
      ...aRow,
      id: `r${i}`,
      key: `row_${i}`,
    }));

    const result = await saveTemplateForShop("shop_A", "t1", { rows: tooMany });

    expect(result.ok).toBe(false);
    expect(prismaMock.template.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.template.update).not.toHaveBeenCalled();
  });

  it("finalizes a brand-new row's provisional key from its label and updates by id", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      rows: [], // nothing persisted yet -> r1 is provisional
    });
    prismaMock.template.update.mockResolvedValue({ id: "t1" });

    const result = await saveTemplateForShop("shop_A", "t1", { rows: [aRow] });

    expect(result.ok).toBe(true);
    const updateArg = prismaMock.template.update.mock.calls[0][0];
    // The write is shop-scoped itself (defense in depth, priority #1), not only
    // the ownership read above — `shopId` rides along as an extended where filter.
    expect(updateArg.where).toEqual({ id: "t1", shopId: "shop_A" });
    // `row` provisional key was finalized to a slug of the label.
    expect(updateArg.data.rows[0].key).toBe("battery_life");
    // name/status omitted from the payload are not written.
    expect(updateArg.data.name).toBeUndefined();
    expect(updateArg.data.status).toBeUndefined();
  });

  it("never re-derives a key already persisted, even if the label changed", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      // r1 was already finalized to `battery_life` on a prior save.
      rows: [{ ...aRow, key: "battery_life" }],
    });
    prismaMock.template.update.mockResolvedValue({ id: "t1" });

    // Client sends a stale provisional key AND a relabel.
    await saveTemplateForShop("shop_A", "t1", {
      rows: [{ ...aRow, key: "row", label: "Cell Life" }],
    });

    const updateArg = prismaMock.template.update.mock.calls[0][0];
    expect(updateArg.data.rows[0].key).toBe("battery_life");
  });

  it("validates and writes name + status when provided", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      rows: [],
    });
    prismaMock.template.update.mockResolvedValue({ id: "t1" });

    await saveTemplateForShop("shop_A", "t1", {
      rows: [],
      name: "  Renamed  ",
      status: "ACTIVE",
    });

    const updateArg = prismaMock.template.update.mock.calls[0][0];
    expect(updateArg.data.name).toBe("Renamed");
    expect(updateArg.data.status).toBe("ACTIVE");
  });

  it("leaves styling UNTOUCHED when the payload omits it — a rows-only save can never clobber a template's look", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      rows: [],
    });
    prismaMock.template.update.mockResolvedValue({ id: "t1" });

    await saveTemplateForShop("shop_A", "t1", { rows: [aRow] });

    const updateArg = prismaMock.template.update.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty("styling");
  });

  it("persists styling as a full-column nested upsert (explicit nulls included) inside the shop-scoped update", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      rows: [],
    });
    prismaMock.template.update.mockResolvedValue({ id: "t1" });

    // The wire shape is overrides-only (Step 1): one knob set, rest absent.
    await saveTemplateForShop("shop_A", "t1", {
      rows: [],
      styling: { rowDividerStyle: "STRIPES" },
    });

    const updateArg = prismaMock.template.update.mock.calls[0][0];
    // The styling write only exists inside the shop-scoped template update —
    // the isolation answer for a model with no shopId column.
    expect(updateArg.where).toEqual({ id: "t1", shopId: "shop_A" });
    const expectedColumns = {
      ...ALL_DEFAULT_COLUMNS,
      rowDividerStyle: "STRIPES",
    };
    // Upsert: create (lazy first row) and update (full replace) are the SAME
    // full-column shape — a knob back at default writes an explicit null.
    expect(updateArg.data.styling).toEqual({
      upsert: { create: expectedColumns, update: expectedColumns },
    });
  });

  it("degrades a malformed styling payload to the all-defaults column shape — the tolerant parse never blocks a save", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      rows: [],
    });
    prismaMock.template.update.mockResolvedValue({ id: "t1" });

    const result = await saveTemplateForShop("shop_A", "t1", {
      rows: [aRow],
      styling: "not-an-object",
    });

    expect(result.ok).toBe(true);
    const updateArg = prismaMock.template.update.mock.calls[0][0];
    expect(updateArg.data.styling).toEqual({
      upsert: { create: ALL_DEFAULT_COLUMNS, update: ALL_DEFAULT_COLUMNS },
    });
  });

  it("blocks a cross-shop styling write at the ownership read (priority #1) — nothing reaches Prisma", async () => {
    prismaMock.template.findFirst.mockResolvedValue(null);

    const result = await saveTemplateForShop("shop_B", "tmpl_owned_by_A", {
      rows: [],
      styling: { rowDividerStyle: "STRIPES" },
    });

    expect(result).toEqual({ ok: false, error: "Template not found" });
    expect(prismaMock.template.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid name without writing", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      rows: [],
    });

    const result = await saveTemplateForShop("shop_A", "t1", {
      rows: [],
      name: "   ",
    });

    expect(result).toEqual({ ok: false, error: "Name is required" });
    expect(prismaMock.template.update).not.toHaveBeenCalled();
  });

  it("returns ok:false (not a throw) when the write fails", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      rows: [],
    });
    prismaMock.template.update.mockRejectedValue(new Error("db down"));

    const result = await saveTemplateForShop("shop_A", "t1", { rows: [] });

    expect(result).toEqual({ ok: false, error: "Could not save template" });
  });
});

describe("setTemplateMetaobjectRef", () => {
  it("writes the GID + handle scoped to the shop's own template", async () => {
    prismaMock.template.update.mockResolvedValue({ id: "t1" });

    await setTemplateMetaobjectRef(
      "shop_A",
      "t1",
      "gid://shopify/Metaobject/9",
      "template-t1",
    );

    // `update` (not `updateMany`): the `{ id, shopId }` where-unique surfaces a
    // missing/cross-shop row as P2025 instead of silently no-opping.
    expect(prismaMock.template.update).toHaveBeenCalledWith({
      where: { id: "t1", shopId: "shop_A" },
      data: {
        shopifyMetaobjectGid: "gid://shopify/Metaobject/9",
        shopifyMetaobjectHandle: "template-t1",
      },
    });
  });

  it("propagates the throw when no row matches (id/shopId mismatch)", async () => {
    prismaMock.template.update.mockRejectedValue(new Error("P2025"));

    await expect(
      setTemplateMetaobjectRef("shop_A", "t1", "gid://x", "h"),
    ).rejects.toThrow();
  });
});

describe("renameTemplateForShop", () => {
  it("rejects an empty/whitespace name without writing", async () => {
    const result = await renameTemplateForShop("shop_A", "t1", "   ");

    expect(result).toEqual({ ok: false, error: "Name is required" });
    expect(prismaMock.template.update).not.toHaveBeenCalled();
  });

  it("rejects a name longer than NAME_MAX_LENGTH without writing", async () => {
    const result = await renameTemplateForShop(
      "shop_A",
      "t1",
      "a".repeat(NAME_MAX_LENGTH + 1),
    );

    expect(result).toEqual({
      ok: false,
      error: `Name must be ${NAME_MAX_LENGTH} characters or fewer`,
    });
    expect(prismaMock.template.update).not.toHaveBeenCalled();
  });

  it("writes ONLY a trimmed name, shop-scoped (rows + status untouched)", async () => {
    prismaMock.template.update.mockResolvedValue({ id: "t1", name: "Renamed" });

    const result = await renameTemplateForShop("shop_A", "t1", "  Renamed  ");

    // The write is shop-scoped itself (priority #1): `shopId` rides along as an
    // extended where-unique filter, so a foreign id can never be renamed.
    expect(prismaMock.template.update).toHaveBeenCalledWith({
      where: { id: "t1", shopId: "shop_A" },
      data: { name: "Renamed" },
    });
    // Only `name` is written — `rows` and `status` are absent from the payload,
    // so they can never be clobbered by a rename.
    const updateArg = prismaMock.template.update.mock.calls[0][0];
    expect(updateArg.data).toEqual({ name: "Renamed" });
    expect(result).toEqual({ ok: true, data: { id: "t1", name: "Renamed" } });
  });

  it("is a no-op cross-shop: a foreign {id, shopId} throws P2025 → ok:false (other shop untouched)", async () => {
    // The template belongs to shop_A; shop_B asks to rename it. The {id, shopId}
    // where-unique matches no row → Prisma throws P2025, caught as ok:false.
    prismaMock.template.update.mockRejectedValue(new Error("P2025"));

    const result = await renameTemplateForShop(
      "shop_B",
      "tmpl_owned_by_A",
      "Hijacked",
    );

    expect(prismaMock.template.update).toHaveBeenCalledWith({
      where: { id: "tmpl_owned_by_A", shopId: "shop_B" },
      data: { name: "Hijacked" },
    });
    expect(result).toEqual({ ok: false, error: "Could not rename template" });
  });
});

describe("setTemplateStatusForShop", () => {
  it("rejects an unknown status without reading or writing", async () => {
    const result = await setTemplateStatusForShop("shop_A", "t1", "PUBLISHED");

    expect(result).toEqual({ ok: false, error: "Invalid status" });
    expect(prismaMock.template.update).not.toHaveBeenCalled();
  });

  it("rejects a non-string status without writing", async () => {
    const result = await setTemplateStatusForShop("shop_A", "t1", undefined);

    expect(result).toEqual({ ok: false, error: "Invalid status" });
    expect(prismaMock.template.update).not.toHaveBeenCalled();
  });

  it("writes ONLY the status, shop-scoped (rows + name untouched)", async () => {
    const updated = { id: "t1", status: "ACTIVE" };
    prismaMock.template.update.mockResolvedValue(updated);

    const result = await setTemplateStatusForShop("shop_A", "t1", "ACTIVE");

    // The write is shop-scoped itself (priority #1): `shopId` rides along as an
    // extended where-unique filter, so a foreign id can never be re-statused.
    expect(prismaMock.template.update).toHaveBeenCalledWith({
      where: { id: "t1", shopId: "shop_A" },
      data: { status: "ACTIVE" },
      // Read-side only (feature 57 Step 7): the caller re-syncs the metaobject
      // from this row, and every sync REPLACES the storefront's styling — so
      // without the relation an ACTIVE→DRAFT→ACTIVE flip would reset a
      // merchant's live table to defaults. Covered end-to-end in
      // `app/shopify/templateSync.test.ts`.
      include: { styling: true },
    });
    // Only `status` is written — `rows` and `name` are absent from the payload.
    const updateArg = prismaMock.template.update.mock.calls[0][0];
    expect(updateArg.data).toEqual({ status: "ACTIVE" });
    expect(result).toEqual({ ok: true, data: updated });
  });

  it("is a no-op cross-shop: a foreign {id, shopId} throws P2025 → ok:false", async () => {
    // The template belongs to shop_A; shop_B asks to change its status. The
    // {id, shopId} where-unique matches no row → Prisma throws P2025, caught as
    // ok:false (the other shop's template is untouched).
    prismaMock.template.update.mockRejectedValue(new Error("P2025"));

    const result = await setTemplateStatusForShop(
      "shop_B",
      "tmpl_owned_by_A",
      "ACTIVE",
    );

    expect(prismaMock.template.update).toHaveBeenCalledWith({
      where: { id: "tmpl_owned_by_A", shopId: "shop_B" },
      data: { status: "ACTIVE" },
      include: { styling: true },
    });
    expect(result).toEqual({ ok: false, error: "Could not update status" });
  });
});

describe("duplicateTemplateForShop", () => {
  const sourceRows = [
    {
      id: "s1",
      key: "display",
      rowType: "SECTION_HEADER",
      label: "Display",
      hideWhenEmpty: false,
    },
    {
      id: "r1",
      key: "screen_size",
      rowType: "DATA",
      label: "Screen Size",
      valueParts: [{ type: "TEXT", text: "13.6 inch" }],
      hideWhenEmpty: true,
    },
  ];

  it("blocks a cross-shop duplicate: a foreign id reads nothing and creates nothing (priority #1)", async () => {
    prismaMock.template.findFirst.mockResolvedValue(null);

    const result = await duplicateTemplateForShop("shop_B", "tmpl_owned_by_A");

    expect(prismaMock.template.findFirst).toHaveBeenCalledWith({
      where: { id: "tmpl_owned_by_A", shopId: "shop_B" },
      include: { styling: true },
    });
    expect(prismaMock.template.create).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Template not found" });
  });

  it("creates a DRAFT copy named '(copy)', shop-scoped, with fresh row ids and keys reconciled from labels", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      name: "Laptop Specs",
      status: "ACTIVE",
      rows: sourceRows,
    });
    prismaMock.template.create.mockResolvedValue({ id: "t2" });

    const result = await duplicateTemplateForShop("shop_A", "t1");

    expect(result.ok).toBe(true);
    const createArg = prismaMock.template.create.mock.calls[0][0];
    // Shop isolation: the copy is created under the caller's shop.
    expect(createArg.data.shopId).toBe("shop_A");
    // A fresh copy is never live on the storefront.
    expect(createArg.data.status).toBe("DRAFT");
    // " (copy)" courtesy suffix.
    expect(createArg.data.name).toBe("Laptop Specs (copy)");
    // Keys are reconciled against [] (re-derived from labels) — same as the source
    // here since the labels slug identically.
    expect(createArg.data.rows.map((r: { key: string }) => r.key)).toEqual([
      "display",
      "screen_size",
    ]);
    // Row ids are re-minted: no source id survives into the copy (ids never reused).
    const newIds = createArg.data.rows.map((r: { id: string }) => r.id);
    expect(newIds).not.toContain("s1");
    expect(newIds).not.toContain("r1");
  });

  it("copies the source's styling row in full — columns, basedOnPreset provenance, extraStyles — with no source id/templateId (copy semantics, feature 57 Step 4)", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      name: "Laptop Specs",
      status: "ACTIVE",
      rows: sourceRows,
      styling: {
        id: "sty_1",
        templateId: "t1",
        ...stylingToDbColumns(FULLY_OVERRIDDEN),
        basedOnPreset: "striped",
        extraStyles: { future: true },
      },
    });
    prismaMock.template.create.mockResolvedValue({ id: "t2" });

    await duplicateTemplateForShop("shop_A", "t1");

    const createArg = prismaMock.template.create.mock.calls[0][0];
    expect(createArg.data.styling).toEqual({
      create: {
        ...stylingToDbColumns(FULLY_OVERRIDDEN),
        basedOnPreset: "striped",
        extraStyles: { future: true },
      },
    });
    // The copy's row is its own: no source styling id / templateId survives.
    expect(createArg.data.styling.create).not.toHaveProperty("id");
    expect(createArg.data.styling.create).not.toHaveProperty("templateId");
  });

  it("creates no styling for an unstyled source (absence = all defaults)", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      name: "Laptop Specs",
      status: "DRAFT",
      rows: [],
      styling: null,
    });
    prismaMock.template.create.mockResolvedValue({ id: "t2" });

    await duplicateTemplateForShop("shop_A", "t1");

    const createArg = prismaMock.template.create.mock.calls[0][0];
    expect(createArg.data).not.toHaveProperty("styling");
  });

  it("returns ok:false (not a throw) when the create write fails", async () => {
    prismaMock.template.findFirst.mockResolvedValue({
      id: "t1",
      shopId: "shop_A",
      name: "Specs",
      status: "DRAFT",
      rows: [],
    });
    prismaMock.template.create.mockRejectedValue(new Error("db down"));

    const result = await duplicateTemplateForShop("shop_A", "t1");

    expect(result).toEqual({
      ok: false,
      error: "Could not duplicate template",
    });
  });
});

describe("deleteTemplateForShop — shop isolation (priority #1)", () => {
  it("scopes the delete by id AND shopId (styling removal is the FK cascade's job — no explicit styling delete)", async () => {
    prismaMock.template.deleteMany.mockResolvedValue({ count: 1 });

    const result = await deleteTemplateForShop("shop_A", "t1");

    expect(prismaMock.template.deleteMany).toHaveBeenCalledWith({
      where: { id: "t1", shopId: "shop_A" },
    });
    expect(result).toEqual({ ok: true, count: 1 });
    // Feature 57 Step 4: TableStyling has `onDelete: Cascade` on its template
    // FK, so the ONE deleteMany above is the whole delete path. The prisma mock
    // has no `tableStyling` delegate at all — any code path reaching for one
    // would throw here, which is exactly the pin this comment documents.
  });

  it("is a no-op for a cross-shop id (count 0) — deletes nothing from the other shop", async () => {
    // The id belongs to shop_A; shop_B asks to delete it. The shopId filter means
    // deleteMany matches no row and removes nothing.
    prismaMock.template.deleteMany.mockResolvedValue({ count: 0 });

    const result = await deleteTemplateForShop("shop_B", "tmpl_owned_by_A");

    expect(prismaMock.template.deleteMany).toHaveBeenCalledWith({
      where: { id: "tmpl_owned_by_A", shopId: "shop_B" },
    });
    expect(result).toEqual({ ok: true, count: 0 });
  });
});
