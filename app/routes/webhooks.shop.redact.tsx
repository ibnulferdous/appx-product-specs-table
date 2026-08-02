import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { eraseShopData } from "../models/shop.server";
import {
  formatComplianceLog,
  parseComplianceSummary,
} from "../utils/complianceWebhook";

/**
 * `shop/redact` — the one compliance topic that does real work. Shopify sends it
 * **48 hours after an uninstall**. Step 106,
 * `context/features/106-privacy-webhook-routes-and-subscriptions.md`.
 *
 * 🔴 A 200 FROM THIS ROUTE DOES NOT MEAN DATA WAS DELETED, and that is
 * deliberate. `eraseShopData` declines to erase a shop that is currently
 * installed — a merchant who uninstalls on Friday and reinstalls on Monday would
 * otherwise have every template deleted out from under them by a webhook
 * arriving exactly on schedule, since Shopify never cancels the delivery on
 * reinstall (merchant decision D1, 2026-08-02; `data-model.md` §"Data retention
 * & erasure"). The app holds zero customer personal data, so the guard concedes
 * no compliance ground. 🚫 It is not a bug to be fixed by dropping it.
 *
 * 🔴 THE ERASE TAKES THE AUTHENTICATED `shop`, NEVER `payload.shop_domain`. The
 * former is derived from the HMAC-verified request; the latter is body content,
 * and it selects which shop gets deleted. `summary.shopDomain` exists only to be
 * cross-checked — `formatComplianceLog` emits `payload_shop_domain_mismatch=`
 * when the two disagree — and never to be passed to `eraseShopData`.
 *
 * 🔴 NO try/catch, anywhere in this file. Around `authenticate.webhook` it would
 * swallow the free 401. Around `eraseShopData` it would turn a failed erase into
 * a permanently acknowledged one: a non-200 is how Shopify learns to retry, and
 * the erase is idempotent precisely so that retrying is safe.
 *
 * ⚠️ `session` is `undefined` here — 48 hours after uninstall the session rows
 * are long gone. Nothing in this file may touch `session` or `admin`.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const summary = parseComplianceSummary(payload);

  const result = await eraseShopData(shop);

  // One line, written after the outcome is known: the outcome is the part worth
  // recording, and a failed or hung erase surfaces as a thrown error that the
  // framework logs with its own request context.
  const outcome = result.erased
    ? `erased=true sessions_deleted=${result.sessionsDeleted}`
    : `erased=false reason=${result.reason}`;
  console.log(`${formatComplianceLog(topic, shop, summary)} ${outcome}`);

  return new Response();
};
