import { describe, expect, it, vi, afterEach } from "vitest";
import {
  evaluateComposioConnectedAccount,
  validateComposioGmailBinding,
  ComposioBindingExpectation,
} from "../connectors/composio-binding";

const BASE: ComposioBindingExpectation = {
  connectedAccountId: "ca_exact_123",
  expectedUserId: "cac14bf6-b5fa-41f9-ad75-0ebf273348e3",
  expectedAuthConfigId: "ac_ours_1",
  expectedEmail: "Owner@Example.com",
};

const GOOD_ACCOUNT = {
  id: "ca_exact_123",
  status: "ACTIVE",
  user_id: BASE.expectedUserId,
  toolkit: { slug: "gmail" },
  auth_config: { id: "ac_ours_1" },
};

describe("evaluateComposioConnectedAccount", () => {
  it("accepts an active gmail account owned by the authenticated user with our auth config", () => {
    expect(evaluateComposioConnectedAccount(GOOD_ACCOUNT, BASE)).toEqual({ ok: true });
  });
  it("rejects a non-ACTIVE account", () => {
    const r = evaluateComposioConnectedAccount({ ...GOOD_ACCOUNT, status: "PENDING" }, BASE);
    expect(r.ok).toBe(false);
  });
  it("rejects a missing status (fail closed)", () => {
    const r = evaluateComposioConnectedAccount({ ...GOOD_ACCOUNT, status: undefined }, BASE);
    expect(r.ok).toBe(false);
  });
  it("rejects a non-gmail toolkit", () => {
    const r = evaluateComposioConnectedAccount(
      { ...GOOD_ACCOUNT, toolkit: { slug: "slack" } }, BASE);
    expect(r.ok).toBe(false);
  });
  it("rejects an auth config that is not ours", () => {
    const r = evaluateComposioConnectedAccount(
      { ...GOOD_ACCOUNT, auth_config: { id: "ac_someone_else" } }, BASE);
    expect(r.ok).toBe(false);
  });
  it("fails closed when the account carries no auth config id but one is expected", () => {
    const r = evaluateComposioConnectedAccount(
      { ...GOOD_ACCOUNT, auth_config: undefined, auth_config_id: undefined }, BASE);
    expect(r.ok).toBe(false);
  });
  it("rejects an account owned by a different user id", () => {
    const r = evaluateComposioConnectedAccount(
      { ...GOOD_ACCOUNT, user_id: "another-user-uuid" }, BASE);
    expect(r.ok).toBe(false);
  });
  it("fails closed when the account carries no owner user id", () => {
    const r = evaluateComposioConnectedAccount({ ...GOOD_ACCOUNT, user_id: undefined }, BASE);
    expect(r.ok).toBe(false);
  });
});

describe("validateComposioGmailBinding", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(accountBody: unknown, profileBody: unknown) {
    const calls: { url: string; body?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      if (url.includes("/connected_accounts/")) {
        return new Response(JSON.stringify(accountBody), { status: 200 });
      }
      return new Response(JSON.stringify(profileBody), { status: 200 });
    }));
    return calls;
  }

  it("passes when account checks pass and the profile email matches (case-insensitive)", async () => {
    stubFetch(GOOD_ACCOUNT, { data: { emailAddress: "owner@example.com" } });
    const r = await validateComposioGmailBinding("ck_test", BASE);
    expect(r).toEqual({ ok: true });
  });

  it("looks up the EXACT stored connected account id, not a list pick", async () => {
    const calls = stubFetch(GOOD_ACCOUNT, { data: { emailAddress: "owner@example.com" } });
    await validateComposioGmailBinding("ck_test", BASE);
    expect(calls[0].url).toContain("/connected_accounts/ca_exact_123");
  });

  it("pins the profile execution to the exact connected account id", async () => {
    const calls = stubFetch(GOOD_ACCOUNT, { data: { emailAddress: "owner@example.com" } });
    await validateComposioGmailBinding("ck_test", BASE);
    const execCall = calls.find((c) => c.url.includes("/tools/execute/GMAIL_GET_PROFILE"));
    expect(execCall).toBeDefined();
    const body = JSON.parse(execCall!.body!);
    expect(body.connected_account_id).toBe("ca_exact_123");
    expect(body.user_id).toBe(BASE.expectedUserId);
  });

  it("rejects when the profile email does not match the consented Gmail", async () => {
    stubFetch(GOOD_ACCOUNT, { data: { emailAddress: "someone-else@example.com" } });
    const r = await validateComposioGmailBinding("ck_test", BASE);
    expect(r.ok).toBe(false);
  });

  it("fails closed when the profile returns no email field", async () => {
    stubFetch(GOOD_ACCOUNT, { data: { messagesTotal: 42 } });
    const r = await validateComposioGmailBinding("ck_test", BASE);
    expect(r.ok).toBe(false);
  });

  it("never reaches the profile check when account fields fail", async () => {
    const calls = stubFetch({ ...GOOD_ACCOUNT, status: "PENDING" }, { data: {} });
    const r = await validateComposioGmailBinding("ck_test", BASE);
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.url.includes("/tools/execute/"))).toBe(false);
  });

  it("propagates a failed account lookup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(validateComposioGmailBinding("ck_test", BASE)).rejects.toThrow("404");
  });
});
