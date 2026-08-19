import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import type { ActionFunctionArgs } from "react-router";

// Route-action tests for the three mandatory compliance webhooks (step 106,
// `context/features/106-privacy-webhook-routes-and-subscriptions.md`).
//
// 📌 ONE FILE FOR THREE ROUTES, and it sits at the top of `app/routes/` rather
// than beside any one of them. All three import `../shopify.server`, whose
// module body calls `shopifyApp({...})` — that needs mocking once, not three
// times. Same reasoning as `createFlowContract.test.ts`: a guard that spans
// route files belongs to none of them.
//
// 📌 A `.test.ts` here is NOT bundled as a route — `app/routes.ts` passes
// `ignoredRouteFiles: ["**/*.test.{ts,tsx}"]` (feature 88 step 92). Without that
// line `npm run build` dies while this suite stays green.
//
// ⚠️ `../utils/complianceWebhook` is deliberately NOT mocked. The no-PII tests
// below are only worth running against the real parser and the real formatter —
// mocking them would leave this file asserting that a stub returns what the stub
// was told to return.

const { authenticateWebhook, eraseShopData, prismaCalls, prismaTrap } =
  vi.hoisted(() => {
    // 🔴 A TRAP, NOT A SPY. `db.server`'s default export is replaced by a proxy
    // that records the dotted path of every call made through it, at any depth.
    // A plain `{ session: { deleteMany: vi.fn() } }` mock would only catch the
    // one method someone thought to stub; this catches `db.anything.atAll()`.
    //
    // ⚠️ Honest about what it can see: the two `customers/*` routes do not
    // import `db.server` at all today, so this guard is armed for a FUTURE edit
    // rather than describing current behaviour. Its non-vacuity is established
    // by mutation M3b in the step file, which adds a real Prisma call to one of
    // them and watches this fire.
    const calls: string[] = [];
    const trap = (path: string): unknown =>
      new Proxy(function () {} as object, {
        get(_target, prop) {
          // `then` must stay undefined or the module namespace looks thenable
          // to the ESM loader and awaiting an import would hang.
          if (typeof prop === "symbol" || prop === "then") return undefined;
          return trap(path ? `${path}.${String(prop)}` : String(prop));
        },
        apply() {
          calls.push(path);
          return Promise.resolve(undefined);
        },
      });

    return {
      authenticateWebhook: vi.fn(),
      eraseShopData: vi.fn(),
      prismaCalls: calls,
      prismaTrap: trap(""),
    };
  });

vi.mock("../shopify.server", () => ({
  authenticate: { webhook: authenticateWebhook },
}));
vi.mock("../models/shop.server", () => ({ eraseShopData }));
vi.mock("../db.server", () => ({ default: prismaTrap }));

import { action as dataRequestAction } from "./webhooks.customers.data_request";
import { action as customersRedactAction } from "./webhooks.customers.redact";
import { action as shopRedactAction } from "./webhooks.shop.redact";

const SHOP = "demo.myshopify.com";
const OTHER_SHOP = "attacker.myshopify.com";
const EMAIL = "john@example.com";
const PHONE = "555-625-1199";
const ORDER_ID = "299938";

// Real-shaped payloads, verbatim from shopify.dev — the same fixtures
// `complianceWebhook.test.ts` uses. 🔴 The email and phone are the POINT: a
// sanitized fixture would make every guard below vacuous.
const DATA_REQUEST_PAYLOAD = {
  shop_id: 954889,
  shop_domain: SHOP,
  orders_requested: [299938, 280263, 220458],
  customer: { id: 191167, email: EMAIL, phone: PHONE },
  data_request: { id: 9999 },
};

const CUSTOMERS_REDACT_PAYLOAD = {
  shop_id: 954889,
  shop_domain: SHOP,
  customer: { id: 191167, email: EMAIL, phone: PHONE },
  orders_to_redact: [299938, 280263, 220458],
};

const SHOP_REDACT_PAYLOAD = { shop_id: 954889, shop_domain: SHOP };

type RouteAction = (args: ActionFunctionArgs) => Promise<Response>;

// Typed rather than inferred: `loggedText` maps over `mock.calls`, and an
// untyped spy makes each call's argument list implicitly `any`.
let logSpy: MockInstance<typeof console.log>;

