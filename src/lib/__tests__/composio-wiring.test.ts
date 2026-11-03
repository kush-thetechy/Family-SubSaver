import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildComposioScanToken,
  composioGmailRequest,
  parseComposioScanToken,
} from "../connectors/composio-gmail";
import {
  completeComposioConnection,
  resolveComposioScanAccess,
} from "../connectors/composio-scan-access";

const UID = "cac14bf6-b5fa-41f9-ad75-0ebf273348e3";
const ENV = { COMPOSIO_API_KEY: "ck_test", COMPOSIO_GMAIL_AUTH_CONFIG_ID: "ac_1" };

function fakeSupabase(row: Record<string, unknown> | null) {
  const upserts: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      upsert: async (v: Record<string, unknown>) => { upserts.push(v); return { error: null }; },
    }),
  };
  return { client: client as never, upserts };
}

const GOOD_ACCOUNT = { status: "ACTIVE", user_id: UID, toolkit: { slug: "gmail" }, auth_config: { id: "ac_1" } };

function stubFetch(account: unknown, profile: unknown) {
  const calls: { url: string; body?: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined });
    return new Response(JSON.stringify(url.includes("/connected_accounts/") ? account : profile), { status: 200 });
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("scan token", () => {
  it("round-trips and rejects anything else", () => {
    const t = buildComposioScanToken("u1", "ca_1");
    expect(parseComposioScanToken(t)).toEqual({ appUserId: "u1", connectedAccountId: "ca_1" });
    expect(parseComposioScanToken("u1")).toBeNull();
    expect(parseComposioScanToken("composio:u1")).toBeNull();
  });
  it("composioGmailRequest refuses a token without a connected account", async () => {
    process.env.COMPOSIO_API_KEY = "ck_test";
    await expect(
      composioGmailRequest("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=x", "u1")
    ).rejects.toThrow();
  });
  it("pins every execute call to the exact connected account", async () => {
    process.env.COMPOSIO_API_KEY = "ck_test";
    const calls = stubFetch({}, { data: { messages: [] } });
    await composioGmailRequest("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=x", "composio:u1:ca_9");
    expect(JSON.parse(calls[0].body!).connected_account_id).toBe("ca_9");
  });
});

