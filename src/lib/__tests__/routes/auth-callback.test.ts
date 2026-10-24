import { describe, expect, it, vi } from "vitest";

const ex = { error: null as unknown };
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => ({ auth: { exchangeCodeForSession: async () => ({ error: ex.error }) } }),
}));
import { GET } from "@/app/auth/callback/route";

const call = (cookie?: string) =>
  GET(new Request("https://app.example/auth/callback?code=abc", { headers: cookie ? { cookie } : {} }));

describe("auth callback", () => {
  it("sends a normal confirmation to the app", async () => {
    ex.error = null;
    const r = await call();
    expect(new URL(r.headers.get("location")!).pathname).toBe("/");
  });
  it("sends a recovery link to /reset-password and clears the marker cookie", async () => {
    ex.error = null;
    const r = await call("a=b; fss_pw_reset=1");
    expect(new URL(r.headers.get("location")!).pathname).toBe("/reset-password");
    expect(r.headers.get("set-cookie")).toMatch(/fss_pw_reset=;/);
  });
  it("sends a failed exchange to login with an error", async () => {
    ex.error = new Error("bad");
    const r = await call("fss_pw_reset=1");
    expect(new URL(r.headers.get("location")!).pathname).toBe("/login");
  });
});
