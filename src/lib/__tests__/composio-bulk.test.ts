import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchComposioBulkPage, ComposioExecutor } from "../connectors/composio-bulk";
import { createComposioConnectLink } from "../connectors/composio-connect";

const msg = (id: string, text = "hello") => ({ message_id: id, subject: "s", sender: "a@b.c", message_text: text, date: "2026-11-01T00:00:00Z" });

function exec(ids: string[], hydratedIds: string[], single: Record<string, unknown> = {}) {
  const calls: { slug: string; args: Record<string, unknown> }[] = [];
  const fn: ComposioExecutor = async (slug, args) => {
    calls.push({ slug, args });
    if (slug === "GMAIL_FETCH_EMAILS" && args.ids_only) return { messages: ids.map((id) => ({ message_id: id })), nextPageToken: "tok2" };
    if (slug === "GMAIL_FETCH_EMAILS") return { messages: hydratedIds.map((id) => msg(id)) };
    const id = args.message_id as string;
    if (id in single) return single[id] as Record<string, unknown>;
    throw new Error("404");
  };
  return { fn, calls };
}

describe("fetchComposioBulkPage", () => {
  it("uses 2 calls when nothing is skipped", async () => {
    const { fn } = exec(["a", "b"], ["a", "b"]);
    const r = await fetchComposioBulkPage(fn, { query: "q" });
    expect(r.messages).toHaveLength(2);
    expect(r.stats.toolCalls).toBe(2);
    expect(r.nextPageToken).toBe("tok2");
  });
  it("recovers silently skipped ids with per-message fetch", async () => {
    const { fn, calls } = exec(["a", "b", "c"], ["a"], { b: msg("b"), c: msg("c") });
    const r = await fetchComposioBulkPage(fn, { query: "q" });
    expect(r.messages.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(r.stats.recoveredByFallback).toBe(2);
    expect(calls.filter((c) => c.slug === "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID")).toHaveLength(2);
  });
  it("reports unrecoverable ids instead of hiding them", async () => {
    const { fn } = exec(["a", "b"], ["a"]);
    const r = await fetchComposioBulkPage(fn, { query: "q" });
    expect(r.messages).toHaveLength(1);
    expect(r.stats.unrecoverable).toEqual(["b"]);
  });
  it("treats a null payload as skipped", async () => {
    const f: ComposioExecutor = async (slug, args) => {
      if (args.ids_only) return { messages: [{ message_id: "a" }] };
      if (slug === "GMAIL_FETCH_EMAILS") return { messages: [{ message_id: "a", payload: null }] };
      return msg("a");
    };
    const r = await fetchComposioBulkPage(f, { query: "q" });
    expect(r.stats.recoveredByFallback).toBe(1);
  });
  it("caps page size at 500", async () => {
    const { fn, calls } = exec([], []);
    await fetchComposioBulkPage(fn, { query: "q", pageSize: 9999 });
    expect(calls[0].args.max_results).toBe(500);
  });
});

describe("createComposioConnectLink", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("posts the server-derived user id and returns the account id", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ redirect_url: "https://x/y", connected_account_id: "ca_1" }), { status: 201 });
    }));
    const r = await createComposioConnectLink({ apiKey: "k", authConfigId: "ac_1", appUserId: "uuid-1" });
    expect(body.user_id).toBe("uuid-1");
    expect(r.connectedAccountId).toBe("ca_1");
  });
  it("rejects an empty user id and malformed responses", async () => {
    await expect(createComposioConnectLink({ apiKey: "k", authConfigId: "a", appUserId: "" })).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 201 })));
    await expect(createComposioConnectLink({ apiKey: "k", authConfigId: "a", appUserId: "u" })).rejects.toThrow();
  });
});
