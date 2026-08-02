import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  formatComplianceLog,
  parseComplianceSummary,
} from "../utils/complianceWebhook";

/**
 * `customers/redact` — one of the three mandatory compliance webhooks.
 * Step 106, `context/features/106-privacy-webhook-routes-and-subscriptions.md`.
 *
 * An ACKNOWLEDGEMENT, for the same audited reason as
 * `webhooks.customers.data_request.tsx`: this app holds no customer data, so
 * there is nothing to delete (`data-model.md` §"Data retention & erasure").
 *
 * ⚠️ A DELIBERATE SECOND COPY, not a shared handler factory over two call sites.
 * The two topics are independent obligations that will diverge the moment either
 * one ever has real work to do — and a factory would put a layer between the
 * route and `authenticate.webhook`, which is precisely where the thrown 401
 * below would get lost.
 *
 * 🚫 NO DATABASE ACCESS. 🔴 NO try/catch around `authenticate.webhook`. Both are
 * asserted by `complianceWebhookRoutes.test.ts`; see the sibling file's header
 * for why each matters.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  // Counts, never contents — the summary carries no email, phone or order id.
  console.log(
    formatComplianceLog(topic, shop, parseComplianceSummary(payload)),
  );

  return new Response();
};
