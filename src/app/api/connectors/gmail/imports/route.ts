import { NextResponse } from "next/server";
import { gmailJson } from "@/lib/connectors/gmail-response";
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

export async function DELETE(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return gmailJson(
      { error: "Untrusted request origin." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!isSupabaseConfigured) {
    return gmailJson(
      { error: "Account storage is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const supabase = createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return gmailJson(
      { error: "Sign in to delete Gmail-imported records." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .delete()
    .eq("payer_id", user.id)
    .eq("source_type", "gmail")
    .select("id");
  if (error) {
    console.error("Could not delete Gmail-imported records:");
    return gmailJson(
      { error: "Could not delete Gmail-imported records." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  return gmailJson(
    { success: true, deletedCount: data?.length ?? 0 },
    { headers: { "Cache-Control": "no-store" } }
  );
}
