import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createServerSession,
  isSessionEncryptionConfigured,
  setSessionCookie,
} from "@/lib/connectors/server-token-store";

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

function getAppUrl(request: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(
    /\/$/,
    ""
  );
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
  const providerError = callbackUrl.searchParams.get("error");
  const code = callbackUrl.searchParams.get("code");
  const returnedState = callbackUrl.searchParams.get("state");
  const stateCookie = cookies().get("fss_gmail_oauth_state")?.value;

  if (providerError) {
    return redirectToImport("Google authorization was cancelled.", appUrl);
  }
  if (!code || !returnedState || !stateCookie || returnedState !== stateCookie) {
    return redirectToImport(
      "Gmail connection verification failed (CSRF mismatch). Please try connecting again.",
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
      "Gmail session encryption is not configured on the server. Set FSS_GMAIL_SESSION_SECRET and try again.",
      appUrl
    );
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
      }),
    });

    if (!tokenResponse.ok) {
      return redirectToImport(
        "Google could not complete the authorization exchange. Please try again.",
        appUrl
      );
    }

    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenData.access_token) {
      return redirectToImport("Google did not return an access token.", appUrl);
    }

    // Fetch user profile email
    let userEmail: string | null = null;
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userRes.ok) {
        const userData = (await userRes.json()) as { email?: string };
        userEmail = userData.email || null;
      }
    } catch {
      // Non-fatal
    }

    // Store tokens securely in server-side session registry
    // Tokens are NEVER sent to the client or stored in browser-readable cookies
    const expiryMs = Date.now() + (tokenData.expires_in ?? 3600) * 1000;
    const session = createServerSession({
      userId: userEmail || "live_user",
      email: userEmail,
      googleAccessToken: tokenData.access_token,
      googleRefreshToken: tokenData.refresh_token,
      tokenExpiry: expiryMs,
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
