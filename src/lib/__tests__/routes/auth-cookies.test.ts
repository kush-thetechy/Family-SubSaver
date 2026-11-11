import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

type CookieAdapter = {
  getAll(): { name: string; value: string }[];
  setAll(c: { name: string; value: string; options: Record<string, unknown> }[]): void;
};
const ssr = { user: null as { id: string } | null, refresh: null as null | { name: string; value: string }[], adapter: null as CookieAdapter | null };

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: CookieAdapter }) => {
    ssr.adapter = opts.cookies;
    return {
      auth: {
        getUser: async () => {
          // A real client refreshes an expired token here and writes new cookies.
          if (ssr.refresh) opts.cookies.setAll(ssr.refresh.map((c) => ({ ...c, options: { path: "/", httpOnly: true } })));
          return { data: { user: ssr.user } };
        },
      },
    };
  },
}));

const store = new Map<string, string>();
vi.mock("next/headers", () => ({
  // Next 15: cookies() returns a Promise.
  cookies: () =>
    Promise.resolve({
      getAll: () => [...store].map(([name, value]) => ({ name, value })),
      get: (n: string) => (store.has(n) ? { name: n, value: store.get(n)! } : undefined),
      set: (n: string, v: string) => void store.set(n, v),
    }),
}));

import { middleware } from "@/middleware";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSessionFromRequestCookies } from "@/lib/connectors/server-token-store";

const call = (path: string, cookie = "") =>
  middleware(new NextRequest(`https://app.example${path}`, { headers: cookie ? { cookie } : {} }));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.NEXT_PUBLIC_ENABLE_FAMILY_LINK = "true";
  process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE = "false";
  ssr.user = null;
  ssr.refresh = null;
  store.clear();
});

describe("middleware protected-route flow", () => {
  it("redirects signed-out users to /login, but not on public paths", async () => {
    const r = await call("/subscriptions");
    expect(r.status).toBe(307);
    expect(new URL(r.headers.get("location")!).pathname).toBe("/login");
    for (const p of ["/login", "/join", "/auth/callback"]) expect((await call(p)).headers.get("location")).toBeNull();
  });
  it("keeps /join protected when the family-link flag is off", async () => {
    process.env.NEXT_PUBLIC_ENABLE_FAMILY_LINK = "false";
    expect((await call("/join")).status).toBe(307);
  });
  it("lets signed-in users through and bounces them off /login", async () => {
    ssr.user = { id: "u1" };
    expect((await call("/subscriptions")).status).toBe(200);
    const r = await call("/login");
    expect(new URL(r.headers.get("location")!).pathname).toBe("/");
  });
  it("forwards refreshed auth cookies on the pass-through response and on redirects", async () => {
    ssr.user = { id: "u1" };
    ssr.refresh = [{ name: "sb-proj-auth-token", value: "NEW" }];
    const ok = await call("/subscriptions", "sb-proj-auth-token=OLD");
    expect(ok.headers.get("set-cookie")).toContain("sb-proj-auth-token=NEW");
    const bounce = await call("/login", "sb-proj-auth-token=OLD");
    expect(bounce.status).toBe(307);
    expect(bounce.headers.get("set-cookie")).toContain("sb-proj-auth-token=NEW");
    ssr.user = null;
    const out = await call("/subscriptions", "sb-proj-auth-token=OLD");
    expect(out.status).toBe(307);
    expect(out.headers.get("set-cookie")).toContain("sb-proj-auth-token=NEW");
  });
  it("hands the client the request's cookies", async () => {
    await call("/subscriptions", "a=1; b=2");
    expect(ssr.adapter!.getAll().map((c) => c.name)).toEqual(["a", "b"]);
  });
});

describe("server client with async cookies()", () => {
  it("reads and writes through the awaited cookie store", async () => {
    store.set("sb-x", "v1");
    await createSupabaseServerClient();
    expect(ssr.adapter!.getAll()).toEqual([{ name: "sb-x", value: "v1" }]);
    ssr.adapter!.setAll([{ name: "sb-x", value: "v2", options: {} }]);
    expect(store.get("sb-x")).toBe("v2");
  });
  it("returns a Promise (callers must await)", () => {
    expect(createSupabaseServerClient()).toBeInstanceOf(Promise);
  });
  it("Gmail session helper returns null with no cookie and decrypts a valid one", async () => {
    expect(await getSessionFromRequestCookies()).toBeNull();
    const { createServerSession, setSessionCookie, SESSION_COOKIE_NAME } = await import("@/lib/connectors/server-token-store");
    const res = NextResponse.json({});
    setSessionCookie(res, createServerSession({ userId: "u1", email: null, isDemo: false, googleAccessToken: "t", tokenExpiry: Date.now() + 3600_000 } as never));
    store.set(SESSION_COOKIE_NAME, res.cookies.get(SESSION_COOKIE_NAME)!.value);
    expect((await getSessionFromRequestCookies())?.userId).toBe("u1");
    store.set(SESSION_COOKIE_NAME, "tampered");
    expect(await getSessionFromRequestCookies()).toBeNull();
  });
});
