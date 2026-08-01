import { describe, it, expect } from "vitest";
import {
  byteLength,
  measurePayload,
  JSON_METAFIELD_MAX_BYTES,
  BUDGET_WARN_RATIO,
} from "./routingBudget";
import { buildRoutingProjection, type RoutingRule } from "./routingProjection";

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

describe("routing projection byte budgets", () => {
  const HANDLE = `template-${"cl9ebqhxk00003b600tymydho"}`; // cuid() is 25 chars
  const productGid = (n: number) =>
    `gid://shopify/Product/${7000000000000 + n}`;
  const collectionGid = (n: number) =>
    `gid://shopify/Collection/${400000000 + n}`;

  const serialize = (rules: RoutingRule[]) =>
    JSON.stringify(buildRoutingProjection(rules));

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

  it("an empty projection costs 125 bytes of envelope", () => {
    expect(byteLength(serialize([]))).toBe(125);
  });

  /**
   * Largest entry count whose FULL serialized projection still fits.
   *
   * 🔴 Deliberately a search over the real serializer, not
   * `floor((limit - envelope) / perEntry)`. That division is off by one for the
   * array maps, because the first element carries no leading comma — it is how
   * 104's spec predicted 3,445 excludes when the true answer is 3,446. The
   * marginal cost and the total capacity are different questions.
   */
  const maxFit = (make: (n: number) => RoutingRule[]) => {
    let lo = 0;
    let hi = 10000;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (byteLength(serialize(make(mid))) <= JSON_METAFIELD_MAX_BYTES)
        lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  it("🔴 an excludedProductGids entry costs 38 bytes, and 3,446 fit", () => {
    expect(perEntry(excludes)).toBe(38);
    expect(maxFit(excludes)).toBe(3446);
    // The boundary is exact: 3,446 lands precisely ON the ceiling.
    expect(measurePayload(serialize(excludes(3446))).bytes).toBe(
      JSON_METAFIELD_MAX_BYTES,
    );
    expect(measurePayload(serialize(excludes(3447))).level).toBe("over");
  });

  it("a byProduct entry costs 75 bytes, and 1,745 fit", () => {
    expect(perEntry(products)).toBe(75);
    expect(maxFit(products)).toBe(1745);
    expect(measurePayload(serialize(products(1746))).level).toBe("over");
  });

  it("a byCollection entry costs 74 bytes, and 1,769 fit", () => {
    expect(perEntry(collections)).toBe(74);
    expect(maxFit(collections)).toBe(1769);
    expect(measurePayload(serialize(collections(1770))).level).toBe("over");
  });

  it("warns with ~689 carve-outs of runway left — §D6's justification", () => {
    // The warn threshold is only defensible if it leaves room to ACT. Pin the
    // actual runway so retuning BUDGET_WARN_RATIO has to face the consequence.
    expect(measurePayload(serialize(excludes(2756))).level).toBe("ok");
    expect(measurePayload(serialize(excludes(2757))).level).toBe("warn");
    expect(maxFit(excludes) - 2757).toBe(689);
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
