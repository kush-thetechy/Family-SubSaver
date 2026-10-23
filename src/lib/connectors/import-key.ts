import { createHmac } from "crypto";

function secret(): string {
  const s = process.env.FSS_GMAIL_SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("FSS_GMAIL_SESSION_SECRET is required.");
  }
  return "local-dev-import-key-secret";
}

/**
 * Opaque idempotency key for one import operation: the same user importing the same set of
 * source messages gets the same key. It is not derived from the service name, so separate
 * subscriptions to the same service (other plan, account or payer) get different keys.
 * Message ids never leave the server; only this HMAC does.
 */
export function computeImportKey(userId: string, messageIds: (string | undefined)[]): string | undefined {
  const ids = Array.from(new Set(messageIds.filter((x): x is string => !!x))).sort();
  if (ids.length === 0) return undefined;
  return createHmac("sha256", secret())
    .update(`import-key-v1|${userId}|${ids.join(",")}`)
    .digest("hex")
    .slice(0, 40);
}
