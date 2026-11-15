import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "../helpers/fake-supabase";

const st: { db: ReturnType<typeof fakeSupabase>; rpc: ReturnType<typeof vi.fn> } = {
  db: fakeSupabase({ connected_account_id: "ca_1", gmail_email: "a@b.com" }),
  rpc: vi.fn(async () => ({ error: null })),
};

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    rpc: (...a: unknown[]) => st.rpc(...a),
  }),
}));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => st.db.client }));
vi.mock("@/lib/connectors/server-token-store", () => ({
  clearSessionCookie: vi.fn(),
  setSessionCookie: vi.fn(),
  isSessionEncryptionConfigured: () => true,
  getSessionFromRequestCookies: () => null,
}));

import { DELETE as scanDelete } from "@/app/api/connectors/gmail/scan/route";
import { DELETE as consentDelete } from "@/app/api/connectors/gmail/consent/route";

const req = (path: string) =>
  new Request(`https://app.example${path}`, { method: "DELETE", headers: { origin: "https://app.example" } });

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
  process.env.COMPOSIO_API_KEY = "ck";
  st.db = fakeSupabase({ connected_account_id: "ca_1", gmail_email: "a@b.com" });
  st.rpc = vi.fn(async () => ({ error: null }));
});

describe("disconnect and consent withdrawal revoke Composio access", () => {
  it("disconnect deletes the Composio account and the record", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const r = await scanDelete(req("/api/connectors/gmail/scan"));
    expect(r.status).toBe(200);
    expect(st.db.row).toBeNull();
  });
  it("disconnect reports failure (not success) when Composio will not confirm removal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const r = await scanDelete(req("/api/connectors/gmail/scan"));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toContain("still active");
    expect(st.db.row).not.toBeNull();
  });
  it("consent withdrawal still proceeds but discloses a failed Composio revoke", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const r = await consentDelete(req("/api/connectors/gmail/consent"));
    const body = await r.json();
    expect(st.rpc).toHaveBeenCalledWith("withdraw_own_gmail_consent", expect.anything());
    expect(body.composioRevocationFailed).toBe(true);
    expect(body.warning).toContain("could not be confirmed removed");
  });
  it("consent withdrawal revokes cleanly when Composio confirms", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const body = await (await consentDelete(req("/api/connectors/gmail/consent"))).json();
    expect(body).toEqual({ success: true });
    expect(st.db.row).toBeNull();
  });
});
