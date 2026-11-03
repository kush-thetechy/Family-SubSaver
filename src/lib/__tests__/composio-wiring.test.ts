import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildComposioScanToken,
  clearComposioBulkCacheForUser,
  COMPOSIO_BULK_CACHE_TTL_MS,
  composioGmailRequest,
  parseComposioScanToken,
} from "../connectors/composio-gmail";
import { revokeComposioAccess } from "../connectors/composio-revoke";
import {
  completeComposioConnection,
  resolveComposioScanAccess,
} from "../connectors/composio-scan-access";

const UID = "cac14bf6-b5fa-41f9-ad75-0ebf273348e3";
const ENV = { COMPOSIO_API_KEY: "ck_test", COMPOSIO_GMAIL_AUTH_CONFIG_ID: "ac_1" };

import { fakeSupabase } from "./helpers/fake-supabase";

const GOOD_ACCOUNT = { status: "ACTIVE", user_id: UID, toolkit: { slug: "gmail" }, auth_config: { id: "ac_1" } };

function stubFetch(account: unknown, profile: unknown) {
  const calls: { url: string; body?: string; method?: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as string | undefined, method: init?.method });
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

const LINKED = { connected_account_id: "ca_1", auth_config_id: "ac_1", gmail_email: "a@b.com" };

describe("resolveComposioScanAccess", () => {
  it("fails closed when not configured", async () => {
    const db = fakeSupabase(null);
    expect((await resolveComposioScanAccess({ supabase: db.client, userId: UID, env: {} })).ok).toBe(false);
  });
  it("fails closed when the user has no linked account (a pending attempt is not enough)", async () => {
    stubFetch(GOOD_ACCOUNT, {});
    const db = fakeSupabase({ pending_account_id: "ca_pending" });
    const r = await resolveComposioScanAccess({ supabase: db.client, userId: UID, env: ENV });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });
  it("fails closed when the link has no recorded email", async () => {
    const calls = stubFetch(GOOD_ACCOUNT, {});
    const db = fakeSupabase({ connected_account_id: "ca_1" });
    expect((await resolveComposioScanAccess({ supabase: db.client, userId: UID, env: ENV })).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it("issues a token only when binding validates", async () => {
    stubFetch(GOOD_ACCOUNT, { data: { emailAddress: "a@b.com" } });
    const db = fakeSupabase(LINKED);
    expect(await resolveComposioScanAccess({ supabase: db.client, userId: UID, env: ENV }))
      .toEqual({ ok: true, scanToken: `composio:${UID}:ca_1` });
  });
  it("rejects an account owned by someone else", async () => {
    stubFetch({ ...GOOD_ACCOUNT, user_id: "other" }, { data: { emailAddress: "a@b.com" } });
    const db = fakeSupabase(LINKED);
    expect((await resolveComposioScanAccess({ supabase: db.client, userId: UID, env: ENV })).ok).toBe(false);
  });
  it("rejects when the profile email changed", async () => {
    stubFetch(GOOD_ACCOUNT, { data: { emailAddress: "evil@b.com" } });
    const db = fakeSupabase(LINKED);
    expect((await resolveComposioScanAccess({ supabase: db.client, userId: UID, env: ENV })).ok).toBe(false);
  });
});

describe("completeComposioConnection", () => {
  it("links the pending account and clears the pending attempt", async () => {
    stubFetch(GOOD_ACCOUNT, { data: { emailAddress: "a@b.com" } });
    const db = fakeSupabase({ pending_account_id: "ca_new", pending_state_hash: "h" });
    const r = await completeComposioConnection({ supabase: db.client, userId: UID, env: ENV });
    expect(r).toEqual({ ok: true, email: "a@b.com" });
    expect(db.row).toMatchObject({ connected_account_id: "ca_new", gmail_email: "a@b.com", pending_account_id: null });
  });
  it("an inactive pending account is abandoned and the linked account is untouched", async () => {
    stubFetch({ ...GOOD_ACCOUNT, status: "INITIATED" }, {});
    const db = fakeSupabase({ ...LINKED, pending_account_id: "ca_new" });
    const r = await completeComposioConnection({ supabase: db.client, userId: UID, env: ENV });
    expect(r.ok).toBe(false);
    expect(db.row).toMatchObject({ connected_account_id: "ca_1", gmail_email: "a@b.com", pending_account_id: null });
  });
  it("refuses a different Gmail address and never overwrites the linked account", async () => {
    const calls = stubFetch(GOOD_ACCOUNT, { data: { emailAddress: "other@b.com" } });
    const db = fakeSupabase({ ...LINKED, pending_account_id: "ca_new" });
    const r = await completeComposioConnection({ supabase: db.client, userId: UID, env: ENV });
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("a@b.com");
    expect(db.row).toMatchObject({ connected_account_id: "ca_1", gmail_email: "a@b.com" });
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes("ca_new"))).toBe(true);
  });
  it("fails when no pending account exists", async () => {
    const db = fakeSupabase(LINKED);
    expect((await completeComposioConnection({ supabase: db.client, userId: UID, env: ENV })).ok).toBe(false);
  });
});

describe("revokeComposioAccess", () => {
  it("deletes linked and pending accounts with revoke_on_delete, then the record", async () => {
    const calls = stubFetch({}, {});
    const db = fakeSupabase({ ...LINKED, pending_account_id: "ca_p" });
    const r = await revokeComposioAccess({ supabase: db.client, userId: UID, env: ENV });
    expect(r).toEqual({ ok: true, hadAccount: true });
    const dels = calls.filter((c) => c.method === "DELETE");
    expect(dels).toHaveLength(2);
    expect(dels.every((d) => d.url.includes("revoke_on_delete=true"))).toBe(true);
    expect(db.row).toBeNull();
  });
  it("keeps the record and reports failure when Composio refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const db = fakeSupabase(LINKED);
    const r = await revokeComposioAccess({ supabase: db.client, userId: UID, env: ENV });
    expect(r.ok).toBe(false);
    expect(db.row).not.toBeNull();
  });
  it("treats an already-deleted account (404) as revoked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    const db = fakeSupabase(LINKED);
    expect((await revokeComposioAccess({ supabase: db.client, userId: UID, env: ENV })).ok).toBe(true);
  });
  it("is a no-op for users without a Composio account", async () => {
    const db = fakeSupabase(null);
    expect(await revokeComposioAccess({ supabase: db.client, userId: UID, env: {} })).toEqual({ ok: true, hadAccount: false });
  });
  it("fails closed when an account exists but no API key is configured", async () => {
    const db = fakeSupabase(LINKED);
    expect((await revokeComposioAccess({ supabase: db.client, userId: UID, env: {} })).ok).toBe(false);
  });
});

