import { describe, it, expect } from "vitest";
import {
  byteLength,
  measurePayload,
  JSON_METAFIELD_MAX_BYTES,
  BUDGET_WARN_RATIO,
} from "./routingBudget";
import {
  buildRoutingProjection,
  compactRoutingForDelivery,
  type RoutingRule,
} from "./routingProjection";

// Step 104. Two jobs here:
//   1. Pin the arithmetic — bytes (not code units), and the exactly-at-the-ceiling
//      boundary, which is the single most likely bug in the module.
//   2. RE-DERIVE the per-entry budgets in `data-model.md` §14 from the REAL
//      projection builder, so a change to `RoutingProjection`'s shape moves the
//      documented numbers instead of silently invalidating them.

describe("byteLength — bytes, never UTF-16 code units", () => {
  it("counts an empty string as 0", () => {
    expect(byteLength("")).toBe(0);
  });

  it("matches .length for pure ASCII (the only case where they agree)", () => {
    expect(byteLength("gid://shopify/Product/1")).toBe(23);
  });

  it("🔴 counts a 2-byte accented character as 2, not 1", () => {
    // A merchant vendor name: 6 two-byte characters among 10. `.length` is 10;
    // the wire cost is 16 — a 60% under-report if measured as code units.
    const vendor = "Ünïcödé Çø";
    expect(vendor.length).toBe(10);
    expect(byteLength(vendor)).toBe(16);
  });

  it("🔴 counts 3-byte CJK correctly", () => {
    const productType = "電子機器"; // 4 code units, 12 bytes
    expect(productType.length).toBe(4);
    expect(byteLength(productType)).toBe(12);
  });

  it("🔴 counts a 4-byte emoji as 4 (and it is 2 code units)", () => {
    expect("🔌".length).toBe(2);
    expect(byteLength("🔌")).toBe(4);
  });
});

describe("measurePayload — the ceiling boundary", () => {
  const at = (bytes: number) => "a".repeat(bytes); // ASCII: 1 char === 1 byte

  it("pins the ceiling at 131072 (128 * 1024), not 128000", () => {
    // Guards §D4. A `128_000` "correction" shrinks every budget by 2.3%.
    expect(JSON_METAFIELD_MAX_BYTES).toBe(131072);
  });

  it("does NOT call a payload exactly at the limit `over` — Shopify accepts it", () => {
    // The off-by-one that decides the module. At exactly the ceiling the payload
    // is writable, so it must not be `over`; it is `warn` because it is also at
    // 100% of budget, which is exactly what a caller should be told.
    const budget = measurePayload(at(JSON_METAFIELD_MAX_BYTES));
    expect(budget.bytes).toBe(JSON_METAFIELD_MAX_BYTES);
    expect(budget.level).toBe("warn");
    expect(budget.remaining).toBe(0);
  });

  it("treats limit + 1 as over", () => {
    expect(measurePayload(at(JSON_METAFIELD_MAX_BYTES + 1)).level).toBe("over");
  });

  it("reports remaining headroom, floored at 0 when over", () => {
    expect(measurePayload(at(100)).remaining).toBe(
      JSON_METAFIELD_MAX_BYTES - 100,
    );
    expect(measurePayload(at(JSON_METAFIELD_MAX_BYTES + 500)).remaining).toBe(
      0,
    );
  });

  it("warns at exactly the ratio, not one byte late", () => {
    const threshold = Math.ceil(JSON_METAFIELD_MAX_BYTES * BUDGET_WARN_RATIO);
    expect(measurePayload(at(threshold - 1)).level).toBe("ok");
    expect(measurePayload(at(threshold)).level).toBe("warn");
  });

  it("is ok well under the threshold and reports a ratio", () => {
    const budget = measurePayload(at(1024));
    expect(budget.level).toBe("ok");
    expect(budget.ratio).toBeCloseTo(1024 / JSON_METAFIELD_MAX_BYTES, 10);
    expect(budget.limit).toBe(JSON_METAFIELD_MAX_BYTES);
  });

  it("accepts an explicit limit (so 105 can measure other fields)", () => {
    expect(measurePayload(at(50), 40).level).toBe("over");
  });
});

// --- The documented budgets (data-model.md §14) ------------------------------
// Derived from the REAL builder rather than hand-written literals. Shopify product
// ids are currently 13 digits and collection ids 9-10; the handle is
// `template-{cuid}` (34 chars). Those three facts are what make the numbers below
// true, so they are spelled out rather than buried in a fixture.
//
// 🔴 These measure the DELIVERY WIRE — `compactRoutingForDelivery(projection)` — not
// the raw projection. The compact copy is the one written to the `json` metafield, so
// it is the only encoding the 128KB ceiling gates (Option 1, data-model §9/§14). The
// un-compacted projection lives in Postgres jsonb, which is effectively unbounded.

