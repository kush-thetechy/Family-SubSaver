import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Standard Webhooks signature check (the scheme Dodo Payments documents).
 * Signed content is `${id}.${timestamp}.${rawBody}`; the key is the secret with a `whsec_`
 * prefix removed and base64-decoded; the header holds space-separated `v1,<base64>` values.
 * Fails closed on missing inputs, bad timestamp or a stale timestamp (default 5 minutes).
 */
export function verifyStandardWebhook(
  input: { id: string; timestamp: string; signature: string; rawBody: string; secret: string },
  nowMs: number = Date.now(),
  toleranceSeconds = 300
): boolean {
  const { id, timestamp, signature, rawBody, secret } = input;
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > toleranceSeconds) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`, "utf8").digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
