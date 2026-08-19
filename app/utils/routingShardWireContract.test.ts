// The routing-SHARD wire, held against the two Liquid files the rest of the suite
// cannot see (feature 108 — Option 2, metaobject sharding).
//
// The per-product half of routing no longer travels in the `$app:routing` metafield;
// it lives in `$app:appx_routing_shard` metaobjects keyed by `product.id mod N`. That
// makes a SECOND cross-language contract, split across two files:
//
//   - `blocks/spec_table.liquid` computes the bucket (`product.id | modulo: N`) and
//     resolves this product's shard by its constructed handle (`routing-shard-<k>`),
//     then passes it to the resolver. The `modulo:` literal and the shard TYPE string
//     live here — they must match `ROUTING_SHARD_COUNT` / `ROUTING_SHARD_TYPE`.
//   - `snippets/spec-table-resolve.liquid` reads the shard's two json fields
//     (`by_product` / `excluded`) — the field KEYS the writer emits — and must NOT read
//     the old `routing.byProduct` / `routing.excluded` (those keys are gone from v3).
//
// Nothing else enforces agreement: Liquid is outside the TS module graph, and a drift
// (a changed modulus, a renamed field, a reverted `routing.byProduct` read) leaves both
// files internally valid while every product silently routes to the wrong shard or none.
//
// 🔴 Every expectation is DERIVED from the real constants (`ROUTING_SHARD_COUNT`,
// `ROUTING_SHARD_TYPE`, `shardHandle`, `shardFieldValues`), never hand-typed, so
// changing a constant moves this test with it. This is the shard analog of
// `routingWireContract.test.ts` (which covers the broad-tier half). Each guard below is
// proven by breaking it in the noted way.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ROUTING_SHARD_COUNT,
  ROUTING_SHARD_TYPE,
  shardHandle,
  shardFieldValues,
} from "./routingShards";

// Comments stripped FIRST (load-bearing, not tidy): the prose in both files names the
// modulus, the type, the field keys, AND the removed `routing.byProduct` read, so a raw
// scan would pass on the documentation while the code said something else. Same rule and
// reason as `routingWireContract.test.ts`.
const stripComments = (src: string) =>
  src.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "");

const read = (relative: string) =>
  stripComments(
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"),
  );

// The block resolves the shard (bucket + type + handle); the snippet reads its fields.
const block = read(
  "../../extensions/product-specs-table/blocks/spec_table.liquid",
);
const snippet = read(
  "../../extensions/product-specs-table/snippets/spec-table-resolve.liquid",
);

// `routing-shard-` — the handle PREFIX the block must build. Derived from the real
// `shardHandle` so a scheme change (e.g. `shard-<k>`) moves this expectation.
const HANDLE_PREFIX = shardHandle(0).replace(/0$/, "");

// The shard field keys the writer emits. `by_product` / `excluded` are READ on the
// storefront; `wire_version` is a debug-only tag the resolver must NOT branch on.
const SHARD_FIELD_KEYS = Object.keys(
  shardFieldValues({ byProduct: {}, excluded: {} }),
);
const READ_FIELDS = ["by_product", "excluded"];
const DEBUG_ONLY_FIELD = "wire_version";

describe("spec_table.liquid (block) — the routing-shard resolution contract", () => {
  it("buckets on `product.id | modulo: ROUTING_SHARD_COUNT` — the exact modulus", () => {
    // Break it: change the block's `modulo: 1024` (or ROUTING_SHARD_COUNT) and this
    // fails. A mismatched modulus buckets a product to a shard that was never written.
    const modulo = new RegExp(`\\|\\s*modulo:\\s*${ROUTING_SHARD_COUNT}\\b`);
    expect(
      block,
      `block must bucket with 'modulo: ${ROUTING_SHARD_COUNT}' (= ROUTING_SHARD_COUNT)`,
    ).toMatch(modulo);
  });

  it("resolves the shard from the ROUTING_SHARD_TYPE metaobject namespace", () => {
    // Break it: rename the type on either side. The lookup would target a metaobject
    // type that does not exist and resolve nil for every product.
    expect(block).toContain(ROUTING_SHARD_TYPE);
  });

  it("builds the `routing-shard-<k>` handle the writer upserts to", () => {
    // Break it: change the handle scheme in `shardHandle` OR the block. The block's
    // constructed handle would no longer name the metaobject the writer created.
    expect(block).toContain(HANDLE_PREFIX);
  });
});

describe("spec-table-resolve.liquid (snippet) — reads the shard, not the old wire", () => {
  it("reads the `by_product` and `excluded` shard fields the writer emits", () => {
    // Break it: rename a shard field in `shardFieldValues`/the TOML without updating the
    // snippet. The resolver would read a field that is always nil.
    for (const field of READ_FIELDS) {
      expect(SHARD_FIELD_KEYS, `${field} must be a real shard field`).toContain(
        field,
      );
      expect(snippet, `snippet must read shard.${field}`).toMatch(
        new RegExp(`shard\\.${field}\\b`),
      );
    }
  });

  it("does NOT branch on the debug-only `wire_version` field", () => {
    // `wire_version` exists for diagnostics, not resolution. Reading it on the
    // storefront would couple render behavior to a tag meant to be inert.
    expect(SHARD_FIELD_KEYS).toContain(DEBUG_ONLY_FIELD);
    expect(snippet).not.toContain(`shard.${DEBUG_ONLY_FIELD}`);
  });

  it("no longer reads `routing.byProduct` / `routing.excluded` — those moved to the shard", () => {
    // Break it: revert either per-product read to the shop wire. On v3 data both keys
    // are absent from `routing`, so the read resolves nil and per-product routing dies
    // silently while the broad tiers still work — the nastiest possible half-break.
    expect(snippet).not.toMatch(/routing\.byProduct\b/);
    expect(snippet).not.toMatch(/routing\.excluded\b/);
  });

  it("builds NO GID token — shards are keyed by bare numeric id, like the broad wire", () => {
    // The shard `by_product` / `excluded` keys are bare `product.id`, so the snippet
    // must not reconstruct `gid://shopify/Product/...`. Same guard the broad wire uses.
    expect(snippet).not.toContain("gid://shopify/");
    expect(block).not.toContain("gid://shopify/");
  });
});
