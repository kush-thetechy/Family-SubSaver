import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { user: { id: "u1" } as { id: string } | null, rpcError: null as unknown, deleted: [] as string[][], filters: [] as [string, unknown][] };

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: state.user ? null : new Error("no") }),
      getSession: async () => ({ data: { session: state.user ? { access_token: "a.b.c" } : null } }),
    },
    rpc: vi.fn(async () => ({ error: state.rpcError })),
    from: () => {
      const q: any = {
        delete: () => q,
        eq: (k: string, v: unknown) => { state.filters.push([k, v]); return q; },
        select: async () => ({ data: [{ id: "x" }], error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/connectors/server-token-store", () => ({
  clearSessionCookie: vi.fn(),
  getSessionFromRequestCookies: () => null,
}));

import * as consent from "@/app/api/connectors/gmail/consent/route";
import * as imports from "@/app/api/connectors/gmail/imports/route";
import * as account from "@/app/api/account/route";

const req = (method: string, origin?: string) =>
  new Request("https://app.example/api/x", { method, headers: origin ? { origin } : {} });

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
  state.user = { id: "u1" };
  state.rpcError = null;
  state.filters = [];
});

describe.each([
  ["consent POST", () => consent.POST(req("POST", "https://evil.example"))],
  ["consent DELETE", () => consent.DELETE(req("DELETE", "https://evil.example"))],
  ["imports DELETE", () => imports.DELETE(req("DELETE", "https://evil.example"))],
  ["account DELETE", () => account.DELETE(req("DELETE", "https://evil.example"))],
])("%s", (_n, call) => {
  it("rejects a foreign origin with 403", async () => {
    expect((await call()).status).toBe(403);
  });
});

describe("missing origin and signed-out", () => {
  it("rejects a request with no Origin header", async () => {
    expect((await consent.POST(req("POST"))).status).toBe(403);
  });
  it("rejects signed-out callers with 401", async () => {
    state.user = null;
    expect((await consent.POST(req("POST", "https://app.example"))).status).toBe(401);
    expect((await consent.DELETE(req("DELETE", "https://app.example"))).status).toBe(401);
    expect((await imports.DELETE(req("DELETE", "https://app.example"))).status).toBe(401);
    expect((await account.DELETE(req("DELETE", "https://app.example"))).status).toBe(401);
  });
});

describe("failure and scoping", () => {
  it("consent withdraw reports failure as 503, not success", async () => {
    state.rpcError = new Error("db down");
    const res = await consent.DELETE(req("DELETE", "https://app.example"));
    expect(res.status).toBe(503);
    expect((await res.json()).success).toBeUndefined();
  });
  it("import delete is scoped to the signed-in user and gmail rows only", async () => {
    const res = await imports.DELETE(req("DELETE", "https://app.example"));
    expect(res.status).toBe(200);
    expect(state.filters).toEqual([["payer_id", "u1"], ["source_type", "gmail"]]);
  });
  it("account delete requires recent authentication", async () => {
    const res = await account.DELETE(req("DELETE", "https://app.example"));
    expect(res.status).toBe(403);
  });
});
