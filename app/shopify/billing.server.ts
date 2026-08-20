// Billing state for the app root gate (billing blocker #2), using Shopify App Pricing.
//
// Shopify hosts the plan-selection page and charges the card; this module answers two
// questions the app must decide itself: (1) does the shop have ANY active subscription
// (including the $0 Free plan) — if not, the root loader redirects to the hosted plan page;
// (2) WHICH plan is active — so the assignment path can enforce the per-plan product cap
// (`app/utils/billingPlans.ts`). Both come from ONE query: `currentAppInstallation.
// activeSubscriptions` returns only ACTIVE subscriptions and carries the plan `name`.
//
// Conventions mirror assignedProductCounts.server.ts: the `#graphql` op was validated against
// API 2026-01; the response narrower + plan resolver + URL builder are pure and unit-tested,
// and only the live `admin.graphql` runner is mocked.
//
// FAIL BIAS (deliberate): a query FAILURE is reported as `determined: false`, distinct from a
// successful "no active subscription". The loader redirects ONLY on a determined absence — a
// transient Admin outage must never eject a paying merchant to the pricing page. On failure the
// resolved plan is null, which `planCap` treats as the most-restrictive Free cap, so a failure
// degrades access rather than granting unlimited.

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { planFromSubscriptionName, type Plan } from "../utils/billingPlans";

// --- Types ------------------------------------------------------------------

/** One active AppSubscription as narrowed from the query response. */
export type ActiveSubscription = {
  id: string;
  name: string;
  status: string;
  test: boolean;
};

export type BillingState = {
  /** True when the shop has ≥1 active subscription (Free counts). */
  hasActiveSubscription: boolean;
  /** The resolved tier, or null when there is no subscription / the name is unrecognized. */
  plan: Plan | null;
  /** The raw active-subscription name, for logging/telemetry. Null when none. */
  subscriptionName: string | null;
  /** False when the billing query could not be completed (network / GraphQL error). */
  determined: boolean;
};

// --- Pure: plan-selection URL ----------------------------------------------

/** Strip the `.myshopify.com` suffix to get the store handle used in admin.shopify.com URLs. */
export function storeHandleFromShop(shop: string): string {
  return shop.replace(/\.myshopify\.com$/i, "");
}

/**
 * The Shopify App Pricing plan-selection page URL. Requires the store handle (from the shop
 * domain) and the app handle (the slug in `admin.shopify.com/store/<store>/apps/<handle>`,
 * declared in shopify.app.toml / the Partner Dashboard, supplied at runtime via
 * SHOPIFY_APP_HANDLE). Pure.
 */
export function planSelectionUrl(shop: string, appHandle: string): string {
  return `https://admin.shopify.com/store/${storeHandleFromShop(shop)}/charges/${appHandle}/pricing_plans`;
}

// --- Pure: response narrower + plan resolver -------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Narrow a `currentAppInstallation.activeSubscriptions` response into a list of
 * ActiveSubscription. Malformed / missing entries are dropped, not defaulted. Pure.
 */
export function parseActiveSubscriptions(json: unknown): ActiveSubscription[] {
  const data = isRecord(json) && isRecord(json.data) ? json.data : null;
  const installation =
    data && isRecord(data.currentAppInstallation)
      ? data.currentAppInstallation
      : null;
  const raw =
    installation && Array.isArray(installation.activeSubscriptions)
      ? installation.activeSubscriptions
      : [];

  const subs: ActiveSubscription[] = [];
  for (const node of raw) {
    if (!isRecord(node)) continue;
    if (typeof node.id !== "string" || typeof node.name !== "string") continue;
    subs.push({
      id: node.id,
      name: node.name,
      status: typeof node.status === "string" ? node.status : "",
      test: node.test === true,
    });
  }
  return subs;
}

/**
 * Resolve a narrowed subscription list into billing state. Prefers a subscription whose name
 * maps to a known plan; if several are active (rare — Shopify permits one active subscription
 * per app), the first name-matching one wins, else the first active one (unknown plan → null →
 * Free cap downstream). Pure. `determined` is always true here — the live runner sets it false
 * on error.
 */
export function resolveBillingState(subs: ActiveSubscription[]): BillingState {
  if (subs.length === 0) {
    return {
      hasActiveSubscription: false,
      plan: null,
      subscriptionName: null,
      determined: true,
    };
  }
  const matched = subs.find((s) => planFromSubscriptionName(s.name) !== null);
  const chosen = matched ?? subs[0];
  return {
    hasActiveSubscription: true,
    plan: planFromSubscriptionName(chosen.name),
    subscriptionName: chosen.name,
    determined: true,
  };
}

// --- Live orchestrator ------------------------------------------------------

const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query AppActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
      }
    }
  }`;

/**
 * Read the shop's active-subscription billing state from Shopify. On any failure returns
 * `{ determined: false, hasActiveSubscription: false, plan: null }` — the loader must NOT
 * redirect on `determined: false` (see FAIL BIAS at the top of this file).
 */
export async function getBillingState(
  admin: AdminApiContext,
): Promise<BillingState> {
  try {
    const response = await admin.graphql(ACTIVE_SUBSCRIPTIONS_QUERY);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json: unknown = await response.json();
    if (
      isRecord(json) &&
      Array.isArray(json.errors) &&
      json.errors.length > 0
    ) {
      throw new Error("GraphQL errors");
    }
    return resolveBillingState(parseActiveSubscriptions(json));
  } catch (error) {
    console.error("[billing] active-subscription lookup failed", error);
    return {
      hasActiveSubscription: false,
      plan: null,
      subscriptionName: null,
      determined: false,
    };
  }
}
