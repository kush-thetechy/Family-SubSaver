import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export interface ServerUserSession {
  sessionId: string;
  userId: string;
  email: string | null;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  tokenExpiry?: number;
  isDemo?: boolean;
  connectedAt: string;
}

export const SESSION_COOKIE_NAME = "fss_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const AES_GCM_IV_BYTES = 12;

function getSessionEncryptionKey(): Buffer {
  const configuredSecret = process.env.FSS_GMAIL_SESSION_SECRET;
  if (configuredSecret) {
    const key = Buffer.from(configuredSecret, "hex");
    if (key.length !== 32 || configuredSecret.length !== 64) {
      throw new Error(
        "FSS_GMAIL_SESSION_SECRET must be 64 hexadecimal characters (32 bytes)."
      );
    }
    return key;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FSS_GMAIL_SESSION_SECRET is required to persist Gmail sessions securely."
    );
  }

  // Local development fallback only. Production must provide its own secret.
  return createHash("sha256")
    .update("family-subscription-saver-local-gmail-session-key")
    .digest();
}

export function isSessionEncryptionConfigured(): boolean {
  try {
    getSessionEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

function encryptSession(session: ServerUserSession): string {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getSessionEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decryptSession(value: string | undefined): ServerUserSession | null {
  if (!value) return null;

  try {
    const packed = Buffer.from(value, "base64url");
    if (packed.length <= AES_GCM_IV_BYTES + 16) return null;

    const iv = packed.subarray(0, AES_GCM_IV_BYTES);
    const tag = packed.subarray(AES_GCM_IV_BYTES, AES_GCM_IV_BYTES + 16);
    const encrypted = packed.subarray(AES_GCM_IV_BYTES + 16);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getSessionEncryptionKey(),
      iv
    );
    decipher.setAuthTag(tag);
    const cleartext = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    const session = JSON.parse(cleartext) as ServerUserSession;

    if (
      !session.sessionId ||
      !session.userId ||
      !session.connectedAt ||
      typeof session.isDemo !== "boolean"
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function createServerSession(
  sessionData: Omit<ServerUserSession, "sessionId" | "connectedAt">
): ServerUserSession {
  return {
    ...sessionData,
    sessionId: randomBytes(32).toString("hex"),
    connectedAt: new Date().toISOString(),
  };
}

export function getSessionFromRequestCookies(): ServerUserSession | null {
  try {
    const cookieStore = cookies();
    return decryptSession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  } catch {
    return null;
  }
}

export function setSessionCookie(
  response: NextResponse,
  session: ServerUserSession
): void {
  response.cookies.set(SESSION_COOKIE_NAME, encryptSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  // Clear any token cookies created by previous versions.
  for (const name of [
    "fss_gmail_access_token",
    "fss_gmail_refresh_token",
    "fss_gmail_user_email",
    "fss_gmail_oauth_state",
  ]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}
