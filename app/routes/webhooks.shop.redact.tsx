import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { eraseShopData } from "../models/shop.server";
import {
  formatComplianceLog,
  parseComplianceSummary,
} from "../utils/complianceWebhook";

/**
 * `shop/redact` — the one compliance topic that does real work. Shopify sends it 48 hours after an
 * uninstall (step 106).
 *
 * 🔴 A 200 FROM THIS ROUTE DOES NOT MEAN DATA WAS DELETED, deliberately. `eraseShopData` declines to
 * erase a currently-installed shop — a merchant who uninstalls Friday and reinstalls Monday would
 * otherwise have every template deleted by a webhook arriving on schedule (Shopify never cancels the
 * delivery on reinstall; merchant decision D1, 2026-08-02). The app holds zero customer personal data,
 * so the guard concedes no compliance ground. 🚫 Not a bug to fix by dropping it.
 *
 * 🔴 THE ERASE TAKES THE AUTHENTICATED `shop`, NEVER `payload.shop_domain`. The former is derived from
 * the HMAC-verified request; the latter is body content that selects which shop gets deleted.
 * `summary.shopDomain` exists only to be cross-checked (`formatComplianceLog` emits
 * `payload_shop_domain_mismatch=` on disagreement), never passed to `eraseShopData`.
 *
 * 🔴 NO try/catch anywhere. Around `authenticate.webhook` it would swallow the free 401; around
 * `eraseShopData` it would turn a failed erase into a permanently acknowledged one (a non-200 is how
 * Shopify learns to retry, and the erase is idempotent so retrying is safe).
 *
 * ⚠️ `session` is `undefined` here — 48h after uninstall the session rows are gone. Nothing may touch
 * `session` or `admin`.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const summary = parseComplianceSummary(payload);

  const result = await eraseShopData(shop);

  // One line, written after the outcome is known — a failed or hung erase surfaces as a thrown error
  // the framework logs with its own request context.
  const outcome = result.erased
    ? `erased=true sessions_deleted=${result.sessionsDeleted}`
    : `erased=false reason=${result.reason}`;
  console.log(`${formatComplianceLog(topic, shop, summary)} ${outcome}`);

  return new Response();
};
