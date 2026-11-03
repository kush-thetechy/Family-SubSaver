import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { isComposioGmailProvider } from "@/lib/connectors/composio-gmail";
import { createComposioConnectLink } from "@/lib/connectors/composio-connect";
import { saveComposioAccount } from "@/lib/connectors/composio-account-store";
import { gmailJson } from "@/lib/connectors/gmail-response";
import { isSessionEncryptionConfigured } from "@/lib/connectors/server-token-store";
import {
  hasCurrentGmailConsent,
  isGmailEnabledForUser,
} from "@/lib/connectors/gmail-policy";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function getAppUrl(request: Request): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl && process.env.NODE_ENV === "production") return "";
  try {
    const appUrl = new URL(configuredUrl || new URL(request.url).origin);
    if (
      !["http:", "https:"].includes(appUrl.protocol) ||
      (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:")
    ) {
      return "";
    }
    return appUrl.origin;
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  if (!origin || origin !== requestUrl.origin) {
    return gmailJson(
      { configured: false, authUrl: null, message: "Untrusted request origin." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!isSupabaseConfigured) {
    return gmailJson({
      configured: false,
      authUrl: null,
      message:
        "Live Gmail scans require a configured Supabase account. Apply the account database migrations and sign in first.",
    });
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return gmailJson(
      {
        configured: false,
        authUrl: null,
        message: "Sign in to your account before connecting Gmail.",
      },
      { status: 401 }
    );
  }
  if (!isGmailEnabledForUser(authData.user.id)) {
    return gmailJson(
      {
        configured: false,
        authUrl: null,
        message: "Gmail discovery is disabled for this account by the server release gate.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    if (!(await hasCurrentGmailConsent(supabase, authData.user.id))) {
      return gmailJson(
        { configured: false, authUrl: null, message: "Review and accept the Gmail disclosure before connecting." },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch (error) {
    console.error("Could not verify Gmail consent:");
    return gmailJson(
      { configured: false, authUrl: null, message: "Gmail consent could not be verified." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (isComposioGmailProvider()) {
    // Composio mode: the "authUrl" is a Composio connect link for this signed-in user.
    const appUrlForComposio = getAppUrl(request);
    const authConfigId = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
    if (!appUrlForComposio || !authConfigId || !isSessionEncryptionConfigured()) {
      return gmailJson(
        { configured: false, authUrl: null, message: "Composio Gmail is not configured on the server." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    try {
      const link = await createComposioConnectLink({
        apiKey: process.env.COMPOSIO_API_KEY as string,
        authConfigId,
        appUserId: authData.user.id,
        callbackUrl: `${appUrlForComposio}/api/connectors/gmail/composio-callback`,
      });
      await saveComposioAccount(supabase, authData.user.id, {
        connectedAccountId: link.connectedAccountId,
        authConfigId,
      });
      return gmailJson(
        { configured: true, authUrl: link.redirectUrl },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch {
      return gmailJson(
        { configured: false, authUrl: null, message: "Could not start the Gmail connection." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!isSessionEncryptionConfigured()) {
    return gmailJson({
      configured: false,
      authUrl: null,
      message:
        "Gmail session encryption is not configured. Set FSS_GMAIL_SESSION_SECRET in the server environment.",
    });
  }

  if (!clientId || !clientSecret) {
    return gmailJson({
      configured: false,
      authUrl: null,
      message:
        "Google OAuth credentials are not configured in the server environment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local to enable live Gmail scans.",
    });
  }

  const appUrl = getAppUrl(request);
  if (!appUrl) {
    return gmailJson(
      { configured: false, authUrl: null, message: "The server app URL is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  const state = randomBytes(32).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set(
    "redirect_uri",
    `${appUrl}/api/connectors/gmail/callback`
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/gmail.readonly"
  );
  authUrl.searchParams.set("prompt", "select_account consent");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = gmailJson(
    { configured: true, authUrl: authUrl.toString() },
    { headers: { "Cache-Control": "no-store" } }
  );

  response.cookies.set(
    "fss_gmail_oauth_state",
    JSON.stringify({ state, codeVerifier, userId: authData.user.id }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      }
  );

  return response;
}
