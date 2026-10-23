import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  getSessionFromRequestCookies,
} from "@/lib/connectors/server-token-store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

interface TokenClaims {
  auth_time?: number;
}

function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || !appUrl) return false;
  try {
    return new URL(origin).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

function hasRecentAuthentication(accessToken: string): boolean {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return false;
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as TokenClaims;
    return Boolean(
      claims.auth_time &&
        claims.auth_time <= Math.floor(Date.now() / 1000) &&
        Math.floor(Date.now() / 1000) - claims.auth_time <= 10 * 60
    );
  } catch {
    return false;
  }
}

export async function DELETE(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { success: false, error: "Untrusted request origin." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { success: false, error: "Account storage is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (authError || !user || !session) {
    return NextResponse.json(
      { success: false, error: "Sign in again before deleting your account." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!hasRecentAuthentication(session.access_token)) {
    return NextResponse.json(
      { success: false, error: "Confirm your password again before deleting your account." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const gmailSession = await getSessionFromRequestCookies();
  let googleRevocationFailed = false;
  if (gmailSession?.userId === user.id) {
    const token =
      gmailSession.googleRefreshToken || gmailSession.googleAccessToken;
    if (token) {
      try {
        const revokeResponse = await fetch(
          "https://oauth2.googleapis.com/revoke",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token }),
            cache: "no-store",
          }
        );
        googleRevocationFailed =
          !revokeResponse.ok && revokeResponse.status !== 400;
      } catch {
        googleRevocationFailed = true;
      }
    }
  }

  const { error: deleteError } = await supabase.rpc("delete_own_account");
  if (deleteError) {
    console.error("Could not delete account:", deleteError);
    return NextResponse.json(
      { success: false, error: "Account deletion could not be completed." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const response = NextResponse.json(
    { success: true, googleRevocationFailed },
    { headers: { "Cache-Control": "no-store" } }
  );
  clearSessionCookie(response);
  return response;
}
