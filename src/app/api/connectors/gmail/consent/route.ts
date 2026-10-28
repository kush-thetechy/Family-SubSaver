import { NextResponse } from "next/server";
import { gmailJson } from "@/lib/connectors/gmail-response";
import { GMAIL_CONSENT_VERSION } from "@/lib/connectors/gmail-policy";
import { isSupabaseConfigured } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return gmailJson({ error: "Untrusted request origin." }, { status: 403 });
  }
  if (!isSupabaseConfigured) {
    return gmailJson({ error: "Account storage is not configured." }, { status: 503 });
  }

  const supabase = createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return gmailJson({ error: "Sign in before consenting to Gmail access." }, { status: 401 });
  }

  const { error } = await supabase.rpc("grant_own_gmail_consent", {
    consent_version: GMAIL_CONSENT_VERSION,
  });
  if (error) {
    console.error("Could not record Gmail consent:");
    return gmailJson({ error: "Could not record Gmail consent." }, { status: 503 });
  }

  return gmailJson({ success: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return gmailJson({ error: "Untrusted request origin." }, { status: 403 });
  }
  if (!isSupabaseConfigured) {
    return gmailJson({ error: "Account storage is not configured." }, { status: 503 });
  }

  const supabase = createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return gmailJson({ error: "Sign in before changing Gmail consent." }, { status: 401 });
  }

  const { error } = await supabase.rpc("withdraw_own_gmail_consent", {
    consent_version: GMAIL_CONSENT_VERSION,
  });
  if (error) {
    console.error("Could not withdraw Gmail consent:");
    return gmailJson({ error: "Could not withdraw Gmail consent." }, { status: 503 });
  }

  return gmailJson({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
