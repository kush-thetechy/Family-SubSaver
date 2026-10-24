import { beforeEach, describe, expect, it, vi } from "vitest";

const st = {
  user: { id: "u1" } as { id: string } | null,
  gate: { blocked: false, message: null as string | null, entitlement: { state: "trial" as const } },
};

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: st.user }, error: st.user ? null : new Error("no") }),
    },
  }),
}));
vi.mock("@/lib/fee-gate", () => ({
  assessFeeGate: async () => st.gate,
}));

import { GET } from "@/app/api/billing/entitlement/route";

beforeEach(() => {
  st.user = { id: "u1" };
  st.gate = { blocked: false, message: null, entitlement: { state: "trial" } };
  delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
  delete process.env.NEXT_PUBLIC_FEE_GATE_ENABLED;
});

describe("billing entitlement route", () => {
  it("rejects signed-out callers with 401", async () => {
    st.user = null;
    expect((await GET()).status).toBe(401);
  });
  it("reports the signed-in user's own state", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("trial");
    expect(body.newCaptureBlocked).toBe(false);
    expect(body.feeGateEnabled).toBe(false);
  });
  it("surfaces an active block with its message", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    process.env.NEXT_PUBLIC_FEE_GATE_ENABLED = "true";
    st.gate = { blocked: true, message: "fee due", entitlement: { state: "fee_due" as never } };
    const body = await (await GET()).json();
    expect(body.newCaptureBlocked).toBe(true);
    expect(body.message).toBe("fee due");
    expect(body.feeGateEnabled).toBe(true);
  });
});
