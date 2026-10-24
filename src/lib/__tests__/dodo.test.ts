import { describe, expect, it } from "vitest";
import { createDodoCheckout, toPaymentRecord } from "../dodo";

const uid = "cac14bf6-b5fa-41f9-ad75-0ebf273348e3";
const evt = (over: Record<string, unknown> = {}, type = "payment.succeeded") => ({
  type,
  timestamp: "2026-10-24T05:00:00Z",
  data: {
    payment_id: "pay_1",
    total_amount: 6000,
    currency: "inr",
    metadata: { user_id: uid },
    customer: { email: "a@b.c", name: "N" },
    card_last_four: "4242",
    ...over,
  },
});

describe("toPaymentRecord", () => {
  it("keeps only minimal fields", () => {
    const r = toPaymentRecord(evt());
    expect(r).toEqual({ paymentId: "pay_1", userId: uid, amountMinor: 6000, currency: "INR", status: "paid", occurredAt: "2026-10-24T05:00:00Z" });
    expect(JSON.stringify(r)).not.toMatch(/4242|a@b\.c/);
  });
  it("records failed, ignores other events and bad data", () => {
    expect(toPaymentRecord(evt({}, "payment.failed"))?.status).toBe("failed");
    expect(toPaymentRecord(evt({}, "refund.succeeded"))).toBeNull();
    expect(toPaymentRecord(evt({ metadata: {} }))).toBeNull();
    expect(toPaymentRecord(evt({ metadata: { user_id: "x" } }))).toBeNull();
    expect(toPaymentRecord(evt({ total_amount: 0 }))).toBeNull();
    expect(toPaymentRecord(evt({ total_amount: 5000 }))).toBeNull();
    expect(toPaymentRecord(evt({ currency: "usd" }))).toBeNull();
    expect(toPaymentRecord(null)).toBeNull();
  });
});

describe("createDodoCheckout", () => {
  it("sends product and user id only", async () => {
    let sent: { url: string; body: string; auth: string } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      sent = { url, body: String(init.body), auth: String((init.headers as Record<string, string>).Authorization) };
      return new Response(JSON.stringify({ session_id: "cks_1", checkout_url: "https://test.checkout.dodopayments.com/session/cks_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await createDodoCheckout({ userId: uid, returnUrl: "https://x/pricing" }, { apiKey: "k", productId: "pdt_1", baseUrl: "https://test.dodopayments.com" }, f);
    expect(r.sessionId).toBe("cks_1");
    expect(sent?.url).toBe("https://test.dodopayments.com/checkouts");
    const body = JSON.parse(sent!.body);
    expect(body.metadata).toEqual({ user_id: uid });
    expect(body.billing_currency).toBe("INR");
  });
  it("throws when unconfigured or on failure", async () => {
    await expect(createDodoCheckout({ userId: uid, returnUrl: "x" }, { baseUrl: "b" })).rejects.toThrow();
    const f = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    await expect(createDodoCheckout({ userId: uid, returnUrl: "x" }, { apiKey: "k", productId: "p", baseUrl: "b" }, f)).rejects.toThrow();
  });
});
