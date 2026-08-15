import { describe, it, expect, beforeAll, vi } from "vitest";
import { ApiVersion } from "@shopify/shopify-app-react-router/server";
import { JSON_METAFIELD_MAX_BYTES } from "./utils/routingBudget";

// `shopify.server.ts` calls `shopifyApp()` at module scope, which throws on a
// blank appUrl — so the module is imported dynamically after stubbing the env it
// validates. The values are placeholders; only the exported `apiVersion` is read.
// Prisma is mocked because the module constructs a PrismaSessionStorage.
vi.mock("./db.server", () => ({
  default: {
    session: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

let apiVersion: string;

beforeAll(async () => {
  vi.stubEnv("SHOPIFY_API_KEY", "test-key");
  vi.stubEnv("SHOPIFY_API_SECRET", "test-secret");
  vi.stubEnv("SHOPIFY_APP_URL", "https://example.test");
  vi.stubEnv("SCOPES", "read_products");
  ({ apiVersion } = await import("./shopify.server"));
});

// --- API version tripwire (step 104 §D5) ------------------------------------
//
// 🔴 This file exists to FAIL. It is not testing behaviour; it is a gate on a
// one-line change that looks routine and is not.
//
// Shopify limits `json` metafield WRITES to 128KB from API version 2026-04. Apps
// that used json fields before 2026-04-01 keep the old 2MB limit — this app does
// NOT qualify: its first `type = "json"` declaration landed 2026-07-02 (commit
// 6d1cd3a), after the cutoff. The only reason the ceiling is not live today is
// that `shopify.server.ts` pins the runtime Admin client to `ApiVersion.January26`
// (2026-01) — one release below the cutoff. Any bump to 2026-04 or later trips this.
//
// So bumping that constant — exactly the kind of edit a dependency-update or
// "use the latest API" chore produces — silently converts a 2MB limit into a
// 128KB one underneath the storefront's delivery path, with no other code change
// and nothing merchant-visible until a shop's routing map gets large enough to
// stop publishing.
//
// A comment saying "don't bump this" loses that argument. A red suite does not.
// Bumping is not forbidden; it just cannot happen QUIETLY.

/** First API version at which the 128KB json metafield write limit applies. */
const CEILING_ACTIVE_FROM = "2026-04";

describe("Admin API version tripwire (data-model.md §14)", () => {
  it("🔴 pins the runtime Admin client to a pre-2026-04 version", () => {
    // Read the app's OWN exported constant, never a copy — a tripwire that can
    // drift from the thing it guards is not a tripwire.
    expect(
      apiVersion < CEILING_ACTIVE_FROM,
      [
        ``,
        `The runtime Admin API version moved to "${apiVersion}", at or past ${CEILING_ACTIVE_FROM}.`,
        ``,
        `That ACTIVATES Shopify's ${JSON_METAFIELD_MAX_BYTES}-byte (128KB) write ceiling on every`,
        `json metafield this app writes: the shop routing map ($app:routing) and the`,
        `metaobject's rows / styling / styling_css fields.`,
        ``,
        `This app is NOT grandfathered — its first json field landed 2026-07-02, after`,
        `the 2026-04-01 cutoff. Today's effective limit is 2MB; after this bump it is`,
        `128KB, a 16x reduction, on a live storefront delivery path.`,
        ``,
        `Current budgets (data-model.md §14): 3,446 EXCLUDE carve-outs, 1,745 byProduct`,
        `entries, or 1,769 byCollection entries fill the ceiling. Nothing caps any of`,
        `them today, and an over-ceiling write fails at metafieldsSet while Postgres`,
        `stays correct — the storefront then serves the PREVIOUS map indefinitely.`,
        ``,
        `STEP 105 (overflow policy) MUST LAND BEFORE THIS BUMP.`,
        `If 105 has landed, delete this test and say so in progress-tracker.md.`,
        ``,
      ].join("\n"),
    ).toBe(true);
  });

  it("compares versions as sortable YYYY-MM strings", () => {
    // The assertion above is a string comparison. It is only correct because
    // Shopify's version format is zero-padded and lexicographically ordered —
    // pin that rather than leave it as a silent assumption.
    expect(ApiVersion.October25).toBe("2025-10");
    expect("2025-10" < CEILING_ACTIVE_FROM).toBe(true);
    expect("2026-07" < CEILING_ACTIVE_FROM).toBe(false);
    expect(apiVersion).toMatch(/^\d{4}-\d{2}$/);
  });
});
