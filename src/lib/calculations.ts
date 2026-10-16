import { BillingCycle, Subscription, VisibilityLevel } from "@/types";

/**
 * Normalizes a subscription's cost to an integer paise monthly equivalent.
 * Rules according to README:
 * - Monthly: Amount
 * - Quarterly: Amount / 3
 * - Half-yearly: Amount / 6
 * - Annual: Amount / 12
 * - Prepaid validity: Amount / validity days * 30
 * - One-time: Exclude from recurring monthly spend (returns 0)
 */
export function calculateMonthlyPaise(
  amountPaise: number,
  billingCycle: BillingCycle,
  validityDays?: number
): number {
  if (amountPaise <= 0) return 0;

  switch (billingCycle) {
    case "monthly":
      return Math.round(amountPaise);
    case "quarterly":
      return Math.round(amountPaise / 3);
    case "half_yearly":
      return Math.round(amountPaise / 6);
    case "annual":
      return Math.round(amountPaise / 12);
    case "prepaid": {
      const days = validityDays && validityDays > 0 ? validityDays : 28; // Standard 28-day prepaid cycle default in India
      return Math.round((amountPaise / days) * 30);
    }
    case "one_time":
      // One-time payments must be excluded from recurring monthly spend
      return 0;
    default:
      return 0;
  }
}

/**
 * Calculates annualized recurring cost: normalized monthly cost * 12
 */
export function calculateAnnualPaise(monthlyPaise: number): number {
  return Math.round(monthlyPaise * 12);
}

/**
 * Formats integer paise into Indian Rupee string (₹).
 * e.g., 49900 paise -> ₹499
 * 49950 paise -> ₹499.50
 */
export function formatINR(paise: number, showDecimalsIfZero = false): string {
  const rupees = paise / 100;
  if (!showDecimalsIfZero && rupees % 1 === 0) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(rupees);
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Converts user-input rupees to integer paise safely
 */
export function rupeesToPaise(rupees: number | string): number {
  const num = typeof rupees === "string" ? parseFloat(rupees) : rupees;
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

/**
 * Converts paise to rupees number
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export interface SpendingSummary {
  monthlyRecurringPaise: number;
  annualizedRecurringPaise: number;
  oneTimeSpendPaise: number;
  activeCount: number;
  hiddenCountForOthers: number;
  categoryBreakdown: Record<string, number>; // category -> monthly paise
  payerBreakdown: Record<string, number>; // payer_id -> monthly paise
}

/**
 * Computes spend metrics filtered by current user permissions.
 * Visibility rules:
 * - If viewerId is the payer of a subscription, they always see their own subscription details.
 * - If viewerId is NOT the payer:
 *    - `full_details`: included in totals, breakdowns, and directory.
 *    - `totals_only`: included in aggregate totals and aggregate payer spend, but details are redacted.
 *    - `hidden`: completely EXCLUDED from group-visible totals to prevent inference leaks!
 */
export function calculateHouseholdSummary(
  subscriptions: Subscription[],
  viewerId?: string
): SpendingSummary {
  let monthlyRecurringPaise = 0;
  let oneTimeSpendPaise = 0;
  let activeCount = 0;
  let hiddenCountForOthers = 0;
  const categoryBreakdown: Record<string, number> = {};
  const payerBreakdown: Record<string, number> = {};

  for (const sub of subscriptions) {
    if (!sub.is_active) continue;

    const isOwn = viewerId && sub.payer_id === viewerId;

    // Visibility check
    if (!isOwn) {
      if (sub.visibility === "hidden") {
        hiddenCountForOthers++;
        // Excluded from all totals to prevent mathematical inference leaks
        continue;
      }
    }

    activeCount++;

    if (sub.billing_cycle === "one_time") {
      oneTimeSpendPaise += sub.amount_paise;
    } else {
      const monthly = calculateMonthlyPaise(
        sub.amount_paise,
        sub.billing_cycle,
        sub.validity_days
      );
      monthlyRecurringPaise += monthly;

      // Category breakdown (for totals_only, if permitted or generalized)
      const categoryKey = sub.visibility === "totals_only" && !isOwn ? "other" : sub.category;
      categoryBreakdown[categoryKey] = (categoryBreakdown[categoryKey] || 0) + monthly;

      // Payer breakdown
      payerBreakdown[sub.payer_id] = (payerBreakdown[sub.payer_id] || 0) + monthly;
    }
  }

  return {
    monthlyRecurringPaise,
    annualizedRecurringPaise: calculateAnnualPaise(monthlyRecurringPaise),
    oneTimeSpendPaise,
    activeCount,
    hiddenCountForOthers,
    categoryBreakdown,
    payerBreakdown,
  };
}

/**
 * Filter subscriptions visible to a specific user
 */
export function getVisibleSubscriptions(
  subscriptions: Subscription[],
  viewerId?: string
): { subscription: Subscription; isRedacted: boolean }[] {
  return subscriptions
    .filter((sub) => {
      const isOwn = viewerId && sub.payer_id === viewerId;
      if (isOwn) return true;
      return sub.visibility !== "hidden";
    })
    .map((sub) => {
      const isOwn = viewerId && sub.payer_id === viewerId;
      if (isOwn || sub.visibility === "full_details") {
        return { subscription: sub, isRedacted: false };
      }
      // Redacted for totals_only
      return {
        subscription: {
          ...sub,
          service_name: "Private Recurring Expense",
          plan_name: undefined,
          notes: undefined,
          billing_channel: undefined,
        },
        isRedacted: true,
      };
    });
}

