import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashComposioState } from "@/lib/connectors/composio-account-store";
import { fakeSupabase } from "../helpers/fake-supabase";

const st: { cookie: string; db: ReturnType<typeof fakeSupabase> } = {
  cookie: "",
  db: fakeSupabase(null),
};
const setSession = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({ get: (n: string) => (n === "fss_composio_state" && st.cookie ? { value: st.cookie } : undefined) }),
}));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  }),
}));
vi.mock("@/lib/supabase-admin", () => ({ createSupabaseAdminClient: () => st.db.client }));
vi.mock("@/lib/connectors/gmail-policy", () => ({
  hasCurrentGmailConsent: async () => true,
  isGmailEnabledForUser: () => true,
}));
vi.mock("@/lib/connectors/server-token-store", () => ({
  isSessionEncryptionConfigured: () => true,
  createServerSession: (d: object) => ({ ...d, sessionId: "s", connectedAt: "now" }),
  setSessionCookie: (...a: unknown[]) => setSession(...a),
}));

import { GET } from "@/app/api/connectors/gmail/composio-callback/route";

const STATE = "s".repeat(64);
const call = (qs: string) => GET(new Request(`https://app.example/api/connectors/gmail/composio-callback${qs}`));
const loc = (r: Response) => r.headers.get("location") ?? "";

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
  process.env.GMAIL_PROVIDER = "composio";
  process.env.COMPOSIO_API_KEY = "ck";
  process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = "ac_1";
  st.cookie = STATE;
  setSession.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    new Response(JSON.stringify(
      String(url).includes("/connected_accounts/")
        ? { status: "ACTIVE", user_id: "u1", toolkit: { slug: "gmail" }, auth_config: { id: "ac_1" } }
        : { data: { emailAddress: "a@b.com" }, successful: true }
    ), { status: 200 })));
});

const pending = (over: Record<string, unknown> = {}) => ({
  pending_account_id: "ca_new",
  pending_state_hash: hashComposioState(STATE),
  pending_expires_at: new Date(Date.now() + 600_000).toISOString(),
  ...over,
});

describe("composio callback", () => {
  it("completes with matching state cookie + stored hash and sets the session", async () => {
    st.db = fakeSupabase(pending());
    const r = await call(`?state=${STATE}`);
    expect(loc(r)).toContain("status=connected");
    expect(setSession).toHaveBeenCalled();
    expect(st.db.row).toMatchObject({ connected_account_id: "ca_new", gmail_email: "a@b.com" });
  });
  it("rejects a missing or mismatched state param without touching stored state", async () => {
    st.db = fakeSupabase(pending());
    expect(loc(await call(""))).toContain("error=");
    expect(loc(await call("?state=wrong"))).toContain("error=");
    expect(st.db.row).toMatchObject({ pending_account_id: "ca_new" });
    expect(setSession).not.toHaveBeenCalled();
  });
  it("rejects when the browser cookie is missing (different browser/session)", async () => {
    st.cookie = "";
    st.db = fakeSupabase(pending());
    expect(loc(await call(`?state=${STATE}`))).toContain("error=");
    expect(setSession).not.toHaveBeenCalled();
  });
  it("rejects a state that does not match the stored hash", async () => {
    st.db = fakeSupabase(pending({ pending_state_hash: hashComposioState("other") }));
    expect(loc(await call(`?state=${STATE}`))).toContain("error=");
    expect(setSession).not.toHaveBeenCalled();
  });
  it("an expired attempt clears pending and never overwrites the linked account", async () => {
    st.db = fakeSupabase({
      connected_account_id: "ca_old", gmail_email: "a@b.com",
      ...pending({ pending_expires_at: new Date(Date.now() - 1000).toISOString() }),
    });
    const r = await call(`?state=${STATE}`);
    expect(loc(r)).toContain("expired");
    expect(st.db.row).toMatchObject({ connected_account_id: "ca_old", pending_account_id: null });
    expect(setSession).not.toHaveBeenCalled();
  });
  it("a state replay after success fails (pending was cleared)", async () => {
    st.db = fakeSupabase(pending());
    await call(`?state=${STATE}`);
    setSession.mockClear();
    expect(loc(await call(`?state=${STATE}`))).toContain("error=");
    expect(setSession).not.toHaveBeenCalled();
  });
  it("resume re-validates the linked account and issues a session", async () => {
    st.db = fakeSupabase({ connected_account_id: "ca_old", gmail_email: "a@b.com" });
    expect(loc(await call("?resume=1"))).toContain("status=connected");
    expect(setSession).toHaveBeenCalled();
  });
  it("resume without a linked account fails", async () => {
    st.db = fakeSupabase(pending());
    expect(loc(await call("?resume=1"))).toContain("error=");
    expect(setSession).not.toHaveBeenCalled();
  });
});
