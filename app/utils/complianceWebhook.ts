// Payload narrowing for Shopify's three mandatory compliance webhooks. Spec:
// `context/features/105-privacy-webhook-domain-and-erase.md`.
//
// 🔴 THE SHAPE BELOW IS DECIDED BY WHAT IS SAFE TO LOG, NOT BY THE TOPIC LIST.
// Two of the three payloads carry `customer.email` and `customer.phone`, and
// writing those into an application log — in response to a privacy webhook —
// would be its own violation, invisible because nobody reviews logs. So this does
// NOT mirror the payload: it extracts a fixed set of non-identifying fields and
// drops everything else. Anything the app never reads, it never holds.

/**
 * The non-identifying summary of a compliance payload — the only thing the app
 * takes from one.
 *
 * 🚫 No `email`, no `phone`, no order ids, no passthrough of the original
 * payload. `complianceWebhook.test.ts` asserts this behaviourally — it searches
 * the serialized output for the fixture's email and phone — so a field added here
 * under any name fails the suite.
 *
 * Every field is independently nullable: one summary type covers all three
 * topics, which differ only in which fields are absent.
 */
export interface ComplianceSummary {
  /**
   * `shop_domain` from the body.
   *
   * ⚠️ NOT the shop to act on. The authenticated `shop` from
   * `authenticate.webhook` is derived from the HMAC-verified request; this one
   * is attacker-controlled body content. This field exists to be cross-checked
   * against the authenticated value and logged on mismatch — never to select a
   * row (step 106).
   */
  shopDomain: string | null;
  /** `shop_id` — Shopify's numeric id for the shop. */
  shopId: number | null;
  /** `customer.id` — an opaque id, not personal data in itself. */
  customerId: number | null;
  /**
   * How many orders the request names (`orders_requested` on a data request,
   * `orders_to_redact` on a redaction).
   *
   * ⚠️ Counts, never contents: a log line can say how much was asked for
   * without naming a single order.
   */
  orderCount: number | null;
  /** `data_request.id` — present on `customers/data_request` only. */
  dataRequestId: number | null;
}

/** Every field null — an unreadable payload, and the shape of `shop/redact` minus its two ids. */
const EMPTY_SUMMARY: ComplianceSummary = {
  shopDomain: null,
  shopId: null,
  customerId: null,
  orderCount: null,
  dataRequestId: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A non-empty string, or null. The empty-string case is the point: `""` must
// never reach a `where` clause looking like a value.
function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// A real, finite number, or null. A numeric STRING is not a number — Shopify
// sends these as JSON numbers, and accepting `"954889"` would mean the parser
// silently repairs a payload shape that should be reported as unreadable.
function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readArrayLength(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

/**
 * Narrow an arbitrary compliance webhook body into a {@link ComplianceSummary}.
 *
 * TOTAL: never throws, for any input. A handler that throws on a malformed body
 * returns a non-200, and Shopify retries every non-200 — so a parser that can
 * throw can produce an infinite redelivery loop over a body that will never
 * improve.
 *
 * Each field degrades on its own rather than failing whole.
 */
export function parseComplianceSummary(payload: unknown): ComplianceSummary {
  if (!isRecord(payload)) return { ...EMPTY_SUMMARY };

  const customer = isRecord(payload.customer) ? payload.customer : undefined;

  return {
    shopDomain: readString(payload.shop_domain),
    shopId: readNumber(payload.shop_id),
    customerId: customer ? readNumber(customer.id) : null,
    // The two topics name their order list differently and never both appear;
    // `??` picks whichever is present without the caller knowing the topic.
    orderCount:
      readArrayLength(payload.orders_requested) ??
      readArrayLength(payload.orders_to_redact),
    dataRequestId: isRecord(payload.data_request)
      ? readNumber(payload.data_request.id)
      : null,
  };
}

/**
 * The one place a compliance log line is built, so the no-PII guarantee holds in
 * a single place instead of once per route handler.
 *
 * ⚠️ Reads the SUMMARY only. A formatter that reaches back into the original
 * payload for "a bit more context" is the obvious way to reintroduce the email,
 * which is why the payload is not a parameter here.
 *
 * @param topic Shopify's topic constant, e.g. `CUSTOMERS_REDACT`.
 * @param shop  The AUTHENTICATED shop domain, not `summary.shopDomain`.
 */
// Escape control characters (notably `\r` / `\n`) before a value goes into a
// line-based log message, so a body-derived string can't forge extra log lines.
// `JSON.stringify` renders them as `\r` / `\n` escapes; slicing off the wrapping
// quotes keeps the interpolation shape unchanged for ordinary values.
function escapeLogValue(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

export function formatComplianceLog(
  topic: string,
  shop: string,
  summary: ComplianceSummary,
): string {
  const parts = [
    `Received ${escapeLogValue(topic)} webhook for ${escapeLogValue(shop)}`,
  ];

  if (summary.shopId !== null) parts.push(`shop_id=${summary.shopId}`);
  if (summary.customerId !== null)
    parts.push(`customer_id=${summary.customerId}`);
  if (summary.orderCount !== null) parts.push(`orders=${summary.orderCount}`);
  if (summary.dataRequestId !== null) {
    parts.push(`data_request_id=${summary.dataRequestId}`);
  }
  // Only worth a line when it disagrees with the authenticated shop — a match is
  // the normal case and says nothing. `shopDomain` is attacker-controlled body
  // content, so it is escaped before it reaches the line.
  if (summary.shopDomain !== null && summary.shopDomain !== shop) {
    parts.push(
      `payload_shop_domain_mismatch=${escapeLogValue(summary.shopDomain)}`,
    );
  }

  return parts.join(" ");
}
