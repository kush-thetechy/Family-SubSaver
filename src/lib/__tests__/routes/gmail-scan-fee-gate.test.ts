import { beforeEach, describe, expect, it, vi } from "vitest";

const st = { blocked: true };

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  }),
}));
vi.mock("@/lib/connectors/gmail-policy", () => ({
  hasCurrentGmailConsent: async () => true,
  isGmailEnabledForUser: () => true,
}));
vi.mock("@/lib/connectors/server-token-store", () => ({
  clearSessionCookie: vi.fn(),
  setSessionCookie: vi.fn(),
  isSessionEncryptionConfigured: () => true,
  getSessionFromRequestCookies: () => ({
    sessionId: "s1",
    userId: "u1",
    googleAccessToken: "tok",
    tokenExpiry: Date.now() + 3_600_000,
  }),
}));
vi.mock("@/lib/fee-gate", () => ({
  assessFeeGate: async () =>
    st.blocked
      ? { blocked: true, message: "fee due", entitlement: { state: "fee_due" } }
      : { blocked: false, message: null, entitlement: { state: "trial" } },
}));

import { POST } from "@/app/api/connectors/gmail/scan/route";

const call = () =>
  POST(
    new Request("https://app.example/api/connectors/gmail/scan", {
      method: "POST",
      headers: { origin: "https://app.example", "content-type": "application/json" },
      body: JSON.stringify({ mode: "live", batch: true }),
    })
  );

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
  st.blocked = true;
});

describe("gmail scan soft fee gate", () => {
  it("rejects a new live scan with 402 when the gate blocks capture", async () => {
    const res = await call();
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("fee_due");
    expect(body.error).toBe("fee due");
  });
  it("lets the sample preview through even when gated", async () => {
    const res = await POST(
      new Request("https://app.example/api/connectors/gmail/scan", {
        method: "POST",
        headers: { origin: "https://app.example", "content-type": "application/json" },
        body: JSON.stringify({ mode: "sandbox" }),
      })
    );
    expect(res.status).toBe(200);
  });
});
