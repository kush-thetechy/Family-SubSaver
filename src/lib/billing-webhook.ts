import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure webhook signature check for a hex HMAC-SHA256 over the raw request body
 * (the scheme Razorpay documents for X-Razorpay-Signature). Provider-neutral on purpose:
 * nothing here contacts a provider, reads a secret from the environment or enables billing.
 * The caller passes the secret; an empty secret or signature always fails closed.
 */
export function verifyHexHmacSha256(rawBody: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Convert a rupee-paise amount to the provider minimum check. Razorpay documents 100 paise for INR. */
export function meetsMinimumPaise(amountPaise: number, minimumPaise: number): boolean {
  return Number.isInteger(amountPaise) && amountPaise >= minimumPaise;
}
