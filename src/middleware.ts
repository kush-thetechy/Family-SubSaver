import type { CookieOptions } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_LEGAL_PATHS } from "@/lib/legal";

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const demoModeEnabled =
    process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true";
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isAuthCallback = request.nextUrl.pathname === "/auth/callback";
  const isJoinPage =
    process.env.NEXT_PUBLIC_ENABLE_FAMILY_LINK === "true" &&
    request.nextUrl.pathname === "/join";
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");
  const isLegalPage = PUBLIC_LEGAL_PATHS.includes(request.nextUrl.pathname);

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    supabaseUrl.includes("your-project") ||
    supabaseAnonKey.includes("your-anon-key")
  ) {
    if (demoModeEnabled || isLoginPage || isAuthCallback || isApiRequest || isLegalPage) {
      return NextResponse.next();
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("setup", "required");
    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && !isLoginPage && !isAuthCallback && !isJoinPage && !isLegalPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const redirect = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    return redirect;
  }

  if (user && isLoginPage) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    const redirect = NextResponse.redirect(homeUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie);
    });
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
