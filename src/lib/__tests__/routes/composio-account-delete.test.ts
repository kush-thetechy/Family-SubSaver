import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "../helpers/fake-supabase";

const st: { db: ReturnType<typeof fakeSupabase>; rpc: ReturnType<typeof vi.fn> } = {
  db: fakeSupabase({ connected_account_id: "ca_1", gmail_email: "a@b.com" }),
  rpc: vi.fn(async () => ({ error: null })),
};
const jwt = () => {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "none" })}.${b({ amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] })}.x`;
};

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
      getSession: async () => ({ data: { session: { access_token: jwt() } } }),
    },
    rpc: (...a: unknown[]) => st.rpc(...a),
  }),
}));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => st.db.client }));
vi.mock("@/lib/connectors/server-token-store", () => ({
  clearSessionCookie: vi.fn(),
  getSessionFromRequestCookies: () => null,
}));

import { DELETE } from "@/app/api/account/route";

const req = () =>
  new Request("https://app.example/api/account", { method: "DELETE", headers: { origin: "https://app.example" } });

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
  delete process.env.COMPOSIO_API_KEY;
  delete process.env.GMAIL_PROVIDER;
  st.db = fakeSupabase({ connected_account_id: "ca_1", gmail_email: "a@b.com" });
  st.rpc = vi.fn(async () => ({ error: null }));
});

describe("account deletion and Composio revoke", () => {
  it("failed revoke aborts: nothing deleted, link record kept, 503 with truthful message", async () => {
    process.env.COMPOSIO_API_KEY = "ck";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const r = await DELETE(req());
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("was not deleted");
    expect(st.rpc).not.toHaveBeenCalled();
    expect(st.db.row).not.toBeNull();
  });
  it("network error on revoke also aborts", async () => {
    process.env.COMPOSIO_API_KEY = "ck";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    const r = await DELETE(req());
    expect(r.status).toBe(503);
    expect(st.rpc).not.toHaveBeenCalled();
  });
  it("confirmed revoke permits the existing deletion path", async () => {
    process.env.COMPOSIO_API_KEY = "ck";
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await DELETE(req());
    expect(r.status).toBe(200);
    expect((await r.json()).success).toBe(true);
    expect(st.rpc).toHaveBeenCalledWith("delete_own_account");
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain("revoke_on_delete=true");
  });
  it("provider regression: flag and key unset never calls Composio and deletes as before", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await DELETE(req());
    expect(r.status).toBe(200);
    expect(f).not.toHaveBeenCalled();
    expect(st.rpc).toHaveBeenCalledWith("delete_own_account");
  });
});
