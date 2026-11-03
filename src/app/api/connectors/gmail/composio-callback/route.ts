import { NextResponse } from "next/server";
import { gmailJson } from "@/lib/connectors/gmail-response";
import { isComposioGmailProvider } from "@/lib/connectors/composio-gmail";
import { completeComposioConnection } from "@/lib/connectors/composio-scan-access";
import { hasCurrentGmailConsent, isGmailEnabledForUser } from "@/lib/connectors/gmail-policy";
import {
  createServerSession,
  isSessionEncryptionConfigured,
  setSessionCookie,
} from "@/lib/connectors/server-token-store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
  return res;
}

/** Return point of the Composio connect link (composio mode only). */
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
  const done = await completeComposioConnection({ supabase, userId });
  if (!done.ok) return back(appUrl, done.error);

  const session = createServerSession({
    userId,
    email: done.email,
    tokenExpiry: Date.now() + 60 * 60 * 1000,
    isDemo: false,
  });
  const res = back(appUrl, "", true);
  setSessionCookie(res, session);
  return res;
}