describe("bulk cache lifetime", () => {
  it("clearComposioBulkCacheForUser drops that user's entries and expired entries are not served", async () => {
    process.env.COMPOSIO_API_KEY = "ck_test";
    process.env.COMPOSIO_BULK_FETCH = "1";
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      const args = JSON.parse(init!.body as string).arguments;
      const data = args.ids_only ? { messages: [{ message_id: "m1" }] }
        : args.message_id ? { subject: "fresh", message_text: "from fetch" }
        : { messages: [{ message_id: "m1", subject: "s", sender: "a", message_text: "cached", date: "2026-11-01T00:00:00Z" }] };
      return new Response(JSON.stringify({ data, successful: true }), { status: 200 });
    }));
    const tok = "composio:ucache:ca_c";
    const list = "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=x";
    const get = "https://gmail.googleapis.com/gmail/v1/users/me/messages/m1";
    await composioGmailRequest(list, tok);
    clearComposioBulkCacheForUser("ucache");
    const a = await composioGmailRequest<{ payload: { body: { data: string } } }>(get, tok);
    expect(Buffer.from(a.payload.body.data, "base64url").toString()).toBe("from fetch");
    await composioGmailRequest(list, tok);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + COMPOSIO_BULK_CACHE_TTL_MS + 1000);
    const b = await composioGmailRequest<{ payload: { body: { data: string } } }>(get, tok);
    vi.useRealTimers();
    expect(Buffer.from(b.payload.body.data, "base64url").toString()).toBe("from fetch");
    delete process.env.COMPOSIO_BULK_FETCH;
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
