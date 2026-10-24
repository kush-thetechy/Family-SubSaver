import { verifyHexHmacSha256 } from "@/lib/billing-webhook";

export interface RazorpayEnv {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
}

export function getRazorpayEnv(env: Record<string, string | undefined> = process.env): RazorpayEnv {
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  };
}

/** Creates a Razorpay order (amount in paise). Throws on a non-2xx answer. */
export async function createRazorpayOrder(
  input: { amountPaise: number; receipt: string; notes?: Record<string, string> },
  env: RazorpayEnv,
  fetchImpl: typeof fetch = fetch
): Promise<{ id: string; amount: number; currency: string }> {
  if (!env.keyId || !env.keySecret) throw new Error("Razorpay keys are not configured.");
  const res = await fetchImpl("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${env.keyId}:${env.keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ amount: input.amountPaise, currency: "INR", receipt: input.receipt, notes: input.notes ?? {} }),
  });
  if (!res.ok) throw new Error(`Razorpay order failed (${res.status}).`);
  return (await res.json()) as { id: string; amount: number; currency: string };
}

/** Checkout-return signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  return verifyHexHmacSha256(`${orderId}|${paymentId}`, signature, keySecret);
}

export interface ParsedWebhook {
  event: string;
  orderId: string | null;
  paymentId: string | null;
  amountPaise: number | null;
}

export function parseWebhook(rawBody: string): ParsedWebhook | null {
  try {
    const j = JSON.parse(rawBody);
    const p = j?.payload?.payment?.entity;
    const o = j?.payload?.order?.entity;
    return {
      event: String(j.event ?? ""),
      orderId: (p?.order_id ?? o?.id ?? null) as string | null,
      paymentId: (p?.id ?? null) as string | null,
      amountPaise: typeof (p?.amount ?? o?.amount_paid) === "number" ? (p?.amount ?? o?.amount_paid) : null,
    };
  } catch {
    return null;
  }
}

/** A payment counts only when the event says captured/paid and the amount matches what we ordered. */
export function isPaidEvent(w: ParsedWebhook, expectedPaise: number): boolean {
  return (w.event === "payment.captured" || w.event === "order.paid") && w.amountPaise === expectedPaise && !!w.orderId;
}
