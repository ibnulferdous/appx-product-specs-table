import { describe, it, expect } from "vitest";
import {
  parsePendingScope,
  parsePendingExcludes,
  reconcileExcludes,
  sameGidSet,
  selectorSetKey,
} from "./pendingAssignment";
import type { ScopeSelector } from "../../utils/assignmentOverlap";

const P = (id: string) => `gid://shopify/Product/${id}`;
const C = (id: string) => `gid://shopify/Collection/${id}`;
const sel = (scope: string, scopeValue: string | null): ScopeSelector =>
  ({ scope, scopeValue }) as ScopeSelector;

describe("parsePendingScope (feature 46)", () => {
  it("scope absent / not a string → provided:false, empty set", () => {
    expect(parsePendingScope({})).toEqual({
      ok: true,
      provided: false,
      selectors: [],
    });
  });

  it("NONE → provided:true, empty set (clear)", () => {
    expect(parsePendingScope({ scope: "NONE" })).toEqual({
      ok: true,
      provided: true,
      selectors: [],
    });
  });

  it("ALL_PRODUCTS → a single null-valued selector (value ignored)", () => {
    expect(parsePendingScope({ scope: "ALL_PRODUCTS" })).toEqual({
      ok: true,
      provided: true,
      selectors: [{ scope: "ALL_PRODUCTS", scopeValue: null }],
    });
  });

  it("multi-value scopeValues → N deduped selectors", () => {
    const result = parsePendingScope({
      scope: "PRODUCT",
      scopeValues: [P("1"), P("2"), P("1")],
    });
    expect(result).toEqual({
      ok: true,
      provided: true,
      selectors: [
        { scope: "PRODUCT", scopeValue: P("1") },
        { scope: "PRODUCT", scopeValue: P("2") },
      ],
    });
  });

  it("legacy single scopeValue → a 1-element set", () => {
    expect(parsePendingScope({ scope: "PRODUCT", scopeValue: P("1") })).toEqual(
      {
        ok: true,
        provided: true,
        selectors: [{ scope: "PRODUCT", scopeValue: P("1") }],
      },
    );
  });

  it("scopeValues wins over a stray legacy scopeValue", () => {
    const result = parsePendingScope({
      scope: "COLLECTION",
      scopeValue: C("9"),
      scopeValues: [C("1"), C("2")],
    });
    expect(result.ok && result.selectors).toEqual([
      { scope: "COLLECTION", scopeValue: C("1") },
      { scope: "COLLECTION", scopeValue: C("2") },
    ]);
  });

  it("a valued kind with an empty value set is rejected (incomplete)", () => {
    expect(parsePendingScope({ scope: "PRODUCT", scopeValues: [] })).toEqual({
      ok: false,
      error: "This scope requires a value",
    });
    expect(parsePendingScope({ scope: "VENDOR" })).toEqual({
      ok: false,
      error: "This scope requires a value",
    });
  });

  it("an invalid GID rejects the whole parse", () => {
    expect(
      parsePendingScope({
        scope: "PRODUCT",
        scopeValues: [P("1"), "not-a-gid"],
      }).ok,
    ).toBe(false);
  });
});

describe("selectorSetKey (order-independent set diff)", () => {
  const key = (s: ScopeSelector[]) => selectorSetKey(s);

  it("a member swap of equal cardinality changes the key", () => {
    expect(key([sel("PRODUCT", P("A")), sel("PRODUCT", P("B"))])).not.toBe(
      key([sel("PRODUCT", P("A")), sel("PRODUCT", P("C"))]),
    );
  });

  it("a pure reorder does NOT change the key", () => {
    expect(key([sel("PRODUCT", P("A")), sel("PRODUCT", P("B"))])).toBe(
      key([sel("PRODUCT", P("B")), sel("PRODUCT", P("A"))]),
    );
  });

  it("adding a member changes the key", () => {
    expect(key([sel("PRODUCT", P("A"))])).not.toBe(
      key([sel("PRODUCT", P("A")), sel("PRODUCT", P("B"))]),
    );
  });

  it("a kind change (same raw value) changes the key", () => {
    expect(key([sel("PRODUCT", P("A"))])).not.toBe(
      key([sel("COLLECTION", P("A"))]),
    );
  });

  it("a repeated selector does NOT change the key (deduped set semantics)", () => {
    // [A] and [A, A] are the same SET, so they must key the same — a duplicate
    // must not manufacture a phantom change on the Save diff.
    expect(key([sel("PRODUCT", P("A")), sel("PRODUCT", P("A"))])).toBe(
      key([sel("PRODUCT", P("A"))]),
    );
  });

  it("the empty set (NONE) is the empty string", () => {
    expect(key([])).toBe("");
  });
});

describe("reconcileExcludes (Decision C)", () => {
  it("drops an exclude GID that is in the pending INCLUDE PRODUCT set", () => {
    expect(
      reconcileExcludes([P("X"), P("Y")], [sel("PRODUCT", P("X"))]),
    ).toEqual([P("Y")]);
  });

  it("keeps excludes when the INCLUDE set is broad (no PRODUCT members)", () => {
    expect(reconcileExcludes([P("X")], [sel("ALL_PRODUCTS", null)])).toEqual([
      P("X"),
    ]);
  });

  it("[PRODUCT:X] + excludes [X] → []", () => {
    expect(reconcileExcludes([P("X")], [sel("PRODUCT", P("X"))])).toEqual([]);
  });
});

describe("parsePendingExcludes (feature 45)", () => {
  it("non-array → provided:false", () => {
    expect(parsePendingExcludes({})).toEqual({
      ok: true,
      provided: false,
      gids: [],
    });
  });

  it("array → validated + deduped GIDs", () => {
    expect(
      parsePendingExcludes({ excludes: [P("1"), P("1"), P("2")] }),
    ).toEqual({ ok: true, provided: true, gids: [P("1"), P("2")] });
  });

  it("an invalid (non-product) GID rejects", () => {
    expect(parsePendingExcludes({ excludes: [C("9")] }).ok).toBe(false);
  });
});

describe("sameGidSet", () => {
  it("is order-independent and compares as SETS, not lists", () => {
    expect(sameGidSet([P("1"), P("2")], [P("2"), P("1")])).toBe(true);
    expect(sameGidSet([P("1")], [P("1"), P("2")])).toBe(false);
    expect(sameGidSet([P("1"), P("2")], [P("1"), P("3")])).toBe(false);
    expect(sameGidSet([], [])).toBe(true);
  });

  it("ignores duplicate members (same set, different lengths)", () => {
    // [A, A] and [A] are the same GID set, so they must NOT read as "changed" —
    // a raw length check would wrongly fire the rebuild trigger here.
    expect(sameGidSet([P("1"), P("1")], [P("1")])).toBe(true);
    expect(sameGidSet([P("1"), P("1"), P("2")], [P("2"), P("1")])).toBe(true);
  });
});
