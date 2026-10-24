import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { deflateSync, inflateSync } from "zlib";
import { GmailBatchState } from "./gmail-batch";
import { getSessionEncryptionKey } from "./server-token-store";

const IV_BYTES = 12;
const TTL_MS = 30 * 60 * 1000;
export const GMAIL_SCAN_MAX_BATCHES = 400;
/** Encrypted, compressed cursor limit (seen-hash list at the 10,000-message total ceiling is well under this). */
const MAX_CURSOR_CHARS = 400_000;

interface CursorPayload {
  u: string; // user id
  iat: number;
  s: GmailBatchState;
}

/** Purpose-bound key: derived from the session key so a cursor is never valid as a session cookie. */
function cursorKey(): Buffer {
  return createHash("sha256").update(getSessionEncryptionKey()).update("gmail-scan-cursor-v1").digest();
}

/** Authenticated encryption: the client can neither read nor change the cursor. */
export function sealScanCursor(userId: string, state: GmailBatchState, now = Date.now()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", cursorKey(), iv);
  cipher.setAAD(Buffer.from(`cursor|${userId}`));
  const body = Buffer.concat([
    cipher.update(deflateSync(Buffer.from(JSON.stringify({ u: userId, iat: now, s: state } satisfies CursorPayload), "utf8"))),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openScanCursor(
  userId: string,
  value: unknown,
  now = Date.now()
): GmailBatchState | null {
  if (typeof value !== "string" || value.length < 40 || value.length > MAX_CURSOR_CHARS) return null;
  try {
    const packed = Buffer.from(value, "base64url");
    const iv = packed.subarray(0, IV_BYTES);
    const tag = packed.subarray(IV_BYTES, IV_BYTES + 16);
    const decipher = createDecipheriv("aes-256-gcm", cursorKey(), iv);
    decipher.setAAD(Buffer.from(`cursor|${userId}`));
    decipher.setAuthTag(tag);
    const payload = JSON.parse(
      inflateSync(
        Buffer.concat([decipher.update(packed.subarray(IV_BYTES + 16)), decipher.final()]),
        { maxOutputLength: 2_000_000 }
      ).toString("utf8")
    ) as CursorPayload;
    if (payload.u !== userId) return null;
    if (now - payload.iat > TTL_MS || payload.iat > now + 60_000) return null;
    if (payload.s?.v !== 2 || payload.s.seq >= GMAIL_SCAN_MAX_BATCHES) return null;
    return payload.s;
  } catch {
    return null;
  }
}
