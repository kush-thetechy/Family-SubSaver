import { FEE_AMOUNT_PAISE } from "@/lib/billing";

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
      billing_currency: "INR",
      billing_address: { country: "IN" },
      feature_flags: { allow_currency_selection: false },
      return_url: input.returnUrl,
    }),
  });
  if (!res.ok) throw new Error(`Dodo checkout failed (${res.status}).`);
  const body = (await res.json()) as { session_id?: string; checkout_url?: string };
  if (!body.session_id || !body.checkout_url) throw new Error("Dodo checkout returned no session.");
  return { sessionId: body.session_id, checkoutUrl: body.checkout_url };
}

export type DodoMode = "test" | "live";

export function getDodoMode(env: Record<string, string | undefined> = process.env): DodoMode {
  return env.DODO_MODE === "live" ? "live" : "test";
}

/** In test mode only listed user ids may start a checkout, so simulated payments stay with the owner. */
export function canStartCheckout(userId: string, env: Record<string, string | undefined> = process.env): boolean {
  if (getDodoMode(env) === "live") return true;
  return (env.BILLING_TEST_USER_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean).includes(userId);
}

export type DodoEvent =
  | { kind: "payment"; paymentId: string; sessionId: string; userId: string; amountMinor: number; currency: string; status: "paid" | "failed"; occurredAt: string }
  | { kind: "refund"; paymentId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reduces a verified Dodo event to the minimum we use. Everything else in the payload
 * (customer, billing, card fields) is dropped here and never logged or persisted.
 * A paid payment must be INR and exactly the approved fee. Returns null for events we ignore.
 */
export function toDodoEvent(raw: unknown): DodoEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const evt = raw as { type?: unknown; timestamp?: unknown; data?: Record<string, unknown> };
  const d = evt.data;
  if (!d || typeof d !== "object") return null;
  const paymentId = typeof d.payment_id === "string" ? d.payment_id : "";
  if (!paymentId) return null;
  if (evt.type === "refund.succeeded" || evt.type === "dispute.lost") return { kind: "refund", paymentId };
  const status = evt.type === "payment.succeeded" ? "paid" : evt.type === "payment.failed" ? "failed" : null;
  if (!status) return null;
  const metadata = d.metadata as Record<string, unknown> | undefined;
  const userId = typeof metadata?.user_id === "string" ? metadata.user_id : "";
  const sessionId = typeof d.checkout_session_id === "string" ? d.checkout_session_id : "";
  const amount = typeof d.total_amount === "number" ? d.total_amount : NaN;
  const currency = typeof d.currency === "string" ? d.currency.toUpperCase() : "";
  if (status === "paid" && (currency !== "INR" || amount !== FEE_AMOUNT_PAISE)) return null;
  if (!UUID.test(userId) || !sessionId || !Number.isInteger(amount) || amount <= 0 || currency.length !== 3) return null;
  const when = typeof evt.timestamp === "string" && !Number.isNaN(Date.parse(evt.timestamp)) ? evt.timestamp : new Date().toISOString();
  return { kind: "payment", paymentId, sessionId, userId, amountMinor: amount, currency, status, occurredAt: when };
}
