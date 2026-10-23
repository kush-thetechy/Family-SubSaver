import { describe, expect, it } from "vitest";
import { computeEntitlement, getBillingConfig, type Milestone } from "../billing";

const m = (first_at: string, seen = 3): Milestone => ({ kind: "gmail_scan_viewed", first_at, live_subscriptions_seen: seen });
const on = { enabled: true, trialDays: 30, amountPaise: 3000 };

describe("billing scaffold", () => {
  it("is disabled by default and never asks for a fee", () => {
    expect(getBillingConfig({}).enabled).toBe(false);
    expect(computeEntitlement([m("2026-01-01T00:00:00Z")], null, getBillingConfig({}), new Date("2027-01-01"))).toEqual({ state: "billing_disabled" });
  });
  it("does not start the clock without a qualifying use that showed subscriptions", () => {
    expect(computeEntitlement([], null, on).state).toBe("not_started");
    expect(computeEntitlement([m("2026-10-01T00:00:00Z", 0)], null, on).state).toBe("not_started");
  });
  it("runs a trial from the first qualifying use, then the fee is Rs 30", () => {
    const first = m("2026-10-01T00:00:00Z");
    const mid = computeEntitlement([first], null, on, new Date("2026-10-20T00:00:00Z"));
    expect(mid).toMatchObject({ state: "trial", daysLeft: 11 });
    const after = computeEntitlement([first], null, on, new Date("2026-11-01T00:00:00Z"));
    expect(after).toMatchObject({ state: "fee_due", amountPaise: 3000 });
  });
  it("uses the earliest milestone and respects paid", () => {
    const list = [m("2026-10-10T00:00:00Z"), m("2026-10-01T00:00:00Z")];
    expect(computeEntitlement(list, null, on, new Date("2026-10-05T00:00:00Z"))).toMatchObject({ state: "trial" });
    expect(computeEntitlement(list, "2026-11-02T00:00:00Z", on, new Date("2026-12-01"))).toMatchObject({ state: "paid" });
  });
  it("reads the trial length from settings", () => {
    expect(getBillingConfig({ NEXT_PUBLIC_BILLING_ENABLED: "true", NEXT_PUBLIC_BILLING_TRIAL_DAYS: "14" })).toMatchObject({ enabled: true, trialDays: 14 });
    expect(getBillingConfig({ NEXT_PUBLIC_BILLING_TRIAL_DAYS: "abc" }).trialDays).toBe(30);
  });
});
