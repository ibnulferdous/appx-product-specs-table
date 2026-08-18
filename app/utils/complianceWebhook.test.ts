import { describe, it, expect } from "vitest";
import {
  parseComplianceSummary,
  formatComplianceLog,
  type ComplianceSummary,
} from "./complianceWebhook";

// Step 105 — `context/features/105-privacy-webhook-domain-and-erase.md`.
//
// The three fixtures below are copied VERBATIM from shopify.dev's "Privacy law
// compliance" page (read 2026-08-02), including the email and phone. That is
// deliberate: the email and phone are what the PII guards search for, so a
// sanitized fixture would make those guards vacuous.

const REDACT_PAYLOAD = {
  shop_id: 954889,
  shop_domain: "demo.myshopify.com",
  customer: {
    id: 191167,
    email: "john@example.com",
    phone: "555-625-1199",
  },
  orders_to_redact: [299938, 280263, 220458],
};

const DATA_REQUEST_PAYLOAD = {
  shop_id: 954889,
  shop_domain: "demo.myshopify.com",
  orders_requested: [299938, 280263, 220458],
  customer: {
    id: 191167,
    email: "john@example.com",
    phone: "555-625-1199",
  },
  data_request: { id: 9999 },
};

const SHOP_REDACT_PAYLOAD = {
  shop_id: 954889,
  shop_domain: "demo.myshopify.com",
};

const EMAIL = "john@example.com";
const PHONE = "555-625-1199";

const ALL_NULL: ComplianceSummary = {
  shopDomain: null,
  shopId: null,
  customerId: null,
  orderCount: null,
  dataRequestId: null,
};

describe("parseComplianceSummary — the PII guarantee", () => {
  // 🔴 The reason this module exists. Behavioural rather than structural: it
  // searches the SERIALIZED output, so it fails for a passthrough field whatever
  // that field ends up being named — `email`, `raw`, `payload`, `_original`.
  it("never emits the customer's email or phone", () => {
    const serialized = JSON.stringify(
      parseComplianceSummary(REDACT_PAYLOAD),
    ).toLowerCase();

    expect(serialized).not.toContain(EMAIL.toLowerCase());
    expect(serialized).not.toContain(PHONE);
    // The whole `customer` object is dropped; only its id survives.
    expect(serialized).not.toContain("example.com");
  });

  it("never emits the email or phone through the log formatter either", () => {
    // Two surfaces, because a clean summary paired with a formatter that reaches
    // back into the payload is a plausible future bug — and it is why
    // `formatComplianceLog` does not take the payload as a parameter.
    const line = formatComplianceLog(
      "CUSTOMERS_REDACT",
      "demo.myshopify.com",
      parseComplianceSummary(REDACT_PAYLOAD),
    ).toLowerCase();

    expect(line).not.toContain(EMAIL.toLowerCase());
    expect(line).not.toContain(PHONE);
  });

  it("counts the orders in a data request without naming one", () => {
    const summary = parseComplianceSummary(DATA_REQUEST_PAYLOAD);
    const serialized = JSON.stringify(summary);

    expect(summary.orderCount).toBe(3);
    for (const orderId of DATA_REQUEST_PAYLOAD.orders_requested) {
      expect(serialized).not.toContain(String(orderId));
    }
  });
});

