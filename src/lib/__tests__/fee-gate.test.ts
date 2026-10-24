import { beforeEach, describe, expect, it, vi } from "vitest";

const st = {
  payments: [] as unknown[],
  milestones: [] as unknown[],
  paymentsError: null as unknown,
  milestonesError: null as unknown,
};

vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: () => ({
    from: (table: string) => ({
      select: async () =>
        table === "payments"
          ? { data: st.payments, error: st.paymentsError }
          : { data: st.milestones, error: st.milestonesError },
    }),
  }),
}));

import { assessFeeGate } from "@/lib/fee-gate";

const milestone = { kind: "gmail_scan_viewed", first_at: "2026-08-01T00:00:00Z", live_subscriptions_seen: 3 };

beforeEach(() => {
  vi.useRealTimers();
  st.payments = [];
  st.milestones = [];
  st.paymentsError = null;
  st.milestonesError = null;
  delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
  delete process.env.NEXT_PUBLIC_FEE_GATE_ENABLED;
});

describe("assessFeeGate", () => {
  it("never blocks while the gate flag is off, even when the fee is due", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    st.milestones = [milestone];
    const res = await assessFeeGate("u1");
    expect(res.blocked).toBe(false);
    expect(res.message).toBeNull();
  });
  it("blocks new capture when the gate is on and the free period ended unpaid", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    process.env.NEXT_PUBLIC_FEE_GATE_ENABLED = "true";
    st.milestones = [milestone];
    const res = await assessFeeGate("u1");
    expect(res.blocked).toBe(true);
    expect(res.entitlement.state).toBe("fee_due");
    expect(res.message).toContain("Rs 60");
  });
  it("stays open during the trial and after payment", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    process.env.NEXT_PUBLIC_FEE_GATE_ENABLED = "true";
    st.milestones = [{ ...milestone, first_at: new Date().toISOString() }];
    expect((await assessFeeGate("u1")).blocked).toBe(false);
    st.payments = [{ provider_payment_id: "p1", status: "paid", mode: "live", paid_at: "2026-10-02T00:00:00Z" }];
    st.milestones = [milestone];
    expect((await assessFeeGate("u1")).blocked).toBe(false);
  });
  it("ignores test-mode payments", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    process.env.NEXT_PUBLIC_FEE_GATE_ENABLED = "true";
    st.milestones = [milestone];
    st.payments = [{ provider_payment_id: "p1", status: "paid", mode: "test", paid_at: "2026-10-02T00:00:00Z" }];
    expect((await assessFeeGate("u1")).blocked).toBe(true);
  });
  it("fails open when storage reads fail", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    process.env.NEXT_PUBLIC_FEE_GATE_ENABLED = "true";
    st.milestones = [milestone];
    st.paymentsError = new Error("db down");
    const res = await assessFeeGate("u1");
    expect(res.blocked).toBe(false);
  });
});
