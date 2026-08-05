// The compact routing WIRE (v3, BROAD tiers only), held against the one file the rest
// of the suite cannot see.
//
// `compactRoutingForDelivery` (routingProjection.ts) writes the `$app:routing`
// metafield, and `spec-table-resolve.liquid` reads it back. The two are a private
// contract: bare-id keys, `by*`/`def` values as indices into `handles[]`. As of wire v3
// (feature 108) the two per-product maps `byProduct` / `excluded` have LEFT this wire for
// the shard metaobjects — the snippet reads them from the `shard` param instead, and
// `routingShardWireContract.test.ts` guards THAT half of the contract. This test covers
// the broad tiers only. Nothing enforces that the two ends agree, because Liquid is
// outside the TypeScript module graph — a keyword rename on one side (or a revert to the
// old GID-keyed `RoutingProjection` names) leaves both files internally valid and the
// storefront resolving NOTHING on every product. Silent, and merchant-facing.
//
// This is the routing analog of `specTableLiquidDefaultsContract.test.ts`: a
// source-text test is the only place a TS shape and a Liquid file can be held
// together. It does NOT re-check resolution logic (that is covered by the projection
// + budget tests and by live verification); it checks only that the two ends name the
// same wire.
//
// 🔴 The source of truth is DERIVED, never hand-listed: the wire key set comes from
// calling the real `compactRoutingForDelivery`, so adding or renaming a compact map
// moves this test's expectation with it instead of silently invalidating it.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildRoutingProjection,
  compactRoutingForDelivery,
} from "./routingProjection";

// Comments stripped FIRST, and load-bearing rather than tidy: the snippet's prose
// names every wire key AND the old `gid://...` token it no longer builds, so a raw
// scan would pass on the documentation while the code said something else. (Same rule,
// same reason, as `specTableLiquidDefaultsContract.test.ts`.)
const liquid = readFileSync(
  fileURLToPath(
    new URL(
      "../../extensions/product-specs-table/snippets/spec-table-resolve.liquid",
      import.meta.url,
    ),
  ),
  "utf8",
).replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "");

// The authoritative wire key set — whatever the real compactor emits. An empty
// projection still carries every key (the return literal always assigns all of them).
const WIRE_KEYS = Object.keys(
  compactRoutingForDelivery(buildRoutingProjection([])),
).sort();

// Every `routing.<key>` the code reads (map accesses + scalar tiers). `routing`
// alone (`routing != blank`) has no dot and is not captured.
const readKeys = Array.from(
  liquid.matchAll(/\brouting\.([a-zA-Z_][a-zA-Z0-9_]*)/g),
  (m) => m[1],
);
const readKeySet = [...new Set(readKeys)].sort();

describe("spec-table-resolve.liquid — the compact routing wire contract", () => {
  it("reads only keys the compact wire actually emits", () => {
    // Guards against a revert to the old `RoutingProjection` names
    // (`excludedProductGids`, `defaultTemplateHandle`) or a stray `byTag` read — any
    // of which resolves to nil on the real wire and silently kills routing.
    const stale = readKeySet.filter((k) => !WIRE_KEYS.includes(k));
    expect(
      stale,
      `spec-table-resolve.liquid reads routing.${stale.join(", routing.")} — not a key compactRoutingForDelivery emits`,
    ).toEqual([]);
  });

  it("consumes every wire map except the version int", () => {
    // The mirror of the stale-key test: a wire key the resolver DOESN'T read is
    // either the version (`v`, deliberately ignored) or a map that ships to the
    // storefront and is never consumed. Adding a compact map — or deleting the
    // `handles` deref / a tier lookup — fails here until the resolver is updated.
    const unread = WIRE_KEYS.filter((k) => !readKeySet.includes(k));
    expect(unread).toEqual(["v"]);
  });

  it("builds NO GID token — the compact wire is keyed by bare numeric id", () => {
    // The direct "reader agrees with the wire" check. The compaction dropped the
    // `'gid://shopify/Product/' | append: product.id` construction; if it reappears,
    // the Liquid is keying the map with GIDs the wire no longer contains.
    expect(liquid).not.toContain("gid://shopify/");
  });

  it("dereferences the handle table (values are indices, not handles)", () => {
    // The one access that makes interning work. Without `routing.handles[...]` every
    // tier resolves to an integer index that is echoed as the "handle" — a template
    // lookup that can never match.
    expect(liquid).toMatch(/routing\.handles\[/);
  });
});
