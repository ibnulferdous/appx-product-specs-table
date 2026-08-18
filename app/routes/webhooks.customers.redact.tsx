import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  formatComplianceLog,
  parseComplianceSummary,
} from "../utils/complianceWebhook";

/**
 * `customers/redact` — one of the three mandatory compliance webhooks (step 106).
 *
 * An ACKNOWLEDGEMENT, for the same audited reason as `webhooks.customers.data_request.tsx`: this app
 * holds no customer data, so there's nothing to delete (`data-model.md` §"Data retention & erasure").
 *
 * ⚠️ A DELIBERATE SECOND COPY, not a shared handler factory. The two topics are independent
 * obligations that diverge the moment either has real work, and a factory would put a layer between
 * the route and `authenticate.webhook`, where the thrown 401 would get lost.
 *
 * 🚫 NO DATABASE ACCESS. 🔴 NO try/catch around `authenticate.webhook`. Both asserted by
 * `complianceWebhookRoutes.test.ts`; see the sibling file's header for why each matters.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  // Counts, never contents — the summary carries no email, phone or order id.
  console.log(
    formatComplianceLog(topic, shop, parseComplianceSummary(payload)),
  );

  return new Response();
};
