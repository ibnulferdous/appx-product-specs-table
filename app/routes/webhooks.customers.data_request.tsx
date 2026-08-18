import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  formatComplianceLog,
  parseComplianceSummary,
} from "../utils/complianceWebhook";

/**
 * `customers/data_request` — one of the three mandatory compliance webhooks (step 106).
 *
 * An ACKNOWLEDGEMENT, the correct handler for this app: it stores no customer, order or buyer data, so
 * there is nothing to disclose (audit: `data-model.md` §"Data retention & erasure").
 *
 * 🚫 NO DATABASE ACCESS — this route deliberately doesn't import `db.server`, and
 * `complianceWebhookRoutes.test.ts` fails if it starts to.
 *
 * 🔴 `authenticate.webhook` MUST NOT BE WRAPPED IN try/catch. It throws a `Response` (405 on non-POST,
 * 401 on invalid HMAC, 400 otherwise) before any line below runs; catching it would turn the exact
 * check a Shopify reviewer probes into a 200.
 *
 * ⚠️ `session` is `undefined` for compliance handlers; do not reach for it or `admin`.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  // The payload carries the customer's email and phone. `formatComplianceLog` takes the SUMMARY,
  // never the payload, so none of it can reach the log.
  console.log(
    formatComplianceLog(topic, shop, parseComplianceSummary(payload)),
  );

  return new Response();
};
