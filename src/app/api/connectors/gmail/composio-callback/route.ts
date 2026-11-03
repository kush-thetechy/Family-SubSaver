import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { gmailJson } from "@/lib/connectors/gmail-response";
import { isComposioGmailProvider } from "@/lib/connectors/composio-gmail";
import {
  clearPendingComposioAccount,
  getComposioAccount,
  hashComposioState,
} from "@/lib/connectors/composio-account-store";
import {
  completeComposioConnection,
  resolveComposioScanAccess,
} from "@/lib/connectors/composio-scan-access";
import { hasCurrentGmailConsent, isGmailEnabledForUser } from "@/lib/connectors/gmail-policy";
import {
  createServerSession,
  isSessionEncryptionConfigured,
  setSessionCookie,
} from "@/lib/connectors/server-token-store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const STATE_COOKIE = "fss_composio_state";

function appOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured && process.env.NODE_ENV === "production") return "";
  try {
    const u = new URL(configured || new URL(request.url).origin);
    if (!["http:", "https:"].includes(u.protocol)) return "";
    if (process.env.NODE_ENV === "production" && u.protocol !== "https:") return "";
    return u.origin;
  } catch {
    return "";
  }
}

function back(appUrl: string, message: string, connected = false): NextResponse {
  const dest = new URL("/import", appUrl);
  dest.searchParams.set("connector", "gmail");
  if (connected) dest.searchParams.set("status", "connected");
  else dest.searchParams.set("error", message);
  const res = NextResponse.redirect(dest);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(STATE_COOKIE, "", { path: "/api/connectors/gmail", maxAge: 0 });
  return res;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Return point of the Composio connect link (composio mode only).
 * - ?resume=1: the user already has a linked account; re-validate it and issue a session.
 * - ?state=...: finish a connect attempt. The one-time state must equal the cookie set in the
 *   browser that started it AND match the hashed, unexpired pending state stored for this user.
 */
export async function GET(request: Request) {
  const appUrl = appOrigin(request);
  if (!appUrl) {
    return gmailJson({ error: "The server app URL is not configured." }, { status: 503 });
  }
  if (!isComposioGmailProvider() || !isSupabaseConfigured || !isSessionEncryptionConfigured()) {
    return back(appUrl, "Gmail connection is not available.");
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return back(appUrl, "Sign in again to finish connecting Gmail.");
  const userId = data.user.id;
  if (!isGmailEnabledForUser(userId)) return back(appUrl, "Gmail discovery is disabled for this account.");
  try {
    if (!(await hasCurrentGmailConsent(supabase, userId))) {
      return back(appUrl, "Gmail consent is missing or has been withdrawn.");
    }
  } catch {
    return back(appUrl, "Gmail consent could not be verified.");
  }

  const url = new URL(request.url);
  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return back(appUrl, "Gmail connection is not available.");
  }

  let email: string | null = null;
  if (url.searchParams.get("resume") === "1") {
    const access = await resolveComposioScanAccess({ supabase: admin, userId });
    if (!access.ok) return back(appUrl, access.error);
    const stored = await getComposioAccount(admin, userId).catch(() => null);
    email = stored?.gmailEmail ?? null;
  } else {
    const state = url.searchParams.get("state") ?? "";
    const cookieState = cookies().get(STATE_COOKIE)?.value ?? "";
    if (!state || !cookieState || !safeEqual(state, cookieState)) {
      // Do not touch stored state: a forged request must not cancel a real attempt.
      return back(appUrl, "Gmail connection verification failed. Please start again.");
    }
    let stored;
    try {
      stored = await getComposioAccount(admin, userId);
    } catch {
      return back(appUrl, "The Gmail connection could not be completed.");
    }
    if (
      !stored?.pendingAccountId ||
      !stored.pendingStateHash ||
      !safeEqual(stored.pendingStateHash, hashComposioState(state))
    ) {
      return back(appUrl, "Gmail connection verification failed. Please start again.");
    }
    const expires = stored.pendingExpiresAt ? Date.parse(stored.pendingExpiresAt) : 0;
    if (!Number.isFinite(expires) || expires < Date.now()) {
      await clearPendingComposioAccount(admin, userId).catch(() => undefined);
      return back(appUrl, "The Gmail connection link expired. Please start again.");
    }
    const done = await completeComposioConnection({ supabase: admin, userId });
    if (!done.ok) return back(appUrl, done.error);
    email = done.email;
  }

  const session = createServerSession({
    userId,
    email,
    tokenExpiry: Date.now() + 60 * 60 * 1000,
    isDemo: false,
  });
  const res = back(appUrl, "", true);
  setSessionCookie(res, session);
  return res;
}
