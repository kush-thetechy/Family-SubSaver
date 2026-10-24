import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const s = process.env.FSS_GMAIL_SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("FSS_GMAIL_SESSION_SECRET is required.");
  }
  return "local-dev-import-key-secret";
}

function mac(label: string, userId: string, data: string): string {
  return createHmac("sha256", secret()).update(`${label}|${userId}|${data}`).digest("hex");
}

/** Opaque per-message key. The raw Gmail message id never leaves the server. */
export function evidenceKey(userId: string, messageId: string): string {
  return mac("ev-key-v1", userId, messageId).slice(0, 40);
}

/** Proof that the server issued this evidence key to this user (the browser cannot forge one). */
export function evidenceProof(userId: string, key: string): string {
  return mac("ev-proof-v1", userId, key).slice(0, 24);
}

export function verifyEvidenceProof(userId: string, key: string, proof: unknown): boolean {
  if (typeof proof !== "string" || typeof key !== "string") return false;
  const expected = Buffer.from(evidenceProof(userId, key));
  const given = Buffer.from(proof);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Opaque idempotency key for one import operation: the same user importing the same set of
 * source messages gets the same key, whichever scan path found them. It is not derived from the
 * service name, so separate subscriptions to the same service (other plan, account or payer)
 * get different keys. Single source of truth for both the single-shot and batched scans.
 */
export function importKeyFromEvidenceKeys(userId: string, keys: (string | undefined)[]): string | undefined {
  const ks = Array.from(new Set(keys.filter((x): x is string => !!x))).sort();
  if (ks.length === 0) return undefined;
  return mac("import-key-v2", userId, ks.join(",")).slice(0, 40);
}

export function computeImportKey(userId: string, messageIds: (string | undefined)[]): string | undefined {
  return importKeyFromEvidenceKeys(
    userId,
    messageIds.map((id) => (id ? evidenceKey(userId, id) : undefined))
  );
}
