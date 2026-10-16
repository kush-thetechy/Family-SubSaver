import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import {
  createServerSession,
  isSessionEncryptionConfigured,
  setSessionCookie,
} from "@/lib/connectors/server-token-store";

function getAppUrl(request: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(
    /\/$/,
    ""
  );
}

export async function GET(request: Request) {
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
    };

    // Instant Demo Connect (No Google credentials required)
    if (body.action === "demo_connect") {
      const demoEmail = "rahul.sharma@gmail.com";
      const session = createServerSession({
        userId: "user_rahul",
        email: demoEmail,
        isDemo: true,
      });

      const response = NextResponse.json({
        success: true,
        connected: true,
        email: demoEmail,
        isDemo: true,
        message: `Connected to demo Gmail account (${demoEmail}).`,
      });

      setSessionCookie(response, session);
      return response;
    }

    // Explicitly reject any client-side credential submissions for security
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid request. Google OAuth credentials must be set as server environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) in .env.local.",
      },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process request." },
      { status: 500 }
    );
  }
}
