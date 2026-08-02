import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  formatComplianceLog,
  parseComplianceSummary,
} from "../utils/complianceWebhook";

/**
 * `customers/data_request` — one of the three mandatory compliance webhooks.
 * Step 106, `context/features/106-privacy-webhook-routes-and-subscriptions.md`.
 *
 * An ACKNOWLEDGEMENT, and that is the correct handler for this app: it stores no
 * customer, order or buyer data of any kind, so there is nothing to disclose.
 * The audit behind that claim is `data-model.md` §"Data retention & erasure" —
 * read it before assuming this file is unfinished.
 *
 * 🚫 NO DATABASE ACCESS. This route deliberately does not import `db.server`,
 * and `complianceWebhookRoutes.test.ts` fails if it starts to.
 *
 * 🔴 `authenticate.webhook` MUST NOT BE WRAPPED IN try/catch. It throws a
 * `Response` — 405 on non-POST, 401 on an invalid HMAC, 400 otherwise — before
 * any line below runs, which is where our 401 comes from. Catching it would turn
 * the exact check a Shopify reviewer probes into a 200.
 *
 * ⚠️ `session` is `undefined` for compliance handlers and that is normal; do not
 * reach for it or for `admin`.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  // The payload carries the customer's email and phone. `formatComplianceLog`
  // takes the SUMMARY, never the payload, so none of it can reach the log.
  console.log(
    formatComplianceLog(topic, shop, parseComplianceSummary(payload)),
  );

  return new Response();
};
