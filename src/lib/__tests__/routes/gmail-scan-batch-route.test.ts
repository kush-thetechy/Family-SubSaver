import { beforeEach, describe, expect, it, vi } from "vitest";

const st = {
  consent: true,
  enabled: true,
  quotaCalls: 0,
  coverageCalls: 0,
  done: false,
};

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    rpc: async (name: string) => {
      if (name === "consume_gmail_scan_quota") {
        st.quotaCalls += 1;
        return { data: [{ allowed: true, scans_remaining: 4, resets_at: "x" }], error: null };
      }
      st.coverageCalls += 1;
      return { data: "cov-1", error: null };
    },
  }),
}));
vi.mock("@/lib/connectors/gmail-policy", () => ({
  GMAIL_CONSENT_VERSION: "gmail-discovery-v3-batched",
  hasCurrentGmailConsent: async () => st.consent,
  isGmailEnabledForUser: () => st.enabled,
}));
vi.mock("@/lib/connectors/server-token-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/connectors/server-token-store")>("@/lib/connectors/server-token-store");
  return {
    ...actual,
    clearSessionCookie: vi.fn(),
    setSessionCookie: vi.fn(),
    isSessionEncryptionConfigured: () => true,
    getSessionKeyForTests: undefined,
    getSessionEncryptionKey: () => Buffer.alloc(32, 7),
    getSessionFromRequestCookies: () => ({
      sessionId: "s1",
      userId: "u1",
      googleAccessToken: "tok",
      tokenExpiry: Date.now() + 3_600_000,
    }),
  };
});
vi.mock("@/lib/connectors/gmail-batch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/connectors/gmail-batch")>("@/lib/connectors/gmail-batch");
  return {
    ...actual,
    runGmailBatch: async (_t: string, state: any) => ({
      state: { ...state, attempted: 40, selected: 40, fetched: 40 },
      evidence: [
        { id: "raw-id", message_id: "RAWMSGID123", source: "gmail", evidence_type: "receipt", date: "2026-01-01", sender: "a@b.com", subject: "secret subject", summary: "s" },
      ],
      done: st.done,
      truncated: false,
    }),
  };
});

import { POST } from "@/app/api/connectors/gmail/scan/route";

const call = (body: unknown) =>
  POST(
    new Request("https://app.example/api/connectors/gmail/scan", {
      method: "POST",
      headers: { origin: "https://app.example", "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
  st.consent = true;
  st.enabled = true;
  st.quotaCalls = 0;
  st.coverageCalls = 0;
  st.done = false;
});

describe("batched gmail scan route", () => {
  it("consumes quota only on the first batch and returns sanitized evidence", async () => {
    const r1 = await call({ mode: "live", batch: true, historyRange: "13m" });
    const j1 = await r1.json();
    expect(r1.status).toBe(200);
    expect(j1.done).toBe(false);
    expect(st.quotaCalls).toBe(1);
    const text = JSON.stringify(j1);
    expect(text).not.toContain("RAWMSGID123");
    expect(text).not.toContain("a@b.com");
    expect(text).not.toContain("secret subject");
    expect(typeof j1.cursor).toBe("string");
    expect(j1.cursor).not.toContain("RAWMSGID123");

    st.done = true;
    const r2 = await call({ mode: "live", batch: true, historyRange: "13m", cursor: j1.cursor });
    expect(r2.status).toBe(200);
    expect(st.quotaCalls).toBe(1);
    expect(st.coverageCalls).toBe(1);
  });

  it("stops at the next batch when consent is withdrawn or the gate closes", async () => {
    const j1 = await (await call({ mode: "live", batch: true, historyRange: "13m" })).json();
    st.consent = false;
    expect((await call({ mode: "live", batch: true, historyRange: "13m", cursor: j1.cursor })).status).toBe(403);
    st.consent = true;
    st.enabled = false;
    expect((await call({ mode: "live", batch: true, historyRange: "13m", cursor: j1.cursor })).status).toBe(403);
  });

  it("rejects invalid, tampered or wrong-range cursors with 400", async () => {
    const j1 = await (await call({ mode: "live", batch: true, historyRange: "13m" })).json();
    expect((await call({ mode: "live", batch: true, historyRange: "13m", cursor: "garbage" })).status).toBe(400);
    expect((await call({ mode: "live", batch: true, historyRange: "30d", cursor: j1.cursor })).status).toBe(400);
    expect((await call({ mode: "live", batch: true, historyRange: "13m", cursor: j1.cursor.slice(0, -4) + "AAAA" })).status).toBe(400);
    expect(st.quotaCalls).toBe(1);
  });
});
