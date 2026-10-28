import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { gmailJson } from "@/lib/connectors/gmail-response";
import {
  createServerSession,
  isSessionEncryptionConfigured,
  setSessionCookie,
} from "@/lib/connectors/server-token-store";
import {
  hasCurrentGmailConsent,
  isGmailEnabledForUser,
} from "@/lib/connectors/gmail-policy";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
}

interface GmailProfileResponse {
  emailAddress?: string;
}

interface OAuthFlowState {
  state: string;
  codeVerifier: string;
  userId: string;
}

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

function redirectToImport(
  message: string,
  appUrl: string,
  connected = false
) {
  const destination = new URL("/import", appUrl);
  destination.searchParams.set("connector", "gmail");
  if (connected) {
    destination.searchParams.set("status", "connected");
  } else {
    destination.searchParams.set("error", message);
  }

  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("fss_gmail_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const callbackUrl = new URL(request.url);
  const appUrl = getAppUrl(request);
  if (!appUrl) {
    return gmailJson(
      { error: "The server app URL is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (callbackUrl.origin !== new URL(appUrl).origin) {
    return gmailJson(
      { error: "Gmail OAuth callback origin is not configured correctly." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!isSupabaseConfigured) {
    return redirectToImport(
      "Live Gmail scans require a configured, signed-in account.",
      appUrl
    );
  }

  const providerError = callbackUrl.searchParams.get("error");
  const code = callbackUrl.searchParams.get("code");
  const returnedState = callbackUrl.searchParams.get("state");
  const stateCookie = cookies().get("fss_gmail_oauth_state")?.value;
  let flowState: OAuthFlowState | null = null;
  try {
    flowState = stateCookie ? (JSON.parse(stateCookie) as OAuthFlowState) : null;
  } catch {
    flowState = null;
  }

  if (providerError) {
    return redirectToImport("Google authorization was cancelled.", appUrl);
  }
  if (
    !code ||
    !returnedState ||
    !flowState?.state ||
    returnedState !== flowState.state ||
    !flowState.codeVerifier ||
    !flowState.userId
  ) {
    return redirectToImport(
      "Gmail connection verification failed. Please start again.",
      appUrl
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectToImport(
      "Server Google OAuth credentials are not configured.",
      appUrl
    );
  }
  if (!isSessionEncryptionConfigured()) {
    return redirectToImport(
      "Gmail session encryption is not configured on the server.",
      appUrl
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== flowState.userId) {
    return redirectToImport(
      "Your sign-in changed during Google authorization. Please start the connection again.",
      appUrl
    );
  }
  if (!isGmailEnabledForUser(authData.user.id)) {
    return redirectToImport(
      "Gmail discovery is disabled for this account by the server release gate.",
      appUrl
    );
  }
  try {
    if (!(await hasCurrentGmailConsent(supabase, authData.user.id))) {
      return redirectToImport(
        "Gmail consent is missing or has been withdrawn. Review the disclosure and reconnect.",
        appUrl
      );
    }
  } catch (error) {
    console.error("Could not verify Gmail consent during callback:");
    return redirectToImport("Gmail consent could not be verified.", appUrl);
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/connectors/gmail/callback`,
        grant_type: "authorization_code",
        code_verifier: flowState.codeVerifier,
      }),
      cache: "no-store",
    });

    if (!tokenResponse.ok) {
      return redirectToImport(
        "Google could not complete the authorization exchange. Please try again.",
        appUrl
      );
    }

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
    const grantedScopes = (tokenData.scope || "").split(/\s+/).filter(Boolean);
    const expectedScope = "https://www.googleapis.com/auth/gmail.readonly";
    if (
      !tokenData.access_token ||
      grantedScopes.length !== 1 ||
      grantedScopes[0] !== expectedScope
    ) {
      return redirectToImport(
        "Google did not grant exactly the requested Gmail read-only permission. Please reconnect and review the requested access.",
        appUrl
      );
    }

    let userEmail: string | null = null;
    try {
      const profileResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
          cache: "no-store",
        }
      );
      if (profileResponse.ok) {
        const profile =
          (await profileResponse.json()) as GmailProfileResponse;
        userEmail = profile.emailAddress || null;
      }
    } catch {
      userEmail = null;
    }

    const session = createServerSession({
      userId: authData.user.id,
      email: userEmail,
      googleAccessToken: tokenData.access_token,
      tokenExpiry: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      isDemo: false,
    });

    const response = redirectToImport("", appUrl, true);
    setSessionCookie(response, session);
    return response;
  } catch {
    return redirectToImport(
      "A network error interrupted the connection with Google. Please try again.",
      appUrl
    );
  }
}
