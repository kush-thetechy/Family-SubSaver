import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { createRazorpayOrder, isPaidEvent, parseWebhook, verifyCheckoutSignature } from "../razorpay";

describe("razorpay helpers", () => {
  it("creates an order in paise with basic auth and never calls out without keys", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "order_x", amount: 3000, currency: "INR" }), { status: 200 });
    }) as unknown as typeof fetch;
    const o = await createRazorpayOrder({ amountPaise: 3000, receipt: "r1" }, { keyId: "k", keySecret: "s" }, f);
    expect(o.id).toBe("order_x");
    expect(JSON.parse(String(seen!.init.body)).amount).toBe(3000);
    await expect(createRazorpayOrder({ amountPaise: 3000, receipt: "r1" }, {}, f)).rejects.toThrow();
  });
  it("verifies the checkout signature", () => {
    const sig = createHmac("sha256", "sec").update("order_1|pay_1").digest("hex");
    expect(verifyCheckoutSignature("order_1", "pay_1", sig, "sec")).toBe(true);
    expect(verifyCheckoutSignature("order_1", "pay_2", sig, "sec")).toBe(false);
  });
  it("accepts only captured events with the ordered amount", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 3000 } } } });
    const w = parseWebhook(body)!;
    expect(isPaidEvent(w, 3000)).toBe(true);
    expect(isPaidEvent(w, 5000)).toBe(false);
    expect(isPaidEvent({ ...w, event: "payment.failed" }, 3000)).toBe(false);
    expect(parseWebhook("not json")).toBeNull();
  });
});