beforeEach(() => {
  vi.resetAllMocks();
  prismaCalls.length = 0;
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

/** What `authenticate.webhook` hands the handler after a verified request. */
function authenticatedAs(shop: string, topic: string, payload: unknown) {
  // `session` is undefined for compliance handlers — normal, and no route may
  // reach for it (48 hours after uninstall the session rows are long gone).
  authenticateWebhook.mockResolvedValue({
    shop,
    topic,
    payload,
    session: undefined,
  });
}

function callAction(action: RouteAction) {
  return action({
    request: new Request("https://example.com/webhooks", { method: "POST" }),
    params: {},
    context: {},
  } as unknown as ActionFunctionArgs);
}

/** Everything the handler wrote to the log, as one searchable string. */
function loggedText(): string {
  // Serialize each argument: `args.join(" ")` would collapse a logged payload object to
  // "[object Object]", hiding any email/phone/order-id inside it and letting the PII check pass.
  return logSpy.mock.calls
    .flatMap((args) =>
      args.map((arg) =>
        typeof arg === "string" ? arg : (JSON.stringify(arg) ?? String(arg)),
      ),
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// D2 — the 401 is free, and the only way to lose it is to catch the throw.
// ---------------------------------------------------------------------------

describe("compliance webhooks · the thrown 401 propagates", () => {
  // `authenticate.webhook` throws a `Response` (405 non-POST / 401 bad HMAC /
  // 400 otherwise) before a line of handler code runs. A reviewer probes the
  // 401 directly, so these three tests are the executable form of "never wrap
  // that call in try/catch" — they ban the failure rather than the keyword.
  const UNAUTHORIZED = new Response(null, { status: 401 });

  it("customers/data_request rethrows the 401 unchanged", async () => {
    authenticateWebhook.mockRejectedValue(UNAUTHORIZED);

    await expect(callAction(dataRequestAction)).rejects.toBe(UNAUTHORIZED);
  });

  it("customers/redact rethrows the 401 unchanged", async () => {
    authenticateWebhook.mockRejectedValue(UNAUTHORIZED);

    await expect(callAction(customersRedactAction)).rejects.toBe(UNAUTHORIZED);
  });

  it("shop/redact rethrows the 401 unchanged AND erases nothing", async () => {
    authenticateWebhook.mockRejectedValue(UNAUTHORIZED);

    await expect(callAction(shopRedactAction)).rejects.toBe(UNAUTHORIZED);
    // The half that matters most here: an unverified request must not reach the
    // one function in the app that deletes a whole shop.
    expect(eraseShopData).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// shop/redact — the shop-isolation boundary and the three outcomes.
// ---------------------------------------------------------------------------

describe("shop/redact route", () => {
  it("erases the AUTHENTICATED shop, never the one named in the payload", async () => {
    // 🔴 The priority-#1 boundary from CLAUDE.md, at the one call site in the
    // app that deletes across five tables. `shop_domain` is body content — if it
    // selected the row, a forged payload would pick the victim.
    authenticatedAs(SHOP, "SHOP_REDACT", {
      ...SHOP_REDACT_PAYLOAD,
      shop_domain: OTHER_SHOP,
    });
    eraseShopData.mockResolvedValue({ erased: true, sessionsDeleted: 0 });

    await callAction(shopRedactAction);

    expect(eraseShopData).toHaveBeenCalledTimes(1);
    // `toEqual` on the whole argument list, so a second argument smuggling the
    // payload domain in later would also fail.
    expect(eraseShopData.mock.calls[0]).toEqual([SHOP]);
    // And the mismatch is not silently dropped — it is the reason
    // `summary.shopDomain` is parsed at all.
    expect(loggedText()).toContain(
      `payload_shop_domain_mismatch=${OTHER_SHOP}`,
    );
  });

  it("returns 200 when the shop was erased", async () => {
    authenticatedAs(SHOP, "SHOP_REDACT", SHOP_REDACT_PAYLOAD);
    eraseShopData.mockResolvedValue({ erased: true, sessionsDeleted: 2 });

    const response = await callAction(shopRedactAction);

    expect(response.status).toBe(200);
    expect(loggedText()).toContain("erased=true sessions_deleted=2");
  });

  it("returns 200 when the erase was DECLINED because the shop is installed", async () => {
    // Merchant decision D1: a reinstalled shop is not erased. Shopify must still
    // get a 200 — a non-200 means retries forever for a delivery we handled
    // exactly as designed. So a 200 here does not mean data was deleted, and the
    // log line is the only thing that says which happened.
    authenticatedAs(SHOP, "SHOP_REDACT", SHOP_REDACT_PAYLOAD);
    eraseShopData.mockResolvedValue({
      erased: false,
      reason: "still-installed",
    });

    const response = await callAction(shopRedactAction);

    expect(response.status).toBe(200);
    expect(eraseShopData).toHaveBeenCalledTimes(1);
    expect(loggedText()).toContain("erased=false reason=still-installed");
  });

  it("returns 200 for a shop that is not in the database", async () => {
    // The redelivery case: Shopify retries, the first delivery already erased
    // the row, and the second must be a clean acknowledgement rather than a
    // throw that earns another retry.
    authenticatedAs(SHOP, "SHOP_REDACT", SHOP_REDACT_PAYLOAD);
    eraseShopData.mockResolvedValue({ erased: false, reason: "not-found" });

    const response = await callAction(shopRedactAction);

    expect(response.status).toBe(200);
    expect(loggedText()).toContain("erased=false reason=not-found");
  });

  it("lets a failed erase REJECT rather than acknowledging it", async () => {
    // The inverse of the 200 tests, and the one that fails if someone "hardens"
    // the handler with a try/catch. A non-200 is how Shopify learns to retry;
    // swallowing the error would turn a failed erase into a permanently
    // acknowledged one, which is the worst outcome available here.
    authenticatedAs(SHOP, "SHOP_REDACT", SHOP_REDACT_PAYLOAD);
    const dbFailure = new Error("connect ETIMEDOUT");
    eraseShopData.mockRejectedValue(dbFailure);

    await expect(callAction(shopRedactAction)).rejects.toBe(dbFailure);
  });
});

// ---------------------------------------------------------------------------
// D3 — the two customers/* handlers acknowledge and touch no database.
// ---------------------------------------------------------------------------

describe("customers/* routes are acknowledgements", () => {
  it("customers/data_request returns 200", async () => {
    authenticatedAs(SHOP, "CUSTOMERS_DATA_REQUEST", DATA_REQUEST_PAYLOAD);

    expect((await callAction(dataRequestAction)).status).toBe(200);
  });

  it("customers/redact returns 200", async () => {
    authenticatedAs(SHOP, "CUSTOMERS_REDACT", CUSTOMERS_REDACT_PAYLOAD);

    expect((await callAction(customersRedactAction)).status).toBe(200);
  });

  it("customers/data_request reaches no database at all", async () => {
    authenticatedAs(SHOP, "CUSTOMERS_DATA_REQUEST", DATA_REQUEST_PAYLOAD);

    await callAction(dataRequestAction);

    expect(prismaCalls).toEqual([]);
    expect(eraseShopData).not.toHaveBeenCalled();
  });

  it("customers/redact reaches no database at all", async () => {
    // 🔴 "Redact" is the name most likely to tempt a future edit into deleting
    // something. There is nothing to delete: the app stores no customer data
    // (audited in step 105, written up in `data-model.md`).
    authenticatedAs(SHOP, "CUSTOMERS_REDACT", CUSTOMERS_REDACT_PAYLOAD);

    await callAction(customersRedactAction);

    expect(prismaCalls).toEqual([]);
    expect(eraseShopData).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The no-PII guarantee, at the layer where it actually gets lost.
// ---------------------------------------------------------------------------

describe("no compliance handler logs personal data", () => {
  // Step 105 proved the parser clean and the formatter clean. Neither stops a
  // handler from logging the raw payload on the line above — which is the real
  // way this guarantee dies, and the reason these three tests exist here.
  function expectNoPii(text: string) {
    expect(text.toLowerCase()).not.toContain(EMAIL.toLowerCase());
    expect(text).not.toContain(PHONE);
    // Order ids are contents, not counts. `orders=3` is fine; `299938` is not.
    expect(text).not.toContain(ORDER_ID);
  }

  it("customers/data_request logs no email, phone or order id", async () => {
    authenticatedAs(SHOP, "CUSTOMERS_DATA_REQUEST", DATA_REQUEST_PAYLOAD);

    await callAction(dataRequestAction);

    // Non-vacuous: something WAS logged, and it names the topic.
    expect(loggedText()).toContain("CUSTOMERS_DATA_REQUEST");
    expectNoPii(loggedText());
  });

  it("customers/redact logs no email, phone or order id", async () => {
    authenticatedAs(SHOP, "CUSTOMERS_REDACT", CUSTOMERS_REDACT_PAYLOAD);

    await callAction(customersRedactAction);

    expect(loggedText()).toContain("CUSTOMERS_REDACT");
    expectNoPii(loggedText());
  });

  it("shop/redact logs no email, phone or order id", async () => {
    // `shop/redact`'s own payload carries none — so this is fed the RICHEST
    // payload of the three. The topic a handler is registered for does not
    // constrain what a forged or future body contains, and this route is the one
    // that also logs an outcome, i.e. the one with an extra chance to leak.
    authenticatedAs(SHOP, "SHOP_REDACT", CUSTOMERS_REDACT_PAYLOAD);
    eraseShopData.mockResolvedValue({ erased: true, sessionsDeleted: 1 });

    await callAction(shopRedactAction);

    expect(loggedText()).toContain("SHOP_REDACT");
    expectNoPii(loggedText());
  });
});
