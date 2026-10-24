import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyHexHmacSha256, meetsMinimumPaise } from "../billing-webhook";

const body = JSON.stringify({ event: "payment.captured", payload: { id: "test_1" } });
const secret = "test-secret-not-real";
const sig = createHmac("sha256", secret).update(body).digest("hex");

describe("verifyHexHmacSha256", () => {
  it("accepts a valid signature", () => expect(verifyHexHmacSha256(body, sig, secret)).toBe(true));
  it("rejects a changed body", () => expect(verifyHexHmacSha256(body + " ", sig, secret)).toBe(false));
  it("rejects a wrong secret", () => expect(verifyHexHmacSha256(body, sig, "other")).toBe(false));
  it("fails closed on empty secret or signature", () => {
    expect(verifyHexHmacSha256(body, sig, "")).toBe(false);
    expect(verifyHexHmacSha256(body, "", secret)).toBe(false);
  });
  it("rejects malformed signatures", () => expect(verifyHexHmacSha256(body, "zz", secret)).toBe(false));
});

describe("meetsMinimumPaise", () => {
  it("30 rupees clears a 100 paise minimum", () => expect(meetsMinimumPaise(3000, 100)).toBe(true));
  it("rejects below minimum and non-integers", () => {
    expect(meetsMinimumPaise(99, 100)).toBe(false);
    expect(meetsMinimumPaise(100.5, 100)).toBe(false);
  });
});