describe("routing projection byte budgets", () => {
  const HANDLE = `template-${"cl9ebqhxk00003b600tymydho"}`; // cuid() is 25 chars
  const productGid = (n: number) =>
    `gid://shopify/Product/${7000000000000 + n}`;
  const collectionGid = (n: number) =>
    `gid://shopify/Collection/${400000000 + n}`;

  const serialize = (rules: RoutingRule[]) =>
    JSON.stringify(compactRoutingForDelivery(buildRoutingProjection(rules)));

  /** Marginal bytes added by the Nth entry, measured on the real builder. */
  const perEntry = (make: (n: number) => RoutingRule[]) =>
    byteLength(serialize(make(2))) - byteLength(serialize(make(1)));

  const excludes = (n: number): RoutingRule[] =>
    Array.from({ length: n }, (_, i) => ({
      scope: "PRODUCT" as const,
      scopeValue: productGid(i),
      mode: "EXCLUDE" as const,
      templateHandle: HANDLE,
    }));

  const products = (n: number): RoutingRule[] =>
    Array.from({ length: n }, (_, i) => ({
      scope: "PRODUCT" as const,
      scopeValue: productGid(i),
      mode: "INCLUDE" as const,
      templateHandle: HANDLE,
    }));

  const collections = (n: number): RoutingRule[] =>
    Array.from({ length: n }, (_, i) => ({
      scope: "COLLECTION" as const,
      scopeValue: collectionGid(i),
      mode: "INCLUDE" as const,
      templateHandle: HANDLE,
    }));

  it("HANDLE is the real 34-char shape (the byProduct numbers depend on it)", () => {
    expect(HANDLE).toHaveLength(34);
  });

  it("an empty compact wire costs 104 bytes of envelope", () => {
    expect(byteLength(serialize([]))).toBe(104);
  });

  /**
   * Largest entry count whose FULL serialized wire still fits.
   *
   * 🔴 Deliberately a search over the real serializer, not
   * `floor((limit - envelope) / perEntry)`. That division is off by one, because
   * the first entry of a map carries no leading comma — marginal cost and total
   * capacity are different questions. (Under the pre-Option-1 array encoding this is
   * how 104's spec predicted 3,445 excludes when the true answer was 3,446.)
   */
  const maxFit = (make: (n: number) => RoutingRule[]) => {
    let lo = 0;
    let hi = 20000;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (byteLength(serialize(make(mid))) <= JSON_METAFIELD_MAX_BYTES)
        lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  it("🔴 a compact excluded entry costs 18 bytes, and 7,276 fit", () => {
    expect(perEntry(excludes)).toBe(18);
    expect(maxFit(excludes)).toBe(7276);
    expect(measurePayload(serialize(excludes(7276))).bytes).toBeLessThanOrEqual(
      JSON_METAFIELD_MAX_BYTES,
    );
    expect(measurePayload(serialize(excludes(7277))).level).toBe("over");
  });

  it("a compact byProduct entry costs 18 bytes, and 7,274 fit", () => {
    // ~4.2x the pre-Option-1 ceiling of 1,745: the full handle written on every
    // entry (75 bytes) collapses to an interned index (18 bytes).
    expect(perEntry(products)).toBe(18);
    expect(maxFit(products)).toBe(7274);
    expect(measurePayload(serialize(products(7275))).level).toBe("over");
  });

  it("a compact byCollection entry costs 14 bytes, and 9,352 fit", () => {
    expect(perEntry(collections)).toBe(14);
    expect(maxFit(collections)).toBe(9352);
    expect(measurePayload(serialize(collections(9353))).level).toBe("over");
  });

  it("warns with ~1,456 carve-outs of runway left — §D6's justification", () => {
    // The warn threshold is only defensible if it leaves room to ACT. Pin the
    // actual runway so retuning BUDGET_WARN_RATIO has to face the consequence.
    expect(measurePayload(serialize(excludes(5819))).level).toBe("ok");
    expect(measurePayload(serialize(excludes(5820))).level).toBe("warn");
    expect(maxFit(excludes) - 5820).toBe(1456);
  });

  it("byType/byVendor have no per-entry number — the key is unbounded merchant text", () => {
    const short = serialize([
      {
        scope: "VENDOR",
        scopeValue: "Acme",
        mode: "INCLUDE",
        templateHandle: HANDLE,
      },
    ]);
    const long = serialize([
      {
        scope: "VENDOR",
        scopeValue: "A".repeat(500),
        mode: "INCLUDE",
        templateHandle: HANDLE,
      },
    ]);
    // Same entry COUNT, wildly different byte cost — which is exactly why §14
    // records a count bound for these two maps and no size bound.
    expect(byteLength(long) - byteLength(short)).toBe(496);
  });
});
