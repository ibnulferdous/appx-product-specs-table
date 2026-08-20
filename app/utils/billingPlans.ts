/**
 * Shopify App Pricing plan model — the single source of truth for the four launch plans
 * (billing blocker #2). See PRD § "Pricing Strategy — Shopify App Pricing".
 *
 * Billing uses Shopify App Pricing: plans are defined in the Partner Dashboard and the
 * Shopify-hosted plan page charges the card. 🔴 Shopify does NOT enforce the per-plan
 * assigned-product caps — the app does. The root loader reads the merchant's active
 * AppSubscription `name` (`currentAppInstallation.activeSubscriptions[].name`) and maps it
 * here to a product cap the assignment path enforces.
 *
 * 🔴 The `name` values below MUST match the plan **Display names** configured in
 * Partner Dashboard → Distribution → Manage listing → Pricing content, exactly (matching is
 * case-insensitive + trimmed, but nothing else). A Dashboard plan whose name does not match
 * one of these falls back to the Free cap (see `planCap`) — it is never granted unlimited.
 */

export type PlanId = "free" | "go" | "plus" | "max";

export interface Plan {
  readonly id: PlanId;
  /** Must match the plan's Display name in the Partner Dashboard (case-insensitive). */
  readonly name: string;
  readonly priceUsd: number;
  /** Max products assignable to ACTIVE templates shop-wide. `null` = unlimited. */
  readonly productCap: number | null;
  readonly trialDays: number;
}

export const PLANS: Readonly<Record<PlanId, Plan>> = {
  free: { id: "free", name: "Free", priceUsd: 0, productCap: 25, trialDays: 0 },
  go: { id: "go", name: "Go", priceUsd: 4.99, productCap: 250, trialDays: 60 },
  plus: {
    id: "plus",
    name: "Plus",
    priceUsd: 9.99,
    productCap: 1000,
    trialDays: 60,
  },
  max: {
    id: "max",
    name: "Max",
    priceUsd: 14.99,
    productCap: null,
    trialDays: 60,
  },
};

/** Presentation order: cheapest → most expensive. */
export const PLAN_LIST: readonly Plan[] = [
  PLANS.free,
  PLANS.go,
  PLANS.plus,
  PLANS.max,
];

/**
 * Resolve an active-subscription name to a Plan. Matching is trim + case-insensitive,
 * because the Dashboard Display name is merchant-facing copy that can drift in casing.
 * Returns `null` when the name matches no known plan.
 */
export function planFromSubscriptionName(
  name: string | null | undefined,
): Plan | null {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  return PLAN_LIST.find((p) => p.name.toLowerCase() === needle) ?? null;
}

/**
 * The assigned-product cap for a plan. 🔴 An absent OR unrecognized plan falls back to the
 * **Free** cap — never unlimited — so a mis-named Dashboard plan can never silently unlock
 * unlimited assignments. `null` return means unlimited (only the Max plan).
 */
export function planCap(plan: Plan | null): number | null {
  return (plan ?? PLANS.free).productCap;
}

/** True when assigning `count` products is within the plan's cap. `null` cap = unlimited. */
export function isWithinCap(plan: Plan | null, count: number): boolean {
  const cap = planCap(plan);
  return cap === null || count <= cap;
}

/**
 * Remaining assignable products for a plan given the current `count`. `null` = unlimited.
 * Never negative (a merchant who downgrades below their current usage reads `0`, not a
 * negative number).
 */
export function remainingCapacity(
  plan: Plan | null,
  count: number,
): number | null {
  const cap = planCap(plan);
  if (cap === null) return null;
  return Math.max(0, cap - count);
}
