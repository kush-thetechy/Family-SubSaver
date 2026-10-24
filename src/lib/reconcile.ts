import { FEE_AMOUNT_PAISE } from "@/lib/billing";

export interface UnmatchedRow {
  provider_payment_id: string;
  claimed_user_id: string | null;
  checkout_session_id: string | null;
  mode: string;
}

export interface DodoPaymentDetail {
  payment_id?: unknown;
  status?: unknown;
  total_amount?: unknown;
  currency?: unknown;
  checkout_session_id?: unknown;
  metadata?: { user_id?: unknown } | null;
  created_at?: unknown;
}

/** Server-side owner check. Only user ids in BILLING_ADMIN_USER_IDS may see or resolve reconciliation. */
export function isBillingAdmin(userId: string, env: Record<string, string | undefined> = process.env): boolean {
  return (env.BILLING_ADMIN_USER_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean).includes(userId);
}

/** Checks Dodo's own record of the payment against the unmatched row. Returns null when it all agrees. */
export function reconcileProblem(row: UnmatchedRow, p: DodoPaymentDetail): string | null {
  if (p.payment_id !== row.provider_payment_id) return "payment id differs";
  if (p.status !== "succeeded") return "payment is not succeeded at Dodo";
  if (p.currency !== "INR" || p.total_amount !== FEE_AMOUNT_PAISE) return "amount or currency is not the approved fee";
  if (!row.claimed_user_id || p.metadata?.user_id !== row.claimed_user_id) return "user does not match";
  if (!row.checkout_session_id || p.checkout_session_id !== row.checkout_session_id) return "checkout session does not match";
  return null;
}

/** Reads one payment from the Dodo environment that matches the app's mode (test or live base URL). */
export async function fetchDodoPayment(
  paymentId: string,
  env: { apiKey?: string; baseUrl: string },
  fetchImpl: typeof fetch = fetch
): Promise<DodoPaymentDetail | null> {
  if (!env.apiKey) return null;
  const res = await fetchImpl(`${env.baseUrl}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${env.apiKey}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as DodoPaymentDetail;
}
