/**
 * One-time fee scaffold. DISABLED by default and provider-neutral.
 *
 * Owner statement: "one time fee of rs 30, after one month of use (use counts as the user
 * using the gmail scan / ocr - and actually seeing all live subs)".
 * Open question for the owner: is "one month" 30 days from the first qualifying use, or
 * a calendar month? This module takes the trial length as a setting and defaults to 30
 * days from the first qualifying use. It is an interpretation, not a decision.
 *
 * Nothing here charges anyone, contacts a payment provider or blocks any feature.
 */
export const FEE_AMOUNT_PAISE = 3000; // Rs 30

export interface BillingConfig {
  enabled: boolean;
  trialDays: number;
  amountPaise: number;
}

export function getBillingConfig(env: Record<string, string | undefined> = process.env): BillingConfig {
  const days = Number(env.NEXT_PUBLIC_BILLING_TRIAL_DAYS);
  return {
    enabled: env.NEXT_PUBLIC_BILLING_ENABLED === "true",
    trialDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : 30,
    amountPaise: FEE_AMOUNT_PAISE,
  };
}

export interface Milestone {
  kind: "gmail_scan_viewed" | "ocr_import_viewed";
  first_at: string;
  live_subscriptions_seen: number;
}

export type EntitlementState =
  | { state: "billing_disabled" }
  | { state: "not_started" }
  | { state: "trial"; qualifyingSince: string; feeDueAt: string; daysLeft: number }
  | { state: "fee_due"; qualifyingSince: string; feeDueAt: string; amountPaise: number }
  | { state: "paid"; paidAt: string };

export function computeEntitlement(
  milestones: Milestone[],
  paidAt: string | null,
  config: BillingConfig,
  now: Date = new Date()
): EntitlementState {
  if (!config.enabled) return { state: "billing_disabled" };
  if (paidAt) return { state: "paid", paidAt };
  const qualifying = milestones
    .filter((m) => m.live_subscriptions_seen > 0)
    .map((m) => Date.parse(m.first_at))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b)[0];
  if (qualifying === undefined) return { state: "not_started" };
  const due = qualifying + config.trialDays * 86_400_000;
  const qualifyingSince = new Date(qualifying).toISOString();
  const feeDueAt = new Date(due).toISOString();
  if (now.getTime() < due) {
    return { state: "trial", qualifyingSince, feeDueAt, daysLeft: Math.ceil((due - now.getTime()) / 86_400_000) };
  }
  return { state: "fee_due", qualifyingSince, feeDueAt, amountPaise: config.amountPaise };
}

/** Provider-neutral port. No implementation exists yet; choosing a provider is the owner's call. */
export interface PaymentProvider {
  readonly name: string;
  createOrder(input: { userId: string; amountPaise: number; currency: "INR" }): Promise<{ checkoutUrl: string; orderId: string }>;
  verifyWebhook(rawBody: string, signature: string): Promise<{ orderId: string; paid: boolean } | null>;
}