describe("parseComplianceSummary — totality", () => {
  // A parser that throws on a malformed body produces a non-200, and Shopify
  // retries every non-200 — so a throw here is an infinite redelivery loop over
  // a payload that will never improve.
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a string", "shop_domain"],
    ["an array", []],
    ["an empty object", {}],
    ["a deeply nested object", { a: { b: { c: { d: [1, 2, 3] } } } }],
  ])("returns an all-null summary for %s without throwing", (_label, input) => {
    expect(() => parseComplianceSummary(input)).not.toThrow();
    expect(parseComplianceSummary(input)).toEqual(ALL_NULL);
  });

  it("degrades each wrong-typed field on its own, keeping the readable ones", () => {
    const summary = parseComplianceSummary({
      shop_domain: 12345,
      // A numeric STRING is not a number. Accepting it would mean silently
      // repairing a payload shape that should be reported as unreadable.
      shop_id: "954889",
      customer: null,
      orders_to_redact: "three",
      data_request: [],
    });

    expect(summary).toEqual(ALL_NULL);
  });

  it("keeps the fields it can read when a sibling is wrong-typed", () => {
    const summary = parseComplianceSummary({
      ...SHOP_REDACT_PAYLOAD,
      shop_id: "954889",
    });

    // The domain survives its neighbour's bad type — the fields fall
    // independently, they do not fail whole.
    expect(summary.shopDomain).toBe("demo.myshopify.com");
    expect(summary.shopId).toBeNull();
  });

  it('reads an empty shop_domain as null, never as ""', () => {
    // An empty domain must never reach a `where` clause looking like a value.
    expect(parseComplianceSummary({ shop_domain: "" }).shopDomain).toBeNull();
  });
});

describe("parseComplianceSummary — the three documented payloads", () => {
  it("parses customers/redact", () => {
    expect(parseComplianceSummary(REDACT_PAYLOAD)).toEqual({
      shopDomain: "demo.myshopify.com",
      shopId: 954889,
      customerId: 191167,
      orderCount: 3,
      dataRequestId: null,
    });
  });

  it("parses customers/data_request", () => {
    expect(parseComplianceSummary(DATA_REQUEST_PAYLOAD)).toEqual({
      shopDomain: "demo.myshopify.com",
      shopId: 954889,
      customerId: 191167,
      orderCount: 3,
      dataRequestId: 9999,
    });
  });

  it("parses shop/redact, whose payload is only the two shop ids", () => {
    expect(parseComplianceSummary(SHOP_REDACT_PAYLOAD)).toEqual({
      shopDomain: "demo.myshopify.com",
      shopId: 954889,
      customerId: null,
      orderCount: null,
      dataRequestId: null,
    });
  });
});

describe("formatComplianceLog", () => {
  it("names the topic and the AUTHENTICATED shop", () => {
    const line = formatComplianceLog(
      "SHOP_REDACT",
      "demo.myshopify.com",
      parseComplianceSummary(SHOP_REDACT_PAYLOAD),
    );

    expect(line).toContain("SHOP_REDACT");
    expect(line).toContain("demo.myshopify.com");
    expect(line).toContain("shop_id=954889");
  });

  it("omits every field the payload did not carry", () => {
    const line = formatComplianceLog(
      "SHOP_REDACT",
      "demo.myshopify.com",
      parseComplianceSummary(SHOP_REDACT_PAYLOAD),
    );

    expect(line).not.toContain("customer_id=");
    expect(line).not.toContain("orders=");
    expect(line).not.toContain("data_request_id=");
  });

  it("stays readable when nothing at all parsed", () => {
    const line = formatComplianceLog("SHOP_REDACT", "demo.myshopify.com", {
      ...ALL_NULL,
    });

    expect(line).toBe("Received SHOP_REDACT webhook for demo.myshopify.com");
  });

  it("flags a payload shop_domain that disagrees with the authenticated shop", () => {
    // 🔴 The body is attacker-controlled; the authenticated shop is not. A
    // mismatch is the signal that something is wrong with a delivery, so it is
    // the one case where the payload's domain is worth printing.
    const line = formatComplianceLog(
      "SHOP_REDACT",
      "real-shop.myshopify.com",
      parseComplianceSummary(SHOP_REDACT_PAYLOAD),
    );

    expect(line).toContain("payload_shop_domain_mismatch=demo.myshopify.com");
  });

  it("says nothing about the shop domain when it matches", () => {
    const line = formatComplianceLog(
      "SHOP_REDACT",
      "demo.myshopify.com",
      parseComplianceSummary(SHOP_REDACT_PAYLOAD),
    );

    expect(line).not.toContain("mismatch");
  });
});