describe("resolveComposioScanAccess", () => {
  it("fails closed when not configured", async () => {
    const { client } = fakeSupabase(null);
    const r = await resolveComposioScanAccess({ supabase: client, userId: UID, env: {} });
    expect(r.ok).toBe(false);
  });
  it("fails closed when the user has no stored account", async () => {
    stubFetch(GOOD_ACCOUNT, {});
    const { client } = fakeSupabase(null);
    const r = await resolveComposioScanAccess({ supabase: client, userId: UID, env: ENV });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });
  it("fails closed when the connection was never completed (no recorded email)", async () => {
    const calls = stubFetch(GOOD_ACCOUNT, {});
    const { client } = fakeSupabase({ connected_account_id: "ca_1", auth_config_id: "ac_1", gmail_email: null });
    const r = await resolveComposioScanAccess({ supabase: client, userId: UID, env: ENV });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it("issues a token only when binding validates", async () => {
    stubFetch(GOOD_ACCOUNT, { data: { emailAddress: "a@b.com" } });
    const { client } = fakeSupabase({ connected_account_id: "ca_1", gmail_email: "a@b.com" });
    const r = await resolveComposioScanAccess({ supabase: client, userId: UID, env: ENV });
    expect(r).toEqual({ ok: true, scanToken: `composio:${UID}:ca_1` });
  });
  it("rejects an account owned by someone else", async () => {
    stubFetch({ ...GOOD_ACCOUNT, user_id: "other" }, { data: { emailAddress: "a@b.com" } });
    const { client } = fakeSupabase({ connected_account_id: "ca_1", gmail_email: "a@b.com" });
    const r = await resolveComposioScanAccess({ supabase: client, userId: UID, env: ENV });
    expect(r.ok).toBe(false);
  });
  it("rejects when the profile email changed", async () => {
    stubFetch(GOOD_ACCOUNT, { data: { emailAddress: "evil@b.com" } });
    const { client } = fakeSupabase({ connected_account_id: "ca_1", gmail_email: "a@b.com" });
    const r = await resolveComposioScanAccess({ supabase: client, userId: UID, env: ENV });
    expect(r.ok).toBe(false);
  });
});

describe("completeComposioConnection", () => {
  it("records the profile email after account checks pass", async () => {
    stubFetch(GOOD_ACCOUNT, { data: { emailAddress: "a@b.com" } });
    const { client, upserts } = fakeSupabase({ connected_account_id: "ca_1" });
    const r = await completeComposioConnection({ supabase: client, userId: UID, env: ENV });
    expect(r).toEqual({ ok: true, email: "a@b.com" });
    expect(upserts[0]).toMatchObject({ user_id: UID, gmail_email: "a@b.com" });
  });
  it("does not record anything when the account is not active", async () => {
    stubFetch({ ...GOOD_ACCOUNT, status: "INITIATED" }, { data: { emailAddress: "a@b.com" } });
    const { client, upserts } = fakeSupabase({ connected_account_id: "ca_1" });
    const r = await completeComposioConnection({ supabase: client, userId: UID, env: ENV });
    expect(r.ok).toBe(false);
    expect(upserts).toHaveLength(0);
  });
  it("fails when no pending account exists", async () => {
    const { client } = fakeSupabase(null);
    const r = await completeComposioConnection({ supabase: client, userId: UID, env: ENV });
    expect(r.ok).toBe(false);
  });
});

describe("bulk path caching", () => {
  beforeEach(() => { process.env.COMPOSIO_API_KEY = "ck_test"; process.env.COMPOSIO_BULK_FETCH = "1"; });
  afterEach(() => { delete process.env.COMPOSIO_BULK_FETCH; });
  it("serves per-message gets from the bulk page and surfaces unrecoverable ids", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      n += 1;
      const b = JSON.parse(init!.body as string);
      const args = b.arguments;
      let data: unknown;
      if (b.arguments.message_id === "m2") return new Response("x", { status: 404 });
      if (args.ids_only) data = { messages: [{ message_id: "m1" }, { message_id: "m2" }] };
      else data = { messages: [{ message_id: "m1", subject: "s", sender: "a@b.c", message_text: "hi", date: "2026-11-01T00:00:00Z" }] };
      return new Response(JSON.stringify({ data, successful: true }), { status: 200 });
    }));
    const tok = "composio:ub:ca_b";
    const list = await composioGmailRequest<{ messages: { id: string }[] }>(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=x&maxResults=100", tok);
    expect(list.messages.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
    const callsAfterList = n;
    await composioGmailRequest("https://gmail.googleapis.com/gmail/v1/users/me/messages/m1", tok);
    expect(n).toBe(callsAfterList); // served from cache, no extra tool call
    await expect(
      composioGmailRequest("https://gmail.googleapis.com/gmail/v1/users/me/messages/m2", tok)
    ).rejects.toThrow();
  });
  it("never serves one user's cached message to another user", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      const args = JSON.parse(init!.body as string).arguments;
      const data = args.ids_only ? { messages: [{ message_id: "m1" }] }
        : args.message_id ? { subject: "other", message_text: "from fetch" }
        : { messages: [{ message_id: "m1", subject: "s", sender: "a", message_text: "owner-a", date: "2026-11-01T00:00:00Z" }] };
      return new Response(JSON.stringify({ data, successful: true }), { status: 200 });
    }));
    await composioGmailRequest("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=x", "composio:userA:ca_a");
    const m = await composioGmailRequest<{ payload: { body: { data: string } } }>(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/m1", "composio:userB:ca_b");
    expect(Buffer.from(m.payload.body.data, "base64url").toString()).toBe("from fetch");
  });
});
