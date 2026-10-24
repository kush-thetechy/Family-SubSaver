import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // A recovery link lands on the new-password page. The cookie was set by this browser when
      // it asked for the reset; it only chooses the destination and is cleared here.
      const isRecovery = /(?:^|;\s*)fss_pw_reset=1(?:;|$)/.test(request.headers.get("cookie") ?? "");
      const response = NextResponse.redirect(
        new URL(isRecovery ? "/reset-password" : "/?auth=account_confirmed", requestUrl.origin)
      );
      if (isRecovery) response.cookies.set("fss_pw_reset", "", { maxAge: 0, path: "/" });
      return response;
    }
  }

  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set(
    "error",
    "This link could not be verified. It may have expired, been used already, or been opened in a different browser than the one that requested it. Sign in, or request a new link with Forgot password (open it in the same browser)."
  );
  const failed = NextResponse.redirect(loginUrl);
  failed.cookies.set("fss_pw_reset", "", { maxAge: 0, path: "/" });
  return failed;
}
