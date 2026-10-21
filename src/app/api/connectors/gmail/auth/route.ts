import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { isSessionEncryptionConfigured } from "@/lib/connectors/server-token-store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function getAppUrl(request: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(
    /\/$/,
    ""
  );
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({
      configured: false,
      authUrl: null,
      message:
        "Live Gmail scans require a configured Supabase account. Apply the account database migrations and sign in first.",
    });
  }

  const supabase = createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json(
      {
        configured: false,
        authUrl: null,
        message: "Sign in to your account before connecting Gmail.",
      },
      { status: 401 }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!isSessionEncryptionConfigured()) {
    return NextResponse.json({
      configured: false,
      authUrl: null,
      message:
        "Gmail session encryption is not configured. Set FSS_GMAIL_SESSION_SECRET in the server environment.",
    });
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      configured: false,
      authUrl: null,
      message:
        "Google OAuth credentials are not configured in the server environment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local to enable live Gmail scans.",
    });
  }

  const appUrl = getAppUrl(request);
  const state = randomBytes(32).toString("hex");
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
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.json({
    configured: true,
    authUrl: authUrl.toString(),
  });

  // State cookie for CSRF protection
  response.cookies.set("fss_gmail_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
