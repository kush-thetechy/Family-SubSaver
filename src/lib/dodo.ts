export interface DodoEnv {
  apiKey?: string;
  productId?: string;
  webhookSecret?: string;
  baseUrl: string;
}

export function getDodoEnv(env: Record<string, string | undefined> = process.env): DodoEnv {
  return {
    apiKey: env.DODO_PAYMENTS_API_KEY,
    productId: env.DODO_PRODUCT_ID,
    webhookSecret: env.DODO_WEBHOOK_SECRET,
    baseUrl: env.DODO_MODE === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com",
  };
}

/** Creates a hosted checkout session. Sends only the user id as metadata (no email or name). */
export async function createDodoCheckout(
  input: { userId: string; returnUrl: string },
  env: DodoEnv,
  fetchImpl: typeof fetch = fetch
): Promise<{ sessionId: string; checkoutUrl: string }> {
  if (!env.apiKey || !env.productId) throw new Error("Dodo Payments is not configured.");
  const res = await fetchImpl(`${env.baseUrl}/checkouts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.apiKey}` },
    body: JSON.stringify({
      product_cart: [{ product_id: env.productId, quantity: 1 }],
      metadata: { user_id: input.userId },
      return_url: input.returnUrl,
    }),
  });
  if (!res.ok) throw new Error(`Dodo checkout failed (${res.status}).`);
  const body = (await res.json()) as { session_id?: string; checkout_url?: string };
  if (!body.session_id || !body.checkout_url) throw new Error("Dodo checkout returned no session.");
  return { sessionId: body.session_id, checkoutUrl: body.checkout_url };
}

export interface PaymentRecord {
  paymentId: string;
  userId: string;
  amountMinor: number;
  currency: string;
  status: "paid" | "failed";
  occurredAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reduces a verified Dodo payment event to the minimum we store. Anything else in the payload
 * (customer, billing, card fields) is dropped here and never logged or persisted.
 * Returns null for events we do not record.
 */
export function toPaymentRecord(raw: unknown): PaymentRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const evt = raw as { type?: unknown; timestamp?: unknown; data?: Record<string, unknown> };
  const status = evt.type === "payment.succeeded" ? "paid" : evt.type === "payment.failed" ? "failed" : null;
  const d = evt.data;
  if (!status || !d || typeof d !== "object") return null;
  const metadata = d.metadata as Record<string, unknown> | undefined;
  const userId = typeof metadata?.user_id === "string" ? metadata.user_id : "";
  const paymentId = typeof d.payment_id === "string" ? d.payment_id : "";
  const amount = typeof d.total_amount === "number" ? d.total_amount : NaN;
  const currency = typeof d.currency === "string" ? d.currency.toUpperCase() : "";
  if (!UUID.test(userId) || !paymentId || !Number.isInteger(amount) || amount <= 0 || currency.length !== 3) return null;
  const when = typeof evt.timestamp === "string" && !Number.isNaN(Date.parse(evt.timestamp)) ? evt.timestamp : new Date().toISOString();
  return { paymentId, userId, amountMinor: amount, currency, status, occurredAt: when };
}
